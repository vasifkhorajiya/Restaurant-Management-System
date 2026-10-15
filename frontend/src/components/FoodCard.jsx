import { Plus, Minus, Star, Clock } from 'lucide-react';
import FoodImage from './FoodImage';
import VegMark from './VegMark';
import HeartButton from './HeartButton';
import { useCart } from '../context/CartContext';

export const finalPriceOf = (item) => Number((item.price * (1 - (item.discount_percent || 0) / 100)).toFixed(2));

// One dish card used on Home, Menu and Favourites so they always look and behave the same.
export default function FoodCard({ item, tag, imgHeight = 150, onOpen, onAdded }) {
  const { cart, addToCart, increaseQty, decreaseQty } = useCart();
  const qty = cart.find((c) => c.id === item.id)?.qty || 0;
  const discount = item.discount_percent || 0;
  const final = finalPriceOf(item);
  const soldOut = item.is_available === 0 || item.is_available === false || item.stock_qty === 0;
  const lowStock = item.stock_qty !== null && item.stock_qty !== undefined && item.stock_qty > 0 && item.stock_qty <= 5;

  const add = (e) => {
    e.stopPropagation();
    if (addToCart({ ...item, price: final })) onAdded?.(item);
  };

  const badge =
    soldOut ? <span className="food-tag soldout">Sold out</span>
    : discount > 0 ? <span className="food-tag discount">{discount}% OFF</span>
    : lowStock ? <span className="food-tag low">Only {item.stock_qty} left</span>
    : tag ? <span className={`food-tag ${tag.cls}`}>{tag.label}</span>
    : null;

  return (
    <div className="food-card">
      <div className="img-wrap" style={{ position: 'relative' }} onClick={() => onOpen?.(item)}>
        {badge}
        <HeartButton itemId={item.id} />
        <FoodImage
          src={item.image_url}
          alt={item.name}
          style={{ width: '100%', height: imgHeight, objectFit: 'cover', filter: soldOut ? 'grayscale(1)' : 'none' }}
        />
        {!soldOut && (qty > 0 ? (
          <div className="card-stepper" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => decreaseQty(item.id)}><Minus size={13} /></button>
            <span>{qty}</span>
            <button onClick={() => increaseQty(item.id)}><Plus size={13} /></button>
          </div>
        ) : (
          <button className="add-btn d-flex align-items-center gap-1" onClick={add}>
            <Plus size={13} /> ADD
          </button>
        ))}
      </div>
      <div className="p-3 pt-4" onClick={() => onOpen?.(item)} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
        <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
          <VegMark isVeg={!!item.is_veg} />
          {item.avg_rating ? (
            <span className="rating-pill"><Star size={10} fill="#fff" /> {Number(item.avg_rating).toFixed(1)}</span>
          ) : (
            <span className="meta-chip">New</span>
          )}
          {item.prep_time_min && <span className="meta-chip"><Clock size={11} /> {item.prep_time_min}m</span>}
        </div>
        <h6 className="mb-1" style={{ fontSize: 14 }}>{item.name}</h6>
        {discount > 0 ? (
          <p className="mb-0">
            <span className="fw-bold" style={{ fontSize: 14 }}>₹{final}</span>{' '}
            <span className="text-muted" style={{ textDecoration: 'line-through', fontSize: 12 }}>₹{item.price}</span>
          </p>
        ) : (
          <p className="mb-0 fw-bold" style={{ fontSize: 14 }}>₹{item.price}</p>
        )}
      </div>
    </div>
  );
}
