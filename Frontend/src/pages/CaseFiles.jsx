import { useCallback, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { LocationBadge, MappedBadge, CaseStatusBadge } from '../components/StatusBadge.jsx';
import FileDetailModal from '../components/FileDetailModal.jsx';
import EditFileModal from '../components/EditFileModal.jsx';
import { fetchFiles, fetchCaseTypes, deleteFile } from '../api/files.js';
import { useConnection } from '../context/ConnectionContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/forms.css';
import './CaseFiles.css';

const LOCATIONS = [
  { value: '', label: 'All Locations' },
  { value: 'SHELF_ROOM', label: 'Shelf Room' },
  { value: 'COURT_ROOM', label: 'Court Room' },
  { value: 'IN_TRANSIT', label: 'In Transit' },
];

const MAPPING_OPTIONS = [
  { value: '', label: 'All Mapping Statuses' },
  { value: 'true', label: 'Mapped' },
  { value: 'false', label: 'Not Mapped (Pending)' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Case Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DISPOSED', label: 'Disposed' },
];

export default function CaseFiles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lastMovement } = useConnection();
  const { isAdmin } = useAuth();

  // URL state
  const urlQ = searchParams.get('q') || '';
  const urlMapped = searchParams.get('mapped') || '';
  const urlStatus = searchParams.get('status') || 'ALL';
  const urlCaseType = searchParams.get('caseType') || 'ALL';
  const urlLocation = searchParams.get('location') || '';
  const urlPage = parseInt(searchParams.get('page'), 10) || 1;

  // Local filter states
  const [searchTerm, setSearchTerm] = useState(urlQ);
  const [mapped, setMapped] = useState(urlMapped);
  const [caseStatus, setCaseStatus] = useState(urlStatus);
  const [caseType, setCaseType] = useState(urlCaseType);
  const [location, setLocation] = useState(urlLocation);
  const [caseTypesList, setCaseTypesList] = useState([]);

  // Data states
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState(null);

  // Pagination
  const [page, setPage] = useState(urlPage);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch available case types for dropdown on mount
  useEffect(() => {
    fetchCaseTypes()
      .then((types) => setCaseTypesList(types || []))
      .catch((err) => console.warn('Could not load case types:', err.message));
  }, []);

  // Sync URL search params
  const updateUrlParams = useCallback(
    (newParams) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(newParams).forEach(([key, val]) => {
        if (!val || val === 'ALL' || (key === 'page' && val === 1)) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // 400ms Debounce on Search Term
  const searchDebounceTimer = useRef(null);
  function handleSearchChange(e) {
    const val = e.target.value;
    setSearchTerm(val);
    clearTimeout(searchDebounceTimer.current);
    searchDebounceTimer.current = setTimeout(() => {
      setPage(1);
      updateUrlParams({ q: val.trim(), page: 1 });
    }, 400);
  }

  function handleMappedChange(e) {
    const val = e.target.value;
    setMapped(val);
    setPage(1);
    updateUrlParams({ mapped: val, page: 1 });
  }

  function handleStatusChange(e) {
    const val = e.target.value;
    setCaseStatus(val);
    setPage(1);
    updateUrlParams({ status: val, page: 1 });
  }

  function handleCaseTypeChange(e) {
    const val = e.target.value;
    setCaseType(val);
    setPage(1);
    updateUrlParams({ caseType: val, page: 1 });
  }

  function handleLocationChange(e) {
    const val = e.target.value;
    setLocation(val);
    setPage(1);
    updateUrlParams({ location: val, page: 1 });
  }

  function handleClearFilters() {
    setSearchTerm('');
    setMapped('');
    setCaseStatus('ALL');
    setCaseType('ALL');
    setLocation('');
    setPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  // Load files with AbortController to discard stale responses
  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = {
      page,
      limit: pageSize,
    };
    if (searchTerm.trim()) params.q = searchTerm.trim();
    if (mapped) params.mapped = mapped;
    if (caseStatus && caseStatus !== 'ALL') params.status = caseStatus;
    if (caseType && caseType !== 'ALL') params.caseType = caseType;
    if (location) params.location = location;

    fetchFiles(params, controller.signal)
      .then((res) => {
        setFiles(res.items || []);
        setTotal(res.total ?? (res.items || []).length);
        setTotalPages(res.totalPages ?? 1);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [searchTerm, mapped, caseStatus, caseType, location, page, pageSize]);

  useEffect(() => {
    const cancel = load();
    return () => cancel && cancel();
  }, [load]);

  useEffect(() => {
    if (lastMovement) load();
  }, [lastMovement, load]);

  function handlePageSizeChange(e) {
    setPageSize(Number(e.target.value));
    setPage(1);
    updateUrlParams({ page: 1 });
  }

  async function handleConfirmDelete() {
    if (!fileToDelete) return;
    const targetId = fileToDelete.fileId;
    setDeleting(true);
    setError(null);
    try {
      await deleteFile(targetId);
      setFiles((prev) => prev.filter((f) => f.fileId !== targetId));
      setNotification({
        type: 'success',
        message: `File "${targetId}" and all associated movement history have been wiped.`,
      });
      setFileToDelete(null);
      load();
      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const hasActiveFilters = Boolean(
    searchTerm.trim() || mapped || (caseStatus && caseStatus !== 'ALL') || (caseType && caseType !== 'ALL') || location
  );

  return (
    <div>
      <PageHeader
        title="Case Files"
        subtitle="Search, filter, and track physical files across record rooms and courtrooms"
      />

      {notification && (
        <div className={`casefiles-notification ${notification.type}`}>
          <CheckCircle2 size={16} />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="files-toolbar">
        <div className="files-search-input">
          <Search size={15} strokeWidth={2} />
          <input
            type="text"
            placeholder="File ID, Case ID, Case No, CINO, name…"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

        <select value={mapped} onChange={handleMappedChange} title="RFID Mapping">
          {MAPPING_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select value={caseStatus} onChange={handleStatusChange} title="Case Status">
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select value={caseType} onChange={handleCaseTypeChange} title="Case Type">
          <option value="ALL">All Case Types</option>
          {caseTypesList.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select value={location} onChange={handleLocationChange} title="Physical Location">
          {LOCATIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button type="button" className="btn-clear-filters" onClick={handleClearFilters}>
            <RotateCcw size={13} />
            <span>Clear filters</span>
          </button>
        )}
      </div>

      <div className="panel">
        {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}

        {!error && loading && <div className="panel-empty">Loading files…</div>}

        {!error && !loading && files.length === 0 && (
          <div className="panel-empty">
            {hasActiveFilters ? 'No files found for the selected filters.' : 'No files found.'}
          </div>
        )}

        {!error && !loading && files.length > 0 && (
          <table className="files-table">
            <thead>
              <tr>
                <th>File / Identifiers</th>
                <th>Case Details</th>
                <th>Type & Status</th>
                <th>RFID Mapping</th>
                <th>Location & Storage</th>
                <th>Last Movement</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.fileId} className="clickable-row">
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div className="mono" style={{ fontWeight: 600 }}>{f.fileId}</div>
                    {f.fileNumber && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>F-No: {f.fileNumber}</div>}
                    <div style={{ fontSize: '12px', marginTop: '2px' }}>{f.fileName}</div>
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div><strong>{f.caseNumber || f.caseId}</strong></div>
                    {f.cino && <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>CINO: {f.cino}</div>}
                    {f.caseName && <div className="files-case-name">{f.caseName}</div>}
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      {f.caseType && (
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 6px', background: 'var(--border-soft)', borderRadius: '4px' }}>
                          {f.caseType}
                        </span>
                      )}
                      <CaseStatusBadge status={f.caseStatus} />
                    </div>
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                      <MappedBadge mapped={Boolean(f.rfidMapped || f.rfidTag)} />
                      {f.rfidTag ? (
                        <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{f.rfidTag}</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#f59e0b' }}>Needs Tagging</span>
                      )}
                    </div>
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div><LocationBadge location={f.currentLocation} /></div>
                    {f.storageLocation && (
                      <div style={{ fontSize: '11px', color: 'var(--text)', marginTop: '4px', fontWeight: 600 }}>
                        {f.storageLocation}
                      </div>
                    )}
                    {f.rackLocation?.rack && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Rack: {f.rackLocation.rack} {f.rackLocation.shelf ? `(${f.rackLocation.shelf})` : ''}
                      </div>
                    )}
                  </td>
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    {f.lastMovementAt ? new Date(f.lastMovementAt).toLocaleString() : '—'}
                  </td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      <div className="casefiles-actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setEditingFile(f);
                          }}
                          title="Edit File Record"
                        >
                          <Edit3 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setFileToDelete(f);
                          }}
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

        {!error && !loading && files.length > 0 && (
          <div className="pagination">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} file(s)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                Rows per page:
                <select value={pageSize} onChange={handlePageSizeChange}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => {
                    const p = Math.max(1, page - 1);
                    setPage(p);
                    updateUrlParams({ page: p });
                  }}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={14} style={{ verticalAlign: 'middle' }} /> Prev
                </button>
                <span style={{ padding: '6px 10px' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const p = Math.min(totalPages, page + 1);
                    setPage(p);
                    updateUrlParams({ page: p });
                  }}
                  disabled={page >= totalPages}
                >
                  Next <ChevronRight size={14} style={{ verticalAlign: 'middle' }} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Details & Edit Modals */}
      {selectedFileId && (
        <FileDetailModal
          fileId={selectedFileId}
          onClose={() => setSelectedFileId(null)}
          onFileUpdated={() => load()}
        />
      )}

      {editingFile && (
        <EditFileModal
          file={editingFile}
          onClose={() => setEditingFile(null)}
          onSaveSuccess={() => {
            setNotification({ type: 'success', message: `File "${editingFile.fileId}" updated successfully.` });
            load();
            setTimeout(() => setNotification(null), 4000);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setFileToDelete(null)}>
          <div className="delete-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <div className="delete-modal-icon-badge">
                <Trash2 size={22} color="#dc2626" />
              </div>
              <div>
                <h3>Permanently Delete File?</h3>
                <p className="delete-modal-subtitle">File ID: {fileToDelete.fileId}</p>
              </div>
            </div>
            <div className="delete-modal-body">
              Are you sure you want to permanently delete file record <strong>{fileToDelete.fileId}</strong> (
              <em>{fileToDelete.fileName}</em>)?
              <div className="delete-warning-box">
                This will wipe the file and its movement log. This action is irreversible.
              </div>
            </div>
            <div className="delete-modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setFileToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-delete"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
