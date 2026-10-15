import pool from '../config/db.js';
import { HttpError } from '../utils/pricing.js';
import { WALKIN_EMAIL } from '../utils/security.js';
import { audit } from '../utils/audit.js';
import { placeOrder } from './orderController.js';

const POS_METHODS = ['Cash', 'UPI', 'Card'];

// Counter / walk-in order taken by staff. Paid on the spot, goes straight to the kitchen as "Accepted".
export async function createPosOrder(req, res) {
  const { items, table_no, notes, payment_method = 'Cash' } = req.body;
  const order_type = req.body.order_type === 'Pickup' ? 'Pickup' : 'Dine-in';
  if (!POS_METHODS.includes(payment_method)) throw new HttpError('Choose Cash, UPI or Card');

  const [[walkin]] = await pool.query('SELECT id, name FROM users WHERE email = ?', [WALKIN_EMAIL]);
  if (!walkin) throw new HttpError('Walk-in customer missing — run the schema again (npm run db:setup)', 500);

  const result = await placeOrder(
    walkin,
    { items, order_type, table_no, notes },
    { method: payment_method, status: 'Paid', byUser: req.user.id, gatewayPaymentId: null },
    { source: 'POS', status: 'Accepted', enforceRestaurantId: req.restaurantId }
  );
  audit(req, 'pos.order', 'order', result.orderId, `₹${result.total} ${payment_method}`);
  res.status(201).json({ message: 'Order sent to the kitchen', orderId: result.orderId, total_amount: result.total });
}
