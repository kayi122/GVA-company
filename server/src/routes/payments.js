import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { canEditCustomer } from '../scope.js';
import { notify, usersWithPerm, rwf } from '../notify.js';
import { startOf } from '../scope.js';

const router = Router();
router.use(requireAuth);

const METHODS = ['MOMO_MTN', 'AIRTEL_MONEY', 'BANK', 'CASH'];
const STATUSES = ['PENDING_SUPERVISOR', 'PENDING_FINANCE', 'CONFIRMED', 'REJECTED'];

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  return r.data;
}

/** Which payments this user can see. */
function paymentScope(req) {
  const p = req.perms;
  if (p.has('payments.confirm_finance') || p.has('customers.view_all')) return {};
  if (p.has('payments.confirm_supervisor') || p.has('customers.view_team')) return { agent: { supervisorId: req.user.id } };
  if (p.has('payments.record') || p.has('customers.view_own')) return { agentId: req.user.id };
  throw new HttpError(403, 'You do not have permission to see payments.');
}

const include = {
  customer: { select: { id: true, fullName: true, phone: true, district: true, sector: true, stage: true } },
  agent: { select: { id: true, fullName: true, supervisorId: true, supervisor: { select: { fullName: true } } } },
  package: true,
  supervisor: { select: { fullName: true } },
  financeBy: { select: { fullName: true } },
  installation: { select: { id: true, status: true, scheduledAt: true } },
};

/* ---------------- packages ---------------- */
router.get('/packages', async (req, res) => {
  const all = req.perms.has('packages.manage') && req.query.all;
  res.json({ packages: await prisma.package.findMany({ where: all ? {} : { isActive: true }, orderBy: [{ isActive: 'desc' }, { monthlyPrice: 'asc' }] }) });
});

const packageSchema = z.object({
  name: z.string().trim().min(2).max(60),
  speedMbps: z.coerce.number().int().min(1).max(10000),
  monthlyPrice: z.coerce.number().int().min(0).max(10_000_000),
  installFee: z.coerce.number().int().min(0).max(10_000_000).default(0),
  description: z.string().trim().max(200).optional().nullable().transform((v) => v || null),
  isActive: z.boolean().optional(),
});
router.post('/packages', requirePerm('packages.manage'), async (req, res) => {
  const pkg = await prisma.package.create({ data: parse(packageSchema, req.body) });
  await audit(req, 'PACKAGE_CREATED', `${pkg.name} · ${rwf(pkg.monthlyPrice)}/month`);
  res.status(201).json({ package: pkg });
});
router.patch('/packages/:id', requirePerm('packages.manage'), async (req, res) => {
  const pkg = await prisma.package.update({ where: { id: Number(req.params.id) }, data: parse(packageSchema.partial(), req.body) });
  await audit(req, 'PACKAGE_UPDATED', `${pkg.name} · ${rwf(pkg.monthlyPrice)}/month${pkg.isActive ? '' : ' (inactive)'}`);
  res.json({ package: pkg });
});

/* ---------------- record a payment (agent) ---------------- */
const paymentSchema = z.object({
  packageId: z.coerce.number().int(),
  amount: z.coerce.number().int().min(1, 'Enter the amount paid').max(100_000_000),
  method: z.enum(METHODS, { message: 'Choose how the customer paid' }),
  transactionId: z.string().trim().toUpperCase().min(4, 'Enter the transaction ID').max(40).regex(/^[A-Z0-9.\-_/]+$/, 'Transaction ID: letters and numbers only'),
  paidAt: z.coerce.date(),
  note: z.string().trim().max(500).optional().nullable().transform((v) => v || null),
});

router.post('/customers/:id/payments', requirePerm('payments.record'), async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: Number(req.params.id) }, include: { agent: true } });
  if (!c) throw new HttpError(404, 'Customer not found.');
  if (!canEditCustomer(req, c)) throw new HttpError(403, 'Only the agent who owns this customer can record a payment.');
  const data = parse(paymentSchema, req.body);
  if (data.paidAt.getTime() > Date.now() + 10 * 60_000) throw new HttpError(400, 'The payment date cannot be in the future.');
  const open = await prisma.payment.findFirst({ where: { customerId: c.id, status: { not: 'REJECTED' } } });
  if (open) throw new HttpError(409, open.status === 'CONFIRMED' ? 'This customer has already paid.' : 'A payment for this customer is already waiting for confirmation.');
  const pkg = await prisma.package.findFirst({ where: { id: data.packageId, isActive: true } });
  if (!pkg) throw new HttpError(400, 'Choose a package.');
  const dup = await prisma.payment.findUnique({ where: { transactionId: data.transactionId } });
  if (dup) throw new HttpError(409, 'This transaction ID has already been used for another payment.');

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({ data: { ...data, customerId: c.id, agentId: c.agentId } });
    await tx.customer.update({ where: { id: c.id }, data: { stage: 'PAYMENT_PENDING', status: 'HOT' } });
    return p;
  });
  await audit(req, 'PAYMENT_RECORDED', `${c.fullName} · ${rwf(data.amount)} · ${data.transactionId}`);
  await notify([c.agent.supervisorId], {
    title: `Payment to confirm: ${c.fullName}`,
    body: `${rwf(data.amount)} · ${pkg.name} · by ${c.agent.fullName}`,
    link: '/payments',
  });
  res.status(201).json({ payment });
});

