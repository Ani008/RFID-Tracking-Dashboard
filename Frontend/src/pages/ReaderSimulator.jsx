import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import { LocationBadge } from '../components/StatusBadge.jsx';
import { fetchFiles } from '../api/files.js';
import { simulateScan } from '../api/movements.js';
import '../styles/forms.css';
import './ReaderSimulator.css';

const GATES = [
  { value: 'SHELF_ROOM_DOOR', label: 'Shelf Room Door' },
  { value: 'COURT_ROOM_DOOR', label: 'Court Room Door' },
];
const DIRECTIONS = ['OUT', 'IN'];

export default function ReaderSimulator() {
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [gateId, setGateId] = useState(GATES[0].value);
  const [direction, setDirection] = useState('OUT');
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [extraEpcs, setExtraEpcs] = useState('');
  const [filter, setFilter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFiles()
      .then((res) => setFiles(res.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingFiles(false));
  }, []);

  const visibleFiles = useMemo(() => {
    if (!filter) return files;
    const re = new RegExp(filter, 'i');
    return files.filter((f) => re.test(f.fileId) || re.test(f.fileName) || re.test(f.rfidTag) || re.test(f.caseId));
  }, [files, filter]);

  function toggleTag(rfidTag) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(rfidTag)) next.delete(rfidTag);
      else next.add(rfidTag);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const extras = extraEpcs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const epcs = [...selectedTags, ...extras];

    if (epcs.length === 0) {
      setError('Select at least one file or type a raw EPC to simulate.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await simulateScan({
        gateId,
        direction,
        epcs,
        deviceId: 'dashboard-simulator',
      });
      setResult(res);
      setSelectedTags(new Set());
      setExtraEpcs('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reader Simulator"
        subtitle="Fire a fake batch scan — this hits the exact same path a physical reader would"
      />

      {error && <div className="banner banner-error">{error}</div>}

      {result && (
        <div className="banner banner-success">
          <strong>{result.matchedCount}</strong> file{result.matchedCount === 1 ? '' : 's'} moved to{' '}
          <strong>{result.matched[0]?.newLocation || '—'}</strong>
          {result.unknownCount > 0 && (
            <>
              {' '}
              · <strong>{result.unknownCount}</strong> unrecognized tag
              {result.unknownCount === 1 ? '' : 's'} logged
            </>
          )}
          .
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="sim-config-row">
          <div className="field">
            <label htmlFor="gateId">Gate</label>
            <select id="gateId" value={gateId} onChange={(e) => setGateId(e.target.value)}>
              {GATES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="direction">Direction</label>
            <select id="direction" value={direction} onChange={(e) => setDirection(e.target.value)}>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary sim-submit" disabled={submitting}>
            <Radio size={15} strokeWidth={2} />
            {submitting ? 'Simulating…' : 'Simulate Scan'}
          </button>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>
              Pick files to pass through the gate ({selectedTags.size} selected)
            </h2>
            <input
              className="sim-filter"
              placeholder="Filter by file, case, or tag…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {loadingFiles ? (
            <div className="panel-empty">Loading files…</div>
          ) : visibleFiles.length === 0 ? (
            <div className="panel-empty">No files match that filter.</div>
          ) : (
            <ul className="sim-file-list">
              {visibleFiles.map((f) => (
                <li key={f.fileId}>
                  <label className="sim-file-row">
                    <input
                      type="checkbox"
                      checked={selectedTags.has(f.rfidTag)}
                      onChange={() => toggleTag(f.rfidTag)}
                    />
                    <span className="mono sim-tag">{f.rfidTag}</span>
                    <span className="sim-file-name">
                      {f.fileId} — {f.fileName}
                    </span>
                    <LocationBadge location={f.currentLocation} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="field full sim-extra">
          <label htmlFor="extraEpcs">Or type raw EPC(s) to simulate an unrecognized tag</label>
          <input
            id="extraEpcs"
            className="mono"
            value={extraEpcs}
            onChange={(e) => setExtraEpcs(e.target.value)}
            placeholder="TESTTAGNOTREGISTERED, ANOTHERFAKEID"
          />
          <span className="field-hint">Comma-separated. Useful for testing the Unknown Tags report.</span>
        </div>
      </form>
    </div>
  );
}
