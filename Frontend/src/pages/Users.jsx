import React, { useState, useEffect } from 'react';
import { getUsersApi, createUserApi, updateUserApi, deleteUserApi } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import {
  UserPlus,
  ShieldCheck,
  User,
  KeyRound,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
} from 'lucide-react';
import './Users.css';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    username: '',
    fullName: '',
    role: 'staff',
    password: '',
  });
  const [resetPassword, setResetPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { user: currentUser } = useAuth();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getUsersApi();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      setError('Username and password are required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await createUserApi(formData);
      setIsAddModalOpen(false);
      setFormData({ username: '', fullName: '', role: 'staff', password: '' });
      setSuccessMsg(`User "${formData.username}" created successfully`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (user) => {
    const newActiveState = !user.active;
    const confirmMsg = newActiveState
      ? `Re-activate account for "${user.username}"?`
      : `Deactivate account for "${user.username}"? They will not be able to log in.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setError(null);
      await updateUserApi(user._id || user.id, { active: newActiveState });
      setSuccessMsg(`User "${user.username}" ${newActiveState ? 'activated' : 'deactivated'}`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user status');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetPassword || resetPassword.trim().length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await updateUserApi(selectedUser._id || selectedUser.id, { password: resetPassword.trim() });
      setIsResetModalOpen(false);
      setResetPassword('');
      setSelectedUser(null);
      setSuccessMsg(`Password reset successfully for "${selectedUser.username}"`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Permanently delete account "${user.username}"? This cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      await deleteUserApi(user._id || user.id);
      setSuccessMsg(`User "${user.username}" deleted successfully`);
      setTimeout(() => setSuccessMsg(null), 4000);
      await fetchUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const staffCount = users.filter((u) => u.role === 'staff').length;
  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="users-page">
      <div className="users-header-actions">
        <PageHeader
          title="User Accounts & Roles"
          subtitle="Manage administrative and staff access permissions for the RFID Tracking System"
        />
        <button
          className="btn-primary"
          onClick={() => {
            setError(null);
            setIsAddModalOpen(true);
          }}
        >
          <UserPlus size={18} />
          <span>Add New Account</span>
        </button>
      </div>

      {successMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--green-bg)',
            border: '1px solid rgba(26, 131, 84, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--green-600)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--red-bg)',
            border: '1px solid rgba(195, 63, 52, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--red-600)',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="users-stats">
        <div className="user-stat-card">
          <div className="user-stat-title">Total Accounts</div>
          <div className="user-stat-value">{totalUsers}</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-title">Admins</div>
          <div className="user-stat-value" style={{ color: 'var(--purple-600)' }}>
            {adminCount}
          </div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-title">Staff Members</div>
          <div className="user-stat-value" style={{ color: 'var(--blue-600)' }}>
            {staffCount}
          </div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-title">Active Accounts</div>
          <div className="user-stat-value" style={{ color: 'var(--green-600)' }}>
            {activeCount}
          </div>
        </div>
      </div>

      <div className="users-table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Full Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created Date</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  Loading user accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                  No user accounts found.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.username === currentUser?.username;
                return (
                  <tr key={u._id || u.id}>
                    <td>
                      <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{u.username}</span>
                        {isSelf && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              background: 'var(--accent-100)',
                              color: 'var(--accent-600)',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '4px',
                            }}
                          >
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{u.fullName || '—'}</td>
                    <td>
                      <span className={`user-role-badge ${u.role}`}>
                        {u.role === 'admin' ? <ShieldCheck size={13} /> : <User size={13} />}
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`user-status-badge ${u.active ? 'active' : 'inactive'}`}>
                        {u.active ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div className="user-actions" style={{ justifyContent: 'flex-end' }}>
                        <button
                          className="btn-action"
                          onClick={() => {
                            setSelectedUser(u);
                            setResetPassword('');
                            setIsResetModalOpen(true);
                          }}
                          title="Reset Password"
                        >
                          <KeyRound size={14} />
                          <span>Reset</span>
                        </button>

                        <button
                          className="btn-action"
                          onClick={() => handleToggleActive(u)}
                          title={u.active ? 'Deactivate account' : 'Activate account'}
                          disabled={isSelf && u.role === 'admin'}
                        >
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>

                        {!isSelf && (
                          <button
                            className="btn-action danger"
                            onClick={() => handleDeleteUser(u)}
                            title="Delete user"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Create User Account</h3>
              <button className="modal-close-btn" onClick={() => setIsAddModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Username (Unique)</label>
                  <input
                    type="text"
                    className="login-input"
                    placeholder="e.g. clerk_ramesh"
                    style={{ background: 'var(--bg)', color: 'var(--text)', padding: '0.75rem 1rem' }}
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name</label>
                  <input
                    type="text"
                    className="login-input"
                    placeholder="e.g. Ramesh Kumar"
                    style={{ background: 'var(--bg)', color: 'var(--text)', padding: '0.75rem 1rem' }}
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select
                    className="login-input"
                    style={{ background: 'var(--bg)', color: 'var(--text)', padding: '0.75rem 1rem' }}
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="staff">Staff (Operational access only)</option>
                    <option value="admin">Admin (Full administrative access)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Temporary Password (Min 6 chars)</label>
                  <input
                    type="password"
                    className="login-input"
                    placeholder="Minimum 6 characters"
                    style={{ background: 'var(--bg)', color: 'var(--text)', padding: '0.75rem 1rem' }}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {isResetModalOpen && selectedUser && (
        <div className="modal-overlay" onClick={() => setIsResetModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reset Password: {selectedUser.username}</h3>
              <button className="modal-close-btn" onClick={() => setIsResetModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                  Set a new password for account <strong>{selectedUser.username}</strong> ({selectedUser.fullName || selectedUser.role}).
                </p>
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input
                    type="password"
                    className="login-input"
                    placeholder="Enter at least 6 characters"
                    style={{ background: 'var(--bg)', color: 'var(--text)', padding: '0.75rem 1rem' }}
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-action"
                  onClick={() => setIsResetModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
