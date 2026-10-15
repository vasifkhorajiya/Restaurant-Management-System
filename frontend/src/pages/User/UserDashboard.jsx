import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, CalendarCheck, Gift, ChefHat, RotateCw } from 'lucide-react';
import CustomerLayout from '../../components/CustomerLayout';
import FoodCard from '../../components/FoodCard';
import DishModal from '../../components/DishModal';
import OfferStrip from '../../components/OfferStrip';
import FoodCardSkeleton from '../../components/FoodCardSkeleton';
import StickyCartBar from '../../components/StickyCartBar';
import api from '../../services/api';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { orderNo } from '../../utils/format';

export default function UserDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [points, setPoints] = useState(null);
  const [orders, setOrders] = useState([]);
  const { replaceCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/menu/popular').then((res) => setItems(res.data)).catch(() => { setItems([]); toast.error('Could not load menu — check your connection'); }).finally(() => setLoading(false));
    api.get('/user/profile').then((res) => setPoints(res.data.loyalty_points)).catch(() => {});
    api.get('/orders/my').then((res) => setOrders(res.data)).catch(() => {});
  }, []);

  const filtered = items.filter((i) => i.name?.toLowerCase().includes(search.toLowerCase()));

  // /menu/popular is already ordered by real order_count, so the top 2 genuinely are the bestsellers
  const tagFor = (index) => (index < 2 ? { cls: 'bestseller', label: 'Bestseller' } : null);

  const activeOrder = orders.find((o) => !['Completed', 'Cancelled'].includes(o.status));
  const lastCompleted = orders.find((o) => o.status === 'Completed');

  const orderAgain = async () => {
    try {
      const res = await api.get(`/orders/${lastCompleted.id}/reorder`);
      const ok = res.data.filter((i) => i.available);
      if (ok.length === 0) return toast.error('None of those dishes are available right now');
      replaceCart(ok.map((i) => ({ ...i, qty: Math.min(i.qty, i.stock_qty ?? i.qty) })));
      if (ok.length < res.data.length) toast('Some dishes are unavailable and were skipped', { icon: 'ℹ️' });
      navigate('/user/cart');
    } catch {
      toast.error('Could not reorder');
    }
  };

  return (
    <CustomerLayout>
      <div className="consumer-hero">
        <h1>Hey {user?.name?.split(' ')[0]}, hungry?</h1>
        <p>Order your favourites, or book a table if you'd rather eat in.</p>
        <div className="d-flex gap-2 mt-3 flex-wrap">
          <div className="d-flex align-items-center gap-2 bg-white rounded-pill px-3 py-2" style={{ maxWidth: 340, flex: 1 }}>
            <Search size={16} color="var(--muted)" />
            <input className="border-0 w-100" style={{ outline: 'none', fontSize: 14 }} placeholder="Search for a dish..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Link to="/user/reservations" className="btn btn-sm d-flex align-items-center gap-1" style={{ background: '#fff', color: 'var(--brand-dark)' }}>
            <CalendarCheck size={15} /> Book a Table
          </Link>
        </div>
        {points !== null && (
          <div className="mt-3"><span className="points-chip"><Gift size={14} /> {points} loyalty points</span></div>
        )}
      </div>

      {(activeOrder || lastCompleted) && (
        <div className="row g-3 mb-3">
          {activeOrder && (
            <div className="col-md-6">
              <Link to="/user/orders" className="card p-3 d-flex flex-row align-items-center gap-3 h-100" style={{ color: 'inherit' }}>
                <ChefHat size={26} color="var(--brand)" />
                <div>
                  <div className="fw-bold" style={{ fontSize: 14 }}>Order {orderNo(activeOrder.id)} is {activeOrder.status.toLowerCase()}</div>
                  <div className="text-muted" style={{ fontSize: 12.5 }}>Tap to track it live</div>
                </div>
              </Link>
            </div>
          )}
          {lastCompleted && (
            <div className="col-md-6">
              <div className="card p-3 d-flex flex-row align-items-center gap-3 h-100">
                <RotateCw size={24} color="var(--rating)" />
                <div className="flex-grow-1">
                  <div className="fw-bold" style={{ fontSize: 14 }}>Order your last meal again</div>
                  <div className="text-muted text-truncate" style={{ fontSize: 12.5, maxWidth: 260 }}>{lastCompleted.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}</div>
                </div>
                <button className="btn btn-sm btn-dark" onClick={orderAgain}>Reorder</button>
              </div>
            </div>
          )}
        </div>
      )}

      <OfferStrip />

      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Popular right now</h5>
        <Link to="/user/menu" className="fw-semibold" style={{ fontSize: 13.5 }}>See full menu →</Link>
      </div>

      {loading ? (
        <FoodCardSkeleton count={8} />
      ) : (
        <div className="row g-3">
          {filtered.length === 0 && <p className="text-muted">No popular items to show yet — check the full menu.</p>}
          {filtered.map((item, index) => (
            <div className="col-6 col-md-3" key={item.id}>
              <FoodCard item={item} imgHeight={140} tag={tagFor(index)} onOpen={setSelected} onAdded={(i) => toast.success(`${i.name} added to cart`)} />
            </div>
          ))}
        </div>
      )}

      <DishModal item={selected} onHide={() => setSelected(null)} />
      <StickyCartBar />
    </CustomerLayout>
  );
}
