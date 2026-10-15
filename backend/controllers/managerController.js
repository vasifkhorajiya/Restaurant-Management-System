import pool from '../config/db.js';
import { dashboardExtras } from './reportController.js';
import { audit } from '../utils/audit.js';
import { normalizePhone } from '../utils/contact.js';

// ---------- DASHBOARD (scoped to req.restaurantId) ----------
export async function dashboardStats(req, res) {
  const rid = req.restaurantId;
  const [[{ todaysOrders }]] = await pool.query(
    'SELECT COUNT(*) AS "todaysOrders" FROM orders WHERE restaurant_id = ? AND created_at::date = CURRENT_DATE', [rid]);
  const [[{ pendingOrders }]] = await pool.query(
    `SELECT COUNT(*) AS "pendingOrders" FROM orders WHERE restaurant_id = ? AND status = 'Pending'`, [rid]);
  const [[{ completedOrders }]] = await pool.query(
    `SELECT COUNT(*) AS "completedOrders" FROM orders WHERE restaurant_id = ? AND status = 'Completed' AND created_at::date = CURRENT_DATE`, [rid]);
  const [[{ todaysSales }]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS "todaysSales" FROM orders WHERE restaurant_id = ? AND status = 'Completed' AND created_at::date = CURRENT_DATE`, [rid]);
  const [[{ totalMenuItems }]] = await pool.query('SELECT COUNT(*) AS "totalMenuItems" FROM menu_items WHERE restaurant_id = ?', [rid]);
  const [[restaurant]] = await pool.query('SELECT id, name, is_open FROM restaurants WHERE id = ?', [rid]);

  res.json({
    todaysOrders, pendingOrders, completedOrders, todaysSales, totalMenuItems,
    restaurant,
    ...(await dashboardExtras(rid)),
  });
}

// open / close the restaurant for new orders with one switch
export async function toggleRestaurantOpen(req, res) {
  await pool.query('UPDATE restaurants SET is_open = ? WHERE id = ?', [!!req.body.is_open, req.restaurantId]);
  audit(req, req.body.is_open ? 'restaurant.open' : 'restaurant.close', 'restaurant', req.restaurantId);
  res.json({ message: req.body.is_open ? 'Now accepting orders' : 'Orders paused', is_open: !!req.body.is_open });
}

// ---------- STAFF ----------
const SHIFTS = ['Morning', 'Evening', 'Night', 'Flexible'];

function staffProblem(b) {
  if (!b.name || !String(b.name).trim()) return 'Name is required';
  if (!b.position || !String(b.position).trim()) return 'Position is required';
  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return 'Enter a valid email address';
  if (b.phone) {
    const p = normalizePhone(b.phone);
    if (!p.ok) return p.error;
    b.phone = p.e164; // stored as +<country code><10 digits>
  }
  return null;
}

export async function getStaff(req, res) {
  const [rows] = await pool.query('SELECT * FROM staff WHERE restaurant_id = ? ORDER BY is_active DESC, created_at DESC', [req.restaurantId]);
  res.json(rows);
}

export async function createStaff(req, res) {
  const problem = staffProblem(req.body);
  if (problem) return res.status(400).json({ message: problem });
  const { name, email, phone, position, shift, salary, is_active, joined_on } = req.body;
  const [result] = await pool.query(
    'INSERT INTO staff (restaurant_id, name, email, phone, position, shift, salary, is_active, joined_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.restaurantId, String(name).trim(), email || null, phone || null, position, SHIFTS.includes(shift) ? shift : 'Flexible',
     salary === '' || salary == null ? null : Number(salary), is_active ?? true, joined_on || null]
  );
  audit(req, 'staff.create', 'staff', result.insertId, name);
  res.status(201).json({ message: 'Staff added', id: result.insertId });
}

export async function updateStaff(req, res) {
  const problem = staffProblem(req.body);
  if (problem) return res.status(400).json({ message: problem });
  const { name, email, phone, position, shift, salary, is_active, joined_on } = req.body;
  await pool.query(
    `UPDATE staff SET name=?, email=?, phone=?, position=?, shift=?, salary=?, is_active=?, joined_on=?
     WHERE id=? AND restaurant_id=?`,
    [String(name).trim(), email || null, phone || null, position, SHIFTS.includes(shift) ? shift : 'Flexible',
     salary === '' || salary == null ? null : Number(salary), is_active ?? true,
     joined_on ? String(joined_on).slice(0, 10) : null, req.params.id, req.restaurantId]
  );
  res.json({ message: 'Staff updated' });
}

export async function deleteStaff(req, res) {
  await pool.query('DELETE FROM staff WHERE id = ? AND restaurant_id = ?', [req.params.id, req.restaurantId]);
  audit(req, 'staff.delete', 'staff', Number(req.params.id));
  res.json({ message: 'Staff removed' });
}

// ---------- CUSTOMERS (read-only view for the manager's restaurant) ----------
export async function getCustomers(req, res) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, COUNT(o.id) AS order_count,
            COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS total_spent,
            MAX(o.created_at) AS last_order
     FROM users u
     JOIN orders o ON o.customer_id = u.id AND o.restaurant_id = ?
     WHERE u.email <> 'walkin@system.local'
     GROUP BY u.id, u.name, u.email, u.phone
     ORDER BY order_count DESC`,
    [req.restaurantId]
  );
  res.json(rows);
}

export async function getCustomerOrders(req, res) {
  const [rows] = await pool.query(
    `SELECT id, status, order_type, total_amount, created_at
     FROM orders WHERE customer_id = ? AND restaurant_id = ?
     ORDER BY created_at DESC`,
    [req.params.id, req.restaurantId]
  );
  res.json(rows);
}

// ---------- ATTENDANCE ----------
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

export async function getAttendance(req, res) {
  const date = isDate(req.query.date) ? req.query.date : new Date().toLocaleDateString('en-CA');
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.position, s.shift, a.check_in, a.check_out
     FROM staff s LEFT JOIN staff_attendance a ON a.staff_id = s.id AND a.work_date = ?
     WHERE s.restaurant_id = ? AND s.is_active = TRUE ORDER BY s.name`,
    [date, req.restaurantId]
  );
  res.json({ date, items: rows });
}

async function ownStaff(req) {
  const [[st]] = await pool.query('SELECT id, name FROM staff WHERE id = ? AND restaurant_id = ?', [req.params.id, req.restaurantId]);
  return st;
}

export async function checkIn(req, res) {
  const st = await ownStaff(req);
  if (!st) return res.status(404).json({ message: 'Staff member not found' });
  await pool.query('INSERT INTO staff_attendance (staff_id, work_date, check_in) VALUES (?, CURRENT_DATE, NOW()) ON CONFLICT (staff_id, work_date) DO UPDATE SET check_in = COALESCE(staff_attendance.check_in, NOW())', [st.id]);
  res.json({ message: `${st.name} checked in` });
}

export async function checkOut(req, res) {
  const st = await ownStaff(req);
  if (!st) return res.status(404).json({ message: 'Staff member not found' });
  const [r] = await pool.query('UPDATE staff_attendance SET check_out = NOW() WHERE staff_id = ? AND work_date = CURRENT_DATE AND check_in IS NOT NULL AND check_out IS NULL', [st.id]);
  if (r.affectedRows === 0) return res.status(400).json({ message: 'Not checked in today' });
  res.json({ message: `${st.name} checked out` });
}
