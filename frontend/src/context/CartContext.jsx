import { createContext, useContext, useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const CartContext = createContext();

// stock_qty === null/undefined means "unlimited"
const stockLimit = (item) => (item.stock_qty === null || item.stock_qty === undefined ? Infinity : item.stock_qty);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    const saved = sessionStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    sessionStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const restaurantId = cart[0]?.restaurant_id ?? null;

  // returns true if the item was added
  const addToCart = (item, qty = 1) => {
    if (cart.length > 0 && item.restaurant_id && restaurantId && item.restaurant_id !== restaurantId) {
      const ok = window.confirm(
        'Your cart has dishes from another restaurant. An order can only be from one restaurant — start a new cart with this dish?'
      );
      if (!ok) return false;
      setCart([{ ...item, qty: Math.min(qty, stockLimit(item)) }]);
      return true;
    }
    const existing = cart.find((c) => c.id === item.id);
    const nextQty = (existing?.qty || 0) + qty;
    if (nextQty > stockLimit(item)) {
      toast.error(`Only ${stockLimit(item)} left of ${item.name}`);
      return false;
    }
    setCart((prev) =>
      existing
        ? prev.map((c) => (c.id === item.id ? { ...c, ...item, qty: nextQty } : c))
        : [...prev, { ...item, qty }]
    );
    return true;
  };

  const removeFromCart = (id) => setCart((prev) => prev.filter((c) => c.id !== id));

  const increaseQty = (id) => {
    const line = cart.find((c) => c.id === id);
    if (line && line.qty + 1 > stockLimit(line)) {
      toast.error(`Only ${stockLimit(line)} left of ${line.name}`);
      return;
    }
    setCart((prev) => prev.map((c) => (c.id === id ? { ...c, qty: c.qty + 1 } : c)));
  };

  const decreaseQty = (id) =>
    setCart((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, qty: c.qty - 1 } : c))
        .filter((c) => c.qty > 0)
    );

  const replaceCart = (items) => setCart(items);
  const clearCart = () => setCart([]);

  const totalPrice = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  return (
    <CartContext.Provider
      value={{ cart, restaurantId, addToCart, removeFromCart, increaseQty, decreaseQty, replaceCart, clearCart, totalPrice }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
