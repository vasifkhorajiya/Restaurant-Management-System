import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { dashboardExtras } from './reportController.js';
import { audit } from '../utils/audit.js';
import { BCRYPT_ROUNDS, passwordProblem } from '../utils/security.js';
import { normalizeGmail, normalizePhone } from '../utils/contact.js';
import { emailLayout, integrationStatus, sendEmail, sendSms } from '../utils/notifier.js';
import { liveClientCount } from '../utils/realtime.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// every user/manager write is restricted to its own role, so these endpoints
// can never be used to edit or delete the admin account
const ROLE_ID = (name) => `(SELECT id FROM roles WHERE name = '${name}')`;

// Gmail + real mobile number rules (same as customer sign-up). Mutates body to the normalised values.
function accountProblem(body, passwordRequired) {
  const { name, password } = body;
  if (!name || !String(name).trim()) return 'Name is required';
  const g = normalizeGmail(body.email);
  if (!g.ok) return g.error;
  body.email = g.email;
  const p = normalizePhone(body.phone);
  if (!p.ok) return p.error;
  body.phone = p.e164;
  if (passwordRequired || password) return passwordProblem(password);
  return null;
}

// ---------- DASHBOARD ----------
export async function dashboardStats(req, res) {
  const [[{ totalUsers }]] = await pool.query(`SELECT COUNT(*) AS "totalUsers" FROM users WHERE role_id = ${ROLE_ID('user')} AND email <> 'walkin@system.local'`);
  const [[{ totalManagers }]] = await pool.query(`SELECT COUNT(*) AS "totalManagers" FROM users WHERE role_id = ${ROLE_ID('manager')}`);
  const [[{ totalStaff }]] = await pool.query('SELECT COUNT(*) AS "totalStaff" FROM staff');
  const [[{ totalRestaurants }]] = await pool.query('SELECT COUNT(*) AS "totalRestaurants" FROM restaurants');
  const [[{ totalMenuItems }]] = await pool.query('SELECT COUNT(*) AS "totalMenuItems" FROM menu_items');
  const [[{ totalOrders }]] = await pool.query('SELECT COUNT(*) AS "totalOrders" FROM orders');
  const [[{ totalRevenue }]] = await pool.query(`SELECT COALESCE(SUM(total_amount),0) AS "totalRevenue" FROM orders WHERE status='Completed'`);
  const [[{ pendingOrders }]] = await pool.query(`SELECT COUNT(*) AS "pendingOrders" FROM orders WHERE status='Pending'`);
  const [[{ completedOrders }]] = await pool.query(`SELECT COUNT(*) AS "completedOrders" FROM orders WHERE status='Completed'`);
  const [[{ todaysRevenue }]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) AS "todaysRevenue" FROM orders WHERE status='Completed' AND created_at::date = CURRENT_DATE`
  );

  res.json({
    totalUsers, totalManagers, totalStaff, totalRestaurants, totalMenuItems, totalOrders, totalRevenue,
    pendingOrders, completedOrders, todaysRevenue,
    ...(await dashboardExtras(null)),
  });
}

// ---------- USERS (role = 'user') ----------
export async function getUsers(req, res) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.loyalty_points, u.last_login, u.created_at,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = u.id AND o.status = 'Completed') AS total_spent
     FROM users u WHERE u.role_id = ${ROLE_ID('user')} AND u.email <> 'walkin@system.local' ORDER BY u.created_at DESC`
  );
  res.json(rows);
}

export async function getUserOrders(req, res) {
  const [rows] = await pool.query(
    `SELECT o.id, o.status, o.order_type, o.total_amount, o.created_at, r.name AS restaurant_name
     FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
     WHERE o.customer_id = ? ORDER BY o.created_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json(rows);
}

export async function createUser(req, res) {
  const problem = accountProblem(req.body, true);
  if (problem) return res.status(400).json({ message: problem });
  const { name, email, phone, password } = req.body;

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) return res.status(409).json({ message: 'Email already exists' });

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password, phone, role_id, status) VALUES (?, ?, ?, ?, ${ROLE_ID('user')}, 'active')`,
    [String(name).trim(), email, hashed, phone]
  );
  audit(req, 'user.create', 'user', result.insertId, email);
  res.status(201).json({ message: 'User created' });
}

