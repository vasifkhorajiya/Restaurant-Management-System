# Spice Route — Restaurant Management System

A full-stack, real-time restaurant platform: **React** frontend, **Node.js / Express** backend, **PostgreSQL** database.
Three roles — **Customer**, **Manager**, **Admin** — each with their own workflow.

## Highlights
* **Customers:** menu with real ratings, favourites, coupons, loyalty points, delivery / pickup / dine-in, scheduled orders, tips, live order tracking,
  hand-over code, table booking with live free slots, "call waiter / request bill", refund requests, PDF invoices.
* **Managers:** live Kitchen Display, Counter POS, orders, tables, inventory, coupons, reviews, expenses & profit, staff attendance, payments & refunds, analytics.
* **Admin:** everything above across all restaurants, plus user/manager management, activity log and a login-security log.
* **Online payments:** built-in **fake Razorpay** gateway using the real signature-verification flow (test cards inside).
* **Login:** email + password for admin, manager and customer. Customers sign up with a Gmail address and a mobile number (`+<country code>` + exactly 10 digits) and are signed in straight away. "Forgot password" emails a single-use link.
* **Receipts & updates:** order receipts, ready/completed/cancelled and refund emails, "order ready" SMS, and an admin **Integrations** page with a delivery log.
* **Real-time:** orders, kitchen, notifications, table requests and dashboards update instantly (Server-Sent Events — no page refresh).
* **Security:** server-side sessions (instant logout from any device), brute-force lockout, rate limits, strong password policy, hashed reset tokens, audit trail.

More detail: [ADVANCED_FEATURES.md](ADVANCED_FEATURES.md) · [SECURITY_AND_PAYMENTS.md](SECURITY_AND_PAYMENTS.md) · step-by-step setup: **[RUN_GUIDE.md](RUN_GUIDE.md)**

## Requirements
* **Node.js 18+** (with npm)
* **PostgreSQL 13+** (includes **pgAdmin 4**) — https://www.postgresql.org/download/
* A modern browser

## Project structure
```text
Restaurant-Management-System/
├── backend/        Express API (controllers, routes, middleware, utils, uploads)
├── frontend/       React + Vite app
├── database/
│   └── schema.sql  ← the ONLY database file (PostgreSQL): all 30 tables, indexes, triggers + seed data
├── RUN_GUIDE.md
├── ADVANCED_FEATURES.md
└── SECURITY_AND_PAYMENTS.md
```

## Quick start
1. **Database** — `cd backend`, set your PostgreSQL login in `.env`, then run `npm run db:setup` (creates the database and runs `database/schema.sql`).
   Prefer pgAdmin? Create a database named `restaurant_management`, open the Query Tool on it, load `database/schema.sql` and press Execute.
2. **Backend**
   ```bash
   cd backend
   npm install
   copy .env.example .env        # macOS/Linux: cp .env.example .env
   # edit .env: DB_USER / DB_PASSWORD = your PostgreSQL (pgAdmin) login, a long JWT_SECRET,
   # and ADMIN_EMAIL (your Gmail) / ADMIN_PHONE (+91…) / ADMIN_PASSWORD
   npm run db:setup              # creates the database + all 30 tables
   npm run seed                  # creates the first admin
   npm run dev                   # http://localhost:5000
   ```
3. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev                   # http://localhost:5173
   ```
4. Log in with the admin you seeded (your `ADMIN_EMAIL` / `ADMIN_PASSWORD`, or the demo defaults `admin@gmail.com` / `admin@123`).

Full walkthrough with screenshots-style steps and troubleshooting: **[RUN_GUIDE.md](RUN_GUIDE.md)**.

## Troubleshooting (short)
| Message | Fix |
|---|---|
| `password authentication failed` (28P01) | `DB_USER` / `DB_PASSWORD` in `backend/.env` must match your pgAdmin login |
| `database "restaurant_management" does not exist` (3D000) | Run `npm run db:setup` |
| `relation "users" does not exist` (42P01) | Tables are missing — run `npm run db:setup` |
| `ECONNREFUSED` | PostgreSQL isn't running — start the `postgresql` service (default port **5432**) |
| `EADDRINUSE` | Port already in use — close the other process or change `PORT` |
| Frontend can't reach the API | Start the backend first; check http://localhost:5000/api/health |

The backend prints a clear message at start-up if the database isn't ready.

## Development notes
Keep real credentials only in `backend/.env` (never commit it). Generate a strong secret with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
