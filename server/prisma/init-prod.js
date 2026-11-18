// Production first run: default permissions + the first admin account. NO demo data.
// Needs INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD the first time (ignored once users exist).
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_MATRIX } from '../src/permissions.js';

const prisma = new PrismaClient();
try {
  if ((await prisma.rolePermission.count()) === 0) {
    const rows = Object.entries(DEFAULT_MATRIX).flatMap(([role, perms]) => perms.map((permission) => ({ role, permission })));
    await prisma.rolePermission.createMany({ data: rows });
    console.log(`Default permissions created (${rows.length}).`);
  }
  if ((await prisma.user.count()) === 0) {
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const password = process.env.INITIAL_ADMIN_PASSWORD;
    const username = (process.env.INITIAL_ADMIN_USERNAME || 'admin').toLowerCase();
    if (!email || !password || password.length < 12) {
      throw new Error('First start: set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (12+ characters) to create the admin account.');
    }
    await prisma.user.create({
      data: { username, email: email.toLowerCase(), fullName: 'System Administrator', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`Admin account "${username}" created. Sign in, change the password, then remove INITIAL_ADMIN_PASSWORD from the settings.`);
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
