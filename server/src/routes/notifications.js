import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../auth.js';
import { maybeRunReminders } from '../reminders.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  await maybeRunReminders(); // on Vercel this is what sends visit reminders (no background jobs there)
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
  ]);
  res.json({ items, unread });
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

router.post('/:id/read', async (req, res) => {
  await prisma.notification.updateMany({ where: { id: Number(req.params.id), userId: req.user.id }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

export default router;
