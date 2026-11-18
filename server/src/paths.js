// Where the app keeps its files. Override with env vars in production (see DEPLOY.md).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url));

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(SERVER_DIR, 'uploads'));
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(SERVER_DIR, 'backups'));

/** Absolute path of the SQLite file from DATABASE_URL (relative paths are relative to prisma/schema.prisma, like Prisma). */
export function databaseFile() {
  const url = process.env.DATABASE_URL || 'file:./dev.db';
  const p = url.replace(/^file:/, '').split('?')[0];
  return path.isAbsolute(p) ? p : path.resolve(SERVER_DIR, 'prisma', p);
}
