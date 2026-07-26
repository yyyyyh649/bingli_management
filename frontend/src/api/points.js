import client from './client.js';

// 查询某客户积分明细
export function listPoints(customerPhone) {
  return client.get('/points', { params: { customerPhone } });
}

// 新增积分
export function createPoint({
  customerPhone,
  amount,
  sourceType,
  note,
  relatedPrescriptionId,
  confirmDuplicate,
}) {
  const body = { customerPhone, amount, sourceType };
  if (note) body.note = note;
  if (relatedPrescriptionId) body.relatedPrescriptionId = relatedPrescriptionId;
  if (confirmDuplicate) body.confirmDuplicate = true;
  return client.post('/points', body);
}

export function deletePoint(id, password) {
  return client.delete(`/points/${id}`, { data: { password } });
}
