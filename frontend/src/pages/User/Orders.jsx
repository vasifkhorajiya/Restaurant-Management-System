import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileDown, PackageSearch, ChevronDown, ChevronUp, Clock, MapPin, Bike, Undo2, CalendarClock, KeyRound, BellRing, ReceiptText, GlassWater } from 'lucide-react';
import CustomerLayout from '../../components/CustomerLayout';
import OrderTimeline from '../../components/OrderTimeline';
import StarRating from '../../components/StarRating';
import EmptyState from '../../components/EmptyState';
import api from '../../services/api';
import { useCart } from '../../context/CartContext';
import { generateBill } from '../../utils/generateBill';
import { inr, orderNo, fmtDateTime } from '../../utils/format';
import { useLive } from '../../context/LiveContext';

const TRACK_STEPS = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed'];
const TABS = ['All', 'Active', 'Completed', 'Cancelled'];

function TrackBar({ status }) {
  if (status === 'Cancelled') return <span className="badge bg-danger">Cancelled</span>;
  const currentIndex = TRACK_STEPS.indexOf(status);
  return (
    <div className="status-track">
      {TRACK_STEPS.map((step, i) => (
        <div key={step} className="d-flex align-items-center gap-1">
          <span className={`step${i <= currentIndex ? ' done' : ''}`}>{step}</span>
          {i < TRACK_STEPS.length - 1 && <span className="arrow">→</span>}
        </div>
      ))}
    </div>
  );
}

const typeClass = (t) => (t === 'Pickup' ? 'pickup' : t === 'Dine-in' ? 'dine-in' : '');

