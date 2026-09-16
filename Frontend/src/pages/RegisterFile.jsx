import { useEffect, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { createFile, bulkUploadFiles } from '../api/files.js';
import { useScannerSocket } from '../hooks/useScannerSocket.js';
import { normalizeRfidTag } from '../utils/rfid.js';
import '../styles/forms.css';

const EMPTY_FORM = { fileId: '', fileName: '', caseId: '', rfidTag: '' };

export default function RegisterFile() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { isConnected: socketConnected, lastTag } = useScannerSocket();

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  useEffect(() => {
    if (!lastTag) return;
    const cleanTag = normalizeRfidTag(lastTag.uid);
    setForm((f) => (f.rfidTag ? f : { ...f, rfidTag: cleanTag }));
  }, [lastTag]);

  function update(field, value) {
    const cleanValue = field === 'rfidTag' ? normalizeRfidTag(value) : value;
    setForm((f) => ({ ...f, [field]: cleanValue }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const normalizedPayload = {
        ...form,
        rfidTag: normalizeRfidTag(form.rfidTag),
      };
      const file = await createFile(normalizedPayload);
      setStatus({ type: 'success', message: `Registered ${file.fileId} — paired with tag ${file.rfidTag}.` });
      setForm(EMPTY_FORM);
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadResult(null);
    setUploadError(null);
  }

  async function handleBulkUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    try {
      const result = await bulkUploadFiles(selectedFile);
      setUploadResult(result);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Register File"
        subtitle="Add a new physical file and pair it with an RFID tag"
      />

      <div style={{ marginBottom: '1rem' }}>
        <span className={`status-badge tone-${socketConnected ? 'green' : 'neutral'}`}>
          {socketConnected ? 'Scanner link connected' : 'Scanner link offline'}
        </span>
        {lastTag && (
          <span className="status-badge tone-blue" style={{ marginLeft: '0.5rem' }}>
            Last scan: {lastTag.uid}
          </span>
        )}
      </div>

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
              Scan a tag on the desktop reader to auto-fill this field, or type/paste the EPC
              manually — both work.
            </span>
          </div>
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Registering…' : 'Register File'}
        </button>
      </form>

      <div className="form-card" style={{ marginTop: '1.5rem' }}>
        <div style={{ marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Bulk Register from Excel</h3>
          <p className="field-hint" style={{ marginTop: '4px' }}>
            Upload an .xlsx/.xls/.csv sheet with columns <strong>FileId</strong>,{' '}
            <strong>CaseId</strong>, and <strong>FileName</strong> to register many files at
            once. RFID tags aren't included in the sheet — pair each file with its tag afterwards
            from the file's edit screen or by scanning it.
          </p>
        </div>

        {uploadError && <div className="banner banner-error">{uploadError}</div>}

        {uploadResult && (
          <div className="banner banner-success">
            Processed {uploadResult.totalRows} row(s): {uploadResult.insertedCount} registered,{' '}
            {uploadResult.skippedCount} skipped.
            {uploadResult.errors?.length > 0 && (
              <details style={{ marginTop: '8px' }}>
                <summary style={{ cursor: 'pointer' }}>
                  View {uploadResult.errors.length} skipped row(s)
                  {uploadResult.truncatedErrorCount > 0 ? ` (+${uploadResult.truncatedErrorCount} more not shown)` : ''}
                </summary>
                <ul style={{ marginTop: '8px', paddingLeft: '18px', fontSize: '12.5px' }}>
                  {uploadResult.errors.map((e, i) => (
                    <li key={i}>
                      {e.row ? `Row ${e.row}` : 'Row'}
                      {e.fileId ? ` (${e.fileId})` : ''}: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleBulkUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? 'Uploading…' : 'Upload Excel Sheet'}
          </button>
        </div>
      </div>
    </div>
  );
}