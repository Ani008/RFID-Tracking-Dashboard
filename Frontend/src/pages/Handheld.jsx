import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, MapPin, Wifi, WifiOff, Package, AlertCircle, CheckCircle2, X } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { fetchHandheldCauseList, updateFileRack } from '../api/handheld.js';
import './Handheld.css';

const AVAILABILITY_CONFIG = {
  LOCATED:  { label: 'Located',      tone: 'green',   icon: CheckCircle2, desc: 'File found — tag and rack recorded' },
  NO_RACK:  { label: 'Tag, No Rack', tone: 'orange',  icon: Wifi,         desc: 'RFID tagged but rack not set' },
  NO_RFID:  { label: 'No RFID Tag',  tone: 'neutral', icon: WifiOff,      desc: 'File exists but no RFID tag assigned' },
  NO_FILE:  { label: 'Unmatched',    tone: 'red',     icon: AlertCircle,  desc: 'Cause list entry — no file record found' },
};

function AvailabilityBadge({ avail }) {
  const c = AVAILABILITY_CONFIG[avail] || { label: avail, tone: 'neutral' };
  return <span className={`status-badge tone-${c.tone}`}>{c.label}</span>;
}

function isCancel(e) {
  return (
    e?.name === 'CanceledError' ||
    e?.name === 'AbortError' ||
    e?.code === 'ERR_CANCELED' ||
    e?.message === 'canceled'
  );
}

