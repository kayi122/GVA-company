import { useEffect, useState } from 'react';
import { Search, ScrollText } from 'lucide-react';
import { api } from '../lib.jsx';
import { Avatar, Card, Empty, Input, PageHeader, RoleBadge, Spinner, cx } from '../components/ui.jsx';

const TONE = {
  LOGIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  LOGIN_FAILED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  USER_DISABLED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  PERMISSION_CHANGED: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  PASSWORD_RESET: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
};

export default function Audit() {
  const [logs, setLogs] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      api(`/admin/audit?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((d) => setLogs(d.logs)).catch(() => setLogs([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Audit log" subtitle="Every sign-in, account change and permission change, newest first." />
      <Card>
        <div className="border-b border-slate-100 p-4 dark:border-white/10">
          <div className="max-w-sm">
            <Input icon={Search} placeholder="Search action, details or person" value={q} onChange={(e) => setQ(e.target.value)} className="h-10" />
          </div>
        </div>
        {!logs ? (
          <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div>
        ) : logs.length === 0 ? (
          <Empty icon={ScrollText} title="No activity yet" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="flex min-w-[220px] flex-1 items-center gap-3">
                  <Avatar name={l.user?.fullName ?? '?'} size="h-8 w-8 text-[11px]" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {l.user?.fullName ?? 'Unknown user'} {l.user && <RoleBadge role={l.user.role} />}
                    </div>
                    <div className="truncate text-xs text-slate-500">{l.details}</div>
                  </div>
                </div>
                <span className={cx('rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold', TONE[l.action] ?? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300')}>
                  {l.action}
                </span>
                <div className="w-44 text-right text-xs text-slate-400">
                  {new Date(l.createdAt).toLocaleString()}
                  {l.ip && <div className="font-mono">{l.ip}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
