import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Heart } from 'lucide-react';
import CustomerLayout from '../../components/CustomerLayout';
import FoodCard from '../../components/FoodCard';
import FoodCardSkeleton from '../../components/FoodCardSkeleton';
import DishModal from '../../components/DishModal';
import EmptyState from '../../components/EmptyState';
import StickyCartBar from '../../components/StickyCartBar';
import { useFavorites } from '../../context/FavoritesContext';
import api from '../../services/api';

export default function Favorites() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const { ids } = useFavorites();

  useEffect(() => {
    api.get('/user/favorites').then((res) => setItems(res.data)).catch(() => toast.error('Could not load favourites')).finally(() => setLoading(false));
  }, []);

  // a dish un-hearted on this page disappears straight away
  const visible = items.filter((i) => ids.has(i.id));

  return (
    <CustomerLayout>
      <h4 className="mb-1">Your Favourites</h4>
      <p className="text-muted mb-4" style={{ fontSize: 13.5 }}>Dishes you've saved, one tap from your cart.</p>
      {loading ? (
        <FoodCardSkeleton count={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="No favourites yet"
          text="Tap the heart on any dish to save it here."
          action={<Link to="/user/menu" className="btn btn-dark">Browse Menu</Link>}
        />
      ) : (
        <div className="row g-3">
          {visible.map((item) => (
            <div className="col-6 col-md-3" key={item.id}>
              <FoodCard item={item} onOpen={setSelected} onAdded={(i) => toast.success(`${i.name} added to cart`)} />
            </div>
          ))}
        </div>
      )}
      <DishModal item={selected} onHide={() => setSelected(null)} />
      <StickyCartBar />
    </CustomerLayout>
  );
}
