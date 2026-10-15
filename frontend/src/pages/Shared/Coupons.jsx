import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Ticket, Pencil, Trash2 } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';

const empty = { id: null, code: '', description: '', discount_type: 'percent', discount_value: 10, min_order: 0, max_discount: '', usage_limit: '', per_user_limit: 1, valid_from: '', valid_until: '', is_active: true, restaurant_id: '' };
const d10 = (v) => (v ? String(v).slice(0, 10) : '');

export default function CouponsPage({ apiPrefix }) {
  const isAdmin = apiPrefix === '/admin';
  const [coupons, setCoupons] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get(`${apiPrefix}/coupons`).then((res) => setCoupons(res.data)).catch(() => toast.error('Could not load coupons'));
  useEffect(() => {
    load();
    if (isAdmin) api.get('/admin/restaurants').then((res) => setRestaurants(res.data)).catch(() => {});
  }, [apiPrefix]);

  const set = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const openEdit = (c) => {
    setForm({ ...empty, ...c, valid_from: d10(c.valid_from), valid_until: d10(c.valid_until), max_discount: c.max_discount ?? '', usage_limit: c.usage_limit ?? '', restaurant_id: c.restaurant_id ?? '' });
    setShowForm(true);
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.put(`${apiPrefix}/coupons/${form.id}`, form);
      else await api.post(`${apiPrefix}/coupons`, form);
      toast.success(form.id ? 'Coupon updated' : 'Coupon created');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const toggle = async (c) => { await api.patch(`${apiPrefix}/coupons/${c.id}/active`, { is_active: !c.is_active }); load(); };
  const remove = async (c) => {
    if (!window.confirm(`Delete coupon ${c.code}?`)) return;
    await api.delete(`${apiPrefix}/coupons/${c.id}`);
    toast.success('Coupon deleted');
    load();
  };

  const expired = (c) => c.valid_until && d10(c.valid_until) < new Date().toISOString().slice(0, 10);

  return (
    <DashboardLayout>
      <PageHeader
        icon={Ticket}
        title="Coupons & Offers"
        subtitle={isAdmin ? 'Discount codes for any restaurant — or all of them.' : 'Discount codes for your restaurant.'}
        action={<button className="btn btn-dark" onClick={() => { setForm(empty); setShowForm(true); setError(''); }}>+ New Coupon</button>}
      />

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit Coupon' : 'New Coupon'}</h6>
          {error && <div className="alert alert-danger py-1">{error}</div>}
          <form onSubmit={submit} className="row g-2">
            <div className="col-md-3"><label className="form-label">Code</label><input name="code" className="form-control" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></div>
            <div className="col-md-5"><label className="form-label">Description</label><input name="description" className="form-control" value={form.description || ''} onChange={set} /></div>
            {isAdmin && (
              <div className="col-md-4">
                <label className="form-label">Valid at</label>
                <select name="restaurant_id" className="form-control" value={form.restaurant_id} onChange={set}>
                  <option value="">All restaurants</option>
                  {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            <div className="col-md-2"><label className="form-label">Type</label>
              <select name="discount_type" className="form-control" value={form.discount_type} onChange={set}><option value="percent">Percent %</option><option value="flat">Flat ₹</option></select>
            </div>
            <div className="col-md-2"><label className="form-label">Value</label><input type="number" min="1" name="discount_value" className="form-control" value={form.discount_value} onChange={set} required /></div>
            <div className="col-md-2"><label className="form-label">Min order ₹</label><input type="number" min="0" name="min_order" className="form-control" value={form.min_order} onChange={set} /></div>
            <div className="col-md-2"><label className="form-label">Max discount ₹</label><input type="number" min="0" name="max_discount" className="form-control" placeholder="none" value={form.max_discount} onChange={set} /></div>
            <div className="col-md-2"><label className="form-label">Total uses</label><input type="number" min="1" name="usage_limit" className="form-control" placeholder="unlimited" value={form.usage_limit} onChange={set} /></div>
            <div className="col-md-2"><label className="form-label">Per customer</label><input type="number" min="1" name="per_user_limit" className="form-control" value={form.per_user_limit} onChange={set} /></div>
            <div className="col-md-3"><label className="form-label">Valid from</label><input type="date" name="valid_from" className="form-control" value={form.valid_from} onChange={set} /></div>
            <div className="col-md-3"><label className="form-label">Valid until</label><input type="date" name="valid_until" className="form-control" value={form.valid_until} onChange={set} /></div>
            <div className="col-md-3 d-flex align-items-end"><label className="d-flex align-items-center gap-2 mb-2"><input type="checkbox" name="is_active" checked={!!form.is_active} onChange={set} /> Active</label></div>
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-dark">Save</button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="table-responsive">
          <table className="table align-middle mb-0">
            <thead><tr><th>Code</th><th>Offer</th>{isAdmin && <th>Restaurant</th>}<th>Used</th><th>Valid until</th><th>Status</th><th /></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td><strong style={{ fontFamily: 'var(--font-display)' }}>{c.code}</strong><div className="text-muted small">{c.description}</div></td>
                  <td>{c.discount_type === 'percent' ? `${Number(c.discount_value)}% off` : `₹${Number(c.discount_value)} off`}
                    <div className="text-muted small">min ₹{Number(c.min_order)}{c.max_discount ? `, max ₹${Number(c.max_discount)}` : ''}</div></td>
                  {isAdmin && <td>{c.restaurant_name || 'All'}</td>}
                  <td>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
                  <td>{c.valid_until ? d10(c.valid_until) : '—'}</td>
                  <td>
                    {expired(c) ? <span className="badge bg-secondary">Expired</span>
                      : <button className={`badge border-0 ${c.is_active ? 'bg-success' : 'bg-secondary'}`} onClick={() => toggle(c)}>{c.is_active ? 'Active' : 'Paused'}</button>}
                  </td>
                  <td className="text-end">
                    <button className="btn btn-sm btn-outline-dark me-1" onClick={() => openEdit(c)}><Pencil size={13} /></button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => remove(c)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
              {coupons.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">No coupons yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
