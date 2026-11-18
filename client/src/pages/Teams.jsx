import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api, useAuth, timeAgo } from '../lib.jsx';
import { Avatar, Card, PageHeader, Spinner, cx, useToast } from '../components/ui.jsx';

const TEAM_SIZE = 10;

export default function Teams() {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const manage = can('users.manage');

  const load = useCallback(() => api('/users/teams').then(setData).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const move = async (agent, supervisorId) => {
    try {
      await api(`/users/${agent.id}`, { method: 'PATCH', body: { supervisorId: supervisorId ? Number(supervisorId) : null } });
      toast(`${agent.fullName} moved`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!data) return <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>;

  const AgentRow = ({ a, currentId }) => (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar name={a.fullName} size="h-8 w-8 text-[11px]" />
      <div className="min-w-0 flex-1">
        <div className={cx('truncate text-sm font-medium', !a.isActive && 'text-slate-400 line-through')}>{a.fullName}</div>
        <div className="text-xs text-slate-400">@{a.username} · {timeAgo(a.lastLoginAt)}</div>
      </div>
      {manage && (
        <select
          value={currentId ?? ''}
          onChange={(e) => move(a, e.target.value)}
          className="h-8 max-w-[8.5rem] rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-white/5"
          aria-label={`Move ${a.fullName} to another team`}
        >
          <option value="">Unassigned</option>
          {data.supervisors.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
        </select>
      )}
    </li>
  );

  return (
    <div className="animate-fade-up">
      <PageHeader title="Teams" subtitle={`${data.supervisors.length} supervisors · each team aims for ${TEAM_SIZE} agents. Use the menu next to an agent to move them.`} />

      {data.unassigned.length > 0 && (
        <Card className="mb-6 border-amber-200 p-5 dark:border-amber-500/30">
          <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-5 w-5" /> {data.unassigned.length} agent{data.unassigned.length > 1 && 's'} without a supervisor
          </div>
          <ul className="mt-2 grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.unassigned.map((a) => <AgentRow key={a.id} a={a} currentId={null} />)}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {data.supervisors.map((s) => {
          const n = s.agents.length;
          const pct = Math.min(100, (n / TEAM_SIZE) * 100);
          return (
            <Card key={s.id} className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={s.fullName} size="h-11 w-11 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{s.fullName}</div>
                  <div className="text-xs text-slate-500">Supervisor · @{s.username}</div>
                </div>
                <div className={cx('text-sm font-bold', n > TEAM_SIZE ? 'text-amber-600' : 'text-olive-600')}>{n}/{TEAM_SIZE}</div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-slate-100 dark:bg-white/10">
                <div className={cx('h-1.5 rounded-full', n > TEAM_SIZE ? 'bg-amber-500' : 'bg-olive-600')} style={{ width: `${pct}%` }} />
              </div>
              <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/5">
                {s.agents.map((a) => <AgentRow key={a.id} a={a} currentId={s.id} />)}
                {n === 0 && <li className="py-6 text-center text-sm text-slate-400">No agents yet</li>}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
