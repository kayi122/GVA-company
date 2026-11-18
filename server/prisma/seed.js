import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_MATRIX } from '../src/permissions.js';

const prisma = new PrismaClient();

const FIRST = ['Aline', 'Eric', 'Diane', 'Jean', 'Grace', 'Patrick', 'Claudine', 'Olivier', 'Sandrine', 'Emmanuel',
  'Josiane', 'Fabrice', 'Clarisse', 'Innocent', 'Divine', 'Kevin', 'Ange', 'Didier', 'Esther', 'Yves',
  'Solange', 'Thierry', 'Nadine', 'Moise', 'Alice'];
const LAST = ['Uwase', 'Mugisha', 'Ingabire', 'Niyonzima', 'Mukamana', 'Habimana', 'Uwimana', 'Nshimiyimana',
  'Iradukunda', 'Hakizimana', 'Umutoni', 'Ndayisaba', 'Mutesi', 'Bizimana', 'Kayitesi'];

async function main() {
  if ((await prisma.rolePermission.count()) === 0) {
    const rows = Object.entries(DEFAULT_MATRIX).flatMap(([role, perms]) => perms.map((permission) => ({ role, permission })));
    await prisma.rolePermission.createMany({ data: rows });
    console.log(`Seeded ${rows.length} role permissions.`);
  }

  if ((await prisma.user.count()) > 0) console.log('Users already exist — skipping user seed.');
  else await seedUsers();
  if ((await prisma.customer.count()) > 0) console.log('Customers already exist — skipping customer seed.');
  else await seedCustomers();
  if ((await prisma.target.count()) > 0) console.log('Targets already exist — skipping target seed.');
  else await seedTargets();
  if ((await prisma.package.count()) > 0) console.log('Packages already exist — skipping pipeline seed.');
  else await seedPipeline();
}

// ---- Phase 4: example packages, stock, and demo payments/installations ----
async function seedPipeline() {
  const EX = 'Example price — edit it on the Packages page';
  const packages = await Promise.all([
    ['Home 20', 20, 20000], ['Home 50', 50, 30000], ['Home 100', 100, 45000], ['Business 200', 200, 100000],
  ].map(([name, speedMbps, monthlyPrice]) => prisma.package.create({ data: { name, speedMbps, monthlyPrice, installFee: 10000, description: EX } })));

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const ops = await prisma.user.findFirst({ where: { role: 'OPERATIONS' } });
  const finance = await prisma.user.findFirst({ where: { role: 'FINANCE' } });
  const techs = await prisma.user.findMany({ where: { role: 'TECHNICIAN' } });
  const items = [];
  for (const [sku, name, unit, quantity, minQuantity, kitQuantity] of [
    ['ROUTER-WIFI', 'Wi-Fi router (dual band)', 'pcs', 45, 10, 1], ['ONT', 'ONT / fiber modem', 'pcs', 40, 10, 1],
    ['DROP-CABLE', 'Drop fiber cable', 'm', 3000, 600, 80], ['FAST-CONN', 'Fast connector SC/APC', 'pcs', 300, 60, 2],
    ['ROSETTE', 'Wall box / rosette', 'pcs', 70, 15, 1], ['PATCH-3M', 'Patch cord 3 m', 'pcs', 90, 20, 1], ['CLAMP', 'Drop wire clamp', 'pcs', 500, 100, 6],
  ]) {
    const i = await prisma.inventoryItem.create({ data: { sku, name, unit, quantity, minQuantity, kitQuantity } });
    await prisma.stockMovement.create({ data: { itemId: i.id, change: quantity, reason: 'RECEIVED', balance: quantity, userId: admin.id, note: 'Opening stock (demo)' } });
    items.push(i);
  }

  const hot = await prisma.customer.findMany({ where: { status: 'HOT', stage: 'LEAD' }, include: { agent: true } });
  const steps = ['PENDING_SUPERVISOR', 'PENDING_FINANCE', 'CONFIRMED_PENDING', 'CONFIRMED_SCHEDULED', 'CONFIRMED_DONE', 'CONFIRMED_DONE'];
  let n = 0;
  for (const c of hot.slice(0, Math.ceil(hot.length * 0.7))) {
    const step = steps[n % steps.length];
    const pkg = packages[n % 3];
    const paidAt = new Date(Date.now() - (1 + (n % 12)) * 864e5);
    const base = { customerId: c.id, agentId: c.agentId, packageId: pkg.id, amount: pkg.monthlyPrice + pkg.installFee, paidAt,
      method: ['MOMO_MTN', 'MOMO_MTN', 'AIRTEL_MONEY', 'BANK'][n % 4], transactionId: `MP${String(26111800000 + n * 7919)}` };
    n++;
    if (step === 'PENDING_SUPERVISOR') {
      await prisma.payment.create({ data: base });
      await prisma.customer.update({ where: { id: c.id }, data: { stage: 'PAYMENT_PENDING' } });
      continue;
    }
    const sup = { supervisorId: c.agent.supervisorId, supervisorAt: new Date(paidAt.getTime() + 3 * 3600e3) };
    if (step === 'PENDING_FINANCE') {
      await prisma.payment.create({ data: { ...base, ...sup, status: 'PENDING_FINANCE' } });
      await prisma.customer.update({ where: { id: c.id }, data: { stage: 'PAYMENT_PENDING' } });
      continue;
    }
    const p = await prisma.payment.create({ data: { ...base, ...sup, status: 'CONFIRMED', financeById: finance.id, financeAt: new Date(paidAt.getTime() + 6 * 3600e3) } });
    const tech = techs[n % techs.length];
    if (step === 'CONFIRMED_PENDING') {
      await prisma.installation.create({ data: { customerId: c.id, paymentId: p.id } });
      await prisma.customer.update({ where: { id: c.id }, data: { stage: 'AWAITING_INSTALL' } });
      continue;
    }
    const done = step === 'CONFIRMED_DONE';
    const scheduledAt = done ? new Date(paidAt.getTime() + 2 * 864e5) : (() => { const d = new Date(); d.setDate(d.getDate() + (n % 3)); d.setHours(9 + (n % 7), 0, 0, 0); return d; })();
    const inst = await prisma.installation.create({ data: {
      customerId: c.id, paymentId: p.id, technicianId: tech.id, assignedById: ops.id, scheduledAt, status: done ? 'COMPLETED' : 'SCHEDULED',
      ...(done && { startedAt: scheduledAt, completedAt: new Date(scheduledAt.getTime() + 3 * 3600e3), routerSerial: `GVA-RT-${100200 + n}`, signedBy: c.fullName, techNotes: 'Demo data — no photos.' }),
    } });
    await prisma.customer.update({ where: { id: c.id }, data: { stage: done ? 'INSTALLED' : 'SCHEDULED' } });
    for (const i of items) {
      const cur = await prisma.inventoryItem.findUnique({ where: { id: i.id } });
      const balance = cur.quantity - i.kitQuantity;
      await prisma.inventoryItem.update({ where: { id: i.id }, data: { quantity: balance } });
      await prisma.stockMovement.create({ data: { itemId: i.id, change: -i.kitQuantity, reason: 'ISSUED', balance, installationId: inst.id, technicianId: tech.id, userId: ops.id, createdAt: scheduledAt } });
    }
  }
  console.log(`Seeded 4 example packages, ${items.length} stock items and ${n} demo payments.`);
}

