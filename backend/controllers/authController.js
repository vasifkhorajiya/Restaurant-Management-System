import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { HttpError } from '../utils/pricing.js';
import { BCRYPT_ROUNDS, WALKIN_EMAIL, clientInfo, passwordProblem, securityEvent, sha256 } from '../utils/security.js';
import { gmailCanonical, normalizeGmail, normalizePhone } from '../utils/contact.js';
import { emailLayout, sendEmail } from '../utils/notifier.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const SESSION_HOURS = Number(process.env.SESSION_HOURS) || 12;
const RESET_MINUTES = 60;
const MAX_RESETS_PER_HOUR = 3;

// a hash nobody knows the password of — compared against when the email doesn't exist,
// so "unknown email" and "wrong password" take the same time (no user enumeration by timing)
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

const normEmail = (e) => String(e || '').trim().toLowerCase();
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, restaurant_id: u.restaurant_id });

async function findByEmail(email) {
  const [[u]] = await pool.query(
    `SELECT u.id, u.name, u.email, u.password, u.phone, u.status, u.restaurant_id, u.failed_attempts, u.locked_until, r.name AS role
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = ?`,
    [normEmail(email)]
  );
  return u || null;
}

// creates the server-side session + signed token
async function finalizeLogin(req, res, user, status = 200) {
  const sid = crypto.randomUUID();
  const { ip, ua } = clientInfo(req);
  await pool.query(
    `INSERT INTO user_sessions (id, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, NOW() + (?::int * INTERVAL '1 hour'))`,
    [sid, user.id, ip, ua, SESSION_HOURS]
  );
  await pool.query('UPDATE users SET last_login = NOW(), failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, restaurant_id: user.restaurant_id, sid },
    process.env.JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h`, algorithm: 'HS256' }
  );
  await securityEvent(req, 'login_success', { userId: user.id, email: user.email });
  return res.status(status).json({ token, user: publicUser(user) });
}

// ---------------------------------------------------------------
// Registration — customers only. Gmail + a real-looking mobile number, strong password.
// ---------------------------------------------------------------
export async function register(req, res) {
  const { name, password } = req.body;
  if (!name || !req.body.email || !req.body.phone || !password) throw new HttpError('All fields are required');
  if (String(name).trim().length < 2 || String(name).length > 100) throw new HttpError('Enter your full name');
  const mail = normalizeGmail(req.body.email);
  if (!mail.ok) throw new HttpError(mail.error);
  const ph = normalizePhone(req.body.phone);
  if (!ph.ok) throw new HttpError(ph.error);
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(problem);

  // Gmail ignores dots → j.ohn@gmail.com and john@gmail.com are one inbox. Block duplicates by the real inbox.
  const canon = gmailCanonical(mail.email);
  const [dups] = await pool.query(
    `SELECT email, phone FROM users
     WHERE (email LIKE '%@gmail.com' AND REPLACE(SPLIT_PART(email, '@', 1), '.', '') = ?) OR phone = ?`,
    [canon, ph.e164]
  );
  if (dups.length) throw new HttpError(dups.some((d) => d.phone === ph.e164) ? 'This mobile number is already registered' : 'This Gmail address is already registered', 409);

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const [[role]] = await pool.query("SELECT id FROM roles WHERE name = 'user'");
  const [result] = await pool.query(
    "INSERT INTO users (name, email, password, phone, role_id, status, password_changed_at) VALUES (?, ?, ?, ?, ?, 'active', NOW())",
    [String(name).trim(), mail.email, hashed, ph.e164, role.id]
  );
  await securityEvent(req, 'register', { userId: result.insertId, email: mail.email });
  // signed in straight away
  return finalizeLogin(req, res, { id: result.insertId, name: String(name).trim(), email: mail.email, phone: ph.e164, role: 'user', restaurant_id: null }, 201);
}

// ---------------------------------------------------------------
// Login — email + password (admin, manager and customer)
// ---------------------------------------------------------------
export async function login(req, res) {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) throw new HttpError('Email and password are required');

  const user = await findByEmail(email);
  if (!user || user.email === WALKIN_EMAIL) {
    await bcrypt.compare(String(password), DUMMY_HASH);
    await securityEvent(req, 'login_failed', { email, details: 'unknown email' });
    throw new HttpError('Invalid email or password', 401);
  }

  if (user.status === 'blocked') throw new HttpError('Your account has been blocked. Contact admin.', 403);
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new HttpError(`Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`, 423);
  }

  const ok = await bcrypt.compare(String(password), user.password);
  if (!ok) {
    const failed = user.failed_attempts + 1;
    if (failed >= MAX_FAILED) {
      await pool.query(`UPDATE users SET failed_attempts = 0, locked_until = NOW() + (?::int * INTERVAL '1 minute') WHERE id = ?`, [LOCK_MINUTES, user.id]);
      await securityEvent(req, 'account_locked', { userId: user.id, email, details: `${LOCK_MINUTES} min lock` });
      throw new HttpError(`Too many failed attempts. Account locked for ${LOCK_MINUTES} minutes.`, 423);
    }
    await pool.query('UPDATE users SET failed_attempts = ? WHERE id = ?', [failed, user.id]);
    await securityEvent(req, 'login_failed', { userId: user.id, email, details: 'wrong password' });
    throw new HttpError(`Invalid email or password${failed >= 3 ? ` (${MAX_FAILED - failed} attempts left)` : ''}`, 401);
  }
  return finalizeLogin(req, res, user);
}

// ---------------------------------------------------------------
// Forgot password — a single-use link emailed to the Gmail address (valid 1 hour).
// With no email provider configured (demo mode) the link is shown on screen / printed in the backend console.
// ---------------------------------------------------------------
const appUrl = () => (process.env.APP_URL || String(process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, '');

export async function forgotPassword(req, res) {
  const g = normalizeGmail(req.body.email);
  if (!g.ok) throw new HttpError(g.error);
  const generic = { message: 'If an account exists for that Gmail address, a reset link has been sent.' };

  const user = await findByEmail(g.email);
  if (!user || user.email === WALKIN_EMAIL || user.status !== 'active') return res.json(generic);

  // at most 3 links per hour per account (stops mailbox spam)
  const [[{ recent }]] = await pool.query(`SELECT COUNT(*) AS recent FROM password_resets WHERE user_id = ? AND created_at > NOW() - INTERVAL '1 hour'`, [user.id]);
  if (recent >= MAX_RESETS_PER_HOUR) return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');      // only its hash is stored
  await pool.query('UPDATE password_resets SET used = TRUE WHERE user_id = ? AND used = FALSE', [user.id]);
  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + (?::int * INTERVAL '1 minute'))`,
    [user.id, sha256(token), RESET_MINUTES]
  );
  const link = `${appUrl()}/reset-password/${token}`;
  await securityEvent(req, 'reset_requested', { userId: user.id, email: user.email });

  let status = 'failed';
  try {
    const mail = emailLayout({
      heading: 'Reset your password',
      lines: [`Hi ${user.name.split(' ')[0]}, we received a request to reset your Spice Route password.`, `This link works once and expires in ${RESET_MINUTES} minutes.`],
      button: { label: 'Choose a new password', url: link },
      footer: 'If you did not ask for this, ignore this email — your password stays the same.',
    });
    status = await sendEmail({ to: user.email, subject: 'Reset your Spice Route password', ...mail, kind: 'password_reset', userId: user.id });
  } catch { /* logged in notification_log; the response stays generic */ }

  // demo mode only: nothing was emailed, so show the link (never in production)
  if (status === 'demo' && process.env.NODE_ENV !== 'production') {
    console.log(`🔑 Password reset link for ${user.email}: ${link}`);
    return res.json({ ...generic, dev_reset_link: link });
  }
  res.json(generic);
}

