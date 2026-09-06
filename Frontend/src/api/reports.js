import apiClient from './client.js';

export async function fetchCourtRoomFiles() {
  const { data } = await apiClient.get('/reports/court-room-files');
  return data;
}

export async function fetchShelfRoomFiles() {
  const { data } = await apiClient.get('/reports/shelf-room-files');
  return data;
}

export async function fetchUnknownTags(params = {}) {
  const { data } = await apiClient.get('/reports/unknown-tags', { params });
  return data;
}
