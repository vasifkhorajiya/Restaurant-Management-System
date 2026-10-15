import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Attach JWT token to every request automatically.
// sessionStorage, not localStorage — see AuthContext.jsx for why
// (keeps each browser tab's login independent).
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto logout on 401 (expired/invalid token)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only an EXPIRED/REVOKED session should bounce to /login. A wrong password
    // is also a 401, but there the page must stay put so it can show the error message.
    const hadSession = !!sessionStorage.getItem('token');
    if (error.response?.status === 401 && hadSession && !error.config?.url?.startsWith('/auth/')) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
