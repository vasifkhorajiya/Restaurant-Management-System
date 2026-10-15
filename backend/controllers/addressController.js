import pool from '../config/db.js';

export async function getAddresses(req, res) {
  const [rows] = await pool.query(
    'SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
    [req.user.id]
  );
  res.json(rows);
}

export async function createAddress(req, res) {
  const { label = 'Home', address_line, landmark, is_default } = req.body;
  if (!address_line || String(address_line).trim().length < 5) {
    return res.status(400).json({ message: 'Please enter a full address' });
  }
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM customer_addresses WHERE user_id = ?', [req.user.id]);
  if (n >= 10) return res.status(400).json({ message: 'You can save up to 10 addresses' });

  const makeDefault = !!is_default || n === 0;
  if (makeDefault) await pool.query('UPDATE customer_addresses SET is_default = FALSE WHERE user_id = ?', [req.user.id]);
  const [result] = await pool.query(
    'INSERT INTO customer_addresses (user_id, label, address_line, landmark, is_default) VALUES (?, ?, ?, ?, ?)',
    [req.user.id, String(label).slice(0, 30), String(address_line).trim().slice(0, 255), landmark ? String(landmark).slice(0, 120) : null, makeDefault]
  );
  res.status(201).json({ message: 'Address saved', id: result.insertId });
}

export async function setDefaultAddress(req, res) {
  await pool.query('UPDATE customer_addresses SET is_default = (id = ?) WHERE user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'Default address updated' });
}

export async function deleteAddress(req, res) {
  await pool.query('DELETE FROM customer_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'Address removed' });
}
