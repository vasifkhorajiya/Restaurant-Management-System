import pool from '../config/db.js';
import { HttpError } from '../utils/pricing.js';
import { notifyManagers, notifyUser } from '../utils/notify.js';
import { toRestaurant } from '../utils/realtime.js';

const TYPES = ['Waiter', 'Bill', 'Water', 'Help'];
const LABEL = { Waiter: 'needs a waiter', Bill: 'wants the bill', Water: 'would like water', Help: 'needs help' };

// Customer taps "Call waiter" / "Request bill" on their dine-in order → staff screen lights up instantly
export async function createServiceRequest(req, res) {
  const type = req.body.type;
  if (!TYPES.includes(type)) throw new HttpError('Invalid request');
  const [[order]] = await pool.query(
    'SELECT id, customer_id, restaurant_id, order_type, table_no, status, created_at FROM orders WHERE id = ?',
    [req.params.id]
  );
  if (!order || order.customer_id !== req.user.id) throw new HttpError('Order not found', 404);
  if (order.order_type !== 'Dine-in') throw new HttpError('Only dine-in orders can call the waiter');
  if (order.status === 'Cancelled') throw new HttpError('This order was cancelled');
  if (Date.now() - new Date(order.created_at).getTime() > 6 * 3600 * 1000) throw new HttpError('This order is too old');

  const [[open]] = await pool.query(`SELECT id FROM service_requests WHERE order_id = ? AND type = ? AND status = 'Open'`, [order.id, type]);
  if (open) throw new HttpError('Already requested — someone is on the way', 409);

  const [r] = await pool.query(
    'INSERT INTO service_requests (restaurant_id, order_id, user_id, table_no, type) VALUES (?, ?, ?, ?, ?)',
    [order.restaurant_id, order.id, req.user.id, order.table_no, type]
  );
  const payload = { id: r.insertId, order_id: order.id, table_no: order.table_no, type, customer_name: req.user.name };
  toRestaurant(order.restaurant_id, 'service:new', payload);
  notifyManagers(order.restaurant_id, 'Table request', `${order.table_no ? `Table ${order.table_no}` : req.user.name} ${LABEL[type]}.`, 'service', '/manager/kitchen');
  res.status(201).json({ message: 'Staff have been notified', id: r.insertId });
}

// ---------- staff ----------
export async function getServiceRequests(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT sr.id, sr.order_id, sr.table_no, sr.type, sr.created_at, u.name AS customer_name, r.name AS restaurant_name
     FROM service_requests sr JOIN users u ON u.id = sr.user_id JOIN restaurants r ON r.id = sr.restaurant_id
     WHERE sr.status = 'Open' ${rid ? 'AND sr.restaurant_id = ?' : ''} ORDER BY sr.created_at`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function completeServiceRequest(req, res) {
  const rid = req.restaurantId;
  const [[sr]] = await pool.query('SELECT id, user_id, restaurant_id, type, status FROM service_requests WHERE id = ?', [req.params.id]);
  if (!sr || (rid && sr.restaurant_id !== rid)) throw new HttpError('Request not found', 404);
  if (sr.status === 'Done') return res.json({ message: 'Already done' });
  await pool.query(`UPDATE service_requests SET status = 'Done', done_at = NOW(), done_by = ? WHERE id = ?`, [req.user.id, sr.id]);
  toRestaurant(sr.restaurant_id, 'service:done', { id: sr.id });
  notifyUser(sr.user_id, 'On the way', sr.type === 'Bill' ? 'Your bill is coming to the table.' : 'A team member is coming to your table.', 'service', '/user/orders');
  res.json({ message: 'Marked done' });
}
