import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Trash2 } from 'lucide-react';
import CustomerLayout from '../../components/CustomerLayout';
import EmptyState from '../../components/EmptyState';
import api from '../../services/api';
import { timeAgo } from '../../utils/format';

export default function Notifications() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const navigate = useNavigate();
  const load = () => api.get('/notifications').then((res) => setData(res.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const open = async (n) => {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    if (n.link) navigate(n.link); else load();
  };
  const clear = async () => { await api.delete('/notifications'); load(); };

  return (
    <CustomerLayout>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Notifications</h4>
        {data.items.length > 0 && <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={clear}><Trash2 size={13} /> Clear all</button>}
      </div>
      {data.items.length === 0 ? (
        <EmptyState icon={Bell} title="Nothing here yet" text="Order updates and offers will show up here." />
      ) : (
        <div className="card">
          {data.items.map((n) => (
            <button key={n.id} className={`notif-item${n.is_read ? '' : ' unread'}`} onClick={() => open(n)}>
              <div className="d-flex justify-content-between gap-2"><span className="t">{n.title}</span><span className="when">{timeAgo(n.created_at)}</span></div>
              <div className="m">{n.message}</div>
            </button>
          ))}
        </div>
      )}
    </CustomerLayout>
  );
}
