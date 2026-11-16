import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Upload, RefreshCw, List, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, X, CheckCircle2, XCircle,
  Info, Eye, RotateCcw, CalendarDays,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { MappedBadge, CaseStatusBadge } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  fetchCauseListEntries, fetchUnmatchedEntries, fetchSyncRuns,
  fetchSyncRun, fetchCaseHistory, triggerSync, retrySyncRun, triggerRematch,
  fetchCauseListCaseTypes,
} from '../api/causelist.js';
import './CauseList.css';

const TABS = [
  { id: 'list', label: 'Cause List', icon: List },
  { id: 'unmatched', label: 'Unmatched', icon: AlertTriangle },
  { id: 'sync-logs', label: 'Sync Logs', icon: Clock },
];

const MATCH_STYLES = {
  MATCHED: { label: 'Matched', tone: 'green' },
  UNMATCHED: { label: 'Unmatched', tone: 'red' },
  AMBIGUOUS: { label: 'Ambiguous', tone: 'orange' },
};

function MatchBadge({ status }) {
  const s = MATCH_STYLES[status] || { label: status || '—', tone: 'neutral' };
  return <span className={`status-badge tone-${s.tone}`}>{s.label}</span>;
}

function SyncStatusBadge({ status }) {
  const map = {
    RUNNING: { label: 'Running', tone: 'blue' },
    SUCCESS: { label: 'Success', tone: 'green' },
    PARTIAL: { label: 'Partial', tone: 'orange' },
    FAILED: { label: 'Failed', tone: 'red' },
  };
  const s = map[status] || { label: status, tone: 'neutral' };
  return <span className={`status-badge tone-${s.tone}`}>{s.label}</span>;
}

function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }); }
  catch { return str; }
}

function isCancel(e) {
  return (
    e?.name === 'CanceledError' ||
    e?.name === 'AbortError' ||
    e?.code === 'ERR_CANCELED' ||
    e?.message === 'canceled'
  );
}

