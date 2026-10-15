import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UtensilsCrossed, MailCheck } from 'lucide-react';
import api from '../../services/api';
import GmailField from '../../components/GmailField';
import { normalizeGmail } from '../../utils/contact';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null); // server response
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    const g = normalizeGmail(email);
    if (!g.ok) return setError(g.error);
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: g.email });
      setDone(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo"><div className="mark"><UtensilsCrossed size={22} /></div><span className="name">Spice Route</span></div>
        <h4>Forgot password</h4>

        {done ? (
          <>
            <div className="d-flex align-items-start gap-2 mb-3" style={{ fontSize: 14 }}>
              <MailCheck size={20} color="var(--rating)" className="flex-shrink-0 mt-1" />
              <span>{done.message} The link works once and expires in 1 hour.</span>
            </div>
            {done.dev_reset_link && (
              <div className="alert alert-warning py-2" style={{ fontSize: 13 }}>
                Demo mode (no email provider connected): <a href={done.dev_reset_link}>open your reset link</a>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="sub">Enter your Gmail address and we'll email you a link to choose a new password.</p>
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <form onSubmit={send}>
              <div className="mb-3">
                <label className="form-label">Gmail address</label>
                <GmailField value={email} onChange={setEmail} required />
              </div>
              <button className="btn btn-dark w-100" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
            </form>
          </>
        )}
        <p className="text-center mt-3 mb-0" style={{ fontSize: 13.5 }}><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}
