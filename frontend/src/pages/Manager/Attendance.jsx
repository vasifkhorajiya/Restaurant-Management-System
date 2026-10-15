import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Clock, LogIn, LogOut } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';

const t = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
const hours = (a, b) => (a && b ? `${((new Date(b) - new Date(a)) / 3600000).toFixed(1)} h` : '');

export default function Attendance() {
  const [data, setData] = useState({ date: '', items: [] });
  const load = () => api.get('/manager/attendance').then((r) => setData(r.data)).catch(() => toast.error('Could not load attendance'));
  useEffect(() => { load(); }, []);

  const act = async (s, what) => {
    try { toast.success((await api.post(`/manager/attendance/${s.id}/${what}`)).data.message); load(); }
    catch (err) { toast.error(err.response?.data?.message || 'Could not update'); }
  };
  const present = data.items.filter((s) => s.check_in && !s.check_out).length;

  return (
    <DashboardLayout>
      <PageHeader icon={Clock} title="Staff Attendance" subtitle={`Today · ${present} on shift right now`} />
      <div className="card"><div className="table-responsive"><table className="table align-middle mb-0">
        <thead><tr><th>Name</th><th>Position</th><th>Shift</th><th>In</th><th>Out</th><th>Worked</th><th /></tr></thead>
        <tbody>
          {data.items.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong></td><td>{s.position}</td><td>{s.shift}</td><td>{t(s.check_in)}</td><td>{t(s.check_out)}</td><td>{hours(s.check_in, s.check_out)}</td>
              <td className="text-end">
                {!s.check_in && <button className="btn btn-sm btn-dark d-flex align-items-center gap-1 ms-auto" onClick={() => act(s, 'check-in')}><LogIn size={13} /> Check in</button>}
                {s.check_in && !s.check_out && <button className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1 ms-auto" onClick={() => act(s, 'check-out')}><LogOut size={13} /> Check out</button>}
              </td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-4">No active staff. Add team members on the Staff page.</td></tr>}
        </tbody></table></div></div>
    </DashboardLayout>
  );
}
