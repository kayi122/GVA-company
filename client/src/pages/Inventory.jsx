import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, PackagePlus, History, SlidersHorizontal, Boxes, AlertTriangle, Undo2 } from 'lucide-react';
import { api, useAuth, timeAgo } from '../lib.jsx';
import { Button, Card, Field, Input, Modal, PageHeader, Select, Spinner, cx, useToast } from '../components/ui.jsx';

const REASON = { RECEIVED: 'Received', ISSUED: 'Issued', RETURNED: 'Returned', ADJUSTED: 'Count corrected' };

export default function Inventory() {
  const { can } = useAuth();
  const toast = useToast();
  const manage = can('inventory.manage');
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null); // {type:'move'|'history'|'item', item}
  const load = useCallback(() => api('/inventory').then((d) => setItems(d.items)).catch((e) => toast(e.message, 'error')), [toast]);
  useEffect(() => { load(); }, [load]);
  const low = (items ?? []).filter((i) => i.low);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Inventory" subtitle="Routers, ONTs, cable and accessories in the store. Materials are deducted when operations issues them to a technician."
        actions={manage && <Button icon={Plus} onClick={() => setModal({ type: 'item', item: {} })}>New item</Button>} />

      {low.length > 0 && (
        <Card className="mb-6 flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <div className="font-bold">Running low: {low.length} item{low.length > 1 && 's'}</div>
            <div className="text-sm text-slate-500">{low.map((i) => `${i.name} (${i.quantity} ${i.unit})`).join(' · ')}</div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {!items ? <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="label-caps text-slate-400">
                <tr className="border-b border-slate-100 dark:border-white/10">
                  <th className="px-6 py-3 text-left font-semibold">Item</th>
                  <th className="px-3 text-right font-semibold">In stock</th>
                  <th className="px-3 text-left font-semibold">Level</th>
                  <th className="px-3 text-right font-semibold">Used (30 days)</th>
                  <th className="px-3 text-right font-semibold">Per install</th>
                  <th className="px-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {items.map((i) => {
                  const pct = Math.min(100, (i.quantity / Math.max(1, i.minQuantity * 3)) * 100);
                  const state = i.quantity === 0 ? ['Out of stock', 'text-rose-600', 'bg-rose-500'] : i.low ? ['Low', 'text-amber-600', 'bg-amber-500'] : ['OK', 'text-emerald-600', 'bg-emerald-500'];
                  return (
                    <tr key={i.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                      <td className="px-6 py-3"><div className="font-semibold">{i.name}</div><div className="font-mono text-xs text-slate-400">{i.sku}</div></td>
                      <td className="px-3 text-right text-base font-bold">{i.quantity.toLocaleString()} <span className="text-xs font-normal text-slate-400">{i.unit}</span></td>
                      <td className="px-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-slate-100 dark:bg-white/10"><div className={cx('h-2 rounded-full', state[2])} style={{ width: `${pct}%` }} /></div>
                          <span className={cx('text-xs font-semibold', state[1])}>{state[0]}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-400">alert at {i.minQuantity} {i.unit}</div>
                      </td>
                      <td className="px-3 text-right">{i.used30d.toLocaleString()} {i.unit}</td>
                      <td className="px-3 text-right">{i.kitQuantity || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-1">
                          {manage && <Button size="sm" icon={PackagePlus} onClick={() => setModal({ type: 'move', item: i, reason: 'RECEIVED' })}>Receive</Button>}
                          {manage && <Button size="sm" variant="ghost" icon={SlidersHorizontal} onClick={() => setModal({ type: 'move', item: i, reason: 'ADJUSTED' })} aria-label="Correct count / return" />}
                          <Button size="sm" variant="ghost" icon={History} onClick={() => setModal({ type: 'history', item: i })} aria-label="History" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal?.type === 'move' && <MoveModal item={modal.item} initial={modal.reason} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Stock updated'); load(); }} />}
      {modal?.type === 'history' && <HistoryModal item={modal.item} onClose={() => setModal(null)} />}
      {modal?.type === 'item' && <ItemModal onClose={() => setModal(null)} onSaved={() => { setModal(null); toast('Item added'); load(); }} />}
    </div>
  );
}

function MoveModal({ item, initial, onClose, onSaved }) {
  const [reason, setReason] = useState(initial);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/inventory/${item.id}/movements`, { method: 'POST', body: { reason, qty: Number(qty), note } });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const opts = [['RECEIVED', 'Receive new stock', PackagePlus], ['RETURNED', 'Return unused', Undo2], ['ADJUSTED', 'Correct the count', SlidersHorizontal]];
  return (
    <Modal open onClose={onClose} title={item.name} subtitle={`Now in stock: ${item.quantity} ${item.unit}`} width="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="move-form" loading={busy}>Save</Button></>}>
      <form id="move-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {opts.map(([k, l, Icon]) => (
            <button type="button" key={k} onClick={() => setReason(k)} className={cx('flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-semibold', reason === k ? 'border-olive-600 bg-olive-50 text-olive-700 dark:bg-olive-500/10 dark:text-lime-brand' : 'border-slate-200 dark:border-white/10')}>
              <Icon className="h-5 w-5" />{l}
            </button>
          ))}
        </div>
        <Field label={reason === 'ADJUSTED' ? `Change (+ or −, in ${item.unit})` : `Quantity (${item.unit})`} hint={reason === 'ADJUSTED' ? 'e.g. −3 if 3 are missing after counting' : undefined}>
          <Input value={qty} onChange={(e) => setQty(e.target.value.replace(reason === 'ADJUSTED' ? /[^\d-]/g : /\D/g, ''))} inputMode="numeric" required autoFocus />
        </Field>
        <Field label={reason === 'ADJUSTED' ? 'Why? (required)' : 'Note (supplier, delivery number…)'}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {qty && !isNaN(Number(qty)) && <p className="text-sm text-slate-500">New balance: <b>{item.quantity + Number(qty) * (reason === 'ADJUSTED' ? 1 : 1)} {item.unit}</b></p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}

function HistoryModal({ item, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api(`/inventory/${item.id}/movements`).then((d) => setRows(d.movements)).catch(() => setRows([])); }, [item.id]);
  return (
    <Modal open onClose={onClose} title={`${item.name} — history`} subtitle="Last 100 movements" width="max-w-2xl">
      {!rows ? <div className="flex justify-center py-10 text-olive-600"><Spinner /></div> : (
        <ul className="divide-y divide-slate-100 text-sm dark:divide-white/5">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center gap-4 py-2.5">
              <span className={cx('w-16 text-right font-mono font-bold', m.change > 0 ? 'text-emerald-600' : 'text-rose-600')}>{m.change > 0 ? '+' : ''}{m.change}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{REASON[m.reason]}{m.installation && <> · <Link to={`/installations/${m.installation.id}`} className="text-olive-600 hover:underline">{m.installation.customer.fullName}</Link>{m.installation.technician && ` (${m.installation.technician.fullName})`}</>}</div>
                <div className="truncate text-xs text-slate-500">{m.user.fullName}{m.note && ` · ${m.note}`}</div>
              </div>
              <div className="text-right text-xs text-slate-400"><div>balance {m.balance}</div><div>{timeAgo(m.createdAt)}</div></div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ItemModal({ onClose, onSaved }) {
  const [f, setF] = useState({ sku: '', name: '', unit: 'pcs', quantity: '', minQuantity: '', kitQuantity: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/inventory', { method: 'POST', body: { ...f, quantity: Number(f.quantity || 0), minQuantity: Number(f.minQuantity || 0), kitQuantity: Number(f.kitQuantity || 0) } });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New stock item" width="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="item-form" loading={busy} icon={Boxes}>Add item</Button></>}>
      <form id="item-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Code" className="col-span-1"><Input value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value.toUpperCase() })} required placeholder="SPLITTER" /></Field>
          <Field label="Name" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Unit"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="pcs">pieces</option><option value="m">metres</option></Select></Field>
          <Field label="Opening stock"><Input value={f.quantity} onChange={num('quantity')} inputMode="numeric" /></Field>
          <Field label="Alert when at or below"><Input value={f.minQuantity} onChange={num('minQuantity')} inputMode="numeric" /></Field>
          <Field label="Used per installation" hint="For the standard kit"><Input value={f.kitQuantity} onChange={num('kitQuantity')} inputMode="numeric" /></Field>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
