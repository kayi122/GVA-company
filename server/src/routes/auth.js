import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { prisma } from '../db.js';
import { sendLoginCode } from '../mailer.js';
import { issueSession, clearSession, requireAuth, publicUser, audit, HttpError } from '../auth.js';

const router = Router();
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Counts only FAILED attempts, per connection + account, so many agents sharing one office
// connection don't lock each other out, while password/code guessing is still blocked.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}|${String(req.body?.username ?? req.body?.challengeId ?? '').trim().toLowerCase()}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const hashCode = (code) => crypto.createHmac('sha256', process.env.JWT_SECRET).update(code).digest('hex');

function maskEmail(email) {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

async function createChallenge(user) {
  // Any older unused codes stop working.
  await prisma.loginCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const rec = await prisma.loginCode.create({
    data: { userId: user.id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  let delivered;
  try {
    ({ delivered } = await sendLoginCode(user, code));
  } catch (e) {
    console.error(`Could not email sign-in code to ${user.username}:`, e.message);
    throw new HttpError(503, 'We could not send your sign-in code by email. Try again in a few minutes, or tell your administrator.');
  }
  return {
    challengeId: rec.id,
    emailHint: maskEmail(user.email),
    expiresInSec: CODE_TTL_MS / 1000,
    ...(delivered ? {} : { devCode: code }),
  };
}

// Step 1: username + password  → emails a 6-digit code
router.post('/login', limiter, async (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!username || !password) throw new HttpError(400, 'Enter your username and password.');
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    if (user) await audit(req, 'LOGIN_FAILED', 'Wrong password', user.id);
    throw new HttpError(401, 'Incorrect username or password.');
  }
  if (!user.isActive) throw new HttpError(403, 'This account is disabled. Contact your administrator.');
  res.json(await createChallenge(user));
});

// Step 2: the code from the email → session
router.post('/verify', limiter, async (req, res) => {
  const { challengeId, code } = req.body ?? {};
  const rec = await prisma.loginCode.findUnique({ where: { id: String(challengeId ?? '') }, include: { user: true } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date() || rec.attempts >= MAX_ATTEMPTS || !rec.user.isActive) {
    throw new HttpError(410, 'This code has expired. Please sign in again.');
  }
  const a = Buffer.from(hashCode(String(code ?? '')));
  const b = Buffer.from(rec.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const attempts = rec.attempts + 1;
    await prisma.loginCode.update({ where: { id: rec.id }, data: { attempts } });
    const left = MAX_ATTEMPTS - attempts;
    if (left <= 0) {
      await audit(req, 'LOGIN_FAILED', 'Too many wrong codes', rec.userId);
      throw new HttpError(410, 'Too many wrong codes. Please sign in again.');
    }
    throw new HttpError(400, `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.`);
  }
  await prisma.loginCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  const user = await prisma.user.update({ where: { id: rec.userId }, data: { lastLoginAt: new Date() } });
  issueSession(res, user);
  await audit(req, 'LOGIN', 'Signed in with email code', user.id);
  res.json({ user: publicUser(user) });
});

router.post('/resend', limiter, async (req, res) => {
  const rec = await prisma.loginCode.findUnique({ where: { id: String(req.body?.challengeId ?? '') }, include: { user: true } });
  if (!rec || rec.usedAt || !rec.user.isActive) throw new HttpError(410, 'Please sign in again.');
  if (Date.now() - rec.createdAt.getTime() < 30_000) throw new HttpError(429, 'Please wait a few seconds before asking for a new code.');
  res.json(await createChallenge(rec.user));
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const supervisor = req.user.supervisorId
    ? await prisma.user.findUnique({ where: { id: req.user.supervisorId }, select: { id: true, fullName: true } })
    : null;
  res.json({ user: { ...publicUser(req.user), supervisor }, permissions: [...req.perms] });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current, next } = req.body ?? {};
  if (!(await bcrypt.compare(String(current ?? ''), req.user.passwordHash))) throw new HttpError(400, 'Your current password is not correct.');
  if (String(next ?? '').length < 8) throw new HttpError(400, 'The new password must be at least 8 characters.');
  // sign out other devices, keep this one signed in
  const user = await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await bcrypt.hash(String(next), 10), sessionVersion: { increment: 1 } } });
  issueSession(res, user);
  await audit(req, 'PASSWORD_CHANGED', 'Changed own password (other devices signed out)');
  res.json({ ok: true });
});

// Supervisors see their own agents
router.get('/my-team', requireAuth, async (req, res) => {
  const agents = await prisma.user.findMany({
    where: { supervisorId: req.user.id },
    select: { id: true, fullName: true, username: true, phone: true, isActive: true, lastLoginAt: true },
    orderBy: { fullName: 'asc' },
  });
  res.json({ agents });
});

export default router;
