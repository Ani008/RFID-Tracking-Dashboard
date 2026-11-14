import apiClient from './client.js';

export async function fetchHandheldCauseList(params = {}, signal) {
  const { data } = await apiClient.get('/handheld/causelist', { params, signal });
  return data; // { items, total, date }
}

export async function updateFileRack(fileId, payload) {
  const { data } = await apiClient.put(`/files/${fileId}/rack`, payload);
  return data;
}

