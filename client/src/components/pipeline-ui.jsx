import { Smartphone, Landmark, Banknote, Check, UserPlus, Wallet, ShieldCheck, CalendarClock, Wifi } from 'lucide-react';
import { cx } from './ui.jsx';

export const METHODS = {
  MOMO_MTN: { label: 'MTN MoMo', icon: Smartphone, swatch: '#ffcb05' },
  AIRTEL_MONEY: { label: 'Airtel Money', icon: Smartphone, swatch: '#e2231a' },
  BANK: { label: 'Bank', icon: Landmark, swatch: '#475569' },
  CASH: { label: 'Cash', icon: Banknote, swatch: '#16a34a' },
};

export const PAY_STATUS = {
  PENDING_SUPERVISOR: { label: 'Waiting for supervisor', short: 'Supervisor', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  PENDING_FINANCE: { label: 'Waiting for finance', short: 'Finance', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  CONFIRMED: { label: 'Confirmed', short: 'Confirmed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', short: 'Rejected', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
};

export const INSTALL_STATUS = {
  PENDING: { label: 'Waiting for technician', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', dot: 'bg-sky-500' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', dot: 'bg-violet-500' },
  ON_HOLD: { label: 'On hold', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', dot: 'bg-rose-500' },
  COMPLETED: { label: 'Installed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
};

export function Pill({ meta, className }) {
  if (!meta) return null;
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', meta.cls, className)}>{meta.label}</span>;
}

// Customer journey from lead to connected home
const STAGES = [
  { key: 'LEAD', label: 'Lead', icon: UserPlus },
  { key: 'PAYMENT_PENDING', label: 'Paid', icon: Wallet },
  { key: 'AWAITING_INSTALL', label: 'Confirmed', icon: ShieldCheck },
  { key: 'SCHEDULED', label: 'Scheduled', icon: CalendarClock },
  { key: 'INSTALLED', label: 'Connected', icon: Wifi },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export function StageTracker({ stage }) {
  const at = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  return (
    <ol className="flex items-center" aria-label={`Stage: ${STAGE_LABEL[stage] ?? stage}`}>
      {STAGES.map((s, i) => {
        const done = i < at || stage === 'INSTALLED';
        const current = i === at && stage !== 'INSTALLED';
        const Icon = done ? Check : s.icon;
        return (
          <li key={s.key} className={cx('flex items-center', i < STAGES.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1">
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-full border-2 transition',
                done ? 'border-olive-600 bg-olive-600 text-white' : current ? 'border-olive-600 bg-olive-50 text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand' : 'border-slate-200 text-slate-300 dark:border-white/10')}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={cx('text-[10px] font-semibold sm:text-xs', done || current ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400')}>{s.label}</span>
            </div>
            {i < STAGES.length - 1 && <span className={cx('mx-1 mb-5 h-0.5 flex-1 rounded', i < at || stage === 'INSTALLED' ? 'bg-olive-600' : 'bg-slate-200 dark:bg-white/10')} />}
          </li>
        );
      })}
    </ol>
  );
}

export const money = (n) => (n == null ? '—' : `${Number(n).toLocaleString()} RWF`);

/** Shrink a phone photo before upload (max 1600px, JPEG) to save mobile data. */
export async function compressImage(file, max = 1600, quality = 0.8) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode — server will refuse non-JPG/PNG/WebP
  }
}

// One photo per request: hosting limits a request to 4.5 MB, and a weak connection only retries one photo.
export async function uploadPhotos(installationId, files) {
  let uploaded = 0;
  for (const f of files) {
    const form = new FormData();
    form.append('photos', await compressImage(f));
    const res = await fetch(`/api/installations/${installationId}/photos`, { method: 'POST', body: form, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${uploaded ? `${uploaded} photo(s) saved, then: ` : ''}${data.error || (res.status === 413 ? 'Photo too large' : 'Upload failed')}`);
    uploaded += data.uploaded ?? 1;
  }
  return { uploaded };
}

export const photoUrl = (installationId, photoId) => `/api/installations/${installationId}/photos/${photoId}`;
