import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import api from '../services/api';
import { timeAgo } from '../utils/format';
import toast from 'react-hot-toast';
import { useLive } from '../context/LiveContext';
import { useAuth } from '../context/AuthContext';
import { ding } from '../utils/sound';

// Polls every 15s. Used in the customer nav and the admin/manager topbar.
export default function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = () => api.get('/notifications').then((res) => setData(res.data)).catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 60000); // fallback only — real updates arrive instantly below
    return () => clearInterval(t);
  }, []);

  // pushed by the server the moment something happens
  useLive('notification', (n) => {
    load();
    toast(`${n.title}: ${n.message}`, { icon: '🔔', duration: 5000 });
    if (user?.role !== 'user') ding();
  });

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openItem = async (n) => {
    if (!n.is_read) await api.patch(`/notifications/${n.id}/read`).catch(() => {});
    setOpen(false);
    load();
    if (n.link) navigate(n.link);
  };

  const readAll = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    load();
  };

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="notif-btn" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell size={17} />
        {data.unread > 0 && <span className="notif-count">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            {data.unread > 0 && (
              <button className="btn btn-sm btn-link p-0 d-flex align-items-center gap-1" onClick={readAll} style={{ fontSize: 12.5 }}>
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {data.items.length === 0 && <p className="text-muted text-center small py-4 mb-0">You're all caught up.</p>}
            {data.items.map((n) => (
              <button key={n.id} className={`notif-item${n.is_read ? '' : ' unread'}`} onClick={() => openItem(n)}>
                <div className="d-flex justify-content-between gap-2">
                  <span className="t">{n.title}</span>
                  <span className="when">{timeAgo(n.created_at)}</span>
                </div>
                <div className="m">{n.message}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
