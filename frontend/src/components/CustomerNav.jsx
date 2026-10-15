import { NavLink, useNavigate } from 'react-router-dom';
import { UtensilsCrossed, ShoppingCart, User, LogOut, CalendarCheck, Receipt, Home, Heart } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import NotificationBell from './NotificationBell';
import LiveBadge from './LiveBadge';

const links = [
  { to: '/user', label: 'Home', icon: Home, end: true },
  { to: '/user/menu', label: 'Menu', icon: UtensilsCrossed },
  { to: '/user/reservations', label: 'Book a Table', icon: CalendarCheck },
  { to: '/user/orders', label: 'My Orders', icon: Receipt },
  { to: '/user/favorites', label: 'Favourites', icon: Heart },
];

export default function CustomerNav() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="consumer-nav">
      <div className="inner">
        <div className="consumer-logo">
          <div className="mark"><UtensilsCrossed size={17} /></div>
          Spice Route
        </div>

        <nav className="consumer-nav-links">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `consumer-nav-link d-none d-md-flex align-items-center gap-1${isActive ? ' active' : ''}`}
            >
              <Icon size={15} /> {label}
            </NavLink>
          ))}
        </nav>

        <LiveBadge />
        <NotificationBell />

        <NavLink to="/user/cart" className="consumer-cart-btn">
          <ShoppingCart size={16} />
          <span className="d-none d-sm-inline">Cart</span>
          {cart.length > 0 && <span className="count">{cart.length}</span>}
        </NavLink>

        <NavLink
          to="/user/profile"
          className="d-flex align-items-center justify-content-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'var(--surface-alt)',
            color: 'var(--ink)',
          }}
        >
          <User size={17} />
        </NavLink>

        <button className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1" onClick={handleLogout}>
          <LogOut size={14} /> <span className="d-none d-sm-inline">Logout</span>
        </button>
      </div>

      {/* mobile nav row */}
      <div className="d-flex d-md-none gap-1 px-3 pt-2 overflow-auto">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `consumer-nav-link d-flex align-items-center gap-1${isActive ? ' active' : ''}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            <Icon size={14} /> {label}
          </NavLink>
        ))}
      </div>
    </header>
  );
}
