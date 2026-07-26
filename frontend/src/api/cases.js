import client from './client.js';

// 新增病例
export function createCase(payload) {
  return client.post('/cases', payload);
}

export function getCase(id) {
  return client.get(`/cases/${id}`);
}

export function deleteCase(id, password) {
  return client.delete(`/cases/${id}`, { data: { password } });
}
