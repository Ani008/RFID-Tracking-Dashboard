import { useConnection } from '../context/ConnectionContext.jsx';
import './PageHeader.css';

export default function PageHeader({ title, subtitle, actions }) {
  const { isConnected } = useConnection();

  return (
    <header className="page-header">
      <div>
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>

      <div className="page-header-right">
        {actions}
        <span className={`status-pill ${isConnected ? 'status-pill--live' : 'status-pill--down'}`}>
          <span className="status-pill-dot" />
          {isConnected ? 'Live · Mock Reader' : 'Backend Offline'}
        </span>
        <div className="avatar">A</div>
      </div>
    </header>
  );
}
