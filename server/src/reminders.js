// Every minute: remind agents about visits starting within the next hour.
import { prisma } from './db.js';

const PURPOSE = { FOLLOW_UP: 'Follow-up visit', PAYMENT: 'Payment collection', DEMO: 'Demo visit', OTHER: 'Visit' };

export async function runReminders() {
  const now = Date.now();
  const due = await prisma.appointment.findMany({
    where: { status: 'SCHEDULED', remindedAt: null, scheduledAt: { gte: new Date(now - 10 * 60_000), lte: new Date(now + 60 * 60_000) } },
    include: { customer: { select: { id: true, fullName: true, phone: true, sector: true, district: true } } },
  });
  for (const a of due) {
    const time = a.scheduledAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const where = [a.customer.sector, a.customer.district].filter(Boolean).join(', ');
    await prisma.$transaction([
      prisma.notification.create({
        data: {
          userId: a.agentId,
          type: 'REMINDER',
          title: `${PURPOSE[a.purpose] ?? 'Visit'} with ${a.customer.fullName} at ${time}`,
          body: `${a.customer.phone}${where ? ' · ' + where : ''}`,
          link: `/customers/${a.customer.id}`,
        },
      }),
      prisma.appointment.update({ where: { id: a.id }, data: { remindedAt: new Date() } }),
    ]);
  }
  return due.length;
}

export function startReminderJob() {
  const tick = () => runReminders().catch((e) => console.error('Reminder job failed:', e.message));
  tick();
  return setInterval(tick, 60_000);
}
