import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { ROLES } from '../permissions.js';
import { requireAuth, requirePerm, publicUser, audit, HttpError } from '../auth.js';

const router = Router();
router.use(requireAuth);

const base = z.object({
  fullName: z.string().trim().min(2, 'Full name is too short').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  role: z.enum(ROLES),
  supervisorId: z.coerce.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
});
const createSchema = base.extend({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,30}$/, 'Username must be 3–30 letters, numbers, dots, dashes or underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
});

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  return r.data;
}

function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 9; i++) s += chars[crypto.randomInt(chars.length)];
  return s + crypto.randomInt(10);
}

async function resolveSupervisor(role, supervisorId) {
  if (role !== 'AGENT' || !supervisorId) return null;
  const sup = await prisma.user.findUnique({ where: { id: supervisorId } });
  if (!sup || sup.role !== 'SUPERVISOR') throw new HttpError(400, 'Choose a valid supervisor.');
  return sup.id;
}

const listInclude = { supervisor: { select: { id: true, fullName: true } }, _count: { select: { agents: true } } };

router.get('/', requirePerm('users.view'), async (req, res) => {
  const { role, q, supervisorId } = req.query;
  const where = {};
  if (role && ROLES.includes(role)) where.role = role;
  if (supervisorId) where.supervisorId = Number(supervisorId);
  if (q) where.OR = ['fullName', 'username', 'email', 'phone'].map((f) => ({ [f]: { contains: String(q) } }));
  const users = await prisma.user.findMany({ where, include: listInclude, orderBy: [{ role: 'asc' }, { fullName: 'asc' }] });
  res.json({ users: users.map(publicUser) });
});

router.get('/stats', requirePerm('users.view'), async (req, res) => {
  const [byRole, active, logins24h] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.auditLog.count({ where: { action: 'LOGIN', createdAt: { gte: new Date(Date.now() - 864e5) } } }),
  ]);
  const roles = Object.fromEntries(ROLES.map((r) => [r, 0]));
  byRole.forEach((g) => (roles[g.role] = g._count._all));
  res.json({ roles, total: Object.values(roles).reduce((a, b) => a + b, 0), active, logins24h });
});

router.get('/teams', requirePerm('users.view'), async (req, res) => {
  const agentSelect = { id: true, fullName: true, username: true, isActive: true, lastLoginAt: true };
  const [supervisors, unassigned] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'SUPERVISOR' },
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, username: true, isActive: true, agents: { select: agentSelect, orderBy: { fullName: 'asc' } } },
    }),
    prisma.user.findMany({ where: { role: 'AGENT', supervisorId: null }, select: agentSelect, orderBy: { fullName: 'asc' } }),
  ]);
  res.json({ supervisors, unassigned });
});

router.post('/', requirePerm('users.manage'), async (req, res) => {
  const data = parse(createSchema, req.body);
  const password = data.password || tempPassword();
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      fullName: data.fullName,
      phone: data.phone || null,
      role: data.role,
      supervisorId: await resolveSupervisor(data.role, data.supervisorId),
      passwordHash: await bcrypt.hash(password, 10),
    },
    include: listInclude,
  });
  await audit(req, 'USER_CREATED', `${user.username} (${user.role})`);
  res.status(201).json({ user: publicUser(user), tempPassword: data.password ? undefined : password });
});

router.patch('/:id', requirePerm('users.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.user.findUnique({ where: { id }, include: { _count: { select: { agents: true } } } });
  if (!existing) throw new HttpError(404, 'User not found.');
  const data = parse(base.partial(), req.body);
  const role = data.role ?? existing.role;

  if (id === req.user.id && (data.isActive === false || role !== existing.role))
    throw new HttpError(400, 'You cannot disable your own account or change your own role.');
  if (existing.role === 'SUPERVISOR' && role !== 'SUPERVISOR' && existing._count.agents > 0)
    throw new HttpError(400, `Move this supervisor's ${existing._count.agents} agents to another team first.`);
  if (existing.role === 'ADMIN' && (role !== 'ADMIN' || data.isActive === false)) {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (admins <= 1) throw new HttpError(400, 'At least one active admin is required.');
  }

  const update = { ...data };
  // disabling or changing the role signs the user out everywhere
  if (data.isActive === false || role !== existing.role) update.sessionVersion = { increment: 1 };
  if ('phone' in data) update.phone = data.phone || null;
  if ('supervisorId' in data || role !== existing.role)
    update.supervisorId = await resolveSupervisor(role, 'supervisorId' in data ? data.supervisorId : existing.supervisorId);

  const user = await prisma.user.update({ where: { id }, data: update, include: listInclude });
  const action =
    data.isActive === false ? 'USER_DISABLED' : data.isActive === true && !existing.isActive ? 'USER_ENABLED' : 'USER_UPDATED';
  await audit(req, action, `${user.username}: ${Object.keys(data).join(', ')}`);
  res.json({ user: publicUser(user) });
});

router.post('/:id/reset-password', requirePerm('users.manage'), async (req, res) => {
  const id = Number(req.params.id);
  const password = tempPassword();
  const user = await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10), sessionVersion: { increment: 1 } } });
  await prisma.loginCode.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
  await audit(req, 'PASSWORD_RESET', user.username);
  res.json({ username: user.username, tempPassword: password });
});

export default router;
