import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ScrollText } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import api from '../../services/api';
import { exportCsv } from '../../utils/exportCsv';
import { fmtDateTime } from '../../utils/format';

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [tab, setTab] = useState('activity'); // activity | security
  const [sec, setSec] = useState([]);

  useEffect(() => {
    api.get('/admin/audit-logs', { params: { limit: 500 } }).then((res) => setRows(res.data)).catch(() => toast.error('Could not load the activity log'));
    api.get('/admin/security-events', { params: { limit: 500 } }).then((res) => setSec(res.data)).catch(() => {});
  }, []);

  const q = search.toLowerCase();
  const shown = rows
    .filter((r) => role === 'all' || r.role === role)
    .filter((r) => !q || [r.action, r.user_name, r.entity, r.details].some((v) => String(v || '').toLowerCase().includes(q)));

  return (
    <DashboardLayout>
      <PageHeader
        icon={ScrollText}
        title="Activity Log"
        subtitle="Who changed what, and when — across every restaurant."
        action={<button className="btn btn-outline-dark" onClick={() => exportCsv('activity-log.csv', [
          { key: 'created_at', label: 'When' }, { key: 'user_name', label: 'User' }, { key: 'role', label: 'Role' },
          { key: 'action', label: 'Action' }, { key: 'entity', label: 'Entity' }, { key: 'entity_id', label: 'ID' }, { key: 'details', label: 'Details' },
        ], shown)}>Export CSV</button>}
      />
      <div className="seg-tabs mb-3" style={{ maxWidth: 340 }}>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Activity</button>
        <button className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>Login & security</button>
      </div>
      {tab === 'security' ? (
        <div className="card"><div className="table-responsive"><table className="table mb-0">
          <thead><tr><th>When</th><th>Event</th><th>Account</th><th>IP</th><th>Details</th></tr></thead>
          <tbody>
            {sec.filter((e) => !q || [e.event, e.email, e.ip, e.details].some((v) => String(v || '').toLowerCase().includes(q))).map((e) => (
              <tr key={e.id} className="audit-row">
                <td className="text-nowrap">{fmtDateTime(e.created_at)}</td>
                <td><code style={{ color: /failed|locked|mismatch|unknown/.test(e.event) ? 'var(--danger)' : 'inherit' }}>{e.event}</code></td>
                <td>{e.email || '—'}</td><td>{e.ip || '—'}</td><td className="text-muted">{e.details}</td>
              </tr>
            ))}
            {sec.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-4">No security events yet.</td></tr>}
          </tbody></table></div></div>
      ) : (<>
      <div className="d-flex gap-2 mb-3 flex-wrap">
        <input className="form-control" style={{ maxWidth: 280 }} placeholder="Search action, user, details…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {['all', 'admin', 'manager'].map((r) => (
          <button key={r} className={`filter-pill${role === r ? ' active' : ''}`} onClick={() => setRole(r)}>{r === 'all' ? 'Everyone' : r}</button>
        ))}
      </div>
      <div className="card"><div className="table-responsive"><table className="table mb-0">
        <thead><tr><th>When</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className="audit-row">
              <td className="text-nowrap">{fmtDateTime(r.created_at)}</td>
              <td>{r.user_name || '—'} <span className="badge bg-secondary">{r.role}</span></td>
              <td><code>{r.action}</code></td>
              <td>{r.entity ? `${r.entity}${r.entity_id ? ` #${r.entity_id}` : ''}` : ''}{r.details ? ` · ${r.details}` : ''}</td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-4">No activity recorded yet.</td></tr>}
        </tbody></table></div></div>
      </>)}
    </DashboardLayout>
  );
}