export default function UserOrders() {
  const [orders, setOrders] = useState(null);
  const [tab, setTab] = useState('All');
  const [open, setOpen] = useState({});
  const [feedback, setFeedback] = useState({});
  const { replaceCart } = useCart();
  const navigate = useNavigate();

  const load = () => api.get('/orders/my').then((res) => setOrders(res.data)).catch(() => setOrders((o) => o || []));

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // fallback — live events refresh instantly
    return () => clearInterval(interval);
  }, []);

  useLive(['order:update', 'notification'], () => load());

  const cancelOrder = async (order) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await api.patch(`/orders/${order.id}/cancel`);
      toast.success('Order cancelled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel');
    }
  };

  // uses today's prices & availability, not the old order's snapshot
  const reorder = async (order) => {
    try {
      const res = await api.get(`/orders/${order.id}/reorder`);
      const ok = res.data.filter((i) => i.available);
      if (ok.length === 0) return toast.error('None of those dishes are available right now');
      replaceCart(ok.map((i) => ({ ...i, qty: Math.min(i.qty, i.stock_qty ?? i.qty) })));
      if (ok.length < res.data.length) toast('Some dishes are unavailable and were skipped', { icon: 'ℹ️' });
      navigate('/user/cart');
    } catch {
      toast.error('Could not reorder');
    }
  };

  const callStaff = async (order, type) => {
    try {
      await api.post(`/orders/${order.id}/service-request`, { type });
      toast.success(type === 'Bill' ? 'Bill requested — on its way' : 'Staff have been notified');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send request');
    }
  };

  const requestRefund = async (order) => {
    const reason = window.prompt('What went wrong with this order?');
    if (!reason) return;
    try {
      await api.post(`/orders/${order.id}/refund-request`, { reason });
      toast.success('Refund request sent');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not send request');
    }
  };

  const submitFeedback = async (orderId) => {
    const fb = feedback[orderId];
    if (!fb?.rating) return toast.error('Pick a star rating first');
    try {
      await api.post('/reviews', { order_id: orderId, rating: fb.rating, review: fb.review || '' });
      toast.success('Thanks for the feedback!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not submit review');
    }
  };

  if (orders === null) return <CustomerLayout><p className="text-muted">Loading your orders…</p></CustomerLayout>;

  if (orders.length === 0) {
    return (
      <CustomerLayout>
        <EmptyState icon={PackageSearch} title="No orders yet" text="Once you order something, it'll show up here." action={<Link to="/user/menu" className="btn btn-dark">Browse Menu</Link>} />
      </CustomerLayout>
    );
  }

  const isActive = (o) => !['Completed', 'Cancelled'].includes(o.status);
  const shown = orders.filter((o) => tab === 'All' || (tab === 'Active' ? isActive(o) : o.status === tab));

  return (
    <CustomerLayout>
      <h4 className="mb-3">My Orders</h4>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {TABS.map((t) => (
          <button key={t} className={`filter-pill${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t} {t !== 'All' && <span style={{ opacity: 0.6 }}>({orders.filter((o) => (t === 'Active' ? isActive(o) : o.status === t)).length})</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-muted">No {tab.toLowerCase()} orders.</p>}
      <div className="d-flex flex-column gap-3">
        {shown.map((order) => {
          const expanded = !!open[order.id];
          const fb = feedback[order.id] || {};
          return (
            <div className="order-card" data-status={order.status} key={order.id}>
              <div className="accent" />
              <div className="body">
                <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                  <div>
                    <div className="order-no">Order {orderNo(order.id)} · <span className="text-muted" style={{ fontWeight: 500, fontSize: 13 }}>{order.restaurant_name}</span></div>
                    <div className="text-muted" style={{ fontSize: 12.5 }}>{new Date(order.created_at).toLocaleString()}</div>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <span className={`type-badge ${typeClass(order.order_type)}`}>{order.order_type}</span>
                    <span className="badge bg-secondary">{order.status}</span>
                  </div>
                </div>

                {order.scheduled_for && isActive(order) && <div className="mb-2"><span className="sched-pill"><CalendarClock size={12} /> Scheduled for {fmtDateTime(order.scheduled_for)}</span></div>}
                {order.handover_code && (
                  <div className="handover-box mb-3">
                    <div>
                      <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 13.5 }}><KeyRound size={14} /> Your hand-over code</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>Tell this to the {order.order_type === 'Delivery' ? 'delivery partner' : 'counter staff'} when you receive your food — not before.</div>
                    </div>
                    <div className="code">{order.handover_code}</div>
                  </div>
                )}
                {order.order_type === 'Dine-in' && order.status !== 'Cancelled' && (
                  <div className="d-flex gap-2 flex-wrap mb-3">
                    <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={() => callStaff(order, 'Waiter')}><BellRing size={14} /> Call waiter</button>
                    <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={() => callStaff(order, 'Water')}><GlassWater size={14} /> Water</button>
                    <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={() => callStaff(order, 'Bill')}><ReceiptText size={14} /> Request bill</button>
                  </div>
                )}
                {order.rider_name && isActive(order) && (
                  <div className="mb-2 d-flex align-items-center gap-2" style={{ fontSize: 13.5 }}><Bike size={15} color="var(--brand)" /> <strong>{order.rider_name}</strong> is delivering your order{order.rider_phone && <a href={`tel:${order.rider_phone}`}>· {order.rider_phone}</a>}</div>
                )}
                <p className="mb-2 text-muted" style={{ fontSize: 13.5 }}>{order.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}</p>
                <div className="d-flex align-items-center gap-3 flex-wrap mb-3">
                  <span className="order-total">{inr(order.total_amount)}</span>
                  {isActive(order) && <span className="eta-pill"><Clock size={12} /> ~{order.eta_minutes} min</span>}
                  {order.payment_method && <span className="text-muted" style={{ fontSize: 12.5 }}>{order.payment_method} · {order.payment_status}{order.gateway_payment_id ? ` · ${order.gateway_payment_id}` : ''}</span>}
                  {order.refund_id && <span className="badge bg-info text-dark">Refund {order.refund_id}</span>}
                </div>

                <TrackBar status={order.status} />

                <button className="btn btn-sm btn-link p-0 mt-3 d-flex align-items-center gap-1" onClick={() => setOpen({ ...open, [order.id]: !expanded })}>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {expanded ? 'Hide details' : 'Track & bill details'}
                </button>

                {expanded && (
                  <div className="row g-4 mt-1">
                    <div className="col-md-6">
                      <div className="fw-semibold mb-2" style={{ fontSize: 13.5 }}>Timeline</div>
                      <OrderTimeline history={order.history} status={order.status} />
                      {order.delivery_address && <p className="mt-3 mb-0 d-flex gap-1 text-muted" style={{ fontSize: 12.5 }}><MapPin size={13} className="flex-shrink-0 mt-1" /> {order.delivery_address}</p>}
                      {order.table_no && <p className="mt-2 mb-0 text-muted" style={{ fontSize: 12.5 }}>Table {order.table_no}</p>}
                      {order.notes && <p className="mt-2 mb-0 text-muted" style={{ fontSize: 12.5 }}>Note: “{order.notes}”</p>}
                    </div>
                    <div className="col-md-6">
                      <div className="fw-semibold mb-2" style={{ fontSize: 13.5 }}>Bill</div>
                      {[
                        ['Item total', inr(order.subtotal)],
                        order.discount_amount > 0 && [`Discounts${order.coupon_code ? ` (${order.coupon_code})` : ''}`, `− ${inr(order.discount_amount)}`],
                        order.order_type === 'Delivery' && ['Delivery fee', order.delivery_fee > 0 ? inr(order.delivery_fee) : 'FREE'],
                        ['Taxes', inr(order.tax_amount)],
                        order.tip_amount > 0 && ['Tip', inr(order.tip_amount)],
                      ].filter(Boolean).map(([l, v]) => (
                        <div key={l} className="d-flex justify-content-between" style={{ fontSize: 13 }}><span className="text-muted">{l}</span><span>{v}</span></div>
                      ))}
                      <div className="d-flex justify-content-between border-top mt-2 pt-2 fw-bold"><span>Total</span><span>{inr(order.total_amount)}</span></div>
                      {order.points_earned > 0 && <p className="mt-2 mb-0" style={{ fontSize: 12.5, color: 'var(--rating)', fontWeight: 700 }}>+{order.points_earned} loyalty points earned</p>}
                      {order.points_used > 0 && <p className="mt-1 mb-0 text-muted" style={{ fontSize: 12.5 }}>{order.points_used} points redeemed</p>}
                    </div>
                  </div>
                )}

                {order.status === 'Completed' && (
                  <div className="mt-3 border-top pt-3">
                    {order.review_rating ? (
                      <div style={{ fontSize: 13.5 }}>
                        <div className="d-flex align-items-center gap-2"><span className="text-muted">Your rating</span> <StarRating value={order.review_rating} size={15} /></div>
                        {order.review_text && <div className="text-muted mt-1">“{order.review_text}”</div>}
                        {order.admin_reply && <div className="review-reply"><strong>Restaurant replied:</strong> {order.admin_reply}</div>}
                      </div>
                    ) : (
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span className="small">Rate this order:</span>
                        <StarRating value={fb.rating || 0} size={20} onChange={(star) => setFeedback({ ...feedback, [order.id]: { ...fb, rating: star } })} />
                        <input
                          className="form-control form-control-sm"
                          style={{ maxWidth: 240 }}
                          placeholder="Write a review (optional)"
                          value={fb.review || ''}
                          onChange={(e) => setFeedback({ ...feedback, [order.id]: { ...fb, review: e.target.value } })}
                        />
                        <button className="btn btn-sm btn-dark" onClick={() => submitFeedback(order.id)}>Submit</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="actions">
                {order.status === 'Pending' && <button className="btn btn-sm btn-outline-danger" onClick={() => cancelOrder(order)}>Cancel Order</button>}
                {order.status === 'Completed' && order.payment_status === 'Paid' && !order.refund_request_status && (
                  <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={() => requestRefund(order)}><Undo2 size={13} /> Request refund</button>
                )}
                {order.refund_request_status && <span className="badge bg-secondary align-self-center">Refund {order.refund_request_status.toLowerCase()}</span>}
                <button className="btn btn-sm btn-outline-dark" onClick={() => reorder(order)}>Reorder</button>
                {order.status === 'Completed' && (
                  <button className="btn btn-sm btn-outline-success d-flex align-items-center gap-1" onClick={() => generateBill(order)}>
                    <FileDown size={14} /> Bill (PDF)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </CustomerLayout>
  );
}
