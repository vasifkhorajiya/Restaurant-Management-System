import pool from '../config/db.js';
import { buildQuote, HttpError, ORDER_TYPES } from '../utils/pricing.js';
import { hmac, randomId, safeEqual } from '../utils/security.js';
import { notifyUser } from '../utils/notify.js';
import { sendToUser } from '../utils/messages.js';
import { audit } from '../utils/audit.js';
import { placeOrder } from './orderController.js';

// =====================================================================
//  FAKE RAZORPAY
//  Mirrors the real Razorpay Standard Checkout flow so going live is a swap, not a rewrite:
//    1. server  creates an order            ->  POST /payments/create-order     (real: razorpay.orders.create)
//    2. browser opens checkout, customer pays (real: Razorpay's hosted checkout.js)  -> here: /payments/fake-gateway/*
//    3. checkout returns order_id + payment_id + signature
//    4. server  verifies the HMAC-SHA256 signature and only then creates the order  ->  POST /payments/verify
//  The signature algorithm in step 4 is EXACTLY Razorpay's: HMAC_SHA256(order_id|payment_id, key_secret).
// =====================================================================
const KEY_ID = () => process.env.RAZORPAY_KEY_ID || 'rzp_test_FAKEKEY00001';
const KEY_SECRET = () => process.env.RAZORPAY_KEY_SECRET || process.env.JWT_SECRET; // fake gateway: reuse a server secret
const ORDER_TTL_MIN = 15;
const MAX_ATTEMPTS = 5;
const TEST_BANK_OTP = '123456'; // what the fake 3-D Secure page expects (shown on the checkout screen)

const BANKS = ['HDFC', 'ICICI', 'SBI', 'AXIS', 'KOTAK', 'YES'];
const WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'];
const METHOD_LABEL = { card: 'Card', upi: 'UPI', netbanking: 'Netbanking', wallet: 'Wallet' };

const sign = (orderId, paymentId) => hmac(KEY_SECRET(), `${orderId}|${paymentId}`);

function luhn(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}
const network = (n) => (/^4/.test(n) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^3[47]/.test(n) ? 'Amex' : /^(60|65|81|82|508)/.test(n) ? 'RuPay' : 'Card');

// Razorpay-style test numbers
const DECLINED_CARDS = {
  '4000000000000002': ['card_declined', 'Your card was declined by the bank'],
  '4000000000009995': ['insufficient_funds', 'Insufficient funds in the account'],
  '4000000000000069': ['expired_card', 'The card has expired'],
};

async function loadOwnOrder(userId, gatewayOrderId, conn = pool) {
  const [[po]] = await conn.query('SELECT * FROM payment_orders WHERE gateway_order_id = ? AND user_id = ?', [String(gatewayOrderId || ''), userId]);
  if (!po) throw new HttpError('Payment order not found', 404);
  return po;
}

function assertPayable(po) {
  if (po.status === 'paid') throw new HttpError('This payment is already completed', 409);
  if (po.status === 'failed' || po.status === 'expired' || new Date(po.expires_at) < new Date()) {
    throw new HttpError('This payment session has expired. Please start again.', 410);
  }
}

