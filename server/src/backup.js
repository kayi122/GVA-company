// Backups: one .zip holding every table as JSON (data.json) — plus the photo files when they live on disk.
// On Vercel the zip is stored (encrypted) in Vercel Blob; photos already live safely in Blob.
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { prisma } from './db.js';
import { BACKUP_DIR, UPLOAD_DIR } from './paths.js';
import { USE_BLOB, saveFile, readFile, deleteFile, listFiles } from './storage.js';

// Tables in dependency order (parents first) — used for export and restore
export const MODELS = ['rolePermission', 'setting', 'user', 'package', 'inventoryItem', 'customer', 'visit', 'appointment', 'notification', 'target', 'auditLog', 'payment', 'installation', 'installPhoto', 'stockMovement'];
const NAME = /^gva-backup-(\d{8}-\d{6})-(auto|manual)(?:-[A-Za-z0-9]+)?\.zip$/;
export const DEFAULTS = { 'backup.enabled': 'true', 'backup.hour': '2', 'backup.keep': '7' };

export async function getSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'backup.' } } });
  const s = { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  return { enabled: s['backup.enabled'] === 'true', hour: Number(s['backup.hour']), keep: Number(s['backup.keep']) };
}

export async function saveSettings({ enabled, hour, keep }) {
  const rows = { 'backup.enabled': String(!!enabled), 'backup.hour': String(hour), 'backup.keep': String(keep) };
  await prisma.$transaction(Object.entries(rows).map(([key, value]) => prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })));
}

export async function listBackups() {
  const files = USE_BLOB
    ? await listFiles('backups')
    : existsSync(BACKUP_DIR)
      ? readdirSync(BACKUP_DIR).map((name) => { const st = statSync(path.join(BACKUP_DIR, name)); return { key: path.join(BACKUP_DIR, name), name, size: st.size, uploadedAt: st.mtime }; })
      : [];
  return files
    .filter((f) => NAME.test(f.name))
    .map((f) => { const [, stamp, kind] = NAME.exec(f.name); return { file: f.name, key: f.key, kind, size: f.size, createdAt: f.uploadedAt, stamp }; })
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
}

async function find(file) {
  if (!NAME.test(String(file))) return null; // never allow arbitrary names/paths
  return (await listBackups()).find((b) => b.file === file) ?? null;
}

export async function readBackup(file) {
  const b = await find(file);
  if (!b) return null;
  return USE_BLOB ? readFile(b.key) : readFileSync(b.key);
}

export async function deleteBackup(file) {
  const b = await find(file);
  if (!b) return false;
  if (USE_BLOB) await deleteFile(b.key);
  else unlinkSync(b.key);
  return true;
}

const pad = (n) => String(n).padStart(2, '0');
const stampOf = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export async function exportData() {
  const data = {};
  for (const m of MODELS) data[m] = await prisma[m].findMany();
  return data;
}

function zipToBuffer(fill) {
  return new Promise((resolve, reject) => {
    const zip = archiver('zip', { zlib: { level: 6 } });
    const chunks = [];
    zip.on('data', (c) => chunks.push(c));
    zip.on('end', () => resolve(Buffer.concat(chunks)));
    zip.on('error', reject);
    fill(zip);
    zip.finalize();
  });
}

let running = null;
export function createBackup(kind = 'manual') {
  if (running) return running; // one at a time per instance
  running = (async () => {
    const now = new Date();
    const data = await exportData();
    const photosDir = path.join(UPLOAD_DIR, 'installations');
    const buf = await zipToBuffer((zip) => {
      zip.append(JSON.stringify(data), { name: 'data.json' });
      zip.append(JSON.stringify({
        app: 'gva-sales-pipeline', format: 2, createdAt: now.toISOString(), kind,
        counts: Object.fromEntries(MODELS.map((m) => [m, data[m].length])),
        photos: USE_BLOB ? 'Stored in Vercel Blob (not inside this file)' : 'Included in uploads/',
      }, null, 2), { name: 'backup.json' });
      if (!USE_BLOB && existsSync(photosDir)) zip.directory(photosDir, 'uploads/installations');
    });
    const file = `gva-backup-${stampOf(now)}-${kind}.zip`;
    if (USE_BLOB) {
      await saveFile(`backups/${file}`, buf);
    } else {
      mkdirSync(BACKUP_DIR, { recursive: true });
      writeFileSync(path.join(BACKUP_DIR, file), buf);
    }
    return (await listBackups()).find((b) => b.stamp === stampOf(now) && b.kind === kind) ?? { file, size: buf.length, kind, createdAt: now };
  })().finally(() => { running = null; });
  return running;
}

/** Keep only the newest N automatic backups (manual ones stay until deleted). */
export async function pruneBackups(keep) {
  const old = (await listBackups()).filter((b) => b.kind === 'auto').slice(keep);
  for (const b of old) await deleteBackup(b.file).catch(() => {});
}

/** Runs today's automatic backup if it is due. `anyHour` = called by a daily cron (Vercel). */
export async function runScheduledBackup({ anyHour = false } = {}) {
  const s = await getSettings();
  const now = new Date();
  if (!s.enabled) return { skipped: 'disabled' };
  if (!anyHour && now.getHours() !== s.hour) return { skipped: 'not the time' };
  const today = stampOf(now).slice(0, 8);
  if ((await listBackups()).some((b) => b.kind === 'auto' && b.stamp.startsWith(today))) return { skipped: 'already done today' };
  const b = await createBackup('auto');
  await pruneBackups(s.keep);
  return { created: b.file };
}

/** Own server only: checks every 10 minutes. On Vercel a daily cron calls /api/cron/backup instead. */
export function startBackupSchedule(onDone) {
  const tick = () => runScheduledBackup().then((r) => r.created && onDone?.(r)).catch((e) => { console.error('Automatic backup failed:', e.message); onDone?.(null, e); });
  setTimeout(tick, 30_000);
  return setInterval(tick, 10 * 60_000);
}

/** Replaces ALL data with the contents of a backup's data.json. */
export async function restoreData(data) {
  await prisma.$transaction(async (tx) => {
    await tx.loginCode.deleteMany();
    for (const m of [...MODELS].reverse()) await tx[m].deleteMany();
    for (const m of MODELS) {
      const rows = data[m] ?? [];
      const insert = m === 'user' ? rows.map((u) => ({ ...u, supervisorId: null })) : rows; // supervisors linked after all users exist
      for (let i = 0; i < insert.length; i += 1000) await tx[m].createMany({ data: insert.slice(i, i + 1000) });
      if (m === 'user') for (const u of rows.filter((x) => x.supervisorId)) await tx.user.update({ where: { id: u.id }, data: { supervisorId: u.supervisorId } });
    }
  }, { timeout: 300_000, maxWait: 30_000 });
  // continue numbering after the restored ids
  for (const table of ['User', 'Package', 'InventoryItem', 'Customer', 'Visit', 'Appointment', 'Notification', 'Target', 'AuditLog', 'Payment', 'Installation', 'InstallPhoto', 'StockMovement']) {
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`);
  }
}
