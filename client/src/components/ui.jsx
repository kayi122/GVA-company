import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, X, Loader2, Moon, Sun } from 'lucide-react';
import { ROLE_META, initials, useTheme } from '../lib.jsx';

const cx = (...c) => c.filter(Boolean).join(' ');
export { cx };

export function Spinner({ className = 'h-5 w-5' }) {
  return <Loader2 className={cx('animate-spin', className)} />;
}

const VARIANTS = {
  primary: 'bg-olive-600 text-white hover:bg-olive-700 shadow-sm shadow-olive-700/20',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-white/5 dark:text-slate-200 dark:border-white/10 dark:hover:bg-white/10',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...rest }) {
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4 text-sm', lg: 'h-12 px-6 text-sm' };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant], sizes[size], className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-olive-500 focus:outline-none focus:ring-4 focus:ring-olive-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-100';

export function Input({ icon: Icon, right, className, ...rest }) {
  return (
    <div className="relative">
      {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />}
      <input className={cx(inputBase, 'h-12', Icon ? 'pl-10' : 'pl-3.5', right ? 'pr-11' : 'pr-3.5', className)} {...rest} />
      {right && <div className="absolute right-2 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx(inputBase, 'h-12 px-3', className)} {...rest}>
      {children}
    </select>
  );
}

export function Card({ className, children }) {
  return (
    <div className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]', className)}>
      {children}
    </div>
  );
}

export function RoleBadge({ role }) {
  const m = ROLE_META[role] ?? { label: role, badge: 'bg-slate-100 text-slate-600' };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', m.badge)}>{m.label}</span>;
}

export function StatusDot({ active }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400')}>
      <span className={cx('h-2 w-2 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600')} />
      {active ? 'Active' : 'Disabled'}
    </span>
  );
}

const AVATAR_COLORS = ['bg-olive-600', 'bg-sky-600', 'bg-violet-600', 'bg-amber-600', 'bg-teal-600', 'bg-rose-600', 'bg-indigo-600'];
export function Avatar({ name, size = 'h-9 w-9 text-xs' }) {
  const color = AVATAR_COLORS[[...(name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white', color, size)}>
      {initials(name)}
    </span>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={cx('animate-fade-up flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-[#101a33]', width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-white/10">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-white/10">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ThemeToggle({ className }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      className={cx(
        'inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200',
        className
      )}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {Icon && <div className="mb-4 rounded-2xl bg-olive-50 p-4 text-olive-600 dark:bg-olive-500/10"><Icon className="h-7 w-7" /></div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end">
        {toasts.map((t) => (
          <div key={t.id} className="animate-fade-up flex max-w-sm items-center gap-3 rounded-xl bg-navy-900 px-4 py-3 text-sm text-white shadow-xl">
            {t.type === 'error' ? <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-lime-brand" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
