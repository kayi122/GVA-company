import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { requireScope, canEditCustomer, normalisePhone, isValidPhone, startOf } from '../scope.js';

const router = Router();
router.use(requireAuth);

const STATUSES = ['COLD', 'WARM', 'HOT'];
const ISPS = ['MTN', 'AIRTEL', 'LIQUID', 'OTHER', 'NONE'];
const PURPOSES = ['FOLLOW_UP', 'PAYMENT', 'DEMO', 'OTHER'];

const phone = z
  .string()
  .transform(normalisePhone)
  .refine(isValidPhone, 'Enter a valid Rwandan phone number, e.g. 078 123 4567');
const optPhone = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? normalisePhone(v) : null))
  .refine((v) => v === null || isValidPhone(v), 'The second phone number is not valid');
const optText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const coord = z.number().min(-90).max(180).optional().nullable();

const fields = {
  fullName: z.string().trim().min(2, 'Enter the customer name').max(80),
  phone,
  altPhone: optPhone,
  customerType: z.enum(['HOME', 'BUSINESS']).default('HOME'),
  district: z.string().trim().min(2, 'Choose a district').max(40),
  sector: optText(60),
  landmark: optText(120),
  latitude: coord,
  longitude: coord,
  currentIsp: z.enum(ISPS, { message: 'Choose the current internet provider' }),
  currentIspOther: optText(40),
  monthlySpend: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  satisfaction: z.enum(['HAPPY', 'OK', 'UNHAPPY']).optional().nullable(),
  status: z.enum(STATUSES, { message: 'Choose Cold, Warm or Hot' }),
  notes: optText(1000),
};
const createSchema = z.object({
  ...fields,
  nextVisitAt: z.coerce.date().optional().nullable(),
  nextVisitPurpose: z.enum(PURPOSES).optional(),
});
const updateSchema = z.object(fields).partial();
const visitSchema = z.object({
  status: z.enum(STATUSES),
  notes: optText(1000),
  latitude: coord,
  longitude: coord,
  nextVisitAt: z.coerce.date().optional().nullable(),
  nextVisitPurpose: z.enum(PURPOSES).optional(),
});

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  return r.data;
}

function futureOrThrow(date) {
  if (date && date.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, 'The next visit must be in the future.');
}

async function duplicateError(phoneNumber) {
  const existing = await prisma.customer.findUnique({ where: { phone: phoneNumber }, include: { agent: { select: { fullName: true } } } });
  if (existing) throw new HttpError(409, `This phone number is already registered (customer of ${existing.agent.fullName}).`);
}

const agentSel = { select: { id: true, fullName: true, supervisorId: true } };

