import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, Map as MapIcon, MapPin, Camera, Trash2, Play, CheckCircle2, PauseCircle, UserCog, Package as PackageIcon, Wand2, AlertTriangle, Router, X,
} from 'lucide-react';
import { api, timeAgo } from '../lib.jsx';
import { Avatar, Button, Card, Empty, Field, Input, Modal, Select, Spinner, cx, useToast } from '../components/ui.jsx';
import { INSTALL_STATUS, METHODS, Pill, money, uploadPhotos, photoUrl } from '../components/pipeline-ui.jsx';
import { fmtDateTime, fmtPhone, mapsUrl, toLocalInput, tomorrowAt } from '../components/customer-ui.jsx';

const MIN_PHOTOS = 2;

export default function InstallationDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(() => api(`/installations/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Empty title={error} action={<Link to="/installations" className="font-semibold text-olive-600">Back</Link>} />;
  if (!data) return <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>;
  const { installation: i, canManage, isMine } = data;
  const c = i.customer;
  const done = i.status === 'COMPLETED';

  const start = async () => {
    try { await api(`/installations/${i.id}/start`, { method: 'POST' }); toast('Job started'); load(); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="animate-fade-up mx-auto max-w-5xl pb-10">
      <Link to="/installations" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {isMine && !canManage ? 'My jobs' : 'Installations'}
      </Link>

      <Card className="overflow-hidden">
        <div className={cx('h-1.5', INSTALL_STATUS[i.status].dot)} />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{c.fullName}</h1>
              <Pill meta={INSTALL_STATUS[i.status]} />
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Installation #{i.id} · {i.payment.package.name} ({i.payment.package.speedMbps} Mbps) · {c.customerType === 'BUSINESS' ? 'Business' : 'Home'}
            </div>
            {i.scheduledAt && !done && <div className="mt-2 text-sm font-semibold text-olive-700 dark:text-lime-brand">{fmtDateTime(i.scheduledAt)}{i.technician && ` · ${i.technician.fullName}`}</div>}
            {done && <div className="mt-2 text-sm font-semibold text-emerald-600">Connected {fmtDateTime(i.completedAt)} by {i.technician?.fullName}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && !done && <Button icon={UserCog} onClick={() => setModal('assign')}>{i.technicianId ? 'Reassign' : 'Assign technician'}</Button>}
            {isMine && i.status === 'SCHEDULED' && <Button icon={Play} onClick={start}>Start job</Button>}
            {(isMine || canManage) && !done && i.status !== 'ON_HOLD' && <Button variant="secondary" icon={PauseCircle} onClick={() => setModal('hold')}>Problem</Button>}
          </div>
        </div>
        {i.status === 'ON_HOLD' && (
          <div className="mx-5 mb-5 flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 sm:mx-6 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> <div><b>On hold:</b> {i.holdReason}{canManage && ' — reassign when it is solved.'}</div>
          </div>
        )}
        {i.opsNotes && !done && <div className="mx-5 mb-5 rounded-xl bg-amber-50/70 p-3 text-sm text-amber-900 sm:mx-6 dark:bg-amber-500/10 dark:text-amber-100"><b>Note from operations:</b> {i.opsNotes}</div>}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* on phones the technician's actions (photos, complete) come first */}
        <div className={cx('space-y-6', isMine && 'order-2 lg:order-none')}>
          <Card className="p-6">
            <h2 className="font-bold">Customer</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-slate-400" /><div>{[c.sector, c.district].filter(Boolean).join(', ')}{c.landmark && <div className="text-slate-500">{c.landmark}</div>}</div></div>
              <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-slate-400" />{fmtPhone(c.phone)}{c.altPhone && ` · ${fmtPhone(c.altPhone)}`}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a href={`tel:${c.phone}`} className="flex items-center justify-center gap-2 rounded-xl bg-olive-600 py-3 text-sm font-semibold text-white hover:bg-olive-700"><Phone className="h-4 w-4" /> Call</a>
              <a href={c.latitude != null ? mapsUrl(c.latitude, c.longitude) : undefined} target="_blank" rel="noreferrer"
                className={cx('flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold dark:border-white/10', c.latitude == null && 'pointer-events-none opacity-40')}>
                <MapIcon className="h-4 w-4" /> Directions
              </a>
            </div>
            {c.latitude == null && <p className="mt-2 text-xs text-slate-400">No GPS saved for this customer.</p>}
          </Card>

          <Card className="p-6 text-sm">
            <h2 className="font-bold">Order</h2>
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2">
              <dt className="text-slate-500">Package</dt><dd className="font-medium">{i.payment.package.name}</dd>
              <dt className="text-slate-500">Paid</dt><dd className="font-medium">{money(i.payment.amount)}</dd>
              <dt className="text-slate-500">Paid on</dt><dd>{fmtDateTime(i.payment.paidAt)}</dd>
              <dt className="text-slate-500">Transaction</dt><dd className="font-mono text-xs font-semibold">{i.payment.transactionId}</dd>
              <dt className="text-slate-500">Sold by</dt><dd>{i.payment.agent.fullName}</dd>
            </dl>
            {canManage && <Link to={`/customers/${c.id}`} className="mt-3 inline-block text-sm font-semibold text-olive-600">Open customer →</Link>}
          </Card>

          <Card className="p-6">
            <h2 className="flex items-center gap-2 font-bold"><PackageIcon className="h-4 w-4" /> Materials issued</h2>
            {i.movements.length === 0 ? <p className="mt-2 text-sm text-slate-500">None yet.</p> : (
              <ul className="mt-3 space-y-1.5 text-sm">
                {i.movements.map((m) => <li key={m.id} className="flex justify-between"><span>{m.item.name}</span><b>{-m.change} {m.item.unit}</b></li>)}
              </ul>
            )}
          </Card>
        </div>

        <div className={cx('space-y-6 lg:col-span-2', isMine && 'order-1 lg:order-none')}>
          <PhotoSection i={i} canUpload={(isMine && !done) || canManage} onChange={load} onView={setViewer} />
          {isMine && ['SCHEDULED', 'IN_PROGRESS'].includes(i.status) && <CompleteForm i={i} onDone={() => { toast('Installation completed — great work!'); load(); }} />}
          {done && (
            <Card className="p-6 text-sm">
              <h2 className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-5 w-5" /> Installation report</h2>
              <dl className="mt-3 grid grid-cols-[140px_1fr] gap-y-2">
                <dt className="text-slate-500">Router serial</dt><dd className="font-mono font-semibold">{i.routerSerial}</dd>
                <dt className="text-slate-500">Received by</dt><dd>{i.signedBy}</dd>
                <dt className="text-slate-500">Started</dt><dd>{i.startedAt && fmtDateTime(i.startedAt)}</dd>
                <dt className="text-slate-500">Finished</dt><dd>{fmtDateTime(i.completedAt)}</dd>
                {i.techNotes && <><dt className="text-slate-500">Notes</dt><dd>{i.techNotes}</dd></>}
              </dl>
            </Card>
          )}
        </div>
      </div>

      {modal === 'assign' && <AssignModal i={i} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Technician assigned and notified'); load(); }} />}
      {modal === 'hold' && <HoldModal i={i} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Operations has been told'); load(); }} />}
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setViewer(null)}>
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white" aria-label="Close photo"><X className="h-6 w-6" /></button>
          <img src={viewer} alt="Installation evidence" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

function PhotoSection({ i, canUpload, onChange, onView }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    try {
      const r = await uploadPhotos(i.id, files);
      toast(`${r.uploaded} photo${r.uploaded > 1 ? 's' : ''} added`);
      onChange();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (pid) => {
    try { await api(`/installations/${i.id}/photos/${pid}`, { method: 'DELETE' }); onChange(); } catch (e) { toast(e.message, 'error'); }
  };
  const done = i.status === 'COMPLETED';
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Photo evidence</h2>
          <p className="text-sm text-slate-500">{done ? `${i.photos.length} photos` : `Take at least ${MIN_PHOTOS}: the router installed, the cable route / wall box, and the speed test.`}</p>
        </div>
        {canUpload && (
          <>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={pick} />
            <Button icon={Camera} loading={busy} onClick={() => input.current?.click()}>Add photos</Button>
          </>
        )}
      </div>
      {i.photos.length === 0 ? (
        canUpload ? (
          <button onClick={() => input.current?.click()} className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-10 text-slate-500 hover:border-olive-500 dark:border-white/15">
            <Camera className="h-8 w-8" /> <span className="text-sm font-semibold">Tap to take photos</span>
          </button>
        ) : <p className="mt-4 text-sm text-slate-400">No photos yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {i.photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-white/5">
              <button onClick={() => onView(photoUrl(i.id, p.id))} className="h-full w-full">
                <img src={photoUrl(i.id, p.id)} alt="Installation evidence" loading="lazy" className="h-full w-full object-cover" />
              </button>
              {canUpload && !done && (
                <button onClick={() => remove(p.id)} className="absolute right-1.5 top-1.5 rounded-lg bg-black/60 p-1.5 text-white opacity-90 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Remove photo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CompleteForm({ i, onDone }) {
  const [f, setF] = useState({ routerSerial: '', signedBy: i.customer.fullName, techNotes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const enough = i.photos.length >= MIN_PHOTOS;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/installations/${i.id}/complete`, { method: 'POST', body: f });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Card className="p-6">
      <h2 className="font-bold">Finish the installation</h2>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <Field label="Router serial number" hint="On the sticker under the router">
          <Input icon={Router} value={f.routerSerial} onChange={(e) => setF({ ...f, routerSerial: e.target.value.toUpperCase() })} required autoCapitalize="characters" />
        </Field>
        <Field label="Received by (name of the person at the house)"><Input value={f.signedBy} onChange={(e) => setF({ ...f, signedBy: e.target.value })} required /></Field>
        <Field label="Notes (optional)"><Input value={f.techNotes} onChange={(e) => setF({ ...f, techNotes: e.target.value })} placeholder="Signal level, speed test result, anything unusual" /></Field>
        {!enough && <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200"><Camera className="h-4 w-4" /> Add {MIN_PHOTOS - i.photos.length} more photo{MIN_PHOTOS - i.photos.length > 1 && 's'} to finish.</p>}
        {error && <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
        <Button type="submit" size="lg" icon={CheckCircle2} loading={busy} disabled={!enough} className="w-full">Complete installation</Button>
      </form>
    </Card>
  );
}

function AssignModal({ i, onClose, onSaved }) {
  const [techs, setTechs] = useState([]);
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ technicianId: i.technicianId ?? '', scheduledAt: i.scheduledAt ? toLocalInput(i.scheduledAt) : tomorrowAt(9), opsNotes: i.opsNotes ?? '' });
  const [qty, setQty] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alreadyIssued = i.movements.length > 0;

  useEffect(() => {
    api('/installations/technicians').then((d) => setTechs(d.technicians)).catch(() => {});
    api('/inventory').then((d) => {
      setItems(d.items);
      if (!alreadyIssued) setQty(Object.fromEntries(d.items.filter((x) => x.kitQuantity).map((x) => [x.id, String(x.kitQuantity)])));
    }).catch(() => {});
  }, [alreadyIssued]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const materials = Object.entries(qty).map(([itemId, q]) => ({ itemId: Number(itemId), qty: Number(q || 0) })).filter((m) => m.qty > 0);
      await api(`/installations/${i.id}/assign`, { method: 'POST', body: { technicianId: Number(f.technicianId), scheduledAt: new Date(f.scheduledAt).toISOString(), opsNotes: f.opsNotes, materials } });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={i.technicianId ? 'Reassign installation' : 'Assign technician'} subtitle={`${i.customer.fullName} · ${[i.customer.sector, i.customer.district].filter(Boolean).join(', ')}`} width="max-w-xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="assign-form" loading={busy}>Assign & notify</Button></>}>
      <form id="assign-form" onSubmit={submit} className="space-y-5">
        <Field label="Technician">
          <div className="grid gap-2 sm:grid-cols-2">
            {techs.map((t) => (
              <button type="button" key={t.id} onClick={() => setF({ ...f, technicianId: t.id })}
                className={cx('flex items-center gap-3 rounded-xl border-2 p-3 text-left', Number(f.technicianId) === t.id ? 'border-olive-600 bg-olive-50 dark:bg-olive-500/10' : 'border-slate-200 dark:border-white/10')}>
                <Avatar name={t.fullName} size="h-8 w-8 text-[11px]" />
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{t.fullName}</span><span className="text-xs text-slate-500">{t.today} today · {t.openJobs} open</span></span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="Date & time"><Input type="datetime-local" value={f.scheduledAt} min={toLocalInput(new Date())} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} required /></Field>
        <Field label="Note for the technician (optional)"><Input value={f.opsNotes} onChange={(e) => setF({ ...f, opsNotes: e.target.value })} placeholder="e.g. call before arriving" /></Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Materials to issue {alreadyIssued && <span className="text-xs text-slate-400">(already issued once — only add extras)</span>}</span>
            <button type="button" onClick={() => setQty(Object.fromEntries(items.filter((x) => x.kitQuantity).map((x) => [x.id, String(x.kitQuantity)])))} className="inline-flex items-center gap-1 text-xs font-semibold text-olive-600"><Wand2 className="h-3.5 w-3.5" /> Standard kit</button>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-white/5 dark:border-white/10">
            {items.map((x) => (
              <div key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{x.name} <span className={cx('text-xs', x.low ? 'text-amber-600' : 'text-slate-400')}>({x.quantity} {x.unit} in stock)</span></span>
                <input value={qty[x.id] ?? ''} onChange={(e) => setQty({ ...qty, [x.id]: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="0" aria-label={`${x.name} quantity`}
                  className="h-8 w-16 rounded-md border border-slate-200 bg-white text-center text-sm font-semibold dark:border-white/10 dark:bg-white/5" />
                <span className="w-6 text-xs text-slate-400">{x.unit}</span>
              </div>
            ))}
          </div>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      </form>
    </Modal>
  );
}

function HoldModal({ i, onClose, onSaved }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const quick = ['Customer not at home', 'No fiber nearby (needs extension)', 'Customer changed mind', 'Missing material'];
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api(`/installations/${i.id}/hold`, { method: 'POST', body: { reason } }); onSaved(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Report a problem" subtitle="The job goes on hold and operations is notified." width="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" type="submit" form="hold-form" loading={busy}>Put on hold</Button></>}>
      <form id="hold-form" onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-2">{quick.map((q) => <button type="button" key={q} onClick={() => setReason(q)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium dark:border-white/10">{q}</button>)}</div>
        <Field label="What is the problem?"><Input value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus /></Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
