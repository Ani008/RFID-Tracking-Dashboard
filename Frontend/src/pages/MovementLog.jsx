import { useCallback, useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { DirectionBadge } from '../components/StatusBadge.jsx';
import { fetchMovements } from '../api/movements.js';
import { useConnection } from '../context/ConnectionContext.jsx';
import '../styles/forms.css';
import '../pages/Dashboard.css';

const GATES = [
  { value: '', label: 'All gates' },
  { value: 'SHELF_ROOM_DOOR', label: 'Shelf Room Door' },
  { value: 'COURT_ROOM_DOOR', label: 'Court Room Door' },
];

export default function MovementLog() {
  const { lastMovement } = useConnection();
  const [gateId, setGateId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ items: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (gateId) params.gateId = gateId;
      if (from) params.from = new Date(from).toISOString();
      if (to) params.to = new Date(to).toISOString();
      const res = await fetchMovements(params);
      setResult(res);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [gateId, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (lastMovement) load();
  }, [lastMovement, load]);

  function applyFilters(e) {
    e.preventDefault();
    setPage(1);
  }

  return (
    <div>
      <PageHeader title="Movement Log" subtitle="Full scan history across both doorway readers" />

      <form className="toolbar" onSubmit={applyFilters}>
        <select value={gateId} onChange={(e) => setGateId(e.target.value)}>
          {GATES.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit" className="btn-primary">
          Apply
        </button>
      </form>

      <div className="panel">
        {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}

        {!error && loading && <div className="panel-empty">Loading movements…</div>}

        {!error && !loading && result.items.length === 0 && (
          <div className="panel-empty">No movements match these filters.</div>
        )}

        {!error && !loading && result.items.length > 0 && (
          <table className="movement-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>RFID</th>
                <th>File</th>
                <th>Gate</th>
                <th>Movement</th>
                <th>Device</th>
                <th>Resulting Location</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((m) => (
                <tr key={m._id}>
                  <td>{new Date(m.timestamp).toLocaleString()}</td>
                  <td className="mono">{m.rfidTag}</td>
                  <td>{m.fileId}</td>
                  <td>{m.gateId === 'COURT_ROOM_DOOR' ? 'Court Room' : 'Shelf Room'}</td>
                  <td>
                    <DirectionBadge direction={m.direction} />
                  </td>
                  <td>{m.deviceId || '—'}</td>
                  <td>{m.resultingLocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!error && result.totalPages > 1 && (
          <div className="pagination">
            <span>
              Page {result.page} of {result.totalPages} · {result.total} total movements
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
