import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginApi, logoutApi, getMeApi } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('rfid_auth_token') || null);
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('rfid_auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // Bootstrap session from token on mount
  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const storedToken = localStorage.getItem('rfid_auth_token');
      if (!storedToken) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const data = await getMeApi();
        if (isMounted && data?.user) {
          setUser(data.user);
          localStorage.setItem('rfid_auth_user', JSON.stringify(data.user));
        }
      } catch (err) {
        console.warn('Session verification failed, logging out:', err.message);
        if (isMounted) {
          setToken(null);
          setUser(null);
          localStorage.removeItem('rfid_auth_token');
          localStorage.removeItem('rfid_auth_user');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    bootstrap();

    const handleUnauthorized = () => {
      setToken(null);
      setUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      isMounted = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (username, password) => {
    const data = await loginApi(username, password);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('rfid_auth_token', data.token);
    localStorage.setItem('rfid_auth_user', JSON.stringify(data.user));
    return data.user;
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch {
      // Ignore network failures on logout
    } finally {
      setToken(null);
      setUser(null);
      localStorage.removeItem('rfid_auth_token');
      localStorage.removeItem('rfid_auth_user');
    }
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(token && user),
    isAdmin: user?.role === 'admin',
    isStaff: user?.role === 'staff',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