export async function updateUser(req, res) {
  const { id } = req.params;
  const problem = accountProblem(req.body, false);
  if (problem) return res.status(400).json({ message: problem });
  const { name, email, phone, password } = req.body;

  if (password) {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(`UPDATE users SET name=?, email=?, phone=?, password=? WHERE id=? AND role_id = ${ROLE_ID('user')}`, [name, email, phone, hashed, id]);
  } else {
    await pool.query(`UPDATE users SET name=?, email=?, phone=? WHERE id=? AND role_id = ${ROLE_ID('user')}`, [name, email, phone, id]);
  }
  audit(req, 'user.update', 'user', Number(id), email);
  res.json({ message: 'User updated' });
}

export async function deleteUser(req, res) {
  await pool.query(`DELETE FROM users WHERE id = ? AND role_id = ${ROLE_ID('user')}`, [req.params.id]);
  audit(req, 'user.delete', 'user', Number(req.params.id));
  res.json({ message: 'User deleted' });
}

export async function toggleUserStatus(req, res) {
  const { status } = req.body; // 'active' | 'blocked'
  if (!['active', 'blocked'].includes(status)) return res.status(400).json({ message: 'Invalid status' });
  await pool.query(`UPDATE users SET status = ? WHERE id = ? AND role_id IN (${ROLE_ID('user')}, ${ROLE_ID('manager')})`, [status, req.params.id]);
  audit(req, `user.${status}`, 'user', Number(req.params.id));
  res.json({ message: 'Status updated' });
}

