import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { normalizeGmail, normalizePhone } from './contact.js';

// Creates the first admin. Put your own details in backend/.env before running:
//   ADMIN_EMAIL=yourname@gmail.com   ADMIN_PHONE=+919876543211   ADMIN_PASSWORD=Something@Strong1
// Without them the dev defaults below are used (admin@gmail.com / admin@123 — change after first login).
// Safe to re-run — skips if the email already exists.
const email = process.env.ADMIN_EMAIL || 'admin@gmail.com';
const rawPhone = process.env.ADMIN_PHONE || '+919000000001';
const password = process.env.ADMIN_PASSWORD || 'admin@123';

async function seed() {
  if (process.env.ADMIN_EMAIL) {
    const g = normalizeGmail(process.env.ADMIN_EMAIL);
    if (!g.ok) { console.error(`❌ ADMIN_EMAIL: ${g.error}`); process.exit(1); }
  }
  let phone = rawPhone;
  if (process.env.ADMIN_PHONE) {
    const p = normalizePhone(process.env.ADMIN_PHONE);
    if (!p.ok) { console.error(`❌ ADMIN_PHONE: ${p.error}`); process.exit(1); }
    phone = p.e164;
  }
  try {
    const [[role]] = await pool.query(`SELECT id FROM roles WHERE name = 'admin'`);
    if (!role) { console.error('❌ Roles missing — run database/schema.sql first (npm run db:setup).'); process.exit(1); }
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing.length > 0) {
      console.log(`⏭  ${email} already exists, skipping`);
    } else {
      const hashed = await bcrypt.hash(password, 12);
      await pool.query(
        `INSERT INTO users (name, email, password, phone, role_id, restaurant_id, status) VALUES (?, ?, ?, ?, ?, NULL, 'active')`,
        ['Super Admin', email.toLowerCase(), hashed, phone, role.id]
      );
      console.log(`✅ Created admin: ${email} / ${process.env.ADMIN_PASSWORD ? '(password from .env)' : password}`);
    }
  } catch (err) {
    console.error('❌ Seed failed:', err.code || err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
seed();
