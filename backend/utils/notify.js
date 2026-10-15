import pool from '../config/db.js';
import { toUser } from './realtime.js';

// In-app notifications. Like audit(), these never throw.
export async function notifyUser(userId, title, message, type = 'info', link = null) {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)',
      [userId, title.slice(0, 120), message.slice(0, 255), type, link]
    );
    // instant push to any open browser tab of that user (bell + toast), no polling needed
    toUser(userId, 'notification', { title, message, type, link });
  } catch (err) {
    console.error('notification failed:', err.message);
  }
}

// Tell every manager of a restaurant (used for new orders / reservations / low stock)
export async function notifyManagers(restaurantId, title, message, type = 'info', link = null) {
  try {
    const [managers] = await pool.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.name = 'manager' AND u.restaurant_id = ? AND u.status = 'active'`,
      [restaurantId]
    );
    for (const m of managers) {
      await notifyUser(m.id, title, message, type, link);
    }
  } catch (err) {
    console.error('manager notification failed:', err.message);
  }
}
