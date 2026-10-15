import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardList, Clock, CheckCircle2, Wallet, UtensilsCrossed, Star, AlertTriangle, CalendarCheck } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import StatCard from '../../components/StatCard';
import DashboardCharts from '../../components/DashboardCharts';
import api from '../../services/api';
import { useLive } from '../../context/LiveContext';

export default function ManagerDashboard() {
  const [stats, setStats] = useState({
    todaysOrders: 0, pendingOrders: 0, completedOrders: 0, todaysSales: 0, totalMenuItems: 0,
    avgRating: 0, lowStock: 0, upcomingReservations: 0, restaurant: null,
  });
  const [toggling, setToggling] = useState(false);

  const load = () => api.get('/manager/dashboard-stats').then((res) => setStats(res.data)).catch(() => toast.error('Could not load dashboard stats'));
  useEffect(() => { load(); }, []);

  useLive(['order:new', 'order:update', 'reservation:update'], () => load());

  const isOpen = stats.restaurant ? !!stats.restaurant.is_open : true;

  const toggleOpen = async () => {
    setToggling(true);
    try {
      const res = await api.patch('/manager/restaurant/open', { is_open: !isOpen });
      toast.success(res.data.message);
      load();
    } catch {
      toast.error('Could not change status');
    } finally {
      setToggling(false);
    }
  };

  const cards = [
    { icon: ClipboardList, label: "Today's Orders", value: stats.todaysOrders, color: 'warning' },
    { icon: Clock, label: 'Pending Orders', value: stats.pendingOrders, color: 'warning' },
    { icon: CheckCircle2, label: 'Completed Today', value: stats.completedOrders, color: 'rating' },
    { icon: Wallet, label: "Today's Sales", value: `₹${Number(stats.todaysSales).toLocaleString('en-IN')}`, color: 'rating' },
    { icon: UtensilsCrossed, label: 'Menu Items', value: stats.totalMenuItems, color: 'brand' },
    { icon: Star, label: `Rating (${stats.reviewCount || 0})`, value: Number(stats.avgRating).toFixed(1), color: 'warning' },
    { icon: CalendarCheck, label: 'Upcoming Bookings', value: stats.upcomingReservations, color: 'info' },
    { icon: AlertTriangle, label: 'Low Stock Items', value: stats.lowStock, color: stats.lowStock ? 'brand' : 'rating' },
  ];

  return (
    <DashboardLayout>
      <div className="dash-banner d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h4>Kitchen Console</h4>
          <p className="mb-0">{stats.restaurant ? `${stats.restaurant.name} — today's service, at a glance.` : "Today's service, at a glance."}</p>
        </div>
        {stats.restaurant && (
          <button className={`btn btn-sm ${isOpen ? 'btn-light' : 'btn-warning'}`} disabled={toggling} onClick={toggleOpen}>
            <span className="open-switch">{isOpen ? '🟢 Accepting orders — tap to pause' : '🔴 Orders paused — tap to resume'}</span>
          </button>
        )}
      </div>
      {stats.lowStock > 0 && (
        <Link to="/manager/inventory" className="alert alert-warning d-flex align-items-center gap-2 py-2 text-decoration-none">
          <AlertTriangle size={16} /> {stats.lowStock} item{stats.lowStock > 1 ? 's are' : ' is'} low on stock — restock soon
        </Link>
      )}
      <div className="row g-3">
        {cards.map((c) => (
          <div className="col-6 col-md-3" key={c.label}><StatCard {...c} /></div>
        ))}
      </div>
      <DashboardCharts stats={stats} />
    </DashboardLayout>
  );
}
