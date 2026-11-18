import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Phone, Camera, Clock, Wrench, Map as MapIcon, ChevronRight } from 'lucide-react';
import { api, useAuth, timeAgo } from '../lib.jsx';
import { Card, Empty, PageHeader, Select, Spinner, cx, useToast } from '../components/ui.jsx';
import { INSTALL_STATUS, Pill } from '../components/pipeline-ui.jsx';
import { fmtDateTime, fmtTime, fmtPhone, mapsUrl } from '../components/customer-ui.jsx';

const COLUMNS = [
  { key: 'waiting', title: 'Waiting for a technician', match: (i) => i.status === 'PENDING' || i.status === 'ON_HOLD' },
  { key: 'scheduled', title: 'Scheduled', match: (i) => i.status === 'SCHEDULED' },
  { key: 'progress', title: 'In progress', match: (i) => i.status === 'IN_PROGRESS' },
  { key: 'done', title: 'Installed (30 days)', match: (i) => i.status === 'COMPLETED' },
];

export default function Installations() {
  const { can } = useAuth();
  const toast = useToast();
  const ops = can('installs.assign', 'customers.view_all');
  const [list, setList] = useState(null);
  const [techs, setTechs] = useState([]);
  const [tech, setTech] = useState('');

  useEffect(() => {
    api(`/installations${tech ? `?technicianId=${tech}` : ''}`).then((d) => setList(d.installations)).catch((e) => toast(e.message, 'error'));
  }, [tech, toast]);
  useEffect(() => { if (can('installs.assign')) api('/installations/technicians').then((d) => setTechs(d.technicians)).catch(() => {}); }, []); // eslint-disable-line

  if (!list) return <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>;
  return ops ? <Board list={list} techs={techs} tech={tech} setTech={setTech} /> : <MyJobs list={list} />;
}

function Board({ list, techs, tech, setTech }) {
  return (
    <div className="animate-fade-up">
      <PageHeader title="Installations" subtitle="Paid customers waiting for their fiber connection. Open a card to assign a technician and issue materials."
        actions={techs.length > 0 && (
          <Select value={tech} onChange={(e) => setTech(e.target.value)} className="h-11 w-auto" aria-label="Technician">
            <option value="">All technicians</option>
            {techs.map((t) => <option key={t.id} value={t.id}>{t.fullName} · {t.openJobs} open</option>)}
          </Select>
        )} />
      {techs.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {techs.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="truncate text-sm font-semibold">{t.fullName}</div>
              <div className="mt-1 text-xs text-slate-500"><b className="text-slate-800 dark:text-slate-100">{t.today}</b> today · {t.openJobs} open</div>
            </Card>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = list.filter(col.match);
          return (
            <div key={col.key} className="rounded-2xl bg-slate-100/70 p-3 dark:bg-white/[0.03]">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-bold">{col.title}</h2>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((i) => (
                  <Link key={i.id} to={`/installations/${i.id}`} className="block rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition hover:border-olive-500 dark:border-white/10 dark:bg-[#0d1630]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold">{i.customer.fullName}</div>
                      <span className="font-mono text-[11px] text-slate-400">#{i.id}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{[i.customer.sector, i.customer.district].filter(Boolean).join(', ')}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-olive-50 px-1.5 py-0.5 font-semibold text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand">{i.payment.package.name}</span>
                      {i.status === 'ON_HOLD' && <Pill meta={INSTALL_STATUS.ON_HOLD} />}
                    </div>
                    <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-white/10">
                      {i.status === 'PENDING' ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> paid {timeAgo(i.payment.paidAt)}</span>
                        : i.status === 'COMPLETED' ? <span>{i.technician?.fullName} · {timeAgo(i.completedAt)} · <Camera className="inline h-3 w-3" /> {i._count.photos}</span>
                          : <span><b className="text-slate-700 dark:text-slate-200">{i.scheduledAt && fmtDateTime(i.scheduledAt)}</b> · {i.technician?.fullName}</span>}
                    </div>
                  </Link>
                ))}
                {items.length === 0 && <div className="py-6 text-center text-xs text-slate-400">Nothing here</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MyJobs({ list }) {
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 864e5);
    const open = list.filter((i) => ['SCHEDULED', 'IN_PROGRESS'].includes(i.status)).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return [
      ['Today', open.filter((i) => new Date(i.scheduledAt) < tomorrow)],
      ['Coming up', open.filter((i) => new Date(i.scheduledAt) >= tomorrow)],
      ['On hold', list.filter((i) => i.status === 'ON_HOLD')],
      ['Done (30 days)', list.filter((i) => i.status === 'COMPLETED').sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))],
    ];
  }, [list]);

  return (
    <div className="animate-fade-up mx-auto max-w-2xl">
      <PageHeader title="My jobs" subtitle="Your installations. Open a job to start it, take photos and complete it." />
      {list.length === 0 && <Card><Empty icon={Wrench} title="No jobs yet" text="Operations will assign installations to you here." /></Card>}
      {groups.map(([title, items]) => items.length > 0 && (
        <section key={title} className="mb-6">
          <h2 className="label-caps mb-2 text-slate-400">{title} · {items.length}</h2>
          <div className="space-y-3">
            {items.map((i) => (
              <Card key={i.id} className={cx('overflow-hidden', i.status === 'COMPLETED' && 'opacity-70')}>
                <Link to={`/installations/${i.id}`} className="flex items-center gap-4 p-4">
                  <div className={cx('w-16 shrink-0 text-center', i.status === 'IN_PROGRESS' ? 'text-violet-600' : 'text-olive-700 dark:text-lime-brand')}>
                    {i.status === 'COMPLETED' ? <span className="text-xs font-semibold text-emerald-600">Done</span> : (
                      <>
                        <div className="text-lg font-extrabold leading-none">{i.scheduledAt ? fmtTime(i.scheduledAt) : '—'}</div>
                        <div className="mt-1 text-[11px] font-semibold">{i.scheduledAt && new Date(i.scheduledAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</div>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 border-l border-slate-100 pl-4 dark:border-white/10">
                    <div className="flex items-center gap-2"><span className="truncate font-bold">{i.customer.fullName}</span>{i.status === 'IN_PROGRESS' && <Pill meta={INSTALL_STATUS.IN_PROGRESS} />}</div>
                    <div className="truncate text-sm text-slate-500">{[i.customer.sector, i.customer.district].filter(Boolean).join(', ')}{i.customer.landmark && ` · ${i.customer.landmark}`}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{i.payment.package.name}</div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                </Link>
                {i.status !== 'COMPLETED' && (
                  <div className="grid grid-cols-2 border-t border-slate-100 text-sm font-semibold dark:border-white/10">
                    <a href={`tel:${i.customer.phone}`} className="flex items-center justify-center gap-2 py-2.5 text-olive-700 hover:bg-slate-50 dark:text-lime-brand dark:hover:bg-white/5"><Phone className="h-4 w-4" /> {fmtPhone(i.customer.phone)}</a>
                    <a href={i.customer.latitude != null ? mapsUrl(i.customer.latitude, i.customer.longitude) : undefined} target="_blank" rel="noreferrer"
                      className={cx('flex items-center justify-center gap-2 border-l border-slate-100 py-2.5 text-sky-700 dark:border-white/10', i.customer.latitude == null ? 'pointer-events-none opacity-40' : 'hover:bg-slate-50 dark:hover:bg-white/5')}>
                      <MapIcon className="h-4 w-4" /> Directions
                    </a>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
