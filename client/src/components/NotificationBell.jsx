import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CalendarClock, CheckCheck } from 'lucide-react';
import { api, timeAgo } from '../lib.jsx';
import { cx } from './ui.jsx';

const POLL_MS = 30_000;

export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const seen = useRef(null);
  const box = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await api('/notifications');
      // pop a system notification for new reminders (not on first load)
      if (seen.current !== null && perm === 'granted') {
        d.items.filter((n) => n.id > seen.current && !n.readAt).forEach((n) => {
          try { new Notification(n.title, { body: n.body ?? '', icon: '/favicon.svg', tag: `gva-${n.id}` }); } catch {}
        });
      }
      seen.current = Math.max(seen.current ?? 0, ...d.items.map((n) => n.id), 0);
      setData(d);
    } catch {}
  }, [perm]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !box.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    load();
    if (n.link) navigate(n.link);
  };
  const readAll = async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
    load();
  };
  const enablePopups = async () => setPerm(await Notification.requestPermission());

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
      >
        {data.unread ? <BellRing className="h-[18px] w-[18px]" /> : <Bell className="h-[18px] w-[18px]" />}
        {data.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-slate-50 dark:ring-[#0a1226]">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-up fixed inset-x-3 top-16 z-40 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[22rem] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#101a33]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <span className="font-bold">Notifications</span>
            {data.unread > 0 && (
              <button onClick={readAll} className="inline-flex items-center gap-1 text-xs font-semibold text-olive-600"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>
            )}
          </div>
          {perm === 'default' && (
            <button onClick={enablePopups} className="w-full bg-olive-50 px-4 py-2.5 text-left text-xs font-medium text-olive-700 hover:bg-olive-100 dark:bg-olive-500/10 dark:text-lime-brand">
              Turn on pop-up alerts so you see visit reminders even when this tab is in the background →
            </button>
          )}
          <ul className="max-h-96 overflow-y-auto">
            {data.items.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-400">No notifications yet</li>}
            {data.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-white/5', !n.readAt && 'bg-olive-50/50 dark:bg-olive-500/5')}>
                  <span className="mt-0.5 rounded-lg bg-olive-100 p-1.5 text-olive-700 dark:bg-olive-500/15 dark:text-lime-brand"><CalendarClock className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block text-sm', !n.readAt && 'font-semibold')}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-slate-500">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
                  </span>
                  {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-olive-600" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
