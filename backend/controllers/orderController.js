import pool from '../config/db.js';
import { buildQuote, HttpError, ORDER_TYPES, POINTS_PER_RUPEES, round2 } from '../utils/pricing.js';
import { randomDigits, randomId, safeEqual } from '../utils/security.js';
import { notifyUser, notifyManagers } from '../utils/notify.js';
import { audit } from '../utils/audit.js';
import { toRestaurant, toUser } from '../utils/realtime.js';
import { sendToUser } from '../utils/messages.js';

// Allowed status transitions — a Completed or Cancelled order can never be re-opened.
const FLOW = {
  Pending: ['Accepted', 'Cancelled'],
  Accepted: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['Completed'],
};

const STATUS_MESSAGES = {
  Accepted: 'The restaurant accepted your order.',
  Preparing: 'Your food is being prepared.',
  Ready: 'Your order is ready!',
  Completed: 'Order completed. Enjoy your meal — rate it when you can.',
  Cancelled: 'Your order was cancelled.',
};

const orderNo = (id) => `#${String(id).padStart(4, '0')}`;

// Attaches `items` to every order in one query instead of one query per order.
async function attachItems(orders) {
  if (orders.length === 0) return orders;
  const ids = orders.map((o) => o.id);
  const [items] = await pool.query(
    `SELECT oi.order_id, oi.menu_item_id, oi.quantity, oi.price, m.name, m.is_veg
     FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id IN (?)`,
    [ids]
  );
  const byOrder = new Map();
  for (const it of items) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id).push(it);
  }
  orders.forEach((o) => { o.items = byOrder.get(o.id) || []; });
  return orders;
}

async function attachHistory(orders) {
  if (orders.length === 0) return orders;
  const [rows] = await pool.query(
    'SELECT order_id, status, created_at FROM order_status_history WHERE order_id IN (?) ORDER BY id',
    [orders.map((o) => o.id)]
  );
  const byOrder = new Map();
  for (const r of rows) {
    if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, []);
    byOrder.get(r.order_id).push({ status: r.status, at: r.created_at });
  }
  orders.forEach((o) => { o.history = byOrder.get(o.id) || []; });
  return orders;
}

// Undo everything an order took when it was placed: stock, loyalty points,
// coupon usage and the payment. Used for both customer and staff cancellations.
async function releaseOrderResources(conn, order) {
  const [items] = await conn.query('SELECT menu_item_id, quantity FROM order_items WHERE order_id = ?', [order.id]);
  for (const it of items) {
    await conn.query(
      'UPDATE menu_items SET is_available = CASE WHEN stock_qty = 0 THEN TRUE ELSE is_available END, stock_qty = stock_qty + ? WHERE id = ? AND stock_qty IS NOT NULL',
      [it.quantity, it.menu_item_id]
    );
  }
  if (order.points_used > 0) {
    await conn.query('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?', [order.points_used, order.customer_id]);
  }
  const [usages] = await conn.query('SELECT coupon_id FROM coupon_usages WHERE order_id = ?', [order.id]);
  for (const u of usages) {
    await conn.query('UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE id = ?', [u.coupon_id]);
  }
  await conn.query('DELETE FROM coupon_usages WHERE order_id = ?', [order.id]);
  // Paid online payments get a (fake) Razorpay refund id; unpaid cash simply becomes Failed.
  // SET runs left to right, so refund_id/refunded_at still see the old 'Paid' status.
  await conn.query(
    `UPDATE payments
     SET refund_id = CASE WHEN status = 'Paid' AND gateway_payment_id IS NOT NULL THEN ? ELSE refund_id END,
         refunded_at = CASE WHEN status = 'Paid' THEN NOW() ELSE refunded_at END,
         status = CASE WHEN status = 'Paid' THEN 'Refunded' ELSE 'Failed' END
     WHERE order_id = ?`,
    [`rfnd_${randomId(7)}`, order.id]
  );
}

// ---------------------------------------------------------------
// Customer
// ---------------------------------------------------------------

// Price preview used by the cart — same code path as placing the order.
export async function quoteOrder(req, res) {
  try {
    const quote = await buildQuote(pool, req.user.id, req.body);
    return res.json(quote);
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    // If only the coupon is the problem, still return the bill so the cart keeps working
    if (req.body.coupon_code) {
      try {
        const quote = await buildQuote(pool, req.user.id, { ...req.body, coupon_code: null });
        return res.json({ ...quote, coupon_error: err.message });
      } catch (inner) {
        if (!(inner instanceof HttpError)) throw inner;
        return res.status(inner.status).json({ message: inner.message });
      }
    }
    return res.status(err.status).json({ message: err.message });
  }
}

