// Make a backup from the command line (works while the server is running).
// Usage: npm run backup -w server
import { createBackup } from '../src/backup.js';
import { prisma } from '../src/db.js';
import { BACKUP_DIR } from '../src/paths.js';

try {
  const b = await createBackup('manual');
  console.log(`Backup created: ${BACKUP_DIR}/${b.file} (${(b.size / 1024 / 1024).toFixed(1)} MB)`);
} catch (e) {
  console.error('Backup failed:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
