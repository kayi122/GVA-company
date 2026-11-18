import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Gauge, AlertTriangle } from 'lucide-react';
import { api } from '../lib.jsx';
import { Button, Card, Field, Input, Modal, PageHeader, Spinner, cx, useToast } from '../components/ui.jsx';
import { money } from '../components/pipeline-ui.jsx';

export default function Packages() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => api('/packages?all=1').then((d) => setList(d.packages)).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);
  const hasExamples = list?.some((p) => p.description?.startsWith('Example'));

  return (
    <div className="animate-fade-up">
      <PageHeader title="Packages" subtitle="The internet packages agents can sell. Prices show on the payment form."
        actions={<Button icon={Plus} onClick={() => setEditing({})}>Add package</Button>} />
      {hasExamples && (
        <div className="mb-6 flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          These are example packages and prices. Edit them to GVA's real packages, or turn them off and add new ones.
        </div>
      )}
      {!list ? <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((p) => (
            <Card key={p.id} className={cx('relative p-5', !p.isActive && 'opacity-60')}>
              <button onClick={() => setEditing(p)} className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10" aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></button>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-olive-50 px-2.5 py-1 text-xs font-bold text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand"><Gauge className="h-3.5 w-3.5" />{p.speedMbps} Mbps</div>
              <div className="mt-3 text-lg font-bold">{p.name}</div>
              <div className="mt-1 text-2xl font-extrabold">{money(p.monthlyPrice)}<span className="text-sm font-medium text-slate-400"> / month</span></div>
              <div className="mt-1 text-sm text-slate-500">Installation fee {money(p.installFee)}</div>
              {p.description && <p className="mt-3 text-xs text-slate-400">{p.description}</p>}
              {!p.isActive && <span className="mt-3 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-white/10">Not for sale</span>}
            </Card>
          ))}
        </div>
      )}
      {editing && <PackageModal pkg={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Package saved'); load(); }} />}
    </div>
  );
}

function PackageModal({ pkg, onClose, onSaved }) {
  const isNew = !pkg.id;
  const [f, setF] = useState({ name: pkg.name ?? '', speedMbps: pkg.speedMbps ?? '', monthlyPrice: pkg.monthlyPrice ?? '', installFee: pkg.installFee ?? 0,
    description: pkg.description?.startsWith('Example') ? '' : pkg.description ?? '', isActive: pkg.isActive ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(isNew ? '/packages' : `/packages/${pkg.id}`, { method: isNew ? 'POST' : 'PATCH', body: { ...f, description: f.description || null } });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={isNew ? 'Add package' : `Edit ${pkg.name}`} width="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="pkg-form" loading={busy}>Save</Button></>}>
      <form id="pkg-form" onSubmit={submit} className="space-y-4">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="e.g. Home 50" /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Speed (Mbps)"><Input value={f.speedMbps} onChange={num('speedMbps')} inputMode="numeric" required /></Field>
          <Field label="Price / month (RWF)"><Input value={f.monthlyPrice} onChange={num('monthlyPrice')} inputMode="numeric" required /></Field>
        </div>
        <Field label="Installation fee (RWF)"><Input value={f.installFee} onChange={num('installFee')} inputMode="numeric" /></Field>
        <Field label="Short description (optional)"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-3 text-sm font-medium">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} className="h-5 w-5 accent-[#86a022]" /> Agents can sell this package
        </label>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
