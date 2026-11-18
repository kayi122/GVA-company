import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays, Phone, MapPin, Check, Clock, AlertTriangle } from 'lucide-react';
import { api, useAuth } from '../lib.jsx';
import { Button, Card, Empty, PageHeader, Spinner, cx, useToast } from '../components/ui.jsx';
import { STATUS_META, StatusPill, PURPOSES, fmtPhone, fmtTime, fmtDateTime } from '../components/customer-ui.jsx';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function Calendar() {
  const { user, can } = useAuth();
  const toast = useToast();
  const isAgent = !can('customers.view_team', 'customers.view_all');
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selected, setSelected] = useState(() => new Date());
  const [items, setItems] = useState(null);
  const [overdue, setOverdue] = useState([]);

  // grid: Monday-first, 6 weeks
  const days = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [month]);

  const load = useCallback(() => {
    const from = days[0];
    const to = new Date(days[41]); to.setDate(to.getDate() + 1);
    api(`/appointments?from=${from.toISOString()}&to=${to.toISOString()}`).then((d) => setItems(d.appointments)).catch((e) => toast(e.message, 'error'));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    api(`/appointments?from=${new Date(Date.now() - 30 * 864e5).toISOString()}&to=${today.toISOString()}`)
      .then((d) => setOverdue(d.appointments.filter((a) => a.status === 'SCHEDULED')))
      .catch(() => {});
  }, [days, toast]);
  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m = {};
    (items ?? []).forEach((a) => { if (a.status !== 'CANCELLED') (m[dayKey(new Date(a.scheduledAt))] ??= []).push(a); });
    return m;
  }, [items]);
  const dayItems = byDay[dayKey(selected)] ?? [];

  const setStatus = async (a, status) => {
    try {
      await api(`/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      toast(status === 'DONE' ? 'Marked as done' : 'Marked as missed');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const shift = (n) => setMonth((m) => { const d = new Date(m); d.setMonth(d.getMonth() + n); return d; });
  const today = new Date();

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={isAgent ? 'My visits' : 'Visits calendar'}
        subtitle={isAgent ? 'Your booked return visits. You get a reminder one hour before each one.' : user.role === 'SUPERVISOR' ? 'Return visits booked by your agents.' : 'Return visits booked by all agents.'}
      />

      {overdue.length > 0 && (
        <Card className="mb-6 border-rose-200 p-5 dark:border-rose-500/30">
          <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300"><AlertTriangle className="h-5 w-5" /> {overdue.length} past visit{overdue.length > 1 && 's'} not closed</div>
          <p className="text-sm text-slate-500">Open the customer and log the visit, or mark it as missed.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {overdue.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link to={`/customers/${a.customer.id}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium hover:border-rose-300 dark:border-white/10">
                  <span className={cx('h-2 w-2 rounded-full', STATUS_META[a.customer.status].dot)} />
                  {a.customer.fullName} · {fmtDateTime(a.scheduledAt)}{!isAgent && ` · ${a.agent.fullName}`}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-4 sm:p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setMonth(d); setSelected(new Date()); }}>Today</Button>
              <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => shift(-1)} aria-label="Previous month" />
              <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => shift(1)} aria-label="Next month" />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_NAMES.map((d) => <div key={d} className="label-caps pb-2 text-slate-400">{d}</div>)}
            {days.map((d) => {
              const list = byDay[dayKey(d)] ?? [];
              const inMonth = d.getMonth() === month.getMonth();
              const isSel = sameDay(d, selected);
              const isToday = sameDay(d, today);
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => setSelected(d)}
                  className={cx(
                    'flex aspect-square flex-col items-center justify-start gap-1 rounded-xl p-1 pt-1.5 text-sm transition sm:aspect-[4/3]',
                    isSel ? 'bg-olive-600 text-white' : isToday ? 'bg-olive-50 font-bold text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand' : 'hover:bg-slate-100 dark:hover:bg-white/5',
                    !inMonth && !isSel && 'text-slate-300 dark:text-slate-600'
                  )}
                >
                  <span className="font-semibold">{d.getDate()}</span>
                  {list.length > 0 && (
                    <span className="flex flex-wrap justify-center gap-0.5">
                      {list.slice(0, 4).map((a) => (
                        <span key={a.id} className={cx('h-1.5 w-1.5 rounded-full', isSel ? 'bg-white' : STATUS_META[a.customer.status].dot, a.status !== 'SCHEDULED' && 'opacity-40')} />
                      ))}
                      {list.length > 4 && <span className={cx('text-[9px] leading-none', isSel ? 'text-white' : 'text-slate-400')}>+{list.length - 4}</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            {['HOT', 'WARM', 'COLD'].map((s) => <span key={s} className="flex items-center gap-1.5"><span className={cx('h-2 w-2 rounded-full', STATUS_META[s].dot)} />{STATUS_META[s].label} customer</span>)}
          </div>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-bold">{selected.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p className="text-sm text-slate-500">{dayItems.length} visit{dayItems.length !== 1 && 's'}</p>
          {!items ? (
            <div className="flex justify-center py-12 text-olive-600"><Spinner /></div>
          ) : dayItems.length === 0 ? (
            <Empty icon={CalendarDays} title="Nothing booked" text="Book a return visit from a customer's page." />
          ) : (
            <ul className="mt-4 space-y-3">
              {dayItems.map((a) => {
                const mine = a.agent.id === user.id || can('customers.view_all');
                const done = a.status !== 'SCHEDULED';
                return (
                  <li key={a.id} className={cx('rounded-xl border border-slate-100 p-3.5 dark:border-white/10', done && 'opacity-60')}>
                    <div className="flex items-start gap-3">
                      <div className="w-14 shrink-0 text-sm font-bold text-olive-700 dark:text-lime-brand">{fmtTime(a.scheduledAt)}</div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/customers/${a.customer.id}`} className="font-semibold hover:underline">{a.customer.fullName}</Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <StatusPill status={a.customer.status} />
                          <span>{PURPOSES[a.purpose]}</span>
                          {done && <span className="font-semibold uppercase">· {a.status.toLowerCase()}</span>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          <a href={`tel:${a.customer.phone}`} className="inline-flex items-center gap-1 hover:text-olive-600"><Phone className="h-3 w-3" />{fmtPhone(a.customer.phone)}</a>
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[a.customer.sector, a.customer.district].filter(Boolean).join(', ')}</span>
                          {!isAgent && <span>· {a.agent.fullName}</span>}
                        </div>
                      </div>
                    </div>
                    {!done && mine && can('customers.create') && (
                      <div className="mt-3 flex gap-2 pl-[68px]">
                        <Link to={`/customers/${a.customer.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-olive-600 px-3 text-xs font-semibold text-white hover:bg-olive-700"><Check className="h-3.5 w-3.5" /> Log visit</Link>
                        <Button size="sm" variant="ghost" icon={Clock} className="!h-8 text-xs" onClick={() => setStatus(a, 'MISSED')}>Missed</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
