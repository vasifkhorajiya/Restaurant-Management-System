import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Minus, Trash2, Search, ReceiptText, Store as StoreIcon } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import VegMark from '../../components/VegMark';
import api from '../../services/api';
import { generateBill } from '../../utils/generateBill';
import { inr } from '../../utils/format';

const finalPrice = (i) => Number((i.price * (1 - (i.discount_percent || 0) / 100)).toFixed(2));

export default function POS() {
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({});           // id -> qty
  const [search, setSearch] = useState('');
  const [type, setType] = useState('Dine-in');
  const [table, setTable] = useState('');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  useEffect(() => { api.get('/manager/menu').then((res) => setItems(res.data)).catch(() => toast.error('Could not load menu')); }, []);

  const list = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const lines = items.filter((i) => cart[i.id]).map((i) => ({ ...i, qty: cart[i.id], unit: finalPrice(i) }));
  const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
  const total = Math.round(subtotal * 1.05 * 100) / 100;

  const add = (i) => {
    const have = cart[i.id] || 0;
    if (i.stock_qty !== null && i.stock_qty !== undefined && have + 1 > i.stock_qty) return toast.error(`Only ${i.stock_qty} left`);
    setCart({ ...cart, [i.id]: have + 1 });
  };
  const dec = (id) => { const n = (cart[id] || 0) - 1; const c = { ...cart }; if (n <= 0) delete c[id]; else c[id] = n; setCart(c); };

  const place = async () => {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post('/manager/pos/orders', {
        items: lines.map((l) => ({ menu_item_id: l.id, quantity: l.qty })),
        order_type: type, table_no: table, notes, payment_method: method,
      });
      toast.success(`Order #${String(res.data.orderId).padStart(4, '0')} sent to the kitchen`);
      setLast(res.data);
      setCart({}); setNotes(''); setTable('');
      api.get('/manager/menu').then((r) => setItems(r.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not place order');
    } finally {
      setBusy(false);
    }
  };

  const printLast = async () => {
    try { generateBill((await api.get(`/manager/orders/${last.orderId}/detail`)).data); } catch { toast.error('Could not build the bill'); }
  };

  return (
    <DashboardLayout>
      <PageHeader icon={StoreIcon} title="Counter POS" subtitle="Take walk-in and phone orders. Paid on the spot, straight to the kitchen." />
      <div className="pos-grid">
        <div>
          <div className="d-flex align-items-center gap-2 bg-white rounded-pill px-3 py-2 mb-3 border" style={{ maxWidth: 360 }}>
            <Search size={15} color="var(--muted)" />
            <input className="border-0 w-100" style={{ outline: 'none', fontSize: 14 }} placeholder="Search dishes…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="pos-items">
            {list.map((i) => {
              const out = !i.is_available || i.stock_qty === 0;
              return (
                <button key={i.id} className="pos-item" disabled={out} onClick={() => add(i)}>
                  <div className="d-flex align-items-center gap-2 mb-1"><VegMark isVeg={!!i.is_veg} /><span className="fw-semibold" style={{ fontSize: 13.5 }}>{i.name}</span></div>
                  <div style={{ fontSize: 13 }}>{inr(finalPrice(i))}{i.stock_qty !== null && i.stock_qty !== undefined && <span className="text-muted"> · {i.stock_qty} left</span>}</div>
                  {out && <div className="text-danger small">Unavailable</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-3 pos-cart">
          <h6 className="mb-3">Current order</h6>
          <div className="seg-tabs mb-2">
            {['Dine-in', 'Pickup'].map((t) => <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t}</button>)}
          </div>
          {type === 'Dine-in' && <input className="form-control form-control-sm mb-2" placeholder="Table no. (optional)" value={table} onChange={(e) => setTable(e.target.value)} maxLength={20} />}
          {lines.length === 0 && <p className="text-muted small my-3">Tap dishes to add them.</p>}
          {lines.map((l) => (
            <div key={l.id} className="d-flex justify-content-between align-items-center py-1 border-bottom" style={{ fontSize: 13.5 }}>
              <span>{l.name}</span>
              <span className="d-flex align-items-center gap-2">
                <button className="btn btn-sm p-0 border-0" onClick={() => dec(l.id)}>{l.qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}</button>
                {l.qty}
                <button className="btn btn-sm p-0 border-0" onClick={() => add(l)}><Plus size={14} /></button>
                <strong style={{ minWidth: 56, textAlign: 'right' }}>{inr(l.unit * l.qty)}</strong>
              </span>
            </div>
          ))}
          <input className="form-control form-control-sm mt-2" placeholder="Kitchen note" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} />
          <div className="d-flex justify-content-between mt-3" style={{ fontSize: 13 }}><span className="text-muted">Subtotal</span><span>{inr(subtotal)}</span></div>
          <div className="d-flex justify-content-between" style={{ fontSize: 13 }}><span className="text-muted">Tax (5%)</span><span>{inr(total - subtotal)}</span></div>
          <div className="d-flex justify-content-between fw-bold fs-5 my-2"><span>Total</span><span>{inr(total)}</span></div>
          <div className="seg-tabs mb-3">
            {['Cash', 'UPI', 'Card'].map((m) => <button key={m} className={method === m ? 'active' : ''} onClick={() => setMethod(m)}>{m}</button>)}
          </div>
          <button className="btn btn-dark w-100" disabled={busy || lines.length === 0} onClick={place}>{busy ? 'Sending…' : `Collect ${inr(total)} & send to kitchen`}</button>
          {last && <button className="btn btn-outline-dark w-100 mt-2 d-flex align-items-center justify-content-center gap-1" onClick={printLast}><ReceiptText size={14} /> Bill for #{String(last.orderId).padStart(4, '0')}</button>}
        </div>
      </div>
    </DashboardLayout>
  );
}
