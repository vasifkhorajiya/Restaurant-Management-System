import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from './AuthContext';

const FavoritesContext = createContext({ ids: new Set(), toggle: () => {}, isFavorite: () => false });

export function FavoritesProvider({ children }) {
  const { user } = useAuth();
  const [ids, setIds] = useState(new Set());

  useEffect(() => {
    if (user?.role !== 'user') { setIds(new Set()); return; }
    api.get('/user/favorites/ids').then((res) => setIds(new Set(res.data))).catch(() => setIds(new Set()));
  }, [user]);

  const toggle = useCallback(async (itemId) => {
    // optimistic — the heart flips instantly, rolls back if the request fails
    setIds((prev) => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
    try {
      await api.post(`/user/favorites/${itemId}`);
    } catch {
      setIds((prev) => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
      toast.error('Could not update favourites');
    }
  }, []);

  return (
    <FavoritesContext.Provider value={{ ids, toggle, isFavorite: (id) => ids.has(id) }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export const useFavorites = () => useContext(FavoritesContext);