// ---- step 1 -------------------------------------------------------
export async function createPaymentOrder(req, res) {
  const body = req.body || {};
  if (!ORDER_TYPES.includes(body.order_type || 'Delivery')) throw new HttpError('Invalid order type');
  if ((body.order_type || 'Delivery') === 'Delivery' && String(body.delivery_address || '').trim().length < 5) {
    throw new HttpError('Please add a delivery address');
  }
  const q = await buildQuote(pool, req.user.id, body);          // the SERVER decides the amount, never the browser
  const amountPaise = Math.round(q.total * 100);
  if (amountPaise < 100) throw new HttpError('Order total is too small to pay online');

  const gatewayOrderId = `order_${randomId(8)}`;
  // keep only what placeOrder needs (never trust extra keys the client sent)
  const snapshot = {
    items: body.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
    order_type: body.order_type || 'Delivery', delivery_address: body.delivery_address || null, table_no: body.table_no || null,
    notes: body.notes || null, coupon_code: body.coupon_code || null, use_points: body.use_points || 0, tip: body.tip || 0,
    scheduled_for: body.scheduled_for || null,
  };
  await pool.query(
    `INSERT INTO payment_orders (gateway_order_id, user_id, amount_paise, payload, expires_at) VALUES (?, ?, ?, ?, NOW() + (?::int * INTERVAL '1 minute'))`,
    [gatewayOrderId, req.user.id, amountPaise, JSON.stringify(snapshot), ORDER_TTL_MIN]
  );
  const [[user]] = await pool.query('SELECT name, email, phone FROM users WHERE id = ?', [req.user.id]);
  res.status(201).json({
    key_id: KEY_ID(), gateway_order_id: gatewayOrderId, amount: amountPaise, currency: 'INR',
    name: q.restaurant.name, description: `${q.lines.length} item(s) · ${snapshot.order_type}`,
    prefill: { name: user.name, email: user.email, contact: user.phone },
    test_bank_otp: process.env.NODE_ENV === 'production' ? undefined : TEST_BANK_OTP,
  });
}

// ---- step 2: the "bank/gateway" side -------------------------------
async function succeed(po, extra) {
  const paymentId = `pay_${randomId(8)}`;
  await pool.query(
    `UPDATE payment_orders SET status = 'attempted', gateway_payment_id = ?, method = ?, card_last4 = ?, card_network = ?, upi_masked = ?, bank = ?, pending_txn = NULL, failure_reason = NULL WHERE id = ?`,
    [paymentId, extra.method, extra.card_last4 || null, extra.card_network || null, extra.upi_masked || null, extra.bank || null, po.id]
  );
  return {
    status: 'captured',
    razorpay_order_id: po.gateway_order_id,
    razorpay_payment_id: paymentId,
    razorpay_signature: sign(po.gateway_order_id, paymentId),
  };
}

async function fail(po, code, reason) {
  const attempts = po.attempts + 1;
  await pool.query(
    'UPDATE payment_orders SET attempts = ?, status = ?, failure_reason = ?, pending_txn = NULL WHERE id = ?',
    [attempts, attempts >= MAX_ATTEMPTS ? 'failed' : 'attempted', reason, po.id]
  );
  throw new HttpError(reason, 402, { code, attempts_left: Math.max(0, MAX_ATTEMPTS - attempts) });
}

