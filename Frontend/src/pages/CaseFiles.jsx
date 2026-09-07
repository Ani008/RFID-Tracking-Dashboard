import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Edit3 } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { LocationBadge } from '../components/StatusBadge.jsx';
import FileDetailModal from '../components/FileDetailModal.jsx';
import EditFileModal from '../components/EditFileModal.jsx';
import { fetchFiles } from '../api/files.js';
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

  return (
    <div>
      <PageHeader title="Case Files" subtitle="Every registered file and its current physical location" />

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
                      <button
                        className="btn-action"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFile(f);
                        }}
                        title="Edit File Record"
                      >
                        <Edit3 size={13} />
                        <span>Edit</span>
                      </button>
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
    </div>
  );
}
