import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { fetchCourtRoomFiles } from '../api/reports.js';
import { useConnection } from '../context/ConnectionContext.jsx';
import '../styles/forms.css';
import './CourtRoomStatus.css';

function durationSince(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${mins}m`;
}

export default function CourtRoomStatus() {
  const { lastMovement } = useConnection();
  const [files, setFiles] = useState([]);
  const [thresholdHours, setThresholdHours] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchCourtRoomFiles();
      setFiles(res.items);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000); // keep durations fresh even with no new scans
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (lastMovement) load();
  }, [lastMovement, load]);

  const cutoff = Date.now() - thresholdHours * 3600000;

  return (
    <div>
      <PageHeader
        title="Court Room Status"
        subtitle="Files currently in the courtroom, sorted by how long they've been there"
      />

      <div className="threshold-bar">
        <label htmlFor="threshold">Flag files in court room longer than</label>
        <input
          id="threshold"
          type="number"
          min={1}
          max={24}
          value={thresholdHours}
          onChange={(e) => setThresholdHours(Number(e.target.value) || 1)}
        />
        <span>hours</span>
      </div>

      <div className="panel">
        {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}

        {!error && loading && <div className="panel-empty">Loading…</div>}

        {!error && !loading && files.length === 0 && (
          <div className="panel-empty">No files currently in the court room.</div>
        )}

        {!error && !loading && files.length > 0 && (
          <table className="movement-table">
            <thead>
              <tr>
                <th>File ID</th>
                <th>File Name</th>
                <th>Case</th>
                <th>Entered Court Room</th>
                <th>Time In Court Room</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => {
                const overdue = f.lastMovementAt && new Date(f.lastMovementAt).getTime() < cutoff;
                return (
                  <tr key={f.fileId} className={overdue ? 'row-overdue' : ''}>
                    <td className="mono">{f.fileId}</td>
                    <td>{f.fileName}</td>
                    <td>
                      {f.caseId}
                      <div className="files-case-name">{f.caseName}</div>
                    </td>
                    <td>{f.lastMovementAt ? new Date(f.lastMovementAt).toLocaleString() : '—'}</td>
                    <td>{f.lastMovementAt ? durationSince(f.lastMovementAt) : '—'}</td>
                    <td>
                      {overdue && (
                        <span className="overdue-flag">
                          <AlertTriangle size={13} strokeWidth={2} /> Overdue
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
