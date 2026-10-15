import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import { UserCog } from 'lucide-react';
import api from '../../services/api';
import PhoneInput from '../../components/PhoneInput';
import GmailField from '../../components/GmailField';

const emptyForm = { id: null, name: '', email: '', phone: '', password: '', restaurant_id: '' };

export default function Managers() {
  const [managers, setManagers] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const loadData = () => {
    api
      .get('/admin/managers')
      .then((res) => setManagers(res.data))
      .catch(() => {
        setManagers([]);
        toast.error('Could not load managers');
      });
    api.get('/admin/restaurants').then((res) => setRestaurants(res.data)).catch(() => setRestaurants([]));
  };

  useEffect(loadData, []);

  const filtered = managers.filter(
    (m) => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm(emptyForm);
    setShowForm(true);
    setError('');
  };

  const openEdit = (m) => {
    setForm({ id: m.id, name: m.name, email: m.email, phone: m.phone, password: '', restaurant_id: m.restaurant_id || '' });
    setShowForm(true);
    setError('');
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) {
        await api.put(`/admin/managers/${form.id}`, form);
      } else {
        await api.post('/admin/managers', form);
      }
      toast.success(form.id ? 'Manager updated' : 'Manager created');
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this manager?')) return;
    await api.delete(`/admin/managers/${id}`);
    toast.success('Manager removed');
    loadData();
  };

  const restaurantName = (id) => restaurants.find((r) => r.id === id)?.name || '—';

  return (
    <DashboardLayout>
      <PageHeader
        icon={UserCog}
        title="Manager Management"
        subtitle="Assign a manager to each restaurant."
        action={<button className="btn btn-dark" onClick={openAdd}>+ Add Manager</button>}
      />

      <input
        className="form-control mb-3"
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit Manager' : 'Add Manager'}</h6>
          {error && <div className="alert alert-danger py-1">{error}</div>}
          <form onSubmit={handleSubmit} className="row g-2">
            <div className="col-md-3">
              <input name="name" className="form-control" placeholder="Name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="col-md-3">
              <GmailField value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="Gmail address" required />
            </div>
            <div className="col-md-6">
              <PhoneInput key={form.id || 'new'} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
            </div>
            <div className="col-md-2">
              <input
                name="password"
                type="password"
                className="form-control"
                placeholder={form.id ? 'New password' : 'Password'}
                value={form.password}
                onChange={handleChange}
                required={!form.id}
              />
            </div>
            <div className="col-md-2">
              <select name="restaurant_id" className="form-select" value={form.restaurant_id} onChange={handleChange} required>
                <option value="">Assign Restaurant</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-dark btn-sm">Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <table className="table bg-white">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Phone</th><th>Restaurant</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.email}</td>
              <td>{m.phone}</td>
              <td>{restaurantName(m.restaurant_id)}</td>
              <td className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(m)}>Edit</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(m.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="text-center text-muted">No managers found</td></tr>
          )}
        </tbody>
      </table>
    </DashboardLayout>
  );
}
