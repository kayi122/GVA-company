import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Auth ---------- */
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: [] });
  const refresh = useCallback(async () => {
    try {
      const d = await api('/auth/me');
      setState({ loading: false, user: d.user, permissions: d.permissions });
    } catch {
      setState({ loading: false, user: null, permissions: [] });
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setState({ loading: false, user: null, permissions: [] });
  };
  const can = (...perms) => perms.some((p) => state.permissions.includes(p));
  return <AuthCtx.Provider value={{ ...state, refresh, logout, can }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

/* ---------- Theme ---------- */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
    setDark(next);
  };
  return { dark, toggle };
}

/* ---------- Roles & formatting ---------- */
export const ROLE_META = {
  ADMIN: { label: 'Admin', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
  SUPERVISOR: { label: 'Supervisor', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
  AGENT: { label: 'Sales agent', badge: 'bg-olive-100 text-olive-700 dark:bg-olive-500/15 dark:text-lime-brand' },
  FINANCE: { label: 'Finance', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' },
  OPERATIONS: { label: 'Operations', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300' },
  TECHNICIAN: { label: 'Technician', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
};
export const ROLES = Object.keys(ROLE_META);

export function timeAgo(date) {
  if (!date) return 'Never';
  const s = (Date.now() - new Date(date).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
  return new Date(date).toLocaleDateString();
}

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
