// One place for every number that touches a customer's bill, so the cart
// preview and the order that actually gets saved can never disagree.
export const DELIVERY_FEE = 25;
export const TAX_RATE = 0.05;
export const FREE_DELIVERY_THRESHOLD = 299;
export const POINTS_PER_RUPEES = 10;       // earn 1 point per ₹10 spent
export const POINT_VALUE = 1;              // 1 point = ₹1 when redeemed
export const MAX_POINTS_PERCENT = 0.2;     // points can cover at most 20% of the bill

export const MAX_TIP = 500;
export const ORDER_TYPES = ['Delivery', 'Pickup', 'Dine-in'];
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card'];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export class HttpError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.extra = extra; // merged into the JSON body (e.g. { code: 'UNVERIFIED' })
  }
}

// Validates a coupon for a given restaurant / subtotal / user and returns the
// rupee discount. Throws HttpError with a customer-friendly reason otherwise.
export async function evaluateCoupon(conn, { code, restaurantId, subtotal, userId }) {
  const [[coupon]] = await conn.query('SELECT * FROM coupons WHERE code = ?', [String(code).trim().toUpperCase()]);
  if (!coupon || !coupon.is_active) throw new HttpError('That coupon code is not valid');
  if (coupon.restaurant_id && coupon.restaurant_id !== restaurantId) {
    throw new HttpError('This coupon is not valid at this restaurant');
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = coupon.valid_from ? new Date(coupon.valid_from).toISOString().slice(0, 10) : null;
  const until = coupon.valid_until ? new Date(coupon.valid_until).toISOString().slice(0, 10) : null;
  if (from && today < from) throw new HttpError('This coupon is not active yet');
  if (until && today > until) throw new HttpError('This coupon has expired');

  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    throw new HttpError('This coupon has reached its usage limit');
  }
  if (subtotal < Number(coupon.min_order)) {
    throw new HttpError(`Add ₹${Math.ceil(Number(coupon.min_order) - subtotal)} more to use this coupon`);
  }
  const [[{ used }]] = await conn.query(
    'SELECT COUNT(*) AS used FROM coupon_usages WHERE coupon_id = ? AND user_id = ?',
    [coupon.id, userId]
  );
  if (used >= coupon.per_user_limit) throw new HttpError('You have already used this coupon');

  let discount =
    coupon.discount_type === 'percent'
      ? (subtotal * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);
  if (coupon.max_discount !== null) discount = Math.min(discount, Number(coupon.max_discount));
  discount = round2(Math.min(discount, subtotal));

  return { coupon, discount };
}

// Builds the full, server-trusted bill. `items` = [{ menu_item_id, quantity }].
// Never trusts prices from the browser.
export async function buildQuote(conn, userId, payload, { lock = false } = {}) {
  const { items, coupon_code, order_type = 'Delivery', use_points = 0 } = payload;

  if (!Array.isArray(items) || items.length === 0) throw new HttpError('Your cart is empty');
  if (!ORDER_TYPES.includes(order_type)) throw new HttpError('Invalid order type');

  let restaurantId = null;
  let subtotal = 0;
  let maxPrep = 0;
  const lines = [];

  for (const item of items) {
    const quantity = Math.floor(Number(item.quantity));
    if (!quantity || quantity < 1 || quantity > 50) throw new HttpError('Invalid quantity in your cart');

    const [[m]] = await conn.query(
      `SELECT id, name, restaurant_id, price, discount_percent, is_available, stock_qty, prep_time_min
       FROM menu_items WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
      [item.menu_item_id]
    );
    if (!m) throw new HttpError('An item in your cart no longer exists');
    if (!m.is_available) throw new HttpError(`${m.name} is no longer available`);
    if (m.stock_qty !== null && m.stock_qty < quantity) {
      throw new HttpError(m.stock_qty === 0 ? `${m.name} is sold out` : `Only ${m.stock_qty} left of ${m.name}`);
    }

    if (restaurantId === null) restaurantId = m.restaurant_id;
    if (restaurantId !== m.restaurant_id) throw new HttpError('All items in one order must be from the same restaurant');

    const unitPrice = round2(Number(m.price) * (1 - m.discount_percent / 100));
    subtotal += unitPrice * quantity;
    maxPrep = Math.max(maxPrep, m.prep_time_min);
    lines.push({ menu_item_id: m.id, name: m.name, quantity, price: unitPrice, has_stock: m.stock_qty !== null });
  }
  subtotal = round2(subtotal);

  const [[restaurant]] = await conn.query('SELECT id, name, is_open, opening_time, closing_time FROM restaurants WHERE id = ?', [restaurantId]);
  if (!restaurant) throw new HttpError('Restaurant not found');
  if (!restaurant.is_open) throw new HttpError(`${restaurant.name} is not accepting orders right now`);

  // Coupon
  let couponDiscount = 0;
  let couponRow = null;
  if (coupon_code && String(coupon_code).trim()) {
    const result = await evaluateCoupon(conn, { code: coupon_code, restaurantId, subtotal, userId });
    couponDiscount = result.discount;
    couponRow = result.coupon;
  }

  // Loyalty points (only ever capped, never rejected, so a stale slider can't block checkout)
  const [[user]] = await conn.query('SELECT loyalty_points FROM users WHERE id = ?', [userId]);
  const afterCoupon = round2(subtotal - couponDiscount);
  const maxRedeemable = Math.max(0, Math.min(user.loyalty_points, Math.floor(afterCoupon * MAX_POINTS_PERCENT / POINT_VALUE)));
  const pointsUsed = Math.max(0, Math.min(Math.floor(Number(use_points) || 0), maxRedeemable));
  const pointsDiscount = round2(pointsUsed * POINT_VALUE);

  // Free delivery on a customer's very first order, or above the threshold
  let deliveryFee = 0;
  let freeDeliveryReason = null;
  if (order_type === 'Delivery') {
    const [[{ prior }]] = await conn.query(
      `SELECT COUNT(*) AS prior FROM orders WHERE customer_id = ? AND status <> 'Cancelled'`,
      [userId]
    );
    if (prior === 0) freeDeliveryReason = 'first_order';
    else if (subtotal >= FREE_DELIVERY_THRESHOLD) freeDeliveryReason = 'threshold';
    deliveryFee = freeDeliveryReason ? 0 : DELIVERY_FEE;
  }

  const taxable = round2(afterCoupon - pointsDiscount);
  const tax = round2(taxable * TAX_RATE);
  // tip goes straight to the team: not taxed, capped so a typo can't charge ₹50,000
  const tip = round2(Math.max(0, Math.min(MAX_TIP, Number(payload.tip) || 0)));
  const total = round2(taxable + tax + deliveryFee + tip);

  return {
    restaurant,
    restaurant_id: restaurantId,
    lines,
    subtotal,
    coupon_code: couponRow ? couponRow.code : null,
    coupon_id: couponRow ? couponRow.id : null,
    coupon_discount: couponDiscount,
    points_used: pointsUsed,
    points_discount: pointsDiscount,
    max_redeemable_points: maxRedeemable,
    available_points: user.loyalty_points,
    tax,
    tip,
    delivery_fee: deliveryFee,
    free_delivery_reason: freeDeliveryReason,
    total,
    eta_minutes: maxPrep + (order_type === 'Delivery' ? 20 : 0),
    points_to_earn: Math.floor(total / POINTS_PER_RUPEES),
  };
}
