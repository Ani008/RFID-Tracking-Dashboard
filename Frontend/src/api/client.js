import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

// Request interceptor: attach Authorization Bearer token if available
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('rfid_auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle token expiration and surface consistent error message shape
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // If we get an unauthorized error on a non-login endpoint, clear invalid token
      const isLoginRequest = err.config?.url?.includes('/auth/login');
      if (!isLoginRequest && localStorage.getItem('rfid_auth_token')) {
        localStorage.removeItem('rfid_auth_token');
        localStorage.removeItem('rfid_auth_user');
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }

    const message =
      err.response?.data?.error ||
      (Array.isArray(err.response?.data?.errors) ? err.response.data.errors.join(', ') : null) ||
      err.message ||
      'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
