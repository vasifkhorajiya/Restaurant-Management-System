import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarCheck, X, Store, Check, Star } from 'lucide-react';
import CustomerLayout from '../../components/CustomerLayout';
import api from '../../services/api';
import { useLive } from '../../context/LiveContext';
import { fmtPlainDate, fmtTime } from '../../utils/format';

const emptyForm = {
  restaurant_id: '',
  party_size: 2,
  reservation_date: '',
  reservation_time: '',
  special_request: '',
};

const statusColor = {
  Pending: 'bg-warning text-dark',
  Confirmed: 'bg-success',
  Cancelled: 'bg-secondary',
  Completed: 'bg-dark',
};

export default function Reservations() {
  const [restaurants, setRestaurants] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [slots, setSlots] = useState(null); // null = not loaded, [] = none
  const [hasTables, setHasTables] = useState(false);

  useLive('reservation:update', () => loadReservations());

  const loadReservations = () => {
    api.get('/reservations/my').then((res) => setReservations(res.data)).catch(() => {
      setReservations([]);
      toast.error('Could not load your reservations');
    });
  };

  useEffect(() => {
    api.get('/restaurants').then((res) => {
      setRestaurants(res.data);
      if (res.data.length === 1) {
        setForm((f) => ({ ...f, restaurant_id: String(res.data[0].id) }));
      }
    }).catch(() => setRestaurants([]));
    loadReservations();
  }, []);

  // live availability: which half-hour slots still have a free table for this party size
  useEffect(() => {
    if (!form.restaurant_id || !form.reservation_date) { setSlots(null); return; }
    api
      .get('/reservations/availability', { params: { restaurant_id: form.restaurant_id, date: form.reservation_date, party_size: form.party_size || 2 } })
      .then((res) => { setSlots(res.data.slots); setHasTables(res.data.has_tables); })
      .catch(() => setSlots(null));
  }, [form.restaurant_id, form.reservation_date, form.party_size]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value, ...(e.target.name === 'reservation_date' || e.target.name === 'party_size' ? { reservation_time: '' } : {}) });
  const pickRestaurant = (id) => setForm({ ...form, restaurant_id: String(id) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.restaurant_id) {
      setError('Pick a restaurant first');
      return;
    }
    if (!form.reservation_time) {
      setError('Pick a time slot');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/reservations', form);
      toast.success('Table requested — we will confirm shortly');
      setForm({ ...emptyForm, restaurant_id: restaurants.length === 1 ? form.restaurant_id : '' });
      loadReservations();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not book a table');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReservation = async (r) => {
    if (!window.confirm('Cancel this reservation?')) return;
    try {
      await api.patch(`/reservations/${r.id}/cancel`);
      toast.success('Reservation cancelled');
      loadReservations();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel');
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <CustomerLayout>
      <h4 className="mb-1">Book a Table</h4>
      <p className="text-muted mb-4" style={{ fontSize: 13.5 }}>
        Prefer eating in? Reserve a table instead of ordering delivery.
      </p>

      <div className="card p-3 mb-4">
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className="form-label">Restaurant</label>
          <div className="row g-2 mb-3">
            {restaurants.map((r) => (
              <div className="col-md-6 col-lg-4" key={r.id}>
                <div
                  className={`restaurant-pick${String(form.restaurant_id) === String(r.id) ? ' selected' : ''}`}
                  onClick={() => pickRestaurant(r.id)}
                >
                  <div className="r-icon"><Store size={19} /></div>
                  <div className="flex-grow-1">
                    <div className="r-name">{r.name}</div>
                    <div className="r-meta">{r.address}</div>
                    <div className="r-meta">{fmtTime(r.opening_time)} – {fmtTime(r.closing_time)}{r.cuisine ? ` · ${r.cuisine}` : ''}</div>
                    {r.avg_rating && <div className="r-meta d-flex align-items-center gap-1" style={{ color: 'var(--rating)', fontWeight: 700 }}><Star size={11} fill="currentColor" /> {Number(r.avg_rating).toFixed(1)} ({r.review_count})</div>}
                  </div>
                  {String(form.restaurant_id) === String(r.id) && <Check size={18} color="var(--brand)" />}
                </div>
              </div>
            ))}
            {restaurants.length === 0 && <p className="text-muted small px-2">No restaurants available yet.</p>}
          </div>

          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Party Size</label>
              <input
                type="number"
                name="party_size"
                min="1"
                max="20"
                className="form-control"
                value={form.party_size}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-4">
              <label className="form-label">Date</label>
              <input
                type="date"
                name="reservation_date"
                min={today}
                className="form-control"
                value={form.reservation_date}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-5">
              <label className="form-label">Time</label>
              {slots === null ? (
                <input type="time" name="reservation_time" className="form-control" value={form.reservation_time} onChange={handleChange} required />
              ) : slots.length === 0 ? (
                <p className="text-muted small mb-0">No bookable slots on this date.</p>
              ) : (
                <div className="slot-grid">
                  {slots.map((sl) => (
                    <button
                      type="button"
                      key={sl.time}
                      disabled={!sl.available}
                      className={`slot-btn${form.reservation_time === sl.time ? ' selected' : ''}`}
                      onClick={() => setForm({ ...form, reservation_time: sl.time })}
                      title={sl.available ? 'Available' : hasTables ? 'Fully booked' : 'Unavailable'}
                    >
                      {sl.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="col-12">
              <label className="form-label">Special Request (optional)</label>
              <input
                name="special_request"
                className="form-control"
                placeholder="Window seat, birthday cake, high chair..."
                value={form.special_request}
                onChange={handleChange}
              />
            </div>
            <div className="col-12">
              <button className="btn btn-dark d-flex align-items-center gap-2" disabled={submitting}>
                <CalendarCheck size={16} /> {submitting ? 'Booking...' : 'Request Table'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <h6 className="mb-3">My Reservations</h6>
      {reservations.length === 0 && <p className="text-muted">No reservations yet.</p>}
      <div className="row g-3">
        {reservations.map((r) => (
          <div className="col-md-6 col-lg-4" key={r.id}>
            <div className="card p-3 h-100">
              <div className="d-flex justify-content-between align-items-start mb-2">
                <h6 className="mb-0">{r.restaurant_name}</h6>
                <span className={`badge ${statusColor[r.status]}`}>{r.status}</span>
              </div>
              <p className="small text-muted mb-1">{r.restaurant_address}</p>
              <p className="mb-1 mono" style={{ fontSize: 13.5 }}>
                {fmtPlainDate(r.reservation_date)} · {fmtTime(r.reservation_time)}
              </p>
              <p className="mb-2 small">Party of {r.party_size}{r.table_no ? ` · Table ${r.table_no}` : ''}</p>
              {r.manager_note && <p className="small mb-2" style={{ color: 'var(--rating)' }}>Restaurant note: {r.manager_note}</p>}
              {r.special_request && <p className="small text-muted mb-2">"{r.special_request}"</p>}
              {['Pending', 'Confirmed'].includes(r.status) && (
                <button
                  className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 mt-auto"
                  onClick={() => cancelReservation(r)}
                >
                  <X size={13} /> Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </CustomerLayout>
  );
}
