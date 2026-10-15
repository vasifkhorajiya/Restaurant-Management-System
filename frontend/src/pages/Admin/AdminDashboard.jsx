import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Users, UserCog, ChefHat, UtensilsCrossed, ClipboardList, Wallet, Clock, CheckCircle2, Star, AlertTriangle, CalendarCheck, Ticket } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import StatCard from '../../components/StatCard';
import DashboardCharts from '../../components/DashboardCharts';
import api from '../../services/api';
import { useLive } from '../../context/LiveContext';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0, totalManagers: 0, totalStaff: 0, totalMenuItems: 0, totalOrders: 0, totalRevenue: 0,
    pendingOrders: 0, completedOrders: 0, todaysRevenue: 0, avgRating: 0, lowStock: 0, upcomingReservations: 0, activeCoupons: 0,
  });

  useEffect(() => {
    api.get('/admin/dashboard-stats').then((res) => setStats(res.data)).catch(() => toast.error('Could not load dashboard stats'));
  }, []);

  // numbers and charts refresh by themselves when orders move
  useLive(['order:new', 'order:update'], () => {
    api.get('/admin/dashboard-stats').then((res) => setStats(res.data)).catch(() => {});
  });

  const cards = [
    { icon: Users, label: 'Total Users', value: stats.totalUsers, color: 'info' },
    { icon: UserCog, label: 'Total Managers', value: stats.totalManagers, color: 'info' },
    { icon: ChefHat, label: 'Total Staff', value: stats.totalStaff, color: 'brand' },
    { icon: UtensilsCrossed, label: 'Menu Items', value: stats.totalMenuItems, color: 'brand' },
    { icon: ClipboardList, label: 'Total Orders', value: stats.totalOrders, color: 'warning' },
    { icon: Wallet, label: 'Total Revenue', value: `₹${Number(stats.totalRevenue).toLocaleString('en-IN')}`, color: 'rating' },
    { icon: Clock, label: 'Pending Orders', value: stats.pendingOrders, color: 'warning' },
    { icon: CheckCircle2, label: 'Completed Orders', value: stats.completedOrders, color: 'rating' },
    { icon: Wallet, label: "Today's Revenue", value: `₹${Number(stats.todaysRevenue).toLocaleString('en-IN')}`, color: 'rating' },
    { icon: Star, label: `Avg Rating (${stats.reviewCount || 0})`, value: Number(stats.avgRating).toFixed(1), color: 'warning' },
    { icon: CalendarCheck, label: 'Upcoming Bookings', value: stats.upcomingReservations, color: 'info' },
    { icon: Ticket, label: 'Active Coupons', value: stats.activeCoupons, color: 'brand' },
  ];

  return (
    <DashboardLayout>
      <div className="dash-banner">
        <h4>Command Center</h4>
        <p>Everything happening across every restaurant, right now.</p>
      </div>
      {stats.lowStock > 0 && (
        <Link to="/admin/inventory" className="alert alert-warning d-flex align-items-center gap-2 py-2 text-decoration-none">
          <AlertTriangle size={16} /> {stats.lowStock} inventory item{stats.lowStock > 1 ? 's are' : ' is'} running low — review stock
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