export async function fakeGatewayPay(req, res) {
  const po = await loadOwnOrder(req.user.id, req.body.gateway_order_id);
  assertPayable(po);
  const { method } = req.body;
  if (!(method in METHOD_LABEL)) throw new HttpError('Choose a payment method');

  if (method === 'card') {
    const c = req.body.card || {};
    const number = String(c.number || '').replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(number) || !luhn(number)) return fail(po, 'invalid_card', 'Invalid card number');
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(c.expiry || '').trim());
    if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return fail(po, 'invalid_expiry', 'Enter expiry as MM/YY');
    if (new Date(2000 + Number(m[2]), Number(m[1]), 0, 23, 59) < new Date()) return fail(po, 'expired_card', 'The card has expired');
    if (!/^\d{3,4}$/.test(String(c.cvv || ''))) return fail(po, 'invalid_cvv', 'Invalid CVV');
    if (!String(c.name || '').trim()) return fail(po, 'invalid_name', 'Enter the name on the card');
    if (DECLINED_CARDS[number]) return fail(po, ...DECLINED_CARDS[number]);

    // Only last-4 + network are ever stored. The full number/CVV never touch the database or logs.
    const txn = `txn_${randomId(6)}`;
    await pool.query(
      'UPDATE payment_orders SET pending_txn = ?, method = ?, card_last4 = ?, card_network = ?, status = ? WHERE id = ?',
      [txn, 'card', number.slice(-4), network(number), 'attempted', po.id]
    );
    // 3-D Secure: the bank asks for an OTP before the charge is captured
    return res.json({ status: 'otp_required', txn, card_last4: number.slice(-4), network: network(number) });
  }

  if (method === 'upi') {
    const vpa = String(req.body.upi?.vpa || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/.test(vpa)) return fail(po, 'invalid_vpa', 'Enter a valid UPI ID (e.g. name@okhdfc)');
    if (vpa.startsWith('failure@')) return fail(po, 'upi_declined', 'The UPI payment was declined or timed out');
    const masked = vpa.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    return res.json(await succeed(po, { method: 'upi', upi_masked: masked }));
  }

  if (method === 'netbanking') {
    const bank = String(req.body.bank || '').toUpperCase();
    if (!BANKS.includes(bank)) return fail(po, 'invalid_bank', 'Select your bank');
    // the real flow redirects to the bank; the demo bank page offers "Success" / "Failure"
    if (req.body.simulate === 'failure') return fail(po, 'bank_declined', `${bank} Bank declined the transaction`);
    return res.json(await succeed(po, { method: 'netbanking', bank }));
  }

  const wallet = String(req.body.wallet || '');
  if (!WALLETS.includes(wallet)) return fail(po, 'invalid_wallet', 'Select a wallet');
  return res.json(await succeed(po, { method: 'wallet', bank: wallet }));
}

export async function fakeGatewayOtp(req, res) {
  const po = await loadOwnOrder(req.user.id, req.body.gateway_order_id);
  assertPayable(po);
  if (!po.pending_txn || po.pending_txn !== req.body.txn) throw new HttpError('No card payment is waiting for an OTP', 400);
  if (!safeEqual(String(req.body.otp || ''), TEST_BANK_OTP)) return fail(po, 'bad_3ds_otp', 'Incorrect bank OTP');
  res.json(await succeed(po, { method: 'card', card_last4: po.card_last4, card_network: po.card_network }));
}

// ---- step 4: verify + create the order -----------------------------
export async function verifyPayment(req, res) {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!orderId || !paymentId || !signature) throw new HttpError('Missing payment details');

  const po = await loadOwnOrder(req.user.id, orderId);
  // idempotent: refreshing / double-clicking after success returns the same order
  if (po.status === 'paid' && po.order_id) return res.json({ message: 'Payment already verified', orderId: po.order_id });
  if (po.status === 'failed' || po.status === 'expired') throw new HttpError('This payment session is closed', 410);

  // 1) signature — constant-time compare, computed with the server-side secret
  if (!safeEqual(sign(orderId, paymentId), signature) || po.gateway_payment_id !== paymentId) {
    await pool.query(`UPDATE payment_orders SET status = 'failed', failure_reason = 'signature mismatch' WHERE id = ?`, [po.id]);
    audit(req, 'payment.signature_mismatch', 'payment_order', po.id, orderId);
    throw new HttpError('Payment verification failed', 400, { code: 'BAD_SIGNATURE' });
  }

  // 2) re-price the cart and write the order. If anything changed meanwhile the payment is refunded.
  const payload = JSON.parse(po.payload);
  const method = { card: 'Card', upi: 'UPI', netbanking: 'Netbanking', wallet: 'Wallet' }[po.method] || 'Card';
  try {
    const result = await placeOrder(req.user, payload, {
      method, status: 'Paid', gatewayOrderId: orderId, gatewayPaymentId: paymentId, signature,
      cardLast4: po.card_last4, cardNetwork: po.card_network, upiMasked: po.upi_masked,
      expectedTotal: po.amount_paise / 100,
    });
    await pool.query(`UPDATE payment_orders SET status = 'paid', order_id = ? WHERE id = ?`, [result.orderId, po.id]);
    return res.status(201).json({ message: 'Payment successful', orderId: result.orderId, total_amount: result.total, eta_minutes: result.eta_minutes });
  } catch (err) {
    if (err instanceof HttpError) {
      // money was "captured" but the order can't be created (dish sold out, price changed…) -> automatic refund
      const refundId = `rfnd_${randomId(7)}`;
      await pool.query(`UPDATE payment_orders SET status = 'failed', failure_reason = ? WHERE id = ?`, [`auto-refunded ${refundId}: ${err.message}`.slice(0, 120), po.id]);
      notifyUser(req.user.id, 'Payment refunded', `We couldn't place your order (${err.message}). Your payment of ₹${po.amount_paise / 100} is being refunded (${refundId}).`, 'refund', '/user/orders');
      throw new HttpError(`${err.message}. Your payment has been refunded automatically.`, err.status, { code: 'AUTO_REFUND', refund_id: refundId });
    }
    throw err;
  }
}

