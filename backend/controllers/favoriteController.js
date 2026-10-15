import pool from '../config/db.js';

export async function getFavorites(req, res) {
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.price, m.discount_percent, m.is_veg, m.image_url, m.is_available, m.restaurant_id,
            m.description, m.stock_qty, m.prep_time_min, m.spice_level, r.name AS restaurant_name,
            (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv WHERE rv.order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.menu_item_id = m.id)) AS avg_rating,
            (SELECT COUNT(*) FROM reviews rv WHERE rv.order_id IN (SELECT oi.order_id FROM order_items oi WHERE oi.menu_item_id = m.id)) AS review_count
     FROM favorites f JOIN menu_items m ON m.id = f.menu_item_id
     JOIN restaurants r ON r.id = m.restaurant_id
     WHERE f.user_id = ? ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
}

export async function getFavoriteIds(req, res) {
  const [rows] = await pool.query('SELECT menu_item_id FROM favorites WHERE user_id = ?', [req.user.id]);
  res.json(rows.map((r) => r.menu_item_id));
}

// toggles — returns the new state so the heart icon can update immediately
export async function toggleFavorite(req, res) {
  const itemId = Number(req.params.itemId);
  const [[item]] = await pool.query('SELECT id FROM menu_items WHERE id = ?', [itemId]);
  if (!item) return res.status(404).json({ message: 'Dish not found' });

  const [del] = await pool.query('DELETE FROM favorites WHERE user_id = ? AND menu_item_id = ?', [req.user.id, itemId]);
  if (del.affectedRows > 0) return res.json({ favorite: false });
  await pool.query('INSERT INTO favorites (user_id, menu_item_id) VALUES (?, ?)', [req.user.id, itemId]);
  res.json({ favorite: true });
}
