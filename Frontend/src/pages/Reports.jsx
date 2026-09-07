import React, { useState, useEffect, useCallback } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import {
  fetchCourtRoomFiles,
  fetchMovementReport,
  fetchUnknownTags,
  fetchCaseSummary,
  downloadReportCsv,
} from '../api/reports.js';
import {
  MapPinned,
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  Filter,
  Layers,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { LocationBadge, DirectionBadge } from '../components/StatusBadge.jsx';
import FileDetailModal from '../components/FileDetailModal.jsx';
import './Reports.css';

const REPORT_TABS = [
  { id: 'court-room-files', label: 'Court Room Dwell', icon: MapPinned },
  { id: 'movements', label: 'Movement History', icon: Activity },
  { id: 'unknown-tags', label: 'Unknown EPC Scans', icon: AlertTriangle },
  { id: 'case-summary', label: 'Case-Level Summary', icon: Layers },
];

export default function Reports() {
  const [activeTab, setActiveTab] = useState('court-room-files');
  const [datePreset, setDatePreset] = useState('all'); // 'today' | '7d' | '30d' | 'all' | 'custom'
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [gateFilter, setGateFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('');
  const [caseSearch, setCaseSearch] = useState('CASE-1001');
  const [thresholdHours, setThresholdHours] = useState(4);
  const [page, setPage] = useState(1);

  // Data states
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState(null);

  const applyDatePreset = (preset) => {
    setDatePreset(preset);
    setPage(1);
    const now = new Date();

    if (preset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      setFromDate(start.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
    } else if (preset === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
    } else if (preset === '30d') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFromDate(past.toISOString().slice(0, 10));
      setToDate(now.toISOString().slice(0, 10));
    } else if (preset === 'all') {
      setFromDate('');
      setToDate('');
    }
  };

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 30 };
      if (fromDate) params.from = `${fromDate}T00:00:00.000Z`;
      if (toDate) params.to = `${toDate}T23:59:59.999Z`;

      if (activeTab === 'court-room-files') {
        params.thresholdHours = thresholdHours;
        const res = await fetchCourtRoomFiles(params);
        setReportData(res);
      } else if (activeTab === 'movements') {
        if (gateFilter) params.gateId = gateFilter;
        if (directionFilter) params.direction = directionFilter;
        const res = await fetchMovementReport(params);
        setReportData(res);
      } else if (activeTab === 'unknown-tags') {
        if (gateFilter) params.gateId = gateFilter;
        const res = await fetchUnknownTags(params);
        setReportData(res);
      } else if (activeTab === 'case-summary') {
        if (!caseSearch.trim()) {
          setReportData(null);
          setLoading(false);
          return;
        }
        const res = await fetchCaseSummary(caseSearch.trim());
        setReportData(res);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate report');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [activeTab, fromDate, toDate, gateFilter, directionFilter, caseSearch, thresholdHours, page]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      setError(null);
      const params = {};
      if (fromDate) params.from = `${fromDate}T00:00:00.000Z`;
      if (toDate) params.to = `${toDate}T23:59:59.999Z`;
      if (gateFilter) params.gateId = gateFilter;
      if (directionFilter) params.direction = directionFilter;
      if (activeTab === 'court-room-files') params.thresholdHours = thresholdHours;
      if (activeTab === 'case-summary') params.caseId = caseSearch.trim();

      await downloadReportCsv(activeTab, params);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="reports-page">
      <div className="reports-header-actions">
        <PageHeader
          title="Operational & Historical Reports"
          subtitle="Generate, filter, and export court records, dwell audits, and movement registers"
        />
        <button
          className="btn-export-csv"
          onClick={handleExportCsv}
          disabled={exporting || loading}
          title="Download report as CSV for spreadsheet or physical register"
        >
          {exporting ? (
            <span>Exporting...</span>
          ) : exportSuccess ? (
            <>
              <CheckCircle2 size={16} />
              <span>Downloaded CSV</span>
            </>
          ) : (
            <>
              <Download size={16} />
              <span>Export CSV</span>
            </>
          )}
        </button>
      </div>

      {/* Report Navigation Tabs */}
      <div className="report-nav-tabs">
        {REPORT_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`report-tab-btn ${activeTab === id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(id);
              setPage(1);
            }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="report-filter-bar">
        <div className="filter-group-left">
          {activeTab !== 'case-summary' ? (
            <>
              <div className="date-preset-buttons">
                <button
                  className={`date-preset-btn ${datePreset === 'all' ? 'active' : ''}`}
                  onClick={() => applyDatePreset('all')}
                >
                  All Time
                </button>
                <button
                  className={`date-preset-btn ${datePreset === 'today' ? 'active' : ''}`}
                  onClick={() => applyDatePreset('today')}
                >
                  Today
                </button>
                <button
                  className={`date-preset-btn ${datePreset === '7d' ? 'active' : ''}`}
                  onClick={() => applyDatePreset('7d')}
                >
                  Last 7 Days
                </button>
                <button
                  className={`date-preset-btn ${datePreset === '30d' ? 'active' : ''}`}
                  onClick={() => applyDatePreset('30d')}
                >
                  Last 30 Days
                </button>
              </div>

              <div className="date-input-group">
                <Calendar size={15} />
                <input
                  type="date"
                  className="report-date-input"
                  value={fromDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setFromDate(e.target.value);
                  }}
                  title="From Date"
                />
                <span>to</span>
                <input
                  type="date"
                  className="report-date-input"
                  value={toDate}
                  onChange={(e) => {
                    setDatePreset('custom');
                    setToDate(e.target.value);
                  }}
                  title="To Date"
                />
              </div>

              {activeTab === 'court-room-files' && (
                <div className="date-input-group" style={{ marginLeft: '0.5rem' }}>
                  <Clock size={15} />
                  <span>Threshold:</span>
                  <select
                    className="report-date-input"
                    value={thresholdHours}
                    onChange={(e) => setThresholdHours(Number(e.target.value))}
                  >
                    <option value={2}>2 Hours</option>
                    <option value={4}>4 Hours (Standard Court Session)</option>
                    <option value={6}>6 Hours</option>
                    <option value={8}>8 Hours (Full Shift)</option>
                  </select>
                </div>
              )}

              {activeTab === 'movements' && (
                <>
                  <select
                    className="report-date-input"
                    value={gateFilter}
                    onChange={(e) => {
                      setGateFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All Gates</option>
                    <option value="SHELF_ROOM_DOOR">Shelf / Record Room Door</option>
                    <option value="COURT_ROOM_DOOR">Court Room Door</option>
                  </select>

                  <select
                    className="report-date-input"
                    value={directionFilter}
                    onChange={(e) => {
                      setDirectionFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All Directions</option>
                    <option value="IN">IN (Entering)</option>
                    <option value="OUT">OUT (Exiting)</option>
                  </select>
                </>
              )}
            </>
          ) : (
            <div className="date-input-group" style={{ width: '320px' }}>
              <Search size={16} />
              <input
                type="text"
                className="report-date-input"
                style={{ width: '100%' }}
                placeholder="Enter Case ID (e.g. CASE-1001)"
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
              />
            </div>
          )}
        </div>

        <button className="btn-action" onClick={loadReport} disabled={loading}>
          <span>{loading ? 'Refreshing...' : 'Apply Filters'}</span>
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--red-bg)',
            border: '1px solid rgba(195, 63, 52, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--red-600)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.9rem',
          }}
        >
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Tab 1: Court Room Dwell Report */}
      {activeTab === 'court-room-files' && (
        <>
          <div className="report-summary-cards">
            <div className="report-summary-card">
              <div className="user-stat-title">Files in Courtroom</div>
              <div className="user-stat-value" style={{ color: 'var(--amber-600)' }}>
                {reportData?.total || 0}
              </div>
            </div>
            <div className="report-summary-card">
              <div className="user-stat-title">Overstay Alerts (&gt; {thresholdHours} hrs)</div>
              <div className="user-stat-value" style={{ color: 'var(--red-600)' }}>
                {reportData?.overstayCount || 0}
              </div>
            </div>
            <div className="report-summary-card">
              <div className="user-stat-title">Compliance Rate</div>
              <div className="user-stat-value" style={{ color: 'var(--green-600)' }}>
                {reportData?.total
                  ? `${Math.round(((reportData.total - reportData.overstayCount) / reportData.total) * 100)}%`
                  : '100%'}
              </div>
            </div>
          </div>

          <div className="report-table-card">
            <table className="users-table">
              <thead>
                <tr>
                  <th>File ID</th>
                  <th>File Name</th>
                  <th>Case Reference</th>
                  <th>Arrival Time</th>
                  <th>Time in Court</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      Calculating courtroom dwell times...
                    </td>
                  </tr>
                ) : !reportData?.items || reportData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No files currently in the Courtroom for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  reportData.items.map((file) => (
                    <tr
                      key={file.fileId}
                      className={`clickable-row ${file.overstay ? 'overstay-row' : ''}`}
                      onClick={() => setSelectedFileId(file.fileId)}
                    >
                      <td className="mono" style={{ fontWeight: 600 }}>{file.fileId}</td>
                      <td>{file.fileName}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{file.caseId}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{file.caseName}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {file.lastMovementAt ? new Date(file.lastMovementAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td>
                        <strong style={{ color: file.overstay ? 'var(--red-600)' : 'var(--text)' }}>
                          {file.dwellHours} hrs
                        </strong>{' '}
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>({file.dwellMinutes}m)</span>
                      </td>
                      <td>
                        {file.overstay ? (
                          <span className="user-status-badge inactive" style={{ display: 'inline-flex', gap: '4px' }}>
                            <AlertTriangle size={12} />
                            Overstay Alert
                          </span>
                        ) : (
                          <span className="user-status-badge active">
                            Normal Session
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab 2: Movement History Report */}
      {activeTab === 'movements' && (
        <>
          <div className="report-summary-cards">
            <div className="report-summary-card">
              <div className="user-stat-title">Total Movements in Range</div>
              <div className="user-stat-value">{reportData?.total || 0}</div>
            </div>
            <div className="report-summary-card">
              <div className="user-stat-title">Current Page</div>
              <div className="user-stat-value">
                {reportData?.page || 1} of {reportData?.totalPages || 1}
              </div>
            </div>
          </div>

          <div className="report-table-card">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>File ID</th>
                  <th>Paired RFID Tag</th>
                  <th>Gate Door</th>
                  <th>Direction</th>
                  <th>Resulting Location</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      Loading movement records...
                    </td>
                  </tr>
                ) : !reportData?.items || reportData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No scan movements logged in the selected date range.
                    </td>
                  </tr>
                ) : (
                  reportData.items.map((m) => (
                    <tr
                      key={m._id}
                      className="clickable-row"
                      onClick={() => setSelectedFileId(m.fileId)}
                    >
                      <td style={{ fontSize: '0.85rem' }}>{new Date(m.timestamp).toLocaleString()}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{m.fileId}</td>
                      <td className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{m.rfidTag}</td>
                      <td>{m.gateId === 'COURT_ROOM_DOOR' ? 'Court Room Door' : 'Shelf Room Door'}</td>
                      <td>
                        <DirectionBadge direction={m.direction} />
                      </td>
                      <td>
                        <LocationBadge location={m.resultingLocation} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {reportData?.totalPages > 1 && (
              <div className="report-pagination">
                <span>
                  Showing page {reportData.page} of {reportData.totalPages} ({reportData.total} records)
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn-action"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft size={15} />
                    <span>Previous</span>
                  </button>
                  <button
                    className="btn-action"
                    onClick={() => setPage((p) => Math.min(reportData.totalPages, p + 1))}
                    disabled={page >= reportData.totalPages}
                  >
                    <span>Next</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab 3: Unknown Tags Report */}
      {activeTab === 'unknown-tags' && (
        <>
          <div className="report-summary-cards">
            <div className="report-summary-card">
              <div className="user-stat-title">Unregistered Tag Scans</div>
              <div className="user-stat-value" style={{ color: 'var(--amber-600)' }}>
                {reportData?.total || 0}
              </div>
            </div>
          </div>

          <div className="report-table-card">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Unregistered RFID Tag EPC</th>
                  <th>Gate Door</th>
                  <th>Direction</th>
                  <th>Reader Device</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      Loading unknown scan events...
                    </td>
                  </tr>
                ) : !reportData?.items || reportData.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                      No unknown or unregistered tags detected in this range.
                    </td>
                  </tr>
                ) : (
                  reportData.items.map((u) => (
                    <tr key={u._id}>
                      <td style={{ fontSize: '0.85rem' }}>{new Date(u.timestamp).toLocaleString()}</td>
                      <td className="mono" style={{ fontWeight: 600, color: 'var(--amber-600)' }}>{u.rfidTag}</td>
                      <td>{u.gateId === 'COURT_ROOM_DOOR' ? 'Court Room Door' : 'Shelf Room Door'}</td>
                      <td>
                        <DirectionBadge direction={u.direction} />
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{u.deviceId || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tab 4: Case Summary Report */}
      {activeTab === 'case-summary' && (
        <>
          {reportData && (
            <>
              <div className="report-summary-cards">
                <div className="report-summary-card">
                  <div className="user-stat-title">Case Title</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '4px' }}>
                    {reportData.caseName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {reportData.caseId}</div>
                </div>
                <div className="report-summary-card">
                  <div className="user-stat-title">Total File Bundles</div>
                  <div className="user-stat-value">{reportData.totalFiles}</div>
                </div>
                <div className="report-summary-card">
                  <div className="user-stat-title">In Shelf Room</div>
                  <div className="user-stat-value" style={{ color: 'var(--green-600)' }}>
                    {reportData.locationSummary?.SHELF_ROOM || 0}
                  </div>
                </div>
                <div className="report-summary-card">
                  <div className="user-stat-title">In Court Room</div>
                  <div className="user-stat-value" style={{ color: 'var(--amber-600)' }}>
                    {reportData.locationSummary?.COURT_ROOM || 0}
                  </div>
                </div>
                <div className="report-summary-card">
                  <div className="user-stat-title">In Transit</div>
                  <div className="user-stat-value" style={{ color: 'var(--purple-600)' }}>
                    {reportData.locationSummary?.IN_TRANSIT || 0}
                  </div>
                </div>
              </div>

              <div className="report-table-card">
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                  Case Files ({reportData.files?.length || 0})
                </div>
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>File ID</th>
                      <th>File Name</th>
                      <th>Current Physical Location</th>
                      <th>Paired RFID Tag</th>
                      <th>Last Movement Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.files?.map((f) => (
                      <tr
                        key={f.fileId}
                        className="clickable-row"
                        onClick={() => setSelectedFileId(f.fileId)}
                      >
                        <td className="mono" style={{ fontWeight: 600 }}>{f.fileId}</td>
                        <td>{f.fileName}</td>
                        <td>
                          <LocationBadge location={f.currentLocation} />
                        </td>
                        <td className="mono" style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{f.rfidTag}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {f.lastMovementAt ? new Date(f.lastMovementAt).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {selectedFileId && (
        <FileDetailModal
          fileId={selectedFileId}
          onClose={() => setSelectedFileId(null)}
          onFileUpdated={loadReport}
        />
      )}
    </div>
  );
}
