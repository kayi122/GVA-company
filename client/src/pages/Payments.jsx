import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Check, X, Copy, Wallet, Receipt } from 'lucide-react';
import { api, useAuth, timeAgo } from '../lib.jsx';
import { Avatar, Button, Card, Empty, Field, Input, Modal, PageHeader, Spinner, cx, useToast } from '../components/ui.jsx';
import { METHODS, PAY_STATUS, Pill, money } from '../components/pipeline-ui.jsx';
import { fmtDateTime, fmtPhone } from '../components/customer-ui.jsx';

const TABS = ['PENDING_SUPERVISOR', 'PENDING_FINANCE', 'CONFIRMED', 'REJECTED'];

export default function Payments() {
  const { can, user } = useAuth();
  const toast = useToast();
  const isFinance = can('payments.confirm_finance');
  const isSupervisor = can('payments.confirm_supervisor') && !isFinance;
  const [tab, setTab] = useState(isFinance ? 'PENDING_FINANCE' : isSupervisor ? 'PENDING_SUPERVISOR' : '');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ ...(tab && { status: tab }), ...(q && { q }) });
    api(`/payments?${p}`).then((d) => setData(d.payments)).catch((e) => toast(e.message, 'error'));
    api('/payments/summary').then(setSummary).catch(() => {});
  }, [tab, q, toast]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const confirm = async (p) => {
    setBusy(p.id);
    try {
      const step = p.status === 'PENDING_SUPERVISOR' ? 'supervisor-confirm' : 'finance-confirm';
      await api(`/payments/${p.id}/${step}`, { method: 'POST' });
      toast(step === 'finance-confirm' ? `Confirmed — installation order sent to operations` : 'Confirmed — sent to finance');
      load();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const canAct = (p) =>
    (p.status === 'PENDING_SUPERVISOR' && can('payments.confirm_supervisor') && (p.agent.supervisorId === user.id || can('customers.view_all'))) ||
    (p.status === 'PENDING_FINANCE' && isFinance);

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Payments"
        subtitle={isFinance ? 'Reconfirm payments that supervisors approved. Each confirmation sends an installation order to operations.'
          : isSupervisor ? "Check your agents' payments against the MoMo / bank message, then confirm." : 'Payments you recorded and where they are.'}
      />

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniStat label="Waiting for supervisor" value={summary.counts.PENDING_SUPERVISOR} tone="amber" />
          <MiniStat label="Waiting for finance" value={summary.counts.PENDING_FINANCE} tone="sky" />
          <MiniStat label="Sales this month" value={summary.monthSales} tone="emerald" />
          <MiniStat label="Revenue this month" value={money(summary.monthRevenue)} tone="olive" />
        </div>
      )}

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[['', 'All'], ...TABS.map((s) => [s, PAY_STATUS[s].label])].map(([k, l]) => (
          <button key={k || 'all'} onClick={() => setTab(k)}
            className={cx('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition', tab === k ? 'border-olive-600 bg-olive-600 text-white' : 'border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300')}>
            {l}{k && summary && <span className={cx('ml-1.5', tab === k ? 'text-white/80' : 'text-slate-400')}>{summary.counts[k]}</span>}
          </button>
        ))}
      </div>

      <Card>
        <div className="border-b border-slate-100 p-4 dark:border-white/10">
          <div className="max-w-sm"><Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Transaction ID, customer or phone" className="h-10" /></div>
        </div>
        {!data ? (
          <div className="flex justify-center py-16 text-olive-600"><Spinner className="h-7 w-7" /></div>
        ) : data.length === 0 ? (
          <Empty icon={Wallet} title="Nothing here" text={tab.startsWith('PENDING') ? 'No payments are waiting at this step.' : undefined} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {data.map((p) => {
              const M = METHODS[p.method];
              return (
                <li key={p.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={p.customer.fullName} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/customers/${p.customer.id}`} className="font-semibold hover:underline">{p.customer.fullName}</Link>
                        <Pill meta={PAY_STATUS[p.status]} />
                      </div>
                      <div className="text-xs text-slate-500">{fmtPhone(p.customer.phone)} · agent {p.agent.fullName}{p.agent.supervisor && !isSupervisor && ` · team ${p.agent.supervisor.fullName}`}</div>
                      <div className="text-xs text-slate-400">paid {fmtDateTime(p.paidAt)}</div>
                      {p.status === 'REJECTED' && p.rejectReason && <div className="mt-1 text-xs text-rose-600">“{p.rejectReason}”</div>}
                      {p.status === 'CONFIRMED' && p.installation && <Link to={`/installations/${p.installation.id}`} className="mt-1 block text-xs font-semibold text-olive-600">Installation #{p.installation.id} →</Link>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4 lg:w-[440px] lg:shrink-0">
                    <div><div className="text-xs text-slate-400">Amount</div><div className="font-bold">{money(p.amount)}</div></div>
                    <div><div className="text-xs text-slate-400">Package</div><div className="font-medium">{p.package.name}</div></div>
                    <div>
                      <div className="text-xs text-slate-400">Method</div>
                      <div className="flex items-center gap-1.5 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: M.swatch }} />{M.label}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Transaction ID</div>
                      <button onClick={() => { navigator.clipboard?.writeText(p.transactionId); toast('Transaction ID copied'); }} className="group flex items-center gap-1 break-all text-left font-mono text-[13px] font-semibold" title="Copy">
                        {p.transactionId} <Copy className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                      </button>
                    </div>
                  </div>
                  {canAct(p) && (
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm" icon={Check} loading={busy === p.id} onClick={() => confirm(p)}>Confirm</Button>
                      <Button size="sm" variant="secondary" icon={X} onClick={() => setRejecting(p)} aria-label="Reject" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {rejecting && <RejectModal payment={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); toast('Payment rejected — the agent was told why'); load(); }} />}
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  const tones = { amber: 'text-amber-600', sky: 'text-sky-600', emerald: 'text-emerald-600', olive: 'text-olive-700 dark:text-lime-brand' };
  return (
    <Card className="p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={cx('mt-1 text-2xl font-extrabold tracking-tight', tones[tone])}>{value}</div>
    </Card>
  );
}

function RejectModal({ payment, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/payments/${payment.id}/reject`, { method: 'POST', body: { reason } });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const quick = ['Transaction ID not found', 'Amount does not match', 'Duplicate payment', 'Wrong package'];
  return (
    <Modal open onClose={onClose} title="Reject payment" subtitle={`${payment.customer.fullName} · ${payment.transactionId}`} width="max-w-md"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" type="submit" form="reject-form" loading={busy}>Reject</Button></>}>
      <form id="reject-form" onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {quick.map((qr) => <button type="button" key={qr} onClick={() => setReason(qr)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium hover:border-rose-300 dark:border-white/10">{qr}</button>)}
        </div>
        <Field label="Reason (the agent will see this)">
          <Input icon={Receipt} value={reason} onChange={(e) => setReason(e.target.value)} required autoFocus />
        </Field>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </form>
    </Modal>
  );
}
