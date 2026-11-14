import apiClient from './client.js';

export async function fetchCauseListEntries(params = {}, signal) {
  const { data } = await apiClient.get('/causelist', { params, signal });
  return data; // { items, total, page, limit, totalPages }
}

export async function fetchUnmatchedEntries(params = {}, signal) {
  const { data } = await apiClient.get('/causelist/unmatched', { params, signal });
  return data;
}

export async function fetchSyncRuns(params = {}, signal) {
  const { data } = await apiClient.get('/causelist/sync-runs', { params, signal });
  return data;
}

export async function fetchSyncRun(runId, signal) {
  const { data } = await apiClient.get(`/causelist/sync-runs/${runId}`, { signal });
  return data;
}

export async function fetchCaseHistory(cino, signal) {
  const { data } = await apiClient.get(`/causelist/history/${encodeURIComponent(cino)}`, { signal });
  return data; // { cino, totalAppearances, history }
}

export async function triggerSync({ date, file } = {}) {
  if (file) {
    const formData = new FormData();
    formData.append('file', file);
    if (date) formData.append('date', date);
    const { data } = await apiClient.post('/causelist/sync', formData, { timeout: 120000 });
    return data;
  }
  const { data } = await apiClient.post('/causelist/sync', { date }, { timeout: 60000 });
  return data;
}

export async function retrySyncRun(runId) {
  const { data } = await apiClient.post(`/causelist/sync/${runId}/retry`);
  return data;
}

export async function triggerRematch({ date } = {}) {
  const { data } = await apiClient.post('/causelist/rematch', date ? { date } : {});
  return data;
}

