import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { fetchGates, createGate } from '../api/gates.js';
import '../styles/forms.css';

const GATE_IDS = ['SHELF_ROOM_DOOR', 'COURT_ROOM_DOOR'];

export default function Gates() {
  const [gates, setGates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ gateId: GATE_IDS[0], label: '', location: '' });
  const [status, setStatus] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchGates();
      setGates(res.items);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await createGate(form);
      setStatus({ type: 'success', message: `Gate "${form.gateId}" saved.` });
      setForm({ gateId: GATE_IDS[0], label: '', location: '' });
      load();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    }
  }

  const registeredIds = new Set(gates.map((g) => g.gateId));

  return (
    <div>
      <PageHeader title="RFID Gates" subtitle="The two fixed doorway readers this system expects" />

      {status && (
        <div className={`banner ${status.type === 'success' ? 'banner-success' : 'banner-error'}`}>
          {status.message}
        </div>
      )}

      <div className="panel" style={{ marginBottom: 24 }}>
        {error && <div className="dashboard-error">Couldn't reach the API: {error}</div>}
        {!error && loading && <div className="panel-empty">Loading gates…</div>}
        {!error && !loading && gates.length === 0 && (
          <div className="panel-empty">
            No gates registered yet — this is just metadata (label, location); movement processing
            works with the two fixed gate IDs regardless.
          </div>
        )}
        {!error && !loading && gates.length > 0 && (
          <table className="movement-table">
            <thead>
              <tr>
                <th>Gate ID</th>
                <th>Label</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.gateId}>
                  <td className="mono">{g.gateId}</td>
                  <td>{g.label}</td>
                  <td>{g.location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {registeredIds.size < GATE_IDS.length && (
        <form className="form-card" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="gateId">Gate ID</label>
              <select
                id="gateId"
                value={form.gateId}
                onChange={(e) => setForm((f) => ({ ...f, gateId: e.target.value }))}
              >
                {GATE_IDS.filter((id) => !registeredIds.has(id)).map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="label">Label</label>
              <input
                id="label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Shelf / Record Room Door"
                required
              />
            </div>
            <div className="field full">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Record Room, Ground Floor"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary">
            Save Gate
          </button>
        </form>
      )}
    </div>
  );
}