// ---- customer: abandon a payment ----------------------------------
export async function cancelPaymentOrder(req, res) {
  await pool.query(`UPDATE payment_orders SET status = 'expired' WHERE gateway_order_id = ? AND user_id = ? AND status IN ('created','attempted')`, [req.body.gateway_order_id, req.user.id]);
  res.json({ message: 'Payment cancelled' });
}

// =====================================================================
//  Admin / manager: payments ledger, refunds, refund requests
// =====================================================================
export async function getPayments(req, res) {
  const rid = req.restaurantId;
  const where = [];
  const params = [];
  if (rid) { where.push('o.restaurant_id = ?'); params.push(rid); }
  if (req.query.status && req.query.status !== 'All') { where.push('p.status = ?'); params.push(req.query.status); }
  if (req.query.method && req.query.method !== 'All') { where.push('p.method = ?'); params.push(req.query.method); }
  const [rows] = await pool.query(
    `SELECT p.id, p.order_id, p.amount, p.method, p.status, p.paid_at, p.gateway_payment_id, p.gateway_order_id, p.card_last4, p.card_network,
            p.upi_masked, p.refund_id, p.refunded_at, o.created_at, o.source, u.name AS customer_name, r.name AS restaurant_name
     FROM payments p JOIN orders o ON o.id = p.order_id JOIN users u ON u.id = o.customer_id JOIN restaurants r ON r.id = o.restaurant_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 300`,
    params
  );
  res.json(rows);
}

export async function getPaymentSummary(req, res) {
  const rid = req.restaurantId;
  const f = rid ? 'AND o.restaurant_id = ?' : '';
  const [[s]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN p.status = 'Paid' THEN p.amount END), 0) AS collected,
       COALESCE(SUM(CASE WHEN p.status = 'Paid' AND p.method <> 'Cash' THEN p.amount END), 0) AS online,
       COALESCE(SUM(CASE WHEN p.status = 'Paid' AND p.method = 'Cash' THEN p.amount END), 0) AS cash,
       COALESCE(SUM(CASE WHEN p.status = 'Pending' AND o.status <> 'Cancelled' THEN p.amount END), 0) AS pending_cod,
       COALESCE(SUM(CASE WHEN p.status = 'Refunded' THEN p.amount END), 0) AS refunded,
       COUNT(*) FILTER (WHERE p.status = 'Failed') AS failed
     FROM payments p JOIN orders o ON o.id = p.order_id WHERE 1=1 ${f}`,
    rid ? [rid] : []
  );
  const [[{ failedGateway }]] = await pool.query(
    `SELECT COUNT(*) AS "failedGateway" FROM payment_orders WHERE status IN ('failed','expired') AND created_at > NOW() - INTERVAL '7 days'`
  );
  res.json({ ...s, collected: Number(s.collected), online: Number(s.online), cash: Number(s.cash), pending_cod: Number(s.pending_cod), refunded: Number(s.refunded), failed_gateway_7d: failedGateway });
}

async function refundPayment(paymentId, scopeRid, { reason }) {
  const [[p]] = await pool.query(
    'SELECT p.id, p.order_id, p.amount, p.status, p.gateway_payment_id, o.customer_id, o.restaurant_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ?',
    [paymentId]
  );
  if (!p || (scopeRid && p.restaurant_id !== scopeRid)) throw new HttpError('Payment not found', 404);
  if (p.status !== 'Paid') throw new HttpError('Only paid payments can be refunded', 400);
  const refundId = p.gateway_payment_id ? `rfnd_${randomId(7)}` : null; // cash refunds have no gateway id
  await pool.query(`UPDATE payments SET status = 'Refunded', refund_id = ?, refunded_at = NOW() WHERE id = ?`, [refundId, p.id]);
  sendToUser(p.customer_id, { kind: 'refund', subject: `Refund of ₹${p.amount} processed`, heading: 'Your refund is on its way', lines: [`₹${p.amount} for order #${String(p.order_id).padStart(4, '0')} has been refunded${refundId ? ` (reference ${refundId})` : ''}.`, 'It can take 3-5 working days to show in your account.'] });
  notifyUser(p.customer_id, 'Refund processed', `₹${p.amount} for order #${String(p.order_id).padStart(4, '0')} has been refunded${reason ? ` (${reason})` : ''}.${refundId ? ` Ref ${refundId}.` : ''}`, 'refund', '/user/orders');
  return { p, refundId };
}

