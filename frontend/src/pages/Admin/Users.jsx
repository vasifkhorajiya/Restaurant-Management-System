import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import { Users as UsersIcon, Download, History } from 'lucide-react';
import { Modal } from 'react-bootstrap';
import { exportCsv } from '../../utils/exportCsv';
import { inr, orderNo, fmtDateTime, fmtDate } from '../../utils/format';
import api from '../../services/api';
import PhoneInput from '../../components/PhoneInput';
import GmailField from '../../components/GmailField';

const emptyForm = { id: null, name: '', email: '', phone: '', password: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | active | blocked
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(null); // { user, orders }

  const loadUsers = () => {
    api
      .get('/admin/users')
      .then((res) => setUsers(res.data))
      .catch(() => {
        setUsers([]);
        toast.error('Could not load users');
      });
  };

  useEffect(loadUsers, []);

  const securityAction = async (u, what, label) => {
    if (!window.confirm(`${label} for ${u.name}?`)) return;
    try { toast.success((await api.post(`/admin/users/${u.id}/${what}`)).data.message); loadUsers(); }
    catch { toast.error('Action failed'); }
  };

  const openHistory = async (u) => {
    try {
      const res = await api.get(`/admin/users/${u.id}/orders`);
      setHistory({ user: u, orders: res.data });
    } catch {
      toast.error('Could not load order history');
    }
  };

  const filtered = users
    .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    .filter((u) => statusFilter === 'all' || u.status === statusFilter);

  const openAdd = () => {
    setForm(emptyForm);
    setShowForm(true);
    setError('');
  };

  const openEdit = (u) => {
    setForm({ id: u.id, name: u.name, email: u.email, phone: u.phone, password: '' });
    setShowForm(true);
    setError('');
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) {
        await api.put(`/admin/users/${form.id}`, form);
      } else {
        await api.post('/admin/users', form);
      }
      toast.success(form.id ? 'User updated' : 'User created');
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user?')) return;
    await api.delete(`/admin/users/${id}`);
    toast.success('User deleted');
    loadUsers();
  };

  const toggleBlock = async (u) => {
    const nextStatus = u.status === 'active' ? 'blocked' : 'active';
    await api.patch(`/admin/users/${u.id}/status`, { status: nextStatus });
    toast.success(nextStatus === 'blocked' ? 'User blocked' : 'User unblocked');
    loadUsers();
  };

  return (
    <DashboardLayout>
      <PageHeader
        icon={UsersIcon}
        title="User Management"
        subtitle="Customer accounts — search, edit, block, or remove."
        action={
          <div className="d-flex gap-2">
            <button className="btn btn-outline-dark d-flex align-items-center gap-1" onClick={() => exportCsv('customers.csv', [
              { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'order_count', label: 'Orders' },
              { key: 'total_spent', label: 'Total spent' }, { key: 'loyalty_points', label: 'Points' }, { key: 'status', label: 'Status' },
            ], filtered)}><Download size={14} /> CSV</button>
            <button className="btn btn-dark" onClick={openAdd}>+ Add User</button>
          </div>
        }
      />

      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <input
            className="form-control"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit User' : 'Add User'}</h6>
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
            <div className="col-md-3">
              <input
                name="password"
                type="password"
                className="form-control"
                placeholder={form.id ? 'New password (optional)' : 'Password'}
                value={form.password}
                onChange={handleChange}
                required={!form.id}
              />
            </div>
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-dark btn-sm">Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <table className="table bg-white">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Orders</th>
            <th>Spent</th>
            <th>Points</th>
            <th>Last login</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.phone}</td>
              <td>{u.order_count}</td>
              <td>{inr(u.total_spent)}</td>
              <td>{u.loyalty_points}</td>
              <td>{u.last_login ? fmtDate(u.last_login) : '—'}</td>
              <td>
                <span className={`badge ${u.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                  {u.status}
                </span>
              </td>
              <td className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-warning" title="Unlock account (clears failed-login lock)" onClick={() => securityAction(u, 'unlock', 'Unlock account')}>🔓</button>
                <button className="btn btn-sm btn-outline-danger" title="Sign out of every device" onClick={() => securityAction(u, 'force-logout', 'Sign out everywhere')}>⏻</button>
                <button className="btn btn-sm btn-outline-secondary" title="Order history" onClick={() => openHistory(u)}><History size={13} /></button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(u)}>Edit</button>
                <button className="btn btn-sm btn-outline-warning" onClick={() => toggleBlock(u)}>
                  {u.status === 'active' ? 'Block' : 'Unblock'}
                </button>
                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(u.id)}>Delete</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-muted">No users found</td>
            </tr>
          )}
        </tbody>
      </table>
      <Modal show={!!history} onHide={() => setHistory(null)} centered scrollable>
        {history && (
          <>
            <Modal.Header closeButton><Modal.Title style={{ fontSize: 16 }}>{history.user.name} — orders</Modal.Title></Modal.Header>
            <Modal.Body>
              {history.orders.length === 0 && <p className="text-muted mb-0">No orders yet.</p>}
              {history.orders.map((o) => (
                <div key={o.id} className="d-flex justify-content-between border-bottom py-2 small">
                  <span><strong>{orderNo(o.id)}</strong> · {o.restaurant_name}<br /><span className="text-muted">{fmtDateTime(o.created_at)} · {o.order_type}</span></span>
                  <span className="text-end"><strong>{inr(o.total_amount)}</strong><br /><span className="badge bg-secondary">{o.status}</span></span>
                </div>
              ))}
            </Modal.Body>
          </>
        )}
      </Modal>
    </DashboardLayout>
  );
}
