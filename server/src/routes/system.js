import { Router } from 'express';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { createBackup, listBackups, readBackup, deleteBackup, getSettings, saveSettings, pruneBackups } from '../backup.js';
import { USE_BLOB } from '../storage.js';
import { smtpConfigured, sendTestEmail } from '../mailer.js';

const router = Router();
router.use(requireAuth, requirePerm('backups.manage'));

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const startedAt = new Date();

router.get('/', async (req, res) => {
  const [users, customers, payments, installations, photoAgg, dbSize, backups] = await Promise.all([
    prisma.user.count(), prisma.customer.count(), prisma.payment.count(), prisma.installation.count(),
    prisma.installPhoto.aggregate({ _sum: { size: true }, _count: { _all: true } }),
    prisma.$queryRawUnsafe('SELECT pg_database_size(current_database())::bigint AS size').then((r) => Number(r[0].size)).catch(() => 0),
    listBackups(),
  ]);
  res.json({
    version: pkg.version ?? '1.0.0',
    node: process.version,
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    platform: process.env.VERCEL ? 'vercel' : 'server',
    fileStorage: USE_BLOB ? 'Vercel Blob (encrypted)' : 'Server disk',
    startedAt,
    smtpConfigured,
    storage: {
      database: dbSize,
      uploads: photoAgg._sum.size ?? 0,
      backups: backups.reduce((s, b) => s + b.size, 0),
    },
    counts: { users, customers, payments, installations, photos: photoAgg._count._all },
    backups: backups.map(({ key, ...b }) => b), // never expose storage URLs
    settings: await getSettings(),
  });
});

router.post('/backups', async (req, res) => {
  const b = await createBackup('manual');
  await audit(req, 'BACKUP_CREATED', `${b.file} (${Math.round(b.size / 1024)} KB)`);
  const { key, ...pub } = b;
  res.status(201).json({ backup: pub });
});

router.get('/backups/:file', async (req, res) => {
  const buf = await readBackup(req.params.file);
  if (!buf) throw new HttpError(404, 'Backup not found.');
  await audit(req, 'BACKUP_DOWNLOADED', req.params.file);
  // Blob adds a random suffix to stored names; the downloaded file gets the clean name
  const clean = req.params.file.replace(/^(gva-backup-\d{8}-\d{6}-(?:auto|manual))(?:-[A-Za-z0-9]+)?\.zip$/, '$1.zip');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${clean}"`);
  res.send(buf);
});

router.delete('/backups/:file', async (req, res) => {
  if (!(await deleteBackup(req.params.file))) throw new HttpError(404, 'Backup not found.');
  await audit(req, 'BACKUP_DELETED', req.params.file);
  res.json({ ok: true });
});

router.put('/backup-settings', async (req, res) => {
  const r = z.object({ enabled: z.boolean(), hour: z.number().int().min(0).max(23), keep: z.number().int().min(1).max(90) }).safeParse(req.body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  await saveSettings(r.data);
  await pruneBackups(r.data.keep);
  await audit(req, 'BACKUP_SETTINGS', `${r.data.enabled ? `daily at ${r.data.hour}:00` : 'off'}, keep ${r.data.keep}`);
  res.json({ settings: await getSettings() });
});

router.post('/test-email', async (req, res) => {
  const r = await sendTestEmail(req.user);
  res.json({ delivered: r.delivered, to: req.user.email });
});

export default router;
