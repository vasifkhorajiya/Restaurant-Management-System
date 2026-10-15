import { NavLink } from 'react-router-dom';
import {
  LayoutGrid, Users, UserCog, Store, UtensilsCrossed, ClipboardList,
  BarChart3, ChefHat, Contact, CalendarCheck, Ticket, Star, Boxes, Armchair, Flame, ScrollText, CreditCard, Receipt, Clock, ShoppingBag, Plug,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Sidebar is only ever rendered for admin/manager — customers get
// CustomerNav (a top nav, no back-office sidebar) instead.
const menus = {
  admin: [
    { to: '/admin', label: 'Dashboard', icon: LayoutGrid },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/managers', label: 'Managers', icon: UserCog },
    { to: '/admin/restaurants', label: 'Restaurants', icon: Store },
    { to: '/admin/menu', label: 'Menu', icon: UtensilsCrossed },
    { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
    { to: '/admin/reservations', label: 'Reservations', icon: CalendarCheck },
    { to: '/admin/coupons', label: 'Coupons', icon: Ticket },
    { to: '/admin/reviews', label: 'Reviews', icon: Star },
    { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
    { to: '/admin/payments', label: 'Payments', icon: CreditCard },
    { to: '/admin/expenses', label: 'Expenses', icon: Receipt },
    { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
    { to: '/admin/integrations', label: 'Integrations', icon: Plug },
    { to: '/admin/audit', label: 'Activity Log', icon: ScrollText },
  ],
  manager: [
    { to: '/manager', label: 'Dashboard', icon: LayoutGrid },
    { to: '/manager/orders', label: 'Orders', icon: ClipboardList },
    { to: '/manager/pos', label: 'Counter POS', icon: ShoppingBag },
    { to: '/manager/kitchen', label: 'Kitchen Display', icon: Flame },
    { to: '/manager/reservations', label: 'Reservations', icon: CalendarCheck },
    { to: '/manager/tables', label: 'Tables', icon: Armchair },
    { to: '/manager/menu', label: 'Menu', icon: UtensilsCrossed },
    { to: '/manager/inventory', label: 'Inventory', icon: Boxes },
    { to: '/manager/payments', label: 'Payments', icon: CreditCard },
    { to: '/manager/expenses', label: 'Expenses', icon: Receipt },
    { to: '/manager/attendance', label: 'Attendance', icon: Clock },
    { to: '/manager/coupons', label: 'Coupons', icon: Ticket },
    { to: '/manager/reviews', label: 'Reviews', icon: Star },
    { to: '/manager/staff', label: 'Staff', icon: ChefHat },
    { to: '/manager/customers', label: 'Customers', icon: Contact },
    { to: '/manager/reports', label: 'Reports', icon: BarChart3 },
  ],
};

const taglines = { admin: 'Command Center', manager: 'Kitchen Console' };

export default function Sidebar() {
  const { user } = useAuth();
  if (!user) return null;
  const items = menus[user.role] || [];

  return (
    <div className="sidebar col-12 col-md-2 p-0">
      <div className="sidebar-brand">
        <div className="mark">SR</div>
        <div>
          <div className="name">Spice Route</div>
          <div className="tag">{taglines[user.role]}</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-foot">v5.0 · Restaurant Ops</div>
    </div>
  );
}