// ---------- MANAGERS (role = 'manager') ----------
export async function getManagers(req, res) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.restaurant_id, u.status, u.last_login, r.name AS restaurant_name
     FROM users u LEFT JOIN restaurants r ON r.id = u.restaurant_id
     WHERE u.role_id = ${ROLE_ID('manager')} ORDER BY u.created_at DESC`
  );
  res.json(rows);
}

export async function createManager(req, res) {
  const problem = accountProblem(req.body, true);
  if (problem) return res.status(400).json({ message: problem });
  const { name, email, phone, password, restaurant_id } = req.body;
  if (!restaurant_id) return res.status(400).json({ message: 'Assign the manager to a restaurant' });

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) return res.status(409).json({ message: 'Email already exists' });

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [result] = await pool.query(
    `INSERT INTO users (name, email, password, phone, role_id, restaurant_id, status) VALUES (?, ?, ?, ?, ${ROLE_ID('manager')}, ?, 'active')`,
    [String(name).trim(), email, hashed, phone, restaurant_id]
  );
  audit(req, 'manager.create', 'user', result.insertId, email);
  res.status(201).json({ message: 'Manager created' });
}

export async function updateManager(req, res) {
  const { id } = req.params;
  const problem = accountProblem(req.body, false);
  if (problem) return res.status(400).json({ message: problem });
  const { name, email, phone, password, restaurant_id } = req.body;

  if (password) {
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await pool.query(
      `UPDATE users SET name=?, email=?, phone=?, password=?, restaurant_id=? WHERE id=? AND role_id = ${ROLE_ID('manager')}`,
      [name, email, phone, hashed, restaurant_id, id]
    );
  } else {
    await pool.query(
      `UPDATE users SET name=?, email=?, phone=?, restaurant_id=? WHERE id=? AND role_id = ${ROLE_ID('manager')}`,
      [name, email, phone, restaurant_id, id]
    );
  }
  audit(req, 'manager.update', 'user', Number(id), email);
  res.json({ message: 'Manager updated' });
}

export async function deleteManager(req, res) {
  await pool.query(`DELETE FROM users WHERE id = ? AND role_id = ${ROLE_ID('manager')}`, [req.params.id]);
  audit(req, 'manager.delete', 'user', Number(req.params.id));
  res.json({ message: 'Manager deleted' });
}

// ---------- RESTAURANTS ----------
function restaurantProblem(b) {
  if (!b.name || !String(b.name).trim()) return 'Restaurant name is required';
  if (!b.address || !String(b.address).trim()) return 'Address is required';
  if (!b.phone) return 'Phone is required';
  if (!b.opening_time || !b.closing_time) return 'Opening and closing time are required';
  return null;
}

export async function getRestaurants(req, res) {
  const [rows] = await pool.query(
    `SELECT r.*,
            (SELECT COUNT(*) FROM orders o WHERE o.restaurant_id = r.id) AS order_count,
            (SELECT ROUND(AVG(rv.rating), 1) FROM reviews rv JOIN orders o ON o.id = rv.order_id WHERE o.restaurant_id = r.id) AS avg_rating
     FROM restaurants r ORDER BY r.created_at DESC`
  );
  res.json(rows);
}

export async function createRestaurant(req, res) {
  const problem = restaurantProblem(req.body);
  if (problem) return res.status(400).json({ message: problem });
  const { name, address, phone, opening_time, closing_time, description, cuisine } = req.body;
  const [result] = await pool.query(
    'INSERT INTO restaurants (name, address, phone, opening_time, closing_time, description, cuisine) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [String(name).trim(), address, phone, opening_time, closing_time, description || null, cuisine || null]
  );
  audit(req, 'restaurant.create', 'restaurant', result.insertId, name);
  res.status(201).json({ message: 'Restaurant created', id: result.insertId });
}

export async function updateRestaurant(req, res) {
  const problem = restaurantProblem(req.body);
  if (problem) return res.status(400).json({ message: problem });
  const { name, address, phone, opening_time, closing_time, description, cuisine, is_open } = req.body;
  await pool.query(
    'UPDATE restaurants SET name=?, address=?, phone=?, opening_time=?, closing_time=?, description=?, cuisine=?, is_open=? WHERE id=?',
    [String(name).trim(), address, phone, opening_time, closing_time, description || null, cuisine || null, is_open ?? true, req.params.id]
  );
  audit(req, 'restaurant.update', 'restaurant', Number(req.params.id), name);
  res.json({ message: 'Restaurant updated' });
}

export async function deleteRestaurant(req, res) {
  await pool.query('DELETE FROM restaurants WHERE id = ?', [req.params.id]);
  audit(req, 'restaurant.delete', 'restaurant', Number(req.params.id));
  res.json({ message: 'Restaurant deleted' });
}

// ---------- AUDIT LOG ----------
export async function getAuditLogs(req, res) {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const [rows] = await pool.query('SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?', [limit]);
  res.json(rows);
}

// ---------- SECURITY EVENTS (logins, lockouts, password resets, sessions) ----------
export async function getSecurityEvents(req, res) {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const [rows] = await pool.query('SELECT * FROM security_events ORDER BY id DESC LIMIT ?', [limit]);
  res.json(rows);
}

// admin can unlock an account that tripped the brute-force lock, or force-sign-out a user everywhere
export async function unlockUser(req, res) {
  await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [req.params.id]);
  audit(req, 'user.unlock', 'user', Number(req.params.id));
  res.json({ message: 'Account unlocked' });
}

export async function forceLogoutUser(req, res) {
  await pool.query('UPDATE user_sessions SET revoked = TRUE WHERE user_id = ?', [req.params.id]);
  audit(req, 'user.force_logout', 'user', Number(req.params.id));
  res.json({ message: 'User signed out of every device' });
}

// ---------- INTEGRATIONS (email / SMS / payments / real-time status + test sends) ----------
export async function getIntegrations(req, res) {
  let database = 'connected';
  try { await pool.query('SELECT 1'); } catch { database = 'unreachable'; }
  res.json({
    ...integrationStatus(),
    database,
    realtime: { transport: 'Server-Sent Events', connectedStreams: liveClientCount() },
    payments: { provider: 'Fake Razorpay (demo gateway)', key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_FAKEKEY00001' },
    environment: process.env.NODE_ENV || 'development',
  });
}

export async function sendTestMessage(req, res) {
  const { channel, to } = req.body;
  try {
    if (channel === 'email') {
      const g = normalizeGmail(to);
      if (!g.ok) return res.status(400).json({ message: g.error });
      const mail = emailLayout({ heading: 'Test message', lines: ['Your Spice Route email delivery is working.'], footer: 'Sent from Admin ▸ Integrations.' });
      const status = await sendEmail({ to: g.email, subject: 'Spice Route test email', ...mail, kind: 'test', userId: req.user.id });
      return res.json({ status, message: status === 'sent' ? `Email delivered to ${g.email}` : 'Demo mode — email provider is not configured, nothing was sent' });
    }
    if (channel === 'sms') {
      const p = normalizePhone(to);
      if (!p.ok) return res.status(400).json({ message: p.error });
      const status = await sendSms({ to: p.e164, text: 'Spice Route: your SMS delivery is working.', kind: 'test', userId: req.user.id });
      return res.json({ status, message: status === 'sent' ? `SMS sent to ${p.e164}` : 'Demo mode — SMS provider is not configured, nothing was sent' });
    }
    return res.status(400).json({ message: 'Choose email or sms' });
  } catch (err) {
    return res.status(502).json({ message: `Provider error: ${err.message}` });
  }
}

export async function getNotificationLog(req, res) {
  const [rows] = await pool.query('SELECT id, channel, recipient, kind, status, error, created_at FROM notification_log ORDER BY id DESC LIMIT 200');
  res.json(rows);
}
