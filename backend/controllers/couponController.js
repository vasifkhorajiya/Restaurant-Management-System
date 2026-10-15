import pool from '../config/db.js';
import { audit } from '../utils/audit.js';

// ---------- customer: coupons they can browse in the cart ----------
export async function getAvailableCoupons(req, res) {
  const rid = req.query.restaurant_id ? Number(req.query.restaurant_id) : null;
  const [rows] = await pool.query(
    `SELECT code, description, discount_type, discount_value, min_order, max_discount, valid_until
     FROM coupons
     WHERE is_active = TRUE
       AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
       AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
       AND (usage_limit IS NULL OR used_count < usage_limit)
       AND (restaurant_id IS NULL ${rid ? 'OR restaurant_id = ?' : ''})
       AND per_user_limit > (SELECT COUNT(*) FROM coupon_usages cu WHERE cu.coupon_id = coupons.id AND cu.user_id = ?)
     ORDER BY min_order`,
    rid ? [rid, req.user.id] : [req.user.id]
  );
  res.json(rows);
}

// ---------- admin / manager ----------
export async function getCoupons(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT c.*, r.name AS restaurant_name FROM coupons c
     LEFT JOIN restaurants r ON r.id = c.restaurant_id
     ${rid ? 'WHERE c.restaurant_id = ?' : ''} ORDER BY c.created_at DESC`,
    rid ? [rid] : []
  );
  res.json(rows);
}

function clean(body) {
  const code = String(body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const type = body.discount_type === 'flat' ? 'flat' : 'percent';
  const value = Number(body.discount_value);
  return {
    code,
    type,
    value,
    description: body.description ? String(body.description).slice(0, 255) : null,
    min_order: Math.max(0, Number(body.min_order) || 0),
    max_discount: body.max_discount === '' || body.max_discount == null ? null : Number(body.max_discount),
    usage_limit: body.usage_limit === '' || body.usage_limit == null ? null : Number(body.usage_limit),
    per_user_limit: Math.max(1, Number(body.per_user_limit) || 1),
    valid_from: body.valid_from || null,
    valid_until: body.valid_until || null,
    is_active: body.is_active ?? true,
  };
}

function validate(c) {
  if (!/^[A-Z0-9_-]{3,40}$/.test(c.code)) return 'Code must be 3-40 letters/numbers';
  if (!(c.value > 0)) return 'Discount value must be greater than 0';
  if (c.type === 'percent' && c.value > 90) return 'Percent discount cannot exceed 90';
  if (c.valid_from && c.valid_until && c.valid_until < c.valid_from) return 'Valid-until is before valid-from';
  return null;
}

export async function createCoupon(req, res) {
  const c = clean(req.body);
  const problem = validate(c);
  if (problem) return res.status(400).json({ message: problem });
  // managers can only create coupons for their own restaurant; admin may leave it blank (= all restaurants)
  const restaurantId = req.restaurantId ?? (req.body.restaurant_id || null);

  const [result] = await pool.query(
    `INSERT INTO coupons (restaurant_id, code, description, discount_type, discount_value, min_order, max_discount,
                          usage_limit, per_user_limit, valid_from, valid_until, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [restaurantId, c.code, c.description, c.type, c.value, c.min_order, c.max_discount, c.usage_limit,
     c.per_user_limit, c.valid_from, c.valid_until, c.is_active]
  );
  audit(req, 'coupon.create', 'coupon', result.insertId, c.code);
  res.status(201).json({ message: 'Coupon created', id: result.insertId });
}

export async function updateCoupon(req, res) {
  const c = clean(req.body);
  const problem = validate(c);
  if (problem) return res.status(400).json({ message: problem });
  const rid = req.restaurantId;

  const [result] = await pool.query(
    `UPDATE coupons SET code=?, description=?, discount_type=?, discount_value=?, min_order=?, max_discount=?,
            usage_limit=?, per_user_limit=?, valid_from=?, valid_until=?, is_active=?
     WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`,
    [c.code, c.description, c.type, c.value, c.min_order, c.max_discount, c.usage_limit, c.per_user_limit,
     c.valid_from, c.valid_until, c.is_active, req.params.id, ...(rid ? [rid] : [])]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Coupon not found' });
  audit(req, 'coupon.update', 'coupon', Number(req.params.id), c.code);
  res.json({ message: 'Coupon updated' });
}

export async function toggleCoupon(req, res) {
  const rid = req.restaurantId;
  await pool.query(
    `UPDATE coupons SET is_active = ? WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`,
    [!!req.body.is_active, req.params.id, ...(rid ? [rid] : [])]
  );
  res.json({ message: 'Coupon updated' });
}

export async function deleteCoupon(req, res) {
  const rid = req.restaurantId;
  await pool.query(`DELETE FROM coupons WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`, [req.params.id, ...(rid ? [rid] : [])]);
  audit(req, 'coupon.delete', 'coupon', Number(req.params.id));
  res.json({ message: 'Coupon deleted' });
}
