// Runs the app as a normal long-lived server (local development or your own server).
// On Vercel this file is NOT used — see /api/index.js and vercel.json.
import app, { PROD } from './app.js';
import { prisma } from './db.js';
import { startReminderJob } from './reminders.js';
import { startBackupSchedule } from './backup.js';
import { notify, usersWithPerm } from './notify.js';
import { smtpConfigured } from './mailer.js';

// wait for the database (the local Postgres may still be starting)
for (let i = 0; ; i++) {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    break;
  } catch (e) {
    if (i >= 30) throw e;
    if (i === 0) console.log('Waiting for the database…');
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const port = Number(process.env.API_PORT || process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`API ready on http://localhost:${port}${PROD ? ' (production)' : ''}`);
  startReminderJob();
  startBackupSchedule(async (backup, error) => {
    if (error) await notify(await usersWithPerm('backups.manage'), { title: 'Automatic backup FAILED', body: error.message, link: '/system' });
  });
  if (!smtpConfigured) console.log('SMTP not configured: login codes will print here and show on the sign-in screen.');
});
