import pool from '../config/db.js';
import { maskEmailAddr, maskPhoneNumber } from './contact.js';

// =====================================================================
//  REAL EMAIL + SMS DELIVERY
//
//  Email  : any SMTP server through nodemailer (receipts, status updates, password-reset links).
//           For Gmail use an "App password":
//             SMTP_USER=youraddress@gmail.com   SMTP_PASS=<16-letter app password>
//  SMS    : SMS_PROVIDER=twilio   (any country)  or  SMS_PROVIDER=fast2sms (India, +91 only)  — "order ready" texts
//
//  Nothing configured?  In development messages are only recorded in notification_log as "demo"
//  (nothing leaves your computer). In production a missing provider is an error — the server never
//  pretends a message was sent.
// =====================================================================
const isProd = () => process.env.NODE_ENV === 'production';

export function emailConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function smsProvider() {
  const p = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (p === 'twilio' && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && (process.env.TWILIO_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)) return 'twilio';
  if (p === 'fast2sms' && process.env.FAST2SMS_API_KEY) return 'fast2sms';
  return null;
}

export const integrationStatus = () => ({
  email: { configured: emailConfigured(), provider: emailConfigured() ? (process.env.SMTP_HOST || 'smtp.gmail.com') : null, from: emailConfigured() ? process.env.SMTP_USER : null },
  sms: { configured: !!smsProvider(), provider: smsProvider(), requested: process.env.SMS_PROVIDER || null },
});

async function logDelivery({ userId = null, channel, to, kind, status, error = null }) {
  try {
    const masked = channel === 'email' ? maskEmailAddr(to) : maskPhoneNumber(to);
    await pool.query(
      'INSERT INTO notification_log (user_id, channel, recipient, kind, status, error) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, channel, masked.slice(0, 80), String(kind).slice(0, 40), status, error ? String(error).slice(0, 200) : null]
    );
  } catch (e) {
    console.error('notification log failed:', e.message);
  }
}

// ---------------------------------------------------------------- email
let transporter;
async function getTransporter() {
  if (transporter) return transporter;
  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    throw new Error('nodemailer is not installed — run "npm install" in the backend folder');
  }
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s+/g, '') }, // app passwords are shown with spaces
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return transporter;
}

/** returns 'sent' | 'demo' — throws if a configured provider fails */
export async function sendEmail({ to, subject, text, html, kind = 'message', userId = null }) {
  if (!emailConfigured()) {
    if (isProd()) throw new Error('Email is not configured (set SMTP_USER and SMTP_PASS)');
    await logDelivery({ userId, channel: 'email', to, kind, status: 'demo' });
    return 'demo';
  }
  try {
    const t = await getTransporter();
    await t.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Spice Route'}" <${process.env.SMTP_USER}>`,
      to, subject, text, html,
    });
    await logDelivery({ userId, channel: 'email', to, kind, status: 'sent' });
    return 'sent';
  } catch (err) {
    await logDelivery({ userId, channel: 'email', to, kind, status: 'failed', error: err.message });
    console.error(`email to ${maskEmailAddr(to)} failed:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------- sms
async function viaTwilio(to, text) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const body = new URLSearchParams({ To: to, Body: text });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) body.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else body.set('From', process.env.TWILIO_FROM);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio: ${data.message || res.status}`);
}

async function viaFast2Sms(to, text) {
  if (!to.startsWith('+91')) throw new Error('Fast2SMS only delivers to Indian (+91) numbers — use Twilio for other countries');
  const params = new URLSearchParams({ authorization: process.env.FAST2SMS_API_KEY, numbers: to.slice(-10) });
  params.set('route', 'q'); params.set('message', text); params.set('language', 'english'); params.set('flash', '0');
  const res = await fetch(`https://www.fast2sms.com/dev/bulkV2?${params}`, { signal: AbortSignal.timeout(12_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.return === false) throw new Error(`Fast2SMS: ${Array.isArray(data.message) ? data.message.join(' ') : data.message || res.status}`);
}

/** `to` must be E.164 (+919876543210). */
export async function sendSms({ to, text, kind = 'message', userId = null }) {
  const provider = smsProvider();
  if (!provider) {
    if (isProd()) throw new Error('SMS is not configured (set SMS_PROVIDER and its credentials)');
    await logDelivery({ userId, channel: 'sms', to, kind, status: 'demo' });
    return 'demo';
  }
  try {
    if (provider === 'twilio') await viaTwilio(to, text);
    else await viaFast2Sms(to, text);
    await logDelivery({ userId, channel: 'sms', to, kind, status: 'sent' });
    return 'sent';
  } catch (err) {
    await logDelivery({ userId, channel: 'sms', to, kind, status: 'failed', error: err.message });
    console.error(`sms to ${maskPhoneNumber(to)} failed:`, err.message);
    throw err;
  }
}

// ---------------------------------------------------------------- email layout
const BRAND = '#ff4b3e';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function emailLayout({ heading, lines = [], button = null, footer = 'If you did not request this, you can safely ignore this email.' }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f6f6f7;font-family:Arial,Helvetica,sans-serif;color:#1c1c1c">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
    <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:14px;overflow:hidden">
      <tr><td style="background:${BRAND};padding:18px 28px;color:#fff;font-size:20px;font-weight:700">Spice Route</td></tr>
      <tr><td style="padding:28px">
        <h2 style="margin:0 0 14px;font-size:20px">${esc(heading)}</h2>
        ${lines.map((l) => `<p style="margin:0 0 10px;font-size:14.5px;line-height:1.55;color:#444">${esc(l)}</p>`).join('')}
        ${button ? `<div style="margin:22px 0;text-align:center"><a href="${esc(button.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:10px">${esc(button.label)}</a></div><p style="margin:0 0 6px;font-size:12px;color:#888;word-break:break-all">Or paste this link into your browser:<br>${esc(button.url)}</p>` : ''}
        <p style="margin:18px 0 0;font-size:12px;color:#888">${esc(footer)}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  const text = `${heading}\n\n${lines.join('\n')}${button ? `\n\n${button.label}: ${button.url}` : ''}\n\n${footer}`;
  return { html, text };
}
