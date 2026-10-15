import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';
import api from '../../services/api';

export default function ResetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return setError('Password needs 8+ characters with uppercase, lowercase and a number');
    }
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      navigate('/login?reset=1');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo"><div className="mark"><UtensilsCrossed size={22} /></div><span className="name">Spice Route</span></div>
        <h4>Choose a new password</h4>
        <p className="sub">This link works once. After saving, you'll be signed out of every device.</p>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={submit}>
          <div className="mb-3"><label className="form-label">New password</label><input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></div>
          <div className="mb-3"><label className="form-label">Confirm password</label><input type="password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></div>
          <button className="btn btn-dark w-100" disabled={loading}>{loading ? 'Saving…' : 'Update password'}</button>
        </form>
        <p className="text-center mt-3 mb-0" style={{ fontSize: 13.5 }}><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}
