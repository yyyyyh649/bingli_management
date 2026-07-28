import client from './client.js';

// 查询某客户余额明细
export function listBalance(customerPhone) {
  return client.get('/balance', { params: { customerPhone } });
}

// 充值 / 手动扣减
export function createBalance({ customerPhone, amount, sourceType, note, operator }) {
  const body = { customerPhone, amount, sourceType };
  if (note) body.note = note;
  if (operator) body.operator = operator;
  return client.post('/balance', body);
}

export function deleteBalance(id, password) {
  return client.delete(`/balance/${id}`, { data: { password } });
}
