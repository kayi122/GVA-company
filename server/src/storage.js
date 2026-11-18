// File storage for installation photos and backups.
//  - On Vercel (BLOB_READ_WRITE_TOKEN set): Vercel Blob. Files are ENCRYPTED (AES-256-GCM) before upload,
//    so even though Blob URLs are public, a leaked URL reveals nothing. Users only get files through the app.
//  - Locally / own server: plain files in UPLOAD_DIR.
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { put, del, list } from '@vercel/blob';
import { UPLOAD_DIR } from './paths.js';

export const USE_BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const isUrl = (k) => /^https:\/\//.test(k);

// Key: FILE_ENCRYPTION_KEY if set, otherwise derived from JWT_SECRET. Never change it once files exist.
const key = () => crypto.createHash('sha256').update(`gva-files:${process.env.FILE_ENCRYPTION_KEY || process.env.JWT_SECRET}`).digest();

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
function decrypt(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

export const _crypto = { encrypt, decrypt }; // for tests

/** Saves a file and returns the key to store in the database. */
export async function saveFile(name, buffer) {
  if (USE_BLOB) {
    const blob = await put(name, encrypt(buffer), { access: 'public', addRandomSuffix: true, contentType: 'application/octet-stream' });
    return blob.url;
  }
  const p = path.join(UPLOAD_DIR, name);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, buffer);
  return name;
}

export async function readFile(stored) {
  if (isUrl(stored)) {
    const res = await fetch(stored);
    if (!res.ok) throw new Error('File not found in storage');
    return decrypt(Buffer.from(await res.arrayBuffer()));
  }
  const p = path.join(UPLOAD_DIR, stored);
  if (!p.startsWith(UPLOAD_DIR) || !existsSync(p)) throw new Error('File not found');
  return readFileSync(p);
}

export async function deleteFile(stored) {
  try {
    if (isUrl(stored)) await del(stored);
    else unlinkSync(path.join(UPLOAD_DIR, stored));
  } catch { /* already gone */ }
}

/** Lists files under a folder: [{ key, name, size, uploadedAt }] */
export async function listFiles(prefix) {
  if (USE_BLOB) {
    const out = [];
    let cursor;
    do {
      const r = await list({ prefix: `${prefix}/`, cursor, limit: 1000 });
      r.blobs.forEach((b) => out.push({ key: b.url, name: path.posix.basename(b.pathname), size: b.size, uploadedAt: new Date(b.uploadedAt) }));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  const dir = path.join(UPLOAD_DIR, prefix);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((name) => {
    const st = statSync(path.join(dir, name));
    return { key: `${prefix}/${name}`, name, size: st.size, uploadedAt: st.mtime };
  });
}
