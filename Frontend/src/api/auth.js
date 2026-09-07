import apiClient from './client.js';

export async function loginApi(username, password) {
  const { data } = await apiClient.post('/auth/login', { username, password });
  return data;
}

export async function logoutApi() {
  const { data } = await apiClient.post('/auth/logout');
  return data;
}

export async function getMeApi() {
  const { data } = await apiClient.get('/auth/me');
  return data;
}

// User Management (Admin)
export async function getUsersApi() {
  const { data } = await apiClient.get('/users');
  return data;
}

export async function createUserApi(payload) {
  const { data } = await apiClient.post('/users', payload);
  return data;
}

export async function updateUserApi(id, payload) {
  const { data } = await apiClient.put(`/users/${id}`, payload);
  return data;
}

export async function deleteUserApi(id) {
  const { data } = await apiClient.delete(`/users/${id}`);
  return data;
}