// Demo monthly targets for every agent (this month)
async function seedTargets() {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const agents = await prisma.user.findMany({ where: { role: 'AGENT' }, select: { id: true } });
  await prisma.target.createMany({
    data: agents.map((a) => ({ userId: a.id, period, leads: pick([8, 10, 12]), visits: pick([20, 25, 30]), sales: pick([3, 4, 5]), setById: admin?.id })),
  });
  console.log(`Seeded ${period} targets for ${agents.length} agents.`);
}

// ---- Demo customers, visits and appointments (Phase 2) ----
const DISTRICTS = ['Gasabo', 'Gasabo', 'Kicukiro', 'Kicukiro', 'Nyarugenge', 'Bugesera', 'Rwamagana'];
const SECTORS = { Gasabo: ['Kimironko', 'Remera', 'Kacyiru', 'Gisozi', 'Kinyinya'], Kicukiro: ['Niboye', 'Kagarama', 'Gikondo', 'Kanombe'],
  Nyarugenge: ['Nyamirambo', 'Muhima', 'Kimisagara'], Bugesera: ['Nyamata'], Rwamagana: ['Kigabiro'] };
const CUST_FIRST = ['Jean Paul', 'Marie', 'Claude', 'Vestine', 'Alexis', 'Chantal', 'Theogene', 'Agnes', 'Samuel', 'Beatrice',
  'Felix', 'Odette', 'Gilbert', 'Immaculee', 'Robert', 'Delphine', 'Frank', 'Liliane', 'Pacifique', 'Joselyne'];
const CUST_LAST = ['Nkurunziza', 'Uwera', 'Gatete', 'Mukeshimana', 'Rukundo', 'Nyirahabimana', 'Kalisa', 'Murekatete',
  'Twagirayezu', 'Umubyeyi', 'Sibomana', 'Ntawukuriryayo', 'Mbabazi', 'Gakwaya'];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weighted = (pairs) => { let r = Math.random(); for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; } return pairs[0][0]; };

