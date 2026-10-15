import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Minus, Plus, Trash2, ShoppingBag, Truck, PartyPopper, Bike, Store, Armchair, MapPin, Ticket, Gift, Banknote, ShieldCheck, X, Clock, HeartHandshake } from 'lucide-react';
import RazorpayCheckout from '../../components/RazorpayCheckout';
import CustomerLayout from '../../components/CustomerLayout';
import api from '../../services/api';
import { useCart } from '../../context/CartContext';
import { inr } from '../../utils/format';

const FREE_DELIVERY_THRESHOLD = 299;
const TYPES = [
  { key: 'Delivery', icon: Bike },
  { key: 'Pickup', icon: Store },
  { key: 'Dine-in', icon: Armchair },
];
const PAYMENTS = [
  { key: 'Online', label: 'Pay online', hint: 'UPI · Cards · Netbanking · Wallets (Razorpay)', icon: ShieldCheck },
  { key: 'Cash', label: 'Pay on delivery / at the counter', hint: 'Cash or UPI to our team', icon: Banknote },
];
const TIPS = [0, 20, 50, 100];
const pad2 = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export default function Cart() {
  const { cart, removeFromCart, increaseQty, decreaseQty, totalPrice, clearCart } = useCart();
  const navigate = useNavigate();

  const [orderType, setOrderType] = useState('Delivery');
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState('new');
  const [newAddress, setNewAddress] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [tableNo, setTableNo] = useState('');
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState('Online');
  const [tip, setTip] = useState(0);
  const [when, setWhen] = useState('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [gateway, setGateway] = useState(null); // Razorpay order while the checkout window is open

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponList, setCouponList] = useState([]);
  const [redeem, setRedeem] = useState(false);

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const restaurantId = cart[0]?.restaurant_id;

  useEffect(() => {
    api.get('/user/addresses').then((res) => {
      setAddresses(res.data);
      const def = res.data.find((a) => a.is_default) || res.data[0];
      if (def) setAddressId(String(def.id));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    api.get('/orders/coupons', { params: { restaurant_id: restaurantId } }).then((res) => setCouponList(res.data)).catch(() => setCouponList([]));
  }, [restaurantId]);

  // The bill is always priced by the server (same code that places the order),
  // so the number shown here is exactly what gets charged.
  useEffect(() => {
    if (cart.length === 0) return undefined;
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await api.post('/orders/quote', {
          items: cart.map((c) => ({ menu_item_id: c.id, quantity: c.qty })),
          order_type: orderType,
          coupon_code: appliedCoupon,
          use_points: redeem ? 100000 : 0,
          tip,
        });
        if (mine !== seq.current) return;
        setQuote(res.data);
        setQuoteError('');
        if (res.data.coupon_error) {
          toast.error(res.data.coupon_error);
          setAppliedCoupon(null);
        }
      } catch (err) {
        if (mine !== seq.current) return;
        setQuote(null);
        setQuoteError(err.response?.data?.message || 'Could not price your order');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [cart, orderType, appliedCoupon, redeem, tip]);

  const applyCoupon = (code) => {
    const c = String(code || couponInput).trim().toUpperCase();
    if (!c) return;
    setAppliedCoupon(c);
    setCouponInput('');
  };

  const selectedAddress = addresses.find((a) => String(a.id) === addressId);
  const addressText = addressId === 'new' ? newAddress.trim() : selectedAddress?.address_line || '';

  const schedule = when === 'later' && scheduledFor ? new Date(scheduledFor).toISOString() : null;

  const checkoutPayload = () => ({
    items: cart.map((c) => ({ menu_item_id: c.id, quantity: c.qty })),
    order_type: orderType,
    delivery_address: addressText,
    table_no: tableNo,
    notes,
    coupon_code: appliedCoupon,
    use_points: redeem ? 100000 : 0,
    tip,
    scheduled_for: schedule,
  });

  const finish = (data) => {
    toast.success(`Order placed! ${schedule ? 'Scheduled' : `Ready in ~${data.eta_minutes} min`}`);
    clearCart();
    navigate('/user/orders');
  };

  const placeOrder = async () => {
    if (cart.length === 0 || !quote) return;
    if (orderType === 'Delivery' && addressText.length < 5) return setError('Please add a delivery address');
    if (when === 'later' && !scheduledFor) return setError('Pick a date and time for your scheduled order');
    setPlacing(true);
    setError('');
    try {
      if (orderType === 'Delivery' && addressId === 'new' && saveAddress) {
        await api.post('/user/addresses', { label: addresses.length === 0 ? 'Home' : 'Other', address_line: addressText }).catch(() => {});
      }
      if (payment === 'Online') {
        // 1) server prices the cart and opens a gateway order  2) checkout window  3) verify + create the order
        const res = await api.post('/payments/create-order', checkoutPayload());
        setGateway(res.data);
      } else {
        const res = await api.post('/orders', { ...checkoutPayload(), payment_method: 'Cash' });
        finish(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not place order');
    } finally {
      setPlacing(false);
    }
  };

  // called by the checkout once the "bank" has captured the payment
  const verifyAndPlace = async (captured) => {
    try {
      const res = await api.post('/payments/verify', {
        razorpay_order_id: captured.razorpay_order_id,
        razorpay_payment_id: captured.razorpay_payment_id,
        razorpay_signature: captured.razorpay_signature,
      });
      setTimeout(() => finish(res.data), 900);
    } catch (err) {
      setGateway(null);
      setError(err.response?.data?.message || 'Payment verification failed');
      throw new Error(err.response?.data?.message || 'Payment verification failed');
    }
  };

  if (cart.length === 0) {
    return (
      <CustomerLayout>
        <div className="text-center py-5">
          <ShoppingBag size={48} color="var(--border)" className="mb-3" />
          <h5>Your cart is empty</h5>
          <p className="text-muted mb-3">Add something tasty from the menu.</p>
          <Link to="/user/menu" className="btn btn-dark">Browse Menu</Link>
        </div>
      </CustomerLayout>
    );
  }

  const showFreeBar = orderType === 'Delivery' && quote && !quote.free_delivery_reason;
  const amountToFreeDelivery = Math.max(0, FREE_DELIVERY_THRESHOLD - totalPrice);
  const progressPct = Math.min(100, (totalPrice / FREE_DELIVERY_THRESHOLD) * 100);

  return (
    <CustomerLayout>
      <h4 className="mb-3">Your Cart</h4>
      {error && <div className="alert alert-danger">{error}</div>}
      {quoteError && <div className="alert alert-warning">{quoteError}</div>}

      {orderType === 'Delivery' && quote && (
        <div className="card p-3 mb-3">
          {quote.free_delivery_reason ? (
            <div className="d-flex align-items-center gap-2" style={{ color: 'var(--rating)', fontWeight: 700, fontSize: 13.5 }}>
              <PartyPopper size={16} />
              {quote.free_delivery_reason === 'first_order' ? "Free delivery on your first order — enjoy!" : "Yay! You've unlocked free delivery."}
            </div>
          ) : showFreeBar && (
            <>
              <div className="d-flex align-items-center gap-2" style={{ fontSize: 13.5 }}>
                <Truck size={15} color="var(--brand)" /> Add <strong>₹{amountToFreeDelivery.toFixed(0)}</strong> more for free delivery
              </div>
              <div className="delivery-progress-track"><div className="delivery-progress-fill" style={{ width: `${progressPct}%` }} /></div>
            </>
          )}
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card p-3 mb-3">
            {cart.map((c) => (
              <div key={c.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div>
                  <div className="fw-semibold" style={{ fontSize: 14 }}>{c.name}</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>₹{c.price} each</div>
                </div>
                <div className="d-flex align-items-center gap-3">
                  <div className="d-flex align-items-center gap-2 border rounded-pill px-2 py-1">
                    <button className="btn btn-sm p-0 border-0" onClick={() => decreaseQty(c.id)}><Minus size={14} /></button>
                    <span style={{ minWidth: 16, textAlign: 'center' }}>{c.qty}</span>
                    <button className="btn btn-sm p-0 border-0" onClick={() => increaseQty(c.id)}><Plus size={14} /></button>
                  </div>
                  <span className="fw-bold" style={{ minWidth: 60, textAlign: 'right' }}>₹{(c.price * c.qty).toFixed(2)}</span>
                  <button className="btn btn-sm btn-link text-danger p-0" onClick={() => removeFromCart(c.id)}><Trash2 size={16} /></button>
                </div>
              </div>
            ))}
            <input
              className="form-control mt-3"
              maxLength={255}
              placeholder="Cooking instructions? (less spicy, no onions...)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="card p-3 mb-3">
            <h6 className="mb-3">How would you like it?</h6>
            <div className="seg-tabs mb-3">
              {TYPES.map(({ key, icon: Icon }) => (
                <button key={key} className={orderType === key ? 'active' : ''} onClick={() => setOrderType(key)}><Icon size={15} /> {key}</button>
              ))}
            </div>

            {orderType === 'Delivery' && (
              <div>
                <label className="form-label d-flex align-items-center gap-1"><MapPin size={14} /> Delivery address</label>
                <div className="d-flex flex-column gap-2">
                  {addresses.map((a) => (
                    <div key={a.id} className={`choice-card${addressId === String(a.id) ? ' selected' : ''}`} onClick={() => setAddressId(String(a.id))}>
                      <div className="fw-semibold" style={{ fontSize: 13.5 }}>{a.label}{a.is_default ? ' · Default' : ''}</div>
                      <div className="text-muted" style={{ fontSize: 12.5 }}>{a.address_line}</div>
                    </div>
                  ))}
                  <div className={`choice-card${addressId === 'new' ? ' selected' : ''}`} onClick={() => setAddressId('new')}>
                    <div className="fw-semibold mb-1" style={{ fontSize: 13.5 }}>+ Use a new address</div>
                    {addressId === 'new' && (
                      <>
                        <textarea className="form-control" rows={2} placeholder="Flat / street / area / landmark" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} />
                        <label className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: 12.5 }}>
                          <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /> Save to my address book
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {orderType === 'Pickup' && <p className="text-muted mb-0" style={{ fontSize: 13.5 }}>Collect your order from the restaurant counter when it's marked Ready. No delivery fee.</p>}
            {orderType === 'Dine-in' && (
              <div>
                <label className="form-label">Table number (optional)</label>
                <input className="form-control" style={{ maxWidth: 200 }} maxLength={20} value={tableNo} onChange={(e) => setTableNo(e.target.value)} placeholder="e.g. T4" />
                <p className="text-muted mt-2 mb-0" style={{ fontSize: 12.5 }}>Order from your seat — we'll bring it to your table. No delivery fee.</p>
              </div>
            )}
          </div>

          <div className="card p-3 mb-3">
            <h6 className="mb-3 d-flex align-items-center gap-2"><Clock size={16} /> When?</h6>
            <div className="seg-tabs mb-2">
              <button className={when === 'now' ? 'active' : ''} onClick={() => setWhen('now')}>As soon as possible</button>
              <button className={when === 'later' ? 'active' : ''} onClick={() => { setWhen('later'); if (!scheduledFor) setScheduledFor(toLocalInput(new Date(Date.now() + 60 * 60000))); }}>Schedule for later</button>
            </div>
            {when === 'later' && (
              <input type="datetime-local" className="form-control" style={{ maxWidth: 260 }} value={scheduledFor}
                min={toLocalInput(new Date(Date.now() + 30 * 60000))} max={toLocalInput(new Date(Date.now() + 47 * 3600000))}
                onChange={(e) => setScheduledFor(e.target.value)} />
            )}
          </div>

          {orderType !== 'Pickup' && (
            <div className="card p-3 mb-3">
              <h6 className="mb-2 d-flex align-items-center gap-2"><HeartHandshake size={16} color="var(--brand)" /> Tip our team</h6>
              <div className="d-flex gap-2 flex-wrap align-items-center">
                {TIPS.map((t) => <button key={t} className={`tip-chip${tip === t ? ' active' : ''}`} onClick={() => setTip(t)}>{t === 0 ? 'No tip' : `₹${t}`}</button>)}
                <input type="number" min="0" max="500" className="form-control form-control-sm" style={{ width: 90 }} placeholder="Other" value={TIPS.includes(tip) ? '' : tip} onChange={(e) => setTip(Math.max(0, Math.min(500, Number(e.target.value) || 0)))} />
              </div>
            </div>
          )}

          <div className="card p-3">
            <h6 className="mb-3">Payment</h6>
            <div className="d-flex flex-column gap-2">
              {PAYMENTS.map(({ key, label, hint, icon: Icon }) => (
                <div key={key} className={`choice-card d-flex align-items-center gap-3${payment === key ? ' selected' : ''}`} onClick={() => setPayment(key)}>
                  <Icon size={18} color="var(--brand)" />
                  <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div><div className="text-muted" style={{ fontSize: 12 }}>{hint}</div></div>
                </div>
              ))}
            </div>
            {payment === 'Online' && <p className="text-muted mt-2 mb-0" style={{ fontSize: 12 }}>Demo gateway: use the test card / UPI IDs shown in the payment window. No real money is charged.</p>}
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card p-4" style={{ position: 'sticky', top: 90 }}>
            <h6 className="mb-3">Offers & Rewards</h6>

            {appliedCoupon && quote?.coupon_code ? (
              <div className="coupon-ticket mb-3">
                <div>
                  <div className="code">{quote.coupon_code}</div>
                  <div style={{ fontSize: 12, color: 'var(--rating)', fontWeight: 700 }}>You saved {inr(quote.coupon_discount)}</div>
                </div>
                <button className="btn btn-sm p-0 border-0" onClick={() => setAppliedCoupon(null)} aria-label="Remove coupon"><X size={16} /></button>
              </div>
            ) : (
              <div className="mb-3">
                <div className="d-flex gap-2">
                  <input className="form-control" placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && applyCoupon()} />
                  <button className="btn btn-outline-dark" onClick={() => applyCoupon()}>Apply</button>
                </div>
                {couponList.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {couponList.map((c) => (
                      <button key={c.code} className="filter-pill" onClick={() => applyCoupon(c.code)} title={c.description}>
                        <Ticket size={12} /> {c.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {quote && quote.available_points > 0 && (
              <label className="d-flex align-items-start gap-2 mb-3" style={{ fontSize: 13.5, cursor: quote.max_redeemable_points > 0 ? 'pointer' : 'default' }}>
                <input type="checkbox" className="mt-1" checked={redeem} disabled={quote.max_redeemable_points === 0 && !redeem} onChange={(e) => setRedeem(e.target.checked)} />
                <span>
                  <Gift size={14} className="me-1" color="var(--brand)" />
                  Use loyalty points <span className="text-muted">({quote.available_points} available)</span>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {quote.max_redeemable_points > 0 ? `Up to ${quote.max_redeemable_points} points = ${inr(quote.max_redeemable_points)} off this order` : 'Add more to your cart to redeem points'}
                  </div>
                </span>
              </label>
            )}

            <h6 className="mb-3 border-top pt-3">Bill Summary</h6>
            {quote ? (
              <>
                <Row label="Item Total" value={inr(quote.subtotal)} />
                {quote.coupon_discount > 0 && <Row label={`Coupon (${quote.coupon_code})`} value={`− ${inr(quote.coupon_discount)}`} good />}
                {quote.points_discount > 0 && <Row label={`Loyalty points (${quote.points_used})`} value={`− ${inr(quote.points_discount)}`} good />}
                {orderType === 'Delivery' && (
                  <Row label="Delivery Fee" value={quote.delivery_fee === 0 ? 'FREE' : inr(quote.delivery_fee)} good={quote.delivery_fee === 0} />
                )}
                <Row label="Taxes (5%)" value={inr(quote.tax)} />
                {quote.tip > 0 && <Row label="Tip" value={inr(quote.tip)} />}
                <div className="d-flex justify-content-between border-top pt-3 mb-2">
                  <span className="fw-bold">To Pay</span>
                  <span className="fw-bold" style={{ fontSize: 18 }}>{inr(quote.total)}</span>
                </div>
                <p className="text-muted mb-3" style={{ fontSize: 12 }}>
                  Ready in about {quote.eta_minutes} min · You'll earn {quote.points_to_earn} points
                </p>
              </>
            ) : (
              <p className="text-muted small">Calculating your bill…</p>
            )}
            <button className="btn btn-dark w-100" disabled={placing || !quote} onClick={placeOrder}>
              {placing ? 'Please wait…' : payment === 'Online' ? `Pay${quote ? ` ${inr(quote.total)}` : ''} & place order` : `Place Order${quote ? ` · ${inr(quote.total)}` : ''}`}
            </button>
          </div>
        </div>
      </div>
      {gateway && <RazorpayCheckout order={gateway} onCaptured={verifyAndPlace} onDismiss={() => setGateway(null)} />}
    </CustomerLayout>
  );
}

function Row({ label, value, good }) {
  return (
    <div className="d-flex justify-content-between mb-2" style={{ fontSize: 14 }}>
      <span className="text-muted">{label}</span>
      <span style={good ? { color: 'var(--rating)', fontWeight: 700 } : undefined}>{value}</span>
    </div>
  );
}
