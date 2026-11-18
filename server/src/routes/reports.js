import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requirePerm, audit, HttpError } from '../auth.js';
import { buildReport, reportAgents, actualsFor, monthRange } from '../reporting.js';
import { toXlsx, pipePdf, fileBase } from '../exports.js';

const router = Router();
router.use(requireAuth);

const canReport = requirePerm('reports.team', 'reports.all');
const canSetTargets = requirePerm('targets.manage_team', 'targets.manage_all');

/* ---------------- reports ---------------- */
router.get('/reports/summary', canReport, async (req, res) => {
  res.json(await buildReport(req, req.query));
});

router.get('/reports/export.xlsx', canReport, async (req, res) => {
  const report = await buildReport(req, req.query, { withRows: true });
  const buf = await toXlsx(report, req.user.fullName);
  await audit(req, 'REPORT_EXPORTED', `Excel · ${report.scopeLabel} · ${report.range.from} → ${report.range.to}`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileBase(report)}.xlsx"`);
  res.send(Buffer.from(buf));
});

router.get('/reports/export.pdf', canReport, async (req, res) => {
  const report = await buildReport(req, req.query);
  await audit(req, 'REPORT_EXPORTED', `PDF · ${report.scopeLabel} · ${report.range.from} → ${report.range.to}`);
  res.setHeader('Content-Type', 'application/pdf');
  // ?inline=1 opens the PDF in the browser tab (preview) instead of downloading it
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${fileBase(report)}.pdf"`);
  pipePdf(report, req.user.fullName, res);
});

/* ---------------- targets ---------------- */
async function targetRows(req, period, supervisorId) {
  const { from, end } = monthRange(period);
  const agents = await reportAgents(req, { supervisorId });
  const ids = agents.map((a) => a.id);
  const [targets, actuals] = await Promise.all([
    prisma.target.findMany({ where: { userId: { in: ids }, period } }),
    actualsFor(ids, from, end),
  ]);
  const byUser = new Map(targets.map((t) => [t.userId, t]));
  return agents.map((a) => ({
    id: a.id, name: a.fullName, team: a.supervisor?.fullName ?? 'Unassigned', supervisorId: a.supervisorId, isActive: a.isActive,
    target: byUser.has(a.id) ? { leads: byUser.get(a.id).leads, visits: byUser.get(a.id).visits, sales: byUser.get(a.id).sales } : null,
    actual: actuals.get(a.id),
  }));
}

// Everyone: my own month (agents) or my team's month (supervisors)
router.get('/targets/me', async (req, res) => {
  const { period, from, end } = monthRange(req.query.period);
  const elapsed = Math.min(1, Math.max(0, (Date.now() - from) / (end - from)));
  if (req.user.role === 'AGENT') {
    const [t, actual] = await Promise.all([
      prisma.target.findUnique({ where: { userId_period: { userId: req.user.id, period } } }),
      actualsFor([req.user.id], from, end),
    ]);
    return res.json({ period, elapsed, scope: 'me', target: t && { leads: t.leads, visits: t.visits, sales: t.sales }, actual: actual.get(req.user.id) });
  }
  if (!req.perms.has('reports.team') && !req.perms.has('reports.all')) return res.json({ period, elapsed, scope: 'none', target: null, actual: null });
  const rows = await targetRows(req, period, req.perms.has('reports.all') ? undefined : null);
  const sum = (get) => rows.reduce((s, r) => s + (get(r) ?? 0), 0);
  const hasTargets = rows.some((r) => r.target);
  res.json({
    period, elapsed, scope: req.perms.has('reports.all') ? 'all' : 'team',
    target: hasTargets ? { leads: sum((r) => r.target?.leads), visits: sum((r) => r.target?.visits), sales: sum((r) => r.target?.sales) } : null,
    actual: { leads: sum((r) => r.actual.leads), visits: sum((r) => r.actual.visits), sales: sum((r) => r.actual.sales), hot: sum((r) => r.actual.hot) },
    agentsOnTrack: hasTargets ? rows.filter((r) => r.target?.leads && r.actual.leads >= r.target.leads * elapsed).length : null,
    agentsWithTarget: rows.filter((r) => r.target?.leads).length,
  });
});

router.get('/targets', canSetTargets, async (req, res) => {
  const { period, from, end } = monthRange(req.query.period);
  res.json({ period, elapsed: Math.min(1, Math.max(0, (Date.now() - from) / (end - from))), agents: await targetRows(req, period, req.query.supervisorId) });
});

router.put('/targets', canSetTargets, async (req, res) => {
  const r = z
    .object({
      period: z.string().regex(/^\d{4}-\d{2}$/, 'Invalid month'),
      items: z.array(z.object({
        userId: z.number().int(),
        leads: z.number().int().min(0).max(10000),
        visits: z.number().int().min(0).max(10000),
        sales: z.number().int().min(0).max(10000),
      })).min(1).max(500),
    })
    .safeParse(req.body ?? {});
  if (!r.success) throw new HttpError(400, r.error.issues[0].message);
  const { period, items } = r.data;
  const allowed = new Set((await reportAgents(req, {})).map((a) => a.id));
  const bad = items.find((i) => !allowed.has(i.userId));
  if (bad) throw new HttpError(403, 'You can only set targets for agents in your team.');
  await prisma.$transaction(items.map((i) => prisma.target.upsert({
    where: { userId_period: { userId: i.userId, period } },
    create: { ...i, period, setById: req.user.id },
    update: { leads: i.leads, visits: i.visits, sales: i.sales, setById: req.user.id },
  })));
  await audit(req, 'TARGETS_SET', `${period}: ${items.length} agent${items.length > 1 ? 's' : ''}`);
  res.json({ ok: true, saved: items.length });
});

export default router;
