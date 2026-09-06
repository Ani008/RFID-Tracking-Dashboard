import apiClient from './client.js';

export async function fetchMovements(params = {}) {
  const { data } = await apiClient.get('/movements', { params });
  return data; // { items, page, limit, total, totalPages }
}

export async function simulateScan(payload) {
  const { data } = await apiClient.post('/simulate', payload);
  return data;
}
