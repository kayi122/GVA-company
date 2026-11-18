// In-app notifications for workflow events (shown in the bell, and as browser pop-ups if enabled).
import { prisma } from './db.js';

export async function usersWithPerm(permission) {
  const roles = (await prisma.rolePermission.findMany({ where: { permission }, select: { role: true } })).map((r) => r.role);
  if (!roles.length) return [];
  return (await prisma.user.findMany({ where: { role: { in: roles }, isActive: true }, select: { id: true } })).map((u) => u.id);
}

export async function notify(userIds, { title, body = null, link = null, type = 'INFO' }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, title, body, link, type })) }).catch((e) => console.error('notify failed', e.message));
}

export const rwf = (n) => `${Number(n).toLocaleString('en-US')} RWF`;
