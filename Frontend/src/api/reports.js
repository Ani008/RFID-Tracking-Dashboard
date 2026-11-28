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

export async function fetchDailyTagging(params = {}) {
  const { data } = await apiClient.get('/reports/daily-tagging', { params });
  return data;
}

import { getApiBaseUrl } from '../utils/apiConfig.js';

export async function downloadReportCsv(type, params = {}) {
  const token = localStorage.getItem('rfid_auth_token');
  const query = new URLSearchParams(params).toString();
  const url = `${getApiBaseUrl()}/reports/${type}/export?${query}`;

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
  const contentDisp = response.headers.get('content-disposition') || '';
  const match = contentDisp.match(/filename="?([^"]+)"?/);
  const dateStr = new Date().toISOString().slice(0, 10);
  const ext = params.format === 'xlsx' || params.format === 'excel' ? 'xlsx' : 'csv';
  a.download = match ? match[1] : `report_${type}_${dateStr}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}