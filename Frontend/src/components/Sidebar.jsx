import { NavLink } from 'react-router-dom';
import {
  Scale,
  LayoutDashboard,
  FolderOpen,
  Tag,
  DoorOpen,
  Activity,
  MapPinned,
  Radio,
  Settings,
} from 'lucide-react';
import './Sidebar.css';

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/files', label: 'Case Files', icon: FolderOpen },
      { to: '/register', label: 'Register File', icon: Tag },
      { to: '/simulator', label: 'Reader Simulator', icon: Radio },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { to: '/court-room-status', label: 'Court Room Status', icon: MapPinned },
      { to: '/movements', label: 'Movement Log', icon: Activity },
      { to: '/gates', label: 'RFID Gates', icon: DoorOpen },
    ],
  },
  {
    label: 'Administration',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
];

export default function Sidebar() {
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
        {NAV_GROUPS.map((group) => (
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

      <div className="sidebar-footer">
        <span className="sidebar-footer-dot" />
        Reader mode: mock
      </div>
    </aside>
  );
}
