import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Edit3, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { LocationBadge } from '../components/StatusBadge.jsx';
import FileDetailModal from '../components/FileDetailModal.jsx';
import EditFileModal from '../components/EditFileModal.jsx';
import { fetchFiles, deleteFile } from '../api/files.js';
import { useConnection } from '../context/ConnectionContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './CaseFiles.css';

const LOCATIONS = [
  { value: '', label: 'All locations' },
  { value: 'SHELF_ROOM', label: 'Shelf Room' },
  { value: 'COURT_ROOM', label: 'Court Room' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
];

export default function CaseFiles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lastMovement } = useConnection();
  const { isAdmin } = useAuth();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: string }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (location) params.location = location;
      const res = await fetchFiles(params);
      setFiles(res.items);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, location]);

  useEffect(() => {
    load();
  }, [load]);

  // Live-refresh the table when a new movement comes in.
  useEffect(() => {
    if (lastMovement) load();
  }, [lastMovement, load]);

  function handleSubmit(e) {
    e.preventDefault();
    const next = {};
    if (search) next.search = search;
    if (location) next.location = location;
    setSearchParams(next);
    load();
  }

  async function handleConfirmDelete() {
    if (!fileToDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteFile(fileToDelete.fileId);
      setNotification({
        type: 'success',
        message: `File ${fileToDelete.fileId} and all associated movement history have been wiped.`,
      });
      setFileToDelete(null);
      await load();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Case Files" subtitle="Every registered file and its current physical location" />

      {notification && (
        <div className={`casefiles-notification ${notification.type}`}>
          <CheckCircle2 size={16} />
          <span>{notification.message}</span>
        </div>
      )}

      <form className="files-toolbar" onSubmit={handleSubmit}>
        <div className="files-search-input">
          <Search size={15} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search by file ID, case, or RFID tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          {LOCATIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button type="submit">Apply</button>
      </form>

      <div className="panel">
        {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}

        {!error && loading && <div className="panel-empty">Loading files…</div>}

        {!error && !loading && files.length === 0 && (
          <div className="panel-empty">No files match these filters yet.</div>
        )}

        {!error && !loading && files.length > 0 && (
          <table className="files-table">
            <thead>
              <tr>
                <th>File ID</th>
                <th>File Name</th>
                <th>Case</th>
                <th>Location</th>
                <th>Last Movement</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.fileId} className="clickable-row">
                  <td className="mono" onClick={() => setSelectedFileId(f.fileId)}>{f.fileId}</td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>{f.fileName}</td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div>{f.caseId}</div>
                    <div className="files-case-name">{f.caseName}</div>
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <LocationBadge location={f.currentLocation} />
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>{f.lastMovementAt ? new Date(f.lastMovementAt).toLocaleString() : '—'}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="casefiles-actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn-action"
                          onClick={() => setEditingFile(f)}
                          title="Edit File Record"
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          className="btn-action btn-action-delete"
                          onClick={() => setFileToDelete(f)}
                          title="Permanently Delete File Record"
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedFileId && (
        <FileDetailModal
          fileId={selectedFileId}
          onClose={() => setSelectedFileId(null)}
          onFileUpdated={load}
        />
      )}

      {editingFile && (
        <EditFileModal
          file={editingFile}
          onClose={() => setEditingFile(null)}
          onSaveSuccess={load}
        />
      )}

      {fileToDelete && (
        <div className="modal-backdrop" onClick={() => !deleting && setFileToDelete(null)}>
          <div className="delete-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <div className="delete-modal-icon-badge">
                <AlertTriangle size={22} color="#dc2626" />
              </div>
              <div>
                <h3>Delete Case File</h3>
                <p className="delete-modal-subtitle">Permanent action — data cannot be recovered</p>
              </div>
            </div>

            <div className="delete-modal-body">
              <p>
                Are you sure you want to permanently delete file <strong className="mono">{fileToDelete.fileId}</strong> (<em>{fileToDelete.fileName}</em>)?
              </p>
              <div className="delete-warning-box">
                <strong>⚠️ Warning:</strong> All data regarding this file, including its paired RFID tag (<span className="mono">{fileToDelete.rfidTag}</span>), movement logs, and audit trail, will be <strong>completely wiped from the system</strong>.
              </div>
            </div>

            <div className="delete-modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                disabled={deleting}
                onClick={() => setFileToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                disabled={deleting}
                onClick={handleConfirmDelete}
              >
                {deleting ? 'Wiping Data…' : 'Delete & Wipe All Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
