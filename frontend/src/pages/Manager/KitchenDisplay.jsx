import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Flame, ChevronRight, X } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import VegMark from '../../components/VegMark';
import api from '../../services/api';
import { orderNo } from '../../utils/format';
import { useLive } from '../../context/LiveContext';
import { ding } from '../../utils/sound';

const COLUMNS = [
  { status: 'Pending', next: 'Accepted', cta: 'Accept' },
  { status: 'Accepted', next: 'Preparing', cta: 'Start cooking' },
  { status: 'Preparing', next: 'Ready', cta: 'Mark ready' },
  { status: 'Ready', next: 'Completed', cta: 'Handed over' },
];

const minutesSince = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 60000);

export default function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [, tick] = useState(0);
  const [requests, setRequests] = useState([]);
  const loadRequests = () => api.get('/manager/service-requests').then((res) => setRequests(res.data)).catch(() => {});
  const seen = useRef(null);

  const load = () =>
    api.get('/manager/orders/kitchen').then((res) => {
      const pendingIds = res.data.filter((o) => o.status === 'Pending').map((o) => o.id);
      if (seen.current) {
        const fresh = pendingIds.filter((id) => !seen.current.has(id));
        if (fresh.length) toast(`🔔 ${fresh.length} new order${fresh.length > 1 ? 's' : ''}!`, { duration: 5000 });
      }
      seen.current = new Set(pendingIds);
      setOrders(res.data);
    }).catch(() => {});

  useEffect(() => {
    load();
    loadRequests();
    const poll = setInterval(() => { load(); loadRequests(); }, 30000); // fallback — live events refresh instantly
    const clock = setInterval(() => tick((n) => n + 1), 30000); // keeps the timers moving between polls
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  useLive('order:new', () => { load(); ding(); });
  useLive('order:update', () => load());
  useLive('service:new', (r) => { loadRequests(); ding(); toast(`${r.table_no ? `Table ${r.table_no}` : r.customer_name}: ${r.type.toLowerCase()} requested`, { icon: '🛎️', duration: 6000 }); });
  useLive('service:done', () => loadRequests());

  const doneRequest = async (r) => { await api.patch(`/manager/service-requests/${r.id}/done`).catch(() => {}); loadRequests(); };

  const move = async (o, status) => {
    const body = { status };
    if (status === 'Completed' && o.needs_code) {
      const code = window.prompt('Enter the customer\'s 4-digit hand-over code');
      if (code === null) return;
      body.handover_code = code;
    }
    try {
      await api.patch(`/manager/orders/${o.id}/status`, body);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update order');
    }
  };

  const reject = (o) => { if (window.confirm(`Cancel order ${orderNo(o.id)}?`)) move(o, 'Cancelled'); };

  return (
    <DashboardLayout>
      <PageHeader icon={Flame} title="Kitchen Display" subtitle="Live board — refreshes every few seconds. Timers turn red when an order runs late." />
      {requests.length > 0 && (
        <div className="service-strip">
          {requests.map((r) => (
            <div key={r.id} className="service-chip">
              <span>🛎️ <strong>{r.table_no ? `Table ${r.table_no}` : r.customer_name}</strong> · {r.type === 'Bill' ? 'wants the bill' : r.type === 'Water' ? 'water please' : r.type === 'Help' ? 'needs help' : 'calling the waiter'}</span>
              <button className="btn btn-sm btn-dark" onClick={() => doneRequest(r)}>Done</button>
            </div>
          ))}
        </div>
      )}
      <div className="kds-board">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <div className="kds-col" key={col.status}>
              <h6>{col.status} <span>{list.length}</span></h6>
              {list.map((o) => {
                const mins = minutesSince(o.created_at);
                const late = !o.scheduled_for && mins > o.eta_minutes && col.status !== 'Ready';
                return (
                  <div key={o.id} className={`kds-card${late ? ' late' : ''}`}>
                    <div className="d-flex justify-content-between align-items-center">
                      <strong style={{ fontFamily: 'var(--font-display)' }}>{orderNo(o.id)}</strong>
                      <span className={`timer${late ? ' late' : ''}`}>{mins}m</span>
                    </div>
                    <div className="d-flex align-items-center gap-2 mt-1">
                      <span className={`type-badge ${o.order_type === 'Pickup' ? 'pickup' : o.order_type === 'Dine-in' ? 'dine-in' : ''}`}>{o.order_type}{o.table_no ? ` · ${o.table_no}` : ''}</span>
                      <span className="text-muted" style={{ fontSize: 12.5 }}>{o.customer_name}</span>
                    </div>
                    <ul>
                      {o.items.map((it) => (
                        <li key={it.menu_item_id} className="d-flex align-items-center gap-2"><VegMark isVeg={!!it.is_veg} /><strong>{it.quantity}×</strong> {it.name}</li>
                      ))}
                    </ul>
                    {o.scheduled_for && <div className="kds-note" style={{ background: 'var(--info-soft)' }}>🕒 Scheduled {new Date(o.scheduled_for).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>}
                    {o.notes && <div className="kds-note">📝 {o.notes}</div>}
                    <div className="d-flex gap-2">
                      <button className="btn btn-sm btn-dark flex-grow-1 d-flex align-items-center justify-content-center gap-1" onClick={() => move(o, col.next)}>
                        {col.cta} <ChevronRight size={13} />
                      </button>
                      {['Pending', 'Accepted', 'Preparing'].includes(col.status) && (
                        <button className="btn btn-sm btn-outline-danger" title="Cancel order" onClick={() => reject(o)}><X size={14} /></button>
                      )}
                    </div>
                  </div>
                );
              })}
              {list.length === 0 && <p className="text-muted text-center small mt-4">Nothing here</p>}
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