export async function refund(req, res) {
  const { p, refundId } = await refundPayment(req.params.id, req.restaurantId, { reason: req.body.reason });
  audit(req, 'payment.refund', 'payment', p.id, `₹${p.amount} ${refundId || 'cash'}`);
  res.json({ message: 'Refund processed', refund_id: refundId });
}

export async function getRefundRequests(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT rr.id, rr.order_id, rr.reason, rr.status, rr.resolution_note, rr.created_at, rr.resolved_at, o.total_amount, p.id AS payment_id,
            p.status AS payment_status, u.name AS customer_name
     FROM refund_requests rr JOIN orders o ON o.id = rr.order_id JOIN users u ON u.id = rr.user_id LEFT JOIN payments p ON p.order_id = o.id
     ${rid ? 'WHERE o.restaurant_id = ?' : ''} ORDER BY (rr.status = 'Pending') DESC, rr.created_at DESC LIMIT 200`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function resolveRefundRequest(req, res) {
  const rid = req.restaurantId;
  const decision = req.body.decision;
  if (!['Approved', 'Rejected'].includes(decision)) throw new HttpError('Invalid decision');
  const [[rr]] = await pool.query(
    'SELECT rr.id, rr.user_id, rr.order_id, rr.status, o.restaurant_id, p.id AS payment_id FROM refund_requests rr JOIN orders o ON o.id = rr.order_id LEFT JOIN payments p ON p.order_id = o.id WHERE rr.id = ?',
    [req.params.id]
  );
  if (!rr || (rid && rr.restaurant_id !== rid)) throw new HttpError('Request not found', 404);
  if (rr.status !== 'Pending') throw new HttpError('This request was already handled', 400);

  if (decision === 'Approved') await refundPayment(rr.payment_id, rid, { reason: 'approved refund request' });
  else notifyUser(rr.user_id, 'Refund request declined', req.body.note ? String(req.body.note).slice(0, 200) : 'The restaurant could not approve this refund.', 'refund', '/user/orders');
  await pool.query('UPDATE refund_requests SET status = ?, resolved_by = ?, resolution_note = ?, resolved_at = NOW() WHERE id = ?',
    [decision, req.user.id, req.body.note ? String(req.body.note).slice(0, 255) : null, rr.id]);
  audit(req, `refund_request.${decision.toLowerCase()}`, 'refund_request', rr.id);
  res.json({ message: `Request ${decision.toLowerCase()}` });
}
