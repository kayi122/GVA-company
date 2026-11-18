// Where the app keeps files when running on its own server / locally.
// On Vercel, photos and backups go to Vercel Blob instead (see storage.js).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Kept outside server/ so the development auto-restart doesn't fire on every upload
const DATA_DIR = fileURLToPath(new URL('../../.data', import.meta.url));

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads'));
export const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups'));
