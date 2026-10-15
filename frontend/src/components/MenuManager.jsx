import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UploadCloud, Minus, Plus, Tag, X } from 'lucide-react';
import api from '../services/api';
import FoodImage from './FoodImage';
import FoodCardSkeleton from './FoodCardSkeleton';
import VegMark from './VegMark';

const emptyItem = {
  id: null,
  name: '',
  category_id: '',
  price: '',
  discount_percent: 0,
  image_url: '',
  is_available: true,
  is_veg: true,
  restaurant_id: '',
  description: '',
  prep_time_min: 15,
  spice_level: 0,
  is_featured: false,
  stock_qty: '',
};

const DISCOUNT_STEP = 5;
const DISCOUNT_MAX = 90;

/**
 * apiPrefix: '/admin' or '/manager' — determines which backend routes to call.
 * Both admin and manager hit the same shape of endpoints:
 *   GET/POST/PUT/DELETE  {prefix}/menu
 *   GET/POST/PUT/DELETE  {prefix}/categories
 *   POST                 {prefix}/menu/upload-image
 *   PATCH                {prefix}/menu/:id/discount
 *
 * A manager only ever manages their own restaurant, so the backend scopes
 * that automatically. An admin manages every restaurant, so admin has to
 * pick WHICH restaurant a new category/item belongs to — that's the
 * restaurant dropdown that only shows up when apiPrefix === '/admin'.
 */
