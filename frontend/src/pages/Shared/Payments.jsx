import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Download, Undo2 } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';
import { exportCsv } from '../../utils/exportCsv';
import { inr, orderNo, fmtDateTime } from '../../utils/format';

const STATUS_BADGE = { Paid: 'bg-success', Pending: 'bg-warning text-dark', Refunded: 'bg-info text-dark', Failed: 'bg-secondary' };

export default function PaymentsPage({ apiPrefix }) {
  const isAdmin = apiPrefix === '/admin';
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState('All');
  const [method, setMethod] = useState('All');

  const load = () => {
    api.get(`${apiPrefix}/payments`, { params: { status, method } }).then((r) => setRows(r.data)).catch(() => toast.error('Could not load payments'));
    api.get(`${apiPrefix}/payments/summary`).then((r) => setSummary(r.data)).catch(() => {});
    api.get(`${apiPrefix}/refund-requests`).then((r) => setRequests(r.data)).catch(() => {});
  };
  useEffect(load, [apiPrefix, status, method]);

  const refund = async (p) => {
    if (!window.confirm(`Refund ${inr(p.amount)} for order ${orderNo(p.order_id)}?`)) return;
    try {
      const res = await api.post(`${apiPrefix}/payments/${p.id}/refund`, {});
      toast.success(res.data.refund_id ? `Refunded · ${res.data.refund_id}` : 'Refund recorded');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Refund failed'); }
  };

  const resolve = async (r, decision) => {
    const note = decision === 'Rejected' ? window.prompt('Reason for the customer (optional)') || '' : '';
    try {
      await api.post(`${apiPrefix}/refund-requests/${r.id}/resolve`, { decision, note });
      toast.success(`Request ${decision.toLowerCase()}`);
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not update'); }
  };

  const pending = requests.filter((r) => r.status === 'Pending');
  const cards = summary && [
    ['Collected', inr(summary.collected)], ['Online (Razorpay)', inr(summary.online)], ['Cash / counter', inr(summary.cash)],
    ['Cash still to collect', inr(summary.pending_cod)], ['Refunded', inr(summary.refunded)], ['Failed gateway tries (7d)', summary.failed_gateway_7d],
  ];

  return (
    <DashboardLayout>
      <PageHeader icon={CreditCard} title="Payments & Refunds" subtitle="Every rupee in and out — online, cash and counter."
        action={<button className="btn btn-outline-dark d-flex align-items-center gap-1" onClick={() => exportCsv('payments.csv', [
          { key: 'id', label: 'Payment' }, { label: 'Order', value: (p) => orderNo(p.order_id) }, { key: 'customer_name', label: 'Customer' },
          { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'status', label: 'Status' },
          { key: 'gateway_payment_id', label: 'Razorpay payment id' }, { key: 'refund_id', label: 'Refund id' },
        ], rows)}><Download size={14} /> CSV</button>} />

      {cards && (
        <div className="row g-3 mb-3">
          {cards.map(([l, v]) => <div className="col-6 col-md-2" key={l}><div className="card p-3 text-center h-100"><div className="text-muted" style={{ fontSize: 11.5 }}>{l}</div><div className="fw-bold fs-5">{v}</div></div></div>)}
        </div>
      )}

      {pending.length > 0 && (
        <div className="card p-3 mb-3" style={{ borderColor: 'var(--accent)' }}>
          <h6>Refund requests waiting ({pending.length})</h6>
          {pending.map((r) => (
            <div key={r.id} className="d-flex justify-content-between align-items-center flex-wrap gap-2 border-top py-2" style={{ fontSize: 13.5 }}>
              <span><strong>{orderNo(r.order_id)}</strong> · {r.customer_name} · {inr(r.total_amount)}<br /><span className="text-muted">“{r.reason}”</span></span>
              <span className="d-flex gap-2">
                <button className="btn btn-sm btn-dark" onClick={() => resolve(r, 'Approved')}>Approve & refund</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => resolve(r, 'Rejected')}>Decline</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="d-flex gap-2 mb-3 flex-wrap">
        {['All', 'Paid', 'Pending', 'Refunded', 'Failed'].map((s) => <button key={s} className={`filter-pill${status === s ? ' active' : ''}`} onClick={() => setStatus(s)}>{s}</button>)}
        <select className="filter-pill" style={{ border: '1.5px solid var(--border)' }} value={method} onChange={(e) => setMethod(e.target.value)}>
          {['All', 'Cash', 'UPI', 'Card', 'Netbanking', 'Wallet'].map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>

      <div className="card"><div className="table-responsive"><table className="table align-middle mb-0">
        <thead><tr><th>Order</th><th>Customer</th>{isAdmin && <th>Restaurant</th>}<th>Amount</th><th>Method</th><th>Status</th><th>Gateway reference</th><th /></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><strong>{orderNo(p.order_id)}</strong><div className="text-muted" style={{ fontSize: 11.5 }}>{fmtDateTime(p.created_at)}{p.source === 'POS' ? ' · POS' : ''}</div></td>
              <td>{p.customer_name}</td>
              {isAdmin && <td>{p.restaurant_name}</td>}
              <td>{inr(p.amount)}</td>
              <td>{p.method}{p.card_last4 ? ` ••${p.card_last4}` : ''}{p.upi_masked ? ` ${p.upi_masked}` : ''}</td>
              <td><span className={`badge ${STATUS_BADGE[p.status]}`}>{p.status}</span></td>
              <td className="text-muted" style={{ fontSize: 11.5 }}>{p.gateway_payment_id || '—'}{p.refund_id && <div>↩ {p.refund_id}</div>}</td>
              <td className="text-end">{p.status === 'Paid' && <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => refund(p)}><Undo2 size={13} /> Refund</button>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="text-center text-muted py-4">No payments match.</td></tr>}
        </tbody></table></div></div>
    </DashboardLayout>
  );
}
