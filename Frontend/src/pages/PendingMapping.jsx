import React, { useCallback, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Tag,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { LocationBadge, CaseStatusBadge } from '../components/StatusBadge.jsx';
import EditFileModal from '../components/EditFileModal.jsx';
import FileDetailModal from '../components/FileDetailModal.jsx';
import { fetchPendingMappingFiles, fetchCaseTypes } from '../api/files.js';
import { useConnection } from '../context/ConnectionContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import '../styles/forms.css';
import './CaseFiles.css';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Case Statuses' },
  { value: 'PENDING', label: 'Pending Cases' },
  { value: 'DISPOSED', label: 'Disposed Cases' },
];

export default function PendingMapping() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lastMovement } = useConnection();
  const { isAdmin } = useAuth();

  const urlQ = searchParams.get('q') || '';
  const urlStatus = searchParams.get('status') || 'ALL';
  const urlCaseType = searchParams.get('caseType') || 'ALL';
  const urlPage = parseInt(searchParams.get('page'), 10) || 1;

  const [searchTerm, setSearchTerm] = useState(urlQ);
  const [caseStatus, setCaseStatus] = useState(urlStatus);
  const [caseType, setCaseType] = useState(urlCaseType);
  const [caseTypesList, setCaseTypesList] = useState([]);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);
  const [mappingFile, setMappingFile] = useState(null);
  const [notification, setNotification] = useState(null);

  // Pagination
  const [page, setPage] = useState(urlPage);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Load distinct case types
  useEffect(() => {
    fetchCaseTypes()
      .then((types) => setCaseTypesList(types || []))
      .catch((err) => console.warn('Could not load case types:', err.message));
  }, []);

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

  function handleClearFilters() {
    setSearchTerm('');
    setCaseStatus('ALL');
    setCaseType('ALL');
    setPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = {
      page,
      limit: pageSize,
    };
    if (searchTerm.trim()) params.q = searchTerm.trim();
    if (caseStatus && caseStatus !== 'ALL') params.status = caseStatus;
    if (caseType && caseType !== 'ALL') params.caseType = caseType;

    fetchPendingMappingFiles(params, controller.signal)
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
  }, [searchTerm, caseStatus, caseType, page, pageSize]);

  useEffect(() => {
    const cancel = load();
    return () => cancel && cancel();
  }, [load]);

  useEffect(() => {
    if (lastMovement) load();
  }, [lastMovement, load]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() || (caseStatus && caseStatus !== 'ALL') || (caseType && caseType !== 'ALL')
  );

  return (
    <div>
      <PageHeader
        title="RFID Mapping Pending"
        subtitle="Physical court files awaiting RFID tag pairing. Records are removed automatically upon tagging."
      />

      {notification && (
        <div className={`casefiles-notification ${notification.type}`}>
          <CheckCircle2 size={16} />
          <span>{notification.message}</span>
        </div>
      )}

      {/* Summary Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#fffbeb',
          border: '1px solid #fef3c7',
          padding: '12px 18px',
          borderRadius: 'var(--radius-sm)',
          color: '#92400e',
          fontSize: '13px',
          marginBottom: '16px',
        }}
      >
        <AlertCircle size={18} color="#f59e0b" />
        <span>
          <strong>{total} file(s)</strong> currently pending RFID tag enrollment. Click <em>"Pair Tag"</em> on any record to link an RFID tag.
        </span>
      </div>

      {/* Filter Bar */}
      <div className="files-toolbar">
        <div className="files-search-input">
          <Search size={15} strokeWidth={2} />
          <input
            type="text"
            placeholder="Search pending by Case No / CINO / File No…"
            value={searchTerm}
            onChange={handleSearchChange}
          />
        </div>

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

        {hasActiveFilters && (
          <button type="button" className="btn-clear-filters" onClick={handleClearFilters}>
            <RotateCcw size={13} />
            <span>Clear filters</span>
          </button>
        )}
      </div>

      <div className="panel">
        {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}

        {!error && loading && <div className="panel-empty">Loading pending mapping list…</div>}

        {!error && !loading && files.length === 0 && (
          <div className="panel-empty">
            {hasActiveFilters
              ? 'No files found for the selected filters.'
              : 'No files found. There are no files pending RFID mapping.'}
          </div>
        )}

        {!error && !loading && files.length > 0 && (
          <table className="files-table">
            <thead>
              <tr>
                <th>File ID & Name</th>
                <th>Case Details & CINO</th>
                <th>Type & Status</th>
                <th>Location & Rack</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.fileId} className="clickable-row">
                  <td onClick={() => setSelectedFileId(f.fileId)}>
                    <div className="mono" style={{ fontWeight: 600 }}>{f.fileId}</div>
                    {f.fileNumber && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>F-No: {f.fileNumber}</div>}
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
                    <div><LocationBadge location={f.currentLocation} /></div>
                    {f.rackLocation?.rack && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Rack: {f.rackLocation.rack} {f.rackLocation.shelf ? `(${f.rackLocation.shelf})` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="casefiles-actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-action"
                        style={{
                          background: 'var(--accent-600)',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 12px',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setMappingFile(f);
                        }}
                        title="Link RFID EPC Tag"
                      >
                        <Tag size={13} />
                        <span>Pair Tag</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!error && !loading && files.length > 0 && (
          <div className="pagination">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} unmapped file(s)
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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

      {/* Details & Tag Pairing Modals */}
      {selectedFileId && (
        <FileDetailModal
          fileId={selectedFileId}
          onClose={() => setSelectedFileId(null)}
          onFileUpdated={() => load()}
        />
      )}

      {mappingFile && (
        <EditFileModal
          file={mappingFile}
          onClose={() => setMappingFile(null)}
          onSaveSuccess={(updated) => {
            setNotification({
              type: 'success',
              message: `File "${updated.fileId}" successfully paired with tag ${updated.rfidTag} and removed from pending queue!`,
            });
            load();
            setTimeout(() => setNotification(null), 4000);
          }}
        />
      )}
    </div>
  );
}

