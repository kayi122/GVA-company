import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageCircle, Map, MapPin, ClipboardPlus, CalendarPlus, Pencil, Wifi, Wallet, Smile, CalendarClock,
  Check, X, Clock, User, Building2, Home,
} from 'lucide-react';
import { api, timeAgo, useAuth } from '../lib.jsx';
import { StageTracker, METHODS, PAY_STATUS, INSTALL_STATUS, Pill, money, photoUrl } from '../components/pipeline-ui.jsx';
import { Receipt, Hash, Wrench, Camera } from 'lucide-react';
import { Avatar, Button, Card, Empty, Field, Input, Modal, Select, Spinner, cx, useToast } from '../components/ui.jsx';
import {
  STATUS_META, StatusPill, StatusPicker, IspPicker, Segmented, GpsButton, PURPOSES, SATISFACTION, SATISFACTION_OPTIONS, TYPE_OPTIONS,
  DISTRICTS, ISP_META, fmtPhone, fmtMoney, fmtDateTime, toLocalInput, tomorrowAt, mapsUrl, whatsappUrl,
} from '../components/customer-ui.jsx';

const textarea =
  'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm focus:border-olive-500 focus:outline-none focus:ring-4 focus:ring-olive-500/15 dark:border-white/10 dark:bg-white/5';

const APPT_TONE = {
  SCHEDULED: 'bg-olive-50 text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand',
  DONE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  MISSED: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-white/10',
};