// ─── Rack Update Modal ─────────────────────────────────────────────────────
function RackModal({ item, onClose, onSaved }) {
  const [rack, setRack] = useState(item.rackLocation?.rack || '');
  const [shelf, setShelf] = useState(item.rackLocation?.shelf || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateFileRack(item.fileId, { rack, shelf });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <div className="cl-modal-title">Set Rack Location</div>
          <button className="cl-drawer-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="cl-modal-body">
          <div style={{ marginBottom: '0.5rem', fontSize: 13, color: 'var(--text-muted)' }}>
            File: <strong>{item.caseNumber || item.cino || item.fileId}</strong>
          </div>
          <label className="cl-form-label" style={{ marginTop: '0.9rem' }}>Rack</label>
          <input
            className="cl-form-input"
            value={rack}
            onChange={(e) => setRack(e.target.value)}
            placeholder="e.g. A-12"
            maxLength={50}
          />
          <label className="cl-form-label" style={{ marginTop: '0.9rem' }}>Shelf (optional)</label>
          <input
            className="cl-form-input"
            value={shelf}
            onChange={(e) => setShelf(e.target.value)}
            placeholder="e.g. 3"
            maxLength={50}
          />
          {error && <div className="cl-alert error" style={{ marginTop: '0.75rem' }}>{error}</div>}
        </div>
        <div className="cl-modal-footer">
          <button className="btn-modal-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !rack.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Handheld Result Card ──────────────────────────────────────────────────
function ResultCard({ item, onSetRack }) {
  const cfg = AVAILABILITY_CONFIG[item.availability] || { label: item.availability, tone: 'neutral', icon: Package };
  const AvailIcon = cfg.icon;

  return (
    <div className={`hh-card tone-${cfg.tone}`}>
      <div className="hh-card-top">
        <div className="hh-card-serial">#{item.serialNumber} — Court {item.courtNumber}</div>
        <AvailabilityBadge avail={item.availability} />
      </div>

      <div className="hh-card-case">
        <div className="hh-card-caseno">{item.caseNumber || <span className="hh-na">No case number</span>}</div>
        {item.cino && <div className="hh-card-cino">{item.cino}</div>}
      </div>

      {item.caseType && <div className="hh-card-type">{item.caseType}</div>}

      <div className="hh-card-footer">
        <div className="hh-card-rack">
          <MapPin size={14} />
          {item.rackLocation?.rack
            ? <strong>{item.rackLocation.rack}{item.rackLocation.shelf ? ' / ' + item.rackLocation.shelf : ''}</strong>
            : <span className="hh-na">Rack not set</span>}
        </div>
        {item.rfidTag && (
          <div className="hh-card-rfid">
            <Wifi size={13} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {item.rfidTag.slice(0, 12)}…
            </span>
          </div>
        )}
        {item.fileId && (
          <button className="hh-rack-btn" onClick={() => onSetRack(item)}>
            <MapPin size={13} /> Set Rack
          </button>
        )}
      </div>

      <div className={`hh-card-avail-desc tone-${cfg.tone}`}>
        <AvailIcon size={13} /> {cfg.desc}
      </div>
    </div>
  );
}

// ─── Main Handheld Page ────────────────────────────────────────────────────
export default function Handheld() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const [date, setDate] = useState(today);
  const [q, setQ] = useState('');
  const [caseType, setCaseType] = useState('');
  const [court, setCourt] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [rackItem, setRackItem] = useState(null);
  const [notification, setNotification] = useState(null);

  const debounceRef = useRef();
  const ctrlRef = useRef();

  const notify = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(true);
    setError(null);
    const params = {
      date,
      q: q || undefined,
      caseType: caseType || undefined,
      court: court || undefined,
      limit: 100,
    };
    Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
    fetchHandheldCauseList(params, ctrl.signal)
      .then(setData)
      .catch((e) => { if (!isCancel(e)) setError(e.message); })
      .finally(() => setLoading(false));
  }, [date, q, caseType, court]);

  useEffect(() => { load(); }, [load]);

  const handleQChange = (val) => {
    setQ(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 400);
  };

  const CASE_TYPES = ['BAIL', 'WTAX', 'CRLR', 'CRLM', 'CRLP'];

  return (
    <div className="hh-page">
      <PageHeader
        title="Handheld Search"
        subtitle="Mobile-first cause list lookup and rack management"
      />

      {notification && (
        <div className={`cl-notification ${notification.type}`} style={{ marginBottom: '1rem' }}>
          {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {notification.msg}
        </div>
      )}

      {/* ── Filters ── */}
      <div className="hh-filter-panel">
        <div className="hh-filter-row">
          <div className="hh-search-box">
            <Search size={18} />
            <input
              value={q}
              onChange={(e) => handleQChange(e.target.value)}
              placeholder="Search Case No / CINO…"
              autoFocus
            />
            {q && <button className="hh-clear-btn" onClick={() => handleQChange('')} aria-label="Clear"><X size={15} /></button>}
          </div>
          <input
            type="date"
            className="hh-date-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* Case type chips */}
        <div className="hh-chip-row">
          <button className={`hh-chip${caseType === '' ? ' active' : ''}`} onClick={() => setCaseType('')}>All</button>
          {CASE_TYPES.map((t) => (
            <button key={t} className={`hh-chip${caseType === t ? ' active' : ''}`} onClick={() => setCaseType(caseType === t ? '' : t)}>{t}</button>
          ))}
        </div>

        <div className="hh-filter-row" style={{ marginTop: '0.5rem' }}>
          <input
            type="number"
            className="hh-court-input"
            value={court}
            onChange={(e) => setCourt(e.target.value)}
            placeholder="Court No."
            min="1"
            max="99"
          />
          {(q || caseType || court) && (
            <button className="btn-clear-filters" onClick={() => { setQ(''); setCaseType(''); setCourt(''); }}>
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Summary strip ── */}
      {data && (
        <div className="hh-summary-strip">
          <span className="hh-summary-date"><CalendarDays size={14} /> {data.date}</span>
          <span className="hh-summary-count">{data.total} record{data.total !== 1 ? 's' : ''}</span>
          {['LOCATED','NO_RACK','NO_RFID','NO_FILE'].map((avail) => {
            const count = (data.items || []).filter((i) => i.availability === avail).length;
            if (!count) return null;
            const c = AVAILABILITY_CONFIG[avail];
            return <span key={avail} className={`hh-avail-pill tone-${c.tone}`}>{c.label}: {count}</span>;
          })}
        </div>
      )}

      {/* ── Results ── */}
      {loading && <div className="hh-state">Searching…</div>}
      {error && <div className="hh-state error">{error}</div>}
      {!loading && !error && data && (data.items || []).length === 0 && (
        <div className="hh-state empty">No files found for {data.date}</div>
      )}
      {!loading && !error && data && (data.items || []).length > 0 && (
        <div className="hh-card-grid">
          {data.items.map((item, i) => (
            <ResultCard key={item._id || i} item={item} onSetRack={setRackItem} />
          ))}
        </div>
      )}

      {rackItem && (
        <RackModal
          item={rackItem}
          onClose={() => setRackItem(null)}
          onSaved={() => { setRackItem(null); notify('Rack location saved'); load(); }}
        />
      )}
    </div>
  );
}

// Need CalendarDays for the summary strip
function CalendarDays({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <line x1="8" y1="14" x2="8" y2="14"/>
      <line x1="12" y1="14" x2="12" y2="14"/>
      <line x1="16" y1="14" x2="16" y2="14"/>
      <line x1="8" y1="18" x2="8" y2="18"/>
      <line x1="12" y1="18" x2="12" y2="18"/>
    </svg>
  );
}

