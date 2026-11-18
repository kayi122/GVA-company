import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const COOKIE = 'gva_session';
const SECRET = () => process.env.JWT_SECRET;

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.sessionVersion ?? 0 }, SECRET(), { expiresIn: '12h' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 3600 * 1000,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Please sign in.' });
    const { sub, v } = jwt.verify(token, SECRET());
    const user = await prisma.user.findUnique({ where: { id: sub } });
    // sessionVersion changes on password change/reset, disable or role change → old sessions stop working
    if (!user || !user.isActive || (v ?? 0) !== user.sessionVersion) {
      clearSession(res);
      return res.status(401).json({ error: 'Your session has ended. Please sign in.' });
    }
    const perms = await prisma.rolePermission.findMany({ where: { role: user.role } });
    req.user = user;
    req.perms = new Set(perms.map((p) => p.permission));
    next();
  } catch {
    res.status(401).json({ error: 'Your session has ended. Please sign in.' });
  }
}

export const requirePerm = (...keys) => (req, res, next) =>
  keys.some((k) => req.perms?.has(k)) ? next() : res.status(403).json({ error: 'You do not have permission to do this.' });

export function publicUser(u) {
  if (!u) return u;
  const { passwordHash, sessionVersion, ...rest } = u;
  return rest;
}

export async function audit(req, action, details, userId) {
  await prisma.auditLog
    .create({ data: { userId: userId ?? req.user?.id ?? null, action, details: details ? String(details) : null, ip: req.ip } })
    .catch(() => {});
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
