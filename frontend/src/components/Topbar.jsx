import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import LiveBadge from './LiveBadge';

// Used by Admin/Manager back-office pages only.
export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="topbar d-flex justify-content-between align-items-center">
      <span className="role-pill">{user?.role} panel</span>
      <div className="d-flex align-items-center gap-3">
        <LiveBadge withSound />
        <NotificationBell />
        <span className="fw-semibold" style={{ fontSize: 14 }}>{user?.name}</span>
        <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={handleLogout}>
          <LogOut size={14} /> Logout
        </button>
      </div>
    </nav>
  );
}
