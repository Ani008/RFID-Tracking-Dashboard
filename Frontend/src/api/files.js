import apiClient from './client.js';

export async function fetchFiles(params = {}) {
  const { data } = await apiClient.get('/files', { params });
  return data; // { items, total }
}

export async function fetchFile(fileId) {
  const { data } = await apiClient.get(`/files/${fileId}`);
  return data; // { file, history }
}

export async function createFile(payload) {
  const { data } = await apiClient.post('/files', payload);
  return data;
}

export async function updateFile(fileId, payload) {
  const { data } = await apiClient.put(`/files/${fileId}`, payload);
  return data;
}

export async function archiveFile(fileId) {
  const { data } = await apiClient.delete(`/files/${fileId}`);
  return data;
}

export async function deleteFile(fileId) {
  const { data } = await apiClient.delete(`/files/${fileId}`);
  return data;
}
