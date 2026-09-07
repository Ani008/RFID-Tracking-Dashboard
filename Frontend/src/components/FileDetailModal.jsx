import React, { useEffect, useState } from 'react';
import { X, Edit3, History, ShieldCheck, Activity } from 'lucide-react';
import { fetchFile } from '../api/files.js';
import { LocationBadge, DirectionBadge } from './StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import EditFileModal from './EditFileModal.jsx';
import './FileDetailModal.css';

export default function FileDetailModal({ fileId, onClose, onFileUpdated }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('movements'); // 'movements' | 'audit'
  const [isEditing, setIsEditing] = useState(false);

  const { isAdmin } = useAuth();

  const loadData = () => {
    fetchFile(fileId)
      .then((res) => setData(res))
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadData();
  }, [fileId]);

  const handleEditSuccess = (updatedFile) => {
    loadData();
    if (onFileUpdated) onFileUpdated(updatedFile);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        {error && <div className="modal-error">{error}</div>}

        {!data && !error && <div className="modal-loading">Loading file details…</div>}

        {data && (
          <>
            <div className="modal-header">
              <div>
                <h2>{data.file.fileName}</h2>
                <p className="modal-subtitle">
                  {data.file.fileId} · {data.file.caseId} — {data.file.caseName}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LocationBadge location={data.file.currentLocation} />
                {isAdmin && (
                  <button
                    className="btn-action"
                    style={{ background: 'var(--accent-100)', color: 'var(--accent-600)', border: 'none' }}
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit3 size={14} />
                    <span>Edit Record</span>
                  </button>
                )}
              </div>
            </div>

            <div className="modal-meta">
              <div>
                <span className="modal-meta-label">RFID EPC Tag</span>
                <span className="mono" style={{ fontWeight: 600 }}>{data.file.rfidTag}</span>
              </div>
              <div>
                <span className="modal-meta-label">Last Movement</span>
                <span>
                  {data.file.lastMovementAt ? new Date(data.file.lastMovementAt).toLocaleString() : '—'}
                </span>
              </div>
              <div>
                <span className="modal-meta-label">Registration Date</span>
                <span>
                  {data.file.createdAt ? new Date(data.file.createdAt).toLocaleDateString() : '—'}
                </span>
              </div>
            </div>

            <div className="modal-tabs">
              <button
                className={`modal-tab-btn ${activeTab === 'movements' ? 'active' : ''}`}
                onClick={() => setActiveTab('movements')}
              >
                <Activity size={15} />
                <span>Movement History ({data.history?.length || 0})</span>
              </button>
              <button
                className={`modal-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                onClick={() => setActiveTab('audit')}
              >
                <ShieldCheck size={15} />
                <span>Audit Trail ({data.auditTrail?.length || 0})</span>
              </button>
            </div>

            {activeTab === 'movements' && (
              <>
                {data.history?.length === 0 ? (
                  <div className="modal-empty">No physical scan movements recorded for this file yet.</div>
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
                            Resulting location: <strong>{m.resultingLocation}</strong> · device {m.deviceId || '—'}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {activeTab === 'audit' && (
              <>
                {(!data.auditTrail || data.auditTrail.length === 0) ? (
                  <div className="modal-empty">No record edits or tag reassignments logged yet.</div>
                ) : (
                  <ul className="timeline">
                    {data.auditTrail.map((a) => (
                      <li key={a._id} className="timeline-item">
                        <div className="timeline-dot audit" />
                        <div className="timeline-content">
                          <div className="timeline-row">
                            <span className="audit-change-badge">{a.action}</span>
                            <span className="timeline-gate">by @{a.username}</span>
                            <span className="timeline-time">{new Date(a.timestamp).toLocaleString()}</span>
                          </div>

                          {a.reason && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              Note: "{a.reason}"
                            </div>
                          )}

                          {a.before && Object.keys(a.before).length > 0 && (
                            <div className="audit-diff-box">
                              {Object.keys(a.before).map((k) => (
                                <div key={k}>
                                  <strong>{k}:</strong> <span style={{ textDecoration: 'line-through', color: 'var(--red-600)' }}>{String(a.before[k])}</span> → <span style={{ color: 'var(--green-600)', fontWeight: 600 }}>{String(a.after[k])}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}

        {isEditing && data?.file && (
          <EditFileModal
            file={data.file}
            onClose={() => setIsEditing(false)}
            onSaveSuccess={handleEditSuccess}
          />
        )}
      </div>
    </div>
  );
}