// ─── Case History Drawer ───────────────────────────────────────────────────
function CaseHistoryDrawer({ cino, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!cino) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchCaseHistory(cino, ctrl.signal)
      .then(setData)
      .catch((e) => { if (!isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [cino]);

  return (
    <div className="cl-drawer-overlay" onClick={onClose}>
      <div className="cl-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cl-drawer-header">
          <div>
            <div className="cl-drawer-title">Case History</div>
            <div className="cl-drawer-subtitle">CINO: {cino}</div>
          </div>
          <button className="cl-drawer-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="cl-drawer-body">
          {loading && <div className="cl-state-box">Loading…</div>}
          {error && <div className="cl-state-box error">{error}</div>}
          {data && (
            <>
              <div className="cl-drawer-meta">
                <span>{data.totalAppearances} appearance{data.totalAppearances !== 1 ? 's' : ''}</span>
                {data.history[0]?.file && (
                  <span> · File: <strong>{data.history[0].file.fileId || data.history[0].file.fileName}</strong></span>
                )}
              </div>
              <table className="cl-history-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Court</th><th>Serial</th><th>Case Type</th>
                    <th>Status</th><th>Bench</th><th>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((e) => (
                    <tr key={e._id}>
                      <td>{e.causeListDate}</td>
                      <td>{e.courtNumber}</td>
                      <td>{e.serialNumber}</td>
                      <td>{e.caseType || '—'}</td>
                      <td><CaseStatusBadge status={e.caseStatus} /></td>
                      <td>{e.bench || '—'}</td>
                      <td><MatchBadge status={e.matchStatus} /></td>
                    </tr>
                  ))}
                  {data.history.length === 0 && (
                    <tr><td colSpan="7" className="cl-empty-cell">No history entries</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sync Dialog (Admin only) ──────────────────────────────────────────────
function SyncDialog({ onClose, onDone }) {
  const [mode, setMode] = useState('upload'); // 'upload' | 'http'
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
  });
  const [file, setFile] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef();

  const handleSync = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const payload = mode === 'upload' ? { file, date } : { date };
      const run = await triggerSync(payload);
      setResult(run);
      onDone && onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div className="cl-modal-title">Sync Cause List</div>
          <button className="cl-drawer-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="cl-modal-body">
          {!result && (
            <>
              <div className="cl-sync-mode-tabs">
                <button className={`cl-sync-mode-btn${mode === 'upload' ? ' active' : ''}`} onClick={() => setMode('upload')}>
                  <Upload size={15} /> File Upload
                </button>
                <button className={`cl-sync-mode-btn${mode === 'http' ? ' active' : ''}`} onClick={() => setMode('http')}>
                  <RefreshCw size={15} /> HTTP / API
                </button>
              </div>

              <label className="cl-form-label">Date (YYYY-MM-DD)</label>
              <input
                type="date"
                className="cl-form-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />

              {mode === 'upload' && (
                <>
                  <label className="cl-form-label" style={{ marginTop: '0.9rem' }}>
                    Cause List File (XLSX / CSV / JSON)
                  </label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.json"
                    className="cl-form-input"
                    onChange={(e) => setFile(e.target.files[0] || null)}
                  />
                </>
              )}

              {error && <div className="cl-alert error">{error}</div>}

              <div className="cl-modal-footer">
                <button className="btn-modal-cancel" onClick={onClose} disabled={running}>Cancel</button>
                <button
                  className="btn-primary"
                  onClick={handleSync}
                  disabled={running || !date || (mode === 'upload' && !file)}
                >
                  {running ? <><RefreshCw size={14} className="cl-spin" /> Running…</> : 'Start Sync'}
                </button>
              </div>
            </>
          )}

          {result && (
            <div className="cl-sync-result">
              <div className="cl-sync-result-header">
                {result.status === 'SUCCESS' || result.status === 'PARTIAL'
                  ? <CheckCircle2 size={32} color="var(--green-600)" />
                  : <XCircle size={32} color="var(--red-600)" />}
                <div>
                  <div className="cl-sync-result-status"><SyncStatusBadge status={result.status} /></div>
                  <div className="cl-sync-result-label">Sync completed</div>
                </div>
              </div>
              <div className="cl-sync-counts">
                {Object.entries(result.counts || {}).map(([k, v]) => (
                  <div key={k} className="cl-sync-count-item">
                    <span className="cl-sync-count-val">{v}</span>
                    <span className="cl-sync-count-key">{k}</span>
                  </div>
                ))}
              </div>
              {result.failures?.length > 0 && (
                <div className="cl-alert warning">
                  {result.failures.length} row(s) failed — see Sync Logs tab for details.
                </div>
              )}
              <div className="cl-modal-footer">
                <button className="btn-primary" onClick={onClose}>Close</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pagination Bar ────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, limit, onPage }) {
  if (totalPages <= 1 && total <= limit) return null;
  return (
    <div className="cl-pagination">
      <span>{total} record{total !== 1 ? 's' : ''}</span>
      <div className="cl-pag-controls">
        <button onClick={() => onPage(page - 1)} disabled={page <= 1} className="cl-pag-btn" aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span className="cl-pag-info">Page {page} / {totalPages}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className="cl-pag-btn" aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────
export default function CauseList() {
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'list';

  const setTab = (t) => setSearchParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); n.delete('page'); return n; });

  const [showSync, setShowSync] = useState(false);
  const [drawerCino, setDrawerCino] = useState(null);

  // Notification
  const [notification, setNotification] = useState(null);
  const notify = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  return (
    <div className="cl-page">
      <PageHeader
        title="Cause List"
        subtitle="Court cause list sync and file matching"
        actions={
          isAdmin ? (
            <button className="btn-primary" onClick={() => setShowSync(true)}>
              <Upload size={15} /> Sync Cause List
            </button>
          ) : null
        }
      />

      {notification && (
        <div className={`cl-notification ${notification.type}`}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {notification.msg}
        </div>
      )}

      {/* Tab nav */}
      <div className="report-nav-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`report-tab-btn${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'list' && <CauseListTab onRowClick={(cino) => setDrawerCino(cino)} />}
      {tab === 'unmatched' && <UnmatchedTab isAdmin={isAdmin} onNotify={notify} onRowClick={(cino) => setDrawerCino(cino)} />}
      {tab === 'sync-logs' && <SyncLogsTab isAdmin={isAdmin} onNotify={notify} />}

      {showSync && <SyncDialog onClose={() => setShowSync(false)} onDone={() => notify('Sync completed')} />}
      {drawerCino && <CaseHistoryDrawer cino={drawerCino} onClose={() => setDrawerCino(null)} />}
    </div>
  );
}

// ─── Cause List Tab ────────────────────────────────────────────────────────
function CauseListTab({ onRowClick }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const urlDate = searchParams.get('date') || '';
  const urlCourt = searchParams.get('court') || '';
  const urlCaseType = searchParams.get('ct') || 'ALL';
  const urlStatus = searchParams.get('status') || 'ALL';
  const urlMatch = searchParams.get('match') || 'ALL';
  const urlQ = searchParams.get('q') || '';
  const urlPage = parseInt(searchParams.get('page'), 10) || 1;

  const [q, setQ] = useState(urlQ);
  const [date, setDate] = useState(urlDate);
  const [court, setCourt] = useState(urlCourt);
  const [caseType, setCaseType] = useState(urlCaseType);
  const [status, setStatus] = useState(urlStatus);
  const [match, setMatch] = useState(urlMatch);
  const [page, setPage] = useState(urlPage);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [caseTypesList, setCaseTypesList] = useState([]);

  const debounceRef = useRef();

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCauseListCaseTypes(ctrl.signal)
      .then((types) => setCaseTypesList(types || []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [data?.total]);

  const updateUrl = useCallback((overrides = {}) => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.set('tab', 'list');
      const vals = { date, court, ct: caseType, status, match, q, page, ...overrides };
      Object.entries(vals).forEach(([k, v]) => {
        if (v && v !== 'ALL' && String(v) !== '1') n.set(k, v);
        else n.delete(k);
      });
      if (vals.page && String(vals.page) !== '1') n.set('page', vals.page);
      return n;
    });
  }, [date, court, caseType, status, match, q, page, setSearchParams]);

  const load = useCallback((overrides = {}) => {
    const params = {
      date: date || undefined,
      court: court || undefined,
      caseType: caseType !== 'ALL' ? caseType : undefined,
      status: status !== 'ALL' ? status : undefined,
      match: match !== 'ALL' ? match : undefined,
      q: q || undefined,
      page,
      limit: 25,
      ...overrides,
    };
    // remove undefined
    Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);

    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchCauseListEntries(params, ctrl.signal)
      .then(setData)
      .catch((e) => { if (!isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [date, court, caseType, status, match, q, page]);

  useEffect(() => { return load(); }, [load]);

  const handleQChange = (val) => {
    setQ(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      updateUrl({ q: val, page: 1 });
    }, 400);
  };

  const handleFilterChange = (setter, key, val) => {
    setter(val);
    setPage(1);
    updateUrl({ [key]: val, page: 1 });
  };

  const handlePageChange = (p) => {
    setPage(p);
    updateUrl({ page: p });
  };

  const clearFilters = () => {
    setQ(''); setDate(''); setCourt(''); setCaseType('ALL'); setStatus('ALL'); setMatch('ALL'); setPage(1);
    setSearchParams({ tab: 'list' });
  };

  const hasFilters = q || date || court || caseType !== 'ALL' || status !== 'ALL' || match !== 'ALL';

  return (
    <>
      <div className="cl-filter-bar">
        <div className="cl-filter-group">
          <div className="files-search-input" style={{ minWidth: '220px' }}>
            <Search size={15} />
            <input
              value={q}
              onChange={(e) => handleQChange(e.target.value)}
              placeholder="Case No / CINO / Bench"
            />
          </div>
          <input type="date" className="cl-date-input" value={date} onChange={(e) => handleFilterChange(setDate, 'date', e.target.value)} />
          <input type="text" className="cl-text-input" value={court} placeholder="Court No." onChange={(e) => handleFilterChange(setCourt, 'court', e.target.value)} style={{ width: 90 }} />
          <select value={caseType} onChange={(e) => handleFilterChange(setCaseType, 'ct', e.target.value)}>
            <option value="ALL">All Types</option>
            {(caseType !== 'ALL' && !caseTypesList.includes(caseType)
              ? [...caseTypesList, caseType]
              : caseTypesList
            ).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => handleFilterChange(setStatus, 'status', e.target.value)}>
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="DISPOSED">Disposed</option>
          </select>
          <select value={match} onChange={(e) => handleFilterChange(setMatch, 'match', e.target.value)}>
            <option value="ALL">All Match</option>
            <option value="MATCHED">Matched</option>
            <option value="UNMATCHED">Unmatched</option>
            <option value="AMBIGUOUS">Ambiguous</option>
          </select>
        </div>
        {hasFilters && (
          <button className="btn-clear-filters" onClick={clearFilters}><X size={13} /> Clear</button>
        )}
      </div>

      <div className="report-table-card">
        {loading && <div className="cl-state-box">Loading…</div>}
        {error && <div className="cl-state-box error">{error}</div>}
        {!loading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} className="files-table">
            <thead>
              <tr>
                <th>Date</th><th>Court</th><th>Ser.</th><th>Case No / CINO</th>
                <th>Bench</th><th>Type</th><th>Status</th><th>Match</th>
                <th>RFID</th><th>Location</th><th>Rack</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((e) => (
                <tr key={e._id} className="clickable-row" onClick={() => e.cino && onRowClick(e.cino)} title={e.cino ? 'Click to view case history' : ''}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.causeListDate}</td>
                  <td>{e.courtNumber}</td>
                  <td>{e.serialNumber}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{e.caseNumber || '—'}</div>
                    {e.cino && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{e.cino}</div>}
                  </td>
                  <td>{e.bench || '—'}</td>
                  <td>{e.caseType || '—'}</td>
                  <td><CaseStatusBadge status={e.caseStatus} /></td>
                  <td><MatchBadge status={e.matchStatus} /></td>
                  <td><MappedBadge mapped={Boolean(e.file?.rfidTag)} /></td>
                  <td style={{ fontSize: 11.5 }}>{e.file?.currentLocation?.replace(/_/g, ' ') || '—'}</td>
                  <td style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
                    {e.file?.rackLocation?.rack
                      ? `${e.file.rackLocation.rack}${e.file.rackLocation.shelf ? ' / ' + e.file.rackLocation.shelf : ''}`
                      : '—'}
                  </td>
                </tr>
              ))}
              {!loading && (data?.items || []).length === 0 && (
                <tr><td colSpan="11" className="cl-empty-cell">No files found</td></tr>
              )}
            </tbody>
          </table>
        )}
        {data && (
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPage={handlePageChange} />
        )}
      </div>
    </>
  );
}

// ─── Unmatched Tab ─────────────────────────────────────────────────────────
function UnmatchedTab({ isAdmin, onNotify, onRowClick }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlDate = searchParams.get('ud') || '';
  const urlPage = parseInt(searchParams.get('upage'), 10) || 1;

  const [date, setDate] = useState(urlDate);
  const [page, setPage] = useState(urlPage);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rematching, setRematching] = useState(false);

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchUnmatchedEntries({ date: date || undefined, page, limit: 25 }, ctrl.signal)
      .then(setData)
      .catch((e) => { if (!isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [date, page]);

  useEffect(() => { return load(); }, [load]);

  const handleRematch = async () => {
    setRematching(true);
    try {
      const r = await triggerRematch({ date: date || undefined });
      onNotify(`Re-matched ${r.rematchedCount} entries`);
      load();
    } catch (e) {
      onNotify(e.message, 'error');
    } finally {
      setRematching(false);
    }
  };

  const handleDateChange = (val) => {
    setDate(val);
    setPage(1);
    setSearchParams((p) => { const n = new URLSearchParams(p); n.set('tab', 'unmatched'); val ? n.set('ud', val) : n.delete('ud'); n.delete('upage'); return n; });
  };

  const handlePageChange = (p) => {
    setPage(p);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', 'unmatched'); p > 1 ? n.set('upage', p) : n.delete('upage'); return n; });
  };

  return (
    <>
      <div className="cl-filter-bar">
        <div className="cl-filter-group">
          <input type="date" className="cl-date-input" value={date} onChange={(e) => handleDateChange(e.target.value)} />
          {date && <button className="btn-clear-filters" onClick={() => handleDateChange('')}><X size={13} /> Clear date</button>}
        </div>
        {isAdmin && (
          <button className="btn-action" onClick={handleRematch} disabled={rematching}>
            <RotateCcw size={14} className={rematching ? 'cl-spin' : ''} />
            {rematching ? 'Re-matching…' : 'Re-match All'}
          </button>
        )}
      </div>

      {data && data.total > 0 && (
        <div className="cl-info-banner">
          <Info size={15} />
          <span>{data.total} unmatched / ambiguous entr{data.total !== 1 ? 'ies' : 'y'}. Admin can add CINO to the file and click Re-match.</span>
        </div>
      )}

      <div className="report-table-card">
        {loading && <div className="cl-state-box">Loading…</div>}
        {error && <div className="cl-state-box error">{error}</div>}
        {!loading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} className="files-table">
            <thead>
              <tr>
                <th>Date</th><th>Court</th><th>Ser.</th><th>Case No / CINO</th>
                <th>Type</th><th>Status</th><th>Match</th><th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((e) => (
                <tr key={e._id} className="clickable-row" onClick={() => e.cino && onRowClick(e.cino)}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.causeListDate}</td>
                  <td>{e.courtNumber}</td>
                  <td>{e.serialNumber}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{e.caseNumber || '—'}</div>
                    {e.cino && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{e.cino}</div>}
                  </td>
                  <td>{e.caseType || '—'}</td>
                  <td><CaseStatusBadge status={e.caseStatus} /></td>
                  <td><MatchBadge status={e.matchStatus} /></td>
                  <td style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{e.matchReason || '—'}</td>
                </tr>
              ))}
              {(data?.items || []).length === 0 && (
                <tr><td colSpan="8" className="cl-empty-cell">
                  <CheckCircle2 size={18} style={{ color: 'var(--green-600)' }} /> All entries matched
                </td></tr>
              )}
            </tbody>
          </table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPage={handlePageChange} />}
      </div>
    </>
  );
}

