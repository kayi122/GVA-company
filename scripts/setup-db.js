// First-time local setup: start local Postgres, create the tables, add demo data, stop.
import { execSync } from 'node:child_process';
import { startDevDb } from './dev-db.js';

const pg = await startDevDb();
try {
  const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: new URL('../server', import.meta.url) });
  run('npx prisma db push --schema prisma/schema.prisma');
  run('node --env-file=.env prisma/seed.js');
} finally {
  await pg.stop();
}
