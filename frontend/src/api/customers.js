import client from './client.js';

// 列出全部客户（按创建时间倒序，最多 500 条）
export function listCustomers() {
  return client.get('/customers');
}

// 模糊查询（手机号后4位/完整手机号/姓名/会员卡号）
export function searchCustomers(q) {
  return client.get('/customers/search', { params: { q } });
}

// 精确查询单个客户
export function getCustomerByPhone(phone) {
  return client.get(`/customers/by-phone/${phone}`);
}

// 新建/合并客户
export function createCustomer({ phone, name, memberCardNo, address, operator }) {
  const body = { phone, name };
  if (memberCardNo) body.memberCardNo = memberCardNo;
  if (address) body.address = address;
  if (operator) body.operator = operator;
  return client.post('/customers', body);
}

// 修改客户
export function updateCustomer(id, { name, memberCardNo, address }) {
  const body = {};
  if (name !== undefined) body.name = name;
  if (memberCardNo !== undefined) body.memberCardNo = memberCardNo;
  if (address !== undefined) body.address = address;
  return client.put(`/customers/${id}`, body);
}

// 删除客户
export function deleteCustomer(id, password) {
  return client.delete(`/customers/${id}`, { data: { password } });
}

// 客户积分聚合页面
export function getCustomerProfile(phone) {
  return client.get(`/customers/${phone}/profile`);
}
