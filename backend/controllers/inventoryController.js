import pool from '../config/db.js';
import { notifyManagers } from '../utils/notify.js';
import { audit } from '../utils/audit.js';

export async function getInventory(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT i.*, r.name AS restaurant_name, (i.quantity <= i.reorder_level) AS is_low
     FROM inventory_items i JOIN restaurants r ON r.id = i.restaurant_id
     ${rid ? 'WHERE i.restaurant_id = ?' : ''} ORDER BY is_low DESC, i.name`,
    rid ? [rid] : []
  );
  res.json(rows);
}

function clean(body) {
  return {
    name: String(body.name || '').trim(),
    unit: String(body.unit || 'kg').trim().slice(0, 20),
    quantity: Number(body.quantity) || 0,
    reorder: Number(body.reorder_level) || 0,
    cost: Number(body.cost_per_unit) || 0,
    supplier: body.supplier ? String(body.supplier).slice(0, 120) : null,
  };
}

export async function createInventoryItem(req, res) {
  const restaurantId = req.restaurantId ?? req.body.restaurant_id;
  const i = clean(req.body);
  if (!restaurantId) return res.status(400).json({ message: 'Pick a restaurant' });
  if (!i.name) return res.status(400).json({ message: 'Item name is required' });
  if (i.quantity < 0 || i.reorder < 0 || i.cost < 0) return res.status(400).json({ message: 'Numbers cannot be negative' });

  const [result] = await pool.query(
    'INSERT INTO inventory_items (restaurant_id, name, unit, quantity, reorder_level, cost_per_unit, supplier) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [restaurantId, i.name, i.unit, i.quantity, i.reorder, i.cost, i.supplier]
  );
  await pool.query('INSERT INTO inventory_logs (item_id, change_qty, reason, user_id) VALUES (?, ?, ?, ?)', [result.insertId, i.quantity, 'Opening stock', req.user.id]);
  res.status(201).json({ message: 'Inventory item added', id: result.insertId });
}

export async function updateInventoryItem(req, res) {
  const rid = req.restaurantId;
  const i = clean(req.body);
  if (!i.name) return res.status(400).json({ message: 'Item name is required' });
  const [result] = await pool.query(
    `UPDATE inventory_items SET name=?, unit=?, reorder_level=?, cost_per_unit=?, supplier=?
     WHERE id=? ${rid ? 'AND restaurant_id = ?' : ''}`,
    [i.name, i.unit, i.reorder, i.cost, i.supplier, req.params.id, ...(rid ? [rid] : [])]
  );
  if (result.affectedRows === 0) return res.status(404).json({ message: 'Item not found' });
  res.json({ message: 'Inventory item updated' });
}

// +/- stock adjustment with a reason — the quantity itself is only ever changed here (and logged)
export async function adjustInventory(req, res) {
  const rid = req.restaurantId;
  const change = Number(req.body.change);
  if (!change || Number.isNaN(change)) return res.status(400).json({ message: 'Enter a quantity to add or remove' });

  const [[item]] = await pool.query('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
  if (!item || (rid && item.restaurant_id !== rid)) return res.status(404).json({ message: 'Item not found' });
  const newQty = Number(item.quantity) + change;
  if (newQty < 0) return res.status(400).json({ message: `Only ${item.quantity} ${item.unit} in stock` });

  await pool.query('UPDATE inventory_items SET quantity = ? WHERE id = ?', [newQty, item.id]);
  await pool.query('INSERT INTO inventory_logs (item_id, change_qty, reason, user_id) VALUES (?, ?, ?, ?)', [
    item.id, change, req.body.reason ? String(req.body.reason).slice(0, 120) : (change > 0 ? 'Restock' : 'Used / wasted'), req.user.id,
  ]);

  if (newQty <= Number(item.reorder_level) && Number(item.quantity) > Number(item.reorder_level)) {
    notifyManagers(item.restaurant_id, 'Low stock', `${item.name} is down to ${newQty} ${item.unit}.`, 'inventory', '/manager/inventory');
  }
  audit(req, 'inventory.adjust', 'inventory', item.id, `${item.name} ${change > 0 ? '+' : ''}${change}`);
  res.json({ message: 'Stock updated', quantity: newQty });
}

export async function getInventoryLogs(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT l.change_qty, l.reason, l.created_at, i.name, i.unit, u.name AS user_name
     FROM inventory_logs l JOIN inventory_items i ON i.id = l.item_id LEFT JOIN users u ON u.id = l.user_id
     ${rid ? 'WHERE i.restaurant_id = ?' : ''} ORDER BY l.created_at DESC LIMIT 100`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function deleteInventoryItem(req, res) {
  const rid = req.restaurantId;
  await pool.query(`DELETE FROM inventory_items WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`, [req.params.id, ...(rid ? [rid] : [])]);
  audit(req, 'inventory.delete', 'inventory', Number(req.params.id));
  res.json({ message: 'Inventory item removed' });
}
