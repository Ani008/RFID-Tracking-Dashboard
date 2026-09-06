import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';

const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

// Surface a consistent error message shape to callers.
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.errors?.join(', ') ||
      err.message ||
      'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
