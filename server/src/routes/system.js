import { Router } from 'express';
import { z } from 'zod';
import { statSync, existsSync, unlinkSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { createBackup, listBackups, backupPath, getSettings, saveSettings, pruneBackups, dirSize } from '../backup.js';
import { BACKUP_DIR, UPLOAD_DIR, databaseFile } from '../paths.js';
import { smtpConfigured, sendTestEmail } from '../mailer.js';

const router = Router();
router.use(requireAuth, requirePerm('backups.manage'));

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const startedAt = new Date();

router.get('/', async (req, res) => {
  const db = databaseFile();
  const [users, customers, payments, installations, photos] = await Promise.all([
    prisma.user.count(), prisma.customer.count(), prisma.payment.count(), prisma.installation.count(), prisma.installPhoto.count(),
  ]);
  res.json({
    version: pkg.version ?? '1.0.0',
    node: process.version,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    startedAt,
    smtpConfigured,
    storage: {
      database: existsSync(db) ? statSync(db).size : 0,
      uploads: dirSize(UPLOAD_DIR),
      backups: dirSize(BACKUP_DIR),
      backupDir: BACKUP_DIR,
    },
    counts: { users, customers, payments, installations, photos },
    backups: listBackups(),
    settings: await getSettings(),
  });
});

router.post('/backups', async (req, res) => {
  const b = await createBackup('manual');
  await audit(req, 'BACKUP_CREATED', `${b.file} (${Math.round(b.size / 1024)} KB)`);
  res.status(201).json({ backup: b });
});

router.get('/backups/:file', async (req, res) => {
  const p = backupPath(req.params.file);
  if (!p) throw new HttpError(404, 'Backup not found.');
  await audit(req, 'BACKUP_DOWNLOADED', req.params.file);
  res.download(p, req.params.file);
});

router.delete('/backups/:file', async (req, res) => {
  const p = backupPath(req.params.file);
  if (!p) throw new HttpError(404, 'Backup not found.');
  unlinkSync(p);
  await audit(req, 'BACKUP_DELETED', req.params.file);
  res.json({ ok: true });
});

router.put('/backup-settings', async (req, res) => {
  const r = z.object({ enabled: z.boolean(), hour: z.number().int().min(0).max(23), keep: z.number().int().min(1).max(90) }).safeParse(req.body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  await saveSettings(r.data);
  pruneBackups(r.data.keep);
  await audit(req, 'BACKUP_SETTINGS', `${r.data.enabled ? `daily at ${r.data.hour}:00` : 'off'}, keep ${r.data.keep}`);
  res.json({ settings: await getSettings() });
});

router.post('/test-email', async (req, res) => {
  const r = await sendTestEmail(req.user);
  res.json({ delivered: r.delivered, to: req.user.email });
});

export default router;