// ---------------------------------------------------------------
// The one place an order is written. Used by:
//   - cash checkout   (payment pending, collected at handover)
//   - online checkout (after the Razorpay signature has been verified)
//   - the manager's POS
// ---------------------------------------------------------------
export async function placeOrder(user, body, payment, { source = 'Online', status = 'Pending', enforceRestaurantId = null } = {}) {
  const { order_type = 'Delivery', delivery_address, table_no, notes } = body;
  if (!ORDER_TYPES.includes(order_type)) throw new HttpError('Invalid order type');
  if (source === 'Online' && order_type === 'Delivery' && (!delivery_address || String(delivery_address).trim().length < 5)) {
    throw new HttpError('Please add a delivery address');
  }

  let scheduledFor = null;
  if (body.scheduled_for) {
    scheduledFor = new Date(body.scheduled_for);
    const mins = (scheduledFor.getTime() - Date.now()) / 60000;
    if (Number.isNaN(scheduledFor.getTime())) throw new HttpError('Invalid schedule time');
    if (mins < 25) throw new HttpError('Schedule at least 30 minutes ahead');
    if (mins > 48 * 60) throw new HttpError('You can schedule up to 2 days ahead');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const q = await buildQuote(conn, user.id, body, { lock: true });
    if (enforceRestaurantId && q.restaurant_id !== enforceRestaurantId) throw new HttpError('Those dishes belong to another restaurant');
    if (payment.expectedTotal !== undefined && Math.abs(q.total - payment.expectedTotal) > 0.009) {
      throw new HttpError('Prices changed while you were paying', 409, { code: 'PRICE_CHANGED' });
    }

    // a 4-digit code the customer reads out when the food is handed over (delivery & pickup)
    const handoverCode = source === 'Online' && order_type !== 'Dine-in' ? randomDigits(4) : null;

    const [orderResult] = await conn.query(
      `INSERT INTO orders
        (customer_id, restaurant_id, status, order_type, delivery_address, table_no, notes,
         subtotal, discount_amount, coupon_code, tax_amount, delivery_fee, tip_amount, points_used, total_amount,
         eta_minutes, scheduled_for, handover_code, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id, q.restaurant_id, status, order_type,
        order_type === 'Delivery' && delivery_address ? String(delivery_address).trim().slice(0, 255) : null,
        order_type === 'Dine-in' && table_no ? String(table_no).trim().slice(0, 20) : null,
        notes ? String(notes).trim().slice(0, 255) : null,
        q.subtotal, round2(q.coupon_discount + q.points_discount), q.coupon_code, q.tax, q.delivery_fee, q.tip,
        q.points_used, q.total, q.eta_minutes, scheduledFor, handoverCode, source,
      ]
    );
    const orderId = orderResult.insertId;

    for (const line of q.lines) {
      await conn.query('INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES (?, ?, ?, ?)', [orderId, line.menu_item_id, line.quantity, line.price]);
      if (line.has_stock) {
        // quantity was already checked under a row lock. In PostgreSQL every SET expression sees the OLD
        // row, so "stock - qty" is spelled out in the second assignment to flip the dish to
        // "unavailable" the moment it sells out
        await conn.query(
          'UPDATE menu_items SET stock_qty = stock_qty - ?, is_available = CASE WHEN stock_qty - ? > 0 THEN is_available ELSE FALSE END WHERE id = ?',
          [line.quantity, line.quantity, line.menu_item_id]
        );
      }
    }

    if (q.points_used > 0) {
      const [r] = await conn.query('UPDATE users SET loyalty_points = loyalty_points - ? WHERE id = ? AND loyalty_points >= ?', [q.points_used, user.id, q.points_used]);
      if (r.affectedRows === 0) throw new HttpError('Not enough loyalty points');
    }
    if (q.coupon_id) {
      await conn.query('INSERT INTO coupon_usages (coupon_id, user_id, order_id) VALUES (?, ?, ?)', [q.coupon_id, user.id, orderId]);
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [q.coupon_id]);
    }

    const paid = payment.status === 'Paid';
    await conn.query(
      `INSERT INTO payments (order_id, amount, method, status, paid_at, transaction_ref, gateway_order_id, gateway_payment_id,
                             gateway_signature, card_last4, card_network, upi_masked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, q.total, payment.method, payment.status, paid ? new Date() : null, payment.gatewayPaymentId || null,
       payment.gatewayOrderId || null, payment.gatewayPaymentId || null, payment.signature || null,
       payment.cardLast4 || null, payment.cardNetwork || null, payment.upiMasked || null]
    );
    await conn.query('INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)', [orderId, status, source === 'POS' ? payment.byUser || null : user.id]);
    await conn.commit();

    toRestaurant(q.restaurant_id, 'order:new', { id: orderId, source, order_type });
    toUser(user.id, 'order:update', { id: orderId, status });
    if (source === 'Online') {
      // receipt to the customer's Gmail
      sendToUser(user.id, {
        kind: 'order_placed',
        subject: `Order ${orderNo(orderId)} received — ₹${q.total}`,
        heading: `Thanks! We received order ${orderNo(orderId)}`,
        lines: [
          `${q.restaurant.name} · ${order_type}${scheduledFor ? ` · scheduled for ${scheduledFor.toLocaleString('en-IN')}` : ''}`,
          ...q.lines.map((l) => `${l.quantity} × ${l.name}  —  ₹${(l.price * l.quantity).toFixed(2)}`),
          `Total paid / payable: ₹${q.total}${payment.status === 'Paid' ? ' (paid online)' : ' (pay at handover)'}`,
          ...(handoverCode ? [`Your hand-over code: ${handoverCode} — tell it to our ${order_type === 'Delivery' ? 'delivery partner' : 'counter staff'} when you receive your food.`] : []),
        ],
      });
      notifyManagers(q.restaurant_id, 'New order', `Order ${orderNo(orderId)} · ₹${q.total} (${order_type})${scheduledFor ? ' · scheduled' : ''}`, 'order', '/manager/orders');
      notifyUser(user.id, 'Order placed', `Order ${orderNo(orderId)} is waiting for the restaurant to accept it.${handoverCode ? ` Your hand-over code is ${handoverCode}.` : ''}`, 'order', '/user/orders');
    }
    return { orderId, total: q.total, eta_minutes: q.eta_minutes, restaurant_id: q.restaurant_id };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Cash on delivery / pay at counter. Online payments go through /api/payments (Razorpay flow).
export async function createOrder(req, res) {
  if ((req.body.payment_method || 'Cash') !== 'Cash') {
    return res.status(400).json({ message: 'Online payments must go through the payment gateway' });
  }
  const result = await placeOrder(req.user, req.body, { method: 'Cash', status: 'Pending' });
  res.status(201).json({ message: 'Order placed', orderId: result.orderId, total_amount: result.total, eta_minutes: result.eta_minutes });
}

export async function getMyOrders(req, res) {
  const [orders] = await pool.query(
    `SELECT o.id, o.restaurant_id, o.status, o.order_type, o.delivery_address, o.table_no, o.notes,
            o.subtotal, o.discount_amount, o.coupon_code, o.tax_amount, o.delivery_fee, o.points_used,
            o.points_earned, o.total_amount, o.tip_amount, o.eta_minutes, o.scheduled_for, o.created_at,
            CASE WHEN o.status IN ('Completed','Cancelled') THEN NULL ELSE o.handover_code END AS handover_code,
            r.name AS restaurant_name, r.address AS restaurant_address,
            p.method AS payment_method, p.status AS payment_status, p.gateway_payment_id, p.refund_id,
            rv.rating AS review_rating, rv.review AS review_text, rv.admin_reply,
            st.name AS rider_name, st.phone AS rider_phone,
            rr.status AS refund_request_status
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN payments p ON p.order_id = o.id
     LEFT JOIN reviews rv ON rv.order_id = o.id
     LEFT JOIN staff st ON st.id = o.rider_id
     LEFT JOIN refund_requests rr ON rr.order_id = o.id
     WHERE o.customer_id = ? ORDER BY o.created_at DESC`,
    [req.user.id]
  );
  await attachItems(orders);
  await attachHistory(orders);
  res.json(orders);
}

// Returns the CURRENT price/availability of everything in a past order so
// "Reorder" never adds stale prices or dishes that were taken off the menu.
export async function getReorderItems(req, res) {
  const [[order]] = await pool.query('SELECT id, customer_id FROM orders WHERE id = ?', [req.params.id]);
  if (!order || order.customer_id !== req.user.id) return res.status(404).json({ message: 'Order not found' });

  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.restaurant_id, m.price, m.discount_percent, m.is_veg, m.image_url,
            m.is_available, m.stock_qty, oi.quantity AS qty
     FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id = ?`,
    [order.id]
  );
  res.json(
    rows.map((r) => ({
      ...r,
      price: round2(Number(r.price) * (1 - r.discount_percent / 100)),
      available: !!r.is_available && (r.stock_qty === null || r.stock_qty > 0),
    }))
  );
}

export async function cancelMyOrder(req, res) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      'SELECT id, customer_id, restaurant_id, status, points_used FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!order || order.customer_id !== req.user.id) {
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'Pending') {
      await conn.rollback();
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });
    }
    await conn.query(`UPDATE orders SET status = 'Cancelled' WHERE id = ?`, [order.id]);
    await conn.query(`INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, 'Cancelled', ?)`, [order.id, req.user.id]);
    await releaseOrderResources(conn, order);
    await conn.commit();

    toRestaurant(order.restaurant_id, 'order:update', { id: order.id, status: 'Cancelled' });
    toUser(order.customer_id, 'order:update', { id: order.id, status: 'Cancelled' });
    notifyManagers(order.restaurant_id, 'Order cancelled', `Customer cancelled order ${orderNo(order.id)}.`, 'order', '/manager/orders');
    res.json({ message: 'Order cancelled' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------
// Admin / Manager  (scoped by req.restaurantId; null = admin sees all)
// ---------------------------------------------------------------
export async function getOrders(req, res) {
  const rid = req.restaurantId;
  const where = [];
  const params = [];
  if (rid) { where.push('o.restaurant_id = ?'); params.push(rid); }
  if (req.query.status && req.query.status !== 'All') { where.push('o.status = ?'); params.push(req.query.status); }
  if (req.query.type && ORDER_TYPES.includes(req.query.type)) { where.push('o.order_type = ?'); params.push(req.query.type); }
  if (req.query.from) { where.push('o.created_at::date >= ?'); params.push(req.query.from); }
  if (req.query.to) { where.push('o.created_at::date <= ?'); params.push(req.query.to); }

  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.order_type, o.table_no, o.notes, o.total_amount, o.tip_amount, o.eta_minutes, o.scheduled_for,
            o.source, o.rider_id, (o.handover_code IS NOT NULL AND o.status <> 'Completed') AS needs_code, o.created_at,
            u.name AS customer_name, u.phone AS customer_phone, r.name AS restaurant_name, st.name AS rider_name,
            p.method AS payment_method, p.status AS payment_status,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN staff st ON st.id = o.rider_id
     LEFT JOIN payments p ON p.order_id = o.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY o.created_at DESC
     LIMIT 500`,
    params
  );
  if (req.query.withItems === '1') await attachItems(rows);
  res.json(rows);
}

