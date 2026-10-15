import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { UtensilsCrossed } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PhoneInput from '../../components/PhoneInput';
import GmailField from '../../components/GmailField';
import { normalizeGmail, normalizePhone } from '../../utils/contact';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const strength = (() => {
    const p = form.password;
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    return p ? Math.max(1, score) : 0;
  })();
  const strengthMeta = [null, ['Weak', 'var(--danger)'], ['Okay', '#f59e0b'], ['Good', 'var(--info)'], ['Strong', 'var(--rating)']][strength];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
      return setError('Password needs 8+ characters with uppercase, lowercase and a number');
    }
    const g = normalizeGmail(form.email);
    if (!g.ok) return setError(g.error);
    const ph = normalizePhone(form.phone);
    if (!ph.ok) return setError(ph.error);
    setLoading(true);
    try {
      await register(form);          // creates the account and signs the customer in
      navigate('/user');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
        <h4>Create account</h4>
        <p className="sub">Use your Gmail address and your mobile number (country code + 10 digits).</p>

        {error && <div className="alert alert-danger py-2">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Full Name</label>
            <input name="name" className="form-control" onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Gmail address</label>
            <GmailField value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
          </div>
          <div className="mb-3">
            <label className="form-label">Mobile number</label>
            <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />
            <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>Country code + exactly 10 digits, e.g. +91 98765 43211</div>
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input type="password" name="password" className="form-control" minLength={8} autoComplete="new-password" onChange={handleChange} required />
            {strengthMeta && (
              <>
                <div className="password-meter"><div style={{ width: `${strength * 25}%`, background: strengthMeta[1] }} /></div>
                <small style={{ color: strengthMeta[1], fontWeight: 600 }}>{strengthMeta[0]}</small>
                <small className="text-muted ms-2">8+ characters, upper &amp; lower case, a number</small>
              </>
            )}
          </div>
          <button className="btn btn-dark w-100" disabled={loading}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p className="text-center mt-3 mb-0" style={{ fontSize: 13.5 }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
