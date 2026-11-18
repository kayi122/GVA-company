// Local PostgreSQL for development (no install needed). Production uses Neon on Vercel.
// `node scripts/dev-db.js`  → starts and keeps running (used by `npm run dev`)
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DEV_DB = { port: 5433, user: 'postgres', password: 'postgres', database: 'gva' };
export const DEV_DB_URL = `postgresql://${DEV_DB.user}:${DEV_DB.password}@localhost:${DEV_DB.port}/${DEV_DB.database}`;
const dataDir = fileURLToPath(new URL('../.pgdata', import.meta.url));

export async function startDevDb() {
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: DEV_DB.user, password: DEV_DB.password, port: DEV_DB.port, persistent: true, onLog: () => {} });
  if (!existsSync(`${dataDir}/PG_VERSION`)) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase(DEV_DB.database); } catch { /* already exists */ }
  return pg;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pg = await startDevDb();
  console.log(`Local Postgres ready on port ${DEV_DB.port}`);
  const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 1 << 30); // keep running
}
