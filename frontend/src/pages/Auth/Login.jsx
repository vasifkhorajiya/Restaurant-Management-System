import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const home = (role) => (role === 'admin' ? '/admin' : role === 'manager' ? '/manager' : '/user');

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(home(user.role));
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="mark"><UtensilsCrossed size={22} /></div>
          <span className="name">Spice Route</span>
        </div>

        <h4>Log in</h4>
        <p className="sub">Order food, book a table, or manage your restaurant.</p>
        {params.get('reason') === 'idle' && <div className="alert alert-warning py-2">You were logged out after 30 minutes of inactivity.</div>}
        {params.get('reset') === '1' && <div className="alert alert-success py-2">Password updated — log in with your new password.</div>}
        {error && <div className="alert alert-danger py-2">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn btn-dark w-100" disabled={loading}>{loading ? 'Logging in…' : 'Log in'}</button>
        </form>

        <p className="text-center mt-3 mb-1" style={{ fontSize: 13.5 }}>New here? <Link to="/register">Create an account</Link></p>
        <p className="text-center mb-0" style={{ fontSize: 13.5 }}><Link to="/forgot-password">Forgot password?</Link></p>
      </div>
    </div>
  );
}
