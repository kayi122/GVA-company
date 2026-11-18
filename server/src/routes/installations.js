import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'node:crypto';
import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { notify, usersWithPerm } from '../notify.js';
import { UPLOAD_DIR } from '../paths.js';

const router = Router();
router.use(requireAuth);

export const UPLOAD_ROOT = path.join(UPLOAD_DIR, 'installations');
const MIN_PHOTOS = 2;

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  return r.data;
}

const isOps = (req) => req.perms.has('installs.assign');
const canView = (req, inst) => isOps(req) || req.perms.has('customers.view_all') || (req.perms.has('installs.complete') && inst.technicianId === req.user.id);
const isAssignedTech = (req, inst) => req.perms.has('installs.complete') && inst.technicianId === req.user.id;

const listInclude = {
  customer: { select: { id: true, fullName: true, phone: true, altPhone: true, district: true, sector: true, landmark: true, latitude: true, longitude: true, customerType: true } },
  payment: { select: { amount: true, transactionId: true, paidAt: true, package: { select: { name: true, speedMbps: true } }, agent: { select: { id: true, fullName: true, phone: true } } } },
  technician: { select: { id: true, fullName: true, phone: true } },
  _count: { select: { photos: true } },
};

async function loadInstallation(req) {
  const inst = await prisma.installation.findUnique({ where: { id: Number(req.params.id) }, include: { customer: { include: { agent: true } } } });
  if (!inst || !canView(req, inst)) throw new HttpError(404, 'Installation not found.');
  return inst;
}

/* ---------------- stock helper ---------------- */
async function issueMaterials(tx, { items, installationId, technicianId, userId }) {
  const lowNow = [];
  for (const { itemId, qty } of items) {
    if (!qty) continue;
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || !item.isActive) throw new HttpError(400, 'Unknown stock item.');
    if (item.quantity < qty) throw new HttpError(409, `Not enough ${item.name} in stock (${item.quantity} ${item.unit} left).`);
    const balance = item.quantity - qty;
    await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: balance } });
    await tx.stockMovement.create({ data: { itemId: item.id, change: -qty, reason: 'ISSUED', balance, installationId, technicianId, userId } });
    if (item.quantity > item.minQuantity && balance <= item.minQuantity) lowNow.push(`${item.name} (${balance} ${item.unit} left)`);
  }
  return lowNow;
}
export async function warnLowStock(lowNow) {
  if (!lowNow.length) return;
  await notify(await usersWithPerm('inventory.manage'), { title: 'Low stock', body: lowNow.join(', '), link: '/inventory' });
}

/* ---------------- list & detail ---------------- */
router.get('/', async (req, res) => {
  const where = {};
  if (isOps(req) || req.perms.has('customers.view_all')) {
    if (req.query.technicianId) where.technicianId = Number(req.query.technicianId);
  } else if (req.perms.has('installs.complete')) {
    where.technicianId = req.user.id;
  } else throw new HttpError(403, 'You do not have permission to see installations.');
  if (req.query.status) where.status = { in: String(req.query.status).split(',') };
  // completed jobs: only the last 30 days unless asked
  if (!req.query.status && !req.query.all) where.OR = [{ status: { not: 'COMPLETED' } }, { completedAt: { gte: new Date(Date.now() - 30 * 864e5) } }];
  const installations = await prisma.installation.findMany({ where, include: listInclude, orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }], take: 300 });
  res.json({ installations });
});

router.get('/technicians', requirePerm('installs.assign'), async (req, res) => {
  const ids = await usersWithPerm('installs.complete');
  const techs = await prisma.user.findMany({
    where: { id: { in: ids }, role: 'TECHNICIAN' },
    select: { id: true, fullName: true, phone: true, jobs: { where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } }, select: { scheduledAt: true } } },
    orderBy: { fullName: 'asc' },
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 864e5);
  res.json({
    technicians: techs.map(({ jobs, ...t }) => ({ ...t, openJobs: jobs.length, today: jobs.filter((j) => j.scheduledAt >= today && j.scheduledAt < tomorrow).length })),
  });
});

router.get('/:id', async (req, res) => {
  await loadInstallation(req);
  const inst = await prisma.installation.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      ...listInclude,
      photos: { orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true, size: true, uploadedById: true } },
      movements: { include: { item: { select: { name: true, unit: true } } }, orderBy: { createdAt: 'asc' } },
    },
  });
  res.json({ installation: inst, canManage: isOps(req), isMine: isAssignedTech(req, inst) });
});

