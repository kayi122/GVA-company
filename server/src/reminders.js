// Reminds agents about visits starting within the next hour.
// Own server: runs every minute. Vercel: runs whenever the app checks for notifications
// (every 30 s while anyone has it open), at most once a minute per server instance.
import { prisma } from './db.js';

const PURPOSE = { FOLLOW_UP: 'Follow-up visit', PAYMENT: 'Payment collection', DEMO: 'Demo visit', OTHER: 'Visit' };

export async function runReminders() {
  const now = Date.now();
  const due = await prisma.appointment.findMany({
    where: { status: 'SCHEDULED', remindedAt: null, scheduledAt: { gte: new Date(now - 10 * 60_000), lte: new Date(now + 60 * 60_000) } },
    include: { customer: { select: { id: true, fullName: true, phone: true, sector: true, district: true } } },
  });
  let sent = 0;
  for (const a of due) {
    // claim it first, so two server instances never send the same reminder twice
    const { count } = await prisma.appointment.updateMany({ where: { id: a.id, remindedAt: null }, data: { remindedAt: new Date() } });
    if (!count) continue;
    const time = a.scheduledAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: process.env.TZ || 'Africa/Kigali' });
    const where = [a.customer.sector, a.customer.district].filter(Boolean).join(', ');
    await prisma.notification.create({
      data: {
        userId: a.agentId,
        type: 'REMINDER',
        title: `${PURPOSE[a.purpose] ?? 'Visit'} with ${a.customer.fullName} at ${time}`,
        body: `${a.customer.phone}${where ? ' · ' + where : ''}`,
        link: `/customers/${a.customer.id}`,
      },
    });
    sent++;
  }
  return sent;
}

let lastRun = 0;
/** Cheap to call often: does real work at most once a minute. */
export async function maybeRunReminders() {
  if (Date.now() - lastRun < 60_000) return;
  lastRun = Date.now();
  await runReminders().catch((e) => console.error('Reminders failed:', e.message));
}

export function startReminderJob() {
  const tick = () => runReminders().catch((e) => console.error('Reminder job failed:', e.message));
  tick();
  return setInterval(tick, 60_000);
}
