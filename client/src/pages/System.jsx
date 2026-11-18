import { useCallback, useEffect, useState } from 'react';
import { DatabaseBackup, Download, Trash2, Mail, Server, HardDrive, CheckCircle2, AlertTriangle, Terminal, Clock } from 'lucide-react';
import { api, timeAgo } from '../lib.jsx';
import { Button, Card, PageHeader, Select, Spinner, cx, useToast } from '../components/ui.jsx';

const mb = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function System() {
  const toast = useToast();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState('');
  const [settings, setSettings] = useState(null);

  const load = useCallback(() => api('/system').then((d) => { setInfo(d); setSettings(d.settings); }).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);

  const run = async (key, fn, ok) => {
    setBusy(key);
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); await load(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(''); }
  };

  if (!info) return <div className="flex justify-center py-20 text-olive-600"><Spinner className="h-7 w-7" /></div>;
  const lastAuto = info.backups.find((b) => b.kind === 'auto');
  const dirty = settings && JSON.stringify(settings) !== JSON.stringify(info.settings);

  return (
    <div className="animate-fade-up">
      <PageHeader title="System" subtitle="Backups, email and server health." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile icon={Server} label="Version" value={info.version} sub={`${info.environment} · Node ${info.node}`} />
        <Tile icon={Clock} label="Running since" value={timeAgo(info.startedAt)} sub={new Date(info.startedAt).toLocaleString()} />
        <Tile icon={Mail} label="Email" value={info.smtpConfigured ? 'Sending' : 'Test mode'} sub={info.smtpConfigured ? 'Sign-in codes go by email' : 'Codes show on screen — not for production'} warn={!info.smtpConfigured} />
        <Tile icon={DatabaseBackup} label="Last automatic backup" value={lastAuto ? timeAgo(lastAuto.createdAt) : 'None yet'} sub={info.settings.enabled ? `Daily at ${String(info.settings.hour).padStart(2, '0')}:00` : 'Automatic backups are off'} warn={!info.settings.enabled || !lastAuto} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6">
            <div>
              <h2 className="font-bold">Backups</h2>
              <p className="text-sm text-slate-500">Each backup holds the whole database and all installation photos. Download one regularly and keep it somewhere else.</p>
            </div>
            <Button icon={DatabaseBackup} loading={busy === 'backup'} onClick={() => run('backup', () => api('/system/backups', { method: 'POST' }), (r) => `Backup created (${mb(r.backup.size)})`)}>Back up now</Button>
          </div>
          {info.backups.length === 0 ? (
            <p className="border-t border-slate-100 px-6 py-10 text-center text-sm text-slate-400 dark:border-white/10">No backups yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/5 dark:border-white/10">
              {info.backups.map((b) => (
                <li key={b.file} className="flex items-center gap-4 px-6 py-3">
                  <span className={cx('rounded-lg p-2', b.kind === 'auto' ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10' : 'bg-olive-50 text-olive-600 dark:bg-olive-500/10')}><DatabaseBackup className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{new Date(b.createdAt).toLocaleString()} <span className="ml-1 text-xs font-medium text-slate-400">{b.kind === 'auto' ? 'automatic' : 'manual'}</span></div>
                    <div className="truncate font-mono text-xs text-slate-400">{b.file} · {mb(b.size)}</div>
                  </div>
                  <a href={`/api/system/backups/${b.file}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-semibold hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"><Download className="h-4 w-4" /> Download</a>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete backup"
                    onClick={() => confirm(`Delete the backup from ${new Date(b.createdAt).toLocaleString()}? This cannot be undone.`) && run('del', () => api(`/system/backups/${b.file}`, { method: 'DELETE' }), 'Backup deleted')} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-bold">Automatic backup</h2>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm font-medium">
              Make a backup every day
              <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="h-5 w-5 accent-[#86a022]" />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm"><span className="mb-1 block text-slate-500">At</span>
                <Select value={settings.hour} onChange={(e) => setSettings({ ...settings, hour: Number(e.target.value) })} className="h-10" disabled={!settings.enabled}>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
                </Select>
              </label>
              <label className="text-sm"><span className="mb-1 block text-slate-500">Keep the last</span>
                <Select value={settings.keep} onChange={(e) => setSettings({ ...settings, keep: Number(e.target.value) })} className="h-10">
                  {[3, 7, 14, 30, 60].map((n) => <option key={n} value={n}>{n} days</option>)}
                </Select>
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-400">Manual backups are kept until you delete them. You are notified if an automatic backup fails.</p>
            <Button className="mt-4 w-full" disabled={!dirty} loading={busy === 'settings'} onClick={() => run('settings', () => api('/system/backup-settings', { method: 'PUT', body: settings }), 'Backup schedule saved')}>Save schedule</Button>
          </Card>

          <Card className="p-6">
            <h2 className="font-bold">Email</h2>
            <p className="mt-1 text-sm text-slate-500">{info.smtpConfigured ? 'Send yourself a test to check delivery.' : 'Not set up. Add the SMTP details in the server settings (see DEPLOY.md), then restart.'}</p>
            <Button variant="secondary" icon={Mail} className="mt-4 w-full" disabled={!info.smtpConfigured} loading={busy === 'mail'}
              onClick={() => run('mail', () => api('/system/test-email', { method: 'POST' }), (r) => `Test email sent to ${r.to}`)}>Send test email</Button>
          </Card>

          <Card className="p-6 text-sm">
            <h2 className="flex items-center gap-2 font-bold"><HardDrive className="h-4 w-4" /> Storage</h2>
            <dl className="mt-3 grid grid-cols-2 gap-y-1.5">
              <dt className="text-slate-500">Database</dt><dd className="text-right font-medium">{mb(info.storage.database)}</dd>
              <dt className="text-slate-500">Photos</dt><dd className="text-right font-medium">{mb(info.storage.uploads)} · {info.counts.photos}</dd>
              <dt className="text-slate-500">Backups</dt><dd className="text-right font-medium">{mb(info.storage.backups)}</dd>
              <dt className="text-slate-500">Customers</dt><dd className="text-right font-medium">{info.counts.customers.toLocaleString()}</dd>
              <dt className="text-slate-500">Installations</dt><dd className="text-right font-medium">{info.counts.installations.toLocaleString()}</dd>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-6 p-6">
        <h2 className="flex items-center gap-2 font-bold"><Terminal className="h-4 w-4" /> How to restore a backup</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>Stop the app on the server.</li>
          <li>Run the restore command with the backup file (it saves the current data first, just in case):</li>
        </ol>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-navy-900 p-4 font-mono text-xs text-lime-brand">npm run restore -w server -- {info.backups[0]?.file ?? 'gva-backup-YYYYMMDD-HHMMSS-auto.zip'}</pre>
        <p className="mt-3 text-sm text-slate-500">3. Start the app again. Restoring is done on the server on purpose, so nobody can overwrite live data by accident from a browser.</p>
      </Card>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub, warn }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4" />{label}</div>
      <div className={cx('mt-2 flex items-center gap-2 text-xl font-extrabold', warn && 'text-amber-600')}>
        {warn ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5 text-emerald-500" />}{value}
      </div>
      <div className="mt-1 text-xs text-slate-400">{sub}</div>
    </Card>
  );
}
