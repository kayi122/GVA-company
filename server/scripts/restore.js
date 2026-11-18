// Restore a backup .zip (database + photos).
// Usage (STOP the server first):  npm run restore -w server -- path/to/gva-backup-YYYYMMDD-HHMMSS-auto.zip
import { existsSync, mkdtempSync, copyFileSync, rmSync, renameSync, mkdirSync, cpSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import extract from 'extract-zip';
import { databaseFile, UPLOAD_DIR, BACKUP_DIR } from '../src/paths.js';

const zipArg = process.argv[2];
if (!zipArg) {
  console.error('Usage: npm run restore -w server -- <backup.zip>');
  process.exit(1);
}
const zipPath = path.resolve(process.env.INIT_CWD || process.cwd(), zipArg);
if (!existsSync(zipPath)) {
  const inBackups = path.join(BACKUP_DIR, path.basename(zipArg));
  if (!existsSync(inBackups)) { console.error(`Backup not found: ${zipPath}`); process.exit(1); }
}
const source = existsSync(zipPath) ? zipPath : path.join(BACKUP_DIR, path.basename(zipArg));

// Refuse to run while the API is up (the database file would be in use)
const port = Number(process.env.API_PORT || 4000);
let serverUp = false;
try {
  await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
  serverUp = true;
} catch { /* not running — good */ }

if (serverUp) {
  console.error(`The server is still running on port ${port}. Stop it first, then run the restore again.`);
  process.exitCode = 1;
} else {
  await restore();
}

async function restore() {
const tmp = mkdtempSync(path.join(os.tmpdir(), 'gva-restore-'));
try {
  await extract(source, { dir: tmp });
  const db = path.join(tmp, 'database.db');
  if (!existsSync(db)) throw new Error('This file is not a GVA backup (database.db missing).');

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const live = databaseFile();
  mkdirSync(BACKUP_DIR, { recursive: true });

  // Safety copy of what is there now
  if (existsSync(live)) {
    const safety = path.join(BACKUP_DIR, `before-restore-${stamp}.db`);
    copyFileSync(live, safety);
    console.log(`Current database saved to ${safety}`);
  }
  for (const ext of ['-wal', '-shm', '-journal']) rmSync(live + ext, { force: true });
  copyFileSync(db, live);
  console.log(`Database restored to ${live}`);

  const uploads = path.join(tmp, 'uploads');
  if (existsSync(uploads)) {
    if (existsSync(UPLOAD_DIR)) renameSync(UPLOAD_DIR, `${UPLOAD_DIR}-before-restore-${stamp}`);
    cpSync(uploads, UPLOAD_DIR, { recursive: true });
    console.log(`Photos restored to ${UPLOAD_DIR}`);
  }
  console.log('\nDone. Start the server again.');
} catch (e) {
  console.error('Restore failed:', e.message);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
}
