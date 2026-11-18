import { useState } from 'react';
import { Snowflake, Sun, Flame, MapPin, LocateFixed, Check, Wifi, WifiOff, Smile, Meh, Frown, Home, Building2 } from 'lucide-react';
import { Spinner, cx } from './ui.jsx';

export const STATUS_META = {
  COLD: { label: 'Cold', hint: 'Not interested now', icon: Snowflake,
    pill: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    card: 'border-sky-500 bg-sky-50 text-sky-700 ring-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300', dot: 'bg-sky-500' },
  WARM: { label: 'Warm', hint: 'Interested, needs follow-up', icon: Sun,
    pill: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    card: 'border-amber-500 bg-amber-50 text-amber-800 ring-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300', dot: 'bg-amber-500' },
  HOT: { label: 'Hot', hint: 'Ready to pay', icon: Flame,
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    card: 'border-rose-500 bg-rose-50 text-rose-700 ring-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300', dot: 'bg-rose-500' },
};
export const STATUSES = ['HOT', 'WARM', 'COLD'];

export const ISP_META = {
  MTN: { label: 'MTN', swatch: '#ffcb05', ink: '#1a1a1a' },
  AIRTEL: { label: 'Airtel', swatch: '#e2231a', ink: '#fff' },
  LIQUID: { label: 'Liquid', swatch: '#3d2a85', ink: '#fff' },
  OTHER: { label: 'Other', swatch: '#64748b', ink: '#fff' },
  NONE: { label: 'No internet', swatch: '#cbd5e1', ink: '#334155' },
};

export const SATISFACTION = {
  HAPPY: { label: 'Happy', icon: Smile },
  OK: { label: 'It’s okay', icon: Meh },
  UNHAPPY: { label: 'Unhappy', icon: Frown },
};

export const PURPOSES = {
  FOLLOW_UP: 'Follow-up visit',
  PAYMENT: 'Collect payment',
  DEMO: 'Show / demo',
  OTHER: 'Other',
};

export const DISTRICTS = [
  'Gasabo', 'Kicukiro', 'Nyarugenge', 'Bugesera', 'Gatsibo', 'Kayonza', 'Kirehe', 'Ngoma', 'Nyagatare', 'Rwamagana',
  'Burera', 'Gakenke', 'Gicumbi', 'Musanze', 'Rulindo', 'Gisagara', 'Huye', 'Kamonyi', 'Muhanga', 'Nyamagabe',
  'Nyanza', 'Nyaruguru', 'Ruhango', 'Karongi', 'Ngororero', 'Nyabihu', 'Nyamasheke', 'Rubavu', 'Rusizi', 'Rutsiro',
];

export const fmtPhone = (p = '') => (p.length === 10 ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);
export const fmtMoney = (n) => (n == null ? '—' : `${Number(n).toLocaleString()} RWF`);
export const fmtDateTime = (d) =>
  new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

// value for <input type="datetime-local">
export function toLocalInput(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
export function tomorrowAt(hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
}

export function StatusPill({ status, className }) {
  const m = STATUS_META[status];
  if (!m) return null;
  const Icon = m.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', m.pill, className)}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

export function IspChip({ isp, other }) {
  const m = ISP_META[isp] ?? ISP_META.OTHER;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10" style={{ background: m.swatch }} />
      {isp === 'OTHER' && other ? other : m.label}
    </span>
  );
}

/** Three big tappable cards: Hot / Warm / Cold */
export function StatusPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {STATUSES.map((s) => {
        const m = STATUS_META[s];
        const Icon = m.icon;
        const on = value === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cx(
              'flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-4 text-center transition active:scale-[0.97]',
              on ? cx(m.card, 'ring-4') : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'
            )}
          >
            <Icon className="h-7 w-7" />
            <span className="text-base font-bold">{m.label}</span>
            <span className="text-[11px] leading-tight opacity-80">{m.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Big buttons for the current internet provider */
export function IspPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {Object.entries(ISP_META).map(([key, m]) => {
        const on = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cx(
              'relative flex items-center gap-2.5 rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition active:scale-[0.97]',
              on ? 'border-olive-600 bg-olive-50 ring-4 ring-olive-500/15 dark:bg-olive-500/10' : 'border-slate-200 hover:border-slate-300 dark:border-white/10'
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold" style={{ background: m.swatch, color: m.ink }}>
              {key === 'NONE' ? <WifiOff className="h-4 w-4" /> : key === 'OTHER' ? <Wifi className="h-4 w-4" /> : m.label.slice(0, 3).toUpperCase()}
            </span>
            {m.label}
            {on && <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-olive-600" />}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(value === v ? null : v)}
          className={cx(
            'flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition',
            value === v ? 'border-olive-600 bg-olive-50 text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-white/10 dark:text-slate-300'
          )}
        >
          {Icon && <Icon className="h-4 w-4" />} {label}
        </button>
      ))}
    </div>
  );
}

export const TYPE_OPTIONS = [
  { value: 'HOME', label: 'Home', icon: Home },
  { value: 'BUSINESS', label: 'Business', icon: Building2 },
];
export const SATISFACTION_OPTIONS = Object.entries(SATISFACTION).map(([value, m]) => ({ value, label: m.label, icon: m.icon }));

/** Captures the phone's GPS position */
export function GpsButton({ lat, lng, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const capture = () => {
    if (!navigator.geolocation) return setError('This device cannot share its location.');
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6)), Math.round(pos.coords.accuracy));
        setBusy(false);
      },
      (err) => {
        setError(err.code === 1 ? 'Location permission was refused. Allow it in the browser settings.' : 'Could not get the location. Try again outside.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  const has = lat != null && lng != null;
  return (
    <div>
      <button
        type="button"
        onClick={capture}
        disabled={busy}
        className={cx(
          'flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 text-left transition',
          has ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10' : 'border-slate-300 hover:border-olive-500 dark:border-white/15'
        )}
      >
        <span className={cx('rounded-lg p-2', has ? 'bg-emerald-500 text-white' : 'bg-olive-50 text-olive-600 dark:bg-olive-500/10')}>
          {busy ? <Spinner className="h-5 w-5" /> : has ? <MapPin className="h-5 w-5" /> : <LocateFixed className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{has ? 'Location saved' : 'Save my current location'}</span>
          <span className="block truncate text-xs text-slate-500">{has ? `${lat}, ${lng} · tap to update` : 'Helps the technician find the house later'}</span>
        </span>
      </button>
      {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
    </div>
  );
}

export const mapsUrl = (lat, lng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const whatsappUrl = (phone) => `https://wa.me/250${phone.replace(/^0/, '')}`;
