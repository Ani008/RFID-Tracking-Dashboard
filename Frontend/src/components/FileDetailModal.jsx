import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { fetchFile } from '../api/files.js';
import { LocationBadge, DirectionBadge } from './StatusBadge.jsx';
import './FileDetailModal.css';

export default function FileDetailModal({ fileId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchFile(fileId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {error && <div className="modal-error">{error}</div>}

        {!data && !error && <div className="modal-loading">Loading…</div>}

        {data && (
          <>
            <div className="modal-header">
              <div>
                <h2>{data.file.fileName}</h2>
                <p className="modal-subtitle">
                  {data.file.fileId} · {data.file.caseId} — {data.file.caseName}
                </p>
              </div>
              <LocationBadge location={data.file.currentLocation} />
            </div>

            <div className="modal-meta">
              <div>
                <span className="modal-meta-label">RFID Tag</span>
                <span className="mono">{data.file.rfidTag}</span>
              </div>
              <div>
                <span className="modal-meta-label">Last Movement</span>
                <span>
                  {data.file.lastMovementAt ? new Date(data.file.lastMovementAt).toLocaleString() : '—'}
                </span>
              </div>
            </div>

            <h3 className="modal-history-title">Movement History</h3>

            {data.history.length === 0 ? (
              <div className="modal-empty">No movements recorded for this file yet.</div>
            ) : (
              <ul className="timeline">
                {data.history.map((m) => (
                  <li key={m._id} className="timeline-item">
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-row">
                        <DirectionBadge direction={m.direction} />
                        <span className="timeline-gate">
                          {m.gateId === 'COURT_ROOM_DOOR' ? 'Court Room Door' : 'Shelf Room Door'}
                        </span>
                        <span className="timeline-time">{new Date(m.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="timeline-sub">
                        Resulting location: {m.resultingLocation} · device {m.deviceId || '—'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