// ─── Sync Logs Tab ─────────────────────────────────────────────────────────
function SyncLogsTab({ isAdmin, onNotify }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPage = parseInt(searchParams.get('lpage'), 10) || 1;

  const [page, setPage] = useState(urlPage);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRun, setExpandedRun] = useState(null);
  const [runDetail, setRunDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetchSyncRuns({ page, limit: 20 }, ctrl.signal)
      .then(setData)
      .catch((e) => { if (!isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [page]);

  useEffect(() => { return load(); }, [load]);

  const handleExpand = async (runId) => {
    if (expandedRun === runId) { setExpandedRun(null); setRunDetail(null); return; }
    setExpandedRun(runId);
    setRunDetail(null);
    setLoadingDetail(true);
    try {
      const run = await fetchSyncRun(runId);
      setRunDetail(run);
    } catch (e) {
      onNotify(e.message, 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRetry = async (runId) => {
    setRetrying(runId);
    try {
      const r = await retrySyncRun(runId);
      onNotify(`Retry: ${r.retriedCount || 0} rows re-processed`);
      load();
    } catch (e) {
      onNotify(e.message, 'error');
    } finally {
      setRetrying(null);
    }
  };

  const handlePageChange = (p) => {
    setPage(p);
    setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set('tab', 'sync-logs'); p > 1 ? n.set('lpage', p) : n.delete('lpage'); return n; });
  };

  return (
    <div className="report-table-card">
      {loading && <div className="cl-state-box">Loading…</div>}
      {error && <div className="cl-state-box error">{error}</div>}
      {!loading && !error && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }} className="files-table">
          <thead>
            <tr>
              <th>Started</th><th>By</th><th>Trigger</th><th>Status</th>
              <th>Received</th><th>Matched</th><th>Unmatched</th><th>Failed</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((run) => (
              <>
                <tr key={run._id} className="clickable-row" onClick={() => handleExpand(run._id)}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{formatDate(run.startedAt)}</td>
                  <td style={{ fontSize: 12 }}>{run.username || '—'}</td>
                  <td style={{ fontSize: 12 }}>{run.trigger}</td>
                  <td><SyncStatusBadge status={run.status} /></td>
                  <td>{run.counts?.received ?? '—'}</td>
                  <td style={{ color: 'var(--green-600)', fontWeight: 600 }}>{run.counts?.matched ?? '—'}</td>
                  <td style={{ color: 'var(--amber-600)', fontWeight: 600 }}>{run.counts?.unmatched ?? '—'}</td>
                  <td style={{ color: 'var(--red-600)', fontWeight: 600 }}>{run.counts?.failed ?? '—'}</td>
                  <td>
                    {isAdmin && (run.counts?.failed ?? 0) > 0 && (
                      <button
                        className="btn-action"
                        style={{ fontSize: 12 }}
                        onClick={(e) => { e.stopPropagation(); handleRetry(run._id); }}
                        disabled={retrying === run._id}
                      >
                        <RotateCcw size={12} className={retrying === run._id ? 'cl-spin' : ''} />
                        {retrying === run._id ? 'Retrying…' : 'Retry Failed'}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedRun === run._id && (
                  <tr key={`${run._id}-detail`}>
                    <td colSpan="9" style={{ padding: 0 }}>
                      <div className="cl-run-detail">
                        {loadingDetail && <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Loading details…</div>}
                        {runDetail && (
                          <>
                            <div className="cl-run-detail-header">
                              Params: {runDetail.params?.date || '—'} · Duration: {
                                runDetail.finishedAt
                                  ? `${Math.round((new Date(runDetail.finishedAt) - new Date(runDetail.startedAt)) / 1000)}s`
                                  : 'running'
                              }
                            </div>
                            {(runDetail.failures || []).length === 0 && (
                              <div style={{ padding: '0.75rem 1.25rem', color: 'var(--text-muted)', fontSize: 13 }}>No failures recorded.</div>
                            )}
                            {(runDetail.failures || []).length > 0 && (
                              <table className="cl-failure-table">
                                <thead><tr><th>Row</th><th>Error</th><th>Retryable</th><th>Raw</th></tr></thead>
                                <tbody>
                                  {runDetail.failures.map((f, i) => (
                                    <tr key={i}>
                                      <td>{f.rowIndex ?? '—'}</td>
                                      <td style={{ color: 'var(--red-600)' }}>{f.error}</td>
                                      <td>{f.retryable ? 'Yes' : 'No'}</td>
                                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {JSON.stringify(f.rawRow || {})}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!loading && (data?.items || []).length === 0 && (
              <tr><td colSpan="9" className="cl-empty-cell">No sync runs yet</td></tr>
            )}
          </tbody>
        </table>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPage={handlePageChange} />}
    </div>
  );
}

