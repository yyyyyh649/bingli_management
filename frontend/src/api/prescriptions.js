import client from './client.js';

// 新增验光单
export function createPrescription(payload) {
  return client.post('/prescriptions', payload);
}

export function getPrescription(id) {
  return client.get(`/prescriptions/${id}`);
}

export function deletePrescription(id, password) {
  return client.delete(`/prescriptions/${id}`, { data: { password } });
}
