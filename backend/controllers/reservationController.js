import pool from '../config/db.js';
import { notifyUser, notifyManagers } from '../utils/notify.js';
import { audit } from '../utils/audit.js';
import { sendToUser } from '../utils/messages.js';
import { toRestaurant, toUser } from '../utils/realtime.js';

const SLOT_WINDOW_SECONDS = 2 * 60 * 60; // a booking blocks its table for 2 hours either side

const toSeconds = (t) => {
  const [h, m, s] = String(t).split(':').map(Number);
  return h * 3600 + (m || 0) * 60 + (s || 0);
};
const pad = (n) => String(n).padStart(2, '0');
const toHHMMSS = (sec) => `${pad(Math.floor(sec / 3600) % 24)}:${pad(Math.floor((sec % 3600) / 60))}:00`;

function withinOpeningHours(restaurant, time) {
  const t = toSeconds(time);
  const open = toSeconds(restaurant.opening_time);
  const close = toSeconds(restaurant.closing_time);
  // closing <= opening means the restaurant is open past midnight
  return close > open ? t >= open && t <= close - 3600 : t >= open || t <= close - 3600;
}

// smallest free table that fits the party, or null. `exclude` = a reservation being re-assigned.
async function findFreeTable(conn, restaurantId, date, time, party, exclude = 0) {
  const [tables] = await conn.query(
    `SELECT t.id, t.table_no, t.capacity FROM restaurant_tables t
     WHERE t.restaurant_id = ? AND t.capacity >= ? AND t.status <> 'Maintenance'
       AND NOT EXISTS (
         SELECT 1 FROM reservations r
         WHERE r.table_id = t.id AND r.id <> ? AND r.status IN ('Pending','Confirmed')
           AND r.reservation_date = ?
           AND ABS(EXTRACT(EPOCH FROM r.reservation_time) - EXTRACT(EPOCH FROM ?::time)) < ?
       )
     ORDER BY t.capacity, t.table_no LIMIT 1`,
    [restaurantId, party, exclude, date, time, SLOT_WINDOW_SECONDS]
  );
  return tables[0] || null;
}

async function restaurantHasTables(conn, restaurantId) {
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM restaurant_tables WHERE restaurant_id = ?', [restaurantId]);
  return n > 0;
}

// ---------- customer ----------
export async function getAvailability(req, res) {
  const { restaurant_id, date } = req.query;
  const party = Math.max(1, Number(req.query.party_size) || 2);
  if (!restaurant_id || !date) return res.status(400).json({ message: 'restaurant_id and date are required' });

  const [[restaurant]] = await pool.query('SELECT id, opening_time, closing_time FROM restaurants WHERE id = ?', [restaurant_id]);
  if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });

  const hasTables = await restaurantHasTables(pool, restaurant.id);
  const open = toSeconds(restaurant.opening_time);
  let close = toSeconds(restaurant.closing_time);
  if (close <= open) close += 24 * 3600;

  const now = new Date();
  const slots = [];
  for (let s = open; s <= close - 3600; s += 1800) {
    const time = toHHMMSS(s);
    const slotDate = new Date(`${date}T${time}`);
    let available = slotDate > now;
    if (available && hasTables) available = !!(await findFreeTable(pool, restaurant.id, date, time, party));
    slots.push({ time: time.slice(0, 5), available });
  }
  res.json({ has_tables: hasTables, slots });
}

