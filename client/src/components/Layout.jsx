import { Suspense, useEffect, useState } from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';
import { Spinner } from './ui.jsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Network, ShieldCheck, ScrollText, UserCircle, LogOut, Menu, X,
  Plus, Contact, Target, Gauge, CalendarDays, Wallet, Wrench, Boxes, BarChart3, DatabaseBackup,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import NotificationBell from './NotificationBell.jsx';
import { useAuth, ROLE_META } from '../lib.jsx';
import { Brand } from './Brand.jsx';
import { Avatar, ThemeToggle, cx } from './ui.jsx';

const CUSTOMER_PERMS = ['customers.view_own', 'customers.view_team', 'customers.view_all'];

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customers', label: 'Customers', icon: Contact, perm: CUSTOMER_PERMS },
  { to: '/calendar', label: 'Visits calendar', icon: CalendarDays, perm: CUSTOMER_PERMS },
  { to: '/payments', label: 'Payments', icon: Wallet, perm: ['payments.record', 'payments.confirm_supervisor', 'payments.confirm_finance'] },
  { to: '/installations', label: 'Installations', icon: Wrench, perm: ['installs.assign', 'customers.view_all'] },
  { to: '/installations', label: 'My jobs', icon: Wrench, perm: ['installs.complete'], only: (can) => !can('installs.assign', 'customers.view_all') },
  { to: '/inventory', label: 'Inventory', icon: Boxes, perm: ['inventory.manage', 'installs.assign'] },
  { to: '/packages', label: 'Packages', icon: Gauge, perm: ['packages.manage'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: ['reports.team', 'reports.all'] },
  { to: '/targets', label: 'Targets', icon: Target, perm: ['targets.manage_team', 'targets.manage_all'] },
  { to: '/users', label: 'Users', icon: Users, perm: ['users.view'] },
  { to: '/teams', label: 'Teams', icon: Network, perm: ['users.view'] },
  { to: '/permissions', label: 'Permissions', icon: ShieldCheck, perm: ['permissions.manage'] },
  { to: '/audit', label: 'Audit log', icon: ScrollText, perm: ['audit.view'] },
  { to: '/system', label: 'System & backups', icon: DatabaseBackup, perm: ['backups.manage'] },
  { to: '/profile', label: 'My profile', icon: UserCircle },
];

// Modules arriving in later phases — shown greyed out so everyone sees what's coming.
const SOON = [
];

const TITLES = {
  '/': 'Dashboard', '/customers/new': 'New customer', '/customers': 'Customers', '/calendar': 'Visits calendar', '/reports': 'Reports', '/payments': 'Payments', '/installations': 'Installations', '/inventory': 'Inventory', '/packages': 'Packages', '/system': 'System', '/targets': 'Targets',
  '/users': 'Users', '/teams': 'Teams', '/permissions': 'Permissions', '/audit': 'Audit log', '/profile': 'My profile',
};
const titleFor = (path) => TITLES[path] ?? (path.startsWith('/customers/') ? 'Customer' : path.startsWith('/installations/') ? 'Installation' : '');

export default function Layout() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const { pathname } = useLocation();

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pb-6 pt-7">
        <Brand compact />
        <button className="text-slate-400 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-6 w-6" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="label-caps px-3 pb-2 text-slate-500">Workspace</div>
        {NAV.filter((n) => (!n.perm || can(...n.perm)) && (!n.only || n.only(can))).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx(
                'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-white/10 text-white shadow-[inset_3px_0_0_var(--color-lime-brand)]' : 'text-slate-300 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
        {SOON.some((s) => can(...s.perm)) && <div className="label-caps px-3 pb-2 pt-6 text-slate-500">Coming next</div>}
        {SOON.filter((s) => can(...s.perm)).map(({ label, icon: Icon }) => (
          <div key={label} className="mb-0.5 flex cursor-default items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500">
            <Icon className="h-[18px] w-[18px]" />
            {label}
            <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Soon</span>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <Avatar name={user.fullName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.fullName}</div>
            <div className="truncate text-xs text-slate-400">{ROLE_META[user.role]?.label}</div>
          </div>
          <button onClick={logout} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="hero-glow fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="hero-glow animate-fade-up absolute inset-y-0 left-0 w-72 max-w-[85vw]">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-slate-50/85 px-4 backdrop-blur sm:px-8 dark:border-white/10 dark:bg-[#0a1226]/85">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-200/60 lg:hidden dark:text-slate-300" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{titleFor(pathname)}</div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <NotificationBell />
          <ThemeToggle className="h-10 w-10" />
        </div>
      </header>

      {!online && (
        <div role="status" className="sticky top-16 z-20 bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">
          You are offline. You can read this page, but nothing can be saved until the connection is back.
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* quick "add customer" button for agents on phones */}
      {can('customers.create') && !pathname.startsWith('/customers/new') && (
        <Link
          to="/customers/new"
          aria-label="New customer"
          className="fixed bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-olive-600 text-white shadow-xl shadow-olive-700/30 transition active:scale-95 lg:hidden"
        >
          <Plus className="h-7 w-7" />
        </Link>
      )}
    </div>
  );
}
