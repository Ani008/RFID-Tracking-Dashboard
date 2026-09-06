import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  Archive,
  Gavel,
  Repeat,
  Clock,
  AlertTriangle,
  Search,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import SummaryCard from '../components/SummaryCard.jsx';
import { DirectionBadge } from '../components/StatusBadge.jsx';
import { fetchFiles } from '../api/files.js';
import { fetchMovements } from '../api/movements.js';
import { fetchUnknownTags, fetchCourtRoomFiles } from '../api/reports.js';
import { useConnection } from '../context/ConnectionContext.jsx';
import './Dashboard.css';

const OVERDUE_HOURS = 6;

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { lastMovement } = useConnection();

  const [files, setFiles] = useState([]);
  const [movements, setMovements] = useState([]);
  const [todayCount, setTodayCount] = useState(0);
  const [unknownTags, setUnknownTags] = useState([]);
  const [overdueFiles, setOverdueFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [filesRes, movementsRes, todayRes, unknownRes, courtRoomRes] = await Promise.all([
        fetchFiles(),
        fetchMovements({ limit: 8 }),
        fetchMovements({ from: startOfTodayISO(), limit: 1 }),
        fetchUnknownTags({ limit: 3 }),
        fetchCourtRoomFiles(),
      ]);

      setFiles(filesRes.items);
      setMovements(movementsRes.items);
      setTodayCount(todayRes.total);
      setUnknownTags(unknownRes.items);

      const cutoff = Date.now() - OVERDUE_HOURS * 60 * 60 * 1000;
      setOverdueFiles(
        courtRoomRes.items.filter((f) => f.lastMovementAt && new Date(f.lastMovementAt).getTime() < cutoff)
      );

      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Refresh everything whenever a new movement batch comes in over the socket.
  useEffect(() => {
    if (lastMovement) loadAll();
  }, [lastMovement, loadAll]);

  const filesById = useMemo(() => {
    const map = new Map();
    files.forEach((f) => map.set(f.fileId, f));
    return map;
  }, [files]);

  const counts = useMemo(
    () => ({
      total: files.length,
      shelf: files.filter((f) => f.currentLocation === 'SHELF_ROOM').length,
      court: files.filter((f) => f.currentLocation === 'COURT_ROOM').length,
      transit: files.filter((f) => f.currentLocation === 'IN_TRANSIT').length,
    }),
    [files]
  );

  function handleSearchSubmit(e) {
    e.preventDefault();
    navigate(`/files${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`);
  }

  const alerts = [
    ...unknownTags.map((t) => ({
      key: `unknown-${t._id}`,
      title: 'Unrecognized tag scanned',
      detail: `Tag ${t.rfidTag} seen at ${t.gateId === 'COURT_ROOM_DOOR' ? 'the courtroom door' : 'the shelf room door'}, ${timeAgo(t.timestamp)}.`,
    })),
    ...overdueFiles.slice(0, 3).map((f) => ({
      key: `overdue-${f.fileId}`,
      title: 'File overdue from court room',
      detail: `${f.fileId} · ${f.caseName} — not returned for ${timeAgo(f.lastMovementAt).replace(' ago', '')}.`,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="High Court File Tracking"
        subtitle="UHF RFID based automated file movement monitoring"
      />

      {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}

      <div className="summary-grid">
        <SummaryCard icon={FolderOpen} label="Total Case Files" value={loading ? '—' : counts.total} tone="blue" />
        <SummaryCard icon={Archive} label="In Shelf Room" value={loading ? '—' : counts.shelf} tone="green" />
        <SummaryCard icon={Gavel} label="In Court Room" value={loading ? '—' : counts.court} tone="orange" />
        <SummaryCard icon={Repeat} label="In Transit" value={loading ? '—' : counts.transit} tone="purple" />
        <SummaryCard icon={Clock} label="Today's Movements" value={loading ? '—' : todayCount} tone="blue" />
        <SummaryCard
          icon={AlertTriangle}
          label="Overdue in Court"
          value={loading ? '—' : overdueFiles.length}
          tone="red"
        />
      </div>

      <div className="search-card">
        <h2 className="search-card-title">
          <Search size={16} strokeWidth={2} /> Search Case File
        </h2>
        <form className="search-form" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search file ID, case ID, case name, or RFID tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
      </div>

      <div className="dashboard-columns">
        <div className="panel">
          <div className="panel-header">
            <h2>Live RFID File Movement</h2>
            <span className="live-indicator">
              <span className="live-dot" /> Live detection
            </span>
          </div>

          {movements.length === 0 ? (
            <div className="panel-empty">
              No movements recorded yet. Use the Reader Simulator to fire a test scan.
            </div>
          ) : (
            <table className="movement-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>RFID</th>
                  <th>File</th>
                  <th>Case</th>
                  <th>Gate</th>
                  <th>Movement</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const file = filesById.get(m.fileId);
                  return (
                    <tr key={m._id}>
                      <td>{new Date(m.timestamp).toLocaleTimeString()}</td>
                      <td className="mono">{m.rfidTag}</td>
                      <td>{m.fileId}</td>
                      <td>{file?.caseId || '—'}</td>
                      <td>{m.gateId === 'COURT_ROOM_DOOR' ? 'Court Room' : 'Shelf Room'}</td>
                      <td>
                        <DirectionBadge direction={m.direction} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel alerts-panel">
          <div className="panel-header">
            <h2>Critical Alerts</h2>
          </div>

          {alerts.length === 0 ? (
            <div className="panel-empty">No active alerts.</div>
          ) : (
            <ul className="alerts-list">
              {alerts.map((a) => (
                <li key={a.key} className="alert-item">
                  <div className="alert-title">{a.title}</div>
                  <div className="alert-detail">{a.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
