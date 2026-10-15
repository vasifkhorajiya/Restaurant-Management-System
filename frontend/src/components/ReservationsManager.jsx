import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, X, CalendarCheck } from 'lucide-react';
import api from '../services/api';
import { useLive } from '../context/LiveContext';
import { fmtPlainDate, fmtTime, todayISO } from '../utils/format';

const STATUSES = ['All', 'Pending', 'Confirmed', 'Completed', 'Cancelled'];
const WHEN = [['upcoming', 'Upcoming'], ['today', 'Today'], ['past', 'Past'], ['all', 'All dates']];

const statusColor = {
  Pending: 'bg-warning text-dark',
  Confirmed: 'bg-success',
  Cancelled: 'bg-secondary',
  Completed: 'bg-dark',
};

export default function ReservationsManager({ apiPrefix }) {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState('All');
  const [when, setWhen] = useState('upcoming');
  const isAdmin = apiPrefix === '/admin';

  const load = () => {
    api
      .get(`${apiPrefix}/reservations`)
      .then((res) => setReservations(res.data))
      .catch(() => {
        setReservations([]);
        toast.error('Could not load reservations');
      });
    api.get(`${apiPrefix}/tables`).then((res) => setTables(res.data)).catch(() => setTables([]));
  };
  useEffect(load, [apiPrefix]);
  useLive('reservation:update', () => load());

  const today = todayISO();
  const filtered = reservations
    .filter((r) => filter === 'All' || r.status === filter)
    .filter((r) => {
      const d = String(r.reservation_date).slice(0, 10);
      return when === 'all' || (when === 'today' ? d === today : when === 'upcoming' ? d >= today : d < today);
    });

  const updateStatus = async (r, status) => {
    let manager_note;
    if (status === 'Cancelled') {
      manager_note = window.prompt('Reason for the customer (optional)') || undefined;
    }
    try {
      await api.patch(`${apiPrefix}/reservations/${r.id}/status`, { status, manager_note });
      toast.success(`Reservation ${status.toLowerCase()}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update reservation');
    }
  };

  const assign = async (r, tableId) => {
    try {
      await api.patch(`${apiPrefix}/reservations/${r.id}/table`, { table_id: tableId || null });
      toast.success('Table assigned');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not assign table');
      load();
    }
  };

  return (
    <div>
      <div className="d-flex gap-2 mb-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filter === s ? 'btn-outline-dark active' : 'btn-outline-dark'}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {WHEN.map(([k, l]) => <button key={k} className={`filter-pill${when === k ? ' active' : ''}`} onClick={() => setWhen(k)}>{l}</button>)}
      </div>

      <div className="row g-3">
        {filtered.map((r) => {
          const options = tables.filter((t) => t.capacity >= r.party_size && t.status !== 'Maintenance' && (!isAdmin || t.restaurant_name === r.restaurant_name));
          return (
            <div className="col-md-6 col-lg-4" key={r.id}>
              <div className="card p-3 h-100">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <CalendarCheck size={16} style={{ color: 'var(--rating)' }} />
                    <span className="fw-semibold" style={{ fontSize: 14 }}>{r.customer_name}</span>
                  </div>
                  <span className={`badge ${statusColor[r.status]}`}>{r.status}</span>
                </div>
                <p className="small text-muted mb-1">{r.customer_phone}{isAdmin && ` · ${r.restaurant_name}`}</p>
                <p className="mb-1 mono" style={{ fontSize: 13.5 }}>{fmtPlainDate(r.reservation_date)} · {fmtTime(r.reservation_time)}</p>
                <p className="mb-2 small">Party of {r.party_size}</p>
                {r.special_request && <p className="small text-muted mb-2">"{r.special_request}"</p>}
                {r.manager_note && <p className="small mb-2" style={{ color: 'var(--rating)' }}>Note sent: {r.manager_note}</p>}

                {['Pending', 'Confirmed'].includes(r.status) && tables.length > 0 && (
                  <select className="form-select form-select-sm mb-2" value={r.table_id || ''} onChange={(e) => assign(r, e.target.value)}>
                    <option value="">No table assigned</option>
                    {options.map((t) => <option key={t.id} value={t.id}>Table {t.table_no} (seats {t.capacity})</option>)}
                  </select>
                )}
                {r.status !== 'Pending' && r.status !== 'Confirmed' && r.table_no && <p className="small mb-2">Table {r.table_no}</p>}

                <div className="d-flex gap-2 flex-wrap mt-auto">
                  {r.status === 'Pending' && (
                    <>
                      <button className="btn btn-sm btn-dark d-flex align-items-center gap-1" onClick={() => updateStatus(r, 'Confirmed')}>
                        <Check size={13} /> Confirm
                      </button>
                      <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => updateStatus(r, 'Cancelled')}>
                        <X size={13} /> Decline
                      </button>
                    </>
                  )}
                  {r.status === 'Confirmed' && (
                    <>
                      <button className="btn btn-sm btn-outline-success" onClick={() => updateStatus(r, 'Completed')}>
                        Mark Seated / Done
                      </button>
                      <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => updateStatus(r, 'Cancelled')}>
                        <X size={13} /> Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-12">
            <p className="text-muted text-center py-5 mb-0">No reservations match these filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
