import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Contact } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/manager/customers').then((res) => setCustomers(res.data)).catch(() => {
      setCustomers([]);
      toast.error('Could not load customers');
    });
  }, []);

  const viewCustomer = async (c) => {
    setSelected(c);
    try {
      const res = await api.get(`/manager/customers/${c.id}/orders`);
      setOrders(res.data);
    } catch {
      setOrders([]);
    }
  };

  const filtered = customers.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <PageHeader icon={Contact} title="Customers" subtitle="Everyone who has ordered from you, and their history." />
      <div className="row">
        <div className="col-md-5">
          <input
            className="form-control mb-2"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <table className="table bg-white">
            <thead><tr><th>Name</th><th>Email</th><th>Orders</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => viewCustomer(c)}
                  style={{ cursor: 'pointer' }}
                  className={selected?.id === c.id ? 'table-active' : ''}
                >
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.order_count}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={3} className="text-center text-muted">No customers found</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="col-md-7">
          {selected ? (
            <div className="card p-3">
              <h6>{selected.name} — Order History</h6>
              <p className="small text-muted">{selected.email} · {selected.phone}</p>
              <table className="table table-sm">
                <thead><tr><th>Order #</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>#{o.id}</td><td>{o.created_at}</td><td>₹{o.total_amount}</td><td>{o.status}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan={4} className="text-center text-muted">No orders yet</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">Select a customer to view their order history.</p>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
