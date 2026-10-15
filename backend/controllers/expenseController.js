import pool from '../config/db.js';
import { HttpError } from '../utils/pricing.js';
import { audit } from '../utils/audit.js';

export const EXPENSE_CATEGORIES = ['Ingredients', 'Salaries', 'Rent', 'Utilities', 'Maintenance', 'Marketing', 'Delivery', 'Other'];
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export async function getExpenses(req, res) {
  const rid = req.restaurantId;
  const from = isDate(req.query.from) ? req.query.from : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA');
  const to = isDate(req.query.to) ? req.query.to : new Date().toLocaleDateString('en-CA');
  const params = rid ? [from, to, rid] : [from, to];
  const where = `e.spent_on BETWEEN ? AND ? ${rid ? 'AND e.restaurant_id = ?' : ''}`;

  const [items] = await pool.query(
    `SELECT e.id, e.category, e.amount, e.note, e.spent_on, r.name AS restaurant_name, u.name AS added_by
     FROM expenses e JOIN restaurants r ON r.id = e.restaurant_id LEFT JOIN users u ON u.id = e.created_by
     WHERE ${where} ORDER BY e.spent_on DESC, e.id DESC LIMIT 500`, params);
  const [byCategory] = await pool.query(
    `SELECT e.category AS name, SUM(e.amount) AS value FROM expenses e WHERE ${where} GROUP BY e.category ORDER BY value DESC`, params);
  const [[{ revenue }]] = await pool.query(
    `SELECT COALESCE(SUM(o.total_amount), 0) AS revenue FROM orders o
     WHERE o.status = 'Completed' AND o.created_at::date BETWEEN ? AND ? ${rid ? 'AND o.restaurant_id = ?' : ''}`, params);

  const total = items.reduce((s, i) => s + Number(i.amount), 0);
  res.json({
    from, to, categories: EXPENSE_CATEGORIES, items,
    byCategory: byCategory.map((r) => ({ name: r.name, value: Number(r.value) })),
    total, revenue: Number(revenue), profit: Number(revenue) - total,
  });
}

export async function createExpense(req, res) {
  const restaurantId = req.restaurantId ?? req.body.restaurant_id;
  const amount = Number(req.body.amount);
  if (!restaurantId) throw new HttpError('Pick a restaurant');
  if (!EXPENSE_CATEGORIES.includes(req.body.category)) throw new HttpError('Pick a category');
  if (!(amount > 0) || amount > 10000000) throw new HttpError('Enter a valid amount');
  const spentOn = isDate(req.body.spent_on) ? req.body.spent_on : new Date().toLocaleDateString('en-CA');
  const [r] = await pool.query(
    'INSERT INTO expenses (restaurant_id, category, amount, note, spent_on, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [restaurantId, req.body.category, amount, req.body.note ? String(req.body.note).slice(0, 255) : null, spentOn, req.user.id]
  );
  audit(req, 'expense.create', 'expense', r.insertId, `${req.body.category} ₹${amount}`);
  res.status(201).json({ message: 'Expense recorded', id: r.insertId });
}

export async function deleteExpense(req, res) {
  const rid = req.restaurantId;
  await pool.query(`DELETE FROM expenses WHERE id = ? ${rid ? 'AND restaurant_id = ?' : ''}`, [req.params.id, ...(rid ? [rid] : [])]);
  audit(req, 'expense.delete', 'expense', Number(req.params.id));
  res.json({ message: 'Expense deleted' });
}
