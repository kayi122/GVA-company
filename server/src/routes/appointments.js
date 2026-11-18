import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, HttpError } from '../auth.js';
import { requireScope, canEditCustomer } from '../scope.js';

const router = Router();
router.use(requireAuth);

const PURPOSES = ['FOLLOW_UP', 'PAYMENT', 'DEMO', 'OTHER'];

function apptScope(req) {
  const s = requireScope(req);
  return s.agentId ? { agentId: s.agentId } : s.agent ? { agent: s.agent } : {};
}

router.get('/', async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 31 * 864e5);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 62 * 864e5);
  if (isNaN(from) || isNaN(to)) throw new HttpError(400, 'Invalid date range.');
  const where = { ...apptScope(req), scheduledAt: { gte: from, lt: to } };
  if (req.query.agentId) where.agentId = Number(req.query.agentId);
  const appointments = await prisma.appointment.findMany({
    where,
    include: {
      customer: { select: { id: true, fullName: true, phone: true, status: true, district: true, sector: true, landmark: true } },
      agent: { select: { id: true, fullName: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });
  res.json({ appointments });
});

router.post('/', async (req, res) => {
  const r = z
    .object({
      customerId: z.coerce.number().int(),
      scheduledAt: z.coerce.date(),
      purpose: z.enum(PURPOSES).default('FOLLOW_UP'),
      notes: z.string().trim().max(500).optional().nullable(),
    })
    .safeParse(req.body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  const { customerId, scheduledAt, purpose, notes } = r.data;
  if (scheduledAt.getTime() < Date.now() - 5 * 60_000) throw new HttpError(400, 'Pick a time in the future.');
  const c = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!c) throw new HttpError(404, 'Customer not found.');
  if (!canEditCustomer(req, c)) throw new HttpError(403, 'Only the agent who owns this customer can book visits.');
  const appointment = await prisma.appointment.create({
    data: { customerId, agentId: c.agentId, scheduledAt, purpose, notes: notes || null },
  });
  res.status(201).json({ appointment });
});

router.patch('/:id', async (req, res) => {
  const a = await prisma.appointment.findUnique({ where: { id: Number(req.params.id) }, include: { customer: true } });
  if (!a) throw new HttpError(404, 'Appointment not found.');
  if (!canEditCustomer(req, a.customer)) throw new HttpError(403, 'Only the agent who owns this customer can change this visit.');
  const r = z
    .object({
      status: z.enum(['SCHEDULED', 'DONE', 'MISSED', 'CANCELLED']).optional(),
      scheduledAt: z.coerce.date().optional(),
      notes: z.string().trim().max(500).optional().nullable(),
    })
    .safeParse(req.body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  const data = { ...r.data };
  if (data.scheduledAt) {
    data.remindedAt = null; // remind again for the new time
    data.status = data.status ?? 'SCHEDULED';
  }
  if (data.status === 'DONE') data.completedAt = new Date();
  const appointment = await prisma.appointment.update({ where: { id: a.id }, data });
  res.json({ appointment });
});

export default router;
