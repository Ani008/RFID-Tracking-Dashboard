import { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Keyboard, Trash2, SearchX, Archive, Crosshair, ArrowLeft, CheckCircle2, Search as SearchIcon } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { LocationBadge } from '../components/StatusBadge.jsx';
import FileDetailModal from '../components/FileDetailModal.jsx';
import { lookupTags, fetchFiles } from '../api/files.js';
import RadarFinder from '../components/RadarFinder.jsx';
import { normalizeRfidTag } from '../utils/rfid.js';
import { createProximityTracker } from '../utils/proximity.js';
import './Search.css';

// Wedge readers type a whole tag in a few ms. If no Enter suffix is configured
// on the reader, we treat a short pause in typing as "end of scan".
const IDLE_FLUSH_MS = 150;
// Holding the trigger re-reads the same tag many times a second; ignore repeats
// inside this window so we don't spam the API.
const REPEAT_WINDOW_MS = 1500;
const MIN_TAG_LENGTH = 8;

/**
 * Turns whatever the reader typed into a list of raw tag strings.
 * Handles one tag, several tags separated by whitespace/commas, and several
 * tags glued together with no separator (split on 32 or 24 hex chars).
 */
function splitScan(raw) {
  return raw
    .split(/[\s,;]+/)
    .filter(Boolean)
    .flatMap((token) => {
      const hex = token.replace(/[^0-9a-fA-F]/g, '');
      if (hex.length > 32 && hex.length % 32 === 0) return hex.match(/.{32}/g);
      if (hex.length > 24 && hex.length % 24 === 0) return hex.match(/.{24}/g);
      return [token];
    });
}