export default function MenuManager({ apiPrefix }) {
  const isAdmin = apiPrefix === '/admin';

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [form, setForm] = useState(emptyItem);
  const [showForm, setShowForm] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newCategoryRestaurant, setNewCategoryRestaurant] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  // tracks which item's discount is mid-update, so double-clicking the
  // stepper can't fire two overlapping requests for the same item
  const [savingDiscountId, setSavingDiscountId] = useState(null);

  const load = () => {
    api.get(`${apiPrefix}/menu`).then((res) => setItems(res.data)).catch(() => {
      setItems([]);
      toast.error('Could not load menu items');
    }).finally(() => setLoading(false));
    api.get(`${apiPrefix}/categories`).then((res) => setCategories(res.data)).catch(() => {
      setCategories([]);
      toast.error('Could not load categories');
    });
    if (isAdmin) {
      api.get('/admin/restaurants').then((res) => {
        setRestaurants(res.data);
        if (res.data.length > 0) {
          setNewCategoryRestaurant((prev) => prev || String(res.data[0].id));
        }
      }).catch(() => {
        setRestaurants([]);
        toast.error('Could not load restaurants');
      });
    }
  };
  useEffect(load, [apiPrefix]);

  const openAdd = () => {
    setForm({ ...emptyItem, restaurant_id: restaurants[0]?.id || '' });
    setShowForm(true);
    setError('');
  };
  const openEdit = (item) => {
    setForm({ ...emptyItem, ...item, description: item.description ?? '', stock_qty: item.stock_qty ?? '' });
    setShowForm(true);
    setError('');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleImageFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const body = new FormData();
    body.append('image', file);
    setUploading(true);
    try {
      const res = await api.post(`${apiPrefix}/menu/upload-image`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((f) => ({ ...f, image_url: res.data.url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isAdmin && !form.restaurant_id) {
      setError('Pick which restaurant this item belongs to');
      return;
    }
    try {
      if (form.id) await api.put(`${apiPrefix}/menu/${form.id}`, form);
      else await api.post(`${apiPrefix}/menu`, form);
      toast.success(form.id ? 'Item updated' : 'Item added');
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this food item?')) return;
    try {
      await api.delete(`${apiPrefix}/menu/${id}`);
      toast.success('Item deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete item');
    }
  };

  const toggleAvailability = async (item) => {
    try {
      await api.patch(`${apiPrefix}/menu/${item.id}/availability`, {
        is_available: !item.is_available,
      });
      load();
    } catch (err) {
      toast.error('Could not update availability');
    }
  };

  // ---- Discount quick controls (+/- stepper and Remove, right on the card) ----
  const applyDiscount = async (item, nextValue) => {
    const clamped = Math.max(0, Math.min(DISCOUNT_MAX, nextValue));
    setSavingDiscountId(item.id);
    // optimistic UI update so the stepper feels instant, corrected below if the request fails
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, discount_percent: clamped } : i)));
    try {
      await api.patch(`${apiPrefix}/menu/${item.id}/discount`, { discount_percent: clamped });
      if (clamped === 0 && item.discount_percent > 0) toast.success('Discount removed');
      else if (clamped > 0) toast.success(`Discount set to ${clamped}%`);
    } catch (err) {
      toast.error('Could not update discount');
      load(); // roll back to real server state on failure
    } finally {
      setSavingDiscountId(null);
    }
  };
  const increaseDiscount = (item) => applyDiscount(item, (item.discount_percent || 0) + DISCOUNT_STEP);
  const decreaseDiscount = (item) => applyDiscount(item, (item.discount_percent || 0) - DISCOUNT_STEP);
  const removeDiscount = (item) => applyDiscount(item, 0);

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    if (isAdmin && !newCategoryRestaurant) {
      toast.error('Pick which restaurant this category belongs to');
      return;
    }
    try {
      await api.post(`${apiPrefix}/categories`, {
        name: newCategory,
        restaurant_id: newCategoryRestaurant || undefined,
      });
      toast.success('Category added');
      setNewCategory('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add category');
    }
  };

  const deleteCategory = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await api.delete(`${apiPrefix}/categories/${id}`);
      toast.success('Category deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not delete category');
    }
  };

  const categoryName = (id) => categories.find((c) => c.id === Number(id))?.name || '—';

  const visibleItems = categoryFilter === 'all'
    ? items
    : items.filter((i) => i.category_id === Number(categoryFilter));

  return (
    <div>
      {isAdmin && restaurants.length === 0 && (
        <div className="alert alert-warning">
          No restaurants exist yet — add one under <strong>Restaurants</strong> first, then come back here.
        </div>
      )}

      <div className="card p-3 mb-3">
        <h6>Categories</h6>
        <div className="d-flex gap-2 mb-2 flex-wrap">
          <input
            className="form-control"
            style={{ maxWidth: 220 }}
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          {isAdmin && (
            <select
              className="form-select"
              style={{ maxWidth: 200 }}
              value={newCategoryRestaurant}
              onChange={(e) => setNewCategoryRestaurant(e.target.value)}
            >
              <option value="">Select Restaurant</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-sm btn-dark" onClick={addCategory}>Add Category</button>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="badge bg-light text-dark border d-flex align-items-center gap-2 p-2">
              {c.name}
              <button
                className="btn btn-sm btn-link text-danger p-0"
                onClick={() => deleteCategory(c.id)}
                style={{ lineHeight: 1 }}
              >
                ✕
              </button>
            </span>
          ))}
          {categories.length === 0 && <span className="text-muted small">No categories yet.</span>}
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h5 className="mb-0">Food Items</h5>
        <div className="d-flex gap-2">
          <select
            className="form-select form-select-sm"
            style={{ width: 200 }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="btn btn-dark" onClick={openAdd}>+ Add Food Item</button>
        </div>
      </div>

      {showForm && (
        <div className="card p-3 mb-3">
          <h6>{form.id ? 'Edit Food Item' : 'Add Food Item'}</h6>
          {error && <div className="alert alert-danger py-1">{error}</div>}
          <form onSubmit={handleSubmit} className="row g-2">
            {isAdmin && (
              <div className="col-md-3">
                <select name="restaurant_id" className="form-select" value={form.restaurant_id} onChange={handleChange} required>
                  <option value="">Select Restaurant</option>
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-md-3">
              <input name="name" className="form-control" placeholder="Food Name" value={form.name} onChange={handleChange} required />
            </div>
            <div className="col-md-2">
              <select name="category_id" className="form-select" value={form.category_id} onChange={handleChange} required>
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <input
                name="price"
                type="number"
                step="0.01"
                className="form-control"
                placeholder="Price"
                value={form.price}
                onChange={handleChange}
                required
              />
            </div>
            <div className="col-md-2">
              <input
                name="discount_percent"
                type="number"
                min="0"
                max="90"
                className="form-control"
                placeholder="Discount %"
                value={form.discount_percent}
                onChange={handleChange}
              />
            </div>
            <div className="col-md-3">
              <label className="btn btn-sm btn-outline-dark w-100 d-flex align-items-center justify-content-center gap-1 mb-0">
                <UploadCloud size={14} /> {uploading ? 'Uploading...' : 'Upload Photo'}
                <input type="file" accept="image/*" hidden onChange={handleImageFile} />
              </label>
            </div>
            <div className="col-md-2 d-flex align-items-center">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  name="is_available"
                  checked={form.is_available}
                  onChange={handleChange}
                />
                <label className="form-check-label small">Available</label>
              </div>
            </div>
            <div className="col-md-2 d-flex align-items-center">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" name="is_veg" checked={form.is_veg} onChange={handleChange} />
                <label className="form-check-label small">Veg</label>
              </div>
            </div>
            <div className="col-md-6">
              <input name="description" className="form-control" maxLength={500} placeholder="Short description (shown to customers)" value={form.description} onChange={handleChange} />
            </div>
            <div className="col-md-2">
              <input name="prep_time_min" type="number" min="1" max="240" className="form-control" title="Prep time (minutes)" placeholder="Prep min" value={form.prep_time_min} onChange={handleChange} />
            </div>
            <div className="col-md-2">
              <select name="spice_level" className="form-select" value={form.spice_level} onChange={handleChange}>
                <option value={0}>Not spicy</option><option value={1}>Mild</option><option value={2}>Medium</option><option value={3}>Hot</option>
              </select>
            </div>
            <div className="col-md-2">
              <input name="stock_qty" type="number" min="0" className="form-control" title="Leave empty for unlimited" placeholder="Stock (∞)" value={form.stock_qty} onChange={handleChange} />
            </div>
            <div className="col-md-3 d-flex align-items-center">
              <div className="form-check">
                <input className="form-check-input" type="checkbox" name="is_featured" checked={!!form.is_featured} onChange={handleChange} />
                <label className="form-check-label small">Chef's pick (featured)</label>
              </div>
            </div>
            {form.image_url && (
              <div className="col-12">
                <FoodImage src={form.image_url} alt="preview" style={{ height: 60, borderRadius: 6 }} />
              </div>
            )}
            <div className="col-12 d-flex gap-2">
              <button className="btn btn-dark btn-sm" disabled={uploading}>Save</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <FoodCardSkeleton count={8} />
      ) : (
        <div className="row g-3">
          {visibleItems.map((item) => {
            const discount = item.discount_percent || 0;
            const finalPrice = (item.price * (1 - discount / 100)).toFixed(2);
            const isSaving = savingDiscountId === item.id;
            return (
              <div className="col-md-3" key={item.id}>
                <div className="card h-100">
                  <div style={{ position: 'relative' }}>
                    {discount > 0 && <span className="food-tag discount">{discount}% OFF</span>}
                    <FoodImage src={item.image_url} alt={item.name} className="card-img-top" style={{ height: 140, objectFit: 'cover' }} />
                  </div>
                  <div className="card-body">
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <VegMark isVeg={item.is_veg} />
                      <h6 className="mb-0">{item.name}</h6>
                    </div>
                    <p className="small text-muted mb-1">{categoryName(item.category_id)}</p>
                    {discount > 0 ? (
                      <p className="mb-2">
                        <span className="mono">₹{finalPrice}</span>{' '}
                        <span className="text-muted" style={{ textDecoration: 'line-through', fontSize: 12.5 }}>₹{item.price}</span>
                      </p>
                    ) : (
                      <p className="mb-2 mono">₹{item.price}</p>
                    )}
                    <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
                      <span className={`badge ${item.is_available ? 'bg-success' : 'bg-secondary'}`}>
                        {item.is_available ? 'Available' : 'Unavailable'}
                      </span>
                      {item.stock_qty !== null && item.stock_qty !== undefined && (
                        <span className={`badge ${item.stock_qty <= 5 ? 'bg-danger' : 'bg-info'}`}>Stock: {item.stock_qty}</span>
                      )}
                      {item.is_featured ? <span className="badge bg-warning text-dark">Featured</span> : null}
                      {item.avg_rating ? <span className="small text-muted">★ {Number(item.avg_rating).toFixed(1)} ({item.review_count})</span> : null}
                    </div>

                    {/* discount stepper — the actual "add/remove/increase/decrease" control */}
                    <div className="d-flex align-items-center gap-2 mb-2 p-2" style={{ background: 'var(--surface-alt)', borderRadius: 8 }}>
                      <Tag size={13} color="var(--brand)" />
                      <button
                        className="btn btn-sm btn-outline-dark"
                        style={{ padding: '2px 8px' }}
                        disabled={isSaving || discount <= 0}
                        onClick={() => decreaseDiscount(item)}
                      >
                        <Minus size={12} />
                      </button>
                      <span className="mono" style={{ minWidth: 32, textAlign: 'center', fontSize: 13 }}>{discount}%</span>
                      <button
                        className="btn btn-sm btn-outline-dark"
                        style={{ padding: '2px 8px' }}
                        disabled={isSaving || discount >= DISCOUNT_MAX}
                        onClick={() => increaseDiscount(item)}
                      >
                        <Plus size={12} />
                      </button>
                      {discount > 0 && (
                        <button
                          className="btn btn-sm btn-outline-danger ms-auto"
                          style={{ padding: '2px 8px' }}
                          disabled={isSaving}
                          onClick={() => removeDiscount(item)}
                          title="Remove discount"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="d-flex gap-2 flex-wrap">
                      <button className="btn btn-sm btn-outline-primary" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-sm btn-outline-warning" onClick={() => toggleAvailability(item)}>
                        Toggle
                      </button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(item.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleItems.length === 0 && <p className="text-muted">No food items in this category yet.</p>}
        </div>
      )}
    </div>
  );
}
