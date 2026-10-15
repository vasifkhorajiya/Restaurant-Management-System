import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// Verifies the JWT sent in Authorization: Bearer <token>
export async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  let decoded;
  try {
    // algorithm pinned: rejects "alg: none" and algorithm-confusion tricks
    decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  if (!decoded.sid) return res.status(401).json({ message: 'Session expired — please log in again' });

  try {
    // One lookup validates the server-side session AND the account:
    //  - logout / "sign out this device" / password reset revoke sessions instantly
    //  - blocked or deleted accounts lose access immediately
    //  - a manager's restaurant is re-read so reassignment needs no re-login
    const [[row]] = await pool.query(
      `SELECT s.revoked, s.expires_at, s.last_seen, u.status, u.restaurant_id
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.user_id = ?`,
      [decoded.sid, decoded.id]
    );
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
      return res.status(401).json({ message: 'Session expired — please log in again' });
    }
    if (row.status === 'blocked') return res.status(403).json({ message: 'Your account has been blocked. Contact admin.' });
    decoded.restaurant_id = row.restaurant_id;
    if (Date.now() - new Date(row.last_seen).getTime() > 60000) {
      pool.query('UPDATE user_sessions SET last_seen = NOW() WHERE id = ?', [decoded.sid]).catch(() => {});
    }
  } catch (err) {
    return next(err);
  }
  req.user = decoded; // { id, name, email, role, restaurant_id, sid }
  next();
}

// Only allow specific roles through, e.g. requireRole('admin')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied for this role' });
    }
    next();
  };
}

// Sets req.restaurantId:
//   - admin  -> null  (no filter, sees all restaurants)
//   - manager -> their assigned restaurant_id (never sees other restaurants)
export function scopeRestaurant(req, res, next) {
  if (req.user.role === 'admin') {
    req.restaurantId = null;
    return next();
  }
  // a manager with no restaurant must NOT fall through to "no filter" (that would expose every restaurant)
  if (!req.user.restaurant_id) {
    return res.status(403).json({ message: 'You are not assigned to a restaurant yet. Ask the admin to assign one.' });
  }
  req.restaurantId = req.user.restaurant_id;
  next();
}
