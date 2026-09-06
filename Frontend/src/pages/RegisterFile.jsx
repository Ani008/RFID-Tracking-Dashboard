import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { createFile } from '../api/files.js';
import '../styles/forms.css';

const EMPTY_FORM = { fileId: '', fileName: '', caseId: '', caseName: '', rfidTag: '' };

export default function RegisterFile() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message }
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const file = await createFile(form);
      setStatus({ type: 'success', message: `Registered ${file.fileId} — paired with tag ${file.rfidTag}.` });
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Register File"
        subtitle="Add a new physical file and pair it with an RFID tag"
      />

      {status && (
        <div className={`banner ${status.type === 'success' ? 'banner-success' : 'banner-error'}`}>
          {status.message}
        </div>
      )}

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="fileId">File ID</label>
            <input
              id="fileId"
              value={form.fileId}
              onChange={(e) => update('fileId', e.target.value)}
              placeholder="AHC-F-1042"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="fileName">File Name</label>
            <input
              id="fileName"
              value={form.fileName}
              onChange={(e) => update('fileName', e.target.value)}
              placeholder="Verma vs. Union of India - File 3"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="caseId">Case ID</label>
            <input
              id="caseId"
              value={form.caseId}
              onChange={(e) => update('caseId', e.target.value)}
              placeholder="CASE-1002"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="caseName">Case Name</label>
            <input
              id="caseName"
              value={form.caseName}
              onChange={(e) => update('caseName', e.target.value)}
              placeholder="Verma vs. Union of India"
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="rfidTag">RFID Tag (EPC)</label>
            <input
              id="rfidTag"
              className="mono"
              value={form.rfidTag}
              onChange={(e) => update('rfidTag', e.target.value.toUpperCase())}
              placeholder="E2806894000040178F2A91B5"
              required
            />
            <span className="field-hint">
              No hardware yet — type or paste the tag's EPC manually. Once real readers are
              connected, this becomes a "scan to register" flow instead.
            </span>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Registering…' : 'Register File'}
        </button>
      </form>
    </div>
  );
}
