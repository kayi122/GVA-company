import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, User, Phone, AlertTriangle, CalendarPlus, Save } from 'lucide-react';
import { api } from '../lib.jsx';
import { Button, Card, Field, Input, Select, cx, useToast } from '../components/ui.jsx';
import {
  DISTRICTS, GpsButton, IspPicker, PURPOSES, SATISFACTION_OPTIONS, Segmented, StatusPicker, TYPE_OPTIONS, ISP_META, STATUS_META,
  fmtDateTime, toLocalInput, tomorrowAt,
} from '../components/customer-ui.jsx';

const DRAFT_KEY = 'gva-new-customer-draft';
const EMPTY = {
  fullName: '', phone: '', altPhone: '', customerType: 'HOME',
  district: '', sector: '', landmark: '', latitude: null, longitude: null,
  currentIsp: '', currentIspOther: '', monthlySpend: '', satisfaction: null,
  status: '', notes: '', followUp: true, nextVisitAt: tomorrowAt(10), nextVisitPurpose: 'FOLLOW_UP',
};
const STEPS = ['Customer', 'Location', 'Conversation', 'Next visit'];
const SPEND_CHIPS = [10000, 15000, 20000, 30000, 50000];

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return d ? { ...EMPTY, ...d } : null;
  } catch {
    return null;
  }
}

