import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import { Store } from 'lucide-react';
import api from '../../services/api';

const emptyForm = { id: null, name: '', address: '', phone: '', opening_time: '', closing_time: '', description: '', cuisine: '', is_open: true };

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api
      .get('/admin/restaurants')
      .then((res) => setRestaurants(res.data))
      .catch(() => {
        setRestaurants([]);
        toast.error('Could not load restaurants');
      });
  };
  useEffect(load, []);

  const openAdd = () => { setForm(emptyForm); setShowForm(true); setError(''); };
  const openEdit = (r) => {
    setForm({ ...emptyForm, ...r, description: r.description ?? '', cuisine: r.cuisine ?? '', opening_time: String(r.opening_time).slice(0, 5), closing_time: String(r.closing_time).slice(0, 5), is_open: !!r.is_open });
    setShowForm(true);
    setError('');
  };
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.put(`/admin/restaurants/${form.id}`, form);
      else await api.post('/admin/restaurants', form);
      toast.success(form.id ? 'Restaurant updated' : 'Restaurant added');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this restaurant?')) return;
    await api.delete(`/admin/restaurants/${id}`);
    toast.success('Restaurant removed');
    load();
  };

  return (
    <DashboardLayout>
      <PageHeader
        icon={Store}
        title="Restaurant Management"
        subtitle="Add locations, hours, and contact details."
        action={<button className="btn btn-dark" onClick={openAdd}>+ Add Restaurant</button>}
      />

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit Restaurant' : 'Add Restaurant'}</h6>
          {error && <div className="alert alert-danger py-1">{error}</div>}
          <form onSubmit={handleSubmit} className="row g-2">
            <div className="col-md-3">
              <input
                name="name"
                className="form-control"
                placeholder="Restaurant Name"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-4">
              <input name="address" className="form-control" placeholder="Address" value={form.address} onChange={handleChange} required />
            </div>
            <div className="col-md-2">
              <input name="phone" className="form-control" placeholder="Phone" value={form.phone} onChange={handleChange} required />
            </div>
            <div className="col-md-1">
              <input name="opening_time" type="time" className="form-control" value={form.opening_time} onChange={handleChange} required />
            </div>
            <div className="col-md-2">
              <input name="closing_time" type="time" className="form-control" value={form.closing_time} onChange={handleChange} required />
            </div>
            <div className="col-md-3">
              <input name="cuisine" className="form-control" placeholder="Cuisine (e.g. North Indian)" value={form.cuisine} onChange={handleChange} />
            </div>
            <div className="col-md-6">
              <input name="description" className="form-control" maxLength={255} placeholder="One-line description" value={form.description} onChange={handleChange} />
            </div>
            <div className="col-md-3 d-flex align-items-center">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" checked={!!form.is_open} onChange={(e) => setForm({ ...form, is_open: e.target.checked })} />
                <label className="form-check-label small">Accepting orders</label>
              </div>
            </div>
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-dark btn-sm">Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="row g-3">
        {restaurants.map((r) => (
          <div className="col-md-4" key={r.id}>
            <div className="card p-3">
              <div className="d-flex justify-content-between align-items-start">
                <h6>{r.name}</h6>
                <span className={`badge ${r.is_open ? 'bg-success' : 'bg-secondary'}`}>{r.is_open ? 'Open' : 'Paused'}</span>
              </div>
              {r.cuisine && <p className="mb-1 small" style={{ color: 'var(--brand-dark)', fontWeight: 600 }}>{r.cuisine}</p>}
              <p className="mb-1 text-muted small">{r.address}</p>
              <p className="mb-1 small">📞 {r.phone}</p>
              <p className="mb-2 small">🕒 {String(r.opening_time).slice(0, 5)} - {String(r.closing_time).slice(0, 5)}</p>
              <p className="mb-2 small text-muted">{r.order_count} orders{r.avg_rating ? ` · ★ ${Number(r.avg_rating).toFixed(1)}` : ''}</p>
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(r)}>Edit</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {restaurants.length === 0 && <p className="text-muted">No restaurants yet.</p>}
      </div>
    </DashboardLayout>
  );
}
