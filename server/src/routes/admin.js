import { Router } from 'express';
import { prisma } from '../db.js';
import { ROLES, PERMISSIONS, LOCKED } from '../permissions.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/permissions', requirePerm('permissions.manage'), async (req, res) => {
  const rows = await prisma.rolePermission.findMany();
  const matrix = Object.fromEntries(ROLES.map((r) => [r, []]));
  rows.forEach((r) => matrix[r.role]?.push(r.permission));
  res.json({ roles: ROLES, permissions: PERMISSIONS, matrix, locked: LOCKED });
});

router.put('/permissions', requirePerm('permissions.manage'), async (req, res) => {
  const { role, permission, enabled } = req.body ?? {};
  if (!ROLES.includes(role) || !PERMISSIONS.some((p) => p.key === permission)) throw new HttpError(400, 'Unknown role or permission.');
  if (LOCKED[role]?.includes(permission)) throw new HttpError(400, 'This permission is locked for this role.');
  if (enabled) {
    await prisma.rolePermission.upsert({
      where: { role_permission: { role, permission } },
      create: { role, permission },
      update: {},
    });
  } else {
    await prisma.rolePermission.deleteMany({ where: { role, permission } });
  }
  await audit(req, 'PERMISSION_CHANGED', `${role}: ${enabled ? 'granted' : 'removed'} ${permission}`);
  res.json({ ok: true });
});

router.get('/audit', requirePerm('audit.view'), async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const q = req.query.q ? String(req.query.q) : null;
  const logs = await prisma.auditLog.findMany({
    where: q
      ? { OR: [{ action: { contains: q } }, { details: { contains: q } }, { user: { fullName: { contains: q } } }] }
      : {},
    include: { user: { select: { fullName: true, username: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json({ logs });
});

export default router;
