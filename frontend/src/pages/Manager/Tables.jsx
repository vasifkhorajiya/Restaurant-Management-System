import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Armchair, Trash2, Users } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';

const STATUSES = ['Available', 'Occupied', 'Reserved', 'Maintenance'];

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState({ table_no: '', capacity: 4 });

  const load = () => api.get('/manager/tables').then((res) => setTables(res.data)).catch(() => toast.error('Could not load tables'));
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post('/manager/tables', form);
      toast.success('Table added');
      setForm({ table_no: '', capacity: 4 });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add table');
    }
  };

  const update = async (t, patch) => {
    try {
      await api.put(`/manager/tables/${t.id}`, { table_no: t.table_no, capacity: t.capacity, status: t.status, ...patch });
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update table');
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Remove table ${t.table_no}?`)) return;
    await api.delete(`/manager/tables/${t.id}`);
    load();
  };

  const seats = tables.reduce((s, t) => s + t.capacity, 0);

  return (
    <DashboardLayout>
      <PageHeader icon={Armchair} title="Tables" subtitle={`${tables.length} tables · ${seats} seats. Online bookings are matched to a free table automatically.`} />
      <form onSubmit={add} className="card p-3 mb-3 row g-2 flex-row align-items-end mx-0">
        <div className="col-md-3"><label className="form-label">Table no.</label><input className="form-control" value={form.table_no} onChange={(e) => setForm({ ...form, table_no: e.target.value })} placeholder="T1" required /></div>
        <div className="col-md-3"><label className="form-label">Seats</label><input type="number" min="1" max="30" className="form-control" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required /></div>
        <div className="col-md-2"><button className="btn btn-dark w-100">+ Add Table</button></div>
      </form>
      <div className="row g-3">
        {tables.map((t) => (
          <div className="col-6 col-md-4 col-lg-3" key={t.id}>
            <div className={`table-tile ${t.status}`}>
              <div className="d-flex justify-content-between align-items-start">
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{t.table_no}</strong>
                <button className="btn btn-sm btn-link text-danger p-0" onClick={() => remove(t)}><Trash2 size={14} /></button>
              </div>
              <div className="text-muted d-flex align-items-center gap-1 mb-2" style={{ fontSize: 13 }}><Users size={13} /> Seats {t.capacity}</div>
              <select className="form-select form-select-sm" value={t.status} onChange={(e) => update(t, { status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        ))}
        {tables.length === 0 && <p className="text-muted">No tables yet. Add your first one above — until you do, any time slot can be booked.</p>}
      </div>
    </DashboardLayout>
  );
}
