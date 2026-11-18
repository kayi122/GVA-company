import { useState } from 'react';
import { Lock, Mail, Phone, AtSign, Users } from 'lucide-react';
import { api, useAuth, timeAgo } from '../lib.jsx';
import { Avatar, Button, Card, Field, Input, PageHeader, RoleBadge, useToast } from '../components/ui.jsx';

export default function Profile() {
  const { user } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { current: form.current, next: form.next } });
      toast('Password changed');
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    [AtSign, 'Username', user.username],
    [Mail, 'Email', user.email],
    [Phone, 'Phone', user.phone ?? '—'],
    ...(user.supervisor ? [[Users, 'Supervisor', user.supervisor.fullName]] : []),
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader title="My profile" subtitle="Your account details and password." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-4">
            <Avatar name={user.fullName} size="h-16 w-16 text-lg" />
            <div>
              <div className="text-lg font-bold">{user.fullName}</div>
              <div className="mt-1"><RoleBadge role={user.role} /></div>
            </div>
          </div>
          <dl className="mt-6 space-y-4">
            {rows.map(([Icon, label, value]) => (
              <div key={label} className="flex items-center gap-3 text-sm">
                <Icon className="h-4 w-4 text-slate-400" />
                <dt className="w-24 text-slate-500">{label}</dt>
                <dd className="min-w-0 truncate font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-xs text-slate-400">Member since {new Date(user.createdAt).toLocaleDateString()} · last sign-in {timeAgo(user.lastLoginAt)}</p>
        </Card>
        <Card className="p-6 lg:col-span-3">
          <h2 className="font-bold">Change password</h2>
          <p className="text-sm text-slate-500">Use at least 8 characters. You'll still confirm each sign-in with an email code.</p>
          <form onSubmit={submit} className="mt-5 max-w-md space-y-4">
            <Field label="Current password"><Input icon={Lock} type="password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required autoComplete="current-password" /></Field>
            <Field label="New password"><Input icon={Lock} type="password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required minLength={8} autoComplete="new-password" /></Field>
            <Field label="Repeat new password"><Input icon={Lock} type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required autoComplete="new-password" /></Field>
            {error && <p className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
            <Button type="submit" loading={busy}>Update password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
