// Shared report building for the Reports page, targets and Excel/PDF exports.
import { prisma } from './db.js';
import { HttpError } from './auth.js';

const DAY = 864e5;

export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const ym = (d) => ymd(d).slice(0, 7);

function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}

/** Inclusive day range from ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to this month so far). */
export function parseRange(query) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let from = parseDay(query.from) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  let to = parseDay(query.to) ?? today;
  if (to < from) [from, to] = [to, from];
  if ((to - from) / DAY > 366) throw new HttpError(400, 'Choose a period of one year or less.');
  const end = new Date(to.getTime() + DAY); // exclusive
  return { from, to, end };
}

export function monthRange(period) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period ?? ''));
  const now = new Date();
  const y = m ? Number(m[1]) : now.getFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getMonth();
  const from = new Date(y, mo, 1);
  const end = new Date(y, mo + 1, 1);
  return { period: ym(from), from, end, to: new Date(end.getTime() - DAY) };
}

/** Agents this user may report on. */
export async function reportAgents(req, { supervisorId, agentId } = {}) {
  const where = { role: 'AGENT' };
  if (req.perms.has('reports.all') || req.perms.has('targets.manage_all')) {
    if (supervisorId) where.supervisorId = Number(supervisorId);
  } else if (req.perms.has('reports.team') || req.perms.has('targets.manage_team')) {
    where.supervisorId = req.user.id;
  } else {
    throw new HttpError(403, 'You do not have permission to see reports.');
  }
  if (agentId) where.id = Number(agentId);
  return prisma.user.findMany({
    where,
    select: { id: true, fullName: true, username: true, isActive: true, supervisorId: true, supervisor: { select: { id: true, fullName: true } } },
    orderBy: { fullName: 'asc' },
  });
}

