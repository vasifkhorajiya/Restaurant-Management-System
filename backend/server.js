import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import managerRoutes from './routes/managerRoutes.js';
import publicMenuRoutes from './routes/publicMenuRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import userRoutes from './routes/userRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import reservationRoutes from './routes/reservationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import eventRoutes from './routes/eventRoutes.js';

import pool from './config/db.js';
import { verifyToken, requireRole, scopeRestaurant } from './middleware/authMiddleware.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing — copy .env.example to .env first.');
  process.exit(1);
}
const isProd = process.env.NODE_ENV === 'production';
if (process.env.JWT_SECRET.length < 32) {
  const msg = 'JWT_SECRET is shorter than 32 characters — generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
  if (isProd) { console.error(msg); process.exit(1); }
  console.warn(`⚠️  ${msg}`);
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1); // needed behind nginx/Render/etc. so rate limits see real IPs

app.use(helmet({
  crossOriginResourcePolicy: false, // false so <img> from /uploads still loads
  referrerPolicy: { policy: 'no-referrer' },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
}));
// CORS_ORIGIN may be a comma-separated allow-list
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim());
app.use(cors({ origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('Origin not allowed by CORS'))) }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again in a few minutes' },
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many payment attempts, please wait a few minutes' },
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', verifyToken, requireRole('admin'), scopeRestaurant, adminRoutes);
app.use('/api/manager', verifyToken, requireRole('manager'), scopeRestaurant, managerRoutes);
app.use('/api', publicMenuRoutes); // /menu, /menu/popular, /categories, /restaurants
app.use('/api/orders', verifyToken, requireRole('user'), orderRoutes);
app.use('/api/user', verifyToken, requireRole('user'), userRoutes);
app.use('/api/reviews', verifyToken, requireRole('user'), reviewRoutes);
app.use('/api/reservations', verifyToken, requireRole('user'), reservationRoutes);
app.use('/api/events', eventRoutes); // live updates (Server-Sent Events)
app.use('/api/payments', paymentLimiter, verifyToken, requireRole('user'), paymentRoutes);
app.use('/api/notifications', verifyToken, notificationRoutes); // every role: own notifications only

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'degraded', database: 'unreachable' });
  }
});

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));

// Centralized error handler — every route is wrapped in asyncHandler (see
// utils/asyncHandler.js), so any thrown/rejected error from anywhere in the
// app lands here instead of hanging the request with no response.
app.use((err, req, res, next) => {
  // deliberate, user-facing errors (validation, payment…) keep their message and status
  if (err.name === 'HttpError') {
    return res.status(err.status).json({ message: err.message, ...err.extra });
  }
  console.error(err);
  if (err.message === 'Origin not allowed by CORS') return res.status(403).json({ message: 'Origin not allowed' });

  // Translate the PostgreSQL error codes that show up most often into something
  // a user (or the frontend toast) can actually read, instead of raw SQL text.
  if (err.code === '23505') {                       // unique_violation
    return res.status(409).json({ message: 'That record already exists.' });
  }
  if (err.code === '23503') {                       // foreign_key_violation (either direction)
    const deleting = /still referenced/i.test(err.detail || '') || /update or delete on table/i.test(err.message || '');
    return deleting
      ? res.status(409).json({ message: 'This is still linked to other records (orders, menu items, etc.) and cannot be deleted.' })
      : res.status(400).json({ message: 'That reference (e.g. restaurant or category) does not exist.' });
  }
  if (err.code === '23514' || err.code === '23502') { // check_violation / not_null_violation
    return res.status(400).json({ message: 'Some of the values are not allowed. Please check the form and try again.' });
  }
  if (err.code === '22P02' || err.code === '22007' || err.code === '22008' || err.code === '22003') { // bad number / date / uuid input
    return res.status(400).json({ message: 'One of the values has an invalid format.' });
  }
  if (err.code === 'ECONNREFUSED' || err.code === '57P01' || err.code === '08006' || err.code === '08001') {
    return res.status(503).json({ message: 'Database is unavailable right now — check that PostgreSQL is running.' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Image is too large — 3MB max.' });
  }
  if (err.message && err.message.includes('images are allowed')) {
    return res.status(400).json({ message: err.message });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'That request is too large.' });
  }

  // never leak SQL / stack details to the browser in production
  const status = err.status || 500;
  res.status(status).json({ message: status >= 500 && isProd ? 'Something went wrong on the server.' : err.message || 'Something went wrong on the server.' });
});

// ---------------------------------------------------------------
// Start-up check: tell the developer EXACTLY what to do if the database isn't ready,
// instead of failing later with a cryptic ER_NO_SUCH_TABLE.
// ---------------------------------------------------------------
async function checkDatabase() {
  try {
    const [tables] = await pool.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'");
    const have = new Set(tables.map((r) => String(r.t).toLowerCase()));
    const needed = ['users', 'roles', 'orders', 'password_resets', 'user_sessions', 'payment_orders', 'service_requests', 'restaurant_tables', 'notification_log'];
    const missing = needed.filter((t) => !have.has(t));
    if (missing.length) {
      console.error(`\n❌ Database "${process.env.DB_NAME}" is missing tables: ${missing.join(', ')}`);
      console.error('   Run the schema:   cd backend && npm run db:setup     (or open database/schema.sql in pgAdmin\'s Query Tool and press Execute)\n');
      return false;
    }
    console.log('✅ PostgreSQL connected — schema looks good');
    return true;
  } catch (err) {
    console.error(`\n❌ Cannot connect to PostgreSQL (${err.code || err.message}).`);
    if (err.code === '28P01' || err.code === '28000') console.error('   Wrong DB_USER / DB_PASSWORD in backend/.env — use the same ones you use to log in to pgAdmin.');
    else if (err.code === '3D000') console.error(`   Database "${process.env.DB_NAME}" does not exist — run:  cd backend && npm run db:setup`);
    else if (err.code === 'ECONNREFUSED') console.error('   PostgreSQL is not running (or DB_HOST / DB_PORT is wrong). Start the PostgreSQL service; the default port is 5432.');
    else if (err.code === '42P01') console.error('   Tables are missing — run:  cd backend && npm run db:setup');
    console.error('');
    return false;
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`server up on :${PORT}`);
  await checkDatabase();
});
