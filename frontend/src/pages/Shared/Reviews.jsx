import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Star } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import StarRating from '../../components/StarRating';
import api from '../../services/api';
import { fmtDateTime, orderNo } from '../../utils/format';

export default function ReviewsPage({ apiPrefix }) {
  const [data, setData] = useState({ summary: { total: 0, average: 0 }, items: [] });
  const [filter, setFilter] = useState('all');
  const [replying, setReplying] = useState(null);
  const [text, setText] = useState('');

  const load = () => api.get(`${apiPrefix}/reviews`).then((res) => setData(res.data)).catch(() => toast.error('Could not load reviews'));
  useEffect(() => { load(); }, [apiPrefix]);

  const send = async (id) => {
    try {
      await api.post(`${apiPrefix}/reviews/${id}/reply`, { reply: text });
      toast.success('Reply posted');
      setReplying(null);
      setText('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not post reply');
    }
  };

  const items = data.items.filter((r) => filter === 'all' || (filter === 'low' ? r.rating <= 2 : filter === 'unanswered' ? !r.admin_reply : r.rating === Number(filter)));
  const dist = [5, 4, 3, 2, 1].map((s) => ({ s, n: data.items.filter((r) => r.rating === s).length }));

  return (
    <DashboardLayout>
      <PageHeader icon={Star} title="Customer Reviews" subtitle="What diners say — and your chance to reply." />

      <div className="row g-3 mb-3">
        <div className="col-md-4">
          <div className="card p-3 text-center h-100">
            <div className="text-muted small">Average rating</div>
            <div className="fs-2 fw-bold">{Number(data.summary.average).toFixed(1)}</div>
            <div><StarRating value={Number(data.summary.average)} size={18} /></div>
            <div className="text-muted small mt-1">{data.summary.total} review{data.summary.total === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div className="col-md-8">
          <div className="card p-3 h-100">
            {dist.map(({ s, n }) => (
              <div key={s} className="d-flex align-items-center gap-2 mb-1" style={{ fontSize: 13 }}>
                <span style={{ width: 24 }}>{s}★</span>
                <div className="rank-track flex-grow-1 mt-0"><div className="rank-fill" style={{ width: `${data.items.length ? (n / data.items.length) * 100 : 0}%`, background: '#ffc72c' }} /></div>
                <span style={{ width: 28, textAlign: 'right' }}>{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="d-flex gap-2 mb-3 flex-wrap">
        {[['all', 'All'], ['unanswered', 'Needs reply'], ['low', '1-2 stars'], ['5', '5 stars']].map(([k, l]) => (
          <button key={k} className={`filter-pill${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="d-flex flex-column gap-3">
        {items.map((r) => (
          <div key={r.id} className="card review-card">
            <div className="d-flex justify-content-between flex-wrap gap-2">
              <div><strong>{r.customer_name}</strong> <StarRating value={r.rating} size={14} />
                <span className="text-muted ms-2" style={{ fontSize: 12.5 }}>{orderNo(r.order_id)} · {r.restaurant_name}</span></div>
              <span className="text-muted" style={{ fontSize: 12.5 }}>{fmtDateTime(r.created_at)}</span>
            </div>
            {r.review ? <p className="mb-0 mt-2" style={{ fontSize: 14 }}>{r.review}</p> : <p className="text-muted mb-0 mt-2 small">No written review.</p>}
            {r.admin_reply && <div className="review-reply"><strong>Your reply:</strong> {r.admin_reply}</div>}
            {replying === r.id ? (
              <div className="d-flex gap-2 mt-2">
                <input className="form-control form-control-sm" autoFocus placeholder="Write a reply…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
                <button className="btn btn-sm btn-dark" onClick={() => send(r.id)}>Send</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setReplying(null)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-sm btn-outline-dark mt-2 align-self-start" onClick={() => { setReplying(r.id); setText(r.admin_reply || ''); }}>
                {r.admin_reply ? 'Edit reply' : 'Reply'}
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-muted text-center py-4">No reviews to show.</p>}
      </div>
    </DashboardLayout>
  );
}
