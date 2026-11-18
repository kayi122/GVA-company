import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, UserCheck, LogIn, Network, ArrowRight, UserPlus, CalendarDays, Wallet, Wrench, Boxes, BarChart3, Target, Flame, Footprints, BadgeDollarSign,
} from 'lucide-react';
import { api, useAuth, ROLE_META, ROLES, timeAgo } from '../lib.jsx';
import { Avatar, Card, RoleBadge, Spinner, cx } from '../components/ui.jsx';
import { STATUS_META, StatusPill, PURPOSES, fmtTime } from '../components/customer-ui.jsx';
import { Ring } from '../components/charts.jsx';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Hero({ user, children }) {
  return (
    <div className="hero-glow relative overflow-hidden rounded-2xl px-6 py-7 text-white sm:px-8">
      <div className="label-caps text-lime-brand">{ROLE_META[user.role]?.label}</div>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
        {greeting()}, {user.fullName.split(' ')[0]}
      </h1>
      <p className="mt-1.5 text-sm text-slate-300">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        {user.supervisor && <> · Team of {user.supervisor.fullName}</>}
      </p>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone = 'olive' }) {
  const tones = {
    olive: 'bg-olive-50 text-olive-600 dark:bg-olive-500/10 dark:text-lime-brand',
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
  };
  return (
    <Card className="p-5">
      <div className={`inline-flex rounded-xl p-2.5 ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-4 text-3xl font-extrabold tracking-tight">{value ?? '—'}</div>
      <div className="mt-0.5 text-sm text-slate-500">{label}</div>
    </Card>
  );
}

function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState(null);
  useEffect(() => {
    api('/users/stats').then(setStats).catch(() => {});
    api('/admin/audit?limit=8').then((d) => setLogs(d.logs)).catch(() => setLogs([]));
  }, []);
  const max = stats ? Math.max(...Object.values(stats.roles), 1) : 1;
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Users} label="Total users" value={stats?.total} />
        <Stat icon={UserCheck} label="Active accounts" value={stats?.active} tone="sky" />
        <Stat icon={Network} label="Sales agents" value={stats?.roles.AGENT} tone="violet" />
        <Stat icon={LogIn} label="Sign-ins (24h)" value={stats?.logins24h} tone="amber" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Users by role</h2>
            <Link to="/users" className="inline-flex items-center gap-1 text-sm font-semibold text-olive-600">Manage <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="mt-5 space-y-4">
            {ROLES.map((r) => (
              <div key={r}>
                <div className="flex justify-between text-sm">
                  <span>{ROLE_META[r].label}</span>
                  <span className="font-semibold">{stats?.roles[r] ?? '—'}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-white/10">
                  <div className="h-2 rounded-full bg-olive-600 transition-all duration-700" style={{ width: `${((stats?.roles[r] ?? 0) / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Recent activity</h2>
            <Link to="/audit" className="inline-flex items-center gap-1 text-sm font-semibold text-olive-600">View all <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {!logs ? (
            <div className="flex justify-center py-10 text-olive-600"><Spinner /></div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100 dark:divide-white/5">
              {logs.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3">
                  <Avatar name={l.user?.fullName ?? '?'} size="h-8 w-8 text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      <span className="font-semibold">{l.user?.fullName ?? 'Unknown'}</span>{' '}
                      <span className="text-slate-500">{l.action.replaceAll('_', ' ').toLowerCase()}</span>
                    </div>
                    {l.details && <div className="truncate text-xs text-slate-400">{l.details}</div>}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function useSummary(enabled) {
  const [s, setS] = useState(null);
  useEffect(() => {
    if (enabled) api('/customers/summary').then(setS).catch(() => {});
  }, [enabled]);
  return s;
}

function UpcomingVisits({ items, showAgent }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Next visits</h2>
        <Link to="/calendar" className="inline-flex items-center gap-1 text-sm font-semibold text-olive-600">Calendar <ArrowRight className="h-4 w-4" /></Link>
      </div>
      {!items ? (
        <div className="flex justify-center py-8 text-olive-600"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No visits booked.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
          {items.map((a) => {
            const overdue = new Date(a.scheduledAt) < new Date();
            return (
              <li key={a.id}>
                <Link to={`/customers/${a.customer.id}`} className="flex items-center gap-3 py-3">
                  <div className={cx('w-16 shrink-0 text-xs font-bold', overdue ? 'text-rose-600' : 'text-olive-700 dark:text-lime-brand')}>
                    {new Date(a.scheduledAt).toLocaleDateString(undefined, { weekday: 'short' })}<br />{fmtTime(a.scheduledAt)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{a.customer.fullName}</div>
                    <div className="truncate text-xs text-slate-500">{PURPOSES[a.purpose]} · {[a.customer.sector, a.customer.district].filter(Boolean).join(', ')}{showAgent && ` · ${a.agent.fullName}`}</div>
                  </div>
                  <StatusPill status={a.customer.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PipelineBar({ status, total }) {
  return (
    <Card className="p-6">
      <h2 className="font-bold">Pipeline</h2>
      <p className="text-sm text-slate-500">{total ?? '—'} leads in total</p>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        {status && ['HOT', 'WARM', 'COLD'].map((s) => (
          <div key={s} className={cx(STATUS_META[s].dot, 'transition-all duration-700')} style={{ width: `${total ? (status[s] / total) * 100 : 0}%` }} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {['HOT', 'WARM', 'COLD'].map((s) => {
          const Icon = STATUS_META[s].icon;
          return (
            <Link key={s} to={`/customers?status=${s}`} className="rounded-xl border border-slate-100 p-3 hover:border-slate-300 dark:border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Icon className="h-3.5 w-3.5" />{STATUS_META[s].label}</div>
              <div className="mt-1 text-2xl font-extrabold">{status?.[s] ?? '—'}</div>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}


function TargetCard() {
  const [t, setT] = useState(null);
  useEffect(() => { api('/targets/me').then(setT).catch(() => setT({ scope: 'none' })); }, []);
  if (!t || t.scope === 'none') return null;
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  const title = `${t.scope === 'me' ? 'My' : t.scope === 'team' ? 'Team' : 'Company'} target for ${month}`;
  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">{title}</h2>
        <span className="text-sm text-slate-500">
          {Math.round(t.elapsed * 100)}% of the month passed
          {t.agentsOnTrack != null && <> · <b className="text-slate-800 dark:text-slate-100">{t.agentsOnTrack}/{t.agentsWithTarget}</b> agents on track</>}
        </span>
      </div>
      {!t.target ? (
        <p className="mt-3 text-sm text-slate-500">No target set for this month yet.</p>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Ring label="New leads" value={t.actual.leads} target={t.target.leads} elapsed={t.elapsed} />
          <Ring label="Visits" value={t.actual.visits} target={t.target.visits} elapsed={t.elapsed} />
          <Ring label="Sales" value={t.actual.sales} target={t.target.sales} elapsed={t.elapsed} />
        </div>
      )}
    </Card>
  );
}

function AgentHome() {
  const s = useSummary(true);
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
        <Link to="/customers/new" className="group flex items-center gap-4 rounded-2xl bg-olive-600 p-5 text-white shadow-lg shadow-olive-700/20 transition hover:bg-olive-700 active:scale-[0.98]">
          <span className="rounded-xl bg-white/15 p-3"><UserPlus className="h-6 w-6" /></span>
          <span><span className="block text-base font-bold sm:text-lg">New customer</span><span className="hidden text-sm text-white/80 sm:block">Record a conversation</span></span>
        </Link>
        <Link to="/calendar" className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 active:scale-[0.98] dark:border-white/10 dark:bg-white/5">
          <span className="rounded-xl bg-olive-50 p-3 text-olive-600 dark:bg-olive-500/10 dark:text-lime-brand"><CalendarDays className="h-6 w-6" /></span>
          <span><span className="block text-base font-bold sm:text-lg">My visits</span><span className="hidden text-sm text-slate-500 sm:block">{s ? `${s.upcoming.length} coming up` : '…'}</span></span>
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={UserPlus} label="New today" value={s?.newToday} />
        <Stat icon={Footprints} label="Visits today" value={s?.visitsToday} tone="sky" />
        <Stat icon={Flame} label="Hot customers" value={s?.status.HOT} tone="amber" />
        <Stat icon={Target} label="New this month" value={s?.newMonth} tone="violet" />
      </div>
      <TargetCard />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingVisits items={s?.upcoming} />
        <PipelineBar status={s?.status} total={s?.total} />
      </div>
    </>
  );
}

function TeamPipeline({ title }) {
  const s = useSummary(true);
  const [sort, setSort] = useState('HOT');
  const agents = [...(s?.agents ?? [])].sort((a, b) => b[sort] - a[sort]);
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={UserPlus} label="New leads today" value={s?.newToday} />
        <Stat icon={Footprints} label="Visits today" value={s?.visitsToday} tone="sky" />
        <Stat icon={Network} label="New this week" value={s?.newWeek} tone="violet" />
        <Stat icon={Flame} label="Hot customers" value={s?.status.HOT} tone="amber" />
      </div>
      <TargetCard />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PipelineBar status={s?.status} total={s?.total} />
        <UpcomingVisits items={s?.upcoming} showAgent />
      </div>
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
          <h2 className="font-bold">{title}</h2>
          <div className="flex gap-1 text-xs">
            {[['HOT', 'Hot'], ['WARM', 'Warm'], ['thisWeek', 'This week'], ['total', 'Total']].map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={cx('rounded-full px-2.5 py-1 font-semibold', sort === k ? 'bg-olive-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10')}>{l}</button>
            ))}
          </div>
        </div>
        {!s ? (
          <div className="flex justify-center py-10 text-olive-600"><Spinner /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="label-caps text-slate-400">
                <tr className="border-b border-slate-100 dark:border-white/10">
                  <th className="px-6 py-2.5 text-left font-semibold">Agent</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Hot</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Warm</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Cold</th>
                  <th className="px-3 py-2.5 text-right font-semibold">This week</th>
                  <th className="px-6 py-2.5 text-right font-semibold">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {agents.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                    <td className="px-6 py-2.5">
                      <Link to={`/customers?agentId=${a.id}`} className="flex items-center gap-3 font-medium hover:underline">
                        <Avatar name={a.fullName} size="h-7 w-7 text-[10px]" /> {a.fullName}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-rose-600">{a.HOT}</td>
                    <td className="px-3 py-2.5 text-right text-amber-600">{a.WARM}</td>
                    <td className="px-3 py-2.5 text-right text-sky-600">{a.COLD}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{a.thisWeek}</td>
                    <td className="px-6 py-2.5 text-right text-xs text-slate-400">{timeAgo(a.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** "Things waiting for you" — one tile per step this user is responsible for. */
function WorkQueue() {
  const { can } = useAuth();
  const [tiles, setTiles] = useState([]);
  useEffect(() => {
    const jobs = [];
    if (can('payments.confirm_supervisor', 'payments.confirm_finance', 'payments.record')) {
      jobs.push(api('/payments/summary').then((s) => {
        const t = [];
        if (can('payments.confirm_supervisor') && !can('payments.confirm_finance')) t.push({ to: '/payments', icon: Wallet, n: s.counts.PENDING_SUPERVISOR, label: 'Payments to confirm', urgent: true });
        if (can('payments.confirm_finance')) {
          t.push({ to: '/payments', icon: Wallet, n: s.counts.PENDING_FINANCE, label: 'Payments to reconfirm', urgent: true });
          t.push({ to: '/payments', icon: BadgeDollarSign, n: `${Math.round(s.monthRevenue / 1000).toLocaleString()}k`, label: `Revenue this month (${s.monthSales} sales)` });
        }
        if (can('payments.record') && !can('payments.confirm_supervisor')) {
          t.push({ to: '/payments', icon: Wallet, n: s.counts.PENDING_SUPERVISOR + s.counts.PENDING_FINANCE, label: 'My payments being checked' });
          if (s.counts.REJECTED) t.push({ to: '/payments', icon: Wallet, n: s.counts.REJECTED, label: 'Rejected — fix and resend', urgent: true });
        }
        return t;
      }));
    }
    if (can('installs.assign')) {
      jobs.push(Promise.all([api('/installations'), api('/inventory')]).then(([{ installations: l }, { items }]) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today.getTime() + 864e5);
        return [
          { to: '/installations', icon: Wrench, n: l.filter((i) => i.status === 'PENDING').length, label: 'Installations to assign', urgent: true },
          { to: '/installations', icon: CalendarDays, n: l.filter((i) => ['SCHEDULED', 'IN_PROGRESS'].includes(i.status) && new Date(i.scheduledAt) < tomorrow).length, label: 'Installations today' },
          { to: '/installations', icon: Wrench, n: l.filter((i) => i.status === 'ON_HOLD').length, label: 'On hold', urgent: true },
          { to: '/inventory', icon: Boxes, n: items.filter((i) => i.low).length, label: 'Stock items running low', urgent: true },
        ];
      }));
    }
    Promise.all(jobs).then((r) => setTiles(r.flat())).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!tiles.length) return null;
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((t) => {
        const hot = t.urgent && Number(t.n) > 0;
        return (
          <Link key={t.label} to={t.to} className={cx('rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md', hot ? 'border-olive-600 bg-olive-600 text-white shadow-lg shadow-olive-700/20' : 'border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]')}>
            <t.icon className={cx('h-5 w-5', hot ? 'text-white/80' : 'text-olive-600')} />
            <div className="mt-3 text-3xl font-extrabold tracking-tight">{t.n}</div>
            <div className={cx('mt-0.5 text-sm', hot ? 'text-white/85' : 'text-slate-500')}>{t.label}</div>
          </Link>
        );
      })}
    </div>
  );
}

function TechHome() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => { api('/installations').then((d) => setJobs(d.installations)).catch(() => setJobs([])); }, []);
  if (!jobs) return <div className="flex justify-center py-10 text-olive-600"><Spinner /></div>;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 864e5);
  const todays = jobs.filter((j) => ['SCHEDULED', 'IN_PROGRESS'].includes(j.status) && new Date(j.scheduledAt) < tomorrow).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const done = jobs.filter((j) => j.status === 'COMPLETED' && new Date(j.completedAt) >= new Date(today.getFullYear(), today.getMonth(), 1)).length;
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat icon={Wrench} label="Jobs today" value={todays.length} />
        <Stat icon={BadgeDollarSign} label="Installed this month" value={done} tone="sky" />
      </div>
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Today's jobs</h2>
          <Link to="/installations" className="inline-flex items-center gap-1 text-sm font-semibold text-olive-600">All jobs <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {todays.length === 0 ? <p className="mt-3 text-sm text-slate-500">No installations today.</p> : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
            {todays.map((j) => (
              <li key={j.id}>
                <Link to={`/installations/${j.id}`} className="flex items-center gap-4 py-3">
                  <span className="w-14 text-sm font-bold text-olive-700 dark:text-lime-brand">{fmtTime(j.scheduledAt)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{j.customer.fullName}</span><span className="block truncate text-xs text-slate-500">{[j.customer.sector, j.customer.district].filter(Boolean).join(', ')}</span></span>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const isAgent = can('customers.view_own') && !can('customers.view_team', 'customers.view_all');
  return (
    <div className="animate-fade-up">
      <Hero user={user}>
        <div className="mt-4"><RoleBadge role={user.role} /></div>
      </Hero>
      {can('users.view') && <AdminDashboard />}
      <WorkQueue />
      {can('installs.complete') && !can('installs.assign') && <TechHome />}
      {isAgent && <AgentHome />}
      {can('customers.view_team') && !can('customers.view_all') && <TeamPipeline title="My agents" />}
      {can('customers.view_all') && <TeamPipeline title="All agents" />}
    </div>
  );
}
