import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, KeyRound, Power, Copy, Users as UsersIcon, Check } from 'lucide-react';
import { api, useAuth, ROLE_META, ROLES, timeAgo } from '../lib.jsx';
import { Avatar, Button, Card, Empty, Field, Input, Modal, PageHeader, RoleBadge, Select, Spinner, StatusDot, cx, useToast } from '../components/ui.jsx';

export default function UsersPage() {
  const { can, user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | user
  const [secret, setSecret] = useState(null); // {username, tempPassword}
  const manage = can('users.manage');

  const load = useCallback(() => api('/users').then((d) => setUsers(d.users)).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const supervisors = useMemo(() => (users ?? []).filter((u) => u.role === 'SUPERVISOR'), [users]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(ROLES.map((r) => [r, 0]));
    (users ?? []).forEach((u) => c[u.role]++);
    return c;
  }, [users]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (users ?? []).filter(
      (u) => (!role || u.role === role) && (!s || [u.fullName, u.username, u.email, u.phone].some((v) => v?.toLowerCase().includes(s)))
    );
  }, [users, role, q]);

  const toggleActive = async (u) => {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } });
      toast(`${u.fullName} ${u.isActive ? 'disabled' : 'enabled'}`);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const resetPassword = async (u) => {
    if (!confirm(`Reset the password for ${u.fullName}? Their old password will stop working.`)) return;
    try {
      setSecret(await api(`/users/${u.id}/reset-password`, { method: 'POST' }));
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Users"
        subtitle="Create accounts, assign agents to supervisors and control who can sign in."
        actions={manage && <Button icon={Plus} onClick={() => setEditing({})}>Add user</Button>}
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[['', 'All', users?.length ?? 0], ...ROLES.map((r) => [r, ROLE_META[r].label, counts[r]])].map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setRole(key)}
            className={cx(
              'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition',
              role === key
                ? 'border-olive-600 bg-olive-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
            )}
          >
            {label} <span className={cx('ml-1', role === key ? 'text-white/80' : 'text-slate-400')}>{n}</span>
          </button>
        ))}
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4 dark:border-white/10">
          <div className="max-w-sm">
            <Input icon={Search} placeholder="Search name, username, email or phone" value={q} onChange={(e) => setQ(e.target.value)} className="h-10" />
          </div>
        </div>
        {!users ? (
          <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div>
        ) : shown.length === 0 ? (
          <Empty icon={UsersIcon} title="No users found" text="Try another search or role filter." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="label-caps text-slate-400">
                  <tr className="border-b border-slate-100 dark:border-white/10">
                    <th className="px-5 py-3 font-semibold">User</th>
                    <th className="px-5 py-3 font-semibold">Role</th>
                    <th className="px-5 py-3 font-semibold">Team</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Last sign-in</th>
                    {manage && <th className="px-5 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {shown.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.fullName} />
                          <div className="min-w-0">
                            <div className="font-semibold">{u.fullName}</div>
                            <div className="text-xs text-slate-500">@{u.username} · {u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                        {u.role === 'AGENT' ? u.supervisor?.fullName ?? <span className="text-amber-600">Unassigned</span>
                          : u.role === 'SUPERVISOR' ? `${u._count.agents} agents` : '—'}
                      </td>
                      <td className="px-5 py-3"><StatusDot active={u.isActive} /></td>
                      <td className="px-5 py-3 text-slate-500">{timeAgo(u.lastLoginAt)}</td>
                      {manage && (
                        <td className="px-5 py-3">
                          <RowActions u={u} me={me} onEdit={() => setEditing(u)} onReset={() => resetPassword(u)} onToggle={() => toggleActive(u)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden dark:divide-white/5">
              {shown.map((u) => (
                <li key={u.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.fullName} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{u.fullName}</div>
                      <div className="truncate text-xs text-slate-500">@{u.username}</div>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      <StatusDot active={u.isActive} />
                      {u.role === 'AGENT' && <span className="ml-2">· {u.supervisor?.fullName ?? 'Unassigned'}</span>}
                    </div>
                    {manage && <RowActions u={u} me={me} onEdit={() => setEditing(u)} onReset={() => resetPassword(u)} onToggle={() => toggleActive(u)} />}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {editing && (
        <UserForm
          user={editing}
          supervisors={supervisors}
          onClose={() => setEditing(null)}
          onSaved={(res) => {
            setEditing(null);
            toast(editing.id ? 'User updated' : 'User created');
            if (res.tempPassword) setSecret({ username: res.user.username, tempPassword: res.tempPassword });
            load();
          }}
        />
      )}
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </div>
  );
}

function RowActions({ u, me, onEdit, onReset, onToggle }) {
  const btn = 'rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white';
  return (
    <div className="flex justify-end gap-1">
      <button className={btn} onClick={onEdit} title="Edit"><Pencil className="h-4 w-4" /></button>
      <button className={btn} onClick={onReset} title="Reset password"><KeyRound className="h-4 w-4" /></button>
      {u.id !== me.id && (
        <button className={cx(btn, u.isActive ? 'hover:!text-rose-600' : 'hover:!text-emerald-600')} onClick={onToggle} title={u.isActive ? 'Disable' : 'Enable'}>
          <Power className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function UserForm({ user, supervisors, onClose, onSaved }) {
  const isNew = !user.id;
  const [form, setForm] = useState({
    fullName: user.fullName ?? '',
    username: user.username ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    role: user.role ?? 'AGENT',
    supervisorId: user.supervisorId ?? '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { fullName: form.fullName, email: form.email, phone: form.phone, role: form.role, supervisorId: form.role === 'AGENT' && form.supervisorId ? Number(form.supervisorId) : null };
    if (isNew) Object.assign(body, { username: form.username, password: form.password });
    try {
      onSaved(await api(isNew ? '/users' : `/users/${user.id}`, { method: isNew ? 'POST' : 'PATCH', body }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Add a user' : `Edit ${user.fullName}`}
      subtitle={isNew ? 'They will sign in with this username, their password and a code sent to their email.' : `@${user.username}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="user-form" loading={busy}>{isNew ? 'Create user' : 'Save changes'}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={save} className="space-y-4">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Role</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ROLES.map((r) => (
              <button
                type="button"
                key={r}
                onClick={() => setForm({ ...form, role: r })}
                className={cx(
                  'rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                  form.role === r
                    ? 'border-olive-600 bg-olive-50 text-olive-700 ring-2 ring-olive-500/20 dark:bg-olive-500/10 dark:text-lime-brand'
                    : 'border-slate-200 hover:border-slate-300 dark:border-white/10'
                )}
              >
                {ROLE_META[r].label}
              </button>
            ))}
          </div>
        </div>
        {form.role === 'AGENT' && (
          <Field label="Supervisor (team)" hint="Each supervisor normally leads 10 agents.">
            <Select value={form.supervisorId} onChange={set('supervisorId')}>
              <option value="">— Not assigned yet —</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName} ({s._count.agents} agents)</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Full name"><Input value={form.fullName} onChange={set('fullName')} required /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {isNew && <Field label="Username"><Input value={form.username} onChange={set('username')} required placeholder="e.g. agent51" /></Field>}
          <Field label="Phone"><Input value={form.phone} onChange={set('phone')} placeholder="07…" inputMode="tel" /></Field>
        </div>
        <Field label="Email" hint="Sign-in codes are sent here.">
          <Input type="email" value={form.email} onChange={set('email')} required />
        </Field>
        {isNew && (
          <Field label="Password" hint="Leave empty to generate a temporary password.">
            <Input type="text" value={form.password} onChange={set('password')} placeholder="Auto-generate" autoComplete="new-password" />
          </Field>
        )}
        {error && <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      </form>
    </Modal>
  );
}

function SecretModal({ secret, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!secret) return null;
  const copy = async () => {
    await navigator.clipboard?.writeText(`Username: ${secret.username}\nTemporary password: ${secret.tempPassword}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Modal open onClose={onClose} title="Temporary password" subtitle="Share it privately. It is shown only once." width="max-w-md"
      footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
        <div className="flex justify-between text-sm"><span className="text-slate-500">Username</span><span className="font-semibold">{secret.username}</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-500">Password</span><span className="font-mono font-semibold tracking-wider">{secret.tempPassword}</span></div>
      </div>
      <Button variant="secondary" icon={copied ? Check : Copy} onClick={copy} className="mt-4 w-full">{copied ? 'Copied' : 'Copy details'}</Button>
      <p className="mt-3 text-xs text-slate-500">They can change it from “My profile” after signing in.</p>
    </Modal>
  );
}
