import pool from '../config/db.js';

const PRESETS = { daily: 1, weekly: 7, monthly: 30 };
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Builds the "current period" and "previous period" WHERE fragments.
// Either a preset (daily / weekly / monthly) or an explicit ?from=&to= range.
function periodFilter(query) {
  if (isDate(query.from) && isDate(query.to) && query.from <= query.to) {
    const days = Math.round((new Date(query.to) - new Date(query.from)) / 86400000) + 1;
    return {
      label: `${query.from} → ${query.to}`,
      cond: 'o.created_at::date BETWEEN ? AND ?',
      params: [query.from, query.to],
      expCond: 'e.spent_on BETWEEN ? AND ?',
      expParams: [query.from, query.to],
      // previous period of the same length: [from - days, from - 1]   (date - integer = date in PostgreSQL)
      prevCond: 'o.created_at::date BETWEEN (?::date - ?::int) AND (?::date - 1)',
      prevParams: [query.from, days, query.from],
    };
  }
  const key = PRESETS[query.period] ? query.period : 'daily';
  const d = PRESETS[key];
  return {
    label: key,
    cond: `o.created_at >= NOW() - INTERVAL '${d} days'`,
    params: [],
    expCond: `e.spent_on >= CURRENT_DATE - INTERVAL '${d - 1} days'`,
    expParams: [],
    prevCond: `o.created_at >= NOW() - INTERVAL '${d * 2} days' AND o.created_at < NOW() - INTERVAL '${d} days'`,
    prevParams: [],
  };
}

export async function getReports(req, res) {
  const rid = req.restaurantId;
  const f = periodFilter(req.query);
  const rFilter = rid ? ' AND o.restaurant_id = ?' : '';
  const rParams = rid ? [rid] : [];
  const base = `${f.cond}${rFilter}`;
  const baseParams = [...f.params, ...rParams];

  const [[totals]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS "totalRevenue",
       COUNT(*) AS "totalOrders",
       COUNT(*) FILTER (WHERE o.status = 'Completed') AS "completedOrders",
       COUNT(*) FILTER (WHERE o.status = 'Cancelled') AS "cancelledOrders",
       COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.discount_amount END), 0) AS "discountsGiven",
       COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.tax_amount END), 0) AS "taxCollected"
     FROM orders o WHERE ${base}`,
    baseParams
  );

  const [[prev]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS revenue, COUNT(*) AS orders
     FROM orders o WHERE ${f.prevCond}${rFilter}`,
    [...f.prevParams, ...rParams]
  );

  const [[{ totalExpenses }]] = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS "totalExpenses" FROM expenses e WHERE ${f.expCond}${rid ? ' AND e.restaurant_id = ?' : ''}`,
    [...f.expParams, ...rParams]
  );
  const [expensesByCategory] = await pool.query(
    `SELECT e.category AS name, SUM(e.amount) AS value FROM expenses e WHERE ${f.expCond}${rid ? ' AND e.restaurant_id = ?' : ''} GROUP BY e.category ORDER BY value DESC`,
    [...f.expParams, ...rParams]
  );
  const [[{ tips }]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.tip_amount END), 0) AS tips FROM orders o WHERE ${base}`,
    baseParams
  );

  const completed = Number(totals.completedOrders) || 0;
  const growth = (cur, old) => (Number(old) > 0 ? Math.round(((cur - old) / old) * 1000) / 10 : null);

  const [sales] = await pool.query(
    `SELECT TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date,
            COUNT(*) FILTER (WHERE o.status <> 'Cancelled') AS orders,
            COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS revenue
     FROM orders o WHERE ${base}
     GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD') ORDER BY date DESC`,
    baseParams
  );

  const [popularItems] = await pool.query(
    `SELECT m.name, SUM(oi.quantity) AS count, SUM(oi.quantity * oi.price) AS revenue
     FROM order_items oi
     JOIN menu_items m ON m.id = oi.menu_item_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'Cancelled' AND ${base}
     GROUP BY m.id, m.name ORDER BY count DESC LIMIT 5`,
    baseParams
  );

  const [byCategory] = await pool.query(
    `SELECT c.name, SUM(oi.quantity * oi.price) AS revenue
     FROM order_items oi
     JOIN menu_items m ON m.id = oi.menu_item_id
     JOIN categories c ON c.id = m.category_id
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status = 'Completed' AND ${base}
     GROUP BY c.name ORDER BY revenue DESC LIMIT 8`,
    baseParams
  );

  const [byOrderType] = await pool.query(
    `SELECT o.order_type AS name, COUNT(*) AS orders,
            COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS revenue
     FROM orders o WHERE o.status <> 'Cancelled' AND ${base} GROUP BY o.order_type`,
    baseParams
  );

  const [byPayment] = await pool.query(
    `SELECT p.method AS name, COUNT(*) AS orders, COALESCE(SUM(p.amount), 0) AS revenue
     FROM orders o JOIN payments p ON p.order_id = o.id
     WHERE o.status = 'Completed' AND ${base} GROUP BY p.method`,
    baseParams
  );

  const [hours] = await pool.query(
    `SELECT EXTRACT(HOUR FROM o.created_at)::int AS hour, COUNT(*) AS orders
     FROM orders o WHERE o.status <> 'Cancelled' AND ${base} GROUP BY EXTRACT(HOUR FROM o.created_at)::int`,
    baseParams
  );
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: Number(hours.find((x) => x.hour === h)?.orders) || 0 }));

  const [topCustomers] = await pool.query(
    `SELECT u.name, COUNT(*) AS orders, SUM(o.total_amount) AS spent
     FROM orders o JOIN users u ON u.id = o.customer_id
     WHERE o.status = 'Completed' AND ${base}
     GROUP BY u.id, u.name ORDER BY spent DESC LIMIT 5`,
    baseParams
  );

  res.json({
    period: f.label,
    totalRevenue: Number(totals.totalRevenue),
    totalOrders: Number(totals.totalOrders),
    completedOrders: completed,
    cancelledOrders: Number(totals.cancelledOrders) || 0,
    avgOrderValue: completed ? Math.round((Number(totals.totalRevenue) / completed) * 100) / 100 : 0,
    discountsGiven: Number(totals.discountsGiven),
    taxCollected: Number(totals.taxCollected),
    tips: Number(tips),
    totalExpenses: Number(totalExpenses),
    netProfit: Number(totals.totalRevenue) - Number(totalExpenses),
    expensesByCategory: expensesByCategory.map((r) => ({ name: r.name, value: Number(r.value) })),
    revenueGrowth: growth(Number(totals.totalRevenue), Number(prev.revenue)),
    ordersGrowth: growth(Number(totals.totalOrders), Number(prev.orders)),
    sales, popularItems, byCategory, byOrderType, byPayment, byHour, topCustomers,
  });
}

