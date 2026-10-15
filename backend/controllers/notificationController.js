import pool from '../config/db.js';

// Shared by every role — each user only ever sees their own notifications.
export async function getNotifications(req, res) {
  const [rows] = await pool.query(
    'SELECT id, title, message, type, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  const [[{ unread }]] = await pool.query('SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = FALSE', [req.user.id]);
  res.json({ unread, items: rows });
}

export async function markRead(req, res) {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.json({ message: 'ok' });
}

export async function markAllRead(req, res) {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'ok' });
}

export async function clearAll(req, res) {
  await pool.query('DELETE FROM notifications WHERE user_id = ?', [req.user.id]);
  res.json({ message: 'ok' });
}
