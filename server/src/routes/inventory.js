import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { warnLowStock } from './installations.js';

const router = Router();
router.use(requireAuth);

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  return r.data;
}

const canRead = requirePerm('inventory.manage', 'installs.assign');

router.get('/', canRead, async (req, res) => {
  const items = await prisma.inventoryItem.findMany({ where: req.query.all ? {} : { isActive: true }, orderBy: { name: 'asc' } });
  const since = new Date(Date.now() - 30 * 864e5);
  const used = await prisma.stockMovement.groupBy({ by: ['itemId'], where: { reason: 'ISSUED', createdAt: { gte: since } }, _sum: { change: true } });
  const usedBy = new Map(used.map((u) => [u.itemId, -(u._sum.change ?? 0)]));
  res.json({ items: items.map((i) => ({ ...i, used30d: usedBy.get(i.id) ?? 0, low: i.quantity <= i.minQuantity })) });
});

const itemSchema = z.object({
  sku: z.string().trim().toUpperCase().min(2).max(30).regex(/^[A-Z0-9-_]+$/, 'Code: letters, numbers and dashes'),
  name: z.string().trim().min(2).max(80),
  unit: z.enum(['pcs', 'm']),
  minQuantity: z.coerce.number().int().min(0).max(1_000_000),
  kitQuantity: z.coerce.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().optional(),
});

router.post('/', requirePerm('inventory.manage'), async (req, res) => {
  const data = parse(itemSchema.extend({ quantity: z.coerce.number().int().min(0).max(1_000_000).default(0) }), req.body);
  const item = await prisma.$transaction(async (tx) => {
    const i = await tx.inventoryItem.create({ data });
    if (data.quantity) await tx.stockMovement.create({ data: { itemId: i.id, change: data.quantity, reason: 'RECEIVED', balance: data.quantity, userId: req.user.id, note: 'Opening stock' } });
    return i;
  });
  await audit(req, 'STOCK_ITEM_CREATED', `${item.name} (${item.quantity} ${item.unit})`);
  res.status(201).json({ item });
});

router.patch('/:id', requirePerm('inventory.manage'), async (req, res) => {
  const item = await prisma.inventoryItem.update({ where: { id: Number(req.params.id) }, data: parse(itemSchema.partial(), req.body) });
  res.json({ item });
});

// Receive new stock, return unused material, or correct a count.
router.post('/:id/movements', requirePerm('inventory.manage'), async (req, res) => {
  const { reason, qty, note } = parse(z.object({
    reason: z.enum(['RECEIVED', 'RETURNED', 'ADJUSTED']),
    qty: z.coerce.number().int().refine((n) => n !== 0, 'Enter a quantity').refine((n) => Math.abs(n) <= 1_000_000, 'Quantity too large'),
    note: z.string().trim().max(300).optional().nullable(),
  }), req.body);
  if (reason !== 'ADJUSTED' && qty < 0) throw new HttpError(400, 'Use a positive quantity.');
  if (reason === 'ADJUSTED' && !note) throw new HttpError(400, 'Write why the count is being corrected.');
  let low = [];
  const item = await prisma.$transaction(async (tx) => {
    const i = await tx.inventoryItem.findUnique({ where: { id: Number(req.params.id) } });
    if (!i) throw new HttpError(404, 'Item not found.');
    const balance = i.quantity + qty;
    if (balance < 0) throw new HttpError(400, `Only ${i.quantity} ${i.unit} in stock.`);
    await tx.stockMovement.create({ data: { itemId: i.id, change: qty, reason, balance, userId: req.user.id, note: note || null } });
    if (i.quantity > i.minQuantity && balance <= i.minQuantity) low = [`${i.name} (${balance} ${i.unit} left)`];
    return tx.inventoryItem.update({ where: { id: i.id }, data: { quantity: balance } });
  });
  await warnLowStock(low);
  await audit(req, `STOCK_${reason}`, `${item.name}: ${qty > 0 ? '+' : ''}${qty} ${item.unit} → ${item.quantity}${note ? ` (${note})` : ''}`);
  res.status(201).json({ item });
});

router.get('/:id/movements', canRead, async (req, res) => {
  const movements = await prisma.stockMovement.findMany({
    where: { itemId: Number(req.params.id) },
    include: {
      user: { select: { fullName: true } },
      installation: { select: { id: true, customer: { select: { fullName: true } }, technician: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ movements });
});

export default router;
