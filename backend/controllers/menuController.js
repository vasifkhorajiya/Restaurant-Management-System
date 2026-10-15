import pool from '../config/db.js';
import { audit } from '../utils/audit.js';

// Resolves which restaurant_id to write to:
//  - manager -> always their own restaurant (req.restaurantId)
//  - admin   -> whatever restaurant_id they send in the body (they manage many)
function resolveRestaurantId(req) {
  return req.restaurantId ?? req.body.restaurant_id;
}

// appended to UPDATE/DELETE so a manager can never touch another restaurant's rows
const scope = (req) => (req.restaurantId ? { sql: ' AND restaurant_id = ?', params: [req.restaurantId] } : { sql: '', params: [] });

// A dish's rating = average rating of the orders that contained it.
const RATING_SQL = `
  (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv
    WHERE rv.order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.menu_item_id = m.id)) AS avg_rating,
  (SELECT COUNT(*) FROM reviews rv
    WHERE rv.order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.menu_item_id = m.id)) AS review_count`;

function parseItemBody(body) {
  const price = Number(body.price);
  const discount = Math.max(0, Math.min(90, Number(body.discount_percent) || 0));
  const stock = body.stock_qty === '' || body.stock_qty == null ? null : Math.max(0, Math.floor(Number(body.stock_qty)));
  return {
    name: String(body.name || '').trim(),
    price,
    discount,
    stock,
    description: body.description ? String(body.description).slice(0, 500) : null,
    prep: Math.max(1, Math.min(240, Math.floor(Number(body.prep_time_min)) || 15)),
    spice: Math.max(0, Math.min(3, Math.floor(Number(body.spice_level)) || 0)),
    featured: !!body.is_featured,
  };
}

function itemProblem(i, categoryId) {
  if (!i.name) return 'Item name is required';
  if (!(i.price > 0)) return 'Price must be greater than 0';
  if (!categoryId) return 'Pick a category';
  return null;
}

// ---------- CATEGORIES (admin/manager) ----------
export async function getCategories(req, res) {
  const rid = req.restaurantId;
  const [rows] = rid
    ? await pool.query('SELECT * FROM categories WHERE restaurant_id = ? ORDER BY name', [rid])
    : await pool.query('SELECT * FROM categories ORDER BY name');
  res.json(rows);
}

export async function createCategory(req, res) {
  const restaurantId = resolveRestaurantId(req);
  const name = String(req.body.name || '').trim();
  if (!restaurantId) return res.status(400).json({ message: 'restaurant_id is required' });
  if (!name) return res.status(400).json({ message: 'Category name is required' });
  const [result] = await pool.query('INSERT INTO categories (restaurant_id, name) VALUES (?, ?)', [restaurantId, name]);
  res.status(201).json({ message: 'Category created', id: result.insertId });
}

export async function deleteCategory(req, res) {
  const s = scope(req);
  await pool.query(`DELETE FROM categories WHERE id = ?${s.sql}`, [req.params.id, ...s.params]);
  audit(req, 'category.delete', 'category', Number(req.params.id));
  res.json({ message: 'Category deleted' });
}

// ---------- MENU ITEMS (admin/manager) ----------
export async function getMenuItems(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT m.*, r.name AS restaurant_name, ${RATING_SQL}
     FROM menu_items m JOIN restaurants r ON r.id = m.restaurant_id
     ${rid ? 'WHERE m.restaurant_id = ?' : ''} ORDER BY m.created_at DESC`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function createMenuItem(req, res) {
  const restaurantId = resolveRestaurantId(req);
  if (!restaurantId) return res.status(400).json({ message: 'restaurant_id is required' });
  const i = parseItemBody(req.body);
  const problem = itemProblem(i, req.body.category_id);
  if (problem) return res.status(400).json({ message: problem });

  const [result] = await pool.query(
    `INSERT INTO menu_items (restaurant_id, category_id, name, price, discount_percent, is_veg, image_url, is_available,
                             description, prep_time_min, spice_level, is_featured, stock_qty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [restaurantId, req.body.category_id, i.name, i.price, i.discount, req.body.is_veg ?? true, req.body.image_url || null,
     req.body.is_available ?? true, i.description, i.prep, i.spice, i.featured, i.stock]
  );
  audit(req, 'menu.create', 'menu_item', result.insertId, i.name);
  res.status(201).json({ message: 'Menu item created', id: result.insertId });
}