export async function createReservation(req, res) {
  const { restaurant_id, reservation_date, reservation_time, special_request } = req.body;
  const party_size = Math.floor(Number(req.body.party_size));

  if (!restaurant_id || !party_size || !reservation_date || !reservation_time) {
    return res.status(400).json({ message: 'Restaurant, party size, date and time are all required' });
  }
  if (party_size < 1 || party_size > 20) return res.status(400).json({ message: 'Party size must be between 1 and 20' });

  const time = String(reservation_time).length === 5 ? `${reservation_time}:00` : reservation_time;
  if (new Date(`${reservation_date}T${time}`) < new Date()) {
    return res.status(400).json({ message: 'Pick a date/time in the future' });
  }

  const [[restaurant]] = await pool.query(
    'SELECT id, name, is_open, opening_time, closing_time FROM restaurants WHERE id = ?',
    [restaurant_id]
  );
  if (!restaurant) return res.status(404).json({ message: 'Restaurant not found' });
  if (!withinOpeningHours(restaurant, time)) {
    return res.status(400).json({
      message: `${restaurant.name} takes bookings between ${String(restaurant.opening_time).slice(0, 5)} and the hour before closing (${String(restaurant.closing_time).slice(0, 5)})`,
    });
  }

  const [[dupe]] = await pool.query(
    `SELECT id FROM reservations WHERE customer_id = ? AND restaurant_id = ? AND reservation_date = ?
       AND reservation_time = ? AND status IN ('Pending','Confirmed')`,
    [req.user.id, restaurant.id, reservation_date, time]
  );
  if (dupe) return res.status(409).json({ message: 'You already have a booking for that time' });

  let tableId = null;
  if (await restaurantHasTables(pool, restaurant.id)) {
    const table = await findFreeTable(pool, restaurant.id, reservation_date, time, party_size);
    if (!table) {
      return res.status(409).json({ message: 'No table is free for that time and party size — try another slot' });
    }
    tableId = table.id;
  }

  const [result] = await pool.query(
    `INSERT INTO reservations (customer_id, restaurant_id, table_id, party_size, reservation_date, reservation_time, special_request, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
    [req.user.id, restaurant.id, tableId, party_size, reservation_date, time, special_request ? String(special_request).slice(0, 255) : null]
  );

  toRestaurant(restaurant.id, 'reservation:update', { id: result.insertId });
  notifyManagers(restaurant.id, 'New table request', `${req.user.name} · party of ${party_size} on ${reservation_date} at ${time.slice(0, 5)}`, 'reservation', '/manager/reservations');
  res.status(201).json({ message: 'Table requested — we will confirm shortly', id: result.insertId });
}

export async function getMyReservations(req, res) {
  const [rows] = await pool.query(
    `SELECT res.id, res.party_size, res.reservation_date, res.reservation_time, res.status, res.special_request,
            res.manager_note, res.created_at, t.table_no, r.name AS restaurant_name, r.address AS restaurant_address
     FROM reservations res
     JOIN restaurants r ON r.id = res.restaurant_id
     LEFT JOIN restaurant_tables t ON t.id = res.table_id
     WHERE res.customer_id = ?
     ORDER BY res.reservation_date DESC, res.reservation_time DESC`,
    [req.user.id]
  );
  res.json(rows);
}

export async function cancelMyReservation(req, res) {
  const [[reservation]] = await pool.query('SELECT customer_id, restaurant_id, status FROM reservations WHERE id = ?', [req.params.id]);
  if (!reservation || reservation.customer_id !== req.user.id) {
    return res.status(404).json({ message: 'Reservation not found' });
  }
  if (['Cancelled', 'Completed'].includes(reservation.status)) {
    return res.status(400).json({ message: 'This reservation can no longer be cancelled' });
  }
  await pool.query(`UPDATE reservations SET status = 'Cancelled' WHERE id = ?`, [req.params.id]);
  toRestaurant(reservation.restaurant_id, 'reservation:update', { id: Number(req.params.id) });
  notifyManagers(reservation.restaurant_id, 'Reservation cancelled', `${req.user.name} cancelled a table booking.`, 'reservation', '/manager/reservations');
  res.json({ message: 'Reservation cancelled' });
}

// ---------- admin / manager (scoped by req.restaurantId) ----------
export async function getReservations(req, res) {
  const rid = req.restaurantId;
  const [rows] = await pool.query(
    `SELECT res.id, res.party_size, res.reservation_date, res.reservation_time, res.status, res.special_request,
            res.manager_note, res.table_id, t.table_no, u.name AS customer_name, u.phone AS customer_phone,
            r.name AS restaurant_name
     FROM reservations res
     JOIN users u ON u.id = res.customer_id
     JOIN restaurants r ON r.id = res.restaurant_id
     LEFT JOIN restaurant_tables t ON t.id = res.table_id
     ${rid ? 'WHERE res.restaurant_id = ?' : ''}
     ORDER BY res.reservation_date, res.reservation_time`,
    rid ? [rid] : []
  );
  res.json(rows);
}

export async function updateReservationStatus(req, res) {
  const { status, manager_note } = req.body;
  const valid = ['Pending', 'Confirmed', 'Cancelled', 'Completed'];
  if (!valid.includes(status)) return res.status(400).json({ message: 'Invalid status' });

  const [[r]] = await pool.query('SELECT id, customer_id, restaurant_id, reservation_date, reservation_time FROM reservations WHERE id = ?', [req.params.id]);
  if (!r || (req.restaurantId && r.restaurant_id !== req.restaurantId)) {
    return res.status(404).json({ message: 'Reservation not found' });
  }

  await pool.query('UPDATE reservations SET status = ?, manager_note = COALESCE(?, manager_note) WHERE id = ?', [
    status, manager_note ? String(manager_note).slice(0, 255) : null, r.id,
  ]);

  const when = `${String(r.reservation_date).slice(0, 10)} at ${String(r.reservation_time).slice(0, 5)}`;
  const text = { Confirmed: `Your table for ${when} is confirmed.`, Cancelled: `Your table booking for ${when} was cancelled by the restaurant.`, Completed: 'Thanks for dining with us!' }[status];
  toRestaurant(r.restaurant_id, 'reservation:update', { id: r.id });
  toUser(r.customer_id, 'reservation:update', { id: r.id, status });
  if (['Confirmed', 'Cancelled'].includes(status)) sendToUser(r.customer_id, { kind: `reservation_${status.toLowerCase()}`, subject: `Table booking ${status.toLowerCase()}`, heading: `Your table booking is ${status.toLowerCase()}`, lines: [text, ...(manager_note ? [`Note from the restaurant: ${manager_note}`] : [])] });
  if (text) notifyUser(r.customer_id, `Reservation ${status.toLowerCase()}`, text, 'reservation', '/user/reservations');
  audit(req, 'reservation.status', 'reservation', r.id, status);
  res.json({ message: 'Reservation updated' });
}

export async function assignTable(req, res) {
  const [[r]] = await pool.query(
    'SELECT id, restaurant_id, party_size, reservation_date, reservation_time FROM reservations WHERE id = ?',
    [req.params.id]
  );
  if (!r || (req.restaurantId && r.restaurant_id !== req.restaurantId)) {
    return res.status(404).json({ message: 'Reservation not found' });
  }
  const tableId = req.body.table_id || null;
  if (tableId) {
    const [[table]] = await pool.query('SELECT id, capacity FROM restaurant_tables WHERE id = ? AND restaurant_id = ?', [tableId, r.restaurant_id]);
    if (!table) return res.status(400).json({ message: 'That table does not belong to this restaurant' });
    if (table.capacity < r.party_size) return res.status(400).json({ message: `That table seats ${table.capacity}, the party is ${r.party_size}` });
    const [[clash]] = await pool.query(
      `SELECT id FROM reservations WHERE table_id = ? AND id <> ? AND status IN ('Pending','Confirmed')
         AND reservation_date = ? AND ABS(EXTRACT(EPOCH FROM reservation_time) - EXTRACT(EPOCH FROM ?::time)) < ?`,
      [tableId, r.id, r.reservation_date, r.reservation_time, SLOT_WINDOW_SECONDS]
    );
    if (clash) return res.status(409).json({ message: 'That table is already booked around that time' });
  }
  await pool.query('UPDATE reservations SET table_id = ? WHERE id = ?', [tableId, r.id]);
  res.json({ message: 'Table assigned' });
}
