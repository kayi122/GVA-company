// Restore a backup .zip (downloaded from System & backups) into the database in server/.env (or DATABASE_URL).
// Usage:  npm run restore -w server -- path/to/gva-backup-YYYYMMDD-HHMMSS-auto.zip --yes
// ALL current data in that database is replaced. A safety backup of the current data is made first.
import { existsSync, mkdtempSync, readFileSync, rmSync, renameSync, cpSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import extract from 'extract-zip';
import { UPLOAD_DIR } from '../src/paths.js';
import { USE_BLOB } from '../src/storage.js';
import { createBackup, restoreData, MODELS } from '../src/backup.js';
import { prisma } from '../src/db.js';

const args = process.argv.slice(2);
const zipArg = args.find((a) => !a.startsWith('--'));
const confirmed = args.includes('--yes');
const target = (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@');

try {
  if (!zipArg) throw new Error('Usage: npm run restore -w server -- <backup.zip> --yes');
  const source = path.resolve(process.env.INIT_CWD || process.cwd(), zipArg);
  if (!existsSync(source)) throw new Error(`Backup not found: ${source}`);
  if (!confirmed) {
    console.log(`This will REPLACE ALL DATA in:\n  ${target}\nwith the contents of:\n  ${source}\n\nIf that is right, run the same command again with --yes at the end.`);
  } else {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'gva-restore-'));
    try {
      await extract(source, { dir: tmp });
      const dataFile = path.join(tmp, 'data.json');
      if (!existsSync(dataFile)) throw new Error('This file is not a GVA backup (data.json missing).');
      const data = JSON.parse(readFileSync(dataFile, 'utf8'));

      const safety = await createBackup('manual');
      console.log(`Safety backup of the current data: ${safety.file}`);

      await restoreData(data);
      console.log(`Database restored (${MODELS.map((m) => `${(data[m] ?? []).length} ${m}`).filter((s) => !s.startsWith('0 ')).join(', ')}).`);

      const uploads = path.join(tmp, 'uploads');
      if (existsSync(uploads) && !USE_BLOB) {
        const stamp = Date.now();
        if (existsSync(UPLOAD_DIR)) renameSync(UPLOAD_DIR, `${UPLOAD_DIR}-before-restore-${stamp}`);
        cpSync(uploads, UPLOAD_DIR, { recursive: true });
        console.log(`Photos restored to ${UPLOAD_DIR}`);
      }
      console.log('\nDone.');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
} catch (e) {
  console.error('Restore failed:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
