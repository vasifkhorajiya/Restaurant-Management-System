import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import api from '../services/api';
import { BarChart, LineChart, DonutChart, RankBars } from './Charts';
import { exportCsv } from '../utils/exportCsv';
import { inr } from '../utils/format';

const EMPTY = {
  totalRevenue: 0, totalOrders: 0, completedOrders: 0, cancelledOrders: 0, avgOrderValue: 0, discountsGiven: 0, taxCollected: 0,
  tips: 0, totalExpenses: 0, netProfit: 0, expensesByCategory: [],
  revenueGrowth: null, ordersGrowth: null, sales: [], popularItems: [], byCategory: [], byOrderType: [], byPayment: [], byHour: [], topCustomers: [],
};

function Delta({ value }) {
  if (value === null || value === undefined) return null;
  return <div className={`stat-delta ${value >= 0 ? 'up' : 'down'}`}>{value >= 0 ? '▲' : '▼'} {Math.abs(value)}% vs previous period</div>;
}

export default function ReportsView({ apiPrefix, showPopularItems = false }) {
  const [period, setPeriod] = useState('weekly'); // daily | weekly | monthly | custom
  const [range, setRange] = useState({ from: '', to: '' });
  const [report, setReport] = useState(EMPTY);

  useEffect(() => {
    if (period === 'custom' && !(range.from && range.to)) return;
    const params = period === 'custom' ? { from: range.from, to: range.to } : { period };
    api.get(`${apiPrefix}/reports`, { params })
      .then((res) => setReport(res.data))
      .catch(() => { setReport(EMPTY); toast.error('Could not load reports'); });
  }, [apiPrefix, period, range]);

  const sales = [...report.sales].reverse();
  const hasHours = report.byHour.some((h) => h.orders > 0);

  const download = () =>
    exportCsv(`sales-${period}.csv`, [
      { key: 'date', label: 'Date' }, { key: 'orders', label: 'Orders' }, { key: 'revenue', label: 'Revenue (completed)' },
    ], report.sales);

  const kpis = [
    { label: 'Revenue', value: inr(report.totalRevenue), delta: report.revenueGrowth },
    { label: 'Orders', value: report.totalOrders, delta: report.ordersGrowth },
    { label: 'Avg order value', value: inr(report.avgOrderValue) },
    { label: 'Completed', value: report.completedOrders },
    { label: 'Cancelled', value: report.cancelledOrders },
    { label: 'Discounts given', value: inr(report.discountsGiven) },
    { label: 'Tax collected', value: inr(report.taxCollected) },
    { label: 'Tips received', value: inr(report.tips) },
    { label: 'Expenses', value: inr(report.totalExpenses) },
    { label: 'Net profit', value: inr(report.netProfit) },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <div className="btn-group">
            {['daily', 'weekly', 'monthly', 'custom'].map((p) => (
              <button key={p} className={`btn btn-sm ${period === p ? 'btn-dark' : 'btn-outline-dark'}`} onClick={() => setPeriod(p)}>
                {p === 'daily' ? 'Today (24h)' : p === 'weekly' ? '7 days' : p === 'monthly' ? '30 days' : 'Custom'}
              </button>
            ))}
          </div>
          {period === 'custom' && (
            <>
              <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              <span className="text-muted">to</span>
              <input type="date" className="form-control form-control-sm" style={{ width: 150 }} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </>
          )}
        </div>
        <button className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={download}><Download size={13} /> Export CSV</button>
      </div>
      <p className="text-muted small">Revenue counts completed orders only; order counts exclude cancellations unless stated.</p>

      <div className="row g-3 mb-4">
        {kpis.map((k) => (
          <div className="col-6 col-md-3" key={k.label}>
            <div className="card card-stat p-3 text-center h-100">
              <div className="text-muted small">{k.label}</div>
              <div className="fs-4 fw-bold">{k.value}</div>
              <Delta value={k.delta} />
            </div>
          </div>
        ))}
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-8">
          <div className="card chart-card h-100">
            <h6>Revenue trend</h6>
            {sales.length > 1 ? <LineChart data={sales.map((r) => ({ label: r.date.slice(5), value: Number(r.revenue) }))} prefix="₹" /> : <BarChart data={sales.map((r) => ({ label: r.date.slice(5), value: Number(r.revenue) }))} prefix="₹" />}
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card chart-card h-100"><h6>Order type</h6><DonutChart data={report.byOrderType.map((r) => ({ name: r.name, value: Number(r.orders) }))} /></div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-6">
          <div className="card chart-card h-100"><h6>Peak hours (orders by hour)</h6>
            {hasHours ? <BarChart data={report.byHour.map((h) => ({ label: `${h.hour}h`, value: h.orders }))} color="#1ba672" /> : <p className="text-muted small mb-0">No data.</p>}
          </div>
        </div>
        <div className="col-lg-3">
          <div className="card chart-card h-100"><h6>Payment methods</h6><DonutChart prefix="₹" data={report.byPayment.map((r) => ({ name: r.name, value: Number(r.revenue) }))} /></div>
        </div>
        <div className="col-lg-3">
          <div className="card chart-card h-100"><h6>Revenue by category</h6><RankBars prefix="₹" color="#2f6fed" data={report.byCategory.map((r) => ({ name: r.name, value: Number(r.revenue) }))} /></div>
        </div>
      </div>

      {report.expensesByCategory.length > 0 && (
        <div className="row g-3 mb-3">
          <div className="col-lg-6"><div className="card chart-card h-100"><h6>Where the money went</h6><RankBars prefix="₹" color="#ff4b3e" data={report.expensesByCategory} /></div></div>
        </div>
      )}

      <div className="row g-3 mb-3">
        {showPopularItems && (
          <div className="col-lg-6">
            <div className="card chart-card h-100"><h6>Popular food items</h6><RankBars data={report.popularItems.map((r) => ({ name: r.name, value: Number(r.count) }))} /></div>
          </div>
        )}
        <div className={showPopularItems ? 'col-lg-6' : 'col-12'}>
          <div className="card chart-card h-100">
            <h6>Top customers</h6>
            <table className="table table-sm mb-0">
              <thead><tr><th>Customer</th><th>Orders</th><th className="text-end">Spent</th></tr></thead>
              <tbody>
                {report.topCustomers.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.orders}</td><td className="text-end">{inr(c.spent)}</td></tr>)}
                {report.topCustomers.length === 0 && <tr><td colSpan={3} className="text-center text-muted">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <h6>Daily breakdown</h6>
        <table className="table table-sm mb-0">
          <thead><tr><th>Date</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>
            {report.sales.map((row) => <tr key={row.date}><td>{row.date}</td><td>{row.orders}</td><td>{inr(row.revenue)}</td></tr>)}
            {report.sales.length === 0 && <tr><td colSpan={3} className="text-center text-muted">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
