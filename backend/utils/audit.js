import pool from '../config/db.js';

// Records who did what. Never throws — an audit failure must never break
// the real action the user was performing.
export async function audit(req, action, entity = null, entityId = null, details = null) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, user_name, role, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user?.id ?? null, req.user?.name ?? null, req.user?.role ?? null, action, entity, entityId, details ? String(details).slice(0, 255) : null]
    );
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}
