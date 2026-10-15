import { Heart } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';

export default function HeartButton({ itemId }) {
  const { isFavorite, toggle } = useFavorites();
  const on = isFavorite(itemId);
  return (
    <button
      type="button"
      className={`heart-btn${on ? ' on' : ''}`}
      aria-label={on ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => { e.stopPropagation(); toggle(itemId); }}
    >
      <Heart size={15} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}