/* ---------------- list / summary ---------------- */
router.get('/payments', async (req, res) => {
  const where = { AND: [paymentScope(req)] };
  const { status, q, agentId } = req.query;
  if (status && STATUSES.includes(status)) where.AND.push({ status });
  if (agentId) where.AND.push({ agentId: Number(agentId) });
  if (q) {
    const term = String(q).trim();
    where.AND.push({ OR: [{ transactionId: { contains: term.toUpperCase() } }, { customer: { fullName: { contains: term } } }, { customer: { phone: { contains: term.replace(/\D/g, '') || term } } }] });
  }
  const payments = await prisma.payment.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ payments });
});

router.get('/payments/summary', async (req, res) => {
  const scope = paymentScope(req);
  const month = startOf('month');
  const [byStatus, revenue] = await Promise.all([
    prisma.payment.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { ...scope, status: 'CONFIRMED', paidAt: { gte: month } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  byStatus.forEach((g) => (counts[g.status] = g._count._all));
  res.json({ counts, monthRevenue: revenue._sum.amount ?? 0, monthSales: revenue._count._all });
});

/* ---------------- approvals ---------------- */
async function load(id) {
  const p = await prisma.payment.findUnique({ where: { id: Number(id) }, include: { ...include, customer: true } });
  if (!p) throw new HttpError(404, 'Payment not found.');
  return p;
}

router.post('/payments/:id/supervisor-confirm', requirePerm('payments.confirm_supervisor'), async (req, res) => {
  const p = await load(req.params.id);
  if (p.agent.supervisorId !== req.user.id && !req.perms.has('customers.view_all')) throw new HttpError(403, 'Only the agent’s supervisor can confirm this payment.');
  if (p.status !== 'PENDING_SUPERVISOR') throw new HttpError(409, 'This payment is no longer waiting for the supervisor.');
  await prisma.payment.update({ where: { id: p.id }, data: { status: 'PENDING_FINANCE', supervisorId: req.user.id, supervisorAt: new Date() } });
  await audit(req, 'PAYMENT_SUPERVISOR_CONFIRMED', `${p.customer.fullName} · ${p.transactionId}`);
  await notify(await usersWithPerm('payments.confirm_finance'), {
    title: `Payment to reconfirm: ${p.customer.fullName}`,
    body: `${rwf(p.amount)} · ${p.method.replace('_', ' ')} · ${p.transactionId} · confirmed by ${req.user.fullName}`,
    link: '/payments',
  });
  res.json({ ok: true });
});

router.post('/payments/:id/finance-confirm', requirePerm('payments.confirm_finance'), async (req, res) => {
  const p = await load(req.params.id);
  if (p.status !== 'PENDING_FINANCE') throw new HttpError(409, 'This payment is not waiting for finance.');
  const installation = await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id: p.id }, data: { status: 'CONFIRMED', financeById: req.user.id, financeAt: new Date() } });
    await tx.customer.update({ where: { id: p.customerId }, data: { stage: 'AWAITING_INSTALL' } });
    return tx.installation.create({ data: { customerId: p.customerId, paymentId: p.id } });
  });
  await audit(req, 'PAYMENT_FINANCE_CONFIRMED', `${p.customer.fullName} · ${p.transactionId} · installation #${installation.id} ordered`);
  await notify(await usersWithPerm('installs.assign'), {
    title: `New installation: ${p.customer.fullName}`,
    body: `${p.package.name} · ${[p.customer.sector, p.customer.district].filter(Boolean).join(', ')}`,
    link: `/installations/${installation.id}`,
  });
  await notify([p.agentId], { title: `Payment confirmed: ${p.customer.fullName}`, body: 'Finance confirmed it. Operations will schedule the installation.', link: `/customers/${p.customerId}` });
  res.json({ ok: true, installationId: installation.id });
});

router.post('/payments/:id/reject', requirePerm('payments.confirm_supervisor', 'payments.confirm_finance'), async (req, res) => {
  const p = await load(req.params.id);
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 3) throw new HttpError(400, 'Write the reason so the agent can fix it.');
  const asSupervisor = p.status === 'PENDING_SUPERVISOR' && req.perms.has('payments.confirm_supervisor') && (p.agent.supervisorId === req.user.id || req.perms.has('customers.view_all'));
  const asFinance = p.status === 'PENDING_FINANCE' && req.perms.has('payments.confirm_finance');
  if (!asSupervisor && !asFinance) throw new HttpError(409, 'You cannot reject this payment at its current step.');
  await prisma.$transaction([
    prisma.payment.update({ where: { id: p.id }, data: { status: 'REJECTED', rejectReason: reason.slice(0, 500), rejectedById: req.user.id, rejectedAt: new Date() } }),
    prisma.customer.update({ where: { id: p.customerId }, data: { stage: 'LEAD' } }),
  ]);
  await audit(req, 'PAYMENT_REJECTED', `${p.customer.fullName} · ${p.transactionId}: ${reason}`);
  await notify([p.agentId, asFinance ? p.agent.supervisorId : null], {
    title: `Payment rejected: ${p.customer.fullName}`,
    body: `${req.user.fullName}: ${reason}`,
    link: `/customers/${p.customerId}`,
  });
  res.json({ ok: true });
});

export default router;
