import { PrismaClient } from '@prisma/client';

// One client per process (also survives hot reloads in development).
// Generous transaction limits: on Vercel the database (Neon) is reached over the network.
const g = globalThis;
export const prisma = g.__gvaPrisma ?? new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 20_000 } });
g.__gvaPrisma = prisma;