export default function CustomerNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [draft] = useState(loadDraft);
  const [f, setF] = useState(draft ?? EMPTY);
  const [step, setStep] = useState(0);
  const [dup, setDup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  // keep an unsent draft on this device in case the agent is interrupted
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(f)); } catch {}
  }, [f]);

  // live duplicate check on the phone number
  useEffect(() => {
    const digits = f.phone.replace(/\D/g, '');
    if (digits.length < 9) return setDup(null);
    const t = setTimeout(() => {
      api(`/customers/check-phone?phone=${encodeURIComponent(f.phone)}`).then(setDup).catch(() => setDup(null));
    }, 350);
    return () => clearTimeout(t);
  }, [f.phone]);

  // hot customers usually need a payment visit
  useEffect(() => {
    if (f.status === 'HOT' && f.nextVisitPurpose === 'FOLLOW_UP') set({ nextVisitPurpose: 'PAYMENT' });
  }, [f.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepError = useMemo(() => {
    if (step === 0) {
      if (f.fullName.trim().length < 2) return 'Enter the customer name.';
      if (dup && !dup.valid) return 'Enter a valid phone number (e.g. 078 123 4567).';
      if (!dup) return 'Enter the phone number.';
      if (dup.exists) return 'This phone number is already registered.';
    }
    if (step === 1 && !f.district) return 'Choose the district.';
    if (step === 2) {
      if (!f.currentIsp) return 'Choose the internet they use now.';
      if (!f.status) return 'Choose Hot, Warm or Cold.';
    }
    if (step === 3 && f.followUp && !f.nextVisitAt) return 'Pick the date and time of the next visit.';
    return '';
  }, [step, f, dup]);

  const next = () => {
    if (stepError) return setError(stepError);
    setError('');
    setStep((s) => s + 1);
  };

  const save = async () => {
    if (stepError) return setError(stepError);
    setBusy(true);
    setError('');
    try {
      const { followUp, nextVisitAt, nextVisitPurpose, monthlySpend, ...rest } = f;
      const body = { ...rest, monthlySpend: monthlySpend === '' ? null : Number(monthlySpend) };
      if (followUp) Object.assign(body, { nextVisitAt: new Date(nextVisitAt).toISOString(), nextVisitPurpose });
      const { customer } = await api('/customers', { method: 'POST', body });
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast(`${customer.fullName} saved as ${STATUS_META[customer.status].label}`);
      navigate(`/customers/${customer.id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const discard = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setF({ ...EMPTY, nextVisitAt: tomorrowAt(10) });
    setStep(0);
    setError('');
  };

  const quickDate = (days, hour = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    set({ nextVisitAt: toLocalInput(d) });
  };

  return (
    <div className="animate-fade-up mx-auto max-w-2xl pb-28 sm:pb-0">
      <Link to="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">New customer</h1>
          <p className="mt-1 text-sm text-slate-500">Fill this in during or right after the conversation.</p>
        </div>
        {draft && step === 0 && (
          <button onClick={discard} className="text-sm font-medium text-slate-500 underline-offset-2 hover:underline">Start over</button>
        )}
      </div>

      {/* stepper */}
      <div className="mt-6 grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <button key={s} type="button" onClick={() => i < step && setStep(i)} className="text-left" disabled={i > step}>
            <div className={cx('h-1.5 rounded-full transition-colors', i <= step ? 'bg-olive-600' : 'bg-slate-200 dark:bg-white/10')} />
            <div className={cx('mt-2 text-xs font-semibold', i === step ? 'text-slate-900 dark:text-white' : 'text-slate-400')}>
              <span className="hidden sm:inline">{i + 1}. </span>{s}
            </div>
          </button>
        ))}
      </div>

      <Card className="mt-6 p-5 sm:p-7">
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Full name">
              <Input icon={User} value={f.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="e.g. Marie Uwera" autoFocus autoComplete="off" />
            </Field>
            <Field label="Phone number">
              <Input icon={Phone} value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="078 123 4567" inputMode="tel" autoComplete="off" />
            </Field>
            {dup?.exists && (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  {dup.mine ? (
                    <>This person is already one of your customers. <Link to={`/customers/${dup.customerId}`} className="font-semibold underline">Open and log a visit instead</Link>.</>
                  ) : (
                    <>This number is already registered by <b>{dup.agentName}</b>. Each customer belongs to one agent.</>
                  )}
                </div>
              </div>
            )}
            {dup && dup.valid && !dup.exists && <p className="-mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600"><Check className="h-3.5 w-3.5" /> New number, not registered yet</p>}
            <Field label="Second phone (optional)">
              <Input icon={Phone} value={f.altPhone} onChange={(e) => set({ altPhone: e.target.value })} placeholder="Another number to reach them" inputMode="tel" />
            </Field>
            <Field label="Type of customer">
              <Segmented options={TYPE_OPTIONS} value={f.customerType} onChange={(v) => set({ customerType: v ?? 'HOME' })} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="District">
              <Select value={f.district} onChange={(e) => set({ district: e.target.value })}>
                <option value="">Choose district…</option>
                {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
              </Select>
            </Field>
            <Field label="Sector / neighbourhood">
              <Input value={f.sector} onChange={(e) => set({ sector: e.target.value })} placeholder="e.g. Kimironko" />
            </Field>
            <Field label="Landmark / directions" hint="Something that helps find the house again.">
              <Input value={f.landmark} onChange={(e) => set({ landmark: e.target.value })} placeholder="e.g. Blue gate behind the market" />
            </Field>
            <GpsButton lat={f.latitude} lng={f.longitude} onChange={(latitude, longitude) => set({ latitude, longitude })} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <Field label="Internet they use now">
              <IspPicker value={f.currentIsp} onChange={(v) => set({ currentIsp: v })} />
            </Field>
            {f.currentIsp === 'OTHER' && (
              <Field label="Which provider?">
                <Input value={f.currentIspOther} onChange={(e) => set({ currentIspOther: e.target.value })} placeholder="Provider name" />
              </Field>
            )}
            {f.currentIsp && f.currentIsp !== 'NONE' && (
              <>
                <Field label="How much they pay per month (RWF)">
                  <div className="mb-2 flex flex-wrap gap-2">
                    {SPEND_CHIPS.map((n) => (
                      <button key={n} type="button" onClick={() => set({ monthlySpend: String(n) })}
                        className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', String(n) === String(f.monthlySpend) ? 'border-olive-600 bg-olive-600 text-white' : 'border-slate-200 dark:border-white/10')}>
                        {n / 1000}k
                      </button>
                    ))}
                  </div>
                  <Input value={f.monthlySpend} onChange={(e) => set({ monthlySpend: e.target.value.replace(/\D/g, '') })} placeholder="Amount" inputMode="numeric" />
                </Field>
                <Field label="Are they happy with it?">
                  <Segmented options={SATISFACTION_OPTIONS} value={f.satisfaction} onChange={(v) => set({ satisfaction: v })} />
                </Field>
              </>
            )}
            <Field label="How did the conversation go?">
              <StatusPicker value={f.status} onChange={(v) => set({ status: v })} />
            </Field>
            <Field label="Notes (optional)">
              <textarea
                value={f.notes}
                onChange={(e) => set({ notes: e.target.value })}
                rows={3}
                placeholder="What did they say? Objections, best time to call, what package they liked…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-sm focus:border-olive-500 focus:outline-none focus:ring-4 focus:ring-olive-500/15 dark:border-white/10 dark:bg-white/5"
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <span className="flex items-center gap-3">
                <span className="rounded-lg bg-olive-50 p-2 text-olive-600 dark:bg-olive-500/10"><CalendarPlus className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold">Book a return visit</span>
                  <span className="block text-xs text-slate-500">You'll get a reminder one hour before.</span>
                </span>
              </span>
              <input type="checkbox" checked={f.followUp} onChange={(e) => set({ followUp: e.target.checked })} className="h-5 w-5 accent-[#86a022]" />
            </label>
            {f.followUp && (
              <>
                <div className="flex flex-wrap gap-2">
                  {[['Tomorrow', 1], ['In 2 days', 2], ['In 3 days', 3], ['Next week', 7]].map(([l, d]) => (
                    <button key={l} type="button" onClick={() => quickDate(d)} className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium hover:border-olive-500 dark:border-white/10">{l}</button>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date & time">
                    <Input type="datetime-local" value={f.nextVisitAt} min={toLocalInput(new Date())} onChange={(e) => set({ nextVisitAt: e.target.value })} />
                  </Field>
                  <Field label="Purpose">
                    <Select value={f.nextVisitPurpose} onChange={(e) => set({ nextVisitPurpose: e.target.value })}>
                      {Object.entries(PURPOSES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </Select>
                  </Field>
                </div>
              </>
            )}

            <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-white/5">
              <div className="label-caps mb-3 text-slate-400">Summary</div>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
                <dt className="text-slate-500">Customer</dt><dd className="font-medium">{f.fullName} · {f.phone}</dd>
                <dt className="text-slate-500">Location</dt><dd className="font-medium">{[f.sector, f.district].filter(Boolean).join(', ')}{f.latitude != null && ' · GPS ✓'}</dd>
                <dt className="text-slate-500">Now using</dt><dd className="font-medium">{f.currentIsp === 'OTHER' ? f.currentIspOther || 'Other' : ISP_META[f.currentIsp]?.label}{f.monthlySpend && ` · ${Number(f.monthlySpend).toLocaleString()} RWF`}</dd>
                <dt className="text-slate-500">Status</dt><dd className="font-semibold">{STATUS_META[f.status]?.label}</dd>
                {f.followUp && f.nextVisitAt && (<><dt className="text-slate-500">Next visit</dt><dd className="font-medium">{fmtDateTime(f.nextVisitAt)} · {PURPOSES[f.nextVisitPurpose]}</dd></>)}
              </dl>
            </div>
          </div>
        )}

        {error && <p className="animate-shake mt-5 rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

        {/* nav buttons — sticky at the bottom on phones */}
        <div className="fixed inset-x-0 bottom-0 z-10 flex gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:static sm:mt-7 sm:border-0 sm:bg-transparent sm:p-0 dark:border-white/10 dark:bg-[#0a1226]/95 sm:dark:bg-transparent">
          {step > 0 && <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => { setError(''); setStep(step - 1); }}>Back</Button>}
          {step < STEPS.length - 1 ? (
            <Button size="lg" className="flex-1" onClick={next}>Next <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button size="lg" className="flex-1" icon={Save} loading={busy} onClick={save}>Save customer</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
