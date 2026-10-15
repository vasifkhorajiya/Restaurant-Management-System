import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, Trash2, Download } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import { DonutChart } from '../../components/Charts';
import api from '../../services/api';
import { exportCsv } from '../../utils/exportCsv';
import { inr, todayISO } from '../../utils/format';

export default function ExpensesPage({ apiPrefix }) {
  const isAdmin = apiPrefix === '/admin';
  const monthStart = `${todayISO().slice(0, 8)}01`;
  const [range, setRange] = useState({ from: monthStart, to: todayISO() });
  const [data, setData] = useState({ items: [], byCategory: [], categories: [], total: 0, revenue: 0, profit: 0 });
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState({ category: 'Ingredients', amount: '', note: '', spent_on: todayISO(), restaurant_id: '' });

  const load = () => api.get(`${apiPrefix}/expenses`, { params: range }).then((r) => setData(r.data)).catch(() => toast.error('Could not load expenses'));
  useEffect(() => { load(); }, [apiPrefix, range]);
  useEffect(() => { if (isAdmin) api.get('/admin/restaurants').then((r) => setRestaurants(r.data)).catch(() => {}); }, [isAdmin]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post(`${apiPrefix}/expenses`, form);
      toast.success('Expense recorded');
      setForm({ ...form, amount: '', note: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Could not save'); }
  };
  const remove = async (id) => { if (window.confirm('Delete this expense?')) { await api.delete(`${apiPrefix}/expenses/${id}`); load(); } };

  return (
    <DashboardLayout>
      <PageHeader icon={Receipt} title="Expenses & Profit" subtitle="Record what you spend and see real profit, not just sales."
        action={<button className="btn btn-outline-dark d-flex align-items-center gap-1" onClick={() => exportCsv('expenses.csv', [
          { key: 'spent_on', label: 'Date' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount' }, { key: 'note', label: 'Note' },
        ], data.items)}><Download size={14} /> CSV</button>} />

      <div className="d-flex gap-2 align-items-center mb-3 flex-wrap">
        <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span className="text-muted">to</span>
        <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>

      <div className="row g-3 mb-3">
        {[['Revenue (completed)', inr(data.revenue), 'var(--rating)'], ['Expenses', inr(data.total), 'var(--danger)'], ['Net profit', inr(data.profit), data.profit >= 0 ? 'var(--rating)' : 'var(--danger)']].map(([l, v, c]) => (
          <div className="col-md-4" key={l}><div className="card p-3 text-center"><div className="text-muted small">{l}</div><div className="fs-3 fw-bold" style={{ color: c }}>{v}</div></div></div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <form onSubmit={add} className="card p-3 mb-3">
            <h6>Add expense</h6>
            {isAdmin && <select className="form-select form-select-sm mb-2" value={form.restaurant_id} onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })} required><option value="">Restaurant…</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
            <select className="form-select form-select-sm mb-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{(data.categories.length ? data.categories : ['Ingredients']).map((c) => <option key={c}>{c}</option>)}</select>
            <input type="number" min="1" step="0.01" className="form-control form-control-sm mb-2" placeholder="Amount ₹" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <input type="date" className="form-control form-control-sm mb-2" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} />
            <input className="form-control form-control-sm mb-2" placeholder="Note (e.g. vendor, bill no.)" maxLength={255} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className="btn btn-dark btn-sm">Save expense</button>
          </form>
          <div className="card chart-card"><h6>By category</h6><DonutChart prefix="₹" data={data.byCategory} /></div>
        </div>
        <div className="col-lg-8">
          <div className="card"><div className="table-responsive"><table className="table align-middle mb-0">
            <thead><tr><th>Date</th><th>Category</th>{isAdmin && <th>Restaurant</th>}<th>Note</th><th className="text-end">Amount</th><th /></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}><td>{String(e.spent_on).slice(0, 10)}</td><td><span className="badge bg-secondary">{e.category}</span></td>{isAdmin && <td>{e.restaurant_name}</td>}<td className="text-muted small">{e.note}</td><td className="text-end">{inr(e.amount)}</td>
                  <td className="text-end"><button className="btn btn-sm btn-link text-danger p-0" onClick={() => remove(e.id)}><Trash2 size={14} /></button></td></tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">No expenses in this range.</td></tr>}
            </tbody></table></div></div>
        </div>
      </div>
    </DashboardLayout>
  );
}
