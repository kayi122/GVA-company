import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, UserPlus, MapPin, CalendarClock, ChevronLeft, ChevronRight, ChevronRight as Go } from 'lucide-react';
import { api, useAuth, timeAgo } from '../lib.jsx';
import { Avatar, Button, Card, Empty, Input, PageHeader, Select, Spinner, cx, useToast } from '../components/ui.jsx';
import { STATUS_META, STATUSES, ISP_META, StatusPill, IspChip, fmtPhone, fmtDateTime } from '../components/customer-ui.jsx';

export default function Customers() {
  const { user, can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [agents, setAgents] = useState([]);
  const [q, setQ] = useState(params.get('q') ?? '');
  const isAgent = !can('customers.view_team', 'customers.view_all');

  const status = params.get('status') ?? '';
  const period = params.get('period') ?? '';
  const isp = params.get('isp') ?? '';
  const agentId = params.get('agentId') ?? '';
  const page = Number(params.get('page') ?? 1);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => q !== (params.get('q') ?? '') && update({ q }), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setData((d) => (d ? { ...d, loading: true } : d));
    api(`/customers?${params.toString()}`).then(setData).catch((e) => toast(e.message, 'error'));
  }, [params, toast]);

  useEffect(() => {
    if (!isAgent) api('/customers/summary').then((d) => setAgents(d.agents)).catch(() => {});
  }, [isAgent]);

  const tabs = [['', 'All', data ? data.counts.COLD + data.counts.WARM + data.counts.HOT : 0], ...STATUSES.map((s) => [s, STATUS_META[s].label, data?.counts[s] ?? 0])];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={isAgent ? 'My customers' : 'Customers'}
        subtitle={isAgent ? 'Everyone you have talked to in the field.' : user.role === 'SUPERVISOR' ? "Your team's customers and how warm they are." : 'All customers across the sales teams.'}
        actions={can('customers.create') && <Button icon={Plus} onClick={() => navigate('/customers/new')}>New customer</Button>}
      />

      <div className="mb-4 grid grid-cols-4 gap-2 sm:flex">
        {tabs.map(([key, label, n]) => {
          const m = STATUS_META[key];
          const Icon = m?.icon;
          return (
            <button
              key={key || 'all'}
              onClick={() => update({ status: key })}
              className={cx(
                'flex flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-sm font-semibold transition sm:flex-row sm:gap-2 sm:rounded-full sm:py-1.5',
                status === key ? 'border-olive-600 bg-olive-600 text-white' : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
              )}
            >
              <span className="flex items-center gap-1.5">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</span>
              <span className={cx('text-xs', status === key ? 'text-white/80' : 'text-slate-400')}>{n}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10">
          <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or sector" className="h-10" />
          <Select value={period} onChange={(e) => update({ period: e.target.value })} className="h-10">
            <option value="">Added any time</option>
            <option value="today">Added today</option>
            <option value="week">Added this week</option>
            <option value="month">Added this month</option>
          </Select>
          <Select value={isp} onChange={(e) => update({ isp: e.target.value })} className="h-10">
            <option value="">Any current provider</option>
            {Object.entries(ISP_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </Select>
          {!isAgent && (
            <Select value={agentId} onChange={(e) => update({ agentId: e.target.value })} className="h-10">
              <option value="">All agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.fullName}</option>)}
            </Select>
          )}
        </div>

        {!data ? (
          <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div>
        ) : data.customers.length === 0 ? (
          <Empty
            icon={UserPlus}
            title={params.toString() ? 'No customers match these filters' : 'No customers yet'}
            text={can('customers.create') ? 'Every person you talk to in the field goes here.' : undefined}
            action={can('customers.create') && !params.toString() && <Button icon={Plus} onClick={() => navigate('/customers/new')}>Add the first one</Button>}
          />
        ) : (
          <ul className={cx('divide-y divide-slate-100 transition-opacity dark:divide-white/5', data.loading && 'opacity-50')}>
            {data.customers.map((c) => (
              <li key={c.id}>
                <Link to={`/customers/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50/80 sm:gap-4 sm:px-5 dark:hover:bg-white/[0.03]">
                  <div className="relative">
                    <Avatar name={c.fullName} size="h-10 w-10 text-xs" />
                    <span className={cx('absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-[#0d1630]', STATUS_META[c.status].dot)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.fullName}</span>
                      <StatusPill status={c.status} className="hidden sm:inline-flex" />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{fmtPhone(c.phone)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[c.sector, c.district].filter(Boolean).join(', ')}</span>
                      <IspChip isp={c.currentIsp} other={c.currentIspOther} />
                      {!isAgent && <span>· {c.agent.fullName}</span>}
                    </div>
                  </div>
                  <div className="hidden text-right text-xs sm:block">
                    {c.nextVisitAt ? (
                      <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', new Date(c.nextVisitAt) < new Date() ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-olive-50 text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand')}>
                        <CalendarClock className="h-3 w-3" /> {fmtDateTime(c.nextVisitAt)}
                      </span>
                    ) : (
                      <span className="text-slate-400">No visit booked</span>
                    )}
                    <div className="mt-1 text-slate-400">Last visit {timeAgo(c.lastVisitAt)}</div>
                  </div>
                  <Go className="h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm dark:border-white/10">
            <span className="text-slate-500">{data.total} customers · page {data.page} of {data.pages}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Prev</Button>
              <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => update({ page: String(page + 1) })}>Next <ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