// Extra numbers + chart data for the admin / manager dashboards (rid = null → all restaurants)
export async function dashboardExtras(rid) {
  const rFilter = rid ? ' AND o.restaurant_id = ?' : '';
  const rParams = rid ? [rid] : [];

  const [trendRows] = await pool.query(
    `SELECT TO_CHAR(o.created_at, 'YYYY-MM-DD') AS date, COUNT(*) FILTER (WHERE o.status <> 'Cancelled') AS orders,
            COALESCE(SUM(CASE WHEN o.status = 'Completed' THEN o.total_amount END), 0) AS revenue
     FROM orders o WHERE o.created_at >= CURRENT_DATE - INTERVAL '6 days'${rFilter}
     GROUP BY TO_CHAR(o.created_at, 'YYYY-MM-DD')`,
    rParams
  );
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = trendRows.find((r) => r.date === key);
    trend.push({ date: key, orders: Number(row?.orders) || 0, revenue: Number(row?.revenue) || 0 });
  }

  const [statusBreakdown] = await pool.query(
    `SELECT o.status AS name, COUNT(*) AS value FROM orders o
     WHERE o.created_at >= CURRENT_DATE - INTERVAL '29 days'${rFilter} GROUP BY o.status`,
    rParams
  );

  const [topItems] = await pool.query(
    `SELECT m.name, SUM(oi.quantity) AS value FROM order_items oi
     JOIN menu_items m ON m.id = oi.menu_item_id JOIN orders o ON o.id = oi.order_id
     WHERE o.status <> 'Cancelled' AND o.created_at >= CURRENT_DATE - INTERVAL '29 days'${rFilter}
     GROUP BY m.id, m.name ORDER BY value DESC LIMIT 5`,
    rParams
  );

  const [[rating]] = await pool.query(
    `SELECT COALESCE(ROUND(AVG(rv.rating), 1), 0) AS "avgRating", COUNT(*) AS "reviewCount"
     FROM reviews rv JOIN orders o ON o.id = rv.order_id WHERE 1=1${rFilter}`,
    rParams
  );

  const iFilter = rid ? ' AND restaurant_id = ?' : '';
  const [[{ lowStock }]] = await pool.query(
    `SELECT COUNT(*) AS "lowStock" FROM inventory_items WHERE quantity <= reorder_level${iFilter}`,
    rParams
  );
  const [[{ upcomingReservations }]] = await pool.query(
    `SELECT COUNT(*) AS "upcomingReservations" FROM reservations
     WHERE status IN ('Pending','Confirmed') AND reservation_date >= CURRENT_DATE${iFilter}`,
    rParams
  );
  const [[{ activeCoupons }]] = await pool.query(
    `SELECT COUNT(*) AS "activeCoupons" FROM coupons WHERE is_active = TRUE AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)${rid ? ' AND (restaurant_id IS NULL OR restaurant_id = ?)' : ''}`,
    rParams
  );

  return {
    trend,
    statusBreakdown: statusBreakdown.map((r) => ({ name: r.name, value: Number(r.value) })),
    topItems: topItems.map((r) => ({ name: r.name, value: Number(r.value) })),
    avgRating: Number(rating.avgRating),
    reviewCount: Number(rating.reviewCount),
    lowStock: Number(lowStock),
    upcomingReservations: Number(upcomingReservations),
    activeCoupons: Number(activeCoupons),
  };
}