export async function updateMenuItem(req, res) {
  const i = parseItemBody(req.body);
  const problem = itemProblem(i, req.body.category_id);
  if (problem) return res.status(400).json({ message: problem });
  const s = scope(req);

  const [result] = await pool.query(
    `UPDATE menu_items SET name=?, category_id=?, price=?, discount_percent=?, is_veg=?, image_url=?, is_available=?,
            description=?, prep_time_min=?, spice_level=?, is_featured=?, stock_qty=?
     WHERE id=?${s.sql}`,
    [i.name, req.body.category_id, i.price, i.discount, req.body.is_veg ?? true, req.body.image_url || null,
     req.body.is_available ?? true, i.description, i.prep, i.spice, i.featured, i.stock, req.params.id, ...s.params]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Menu item not found' });
  audit(req, 'menu.update', 'menu_item', Number(req.params.id), i.name);
  res.json({ message: 'Menu item updated' });
}

export async function deleteMenuItem(req, res) {
  const s = scope(req);
  await pool.query(`DELETE FROM menu_items WHERE id = ?${s.sql}`, [req.params.id, ...s.params]);
  audit(req, 'menu.delete', 'menu_item', Number(req.params.id));
  res.json({ message: 'Menu item deleted' });
}

export async function toggleAvailability(req, res) {
  const s = scope(req);
  await pool.query(`UPDATE menu_items SET is_available = ? WHERE id = ?${s.sql}`, [!!req.body.is_available, req.params.id, ...s.params]);
  res.json({ message: 'Availability updated' });
}

// Quick discount adjust — used by the +/- stepper and "Remove" button on each food card.
export async function updateDiscount(req, res) {
  let discount_percent = Number(req.body.discount_percent);
  if (Number.isNaN(discount_percent)) {
    return res.status(400).json({ message: 'discount_percent must be a number' });
  }
  // clamp rather than reject — makes the +/- buttons foolproof
  discount_percent = Math.max(0, Math.min(90, discount_percent));
  const s = scope(req);
  await pool.query(`UPDATE menu_items SET discount_percent = ? WHERE id = ?${s.sql}`, [discount_percent, req.params.id, ...s.params]);
  res.json({ message: 'Discount updated', discount_percent });
}

// Quick stock top-up from the menu screen (null = unlimited)
export async function updateStock(req, res) {
  const raw = req.body.stock_qty;
  const stock = raw === '' || raw == null ? null : Math.max(0, Math.floor(Number(raw)));
  if (stock !== null && Number.isNaN(stock)) return res.status(400).json({ message: 'stock_qty must be a number' });
  const s = scope(req);
  await pool.query(
    `UPDATE menu_items SET stock_qty = ?::int, is_available = CASE WHEN ?::int IS NOT NULL AND ?::int = 0 THEN FALSE ELSE is_available END WHERE id = ?${s.sql}`,
    [stock, stock, stock, req.params.id, ...s.params]
  );
  res.json({ message: 'Stock updated', stock_qty: stock });
}

// ---------- PUBLIC (customer-facing) ----------
export async function getPublicMenu(req, res) {
  const [rows] = await pool.query(
    `SELECT m.*, r.name AS restaurant_name, r.is_open AS restaurant_open, c.name AS category_name, ${RATING_SQL}
     FROM menu_items m
     JOIN restaurants r ON r.id = m.restaurant_id
     JOIN categories c ON c.id = m.category_id
     WHERE m.is_available = TRUE
     ORDER BY m.name`
  );
  res.json(rows);
}

export async function getPopularMenu(req, res) {
  // "Popular" = dishes that appear in the most order_items rows
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.price, m.discount_percent, m.is_veg, m.image_url, m.restaurant_id, m.description,
            m.spice_level, m.prep_time_min, m.stock_qty, r.name AS restaurant_name,
            COUNT(oi.id) AS order_count, ${RATING_SQL}
     FROM menu_items m
     JOIN restaurants r ON r.id = m.restaurant_id
     LEFT JOIN order_items oi ON oi.menu_item_id = m.id
     WHERE m.is_available = TRUE
     GROUP BY m.id, r.id
     ORDER BY order_count DESC, m.is_featured DESC
     LIMIT 8`
  );
  res.json(rows);
}

export async function getPublicCategories(req, res) {
  const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
  res.json(rows);
}

// customer-facing restaurant list (menu filter + "Book a Table")
export async function getPublicRestaurants(req, res) {
  const [rows] = await pool.query(
    `SELECT r.id, r.name, r.address, r.phone, r.opening_time, r.closing_time, r.description, r.cuisine, r.is_open,
            (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv JOIN orders o ON o.id = rv.order_id WHERE o.restaurant_id = r.id) AS avg_rating,
            (SELECT COUNT(*) FROM reviews rv JOIN orders o ON o.id = rv.order_id WHERE o.restaurant_id = r.id) AS review_count
     FROM restaurants r ORDER BY r.name`
  );
  res.json(rows);
}
