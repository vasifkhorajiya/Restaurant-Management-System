import { LineChart, BarChart, DonutChart, RankBars } from './Charts';
import { inr } from '../utils/format';

const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' });

// The chart block shared by the admin and manager dashboards.
export default function DashboardCharts({ stats }) {
  const trend = stats.trend || [];
  const weekRevenue = trend.reduce((s, d) => s + d.revenue, 0);
  const weekOrders = trend.reduce((s, d) => s + d.orders, 0);

  return (
    <>
      <div className="row g-3 mt-1">
        <div className="col-lg-8">
          <div className="card chart-card h-100">
            <div className="d-flex justify-content-between align-items-start">
              <h6>Revenue — last 7 days</h6>
              <span className="text-muted small">{inr(weekRevenue)} · {weekOrders} orders</span>
            </div>
            <LineChart data={trend.map((d) => ({ label: dayLabel(d.date), value: d.revenue }))} prefix="₹" />
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card chart-card h-100">
            <h6>Orders by status (30 days)</h6>
            <DonutChart data={stats.statusBreakdown || []} />
          </div>
        </div>
      </div>
      <div className="row g-3 mt-1">
        <div className="col-lg-6">
          <div className="card chart-card h-100">
            <h6>Orders per day</h6>
            <BarChart data={trend.map((d) => ({ label: dayLabel(d.date), value: d.orders }))} color="#ffc72c" />
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card chart-card h-100">
            <h6>Top dishes (30 days)</h6>
            <RankBars data={stats.topItems || []} />
          </div>
        </div>
      </div>
    </>
  );
}
