import { useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { Clock, Flame, Plus, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import FoodImage from './FoodImage';
import VegMark from './VegMark';
import StarRating from './StarRating';
import HeartButton from './HeartButton';
import { finalPriceOf } from './FoodCard';
import { useCart } from '../context/CartContext';
import { fmtDate } from '../utils/format';

const SPICE = ['Not spicy', 'Mild', 'Medium', 'Hot'];

export default function DishModal({ item, onHide }) {
  const { addToCart } = useCart();
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    if (!item) return;
    setReviews([]);
    api.get(`/menu/${item.id}/reviews`).then((res) => setReviews(res.data)).catch(() => {});
  }, [item]);

  if (!item) return null;
  const final = finalPriceOf(item);
  const soldOut = item.is_available === 0 || item.is_available === false || item.stock_qty === 0;

  const add = () => {
    if (addToCart({ ...item, price: final })) {
      toast.success(`${item.name} added to cart`);
      onHide();
    }
  };

  return (
    <Modal show onHide={onHide} centered scrollable>
      <Modal.Body className="p-0">
        <div style={{ position: 'relative' }}>
          <FoodImage src={item.image_url} alt={item.name} className="dish-hero" style={{ borderRadius: '18px 18px 0 0' }} />
          <HeartButton itemId={item.id} />
        </div>
        <div className="p-4">
          <div className="d-flex align-items-center gap-2 mb-2">
            <VegMark isVeg={!!item.is_veg} />
            <h5 className="mb-0">{item.name}</h5>
          </div>
          <div className="d-flex flex-wrap gap-3 mb-3 align-items-center">
            {item.avg_rating ? (
              <span className="d-flex align-items-center gap-1" style={{ fontSize: 13 }}>
                <StarRating value={Number(item.avg_rating)} size={14} />
                <strong>{Number(item.avg_rating).toFixed(1)}</strong>
                <span className="text-muted">({item.review_count})</span>
              </span>
            ) : <span className="text-muted small">No ratings yet</span>}
            {item.prep_time_min && <span className="meta-chip"><Clock size={13} /> {item.prep_time_min} min</span>}
            <span className="meta-chip">
              <Flame size={13} /> {SPICE[item.spice_level || 0]}
              <span className="spice ms-1">{[1, 2, 3].map((n) => <i key={n} className={n <= (item.spice_level || 0) ? 'on' : ''} />)}</span>
            </span>
            {item.restaurant_name && <span className="meta-chip"><Store size={13} /> {item.restaurant_name}</span>}
          </div>
          {item.description && <p className="text-muted" style={{ fontSize: 14 }}>{item.description}</p>}

          {reviews.length > 0 && (
            <>
              <h6 className="mt-3 mb-2" style={{ fontSize: 13.5 }}>What people say</h6>
              {reviews.slice(0, 3).map((r, i) => (
                <div key={i} className="mb-2 pb-2 border-bottom" style={{ fontSize: 13 }}>
                  <div className="d-flex justify-content-between">
                    <span><strong>{r.customer_name}</strong> <StarRating value={r.rating} size={11} /></span>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>{fmtDate(r.created_at)}</span>
                  </div>
                  <div className="text-muted">{r.review}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <div>
          <span className="fw-bold" style={{ fontSize: 18 }}>₹{final}</span>
          {item.discount_percent > 0 && <span className="text-muted ms-2" style={{ textDecoration: 'line-through', fontSize: 13 }}>₹{item.price}</span>}
        </div>
        <button className="btn btn-dark d-flex align-items-center gap-1" disabled={soldOut} onClick={add}>
          <Plus size={15} /> {soldOut ? 'Sold out' : 'Add to cart'}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
