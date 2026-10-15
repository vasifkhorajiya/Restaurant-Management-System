import pool from '../config/db.js';

export async function getTables(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT t.*, r.name AS restaurant_name FROM restaurant_tables t
     JOIN restaurants r ON r.id = t.restaurant_id
     ${rid ? 'WHERE t.restaurant_id = ?' : ''} ORDER BY t.restaurant_id, t.table_no`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function createTable(req, res) {
  const restaurantId = req.restaurantId ?? req.body.restaurant_id;
  const tableNo = String(req.body.table_no || '').trim();
  const capacity = Math.floor(Number(req.body.capacity));
  if (!restaurantId) return res.status(400).json({ message: 'Pick a restaurant' });
  if (!tableNo) return res.status(400).json({ message: 'Table number is required' });
  if (!(capacity >= 1 && capacity <= 30)) return res.status(400).json({ message: 'Capacity must be between 1 and 30' });
  const [result] = await pool.query(
    'INSERT INTO restaurant_tables (restaurant_id, table_no, capacity) VALUES (?, ?, ?)',
    [restaurantId, tableNo.slice(0, 20), capacity]
  );
  res.status(201).json({ message: 'Table added', id: result.insertId });
}

export async function updateTable(req, res) {
  const rid = req.restaurantId;
  const capacity = Math.floor(Number(req.body.capacity));
  const statuses = ['Available', 'Occupied', 'Reserved', 'Maintenance'];
  if (!(capacity >= 1 && capacity <= 30)) return res.status(400).json({ message: 'Capacity must be between 1 and 30' });
  if (!statuses.includes(req.body.status)) return res.status(400).json({ message: 'Invalid status' });
  const [result] = await pool.query(
    `UPDATE restaurant_tables SET table_no = ?, capacity = ?, status = ? WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`,
    [String(req.body.table_no).trim().slice(0, 20), capacity, req.body.status, req.params.id, ...(rid ? [rid] : [])]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Table not found' });
  res.json({ message: 'Table updated' });
}

export async function deleteTable(req, res) {
  const rid = req.restaurantId;
  await pool.query(`DELETE FROM restaurant_tables WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`, [req.params.id, ...(rid ? [rid] : [])]);
  res.json({ message: 'Table removed' });
}
