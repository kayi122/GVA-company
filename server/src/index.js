import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import customerRoutes from './routes/customers.js';
import appointmentRoutes from './routes/appointments.js';
import notificationRoutes from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import paymentRoutes from './routes/payments.js';
import installationRoutes from './routes/installations.js';
import inventoryRoutes from './routes/inventory.js';
import systemRoutes from './routes/system.js';
import { startReminderJob } from './reminders.js';
import { startBackupSchedule } from './backup.js';
import { ensureNewPermissions } from './permissions.js';
import { notify, usersWithPerm } from './notify.js';
import { prisma } from './db.js';
import { smtpConfigured } from './mailer.js';
import { HttpError } from './auth.js';

const PROD = process.env.NODE_ENV === 'production';

/* ---------- safety checks before starting ---------- */
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing — run `npm run setup` from the project root.');
if (PROD && process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production.');
if (PROD && !smtpConfigured) throw new Error('SMTP_HOST is required in production — users need their sign-in codes by email.');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        ...(PROD ? {} : { upgradeInsecureRequests: null }),
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: PROD,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system', systemRoutes);
app.use('/api', reportRoutes);
app.use('/api', paymentRoutes);
app.use('/api/installations', installationRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

/* ---------- the built React app (production) ---------- */
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  // hashed files can be cached forever; index.html and the service worker never
  app.use('/assets', express.static(`${dist}/assets`, { immutable: true, maxAge: '1y' }));
  app.use(express.static(dist, { setHeaders: (res, p) => /(index\.html|sw\.js|manifest\.webmanifest)$/.test(p) && res.setHeader('Cache-Control', 'no-cache') }));
  app.get('/{*splat}', (req, res) => res.setHeader('Cache-Control', 'no-cache').sendFile('index.html', { root: dist }));
}

app.use((err, req, res, next) => {
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] ?? 'value';
    return res.status(409).json({ error: `That ${field} is already in use.` });
  }
  // our own HttpErrors (incl. 503 "email down") carry a message meant for the user
  if (err.status && (err.status < 500 || err instanceof HttpError)) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

/* ---------- start ---------- */
// SQLite tuning: WAL lets reads continue while a write happens; wait instead of failing when busy.
await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');

const port = Number(process.env.API_PORT || 4000);
app.listen(port, () => {
  console.log(`API ready on http://localhost:${port}${PROD ? ' (production)' : ''}`);
  startReminderJob();
  startBackupSchedule(async (backup, error) => {
    const admins = await usersWithPerm('backups.manage');
    if (error) await notify(admins, { title: 'Automatic backup FAILED', body: error.message, link: '/system' });
  });
  ensureNewPermissions(prisma).then((n) => n && console.log(`Added ${n} new default permissions.`)).catch((e) => console.error(e));
  if (!smtpConfigured) console.log('SMTP not configured: login codes will print here and show on the sign-in screen.');
});
