import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { ConnectionProvider } from '../context/ConnectionContext.jsx';
import './AppLayout.css';

export default function AppLayout() {
  return (
    <ConnectionProvider>
      <div className="app-shell">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </ConnectionProvider>
  );
}
