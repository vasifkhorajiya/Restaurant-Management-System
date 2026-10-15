import crypto from 'crypto';
import pool from '../config/db.js';

export const WALKIN_EMAIL = 'walkin@system.local';
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// constant-time string comparison (never use === for secrets/signatures)
export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const randomDigits = (n) => String(crypto.randomInt(0, 10 ** n)).padStart(n, '0');
export const randomId = (bytes = 7) => crypto.randomBytes(bytes).toString('base64url').replace(/[-_]/g, 'x').slice(0, bytes * 2 - 2);

// Password policy: 8+ chars, upper, lower, number
export function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 72) return 'Password is too long (max 72 characters)';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p)) return 'Password needs both uppercase and lowercase letters';
  if (!/\d/.test(p)) return 'Password needs at least one number';
  return null;
}

export function clientInfo(req) {
  return {
    ip: (req.ip || req.socket?.remoteAddress || '').replace('::ffff:', '').slice(0, 45),
    ua: String(req.headers?.['user-agent'] || '').slice(0, 255),
  };
}

// Security timeline — never throws.
export async function securityEvent(req, event, { userId = null, email = null, details = null } = {}) {
  try {
    const { ip, ua } = clientInfo(req);
    await pool.query(
      'INSERT INTO security_events (user_id, email, event, ip, user_agent, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, email ? String(email).slice(0, 150) : null, event, ip, ua, details ? String(details).slice(0, 255) : null]
    );
  } catch (err) {
    console.error('security event failed:', err.message);
  }
}

export const maskEmail = (e) => String(e).replace(/^(.{2}).*(@.*)$/, '$1***$2');
export const maskPhone = (p) => (p ? String(p).replace(/.(?=.{3})/g, '•') : '');
