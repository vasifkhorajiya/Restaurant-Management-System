import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useCart } from '../context/CartContext';

export default function StickyCartBar() {
  const { cart, totalPrice } = useCart();
  const navigate = useNavigate();

  if (cart.length === 0) return null;

  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  return (
    <div className="sticky-cart-bar">
      <ShoppingBag size={18} />
      <div className="info">
        {itemCount} item{itemCount > 1 ? 's' : ''} · ₹{totalPrice.toFixed(0)}
        <small>Extra charges may apply</small>
      </div>
      <button className="view-btn" onClick={() => navigate('/user/cart')}>
        View Cart →
      </button>
    </div>
  );
}
