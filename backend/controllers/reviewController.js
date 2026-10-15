import pool from '../config/db.js';
import { notifyUser } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

export async function createReview(req, res) {
  const { order_id, rating, review } = req.body;
  const stars = Number(rating);
  if (!order_id || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ message: 'order_id and a rating from 1 to 5 are required' });
  }
  const [[order]] = await pool.query('SELECT customer_id, status FROM orders WHERE id = ?', [order_id]);
  if (!order || order.customer_id !== req.user.id) {
    return res.status(404).json({ message: 'Order not found' });
  }
  if (order.status !== 'Completed') {
    return res.status(400).json({ message: 'You can only review completed orders' });
  }
  // ER_DUP_ENTRY (one review per order) is translated by the global error handler
  await pool.query(
    'INSERT INTO reviews (order_id, customer_id, rating, review) VALUES (?, ?, ?, ?)',
    [order_id, req.user.id, stars, review ? String(review).slice(0, 1000) : null]
  );
  res.status(201).json({ message: 'Thanks for your feedback!' });
}

// public: reviews of orders that contained a given dish
export async function getItemReviews(req, res) {
  const [rows] = await pool.query(
    `SELECT rv.rating, rv.review, rv.admin_reply, rv.created_at, u.name AS customer_name
     FROM reviews rv
     JOIN users u ON u.id = rv.customer_id
     WHERE rv.order_id IN (SELECT order_id FROM order_items WHERE menu_item_id = ?)
       AND rv.review IS NOT NULL AND rv.review <> ''
     ORDER BY rv.created_at DESC LIMIT 10`,
    [req.params.id]
  );
  res.json(rows.map((r) => ({ ...r, customer_name: r.customer_name.split(' ')[0] })));
}

// ---------- admin / manager ----------
export async function getReviews(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT rv.id, rv.rating, rv.review, rv.admin_reply, rv.replied_at, rv.created_at, rv.order_id,
            u.name AS customer_name, r.name AS restaurant_name
     FROM reviews rv
     JOIN orders o ON o.id = rv.order_id
     JOIN users u ON u.id = rv.customer_id
     JOIN restaurants r ON r.id = o.restaurant_id
     ${rid ? 'WHERE o.restaurant_id = ?' : ''}
     ORDER BY rv.created_at DESC LIMIT 300`,
    rid ? [rid] : []
  );
  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(rv.rating), 2), 0) AS average
     FROM reviews rv JOIN orders o ON o.id = rv.order_id ${rid ? 'WHERE o.restaurant_id = ?' : ''}`,
    rid ? [rid] : []
  );
  res.json({ summary, items: rows });
}

export async function replyToReview(req, res) {
  const reply = String(req.body.reply || '').trim();
  if (!reply) return res.status(400).json({ message: 'Write a reply first' });
  const rid = req.restaurantId;

  const [[rv]] = await pool.query(
    `SELECT rv.id, rv.customer_id, o.restaurant_id FROM reviews rv JOIN orders o ON o.id = rv.order_id WHERE rv.id = ?`,
    [req.params.id]
  );
  if (!rv || (rid && rv.restaurant_id !== rid)) return res.status(404).json({ message: 'Review not found' });

  await pool.query('UPDATE reviews SET admin_reply = ?, replied_at = NOW() WHERE id = ?', [reply.slice(0, 1000), rv.id]);
  notifyUser(rv.customer_id, 'The restaurant replied to your review', reply.slice(0, 200), 'review', '/user/orders');
  audit(req, 'review.reply', 'review', rv.id);
  res.json({ message: 'Reply posted' });
}
