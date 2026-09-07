import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  Scale,
  LayoutDashboard,
  FolderOpen,
  Tag,
  DoorOpen,
  Activity,
  MapPinned,
  Radio,
  FileBarChart,
  Users as UsersIcon,
  LogOut,
} from 'lucide-react';
import './Sidebar.css';

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navGroups = [
    {
      label: 'Operations',
      items: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/files', label: 'Case Files', icon: FolderOpen },
        ...(isAdmin ? [{ to: '/register', label: 'Register File', icon: Tag }] : []),
        { to: '/simulator', label: 'Reader Simulator', icon: Radio },
      ],
    },
    {
      label: 'Monitoring & Reports',
      items: [
        { to: '/court-room-status', label: 'Court Room Status', icon: MapPinned },
        { to: '/movements', label: 'Movement Log', icon: Activity },
        { to: '/gates', label: 'RFID Gates', icon: DoorOpen },
        { to: '/reports', label: 'Reports', icon: FileBarChart },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: 'Administration',
            items: [{ to: '/users', label: 'User Accounts', icon: UsersIcon }],
          },
        ]
      : []),
  ];

  const initials = (user?.fullName || user?.username || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <Scale size={22} strokeWidth={1.75} />
        </div>
        <div>
          <div className="sidebar-brand-title">High Court</div>
          <div className="sidebar-brand-subtitle">RFID File Tracking</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navGroups.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <div className="sidebar-group-label">{group.label}</div>
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
              >
                <Icon size={17} strokeWidth={1.9} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {user && (
        <div className="sidebar-user-section">
          <div className="sidebar-user-profile">
            <div className="sidebar-user-avatar">{initials}</div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name" title={user.fullName || user.username}>
                {user.fullName || user.username}
              </div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
            <button
              className="sidebar-logout-btn"
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        <span className="sidebar-footer-dot" />
        Reader mode: mock
      </div>
    </aside>
  );
}