export default function CustomerDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'visit' | 'book' | 'edit'

  const load = useCallback(
    () => api(`/customers/${id}`).then(setData).catch((e) => setError(e.message)),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  const setAppt = async (a, status) => {
    try {
      await api(`/appointments/${a.id}`, { method: 'PATCH', body: { status } });
      toast(status === 'CANCELLED' ? 'Visit cancelled' : status === 'MISSED' ? 'Marked as missed' : 'Marked as done');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (error) return <Empty title={error} action={<Link to="/customers" className="font-semibold text-olive-600">Back to customers</Link>} />;
  if (!data) return <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>;

  const { customer: c, canEdit } = data;
  const openPayment = c.payments.find((p) => p.status !== 'REJECTED');
  const canPay = canEdit && can('payments.record') && !openPayment;
  const upcoming = c.appointments.filter((a) => a.status === 'SCHEDULED').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const past = c.appointments.filter((a) => a.status !== 'SCHEDULED');
  const hasGps = c.latitude != null && c.longitude != null;
  const Sat = c.satisfaction && SATISFACTION[c.satisfaction];

  return (
    <div className="animate-fade-up">
      <Link to="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      {/* header */}
      <Card className="overflow-hidden">
        <div className={cx('h-1.5', STATUS_META[c.status].dot)} />
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar name={c.fullName} size="h-14 w-14 text-base" />
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">{c.fullName}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <StatusPill status={c.status} />
                  <span className="inline-flex items-center gap-1">{c.customerType === 'BUSINESS' ? <Building2 className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}{c.customerType === 'BUSINESS' ? 'Business' : 'Home'}</span>
                  <span>· Lead since {new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                {canPay && c.status === 'HOT' && <Button icon={Wallet} onClick={() => setModal('pay')}>Record payment</Button>}
                <Button icon={ClipboardPlus} variant={canPay && c.status === 'HOT' ? 'secondary' : 'primary'} onClick={() => setModal('visit')}>Log visit</Button>
                <Button variant="secondary" icon={CalendarPlus} onClick={() => setModal('book')}>Book visit</Button>
                <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')} aria-label="Edit customer" />
              </div>
            )}
          </div>

          {/* quick contact */}
          <div className="mt-5 grid grid-cols-3 gap-2 sm:max-w-md">
            <a href={`tel:${c.phone}`} className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-xs font-semibold hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10">
              <Phone className="h-5 w-5 text-olive-600" /> Call
            </a>
            <a href={whatsappUrl(c.phone)} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-xs font-semibold hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10">
              <MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp
            </a>
            <a href={hasGps ? mapsUrl(c.latitude, c.longitude) : undefined} target="_blank" rel="noreferrer"
              className={cx('flex flex-col items-center gap-1 rounded-xl bg-slate-50 py-3 text-xs font-semibold dark:bg-white/5', hasGps ? 'hover:bg-slate-100 dark:hover:bg-white/10' : 'pointer-events-none opacity-40')}>
              <Map className="h-5 w-5 text-sky-600" /> Map
            </a>
          </div>
          <div className="mt-6 border-t border-slate-100 pt-5 dark:border-white/10"><StageTracker stage={c.stage} /></div>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* details */}
        <Card className="p-6">
          <h2 className="font-bold">Details</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <Row icon={Phone} label="Phone">{fmtPhone(c.phone)}{c.altPhone && <div className="text-slate-500">{fmtPhone(c.altPhone)}</div>}</Row>
            <Row icon={MapPin} label="Location">
              {[c.sector, c.district].filter(Boolean).join(', ')}
              {c.landmark && <div className="text-slate-500">{c.landmark}</div>}
              {hasGps && <div className="text-xs text-emerald-600">GPS saved</div>}
            </Row>
            <Row icon={Wifi} label="Current internet">{c.currentIsp === 'OTHER' ? c.currentIspOther || 'Other' : ISP_META[c.currentIsp]?.label}</Row>
            {c.currentIsp !== 'NONE' && <Row icon={Wallet} label="Pays per month">{fmtMoney(c.monthlySpend)}</Row>}
            {Sat && <Row icon={Smile} label="Happy with it?">{Sat.label}</Row>}
            <Row icon={User} label="Agent">{c.agent.fullName}{c.agent.supervisor && <div className="text-slate-500">Team of {c.agent.supervisor.fullName}</div>}</Row>
          </dl>
          {c.notes && (
            <div className="mt-5 rounded-xl bg-amber-50/70 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
              <div className="label-caps mb-1 text-amber-700 dark:text-amber-300">Notes</div>
              {c.notes}
            </div>
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {(c.payments.length > 0 || canPay) && <PaymentCard c={c} canPay={canPay} onRecord={() => setModal('pay')} />}
          {c.installations.map((inst) => <InstallationCard key={inst.id} inst={inst} />)}
          {/* upcoming visits */}
          <Card className="p-6">
            <h2 className="font-bold">Upcoming visits</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No visit booked. {canEdit && <button onClick={() => setModal('book')} className="font-semibold text-olive-600">Book one</button>}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {upcoming.map((a) => {
                  const overdue = new Date(a.scheduledAt) < new Date();
                  return (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/10">
                      <span className={cx('rounded-lg p-2', overdue ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-olive-50 text-olive-600 dark:bg-olive-500/10')}>
                        <CalendarClock className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{fmtDateTime(a.scheduledAt)} {overdue && <span className="text-xs font-semibold text-rose-600">· overdue</span>}</div>
                        <div className="text-xs text-slate-500">{PURPOSES[a.purpose]}{a.notes && ` · ${a.notes}`}</div>
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="secondary" icon={Check} onClick={() => setModal({ visitFor: a })}>Done</Button>
                          <Button size="sm" variant="ghost" icon={Clock} onClick={() => setAppt(a, 'MISSED')} title="Customer was not there">Missed</Button>
                          <Button size="sm" variant="ghost" icon={X} onClick={() => setAppt(a, 'CANCELLED')} aria-label="Cancel visit" />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* timeline */}
          <Card className="p-6">
            <h2 className="font-bold">Visit history</h2>
            <ol className="relative mt-4 space-y-5 border-l-2 border-slate-100 pl-6 dark:border-white/10">
              {[
                ...c.visits.map((v) => ({ kind: 'visit', at: v.createdAt, v })),
                ...past.map((a) => ({ kind: 'appt', at: a.completedAt ?? a.scheduledAt, a })),
              ]
                .sort((x, y) => new Date(y.at) - new Date(x.at))
                .map((item) =>
                  item.kind === 'visit' ? (
                    <li key={`v${item.v.id}`} className="relative">
                      <span className={cx('absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-white dark:border-[#0d1630]', STATUS_META[item.v.status].dot)} />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">Visit</span>
                        <StatusPill status={item.v.status} />
                        <span className="text-xs text-slate-400">{fmtDateTime(item.v.createdAt)} · {item.v.agent.fullName}</span>
                      </div>
                      {item.v.notes && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.v.notes}</p>}
                    </li>
                  ) : (
                    <li key={`a${item.a.id}`} className="relative">
                      <span className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full bg-slate-300 dark:bg-slate-600" />
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-slate-600 dark:text-slate-300">{PURPOSES[item.a.purpose]}</span>
                        <span className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold', APPT_TONE[item.a.status])}>{item.a.status.toLowerCase()}</span>
                        <span className="text-xs text-slate-400">{fmtDateTime(item.a.scheduledAt)}</span>
                      </div>
                    </li>
                  )
                )}
            </ol>
          </Card>
        </div>
      </div>

      {(modal === 'visit' || modal?.visitFor) && <LogVisitModal customer={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Visit saved'); load(); }} />}
      {modal === 'book' && <BookVisitModal customer={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Visit booked'); load(); }} />}
      {modal === 'pay' && <RecordPaymentModal customer={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Payment recorded — your supervisor has been asked to confirm'); load(); }} />}
      {modal === 'edit' && <EditCustomerModal customer={c} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Customer updated'); load(); }} />}
    </div>
  );
}

function PaymentCard({ c, canPay, onRecord }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Payment</h2>
        {canPay && <Button size="sm" icon={Wallet} onClick={onRecord}>Record payment</Button>}
      </div>
      {c.payments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No payment yet. When the customer pays, record the transaction ID here.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {c.payments.map((p) => (
            <li key={p.id} className={cx('rounded-xl border p-4', p.status === 'REJECTED' ? 'border-rose-200 dark:border-rose-500/30' : 'border-slate-100 dark:border-white/10')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-lg font-extrabold">{money(p.amount)} <span className="text-sm font-medium text-slate-500">· {p.package.name}</span></div>
                <Pill meta={PAY_STATUS[p.status]} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500">
                <span>{METHODS[p.method].label}</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{p.transactionId}</span>
                <span>paid {fmtDateTime(p.paidAt)}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {p.supervisor && <>Supervisor ✓ {p.supervisor.fullName}{' '}</>}
                {p.financeBy && <>· Finance ✓ {p.financeBy.fullName}</>}
              </div>
              {p.status === 'REJECTED' && <p className="mt-2 text-sm text-rose-700 dark:text-rose-300"><b>Rejected:</b> {p.rejectReason}. {canPay && 'Fix it and record the payment again.'}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InstallationCard({ inst }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold"><Wrench className="h-4 w-4" /> Installation</h2>
        <Pill meta={INSTALL_STATUS[inst.status]} />
      </div>
      <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {inst.status === 'PENDING' && 'Operations will assign a technician soon.'}
        {['SCHEDULED', 'IN_PROGRESS'].includes(inst.status) && <>{fmtDateTime(inst.scheduledAt)} with <b>{inst.technician?.fullName}</b>{inst.technician?.phone && ` (${fmtPhone(inst.technician.phone)})`}</>}
        {inst.status === 'ON_HOLD' && <span className="text-rose-600">On hold: {inst.holdReason}</span>}
        {inst.status === 'COMPLETED' && <>Connected {fmtDateTime(inst.completedAt)} by {inst.technician?.fullName} · router <span className="font-mono">{inst.routerSerial}</span></>}
      </div>
      {inst.photos.length > 0 && (
        <div className="mt-3 flex gap-2">
          {inst.photos.slice(0, 5).map((ph) => (
            <a key={ph.id} href={photoUrl(inst.id, ph.id)} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-lg bg-slate-100">
              <img src={photoUrl(inst.id, ph.id)} alt="Installation evidence" className="h-full w-full object-cover" loading="lazy" />
            </a>
          ))}
          {inst.photos.length > 5 && <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold dark:bg-white/5"><Camera className="mr-1 h-3 w-3" />+{inst.photos.length - 5}</span>}
        </div>
      )}
    </Card>
  );
}

function RecordPaymentModal({ customer, onClose, onSaved }) {
  const [packages, setPackages] = useState([]);
  const [f, setF] = useState({ packageId: '', amount: '', method: 'MOMO_MTN', transactionId: '', paidAt: toLocalInput(new Date()), note: '' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  useEffect(() => { api('/packages').then((d) => setPackages(d.packages)).catch(() => {}); }, []);
  const pkg = packages.find((p) => p.id === Number(f.packageId));
  const { busy, error, submit } = useSubmit(
    () => api(`/customers/${customer.id}/payments`, { method: 'POST', body: { ...f, packageId: Number(f.packageId), amount: Number(f.amount), paidAt: new Date(f.paidAt).toISOString() } }),
    onSaved
  );
  return (
    <Modal open onClose={onClose} title="Record payment" subtitle={`${customer.fullName} · your supervisor confirms it next, then finance`} width="max-w-lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="pay-form" loading={busy} icon={Wallet}>Save payment</Button></>}>
      <form id="pay-form" onSubmit={submit} className="space-y-5">
        <Field label="Package">
          <div className="grid grid-cols-2 gap-2">
            {packages.map((p) => (
              <button type="button" key={p.id} onClick={() => set({ packageId: p.id, amount: String(p.monthlyPrice + p.installFee) })}
                className={cx('rounded-xl border-2 p-3 text-left transition', Number(f.packageId) === p.id ? 'border-olive-600 bg-olive-50 ring-4 ring-olive-500/15 dark:bg-olive-500/10' : 'border-slate-200 dark:border-white/10')}>
                <div className="text-sm font-bold">{p.name}</div>
                <div className="text-xs text-slate-500">{p.speedMbps} Mbps · {money(p.monthlyPrice)}/mo</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label="How did they pay?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(METHODS).map(([k, m]) => (
              <button type="button" key={k} onClick={() => set({ method: k })}
                className={cx('flex items-center justify-center gap-2 rounded-xl border-2 px-2 py-2.5 text-xs font-semibold', f.method === k ? 'border-olive-600 bg-olive-50 dark:bg-olive-500/10' : 'border-slate-200 dark:border-white/10')}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.swatch }} />{m.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount paid (RWF)" hint={pkg ? `${money(pkg.monthlyPrice)} + installation ${money(pkg.installFee)}` : undefined}>
            <Input value={f.amount} onChange={(e) => set({ amount: e.target.value.replace(/\D/g, '') })} inputMode="numeric" required />
          </Field>
          <Field label="Paid on"><Input type="datetime-local" value={f.paidAt} max={toLocalInput(new Date())} onChange={(e) => set({ paidAt: e.target.value })} required /></Field>
        </div>
        <Field label="Transaction ID" hint="Copy it exactly from the MoMo / bank message">
          <Input icon={Hash} value={f.transactionId} onChange={(e) => set({ transactionId: e.target.value.toUpperCase().replace(/\s/g, '') })} required placeholder="e.g. MP261118.1234.A56789" className="font-mono" />
        </Field>
        <Field label="Note (optional)"><Input icon={Receipt} value={f.note} onChange={(e) => set({ note: e.target.value })} /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

function useSubmit(fn, onSaved) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fn();
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

const ErrorBox = ({ error }) =>
  error ? <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null;

function LogVisitModal({ customer, onClose, onSaved }) {
  const [f, setF] = useState({ status: customer.status, notes: '', latitude: null, longitude: null, book: false, nextVisitAt: tomorrowAt(10), nextVisitPurpose: 'FOLLOW_UP' });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const { busy, error, submit } = useSubmit(async () => {
    const { book, nextVisitAt, nextVisitPurpose, ...body } = f;
    if (book) Object.assign(body, { nextVisitAt: new Date(nextVisitAt).toISOString(), nextVisitPurpose });
    await api(`/customers/${customer.id}/visits`, { method: 'POST', body });
  }, onSaved);

  return (
    <Modal open onClose={onClose} title="Log a visit" subtitle={customer.fullName}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="visit-form" loading={busy}>Save visit</Button></>}>
      <form id="visit-form" onSubmit={submit} className="space-y-5">
        <Field label="How is the customer now?"><StatusPicker value={f.status} onChange={(status) => set({ status })} /></Field>
        <Field label="What happened?">
          <textarea className={textarea} rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What did you talk about?" />
        </Field>
        <GpsButton lat={f.latitude} lng={f.longitude} onChange={(latitude, longitude) => set({ latitude, longitude })} />
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={f.book} onChange={(e) => set({ book: e.target.checked })} className="h-5 w-5 accent-[#86a022]" /> Book the next visit
        </label>
        {f.book && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date & time"><Input type="datetime-local" value={f.nextVisitAt} min={toLocalInput(new Date())} onChange={(e) => set({ nextVisitAt: e.target.value })} /></Field>
            <Field label="Purpose">
              <Select value={f.nextVisitPurpose} onChange={(e) => set({ nextVisitPurpose: e.target.value })}>
                {Object.entries(PURPOSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
          </div>
        )}
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function BookVisitModal({ customer, onClose, onSaved }) {
  const [f, setF] = useState({ scheduledAt: tomorrowAt(10), purpose: customer.status === 'HOT' ? 'PAYMENT' : 'FOLLOW_UP', notes: '' });
  const { busy, error, submit } = useSubmit(
    () => api('/appointments', { method: 'POST', body: { ...f, customerId: customer.id, scheduledAt: new Date(f.scheduledAt).toISOString() } }),
    onSaved
  );
  return (
    <Modal open onClose={onClose} title="Book a visit" subtitle={`${customer.fullName} · you'll get a reminder 1 hour before`} width="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="book-form" loading={busy}>Book visit</Button></>}>
      <form id="book-form" onSubmit={submit} className="space-y-4">
        <Field label="Date & time"><Input type="datetime-local" value={f.scheduledAt} min={toLocalInput(new Date())} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} required /></Field>
        <Field label="Purpose">
          <Select value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}>
            {Object.entries(PURPOSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Note (optional)"><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. bring price list" /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function EditCustomerModal({ customer: c, onClose, onSaved }) {
  const [f, setF] = useState({
    fullName: c.fullName, phone: c.phone, altPhone: c.altPhone ?? '', customerType: c.customerType,
    district: c.district, sector: c.sector ?? '', landmark: c.landmark ?? '', latitude: c.latitude, longitude: c.longitude,
    currentIsp: c.currentIsp, currentIspOther: c.currentIspOther ?? '', monthlySpend: c.monthlySpend ?? '', satisfaction: c.satisfaction, notes: c.notes ?? '',
  });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const { busy, error, submit } = useSubmit(
    () => api(`/customers/${c.id}`, { method: 'PATCH', body: { ...f, monthlySpend: f.monthlySpend === '' ? null : Number(f.monthlySpend) } }),
    onSaved
  );
  return (
    <Modal open onClose={onClose} title="Edit customer" subtitle="To change Hot / Warm / Cold, log a visit instead." width="max-w-2xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="edit-form" loading={busy}>Save changes</Button></>}>
      <form id="edit-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><Input value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} required /></Field>
          <Field label="Type"><Segmented options={TYPE_OPTIONS} value={f.customerType} onChange={(v) => set({ customerType: v ?? 'HOME' })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" required /></Field>
          <Field label="Second phone"><Input value={f.altPhone} onChange={(e) => set({ altPhone: e.target.value })} inputMode="tel" /></Field>
          <Field label="District">
            <Select value={f.district} onChange={(e) => set({ district: e.target.value })}>{DISTRICTS.map((d) => <option key={d}>{d}</option>)}</Select>
          </Field>
          <Field label="Sector"><Input value={f.sector} onChange={(e) => set({ sector: e.target.value })} /></Field>
        </div>
        <Field label="Landmark / directions"><Input value={f.landmark} onChange={(e) => set({ landmark: e.target.value })} /></Field>
        <GpsButton lat={f.latitude} lng={f.longitude} onChange={(latitude, longitude) => set({ latitude, longitude })} />
        <Field label="Current internet"><IspPicker value={f.currentIsp} onChange={(v) => set({ currentIsp: v })} /></Field>
        {f.currentIsp === 'OTHER' && <Field label="Which provider?"><Input value={f.currentIspOther} onChange={(e) => set({ currentIspOther: e.target.value })} /></Field>}
        {f.currentIsp !== 'NONE' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Pays per month (RWF)"><Input value={f.monthlySpend} onChange={(e) => set({ monthlySpend: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Field>
            <Field label="Happy with it?"><Segmented options={SATISFACTION_OPTIONS} value={f.satisfaction} onChange={(v) => set({ satisfaction: v })} /></Field>
          </div>
        )}
        <Field label="Notes"><textarea className={textarea} rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
