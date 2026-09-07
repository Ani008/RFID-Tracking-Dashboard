import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // 3D Interactive Image State
  const imagePanelRef = useRef(null);
  const [tiltStyle, setTiltStyle] = useState({});
  const [glareStyle, setGlareStyle] = useState({ opacity: 0 });

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/';

  const handleMouseMove = (e) => {
    if (!imagePanelRef.current) return;
    const rect = imagePanelRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -10; // Max 10 deg tilt
    const rotateY = ((x - centerX) / centerX) * 10;

    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.02, 1.02, 1.02)`,
    });

    setGlareStyle({
      opacity: 0.35,
      background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 65%)`,
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    });
    setGlareStyle({
      opacity: 0,
      transition: 'opacity 0.5s ease',
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please select a role and enter your password');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-modal-container">
        {/* Left Side: Interactive 3D High Court Visual Panel */}
        <div
          ref={imagePanelRef}
          className="login-visual-panel"
          style={tiltStyle}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <img
            src="/high-court.jpg"
            alt="Allahabad High Court Building"
            className="login-court-image"
          />
          <div className="interactive-glare" style={glareStyle} />
        </div>

        {/* Right Side: Modern Minimalist Form Panel */}
        <div className="login-form-panel">
          <h1 className="welcome-title">Welcome Back!</h1>
          <p className="welcome-subtitle">Enter Your Details Below</p>

          {error && (
            <div className="login-error-banner" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
            </div>
          )}

          <form className="modern-form" onSubmit={handleSubmit}>
            {/* Account Role Dropdown */}
            <div className="field-group">
              <label className="field-label" htmlFor="role-select">
                Role
              </label>
              <div className="field-input-container">
                <select
                  id="role-select"
                  className="modern-underline-select"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                >
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
            </div>

            {/* Password Field */}
            <div className="field-group">
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <div className="field-input-container">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="modern-underline-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-options-row">
              <label className="remember-me-checkbox">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
            </div>

            <button
              type="submit"
              className="btn-primary-dark"
              disabled={submitting}
            >
              {submitting ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Log in</span>
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>

          <div className="login-page-footer">
            Official Judicial Record System • Authorized Personnel Only
          </div>
        </div>
      </div>
    </div>
  );
}
