import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Boxes, AlertTriangle, Plus, Minus, Pencil, Trash2, History } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';
import { exportCsv } from '../../utils/exportCsv';
import { fmtDateTime } from '../../utils/format';

const empty = { id: null, name: '', unit: 'kg', quantity: 0, reorder_level: 0, cost_per_unit: 0, supplier: '', restaurant_id: '' };

export default function InventoryPage({ apiPrefix }) {
  const isAdmin = apiPrefix === '/admin';
  const [items, setItems] = useState([]);
  const [logs, setLogs] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const load = () => {
    api.get(`${apiPrefix}/inventory`).then((res) => setItems(res.data)).catch(() => toast.error('Could not load inventory'));
    api.get(`${apiPrefix}/inventory/logs`).then((res) => setLogs(res.data)).catch(() => {});
  };
  useEffect(() => {
    load();
    if (isAdmin) api.get('/admin/restaurants').then((res) => { setRestaurants(res.data); }).catch(() => {});
  }, [apiPrefix]);

  const set = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (form.id) await api.put(`${apiPrefix}/inventory/${form.id}`, form);
      else await api.post(`${apiPrefix}/inventory`, form);
      toast.success(form.id ? 'Item updated' : 'Item added');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const adjust = async (item, sign) => {
    const raw = window.prompt(`${sign > 0 ? 'Add' : 'Remove'} how many ${item.unit} of ${item.name}?`);
    if (raw === null) return;
    const n = Number(raw);
    if (!n || n < 0) return toast.error('Enter a positive number');
    const reason = window.prompt('Reason (optional)', sign > 0 ? 'Restock' : 'Used / wasted') || undefined;
    try {
      await api.patch(`${apiPrefix}/inventory/${item.id}/adjust`, { change: sign * n, reason });
      toast.success('Stock updated');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update stock');
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Remove ${item.name} from inventory?`)) return;
    await api.delete(`${apiPrefix}/inventory/${item.id}`);
    load();
  };

  const lowCount = items.filter((i) => i.is_low).length;
  const value = items.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_per_unit), 0);
  const shown = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())).filter((i) => !lowOnly || i.is_low);

  return (
    <DashboardLayout>
      <PageHeader
        icon={Boxes}
        title="Inventory"
        subtitle="Ingredients and supplies — get warned before you run out."
        action={
          <div className="d-flex gap-2">
            <button className="btn btn-outline-dark" onClick={() => exportCsv('inventory.csv', [
              { key: 'name', label: 'Item' }, { key: 'unit', label: 'Unit' }, { key: 'quantity', label: 'Quantity' },
              { key: 'reorder_level', label: 'Reorder level' }, { key: 'cost_per_unit', label: 'Cost / unit' }, { key: 'supplier', label: 'Supplier' },
            ], items)}>Export CSV</button>
            <button className="btn btn-dark" onClick={() => { setForm({ ...empty, restaurant_id: restaurants[0]?.id || '' }); setShowForm(true); setError(''); }}>+ Add Item</button>
          </div>
        }
      />

      <div className="row g-3 mb-3">
        <div className="col-6 col-md-3"><div className="card p-3"><div className="text-muted small">Items tracked</div><div className="fs-4 fw-bold">{items.length}</div></div></div>
        <div className="col-6 col-md-3"><div className="card p-3"><div className="text-muted small">Low stock</div><div className="fs-4 fw-bold" style={{ color: lowCount ? 'var(--danger)' : 'var(--rating)' }}>{lowCount}</div></div></div>
        <div className="col-6 col-md-3"><div className="card p-3"><div className="text-muted small">Stock value</div><div className="fs-4 fw-bold">₹{Math.round(value).toLocaleString('en-IN')}</div></div></div>
      </div>

      {lowCount > 0 && (
        <div className="alert alert-warning d-flex align-items-center gap-2 py-2">
          <AlertTriangle size={16} /> {lowCount} item{lowCount > 1 ? 's are' : ' is'} at or below the reorder level.
        </div>
      )}

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit Item' : 'Add Inventory Item'}</h6>
          {error && <div className="alert alert-danger py-1">{error}</div>}
          <form onSubmit={submit} className="row g-2">
            {isAdmin && !form.id && (
              <div className="col-md-3"><label className="form-label">Restaurant</label>
                <select name="restaurant_id" className="form-control" value={form.restaurant_id} onChange={set} required>
                  <option value="">Select…</option>{restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
            )}
            <div className="col-md-3"><label className="form-label">Name</label><input name="name" className="form-control" value={form.name} onChange={set} required /></div>
            <div className="col-md-2"><label className="form-label">Unit</label><input name="unit" className="form-control" value={form.unit} onChange={set} placeholder="kg, L, pcs" /></div>
            {!form.id && <div className="col-md-2"><label className="form-label">Opening qty</label><input type="number" step="0.01" min="0" name="quantity" className="form-control" value={form.quantity} onChange={set} /></div>}
            <div className="col-md-2"><label className="form-label">Reorder level</label><input type="number" step="0.01" min="0" name="reorder_level" className="form-control" value={form.reorder_level} onChange={set} /></div>
            <div className="col-md-2"><label className="form-label">Cost / unit ₹</label><input type="number" step="0.01" min="0" name="cost_per_unit" className="form-control" value={form.cost_per_unit} onChange={set} /></div>
            <div className="col-md-3"><label className="form-label">Supplier</label><input name="supplier" className="form-control" value={form.supplier || ''} onChange={set} /></div>
            <div className="col-12 d-flex gap-2"><button className="btn btn-dark">Save</button><button type="button" className="btn btn-outline-secondary" onClick={() => setShowForm(false)}>Cancel</button></div>
          </form>
        </div>
      )}

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <input className="form-control" style={{ maxWidth: 260 }} placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className={`filter-pill${lowOnly ? ' active' : ''}`} onClick={() => setLowOnly((v) => !v)}><AlertTriangle size={13} /> Low stock only</button>
        <button className={`filter-pill${showLogs ? ' active' : ''}`} onClick={() => setShowLogs((v) => !v)}><History size={13} /> History</button>
      </div>

      {showLogs ? (
        <div className="card"><div className="table-responsive"><table className="table table-sm mb-0">
          <thead><tr><th>When</th><th>Item</th><th>Change</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}><td>{fmtDateTime(l.created_at)}</td><td>{l.name}</td>
                <td style={{ color: l.change_qty > 0 ? 'var(--rating)' : 'var(--danger)', fontWeight: 700 }}>{l.change_qty > 0 ? '+' : ''}{Number(l.change_qty)} {l.unit}</td>
                <td>{l.reason}</td><td>{l.user_name || '—'}</td></tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-3">No stock movements yet.</td></tr>}
          </tbody></table></div></div>
      ) : (
        <div className="card"><div className="table-responsive"><table className="table align-middle mb-0">
          <thead><tr><th>Item</th>{isAdmin && <th>Restaurant</th>}<th>In stock</th><th>Level</th><th>Cost</th><th>Supplier</th><th /></tr></thead>
          <tbody>
            {shown.map((i) => {
              const pct = Math.min(100, (Number(i.quantity) / Math.max(Number(i.reorder_level) * 3, 1)) * 100);
              return (
                <tr key={i.id} className={i.is_low ? 'low-stock' : ''}>
                  <td><strong>{i.name}</strong>{i.is_low ? <AlertTriangle size={13} className="ms-2" color="var(--danger)" /> : null}</td>
                  {isAdmin && <td>{i.restaurant_name}</td>}
                  <td className="mono">{Number(i.quantity)} {i.unit}</td>
                  <td><div className={`stock-bar${i.is_low ? ' low' : ''}`}><div style={{ width: `${pct}%` }} /></div><div className="text-muted" style={{ fontSize: 11 }}>reorder at {Number(i.reorder_level)}</div></td>
                  <td>₹{Number(i.cost_per_unit)}/{i.unit}</td>
                  <td>{i.supplier || '—'}</td>
                  <td className="text-end text-nowrap">
                    <button className="btn btn-sm btn-outline-success me-1" title="Add stock" onClick={() => adjust(i, 1)}><Plus size={13} /></button>
                    <button className="btn btn-sm btn-outline-warning me-1" title="Use / waste" onClick={() => adjust(i, -1)}><Minus size={13} /></button>
                    <button className="btn btn-sm btn-outline-dark me-1" onClick={() => { setForm({ ...empty, ...i, supplier: i.supplier || '' }); setShowForm(true); setError(''); }}><Pencil size={13} /></button>
                    <button className="btn btn-sm btn-outline-danger" onClick={() => remove(i)}><Trash2 size={13} /></button>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">Nothing to show.</td></tr>}
          </tbody></table></div></div>
      )}
    </DashboardLayout>
  );
}