/* ---------------- operations: assign / materials ---------------- */
router.post('/:id/assign', requirePerm('installs.assign'), async (req, res) => {
  const inst = await loadInstallation(req);
  if (inst.status === 'COMPLETED') throw new HttpError(409, 'This installation is already completed.');
  const data = parse(z.object({
    technicianId: z.coerce.number().int(),
    scheduledAt: z.coerce.date(),
    opsNotes: z.string().trim().max(500).optional().nullable(),
    materials: z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(0).max(100000) })).max(30).default([]),
  }), req.body);
  if (!(await usersWithPerm('installs.complete')).includes(data.technicianId)) throw new HttpError(400, 'Choose a technician.');
  const tech = await prisma.user.findUnique({ where: { id: data.technicianId } });

  const lowNow = await prisma.$transaction(async (tx) => {
    await tx.installation.update({
      where: { id: inst.id },
      data: { status: 'SCHEDULED', technicianId: data.technicianId, scheduledAt: data.scheduledAt, opsNotes: data.opsNotes || null, assignedById: req.user.id, holdReason: null },
    });
    await tx.customer.update({ where: { id: inst.customerId }, data: { stage: 'SCHEDULED' } });
    return issueMaterials(tx, { items: data.materials, installationId: inst.id, technicianId: data.technicianId, userId: req.user.id });
  });
  await warnLowStock(lowNow);
  const when = data.scheduledAt.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  await audit(req, 'INSTALL_ASSIGNED', `#${inst.id} ${inst.customer.fullName} → ${tech.fullName}, ${when}`);
  await notify([data.technicianId], {
    title: `New job: ${inst.customer.fullName} · ${when}`,
    body: [inst.customer.sector, inst.customer.district].filter(Boolean).join(', '),
    link: `/installations/${inst.id}`,
  });
  await notify([inst.customer.agentId], { title: `Installation scheduled: ${inst.customer.fullName}`, body: `${when} with ${tech.fullName}`, link: `/customers/${inst.customerId}` });
  res.json({ ok: true });
});

router.post('/:id/materials', requirePerm('installs.assign'), async (req, res) => {
  const inst = await loadInstallation(req);
  const { materials } = parse(z.object({ materials: z.array(z.object({ itemId: z.number().int(), qty: z.number().int().min(1).max(100000) })).min(1).max(30) }), req.body);
  const lowNow = await prisma.$transaction((tx) => issueMaterials(tx, { items: materials, installationId: inst.id, technicianId: inst.technicianId, userId: req.user.id }));
  await warnLowStock(lowNow);
  res.json({ ok: true });
});

