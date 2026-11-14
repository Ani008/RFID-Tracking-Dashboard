import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Scale } from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import { ConnectionProvider } from '../context/ConnectionContext.jsx';
import './AppLayout.css';

export default function AppLayout() {
  // Only matters on small screens, where the sidebar becomes a slide-out menu.
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // Close the menu after navigating to another page.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <ConnectionProvider>
      <div className="app-shell">
        <header className="mobile-topbar">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <Scale size={18} strokeWidth={1.75} className="mobile-topbar-icon" />
          <span className="mobile-topbar-title">High Court · RFID</span>
        </header>

        {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
        <Sidebar open={menuOpen} />

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </ConnectionProvider>
  );
}