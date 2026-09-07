import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Save } from 'lucide-react';
import { updateFile } from '../api/files.js';
import { LocationBadge } from './StatusBadge.jsx';
import './EditFileModal.css';

export default function EditFileModal({ file, onClose, onSaveSuccess }) {
  const [formData, setFormData] = useState({
    fileName: '',
    caseId: '',
    caseName: '',
    rfidTag: '',
    reason: '',
  });
  const [originalTag, setOriginalTag] = useState('');
  const [tagConfirmed, setTagConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (file) {
      setFormData({
        fileName: file.fileName || '',
        caseId: file.caseId || '',
        caseName: file.caseName || '',
        rfidTag: file.rfidTag || '',
        reason: '',
      });
      setOriginalTag(file.rfidTag || '');
      setTagConfirmed(false);
    }
  }, [file]);

  if (!file) return null;

  const isTagChanged = formData.rfidTag.trim() !== originalTag;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.fileName.trim() || !formData.caseId.trim() || !formData.caseName.trim() || !formData.rfidTag.trim()) {
      setError('All metadata fields are required');
      return;
    }

    if (isTagChanged && !tagConfirmed) {
      setError('Please acknowledge and confirm the RFID Tag reassignment before saving');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const updated = await updateFile(file.fileId, {
        fileName: formData.fileName.trim(),
        caseId: formData.caseId.trim(),
        caseName: formData.caseName.trim(),
        rfidTag: formData.rfidTag.trim(),
        reason: formData.reason.trim(),
      });
      if (onSaveSuccess) onSaveSuccess(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update file record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-modal-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="edit-modal-header">
          <div>
            <h3>Edit File Record</h3>
            <p className="edit-modal-subtitle">
              File ID: <strong style={{ fontFamily: 'var(--font-mono)' }}>{file.fileId}</strong>
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="edit-modal-body">
            {error && (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#b91c1c',
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* 1. File ID */}
            <div className="edit-field">
              <label className="edit-field-label">1. File ID (Permanent)</label>
              <div className="edit-readonly-box mono">
                <span>{file.fileId}</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Read-only</span>
              </div>
            </div>

            {/* 2. Current Location */}
            <div className="edit-field">
              <label className="edit-field-label">2. Current Physical Location</label>
              <div className="edit-readonly-box">
                <LocationBadge location={file.currentLocation} />
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Movement Derived</span>
              </div>
            </div>

            {/* 3. File / Document Title */}
            <div className="edit-field">
              <label className="edit-field-label" htmlFor="edit-fileName">
                3. File / Document Title
              </label>
              <input
                id="edit-fileName"
                type="text"
                className="edit-field-input"
                placeholder="Enter file title"
                value={formData.fileName}
                onChange={(e) => setFormData({ ...formData, fileName: e.target.value })}
                required
              />
            </div>

            {/* 4. Case ID */}
            <div className="edit-field">
              <label className="edit-field-label" htmlFor="edit-caseId">
                4. Case ID
              </label>
              <input
                id="edit-caseId"
                type="text"
                className="edit-field-input"
                placeholder="e.g. CASE-1002"
                value={formData.caseId}
                onChange={(e) => setFormData({ ...formData, caseId: e.target.value })}
                required
              />
            </div>

            {/* 5. Case Name */}
            <div className="edit-field">
              <label className="edit-field-label" htmlFor="edit-caseName">
                5. Case Name
              </label>
              <input
                id="edit-caseName"
                type="text"
                className="edit-field-input"
                placeholder="e.g. Verma vs. Union of India"
                value={formData.caseName}
                onChange={(e) => setFormData({ ...formData, caseName: e.target.value })}
                required
              />
            </div>

            {/* 6. Paired RFID Tag */}
            <div className="edit-field">
              <label className="edit-field-label" htmlFor="edit-rfidTag">
                6. Paired RFID EPC Tag
              </label>
              <input
                id="edit-rfidTag"
                type="text"
                className="edit-field-input mono"
                placeholder="E2806894000040178F2A91B5"
                value={formData.rfidTag}
                onChange={(e) => {
                  setFormData({ ...formData, rfidTag: e.target.value });
                  setTagConfirmed(false);
                }}
                required
              />

              {isTagChanged && (
                <div className="edit-tag-warning">
                  <div className="tag-warning-header">
                    <AlertTriangle size={17} />
                    <span>RFID Tag Modification Notice</span>
                  </div>
                  <div>
                    You are reassigning this file from tag <code>{originalTag}</code> to{' '}
                    <code>{formData.rfidTag}</code>. This change will be permanently logged in the audit trail.
                  </div>
                  <label className="edit-confirm-checkbox">
                    <input
                      type="checkbox"
                      checked={tagConfirmed}
                      onChange={(e) => setTagConfirmed(e.target.checked)}
                    />
                    <span>I confirm this physical RFID tag replacement</span>
                  </label>
                </div>
              )}
            </div>

            {/* 7. Reason for Edit */}
            <div className="edit-field">
              <label className="edit-field-label" htmlFor="edit-reason">
                7. Reason for Edit (Audit Note)
              </label>
              <input
                id="edit-reason"
                type="text"
                className="edit-field-input"
                placeholder="e.g. Typo fix in case title / Replaced damaged tag"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="edit-modal-footer">
            <button type="button" className="btn-action" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || (isTagChanged && !tagConfirmed)}
            >
              <Save size={16} />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
