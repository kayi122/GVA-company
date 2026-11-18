// Backups = one .zip with a consistent copy of the database (SQLite VACUUM INTO) + all uploaded photos.
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { prisma } from './db.js';
import { BACKUP_DIR, UPLOAD_DIR } from './paths.js';

const NAME = /^gva-backup-(\d{8}-\d{6})-(auto|manual)\.zip$/;
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

export function listBackups() {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((f) => NAME.test(f))
    .map((f) => {
      const [, stamp, kind] = NAME.exec(f);
      const st = statSync(path.join(BACKUP_DIR, f));
      return { file: f, kind, size: st.size, createdAt: st.mtime, stamp };
    })
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
}

export function backupPath(file) {
  if (!NAME.test(file)) return null; // never allow arbitrary paths
  const p = path.join(BACKUP_DIR, file);
  return existsSync(p) ? p : null;
}

const pad = (n) => String(n).padStart(2, '0');
const stampOf = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

let running = null;
export function createBackup(kind = 'manual') {
  if (running) return running; // one at a time
  running = (async () => {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = stampOf(new Date());
    const tmpDb = path.join(BACKUP_DIR, `.tmp-${stamp}.db`);
    const file = `gva-backup-${stamp}-${kind}.zip`;
    const zipPath = path.join(BACKUP_DIR, file);
    try {
      // Consistent snapshot even while the app is running
      await prisma.$executeRawUnsafe(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`);
      await new Promise((resolve, reject) => {
        const out = createWriteStream(zipPath);
        const zip = archiver('zip', { zlib: { level: 6 } });
        out.on('close', resolve);
        zip.on('error', reject);
        zip.pipe(out);
        zip.file(tmpDb, { name: 'database.db' });
        if (existsSync(UPLOAD_DIR)) zip.directory(UPLOAD_DIR, 'uploads');
        zip.append(JSON.stringify({ app: 'gva-sales-pipeline', createdAt: new Date().toISOString(), kind }, null, 2), { name: 'backup.json' });
        zip.finalize();
      });
      return listBackups().find((b) => b.file === file);
    } catch (e) {
      try { unlinkSync(zipPath); } catch {}
      throw e;
    } finally {
      try { rmSync(tmpDb, { force: true }); } catch {}
    }
  })().finally(() => { running = null; });
  return running;
}

/** Keep only the newest N automatic backups (manual ones are kept until deleted). */
export function pruneBackups(keep) {
  listBackups().filter((b) => b.kind === 'auto').slice(keep).forEach((b) => {
    try { unlinkSync(path.join(BACKUP_DIR, b.file)); } catch {}
  });
}

/** Checks every 10 minutes; runs the daily automatic backup once, at the chosen hour. */
export function startBackupSchedule(onDone) {
  const tick = async () => {
    try {
      const s = await getSettings();
      const now = new Date();
      if (!s.enabled || now.getHours() !== s.hour) return;
      const today = stampOf(now).slice(0, 8);
      if (listBackups().some((b) => b.kind === 'auto' && b.stamp.startsWith(today))) return;
      const b = await createBackup('auto');
      pruneBackups(s.keep);
      onDone?.(b);
    } catch (e) {
      console.error('Automatic backup failed:', e.message);
      onDone?.(null, e);
    }
  };
  setTimeout(tick, 30_000);
  return setInterval(tick, 10 * 60_000);
}

export function dirSize(dir) {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}
