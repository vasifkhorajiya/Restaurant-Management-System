import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plug, Mail, Smartphone, CreditCard, Radio, Database, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import DashboardLayout from '../../components/DashboardLayout';
import PageHeader from '../../components/PageHeader';
import GmailField from '../../components/GmailField';
import PhoneInput from '../../components/PhoneInput';
import api from '../../services/api';
import { fmtDateTime } from '../../utils/format';

const STATUS = { sent: 'bg-success', demo: 'bg-warning text-dark', failed: 'bg-danger' };

function Card({ icon: Icon, title, ok, lines, warn }) {
  return (
    <div className="card p-3 h-100">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div className="d-flex align-items-center gap-2"><Icon size={18} color="var(--brand)" /><strong>{title}</strong></div>
        {ok ? <CheckCircle2 size={18} color="var(--rating)" /> : <AlertTriangle size={18} color="#f59e0b" />}
      </div>
      {lines.map((l) => <div key={l} className="text-muted" style={{ fontSize: 13 }}>{l}</div>)}
      {warn && <div className="mt-2 small" style={{ color: '#92660a' }}>{warn}</div>}
    </div>
  );
}

export default function Integrations() {
  const [info, setInfo] = useState(null);
  const [log, setLog] = useState([]);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState('');

  const load = () => {
    api.get('/admin/integrations').then((r) => setInfo(r.data)).catch(() => toast.error('Could not load integrations'));
    api.get('/admin/notification-log').then((r) => setLog(r.data)).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const test = async (channel, to) => {
    setBusy(channel);
    try {
      const r = await api.post('/admin/integrations/test', { channel, to });
      (r.data.status === 'sent' ? toast.success : toast)(r.data.message);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Test failed');
      load();
    } finally { setBusy(''); }
  };

  if (!info) return <DashboardLayout><p className="text-muted">Loading…</p></DashboardLayout>;

  return (
    <DashboardLayout>
      <PageHeader icon={Plug} title="Integrations" subtitle="Email, SMS, payments and real-time — and proof that they work." />

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-4"><Card icon={Mail} title="Email (Gmail SMTP)" ok={info.email.configured}
          lines={info.email.configured ? [`Sending from ${info.email.from}`, `via ${info.email.provider}`] : ['Not configured']}
          warn={!info.email.configured && 'Demo mode: receipts and password-reset emails are NOT sent. Set SMTP_USER and SMTP_PASS in backend/.env (Gmail app password).'} /></div>
        <div className="col-md-6 col-lg-4"><Card icon={Smartphone} title="SMS" ok={info.sms.configured}
          lines={info.sms.configured ? [`Provider: ${info.sms.provider}`] : ['Not configured']}
          warn={!info.sms.configured && (info.sms.requested ? `SMS_PROVIDER=${info.sms.requested} is set but its credentials are incomplete.` : 'Demo mode: "order ready" texts are NOT sent. Set SMS_PROVIDER (twilio or fast2sms) and its keys in backend/.env.')} /></div>
        <div className="col-md-6 col-lg-4"><Card icon={CreditCard} title="Payments" ok lines={[info.payments.provider, `Key: ${info.payments.key_id}`]} /></div>
        <div className="col-md-6 col-lg-4"><Card icon={Radio} title="Real-time" ok lines={[info.realtime.transport, `${info.realtime.connectedStreams} live connection(s) right now`]} /></div>
        <div className="col-md-6 col-lg-4"><Card icon={Database} title="PostgreSQL database" ok={info.database === 'connected'} lines={[`Status: ${info.database}`, `Environment: ${info.environment}`]} /></div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6"><div className="card p-3">
          <h6 className="d-flex align-items-center gap-2"><Mail size={16} /> Send a test email</h6>
          <GmailField value={email} onChange={setEmail} placeholder="your Gmail address" />
          <button className="btn btn-dark btn-sm mt-3 align-self-start" disabled={busy === 'email' || !email} onClick={() => test('email', email)}>{busy === 'email' ? 'Sending…' : 'Send test email'}</button>
        </div></div>
        <div className="col-md-6"><div className="card p-3">
          <h6 className="d-flex align-items-center gap-2"><Smartphone size={16} /> Send a test SMS</h6>
          <PhoneInput value={phone} onChange={setPhone} />
          <button className="btn btn-dark btn-sm mt-3 align-self-start" disabled={busy === 'sms' || !phone} onClick={() => test('sms', phone)}>{busy === 'sms' ? 'Sending…' : 'Send test SMS'}</button>
        </div></div>
      </div>

      <div className="card"><div className="card-header bg-white fw-semibold">Delivery log <span className="text-muted fw-normal small">— last 200 messages (recipients are masked, content is never stored)</span></div>
        <div className="table-responsive"><table className="table table-sm mb-0">
          <thead><tr><th>When</th><th>Channel</th><th>To</th><th>Type</th><th>Status</th><th>Error</th></tr></thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id}><td className="text-nowrap">{fmtDateTime(l.created_at)}</td><td>{l.channel === 'email' ? '✉️ Email' : '📱 SMS'}</td><td>{l.recipient}</td><td><code>{l.kind}</code></td>
                <td><span className={`badge ${STATUS[l.status]}`}>{l.status}</span></td><td className="text-muted small">{l.error}</td></tr>
            ))}
            {log.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-4">No messages yet.</td></tr>}
          </tbody></table></div></div>
    </DashboardLayout>
  );
}
