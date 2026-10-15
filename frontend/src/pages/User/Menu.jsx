import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Star, UtensilsCrossed, Leaf, ArrowUpDown, Store, Flame, Clock } from 'lucide-react';
import CustomerLayout from '../../components/CustomerLayout';
import FoodCard, { finalPriceOf } from '../../components/FoodCard';
import FoodCardSkeleton from '../../components/FoodCardSkeleton';
import DishModal from '../../components/DishModal';
import StickyCartBar from '../../components/StickyCartBar';
import EmptyState from '../../components/EmptyState';
import api from '../../services/api';

const SORTS = [
  { key: 'default', label: 'Relevance' },
  { key: 'rating', label: 'Rating: High to Low' },
  { key: 'price_low', label: 'Price: Low to High' },
  { key: 'price_high', label: 'Price: High to Low' },
  { key: 'fast', label: 'Fastest first' },
];

export default function UserMenu() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [restaurantFilter, setRestaurantFilter] = useState('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [offersOnly, setOffersOnly] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [sort, setSort] = useState('default');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get('/menu').then((res) => setItems(res.data)).catch(() => { setItems([]); toast.error('Could not load the menu'); }).finally(() => setLoading(false));
    api.get('/categories').then((res) => setCategories(res.data)).catch(() => setCategories([]));
    api.get('/restaurants').then((res) => setRestaurants(res.data)).catch(() => setRestaurants([]));
  }, []);

  // categories are per restaurant ("Starters" can exist 3 times) — show each name once,
  // and match all the ids behind that name
  const categoryGroups = useMemo(() => {
    const visible = restaurantFilter === 'all' ? categories : categories.filter((c) => c.restaurant_id === Number(restaurantFilter));
    const map = new Map();
    visible.forEach((c) => {
      const key = c.name.toLowerCase();
      if (!map.has(key)) map.set(key, { name: c.name, ids: [] });
      map.get(key).ids.push(c.id);
    });
    return [...map.values()];
  }, [categories, restaurantFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const group = categoryGroups.find((g) => g.name === categoryFilter);
    let list = items
      .filter((i) => i.is_available)
      .filter((i) => restaurantFilter === 'all' || i.restaurant_id === Number(restaurantFilter))
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q) || (i.category_name || '').toLowerCase().includes(q))
      .filter((i) => categoryFilter === 'all' || (group && group.ids.includes(i.category_id)))
      .filter((i) => !vegOnly || i.is_veg)
      .filter((i) => !offersOnly || i.discount_percent > 0)
      .filter((i) => !topRated || Number(i.avg_rating) >= 4);

    if (sort === 'price_low') list = [...list].sort((a, b) => finalPriceOf(a) - finalPriceOf(b));
    if (sort === 'price_high') list = [...list].sort((a, b) => finalPriceOf(b) - finalPriceOf(a));
    if (sort === 'rating') list = [...list].sort((a, b) => (Number(b.avg_rating) || 0) - (Number(a.avg_rating) || 0));
    if (sort === 'fast') list = [...list].sort((a, b) => a.prep_time_min - b.prep_time_min);
    return list;
  }, [items, search, categoryFilter, categoryGroups, restaurantFilter, vegOnly, offersOnly, topRated, sort]);

  const pickRestaurant = (v) => { setRestaurantFilter(v); setCategoryFilter('all'); };

  return (
    <CustomerLayout>
      <h4 className="mb-1">Menu</h4>
      <p className="text-muted mb-3" style={{ fontSize: 13.5 }}>Pick a category, or just search for what you're craving.</p>

      <div className="d-flex align-items-center gap-2 bg-white rounded-pill px-3 py-2 mb-3 border" style={{ maxWidth: 420 }}>
        <Search size={16} color="var(--muted)" />
        <input
          className="border-0 w-100"
          style={{ outline: 'none', fontSize: 14 }}
          placeholder="Search dishes, cuisines, categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {restaurants.length > 1 && (
        <div className="d-flex gap-2 mb-3 overflow-auto pb-1">
          <button className={`filter-pill${restaurantFilter === 'all' ? ' active' : ''}`} onClick={() => pickRestaurant('all')}>
            <Store size={13} /> All restaurants
          </button>
          {restaurants.map((r) => (
            <button key={r.id} className={`filter-pill${restaurantFilter === String(r.id) ? ' active' : ''}`} style={{ whiteSpace: 'nowrap' }} onClick={() => pickRestaurant(String(r.id))}>
              {r.name}
              {r.avg_rating && <span className="d-inline-flex align-items-center gap-1" style={{ color: 'var(--rating)' }}><Star size={11} fill="currentColor" />{Number(r.avg_rating).toFixed(1)}</span>}
              {!r.is_open && <span className="text-muted">· Closed</span>}
            </button>
          ))}
        </div>
      )}

      <div className="d-flex gap-2 mb-4 flex-wrap align-items-center">
        <button className={`filter-pill${vegOnly ? ' active' : ''}`} onClick={() => setVegOnly((v) => !v)}><Leaf size={13} /> Veg Only</button>
        <button className={`filter-pill${offersOnly ? ' active' : ''}`} onClick={() => setOffersOnly((v) => !v)}><Flame size={13} /> Offers</button>
        <button className={`filter-pill${topRated ? ' active' : ''}`} onClick={() => setTopRated((v) => !v)}><Star size={13} /> Rated 4.0+</button>
        <select className="filter-pill" style={{ border: '1.5px solid var(--border)', cursor: 'pointer' }} value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <span className="text-muted d-flex align-items-center gap-1" style={{ fontSize: 12.5 }}>
          <ArrowUpDown size={12} /> {filtered.length} dishes
        </span>
      </div>

      <div className="d-flex gap-4 mb-4 overflow-auto pb-2">
        <button className={`category-chip${categoryFilter === 'all' ? ' active' : ''}`} onClick={() => setCategoryFilter('all')}>
          <span className="circle"><UtensilsCrossed size={22} /></span>
          <span>All</span>
        </button>
        {categoryGroups.map((g) => (
          <button key={g.name} className={`category-chip${categoryFilter === g.name ? ' active' : ''}`} onClick={() => setCategoryFilter(g.name)}>
            <span className="circle">{g.name.charAt(0)}</span>
            <span>{g.name}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <FoodCardSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Clock} title="No dishes match your filters" text="Try clearing a filter or searching for something else." />
      ) : (
        <div className="row g-3">
          {filtered.map((item) => (
            <div className="col-6 col-md-3" key={item.id}>
              <FoodCard
                item={item}
                tag={item.is_featured ? { cls: 'featured', label: 'Chef\'s pick' } : null}
                onOpen={setSelected}
                onAdded={(i) => toast.success(`${i.name} added to cart`)}
              />
            </div>
          ))}
        </div>
      )}

      <DishModal item={selected} onHide={() => setSelected(null)} />
      <StickyCartBar />
    </CustomerLayout>
  );
}
