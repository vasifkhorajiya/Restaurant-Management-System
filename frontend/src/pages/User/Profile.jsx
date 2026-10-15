import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { User, KeyRound, Gift, MapPin, Trash2, Star, ShieldCheck, Laptop, LogOut } from 'lucide-react';
import { fmtDateTime } from '../../utils/format';
import GmailField from '../../components/GmailField';
import PhoneInput from '../../components/PhoneInput';
import { normalizeGmail, normalizePhone } from '../../utils/contact';
import CustomerLayout from '../../components/CustomerLayout';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({ name: '', email: '', phone: '', loyalty_points: 0, total_orders: 0, total_spent: 0 });
  const [addresses, setAddresses] = useState([]);
  const [addr, setAddr] = useState({ label: 'Home', address_line: '' });
  const [passwords, setPasswords] = useState({ current: '', newPassword: '' });

  const [sessions, setSessions] = useState([]);
  const [events, setEvents] = useState([]);
  const loadSecurity = () => {
    api.get('/auth/sessions').then((res) => setSessions(res.data)).catch(() => {});
    api.get('/auth/security-events').then((res) => setEvents(res.data)).catch(() => {});
  };
  useEffect(loadSecurity, []);
  const revoke = async (id) => { await api.delete(`/auth/sessions/${id}`); toast.success('Device signed out'); loadSecurity(); };
  const logoutOthers = async () => { await api.post('/auth/logout-others'); toast.success('Signed out everywhere else'); loadSecurity(); };
  const deviceName = (ua = '') => (/Mobile|Android|iPhone/i.test(ua) ? 'Phone' : 'Computer') + (/Chrome/.test(ua) ? ' · Chrome' : /Firefox/.test(ua) ? ' · Firefox' : /Safari/.test(ua) ? ' · Safari' : '');

  const loadAddresses = () => api.get('/user/addresses').then((res) => setAddresses(res.data)).catch(() => {});

  useEffect(() => {
    api.get('/user/profile').then((res) => { setProfile(res.data); setOriginal({ email: res.data.email, phone: res.data.phone }); }).catch(() => {});
    loadAddresses();
  }, []);

  const addAddress = async (e) => {
    e.preventDefault();
    try {
      await api.post('/user/addresses', addr);
      toast.success('Address saved');
      setAddr({ label: 'Home', address_line: '' });
      loadAddresses();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save address');
    }
  };
  const makeDefault = async (id) => { await api.patch(`/user/addresses/${id}/default`); loadAddresses(); };
  const removeAddress = async (id) => {
    if (!window.confirm('Remove this address?')) return;
    await api.delete(`/user/addresses/${id}`);
    loadAddresses();
  };

  const [original, setOriginal] = useState({ email: '', phone: '' });   // to know whether Gmail / mobile were edited
  const [currentPassword, setCurrentPassword] = useState('');
  const contactChanged = profile.email !== original.email || (profile.phone || '') !== (original.phone || '');

  const saveProfile = async (e) => {
    e.preventDefault();
    const g = normalizeGmail(profile.email);
    if (!g.ok) return toast.error(g.error);
    const ph = normalizePhone(profile.phone);
    if (!ph.ok) return toast.error(ph.error);
    try {
      const res = await api.put('/user/profile', { name: profile.name, email: profile.email, phone: profile.phone, current_password: currentPassword });
      toast.success(res.data.message);
      updateUser({ name: res.data.name, email: res.data.email, phone: res.data.phone });
      setProfile((p) => ({ ...p, email: res.data.email, phone: res.data.phone }));
      setOriginal({ email: res.data.email, phone: res.data.phone });
      setCurrentPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    try {
      await api.put('/user/change-password', {
        current_password: passwords.current,
        new_password: passwords.newPassword,
      });
      toast.success('Password changed');
      setPasswords({ current: '', newPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password change failed');
    }
  };

  return (
    <CustomerLayout>
      <div className="d-flex align-items-center gap-3 mb-4">
        <div
          className="d-flex align-items-center justify-content-center"
          style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--brand)', color: '#fff' }}
        >
          <User size={28} />
        </div>
        <div>
          <h5 className="mb-0">{profile.name || 'Your Profile'}</h5>
          <p className="text-muted mb-0" style={{ fontSize: 13.5 }}>{profile.email}</p>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-4"><div className="card p-3 text-center"><div className="text-muted small">Loyalty points</div><div className="fs-4 fw-bold d-flex justify-content-center align-items-center gap-1"><Gift size={18} color="var(--brand)" />{profile.loyalty_points}</div><div className="text-muted" style={{ fontSize: 11.5 }}>1 point = ₹1 off</div></div></div>
        <div className="col-4"><div className="card p-3 text-center"><div className="text-muted small">Orders</div><div className="fs-4 fw-bold">{profile.total_orders}</div></div></div>
        <div className="col-4"><div className="card p-3 text-center"><div className="text-muted small">Total spent</div><div className="fs-4 fw-bold">₹{Number(profile.total_spent).toLocaleString('en-IN')}</div></div></div>
      </div>

      <div className="row g-4">
        <div className="col-md-6">
          <div className="card p-4 h-100">
            <div className="d-flex align-items-center gap-2 mb-3">
              <User size={16} color="var(--brand)" />
              <h6 className="mb-0">Profile Details</h6>
            </div>
            <form onSubmit={saveProfile}>
              <div className="mb-3">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">Gmail address</label>
                <GmailField value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} required />
              </div>
              <div className="mb-3">
                <label className="form-label">Mobile number</label>
                <PhoneInput key={original.phone || 'p'} value={profile.phone || ''} onChange={(v) => setProfile({ ...profile, phone: v })} required />
                <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>Country code + exactly 10 digits.</div>
              </div>
              {contactChanged && (
                <div className="mb-3">
                  <label className="form-label">Current password <span className="text-muted fw-normal">(needed to change your Gmail or number)</span></label>
                  <input type="password" className="form-control" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
                </div>
              )}
              <button className="btn btn-dark btn-sm">Save Profile</button>
            </form>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card p-4 h-100">
            <div className="d-flex align-items-center gap-2 mb-3">
              <KeyRound size={16} color="var(--brand)" />
              <h6 className="mb-0">Change Password</h6>
            </div>
            <form onSubmit={changePassword}>
              <div className="mb-3">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  required
                />
              </div>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={passwords.newPassword}
                  onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                  required
                />
              </div>
              <button className="btn btn-dark btn-sm">Change Password</button>
            </form>
          </div>
        </div>
      </div>

      <div className="card p-4 mt-4">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
          <div className="d-flex align-items-center gap-2">
            <ShieldCheck size={16} color="var(--rating)" />
            <h6 className="mb-0">Security</h6>
          </div>
        </div>
        <p className="text-muted small">Sign out any device you don't recognise. Changing your password signs out all your other devices.</p>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong style={{ fontSize: 13.5 }}>Where you're logged in</strong>
          {sessions.length > 1 && <button className="btn btn-sm btn-link p-0 d-flex align-items-center gap-1" onClick={logoutOthers}><LogOut size={13} /> Sign out all other devices</button>}
        </div>
        {sessions.map((s) => (
          <div key={s.id} className="d-flex justify-content-between align-items-center border-bottom py-2" style={{ fontSize: 13 }}>
            <span className="d-flex align-items-center gap-2"><Laptop size={15} /> {deviceName(s.user_agent)} <span className="text-muted">· {s.ip || 'unknown IP'} · active {fmtDateTime(s.last_seen)}</span>{s.current && <span className="badge bg-success">This device</span>}</span>
            {!s.current && <button className="btn btn-sm btn-outline-danger" onClick={() => revoke(s.id)}>Sign out</button>}
          </div>
        ))}
        <strong className="d-block mt-3 mb-2" style={{ fontSize: 13.5 }}>Recent security activity</strong>
        {events.length === 0 && <p className="text-muted small mb-0">Nothing yet.</p>}
        {events.slice(0, 8).map((e) => (
          <div key={e.id} className="d-flex justify-content-between text-muted" style={{ fontSize: 12.5 }}>
            <span>{e.event.replace(/_/g, ' ')}{e.details ? ` · ${e.details}` : ''}</span><span>{fmtDateTime(e.created_at)}</span>
          </div>
        ))}
      </div>

      <div className="card p-4 mt-4">
        <div className="d-flex align-items-center gap-2 mb-3">
          <MapPin size={16} color="var(--brand)" />
          <h6 className="mb-0">Saved Addresses</h6>
        </div>
        <div className="row g-3 mb-3">
          {addresses.length === 0 && <p className="text-muted small px-2">No saved addresses yet.</p>}
          {addresses.map((a) => (
            <div className="col-md-6" key={a.id}>
              <div className={`choice-card${a.is_default ? ' selected' : ''}`}>
                <div className="d-flex justify-content-between">
                  <strong style={{ fontSize: 13.5 }}>{a.label}{a.is_default && ' · Default'}</strong>
                  <button className="btn btn-sm btn-link text-danger p-0" onClick={() => removeAddress(a.id)}><Trash2 size={15} /></button>
                </div>
                <div className="text-muted" style={{ fontSize: 12.5 }}>{a.address_line}</div>
                {!a.is_default && <button className="btn btn-sm btn-link p-0 mt-1" onClick={() => makeDefault(a.id)}>Make default</button>}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={addAddress} className="row g-2">
          <div className="col-md-3">
            <select className="form-control" value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })}>
              <option>Home</option><option>Work</option><option>Other</option>
            </select>
          </div>
          <div className="col-md-7">
            <input className="form-control" placeholder="Flat / street / area / landmark" value={addr.address_line} onChange={(e) => setAddr({ ...addr, address_line: e.target.value })} required minLength={5} />
          </div>
          <div className="col-md-2"><button className="btn btn-dark w-100">Add</button></div>
        </form>
      </div>
    </CustomerLayout>
  );
}