export async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) throw new HttpError('Reset token and new password are required');
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(problem);

  const [[reset]] = await pool.query(
    'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used = FALSE AND expires_at > NOW()',
    [sha256(String(token))]
  );
  if (!reset) throw new HttpError('This reset link is invalid or has expired. Request a new one.', 400);

  // single use, claimed atomically
  const [claimed] = await pool.query('UPDATE password_resets SET used = TRUE WHERE id = ? AND used = FALSE', [reset.id]);
  if (claimed.affectedRows === 0) throw new HttpError('This reset link was already used', 400);

  const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password = ?, password_changed_at = NOW(), failed_attempts = 0, locked_until = NULL WHERE id = ?', [hashed, reset.user_id]);
  await pool.query('UPDATE user_sessions SET revoked = TRUE WHERE user_id = ?', [reset.user_id]); // every device is signed out
  await securityEvent(req, 'password_reset', { userId: reset.user_id });
  res.json({ message: 'Password updated — please log in with your new password' });
}

// ---------------------------------------------------------------
// Sessions & security (authenticated)
// ---------------------------------------------------------------
export async function logout(req, res) {
  await pool.query('UPDATE user_sessions SET revoked = TRUE WHERE id = ? AND user_id = ?', [req.user.sid, req.user.id]);
  await securityEvent(req, 'logout', { userId: req.user.id, email: req.user.email });
  res.json({ message: 'Logged out' });
}

export async function getSessions(req, res) {
  const [rows] = await pool.query(
    `SELECT id, ip, user_agent, created_at, last_seen FROM user_sessions
     WHERE user_id = ? AND revoked = FALSE AND expires_at > NOW() ORDER BY last_seen DESC`,
    [req.user.id]
  );
  res.json(rows.map((s) => ({ ...s, current: s.id === req.user.sid })));
}

export async function revokeSession(req, res) {
  await pool.query('UPDATE user_sessions SET revoked = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  await securityEvent(req, 'session_revoked', { userId: req.user.id, email: req.user.email });
  res.json({ message: 'Device signed out' });
}

export async function logoutOthers(req, res) {
  await pool.query('UPDATE user_sessions SET revoked = TRUE WHERE user_id = ? AND id <> ?', [req.user.id, req.user.sid]);
  await securityEvent(req, 'logout_others', { userId: req.user.id, email: req.user.email });
  res.json({ message: 'Signed out of all other devices' });
}

export async function getMySecurityEvents(req, res) {
  const [rows] = await pool.query(
    'SELECT id, event, ip, user_agent, details, created_at FROM security_events WHERE user_id = ? ORDER BY id DESC LIMIT 25',
    [req.user.id]
  );
  res.json(rows);
}
