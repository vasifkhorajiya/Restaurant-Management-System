import { useEffect, useMemo, useState } from 'react';
import { Modal } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { ChevronRight, X, RefreshCw, FileDown, Search, Eye, Download, CalendarClock, Bike } from 'lucide-react';
import api from '../services/api';
import OrderTimeline from './OrderTimeline';
import { generateBill } from '../utils/generateBill';
import { exportCsv } from '../utils/exportCsv';
import { inr, orderNo, fmtDateTime } from '../utils/format';
import { useLive } from '../context/LiveContext';
import { ding } from '../utils/sound';

const STATUSES = ['All', 'Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
const TYPES = ['All', 'Delivery', 'Pickup', 'Dine-in'];

const nextStatusMap = { Pending: 'Accepted', Accepted: 'Preparing', Preparing: 'Ready', Ready: 'Completed' };
const typeClass = (t) => (t === 'Pickup' ? 'pickup' : t === 'Dine-in' ? 'dine-in' : '');

export default function OrdersManager({ apiPrefix }) {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('All');
  const [type, setType] = useState('All');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [riders, setRiders] = useState([]);
  const isAdmin = apiPrefix === '/admin';

  const load = () => {
    api.get(`${apiPrefix}/orders`).then((res) => setOrders(res.data)).catch(() => setOrders([]));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // fallback — live events refresh instantly
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPrefix]);

  useLive('order:new', (o) => { load(); ding(); toast(`New ${o.order_type || ''} order received`, { icon: '🍽️' }); });
  useLive('order:update', () => load());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => filter === 'All' || o.status === filter)
      .filter((o) => type === 'All' || o.order_type === type)
      .filter((o) => !q || orderNo(o.id).includes(q) || String(o.id) === q || o.customer_name.toLowerCase().includes(q) || (o.customer_phone || '').includes(q));
  }, [orders, filter, type, search]);

  useEffect(() => {
    api.get(`${apiPrefix}/orders/riders`).then((res) => setRiders(res.data)).catch(() => setRiders([]));
  }, [apiPrefix]);

  const assignRider = async (order, riderId) => {
    try {
      await api.patch(`${apiPrefix}/orders/${order.id}/rider`, { rider_id: riderId || null });
      toast.success(riderId ? 'Rider assigned' : 'Rider removed');
      openDetail(order);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not assign rider');
    }
  };

  const updateStatus = async (order, status) => {
    const body = { status };
    // delivery / pickup orders are only completed with the customer's 4-digit code
    if (status === 'Completed' && order.needs_code) {
      const code = window.prompt('Enter the customer\'s 4-digit hand-over code');
      if (code === null) return;
      body.handover_code = code;
    }
    try {
      await api.patch(`${apiPrefix}/orders/${order.id}/status`, body);
      toast.success(`Order ${orderNo(order.id)} → ${status}`);
      load();
      if (detail?.id === order.id) openDetail(order);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update order');
    }
  };

  const cancelOrder = (order) => {
    if (!window.confirm('Cancel this order? Stock, points and coupon will be returned to the customer.')) return;
    updateStatus(order, 'Cancelled');
  };

  const openDetail = async (order) => {
    try {
      const res = await api.get(`${apiPrefix}/orders/${order.id}/detail`);
      setDetail(res.data);
    } catch {
      toast.error('Could not load order details');
    }
  };

  const printBill = async (order) => {
    try {
      const res = await api.get(`${apiPrefix}/orders/${order.id}/detail`);
      generateBill(res.data);
    } catch (err) {
      toast.error('Could not build the bill');
    }
  };

  const exportOrders = () =>
    exportCsv('orders.csv', [
      { label: 'Order', value: (o) => orderNo(o.id) }, { label: 'Date', value: (o) => fmtDateTime(o.created_at) },
      { key: 'customer_name', label: 'Customer' }, ...(isAdmin ? [{ key: 'restaurant_name', label: 'Restaurant' }] : []),
      { key: 'order_type', label: 'Type' }, { key: 'item_count', label: 'Items' }, { key: 'total_amount', label: 'Total' },
      { key: 'payment_method', label: 'Payment' }, { key: 'payment_status', label: 'Payment status' }, { key: 'status', label: 'Status' },
    ], filtered);

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button key={s} className={`btn btn-sm ${filter === s ? 'btn-outline-dark active' : 'btn-outline-dark'}`} onClick={() => setFilter(s)}>
              {s}
              {s !== 'All' && <span className="ms-1" style={{ opacity: 0.65 }}>({orders.filter((o) => o.status === s).length})</span>}
            </button>
          ))}
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={exportOrders}><Download size={13} /> CSV</button>
          <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={load}><RefreshCw size={13} /> Refresh</button>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="d-flex align-items-center gap-2 bg-white rounded-pill px-3 py-1 border" style={{ minWidth: 240 }}>
          <Search size={14} color="var(--muted)" />
          <input className="border-0 w-100" style={{ outline: 'none', fontSize: 13.5 }} placeholder="Order #, customer, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {TYPES.map((t) => <button key={t} className={`filter-pill${type === t ? ' active' : ''}`} onClick={() => setType(t)}>{t === 'All' ? 'All types' : t}</button>)}
      </div>

      <div className="row g-3">
        {filtered.map((o) => (
          <div className="col-md-6 col-lg-4" key={o.id}>
            <div className="order-card h-100 d-flex flex-column" data-status={o.status}>
              <div className="accent" />
              <div className="body flex-grow-1">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="order-no">{orderNo(o.id)}</span>
                  <div className="d-flex gap-2 align-items-center">
                    <span className={`type-badge ${typeClass(o.order_type)}`}>{o.order_type}{o.table_no ? ` · ${o.table_no}` : ''}</span>
                    <span className="badge bg-secondary">{o.status}</span>
                  </div>
                </div>
                <div className="fw-semibold mb-1" style={{ fontSize: 13.5 }}>{o.customer_name}{isAdmin && <span className="text-muted fw-normal"> · {o.restaurant_name}</span>}</div>
                <div className="text-muted mb-1" style={{ fontSize: 13 }}>{o.item_count} item(s) · {fmtDateTime(o.created_at)}</div>
                {o.scheduled_for && <div className="mb-2"><span className="sched-pill"><CalendarClock size={12} /> {fmtDateTime(o.scheduled_for)}</span></div>}
                {o.rider_name && <div className="small mb-1"><Bike size={13} /> {o.rider_name}</div>}
                {o.source === 'POS' && <span className="badge bg-dark mb-1">POS</span>}
                {o.notes && <div className="kds-note mb-2">📝 {o.notes}</div>}
                <div className="d-flex justify-content-between align-items-center">
                  <span className="order-total">{inr(o.total_amount)}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>{o.payment_method} · {o.payment_status}</span>
                </div>
              </div>
              <div className="actions">
                {nextStatusMap[o.status] && (
                  <button className="btn btn-sm btn-dark d-flex align-items-center gap-1" onClick={() => updateStatus(o, nextStatusMap[o.status])}>
                    Fire to {nextStatusMap[o.status]} <ChevronRight size={14} />
                  </button>
                )}
                {['Pending', 'Accepted', 'Preparing'].includes(o.status) && (
                  <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => cancelOrder(o)}>
                    <X size={14} /> {o.status === 'Pending' ? 'Reject' : 'Cancel'}
                  </button>
                )}
                <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={() => openDetail(o)}><Eye size={14} /> Details</button>
                {o.status === 'Completed' && (
                  <button className="btn btn-sm btn-outline-success d-flex align-items-center gap-1" onClick={() => printBill(o)}><FileDown size={14} /> Bill</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-12"><p className="text-muted text-center py-5 mb-0">No orders match these filters.</p></div>
        )}
      </div>

      <Modal show={!!detail} onHide={() => setDetail(null)} centered scrollable size="lg">
        {detail && (
          <>
            <Modal.Header closeButton>
              <Modal.Title style={{ fontSize: 17 }}>Order {orderNo(detail.id)} · {detail.status}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div className="row g-4">
                <div className="col-md-6">
                  <div className="fw-semibold mb-1">{detail.customer_name}</div>
                  <div className="text-muted small mb-2">{detail.customer_phone}</div>
                  <span className={`type-badge ${typeClass(detail.order_type)}`}>{detail.order_type}</span>
                  {detail.delivery_address && <p className="small mt-2 mb-1">📍 {detail.delivery_address}</p>}
                  {detail.table_no && <p className="small mt-2 mb-1">Table {detail.table_no}</p>}
                  {detail.notes && <div className="kds-note mt-2">📝 {detail.notes}</div>}
                  <div className="fw-semibold mt-3 mb-2" style={{ fontSize: 13.5 }}>Timeline</div>
                  <OrderTimeline history={detail.history} status={detail.status} />
                </div>
                <div className="col-md-6">
                  <div className="fw-semibold mb-2" style={{ fontSize: 13.5 }}>Items</div>
                  {detail.items.map((i) => (
                    <div key={i.menu_item_id} className="d-flex justify-content-between small mb-1"><span>{i.quantity}× {i.name}</span><span>{inr(i.price * i.quantity)}</span></div>
                  ))}
                  <div className="border-top mt-2 pt-2 small">
                    <div className="d-flex justify-content-between"><span className="text-muted">Item total</span><span>{inr(detail.subtotal)}</span></div>
                    {Number(detail.discount_amount) > 0 && <div className="d-flex justify-content-between"><span className="text-muted">Discounts{detail.coupon_code ? ` (${detail.coupon_code})` : ''}</span><span>− {inr(detail.discount_amount)}</span></div>}
                    {detail.order_type === 'Delivery' && <div className="d-flex justify-content-between"><span className="text-muted">Delivery</span><span>{Number(detail.delivery_fee) ? inr(detail.delivery_fee) : 'FREE'}</span></div>}
                    <div className="d-flex justify-content-between"><span className="text-muted">Taxes</span><span>{inr(detail.tax_amount)}</span></div>
                    {Number(detail.tip_amount) > 0 && <div className="d-flex justify-content-between"><span className="text-muted">Tip</span><span>{inr(detail.tip_amount)}</span></div>}
                    <div className="d-flex justify-content-between fw-bold fs-6 mt-1"><span>Total</span><span>{inr(detail.total_amount)}</span></div>
                  </div>
                  <p className="small text-muted mt-3 mb-0">Payment: {detail.payment_method} · {detail.payment_status}{detail.gateway_payment_id ? ` · ${detail.gateway_payment_id}` : ''}{detail.refund_id ? ` · refund ${detail.refund_id}` : ''}</p>
                  {detail.scheduled_for && <p className="small mt-2 mb-0"><span className="sched-pill"><CalendarClock size={12} /> Scheduled {fmtDateTime(detail.scheduled_for)}</span></p>}
                  {detail.order_type === 'Delivery' && !['Completed', 'Cancelled'].includes(detail.status) && (
                    <div className="mt-3">
                      <label className="form-label small mb-1 d-flex align-items-center gap-1"><Bike size={13} /> Delivery partner</label>
                      <select className="form-select form-select-sm" value={detail.rider_id || ''} onChange={(e) => assignRider(detail, e.target.value)}>
                        <option value="">Unassigned</option>
                        {riders.filter((r) => isAdmin ? true : true).map((r) => <option key={r.id} value={r.id}>{r.name}{r.phone ? ` · ${r.phone}` : ''}</option>)}
                      </select>
                      {riders.length === 0 && <div className="text-muted" style={{ fontSize: 11.5 }}>Add staff with position "Delivery" to assign riders.</div>}
                    </div>
                  )}
                  {detail.needs_code && detail.status === 'Ready' && <p className="small text-muted mt-2 mb-0">To hand over, you'll need the customer's 4-digit code.</p>}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              {nextStatusMap[detail.status] && <button className="btn btn-dark" onClick={() => updateStatus(detail, nextStatusMap[detail.status])}>Fire to {nextStatusMap[detail.status]}</button>}
              {detail.status === 'Completed' && <button className="btn btn-outline-success" onClick={() => generateBill(detail)}>Download Bill</button>}
              <button className="btn btn-outline-secondary" onClick={() => setDetail(null)}>Close</button>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </div>
  );
}
