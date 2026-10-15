import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const AuthContext = createContext();

// sessionStorage on purpose, not localStorage — sessionStorage is private
// to each browser TAB (but survives a refresh within that tab). That means
// you can be logged in as a customer in one tab and a manager in another
// tab at the same time, and refreshing either one keeps its own session.
const IDLE_LIMIT_MS = 30 * 60 * 1000; // auto-logout after 30 minutes without activity

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const lastActive = useRef(Date.now());

  const persist = ({ token, user: userData }) => {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('user', JSON.stringify(userData));
    lastActive.current = Date.now();
    setUser(userData);
    return userData;
  };

  const login = async (email, password) => persist((await api.post('/auth/login', { email, password })).data);

  // Registration signs the new customer in straight away
  const register = async (formData) => persist((await api.post('/auth/register', formData)).data);

  const clearLocal = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
  };

  // revokes the session on the server too, so a copied token is useless afterwards
  const logout = useCallback(() => {
    const token = sessionStorage.getItem('token');
    clearLocal(); // the UI logs out instantly
    if (token) api.post('/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  }, []);

  const updateUser = (patch) => {
    setUser((u) => {
      const next = { ...u, ...patch };
      sessionStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  };

  // idle timeout
  useEffect(() => {
    if (!user) return undefined;
    const bump = () => { lastActive.current = Date.now(); };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActive.current > IDLE_LIMIT_MS) {
        clearLocal();
        window.location.href = '/login?reason=idle';
      }
    }, 30000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