export default function Search() {
  const inputRef = useRef(null);
  const idleTimer = useRef(null);
  const lastSeen = useRef(new Map()); // tag -> timestamp of last lookup
  // Collects every read of the file being hunted (before de-duplication) so the
  // radar can turn read-rate / RSSI into a distance feel.
  const tracker = useRef(createProximityTracker()).current;

  const [manualMode, setManualMode] = useState(false);
  const [value, setValue] = useState('');
  const [scans, setScans] = useState([]); // newest first
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFileId, setSelectedFileId] = useState(null);

  // "Find a specific file" mode
  const [mode, setMode] = useState('all'); // 'all' | 'find'
  const [stage, setStage] = useState('query'); // 'query' | 'pick' | 'tracking'
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState([]);
  const [targets, setTargets] = useState([]); // files being hunted (must have rfidTag)
  const [found, setFound] = useState([]); // scan-shaped entries for targets seen, newest first
  const [ignoredTags, setIgnoredTags] = useState(() => new Set());

  const scanActive = mode === 'all' || (mode === 'find' && stage === 'tracking');

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  const processScan = useCallback(async (raw, rssi = null) => {
    const now = Date.now();
    const tags = [];
    for (const piece of splitScan(raw)) {
      const tag = normalizeRfidTag(piece);
      if (tag.length < MIN_TAG_LENGTH) continue;
      // Radar: count every read of the target, even the repeats we skip below.
      if (mode === 'find' && targets.some((f) => f.rfidTag === tag)) tracker.record(rssi, now);
      const last = lastSeen.current.get(tag);
      if (last && now - last < REPEAT_WINDOW_MS) continue;
      lastSeen.current.set(tag, now);
      tags.push(tag);
    }
    const unique = [...new Set(tags)];
    if (unique.length === 0) return;

    if (mode === 'find') {
      // Match locally against the file(s) we're hunting — no API call per scan,
      // and every other tag in the room is ignored.
      const byTag = new Map(targets.map((f) => [f.rfidTag, f]));
      const scannedAt = new Date().toISOString();
      const others = [];
      for (const tag of unique) {
        const file = byTag.get(tag);
        if (!file) { others.push(tag); continue; }
        setFound((prev) => {
          const existing = prev.find((s) => s.tag === tag);
          return [
            { tag, found: true, file, scannedAt, count: (existing?.count || 0) + 1 },
            ...prev.filter((s) => s.tag !== tag),
          ];
        });
      }
      if (others.length) {
        setIgnoredTags((prev) => {
          const next = new Set(prev);
          others.forEach((t) => next.add(t));
          return next;
        });
      }
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { results } = await lookupTags(unique);
      const scannedAt = new Date().toISOString();
      setScans((prev) => {
        let next = prev;
        // Oldest-first so the last tag read ends up on top.
        for (const r of [...results].reverse()) {
          const existing = next.find((s) => s.tag === r.tag);
          next = [
            {
              tag: r.tag,
              found: r.found,
              file: r.file || null,
              scannedAt,
              count: (existing?.count || 0) + 1,
            },
            ...next.filter((s) => s.tag !== r.tag),
          ];
        }
        return next.slice(0, 50);
      });
    } catch (err) {
      // Allow an immediate retry of the same tag after a failure
      unique.forEach((t) => lastSeen.current.delete(t));
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }, [mode, targets, tracker]);

  // Optional: a native bridge (e.g. an Android wrapper around the reader SDK)
  // can dispatch `window.dispatchEvent(new CustomEvent('rfid:read',
  // { detail: { epc: '<hex>', rssi: -52 } }))` to give the radar real signal
  // strength instead of the read-rate estimate.
  useEffect(() => {
    if (!scanActive) return undefined;
    const onRead = (e) => {
      const { epc, rssi } = e.detail || {};
      if (epc) processScan(String(epc), rssi == null ? null : Number(rssi));
    };
    window.addEventListener('rfid:read', onRead);
    return () => window.removeEventListener('rfid:read', onRead);
  }, [scanActive, processScan]);

  function flush(raw) {
    clearTimeout(idleTimer.current);
    setValue('');
    if (raw.trim()) processScan(raw);
  }

  function handleChange(e) {
    const next = e.target.value;
    setValue(next);
    clearTimeout(idleTimer.current);
    if (!manualMode && next.trim()) {
      idleTimer.current = setTimeout(() => flush(next), IDLE_FLUSH_MS);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      flush(e.currentTarget.value);
    }
  }

  // Keep the scan field focused so the reader's keystrokes always land in it,
  // unless the user is typing manually or has a file-detail modal open.
  useEffect(() => {
    if (manualMode || selectedFileId || !scanActive) return undefined;
    focusInput();
    const t = setInterval(() => {
      if (document.activeElement !== inputRef.current) focusInput();
    }, 1000);
    return () => clearInterval(t);
  }, [manualMode, selectedFileId, scanActive, focusInput]);

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  function clearAll() {
    setScans([]);
    setError(null);
    lastSeen.current.clear();
    focusInput();
  }

  function startFindMode() {
    clearAll();
    setMode('find');
    setStage('query');
    setQuery('');
    setMatches([]);
    setTargets([]);
    setFound([]);
    setIgnoredTags(new Set());
  }

  function exitFindMode() {
    setMode('all');
    setStage('query');
    setError(null);
    lastSeen.current.clear();
  }

  function beginTracking(files) {
    const withTag = files.filter((f) => f.rfidTag);
    if (withTag.length === 0) {
      setError('That file has no RFID tag paired with it, so it can’t be found by scanning.');
      return;
    }
    setError(null);
    tracker.reset();
    lastSeen.current.clear();
    setTargets(withTag);
    setFound([]);
    setIgnoredTags(new Set());
    setStage('tracking');
  }

  async function handleFindSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const { items } = await fetchFiles({ search: q });
      if (items.length === 0) {
        setError(`No file matches “${q}”. Check the file ID, case number or name.`);
        return;
      }
      const exact = items.filter((f) => f.fileId.toLowerCase() === q.toLowerCase());
      if (exact.length === 1) return beginTracking(exact);
      if (items.length === 1) return beginTracking(items);
      setMatches(items);
      setStage('pick');
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  const [latest, ...earlier] = scans;
  const foundTags = new Set(found.map((f) => f.tag));
  const pending = targets.filter((f) => !foundTags.has(f.rfidTag));

  return (
    <div className="search-page" onClick={() => !manualMode && scanActive && focusInput()}>
      <PageHeader
        title="Search"
        subtitle="Scan a tag with the handheld reader to identify the file"
      />

      {mode === 'all' && (
        <button type="button" className="find-launch" onClick={(e) => { e.stopPropagation(); startFindMode(); }}>
          <Crosshair size={16} />
          <span>Find a specific file</span>
        </button>
      )}

      {mode === 'find' && (
        <div className="find-bar">
          <button type="button" className="search-clear" onClick={(e) => { e.stopPropagation(); exitFindMode(); }}>
            <ArrowLeft size={13} /> Back to scan all
          </button>
          <span className="find-bar-title"><Crosshair size={14} /> Find a specific file</span>
        </div>
      )}

      {mode === 'find' && stage === 'query' && (
        <form className="find-card" onSubmit={handleFindSubmit}>
          <h2>Which file are you looking for?</h2>
          <p>Enter the file ID, case number or file name. Then scan — only that file will be picked up.</p>
          <div className="find-row">
            <input
              className="find-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. 001, CASE-1002 or part of the name"
              autoFocus
              autoComplete="off"
            />
            <button type="submit" className="btn-primary" disabled={searching || !query.trim()}>
              <SearchIcon size={14} style={{ verticalAlign: 'middle' }} /> {searching ? 'Searching…' : 'Start'}
            </button>
          </div>
        </form>
      )}

      {mode === 'find' && stage === 'pick' && (
        <div className="find-card">
          <h2>{matches.length} files match “{query.trim()}”</h2>
          <p>Pick the one to look for, or track all of them.</p>
          <div className="find-pick-list">
            {matches.slice(0, 50).map((f) => (
              <button type="button" key={f.fileId} className="find-pick" onClick={() => beginTracking([f])}>
                <strong className="mono">{f.fileId}</strong>
                <span>{f.fileName}</span>
                <em>{f.caseId}</em>
              </button>
            ))}
          </div>
          {matches.length > 50 && <p className="field-hint">Showing 50 of {matches.length}. Refine your search to narrow it down.</p>}
          <div className="find-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn-primary" onClick={() => beginTracking(matches.slice(0, 200))}>
              Track all {Math.min(matches.length, 200)}
            </button>
            <button type="button" className="search-clear" onClick={() => { setStage('query'); setError(null); }}>Change search</button>
          </div>
        </div>
      )}

      {mode === 'find' && stage === 'tracking' && (
        <div className="find-target">
          <div className="find-target-head">
            <div>
              <span className="find-target-label">Looking for</span>
              <strong>
                {targets.length === 1
                  ? `${targets[0].fileId} — ${targets[0].fileName}`
                  : `${targets.length} files matching “${query.trim()}” (${found.length} found)`}
              </strong>
            </div>
            <button type="button" className="search-clear" onClick={(e) => { e.stopPropagation(); setStage('query'); setError(null); }}>
              Change file
            </button>
          </div>
          <div className="find-target-meta">
            {ignoredTags.size} other tag{ignoredTags.size === 1 ? '' : 's'} in range ignored
          </div>
        </div>
      )}

      {mode === 'find' && stage === 'tracking' && targets.length === 1 && (
        <RadarFinder tracker={tracker} fileLabel={targets[0].fileId} />
      )}

      {(mode === 'all' || (mode === 'find' && stage === 'tracking')) && (
      <div className={`scan-panel${busy ? ' busy' : ''}`}>
        <div className="scan-indicator">
          <span className="scan-pulse" />
          <ScanLine size={26} strokeWidth={1.75} />
        </div>
        <div className="scan-panel-body">
          <div className="scan-title">
            {mode === 'find' ? (found.length ? 'Found — keep scanning to re-check' : 'Searching… scan around the room') : busy ? 'Looking up tag…' : 'Ready to scan'}
          </div>
          <div className="scan-sub">
            {mode === 'find'
              ? 'Press the trigger. Other files are ignored — you’ll be alerted when the right one is read.'
              : 'Point the reader at a file and press the trigger button. The result appears below.'}
          </div>
        </div>
        <button
          type="button"
          className={`scan-mode-btn${manualMode ? ' active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setManualMode((m) => !m);
            setTimeout(focusInput, 0);
          }}
          title="Type or paste a tag manually"
        >
          <Keyboard size={15} />
          <span>{manualMode ? 'Manual entry on' : 'Manual entry'}</span>
        </button>
      </div>
      )}

      <input
        ref={inputRef}
        className={manualMode ? 'scan-input scan-input-visible mono' : 'scan-input'}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        // 'none' stops the Android soft keyboard popping up on the handheld
        // while still letting the hardware reader type into the field.
        inputMode={manualMode ? 'text' : 'none'}
        placeholder="Type or paste an RFID tag and press Enter"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-label="RFID tag scan input"
      />

      {error && <div className="banner banner-error">Lookup failed: {error}</div>}

      {mode === 'find' && stage === 'tracking' && (
        <>
          {found.length === 0 && (
            <div className="panel panel-empty search-empty">
              Not found yet. Keep scanning around the room.
            </div>
          )}
          {found.map((f, i) => (
            <div key={f.tag}>
              {i === 0 && (
                <div className="find-found-banner"><CheckCircle2 size={18} /> Found it!</div>
              )}
              <ResultCard scan={f} featured={i === 0} onOpen={setSelectedFileId} />
            </div>
          ))}
          {targets.length > 1 && pending.length > 0 && (
            <div className="search-history">
              <div className="search-history-head"><h3>Still looking for ({pending.length})</h3></div>
              {pending.slice(0, 30).map((f) => (
                <div key={f.fileId} className="find-pending">
                  <strong className="mono">{f.fileId}</strong> <span>{f.fileName}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'all' && !latest && !error && (
        <div className="panel panel-empty search-empty">
          No tag scanned yet. Your first scan will show up here.
        </div>
      )}

      {mode === 'all' && latest && <ResultCard scan={latest} featured onOpen={setSelectedFileId} />}

      {mode === 'all' && earlier.length > 0 && (
        <div className="search-history">
          <div className="search-history-head">
            <h3>Earlier scans ({earlier.length})</h3>
            <button type="button" className="search-clear" onClick={(e) => { e.stopPropagation(); clearAll(); }}>
              <Trash2 size={13} /> Clear
            </button>
          </div>
          {earlier.map((s) => (
            <ResultCard key={s.tag} scan={s} onOpen={setSelectedFileId} />
          ))}
        </div>
      )}

      {mode === 'all' && latest && earlier.length === 0 && (
        <div className="search-history-head" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="search-clear" onClick={(e) => { e.stopPropagation(); clearAll(); }}>
            <Trash2 size={13} /> Clear
          </button>
        </div>
      )}

      {selectedFileId && (
        <FileDetailModal fileId={selectedFileId} onClose={() => setSelectedFileId(null)} />
      )}
    </div>
  );
}

function ResultCard({ scan, featured = false, onOpen }) {
  const { tag, found, file, scannedAt, count } = scan;
  const time = new Date(scannedAt).toLocaleTimeString();

  if (!found) {
    return (
      <div className={`result-card result-unknown${featured ? ' featured' : ''}`}>
        <div className="result-icon"><SearchX size={featured ? 24 : 18} /></div>
        <div className="result-main">
          <div className="result-name">Tag not registered</div>
          <div className="result-meta">
            No file is paired with this tag.
          </div>
          <div className="result-tag mono">{tag}</div>
        </div>
        <div className="result-time">{time}{count > 1 && <span className="result-count">×{count}</span>}</div>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`result-card result-found${featured ? ' featured' : ''}`}
      onClick={(e) => { e.stopPropagation(); onOpen(file.fileId); }}
    >
      <div className="result-main">
        <div className="result-top">
          <LocationBadge location={file.currentLocation} />
          {file.archived && (
            <span className="status-badge tone-neutral"><Archive size={11} /> Archived</span>
          )}
        </div>
        <div className="result-name">{file.fileName}</div>
        <div className="result-location">
          <span>Location</span>
          <strong>{file.storageLocation || 'Not set'}</strong>
        </div>
        <div className="result-grid">
          <div><span>File ID</span><strong className="mono">{file.fileId}</strong></div>
          <div><span>Case</span><strong>{file.caseId}{file.caseName ? ` — ${file.caseName}` : ''}</strong></div>
          <div>
            <span>Last movement</span>
            <strong>{file.lastMovementAt ? new Date(file.lastMovementAt).toLocaleString() : '—'}</strong>
          </div>
        </div>
        <div className="result-tag mono">{tag}</div>
      </div>
      <div className="result-time">{time}{count > 1 && <span className="result-count">×{count}</span>}</div>
    </button>
  );
}