// ---------- list ----------
router.get('/', async (req, res) => {
  const scope = requireScope(req);
  const { q, status, agentId, isp, period } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Number(req.query.size) || 25);

  const where = { AND: [scope] };
  if (q) {
    const term = String(q).trim();
    const digits = term.replace(/\D/g, '');
    where.AND.push({
      OR: [
        { fullName: { contains: term } },
        { sector: { contains: term } },
        { district: { contains: term } },
        ...(digits.length >= 3 ? [{ phone: { contains: digits.replace(/^250/, '0') } }] : []),
      ],
    });
  }
  if (agentId) where.AND.push({ agentId: Number(agentId) });
  if (isp && ISPS.includes(isp)) where.AND.push({ currentIsp: isp });
  if (['today', 'week', 'month'].includes(period)) where.AND.push({ createdAt: { gte: startOf(period) } });

  const listWhere = status && STATUSES.includes(status) ? { AND: [...where.AND, { status }] } : where;
  const [customers, total, grouped] = await Promise.all([
    prisma.customer.findMany({
      where: listWhere,
      include: {
        agent: agentSel,
        appointments: { where: { status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' }, take: 1, select: { scheduledAt: true } },
      },
      orderBy: [{ lastVisitAt: 'desc' }],
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.customer.count({ where: listWhere }),
    prisma.customer.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  const counts = { COLD: 0, WARM: 0, HOT: 0 };
  grouped.forEach((g) => (counts[g.status] = g._count._all));
  res.json({
    customers: customers.map(({ appointments, ...c }) => ({ ...c, nextVisitAt: appointments[0]?.scheduledAt ?? null })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / size)),
    counts,
  });
});

// ---------- dashboard numbers ----------
router.get('/summary', async (req, res) => {
  const scope = requireScope(req);
  const visitScope = scope.agentId ? { agentId: scope.agentId } : scope.agent ? { agent: scope.agent } : {};
  const today = startOf('today');
  const [byStatus, newToday, newWeek, newMonth, visitsToday, upcoming, perAgent, ispSplit] = await Promise.all([
    prisma.customer.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    prisma.customer.count({ where: { ...scope, createdAt: { gte: today } } }),
    prisma.customer.count({ where: { ...scope, createdAt: { gte: startOf('week') } } }),
    prisma.customer.count({ where: { ...scope, createdAt: { gte: startOf('month') } } }),
    prisma.visit.count({ where: { ...visitScope, createdAt: { gte: today } } }),
    prisma.appointment.findMany({
      where: { ...visitScope, status: 'SCHEDULED', scheduledAt: { gte: new Date(Date.now() - 12 * 3600_000) } },
      include: { customer: { select: { id: true, fullName: true, phone: true, status: true, sector: true, district: true } }, agent: { select: { fullName: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 6,
    }),
    scope.agentId
      ? []
      : prisma.customer.groupBy({ by: ['agentId', 'status'], where: scope, _count: { _all: true } }),
    prisma.customer.groupBy({ by: ['currentIsp'], where: scope, _count: { _all: true } }),
  ]);
  const status = { COLD: 0, WARM: 0, HOT: 0 };
  byStatus.forEach((g) => (status[g.status] = g._count._all));

  let agents = [];
  if (!scope.agentId) {
    const agentWhere = scope.agent ? { role: 'AGENT', supervisorId: req.user.id } : { role: 'AGENT' };
    const [list, weekly] = await Promise.all([
      prisma.user.findMany({ where: agentWhere, select: { id: true, fullName: true, isActive: true, lastLoginAt: true }, orderBy: { fullName: 'asc' } }),
      prisma.customer.groupBy({ by: ['agentId'], where: { ...scope, createdAt: { gte: startOf('week') } }, _count: { _all: true } }),
    ]);
    agents = list.map((a) => {
      const s = { COLD: 0, WARM: 0, HOT: 0 };
      perAgent.filter((g) => g.agentId === a.id).forEach((g) => (s[g.status] = g._count._all));
      return { ...a, ...s, total: s.COLD + s.WARM + s.HOT, thisWeek: weekly.find((w) => w.agentId === a.id)?._count._all ?? 0 };
    });
  }
  res.json({
    status,
    total: status.COLD + status.WARM + status.HOT,
    newToday,
    newWeek,
    newMonth,
    visitsToday,
    upcoming,
    agents,
    isp: Object.fromEntries(ispSplit.map((g) => [g.currentIsp, g._count._all])),
  });
});

// ---------- duplicate check while typing ----------
router.get('/check-phone', requirePerm('customers.create'), async (req, res) => {
  const p = normalisePhone(req.query.phone);
  if (!isValidPhone(p)) return res.json({ valid: false, exists: false });
  const c = await prisma.customer.findUnique({ where: { phone: p }, include: { agent: { select: { fullName: true } } } });
  if (!c) return res.json({ valid: true, exists: false });
  const mine = c.agentId === req.user.id;
  res.json({ valid: true, exists: true, mine, customerId: mine ? c.id : undefined, agentName: c.agent.fullName });
});

// ---------- one customer ----------
router.get('/:id', async (req, res) => {
  const scope = requireScope(req);
  const c = await prisma.customer.findFirst({
    where: { AND: [scope, { id: Number(req.params.id) }] },
    include: {
      agent: { select: { id: true, fullName: true, phone: true, supervisor: { select: { fullName: true } } } },
      visits: { orderBy: { createdAt: 'desc' }, include: { agent: { select: { fullName: true } } } },
      appointments: { orderBy: { scheduledAt: 'desc' } },
      payments: { orderBy: { createdAt: 'desc' }, include: { package: true, supervisor: { select: { fullName: true } }, financeBy: { select: { fullName: true } } } },
      installations: { orderBy: { createdAt: 'desc' }, include: { technician: { select: { fullName: true, phone: true } }, photos: { select: { id: true } } } },
    },
  });
  if (!c) throw new HttpError(404, 'Customer not found.');
  res.json({ customer: c, canEdit: canEditCustomer(req, c) });
});

router.post('/', requirePerm('customers.create'), async (req, res) => {
  const { nextVisitAt, nextVisitPurpose, ...data } = parse(createSchema, req.body);
  futureOrThrow(nextVisitAt);
  await duplicateError(data.phone);
  if (data.currentIsp !== 'OTHER') data.currentIspOther = null;

  const customer = await prisma.$transaction(async (tx) => {
    const c = await tx.customer.create({ data: { ...data, agentId: req.user.id } });
    await tx.visit.create({
      data: { customerId: c.id, agentId: req.user.id, status: c.status, notes: data.notes ? `First contact. ${data.notes}` : 'First contact.', latitude: data.latitude, longitude: data.longitude },
    });
    if (nextVisitAt)
      await tx.appointment.create({ data: { customerId: c.id, agentId: req.user.id, scheduledAt: nextVisitAt, purpose: nextVisitPurpose ?? 'FOLLOW_UP' } });
    return c;
  });
  await audit(req, 'CUSTOMER_CREATED', `${customer.fullName} (${customer.status})`);
  res.status(201).json({ customer });
});

async function loadEditable(req) {
  const c = await prisma.customer.findUnique({ where: { id: Number(req.params.id) } });
  if (!c) throw new HttpError(404, 'Customer not found.');
  if (!canEditCustomer(req, c)) throw new HttpError(403, 'Only the agent who owns this customer can change it.');
  return c;
}

router.patch('/:id', async (req, res) => {
  const existing = await loadEditable(req);
  const data = parse(updateSchema, req.body);
  if (data.phone && data.phone !== existing.phone) await duplicateError(data.phone);
  if (data.currentIsp && data.currentIsp !== 'OTHER') data.currentIspOther = null;
  const customer = await prisma.customer.update({ where: { id: existing.id }, data });
  await audit(req, 'CUSTOMER_UPDATED', `${customer.fullName}: ${Object.keys(data).join(', ')}`);
  res.json({ customer });
});

// Log a return visit: updates the status, closes today's scheduled visit, optionally books the next one.
router.post('/:id/visits', async (req, res) => {
  const c = await loadEditable(req);
  const { nextVisitAt, nextVisitPurpose, ...v } = parse(visitSchema, req.body);
  futureOrThrow(nextVisitAt);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.visit.create({ data: { ...v, customerId: c.id, agentId: req.user.id } });
    await tx.customer.update({ where: { id: c.id }, data: { status: v.status, lastVisitAt: now } });
    await tx.appointment.updateMany({
      where: { customerId: c.id, status: 'SCHEDULED', scheduledAt: { lte: new Date(now.getTime() + 12 * 3600_000) } },
      data: { status: 'DONE', completedAt: now },
    });
    if (nextVisitAt)
      await tx.appointment.create({ data: { customerId: c.id, agentId: c.agentId, scheduledAt: nextVisitAt, purpose: nextVisitPurpose ?? 'FOLLOW_UP' } });
  });
  await audit(req, 'VISIT_LOGGED', `${c.fullName}: ${c.status} → ${v.status}`);
  res.status(201).json({ ok: true });
});

export default router;
