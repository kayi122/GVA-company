import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileSpreadsheet, FileText, UserPlus, Footprints, Flame, BadgeCheck, Table2, BarChart3, ArrowUpDown, Target } from 'lucide-react';
import { api, useAuth } from '../lib.jsx';
import { Avatar, Card, Input, PageHeader, Select, Spinner, cx, useToast } from '../components/ui.jsx';
import { TrendChart, BarList } from '../components/charts.jsx';
import { ISP_META } from '../components/customer-ui.jsx';

const DAY = 864e5;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(key) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const monday = new Date(t.getTime() - ((t.getDay() + 6) % 7) * DAY);
  switch (key) {
    case 'today': return [t, t];
    case 'yesterday': { const y = new Date(t.getTime() - DAY); return [y, y]; }
    case 'week': return [monday, t];
    case 'lastweek': return [new Date(monday.getTime() - 7 * DAY), new Date(monday.getTime() - DAY)];
    case 'lastmonth': return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 0)];
    case 'quarter': return [new Date(t.getFullYear(), t.getMonth() - 2, 1), t];
    default: return [new Date(t.getFullYear(), t.getMonth(), 1), t]; // month
  }
}
const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['quarter', 'Last 3 months'], ['custom', 'Custom']];

export default function Reports() {
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [teams, setTeams] = useState([]);
  const [view, setView] = useState('chart');
  const [sort, setSort] = useState({ key: 'leads', dir: -1 });
  const all = can('reports.all');

  const preset = params.get('preset') ?? 'month';
  const [pf, pt] = presetRange(preset);
  const from = preset === 'custom' ? params.get('from') ?? ymd(pf) : ymd(pf);
  const to = preset === 'custom' ? params.get('to') ?? ymd(pt) : ymd(pt);
  const supervisorId = params.get('supervisorId') ?? '';
  const agentId = params.get('agentId') ?? '';
  const query = new URLSearchParams({ from, to, ...(supervisorId && { supervisorId }), ...(agentId && { agentId }) }).toString();

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setData((d) => (d ? { ...d, loading: true } : d));
    api(`/reports/summary?${query}`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [query, toast]);

  // team list for the filter (company-wide users only)
  useEffect(() => {
    if (all) api('/reports/summary').then((d) => setTeams(d.teams.filter((t) => t.supervisorId))).catch(() => {});
  }, [all]);

  const agents = useMemo(() => {
    const rows = [...(data?.agents ?? [])];
    return rows.sort((a, b) => ((a[sort.key] ?? -1) - (b[sort.key] ?? -1)) * sort.dir || a.name.localeCompare(b.name));
  }, [data, sort]);

  const t = data?.totals;
  const SortTh = ({ k, children, className }) => (
    <th className={cx('px-3 py-2.5 font-semibold', className)}>
      <button onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : -1 }))} className={cx('inline-flex items-center gap-1 uppercase', sort.key === k && 'text-slate-700 dark:text-white')}>
        {children} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Reports"
        subtitle={data ? `${data.scopeLabel} · ${new Date(from + 'T00:00').toLocaleDateString()} – ${new Date(to + 'T00:00').toLocaleDateString()}` : 'Sales activity by day, agent and team.'}
        actions={
          <>
            <a href={`/api/reports/export.xlsx?${query}`} className="inline-flex h-11 items-center gap-2 rounded-lg bg-olive-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-olive-700">
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </a>
            <a href={`/api/reports/export.pdf?${query}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <FileText className="h-4 w-4" /> PDF
            </a>
            <a href={`/api/reports/export.pdf?${query}&inline=1`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center px-2 text-sm font-semibold text-olive-600 hover:underline">
              Preview
            </a>
          </>
        }
      />

      {/* filters — one row */}
      <Card className="mb-6 p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PRESETS.map(([k, l]) => (
            <button key={k} onClick={() => update({ preset: k === 'month' ? '' : k, ...(k === 'custom' ? { from, to } : { from: '', to: '' }) })}
              className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition', preset === k ? 'border-olive-600 bg-olive-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300')}>
              {l}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {preset === 'custom' && (
            <>
              <Input type="date" value={from} max={to} onChange={(e) => update({ from: e.target.value })} className="h-10" aria-label="From date" />
              <Input type="date" value={to} min={from} max={ymd(new Date())} onChange={(e) => update({ to: e.target.value })} className="h-10" aria-label="To date" />
            </>
          )}
          {all && (
            <Select value={supervisorId} onChange={(e) => update({ supervisorId: e.target.value, agentId: '' })} className="h-10" aria-label="Team">
              <option value="">All teams</option>
              {teams.map((tm) => <option key={tm.supervisorId} value={tm.supervisorId}>Team of {tm.name}</option>)}
            </Select>
          )}
          <Select value={agentId} onChange={(e) => update({ agentId: e.target.value })} className="h-10" aria-label="Agent">
            <option value="">All agents</option>
            {(data?.agents ?? []).concat([]).sort((a, b) => a.name.localeCompare(b.name)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
      </Card>

      {!data ? (
        <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>
      ) : (
        <div className={cx('transition-opacity', data.loading && 'opacity-50')}>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi icon={UserPlus} label="New leads" value={t.leads} target={t.targetLeads} />
            <Kpi icon={Footprints} label="Visits logged" value={t.visits} target={t.targetVisits} />
            <Kpi icon={Flame} label="Hot rate" value={t.hotRate == null ? '—' : `${t.hotRate}%`} sub={`${t.hot} hot · ${t.warm} warm · ${t.cold} cold`} />
            <Kpi icon={BadgeCheck} label="Sales (paid)" value={t.sales} target={t.targetSales} sub={`${(t.revenue ?? 0).toLocaleString()} RWF confirmed`} />
          </div>

          {/* trend */}
          <Card className="mt-6 p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Activity {data.range.granularity === 'week' ? 'per week' : 'per day'}</h2>
                <p className="text-sm text-slate-500">{t.activeAgents} of {t.agents} agents were active</p>
              </div>
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-white/10">
                {[['chart', BarChart3, 'Chart'], ['table', Table2, 'Table']].map(([k, Icon, l]) => (
                  <button key={k} onClick={() => setView(k)} aria-label={`${l} view`} className={cx('rounded-md p-1.5', view === k ? 'bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white' : 'text-slate-400')}>
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            {view === 'chart' ? (
              <TrendChart data={data.trend} weekly={data.range.granularity === 'week'} />
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="label-caps sticky top-0 bg-white text-slate-400 dark:bg-[#0d1630]"><tr><th className="py-2 text-left">{data.range.granularity === 'week' ? 'Week of' : 'Day'}</th><th className="text-right">New leads</th><th className="text-right">Visits</th><th className="text-right">Hot</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {data.trend.map((d) => <tr key={d.date}><td className="py-1.5">{new Date(d.date + 'T00:00').toLocaleDateString()}</td><td className="text-right">{d.leads}</td><td className="text-right">{d.visits}</td><td className="text-right">{d.hot}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 className="font-bold">What new leads use today</h2>
              <p className="mb-4 text-sm text-slate-500">Where our new customers would come from</p>
              {t.leads ? (
                <BarList total={t.leads} colorClass="bg-slate-500 dark:bg-slate-400"
                  rows={Object.entries(data.isp).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: ISP_META[k]?.label ?? k, value: v, swatch: ISP_META[k]?.swatch }))} />
              ) : <p className="text-sm text-slate-400">No leads in this period.</p>}
            </Card>
            <Card className="p-6">
              <h2 className="font-bold">Top districts</h2>
              <p className="mb-4 text-sm text-slate-500">New leads by district</p>
              {data.districts.length ? <BarList total={t.leads} rows={data.districts.slice(0, 6).map((d) => ({ label: d.name, value: d.n }))} /> : <p className="text-sm text-slate-400">No leads in this period.</p>}
            </Card>
          </div>

          {data.teams.length > 0 && (
            <Card className="mt-6 overflow-hidden">
              <h2 className="px-6 pt-6 font-bold">Teams</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="label-caps text-slate-400">
                    <tr className="border-b border-slate-100 dark:border-white/10">
                      <th className="px-6 py-2.5 text-left font-semibold">Team</th><th className="px-3 text-right font-semibold">Agents</th><th className="px-3 text-right font-semibold">Leads</th>
                      <th className="px-3 text-right font-semibold">Visits</th><th className="px-3 text-right font-semibold">Hot</th><th className="px-3 text-right font-semibold">Hot %</th><th className="px-6 text-left font-semibold">Target</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                    {data.teams.map((tm) => (
                      <tr key={tm.supervisorId ?? 0} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                        <td className="px-6 py-3">
                          <button onClick={() => tm.supervisorId && update({ supervisorId: String(tm.supervisorId) })} className="flex items-center gap-3 font-medium hover:underline">
                            <Avatar name={tm.name} size="h-7 w-7 text-[10px]" /> {tm.name}
                          </button>
                        </td>
                        <td className="px-3 text-right">{tm.agents}</td><td className="px-3 text-right font-semibold">{tm.leads}</td><td className="px-3 text-right">{tm.visits}</td>
                        <td className="px-3 text-right">{tm.hot}</td><td className="px-3 text-right">{tm.hotRate ?? '—'}{tm.hotRate != null && '%'}</td>
                        <td className="px-6"><Progress value={tm.leads} target={tm.targetLeads} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="mt-6 overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6">
              <h2 className="font-bold">Agents</h2>
              {can('targets.manage_team', 'targets.manage_all') && (
                <Link to="/targets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-olive-600"><Target className="h-4 w-4" /> Set targets</Link>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="label-caps text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-white/10">
                    <th className="px-6 py-2.5 text-left font-semibold">Agent</th>
                    <SortTh k="leads" className="text-right">Leads</SortTh>
                    <SortTh k="visits" className="text-right">Visits</SortTh>
                    <SortTh k="hot" className="text-right">Hot</SortTh>
                    <SortTh k="warm" className="text-right">Warm</SortTh>
                    <SortTh k="cold" className="text-right">Cold</SortTh>
                    <SortTh k="hotRate" className="text-right">Hot %</SortTh>
                    <SortTh k="targetPct" className="pr-6 text-left">Leads vs target</SortTh>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {agents.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                      <td className="px-6 py-2.5">
                        <Link to={`/customers?agentId=${a.id}`} className="flex items-center gap-3 hover:underline">
                          <Avatar name={a.name} size="h-7 w-7 text-[10px]" />
                          <span><span className="block font-medium">{a.name}</span>{all && <span className="block text-xs text-slate-400">{a.team}</span>}</span>
                        </Link>
                      </td>
                      <td className="px-3 text-right font-semibold">{a.leads}</td>
                      <td className="px-3 text-right">{a.visits}</td>
                      <td className="px-3 text-right">{a.hot}</td>
                      <td className="px-3 text-right">{a.warm}</td>
                      <td className="px-3 text-right">{a.cold}</td>
                      <td className="px-3 text-right">{a.hotRate == null ? '—' : `${a.hotRate}%`}</td>
                      <td className="py-2.5 pl-3 pr-6"><Progress value={a.leads} target={a.target?.leads} /></td>
                    </tr>
                  ))}
                  {agents.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400">No agents in this selection</td></tr>}
                </tbody>
              </table>
            </div>
            {!data.targetPeriod && <p className="px-6 pb-4 pt-2 text-xs text-slate-400">Targets are monthly. Pick a period inside one month to compare against them.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, target, sub }) {
  const pct = target ? Math.round((Number(value) / target) * 100) : null;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight">{value}</div>
      {target ? (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/10"><div className="h-1.5 rounded-full bg-olive-600" style={{ width: `${Math.min(100, pct)}%` }} /></div>
          <div className="mt-1 text-xs text-slate-500">{pct}% of target {target}</div>
        </div>
      ) : sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </Card>
  );
}

function Progress({ value, target }) {
  if (!target) return <span className="text-xs text-slate-400">No target</span>;
  const pct = Math.round((value / target) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-28 rounded-full bg-slate-100 dark:bg-white/10">
        <div className={cx('h-2 rounded-full', pct >= 100 ? 'bg-emerald-500' : 'bg-olive-600')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="w-20 text-xs text-slate-500"><b className="text-slate-800 dark:text-slate-100">{pct}%</b> of {target}</span>
    </div>
  );
}
