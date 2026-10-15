import pool from '../config/db.js';
import { emailLayout, sendEmail, sendSms, smsProvider } from './notifier.js';

// Receipts and status messages to the customer's Gmail (and, for time-critical ones, SMS).
// Always fire-and-forget: a mail problem must never break an order.
const emailsOn = () => process.env.EMAIL_NOTIFICATIONS !== 'false';
const smsOn = () => process.env.SMS_ORDER_UPDATES !== 'false' && !!smsProvider(); // never SMS in demo mode (costs money, nobody receives it)

export function sendToUser(userId, { kind, subject, heading, lines = [], sms = null }) {
  (async () => {
    const [[u]] = await pool.query('SELECT email, phone FROM users WHERE id = ?', [userId]);
    if (!u || u.email === 'walkin@system.local') return;
    if (emailsOn() && u.email) {
      const mail = emailLayout({ heading, lines, footer: 'You are receiving this because you ordered from Spice Route.' });
      await sendEmail({ to: u.email, subject, ...mail, kind, userId }).catch(() => {});
    }
    if (sms && smsOn() && u.phone) {
      await sendSms({ to: u.phone, text: sms, kind, userId }).catch(() => {});
    }
  })().catch((e) => console.error('sendToUser failed:', e.message));
}
