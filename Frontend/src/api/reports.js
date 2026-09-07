import apiClient from './client.js';

export async function fetchCourtRoomFiles(params = {}) {
  const { data } = await apiClient.get('/reports/court-room-files', { params });
  return data;
}

export async function fetchShelfRoomFiles(params = {}) {
  const { data } = await apiClient.get('/reports/shelf-room-files', { params });
  return data;
}

export async function fetchMovementReport(params = {}) {
  const { data } = await apiClient.get('/reports/movements', { params });
  return data;
}

export async function fetchUnknownTags(params = {}) {
  const { data } = await apiClient.get('/reports/unknown-tags', { params });
  return data;
}

export async function fetchCaseSummary(caseId) {
  const { data } = await apiClient.get(`/reports/case/${encodeURIComponent(caseId)}`);
  return data;
}

export async function downloadReportCsv(type, params = {}) {
  const token = localStorage.getItem('rfid_auth_token');
  const query = new URLSearchParams(params).toString();
  const url = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'}/reports/${type}/export?${query}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorJson;
    try {
      errorJson = JSON.parse(errorText);
    } catch {
      // not JSON
    }
    throw new Error(errorJson?.error || `Export failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const dateStr = new Date().toISOString().slice(0, 10);
  a.download = `report_${type}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
