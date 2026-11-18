import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Save, Copy, Wand2 } from 'lucide-react';
import { api, useAuth } from '../lib.jsx';
import { Avatar, Button, Card, PageHeader, Select, Spinner, cx, useToast } from '../components/ui.jsx';

const FIELDS = [['leads', 'New leads'], ['visits', 'Visits'], ['sales', 'Sales']];
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (period, n) => { const [y, m] = period.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); };
const monthLabel = (period) => { const [y, m] = period.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); };

export default function Targets() {
  const { can } = useAuth();
  const toast = useToast();
  const all = can('targets.manage_all');
  const [period, setPeriod] = useState(() => monthKey(new Date()));
  const [supervisorId, setSupervisorId] = useState('');
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({}); // userId -> {leads, visits, sales}
  const [bulk, setBulk] = useState({ leads: '', visits: '', sales: '' });
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState([]);

  const load = useCallback(async () => {
    setData(null);
    try {
      const d = await api(`/targets?period=${period}${supervisorId ? `&supervisorId=${supervisorId}` : ''}`);
      setData(d);
      setDraft(Object.fromEntries(d.agents.map((a) => [a.id, { leads: a.target?.leads ?? '', visits: a.target?.visits ?? '', sales: a.target?.sales ?? '' }])));
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [period, supervisorId, toast]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!all) return;
    api('/users/teams').then((d) => setTeams(d.supervisors)).catch(() => {});
  }, [all]);

  const dirty = useMemo(() => (data?.agents ?? []).filter((a) => {
    const d = draft[a.id];
    return d && FIELDS.some(([k]) => String(d[k]) !== String(a.target?.[k] ?? ''));
  }), [data, draft]);

  const set = (id, k, v) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: v.replace(/\D/g, '').slice(0, 4) } }));
  const applyAll = () => {
    setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, row]) => [id, Object.fromEntries(FIELDS.map(([k]) => [k, bulk[k] !== '' ? bulk[k] : row[k]]))])));
  };
  const copyLast = async () => {
    try {
      const prev = await api(`/targets?period=${shiftMonth(period, -1)}${supervisorId ? `&supervisorId=${supervisorId}` : ''}`);
      const byId = new Map(prev.agents.map((a) => [a.id, a.target]));
      let n = 0;
      setDraft((d) => Object.fromEntries(Object.entries(d).map(([id, row]) => {
        const t = byId.get(Number(id));
        if (t) n++;
        return [id, t ? { leads: t.leads, visits: t.visits, sales: t.sales } : row];
      })));
      toast(n ? `Copied ${monthLabel(shiftMonth(period, -1))} targets — remember to save` : 'Last month has no targets', n ? 'success' : 'error');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const items = dirty.map((a) => ({ userId: a.id, ...Object.fromEntries(FIELDS.map(([k]) => [k, Number(draft[a.id][k] || 0)])) }));
      await api('/targets', { method: 'PUT', body: { period, items } });
      toast(`Saved targets for ${items.length} agent${items.length > 1 ? 's' : ''}`);
      await load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isPast = period < monthKey(new Date());
  const elapsed = data?.elapsed ?? 0;

  return (
    <div className="animate-fade-up pb-24">
      <PageHeader
        title="Targets"
        subtitle="Monthly goals for each agent. The team target is the total of its agents."
        actions={<Button icon={Copy} variant="secondary" onClick={copyLast}>Copy last month</Button>}
      />

      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setPeriod((p) => shiftMonth(p, -1))} aria-label="Previous month" />
          <div className="w-40 text-center font-bold">{monthLabel(period)}</div>
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setPeriod((p) => shiftMonth(p, 1))} aria-label="Next month" />
        </div>
        {data && period === monthKey(new Date()) && (
          <span className="text-sm text-slate-500">{Math.round(elapsed * 100)}% of the month has passed</span>
        )}
        {isPast && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-white/10">Past month</span>}
        {all && (
          <Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="ml-auto h-10 w-auto" aria-label="Team">
            <option value="">All teams</option>
            {teams.map((s) => <option key={s.id} value={s.id}>Team of {s.fullName}</option>)}
          </Select>
        )}
      </Card>

      <Card className="overflow-hidden">
        {!data ? (
          <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="label-caps text-slate-400">
                <tr className="border-b border-slate-100 dark:border-white/10">
                  <th className="px-6 py-3 text-left font-semibold">Agent</th>
                  {FIELDS.map(([k, l]) => <th key={k} className="px-3 py-3 text-left font-semibold">{l}</th>)}
                </tr>
                <tr className="border-b border-slate-100 bg-olive-50/60 dark:border-white/10 dark:bg-olive-500/5">
                  <td className="px-6 py-2.5 text-xs font-semibold normal-case tracking-normal text-olive-700 dark:text-lime-brand">
                    <span className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Same for everyone</span>
                  </td>
                  {FIELDS.map(([k]) => (
                    <td key={k} className="px-3 py-2.5">
                      <div className="flex gap-2">
                        <NumberBox value={bulk[k]} onChange={(v) => setBulk((b) => ({ ...b, [k]: v.replace(/\D/g, '') }))} placeholder="—" />
                        {k === 'sales' && <Button size="sm" variant="secondary" className="!h-9" onClick={applyAll}>Apply</Button>}
                      </div>
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {data.agents.map((a) => (
                  <tr key={a.id} className={cx(dirty.includes(a) && 'bg-amber-50/50 dark:bg-amber-500/5')}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.name} size="h-8 w-8 text-[11px]" />
                        <div>
                          <div className={cx('font-medium', !a.isActive && 'text-slate-400 line-through')}>{a.name}</div>
                          {all && <div className="text-xs text-slate-400">{a.team}</div>}
                        </div>
                      </div>
                    </td>
                    {FIELDS.map(([k]) => {
                      const target = Number(draft[a.id]?.[k] || 0);
                      const actual = a.actual[k];
                      const pct = target ? actual / target : 0;
                      const behind = target && period === monthKey(new Date()) && actual < target * elapsed;
                      return (
                        <td key={k} className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <NumberBox value={draft[a.id]?.[k] ?? ''} onChange={(v) => set(a.id, k, v)} aria-label={`${a.name} ${k} target`} />
                            <div className="w-24">
                              <div className="text-xs"><b>{actual}</b> <span className="text-slate-400">done</span></div>
                              {target > 0 && (
                                <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-white/10">
                                  <div className={cx('h-1.5 rounded-full', pct >= 1 ? 'bg-emerald-500' : behind ? 'bg-amber-500' : 'bg-olive-600')} style={{ width: `${Math.min(100, pct * 100)}%` }} />
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 text-xs text-slate-400">
              Bars: green = reached, olive = on track for the days passed, amber = behind. Sales = payments confirmed by finance, counted on the date the customer paid.
            </p>
          </div>
        )}
      </Card>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-72 dark:border-white/10 dark:bg-[#0a1226]/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:px-4">
            <span className="text-sm"><b>{dirty.length}</b> agent{dirty.length > 1 && 's'} changed</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={load}>Discard</Button>
              <Button icon={Save} loading={saving} onClick={save}>Save targets</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NumberBox({ value, onChange, ...rest }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      inputMode="numeric"
      className="h-9 w-16 rounded-md border border-slate-200 bg-white px-2 text-center text-sm font-semibold focus:border-olive-500 focus:outline-none focus:ring-4 focus:ring-olive-500/15 dark:border-white/10 dark:bg-white/5"
      {...rest}
    />
  );
}