/** Leads / visits / statuses / sales per agent between from (incl.) and end (excl.). */
export async function actualsFor(agentIds, from, end) {
  const [leads, visits, sales] = await Promise.all([
    prisma.customer.groupBy({ by: ['agentId', 'status'], where: { agentId: { in: agentIds }, createdAt: { gte: from, lt: end } }, _count: { _all: true } }),
    prisma.visit.groupBy({ by: ['agentId'], where: { agentId: { in: agentIds }, createdAt: { gte: from, lt: end } }, _count: { _all: true } }),
    // Sales = payments confirmed by finance, dated by when the customer paid.
    prisma.payment.groupBy({ by: ['agentId'], where: { agentId: { in: agentIds }, status: 'CONFIRMED', paidAt: { gte: from, lt: end } }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const map = new Map(agentIds.map((id) => [id, { leads: 0, visits: 0, hot: 0, warm: 0, cold: 0, sales: 0, revenue: 0 }]));
  leads.forEach((g) => { const a = map.get(g.agentId); a[g.status.toLowerCase()] += g._count._all; a.leads += g._count._all; });
  visits.forEach((g) => (map.get(g.agentId).visits = g._count._all));
  sales.forEach((g) => { const a = map.get(g.agentId); a.sales = g._count._all; a.revenue = g._sum.amount ?? 0; });
  return map;
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

export async function buildReport(req, query, { withRows = false } = {}) {
  const { from, to, end } = parseRange(query);
  const agents = await reportAgents(req, query);
  const ids = agents.map((a) => a.id);

  // Targets only make sense when the whole range sits inside one calendar month.
  const targetPeriod = ym(from) === ym(to) ? ym(from) : null;
  const [actuals, targets, leadRows, visitRows] = await Promise.all([
    actualsFor(ids, from, end),
    targetPeriod ? prisma.target.findMany({ where: { userId: { in: ids }, period: targetPeriod } }) : [],
    prisma.customer.findMany({
      where: { agentId: { in: ids }, createdAt: { gte: from, lt: end } },
      select: withRows
        ? { id: true, fullName: true, phone: true, altPhone: true, customerType: true, district: true, sector: true, landmark: true, latitude: true, longitude: true,
            currentIsp: true, currentIspOther: true, monthlySpend: true, satisfaction: true, status: true, stage: true, notes: true, agentId: true, createdAt: true, lastVisitAt: true }
        : { createdAt: true, currentIsp: true, district: true, status: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.visit.findMany({
      where: { agentId: { in: ids }, createdAt: { gte: from, lt: end } },
      select: withRows
        ? { id: true, createdAt: true, agentId: true, status: true, notes: true, latitude: true, longitude: true, customer: { select: { fullName: true, phone: true } } }
        : { createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  const targetBy = new Map(targets.map((t) => [t.userId, t]));

  const agentRows = agents.map((a) => {
    const x = actuals.get(a.id);
    const t = targetBy.get(a.id);
    return {
      id: a.id, name: a.fullName, username: a.username, isActive: a.isActive,
      team: a.supervisor?.fullName ?? 'Unassigned', supervisorId: a.supervisorId,
      ...x, hotRate: pct(x.hot, x.leads),
      target: t ? { leads: t.leads, visits: t.visits, sales: t.sales } : null,
      targetPct: t?.leads ? pct(x.leads, t.leads) : null,
    };
  });

  const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
  const totals = {
    leads: sum(agentRows, 'leads'), visits: sum(agentRows, 'visits'), hot: sum(agentRows, 'hot'), warm: sum(agentRows, 'warm'),
    cold: sum(agentRows, 'cold'), sales: sum(agentRows, 'sales'), revenue: sum(agentRows, 'revenue'), agents: agentRows.length,
    activeAgents: agentRows.filter((r) => r.leads + r.visits > 0).length,
    targetLeads: targetPeriod ? agentRows.reduce((s, r) => s + (r.target?.leads ?? 0), 0) : null,
    targetVisits: targetPeriod ? agentRows.reduce((s, r) => s + (r.target?.visits ?? 0), 0) : null,
    targetSales: targetPeriod ? agentRows.reduce((s, r) => s + (r.target?.sales ?? 0), 0) : null,
  };
  totals.hotRate = pct(totals.hot, totals.leads);

  // Team roll-up (company-wide view only)
  let teams = [];
  if (req.perms.has('reports.all') && !query.supervisorId && !query.agentId) {
    const byTeam = new Map();
    agentRows.forEach((r) => {
      const k = r.supervisorId ?? 0;
      const t = byTeam.get(k) ?? { supervisorId: r.supervisorId, name: r.team, agents: 0, leads: 0, visits: 0, hot: 0, warm: 0, cold: 0, sales: 0, revenue: 0, targetLeads: 0 };
      t.agents++;
      ['leads', 'visits', 'hot', 'warm', 'cold', 'sales', 'revenue'].forEach((f) => (t[f] += r[f]));
      t.targetLeads += r.target?.leads ?? 0;
      byTeam.set(k, t);
    });
    teams = [...byTeam.values()].map((t) => ({ ...t, hotRate: pct(t.hot, t.leads), targetPct: t.targetLeads ? pct(t.leads, t.targetLeads) : null }))
      .sort((a, b) => b.leads - a.leads);
  }

  // Trend: per day for ranges up to 62 days, otherwise per week (Monday).
  const days = Math.round((end - from) / DAY);
  const weekly = days > 62;
  const bucket = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    if (weekly) x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return ymd(x);
  };
  const series = new Map();
  for (let d = new Date(from); d < end; d = new Date(d.getTime() + (weekly ? 7 : 1) * DAY)) series.set(bucket(d), { date: bucket(d), leads: 0, visits: 0, hot: 0 });
  leadRows.forEach((c) => { const b = series.get(bucket(c.createdAt)); if (b) { b.leads++; if (c.status === 'HOT') b.hot++; } });
  visitRows.forEach((v) => { const b = series.get(bucket(v.createdAt)); if (b) b.visits++; });

  const count = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
  const districts = Object.entries(count(leadRows, 'district')).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));

  let scopeLabel = 'All teams';
  if (query.agentId && agents[0]) scopeLabel = agents[0].fullName;
  else if (query.supervisorId) scopeLabel = `Team of ${agents[0]?.supervisor?.fullName ?? '—'}`;
  else if (!req.perms.has('reports.all')) scopeLabel = `Team of ${req.user.fullName}`;

  const report = {
    range: { from: ymd(from), to: ymd(to), days, granularity: weekly ? 'week' : 'day' },
    scopeLabel, targetPeriod, totals, agents: agentRows, teams,
    trend: [...series.values()], isp: count(leadRows, 'currentIsp'), districts,
  };
  if (withRows) {
    const nameOf = new Map(agentRows.map((a) => [a.id, a]));
    report.customers = leadRows.map((c) => ({ ...c, agentName: nameOf.get(c.agentId)?.name, team: nameOf.get(c.agentId)?.team }));
    report.visits = visitRows.map((v) => ({ ...v, agentName: nameOf.get(v.agentId)?.name }));
  }
  return report;
}
