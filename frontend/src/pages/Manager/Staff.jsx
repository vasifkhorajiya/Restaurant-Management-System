import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import { ChefHat } from 'lucide-react';
import api from '../../services/api';
import PhoneInput from '../../components/PhoneInput';

const emptyForm = { id: null, name: '', email: '', phone: '', position: '', shift: 'Flexible', salary: '', is_active: true, joined_on: '' };

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/manager/staff').then((res) => setStaff(res.data)).catch(() => { setStaff([]); toast.error('Could not load staff'); });
  };
  useEffect(load, []);

  const openAdd = () => { setForm(emptyForm); setShowForm(true); setError(''); };
  const openEdit = (s) => {
    setForm({ ...emptyForm, ...s, email: s.email ?? '', phone: s.phone ?? '', salary: s.salary ?? '', joined_on: s.joined_on ? String(s.joined_on).slice(0, 10) : '', is_active: !!s.is_active });
    setShowForm(true);
    setError('');
  };
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.put(`/manager/staff/${form.id}`, form);
      else await api.post('/manager/staff', form);
      toast.success(form.id ? 'Staff updated' : 'Staff added');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this staff member?')) return;
    await api.delete(`/manager/staff/${id}`);
    toast.success('Staff removed');
    load();
  };

  return (
    <DashboardLayout>
      <PageHeader
        icon={ChefHat}
        title="Staff Management"
        subtitle="Your kitchen and floor team."
        action={<button className="btn btn-dark" onClick={openAdd}>+ Add Staff</button>}
      />

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit Staff' : 'Add Staff'}</h6>
          {error && <div className="alert alert-danger py-1">{error}</div>}
          <form onSubmit={handleSubmit} className="row g-2">
            <div className="col-md-3">
              <input name="name" className="form-control" placeholder="Name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="col-md-3">
              <input
                name="email"
                type="email"
                className="form-control"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-6">
              <PhoneInput key={form.id || 'new'} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            </div>
            <div className="col-md-3">
              <input
                name="position"
                className="form-control"
                placeholder="Position (e.g. Chef, Waiter)"
                value={form.position}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-3">
              <select name="shift" className="form-select" value={form.shift} onChange={handleChange}>
                <option>Morning</option><option>Evening</option><option>Night</option><option>Flexible</option>
              </select>
            </div>
            <div className="col-md-3">
              <input name="salary" type="number" min="0" className="form-control" placeholder="Monthly salary ₹" value={form.salary} onChange={handleChange} />
            </div>
            <div className="col-md-3">
              <input name="joined_on" type="date" className="form-control" title="Joining date" value={form.joined_on} onChange={handleChange} />
            </div>
            <div className="col-md-3 d-flex align-items-center">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <label className="form-check-label small">Currently working</label>
              </div>
            </div>
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-dark btn-sm">Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <table className="table bg-white">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Position</th><th>Shift</th><th>Salary</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td><td>{s.email}</td><td>{s.phone}</td><td>{s.position}</td>
              <td>{s.shift}</td><td>{s.salary ? `₹${Number(s.salary).toLocaleString('en-IN')}` : '—'}</td>
              <td><span className={`badge ${s.is_active ? 'bg-success' : 'bg-secondary'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
              <td className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(s)}>Edit</button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(s.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {staff.length === 0 && <tr><td colSpan={8} className="text-center text-muted">No staff yet</td></tr>}
        </tbody>
      </table>
    </DashboardLayout>
  );
}