/* ---------------- technician: start / photos / complete / hold ---------------- */
router.post('/:id/start', async (req, res) => {
  const inst = await loadInstallation(req);
  if (!isAssignedTech(req, inst)) throw new HttpError(403, 'Only the assigned technician can start this job.');
  if (inst.status !== 'SCHEDULED') throw new HttpError(409, 'This job is not scheduled.');
  await prisma.installation.update({ where: { id: inst.id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
  res.json({ ok: true });
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, String(Number(req.params.id)));
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${{ 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype] ?? '.jpg'}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

router.post('/:id/photos', async (req, res, next) => {
  const inst = await loadInstallation(req);
  if (!isAssignedTech(req, inst) && !isOps(req)) throw new HttpError(403, 'Only the assigned technician can add photos.');
  if (inst.status === 'COMPLETED' && !isOps(req)) throw new HttpError(409, 'This job is already completed.');
  upload.array('photos', 10)(req, res, async (err) => {
    try {
      if (err) throw new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 8 MB.' : 'Upload failed. Try fewer photos.');
      if (!req.files?.length) throw new HttpError(400, 'Choose at least one photo (JPG, PNG or WebP).');
      await prisma.installPhoto.createMany({
        data: req.files.map((f) => ({ installationId: inst.id, fileName: path.basename(f.path), mimeType: f.mimetype, size: f.size, uploadedById: req.user.id })),
      });
      res.status(201).json({ uploaded: req.files.length });
    } catch (e) {
      next(e);
    }
  });
});

router.get('/:id/photos/:photoId', async (req, res) => {
  const inst = await prisma.installation.findUnique({ where: { id: Number(req.params.id) }, include: { customer: true } });
  // agents/supervisors who can see the customer may also see the evidence
  const allowed = inst && (canView(req, inst) || inst.customer.agentId === req.user.id ||
    (req.perms.has('customers.view_team') && (await prisma.user.findUnique({ where: { id: inst.customer.agentId } }))?.supervisorId === req.user.id));
  if (!allowed) throw new HttpError(404, 'Photo not found.');
  const photo = await prisma.installPhoto.findFirst({ where: { id: Number(req.params.photoId), installationId: inst.id } });
  if (!photo) throw new HttpError(404, 'Photo not found.');
  const file = path.join(UPLOAD_ROOT, String(inst.id), photo.fileName);
  if (!existsSync(file)) throw new HttpError(404, 'Photo file is missing.');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type(photo.mimeType).sendFile(file);
});

router.delete('/:id/photos/:photoId', async (req, res) => {
  const inst = await loadInstallation(req);
  if (inst.status === 'COMPLETED') throw new HttpError(409, 'Photos of a completed job cannot be removed.');
  const photo = await prisma.installPhoto.findFirst({ where: { id: Number(req.params.photoId), installationId: inst.id } });
  if (!photo || (photo.uploadedById !== req.user.id && !isOps(req))) throw new HttpError(404, 'Photo not found.');
  await prisma.installPhoto.delete({ where: { id: photo.id } });
  try { unlinkSync(path.join(UPLOAD_ROOT, String(inst.id), photo.fileName)); } catch {}
  res.json({ ok: true });
});

router.post('/:id/complete', async (req, res) => {
  const inst = await loadInstallation(req);
  if (!isAssignedTech(req, inst)) throw new HttpError(403, 'Only the assigned technician can complete this job.');
  if (!['SCHEDULED', 'IN_PROGRESS'].includes(inst.status)) throw new HttpError(409, 'This job cannot be completed now.');
  const data = parse(z.object({
    routerSerial: z.string().trim().toUpperCase().min(4, 'Enter the router serial number').max(60),
    signedBy: z.string().trim().min(2, 'Enter the name of the person who received the installation').max(80),
    techNotes: z.string().trim().max(1000).optional().nullable(),
  }), req.body);
  const photos = await prisma.installPhoto.count({ where: { installationId: inst.id } });
  if (photos < MIN_PHOTOS) throw new HttpError(400, `Add at least ${MIN_PHOTOS} photos as evidence before completing.`);
  const now = new Date();
  await prisma.$transaction([
    prisma.installation.update({ where: { id: inst.id }, data: { ...data, techNotes: data.techNotes || null, status: 'COMPLETED', completedAt: now, startedAt: inst.startedAt ?? now } }),
    prisma.customer.update({ where: { id: inst.customerId }, data: { stage: 'INSTALLED' } }),
  ]);
  await audit(req, 'INSTALL_COMPLETED', `#${inst.id} ${inst.customer.fullName} · router ${data.routerSerial}`);
  await notify([inst.customer.agentId, inst.customer.agent.supervisorId, ...(await usersWithPerm('installs.assign'))], {
    title: `Installed: ${inst.customer.fullName} is connected`,
    body: `By ${req.user.fullName} · router ${data.routerSerial}`,
    link: `/installations/${inst.id}`,
  });
  res.json({ ok: true });
});

router.post('/:id/hold', async (req, res) => {
  const inst = await loadInstallation(req);
  if (!isAssignedTech(req, inst) && !isOps(req)) throw new HttpError(403, 'Not allowed.');
  if (inst.status === 'COMPLETED') throw new HttpError(409, 'This job is already completed.');
  const reason = String(req.body?.reason ?? '').trim();
  if (reason.length < 3) throw new HttpError(400, 'Explain what is blocking the installation.');
  await prisma.installation.update({ where: { id: inst.id }, data: { status: 'ON_HOLD', holdReason: reason.slice(0, 500) } });
  await audit(req, 'INSTALL_ON_HOLD', `#${inst.id} ${inst.customer.fullName}: ${reason}`);
  await notify(await usersWithPerm('installs.assign'), { title: `On hold: ${inst.customer.fullName}`, body: `${req.user.fullName}: ${reason}`, link: `/installations/${inst.id}` });
  res.json({ ok: true });
});

export default router;
