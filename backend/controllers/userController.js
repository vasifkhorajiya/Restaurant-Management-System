import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { BCRYPT_ROUNDS, passwordProblem, securityEvent } from '../utils/security.js';
import { HttpError } from '../utils/pricing.js';
import { gmailCanonical, normalizeGmail, normalizePhone } from '../utils/contact.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getProfile(req, res) {
  const [[user]] = await pool.query('SELECT name, email, phone, loyalty_points, created_at FROM users WHERE id = ?', [req.user.id]);
  const [[stats]] = await pool.query(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status = 'Completed' THEN total_amount END), 0) AS spent
     FROM orders WHERE customer_id = ?`,
    [req.user.id]
  );
  res.json({ ...user, total_orders: stats.orders, total_spent: Number(stats.spent) });
}

// Name, Gmail and mobile. Changing the Gmail or the number needs the current password.
export async function updateProfile(req, res) {
  const name = String(req.body.name || '').trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ message: 'Enter your full name' });

  const [[cur]] = await pool.query('SELECT email, phone, password FROM users WHERE id = ?', [req.user.id]);
  let email = cur.email;
  let phone = cur.phone;

  if (req.body.email !== undefined && String(req.body.email).trim() !== '') {
    const g = normalizeGmail(req.body.email);
    if (!g.ok) throw new HttpError(g.error);
    email = g.email;
  }
  if (req.body.phone !== undefined && String(req.body.phone).trim() !== '') {
    const p = normalizePhone(req.body.phone);
    if (!p.ok) throw new HttpError(p.error);
    phone = p.e164;
  }

  const emailChanged = email !== cur.email;
  const phoneChanged = phone !== cur.phone;
  if (emailChanged || phoneChanged) {
    if (!(await bcrypt.compare(String(req.body.current_password || ''), cur.password))) {
      throw new HttpError('Enter your current password to change your Gmail or mobile number', 400);
    }
    // another account already using it? (Gmail dot-aliases count as the same inbox)
    const [taken] = await pool.query(
      `SELECT email, phone FROM users WHERE id <> ? AND ((email LIKE '%@gmail.com' AND REPLACE(SPLIT_PART(email, '@', 1), '.', '') = ?) OR phone = ?)`,
      [req.user.id, gmailCanonical(email), phone]
    );
    if (taken.length) throw new HttpError(taken.some((t) => t.phone === phone) ? 'That mobile number is already in use' : 'That Gmail address is already in use', 409);
  }

  await pool.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [name, email, phone, req.user.id]);
  if (emailChanged || phoneChanged) await securityEvent(req, 'contact_changed', { userId: req.user.id, email, details: [emailChanged && 'email', phoneChanged && 'phone'].filter(Boolean).join('+') });
  res.json({ message: 'Profile updated', name, email, phone });
}

export async function changePassword(req, res) {
  const { current_password, new_password } = req.body;
  const problem = passwordProblem(new_password);
  if (problem) return res.status(400).json({ message: problem });
  const [[user]] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);
  const match = await bcrypt.compare(current_password || '', user.password);
  if (!match) return res.status(400).json({ message: 'Current password is incorrect' });

  const hashed = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password = ?, password_changed_at = NOW() WHERE id = ?', [hashed, req.user.id]);
  // changing the password signs every OTHER device out
  await pool.query('UPDATE user_sessions SET revoked = TRUE WHERE user_id = ? AND id <> ?', [req.user.id, req.user.sid]);
  await securityEvent(req, 'password_changed', { userId: req.user.id, email: req.user.email });
  res.json({ message: 'Password changed successfully' });
}