// Live kitchen board: only orders that still need work, with their items.
export async function getKitchenOrders(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.order_type, o.table_no, o.notes, o.eta_minutes, o.scheduled_for, o.source, o.created_at,
            (o.handover_code IS NOT NULL AND o.status <> 'Completed') AS needs_code, u.name AS customer_name,
            r.name AS restaurant_name
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.status IN ('Pending','Accepted','Preparing','Ready') ${rid ? 'AND o.restaurant_id = ?' : ''}
     ORDER BY o.created_at ASC`,
    rid ? [rid] : []
  );
  await attachItems(rows);
  res.json(rows);
}

export async function updateOrderStatus(req, res) {
  const { status } = req.body;
  const valid = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

  // Delivery / pickup orders can only be completed with the customer's 4-digit hand-over code.
  if (status === 'Completed') {
    const [[o]] = await pool.query('SELECT restaurant_id, status, handover_code, handover_attempts FROM orders WHERE id = ?', [req.params.id]);
    if (o && (!req.restaurantId || o.restaurant_id === req.restaurantId) && o.status === 'Ready' && o.handover_code) {
      const override = req.user.role === 'admin' && req.body.override === true;
      if (!override) {
        if (o.handover_attempts >= 5) throw new HttpError('Too many wrong codes — ask an admin to override', 423);
        if (!safeEqual(o.handover_code, String(req.body.handover_code || '').trim())) {
          await pool.query('UPDATE orders SET handover_attempts = handover_attempts + 1 WHERE id = ?', [req.params.id]);
          throw new HttpError('Incorrect hand-over code. Ask the customer to check their order screen.', 400, { code: 'BAD_HANDOVER_CODE' });
        }
      } else {
        audit(req, 'order.override_handover', 'order', Number(req.params.id), 'completed without code');
      }
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(
      'SELECT id, customer_id, restaurant_id, status, total_amount, points_used, points_awarded, handover_code, order_type FROM orders WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    // a manager can only ever touch their own restaurant's orders
    if (!order || (req.restaurantId && order.restaurant_id !== req.restaurantId)) {
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }
    if (!(FLOW[order.status] || []).includes(status)) {
      await conn.rollback();
      return res.status(400).json({ message: `An order that is ${order.status} cannot move to ${status}` });
    }

    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, order.id]);
    await conn.query('INSERT INTO order_status_history (order_id, status, changed_by) VALUES (?, ?, ?)', [order.id, status, req.user.id]);

    if (status === 'Completed') {
      await conn.query(`UPDATE payments SET status = 'Paid', paid_at = COALESCE(paid_at, NOW()) WHERE order_id = ? AND status = 'Pending'`, [order.id]);
      if (!order.points_awarded) {
        const earned = Math.floor(Number(order.total_amount) / POINTS_PER_RUPEES);
        await conn.query('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id = ?', [earned, order.customer_id]);
        await conn.query('UPDATE orders SET points_earned = ?, points_awarded = TRUE WHERE id = ?', [earned, order.id]);
      }
    }
    if (status === 'Cancelled') await releaseOrderResources(conn, order);

    await conn.commit();

    toRestaurant(order.restaurant_id, 'order:update', { id: order.id, status });
    toUser(order.customer_id, 'order:update', { id: order.id, status });
    if (status === 'Ready') {
      sendToUser(order.customer_id, {
        kind: 'order_ready', subject: `Order ${orderNo(order.id)} is ready`, heading: `Order ${orderNo(order.id)} is ready!`,
        lines: [order.order_type === 'Delivery' ? 'Your food is packed and a delivery partner is on the way.' : 'Your food is ready at the counter.', ...(order.handover_code ? [`Hand-over code: ${order.handover_code}`] : [])],
        sms: `Spice Route: order ${orderNo(order.id)} is ready.${order.handover_code ? ` Hand-over code ${order.handover_code}.` : ''}`,
      });
    } else if (status === 'Completed') {
      sendToUser(order.customer_id, { kind: 'order_completed', subject: `Order ${orderNo(order.id)} completed`, heading: 'Enjoy your meal!', lines: [`Order ${orderNo(order.id)} is complete — total ₹${order.total_amount}.`, 'Rate your order in the app and earn loyalty points on every purchase.'] });
    } else if (status === 'Cancelled') {
      sendToUser(order.customer_id, { kind: 'order_cancelled', subject: `Order ${orderNo(order.id)} cancelled`, heading: 'Your order was cancelled', lines: ['The restaurant could not fulfil this order. Any online payment is being refunded automatically.'] });
    }
    notifyUser(order.customer_id, `Order ${orderNo(order.id)} · ${status}`, STATUS_MESSAGES[status] || `Status: ${status}`, 'order', '/user/orders');
    audit(req, 'order.status', 'order', order.id, `${order.status} → ${status}`);
    res.json({ message: 'Order status updated' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// full order detail — used by the admin/manager "Bill" and detail views
export async function getOrderDetail(req, res) {
  const rid = req.restaurantId;
  const params = rid ? [req.params.id, rid] : [req.params.id];

  const [[order]] = await pool.query(
    `SELECT o.id, o.status, o.order_type, o.delivery_address, o.table_no, o.notes, o.subtotal, o.discount_amount,
            o.coupon_code, o.tax_amount, o.delivery_fee, o.tip_amount, o.points_used, o.total_amount, o.eta_minutes,
            o.scheduled_for, o.source, o.rider_id, (o.handover_code IS NOT NULL AND o.status <> 'Completed') AS needs_code, o.created_at,
            u.name AS customer_name, u.phone AS customer_phone,
            r.name AS restaurant_name, r.address AS restaurant_address, st.name AS rider_name, st.phone AS rider_phone,
            p.method AS payment_method, p.status AS payment_status, p.transaction_ref, p.gateway_payment_id, p.refund_id
     FROM orders o
     JOIN users u ON u.id = o.customer_id
     JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN staff st ON st.id = o.rider_id
     LEFT JOIN payments p ON p.order_id = o.id
     WHERE o.id = ? ${rid ? 'AND o.restaurant_id = ?' : ''}`,
    params
  );
  if (!order) return res.status(404).json({ message: 'Order not found' });

  await attachItems([order]);
  await attachHistory([order]);
  res.json(order);
}

// ---------------------------------------------------------------
// Riders (delivery partners are staff members whose position contains "deliver"/"rider")
// ---------------------------------------------------------------
export async function getRiders(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.phone, s.restaurant_id FROM staff s
     WHERE s.is_active = TRUE AND (LOWER(s.position) LIKE '%deliver%' OR LOWER(s.position) LIKE '%rider%')
     ${rid ? 'AND s.restaurant_id = ?' : ''} ORDER BY s.name`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function assignRider(req, res) {
  const rid = req.restaurantId;
  const [[order]] = await pool.query('SELECT id, customer_id, restaurant_id, order_type, status FROM orders WHERE id = ?', [req.params.id]);
  if (!order || (rid && order.restaurant_id !== rid)) return res.status(404).json({ message: 'Order not found' });
  if (order.order_type !== 'Delivery') return res.status(400).json({ message: 'Only delivery orders need a rider' });
  if (['Completed', 'Cancelled'].includes(order.status)) return res.status(400).json({ message: 'This order is already closed' });

  let rider = null;
  if (req.body.rider_id) {
    [[rider]] = await pool.query('SELECT id, name, phone FROM staff WHERE id = ? AND restaurant_id = ? AND is_active = TRUE', [req.body.rider_id, order.restaurant_id]);
    if (!rider) return res.status(400).json({ message: 'That rider is not available at this restaurant' });
  }
  await pool.query('UPDATE orders SET rider_id = ? WHERE id = ?', [rider ? rider.id : null, order.id]);
  toUser(order.customer_id, 'order:update', { id: order.id });
  toRestaurant(order.restaurant_id, 'order:update', { id: order.id });
  if (rider) notifyUser(order.customer_id, 'Delivery partner assigned', `${rider.name}${rider.phone ? ` (${rider.phone})` : ''} will deliver order ${orderNo(order.id)}.`, 'order', '/user/orders');
  audit(req, 'order.rider', 'order', order.id, rider ? rider.name : 'unassigned');
  res.json({ message: rider ? 'Rider assigned' : 'Rider removed' });
}

// ---------------------------------------------------------------
// Customer: ask for a refund on a paid order
// ---------------------------------------------------------------
export async function requestRefund(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (reason.length < 5) return res.status(400).json({ message: 'Tell us briefly what went wrong' });
  const [[order]] = await pool.query(
    `SELECT o.id, o.customer_id, o.restaurant_id, o.status, o.created_at, p.status AS payment_status
     FROM orders o LEFT JOIN payments p ON p.order_id = o.id WHERE o.id = ?`,
    [req.params.id]
  );
  if (!order || order.customer_id !== req.user.id) return res.status(404).json({ message: 'Order not found' });
  if (order.status !== 'Completed') return res.status(400).json({ message: 'Refunds can only be requested for completed orders' });
  if (order.payment_status !== 'Paid') return res.status(400).json({ message: 'This order has no payment to refund' });
  if (Date.now() - new Date(order.created_at).getTime() > 7 * 86400000) return res.status(400).json({ message: 'The 7-day refund window has passed' });

  // UNIQUE(order_id) → ER_DUP_ENTRY → "already exists" from the global handler
  await pool.query('INSERT INTO refund_requests (order_id, user_id, reason) VALUES (?, ?, ?)', [order.id, req.user.id, reason.slice(0, 255)]);
  notifyManagers(order.restaurant_id, 'Refund requested', `Order ${orderNo(order.id)}: ${reason.slice(0, 80)}`, 'refund', '/manager/payments');
  res.status(201).json({ message: 'Refund request sent — the restaurant will review it' });
}
