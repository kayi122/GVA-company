// Scheduled jobs for Vercel (configured in vercel.json). Vercel calls these with
// "Authorization: Bearer <CRON_SECRET>" — any other caller is refused.
import { Router } from 'express';
import { runScheduledBackup } from '../backup.js';
import { runReminders } from '../reminders.js';
import { notify, usersWithPerm } from '../notify.js';

const router = Router();

router.use((req, res, next) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.get('authorization') !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

router.get('/backup', async (req, res) => {
  try {
    res.json(await runScheduledBackup({ anyHour: true }));
  } catch (e) {
    console.error('Automatic backup failed:', e);
    await notify(await usersWithPerm('backups.manage'), { title: 'Automatic backup FAILED', body: e.message, link: '/system' });
    res.status(500).json({ error: e.message });
  }
});

router.get('/reminders', async (req, res) => {
  res.json({ sent: await runReminders() });
});

export default router;