async function seedCustomers() {
  const agents = await prisma.user.findMany({ where: { role: 'AGENT' } });
  let phoneSeq = 0;
  let created = 0;
  for (const agent of agents) {
    const n = 4 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) {
      const district = pick(DISTRICTS);
      const status = weighted([['COLD', 0.45], ['WARM', 0.35], ['HOT', 0.2]]);
      const isp = weighted([['MTN', 0.38], ['AIRTEL', 0.22], ['LIQUID', 0.15], ['OTHER', 0.08], ['NONE', 0.17]]);
      const createdAt = new Date(Date.now() - Math.random() * 45 * 864e5);
      const lat = -1.95 + (Math.random() - 0.5) * 0.12;
      const lng = 30.08 + (Math.random() - 0.5) * 0.14;
      const visits = 1 + Math.floor(Math.random() * (status === 'COLD' ? 1 : 3));
      const visitDates = Array.from({ length: visits }, (_, k) => new Date(createdAt.getTime() + (k * (Date.now() - createdAt.getTime())) / visits));
      const c = await prisma.customer.create({
        data: {
          fullName: `${pick(CUST_FIRST)} ${pick(CUST_LAST)}`,
          phone: `078${String(3000000 + phoneSeq++ * 1717).padStart(7, '0').slice(-7)}`,
          customerType: Math.random() < 0.15 ? 'BUSINESS' : 'HOME',
          district, sector: pick(SECTORS[district]), landmark: Math.random() < 0.5 ? 'Near ' + pick(['the church', 'the market', 'the school', 'the health centre', 'the bus stop']) : null,
          latitude: lat, longitude: lng,
          currentIsp: isp, currentIspOther: isp === 'OTHER' ? pick(['Canal Box', 'Starlink', 'Mango']) : null,
          monthlySpend: isp === 'NONE' ? null : pick([10000, 15000, 20000, 25000, 30000, 40000]),
          satisfaction: isp === 'NONE' ? null : weighted([['UNHAPPY', 0.45], ['OK', 0.4], ['HAPPY', 0.15]]),
          status, agentId: agent.id, createdAt, lastVisitAt: visitDates.at(-1),
          notes: status === 'HOT' ? 'Ready to pay, wants installation this week.' : status === 'WARM' ? 'Interested, comparing prices.' : null,
          visits: { create: visitDates.map((d, k) => ({ agentId: agent.id, createdAt: d, latitude: lat, longitude: lng,
            status: k === visits - 1 ? status : 'COLD', notes: k === 0 ? 'First contact.' : 'Return visit.' })) },
        },
      });
      if (status !== 'COLD' && Math.random() < 0.6) {
        const at = new Date();
        at.setDate(at.getDate() + Math.floor(Math.random() * 7));
        at.setHours(9 + Math.floor(Math.random() * 8), pick([0, 30]), 0, 0);
        if (at > new Date())
          await prisma.appointment.create({ data: { customerId: c.id, agentId: agent.id, scheduledAt: at, purpose: status === 'HOT' ? 'PAYMENT' : 'FOLLOW_UP' } });
      }
      created++;
    }
  }
  console.log(`Seeded ${created} demo customers with visits and appointments.`);
}

async function seedUsers() {
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  const demoPw = process.env.SEED_DEMO_PASSWORD;
  if (!adminPw || !demoPw) throw new Error('Set SEED_ADMIN_PASSWORD and SEED_DEMO_PASSWORD in server/.env');

  const adminHash = await bcrypt.hash(adminPw, 10);
  const demoHash = await bcrypt.hash(demoPw, 10);
  let n = 0;
  const name = () => {
    const i = n++;
    return `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
  };
  const mk = (username, fullName, role, extra = {}) =>
    prisma.user.create({
      data: {
        username, fullName, role,
        email: `${username}@gva.local`,
        phone: `078${String(1000000 + n * 7919).slice(-7)}`,
        passwordHash: role === 'ADMIN' ? adminHash : demoHash,
        ...extra,
      },
    });

  await mk('admin', 'System Administrator', 'ADMIN');
  await mk('finance', name(), 'FINANCE');
  await mk('operations', name(), 'OPERATIONS');
  for (let t = 1; t <= 3; t++) await mk(`tech${t}`, name(), 'TECHNICIAN');
  for (let s = 1; s <= 5; s++) {
    const sup = await mk(`supervisor${s}`, name(), 'SUPERVISOR');
    for (let a = 1; a <= 10; a++) await mk(`agent${(s - 1) * 10 + a}`, name(), 'AGENT', { supervisorId: sup.id });
  }
  console.log(`Seeded ${await prisma.user.count()} users (1 admin, 5 supervisors, 50 agents, finance, operations, 3 technicians).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
