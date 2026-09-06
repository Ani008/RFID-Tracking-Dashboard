import apiClient from './client.js';

export async function fetchGates() {
  const { data } = await apiClient.get('/gates');
  return data;
}

export async function createGate(payload) {
  const { data } = await apiClient.post('/gates', payload);
  return data;
}
