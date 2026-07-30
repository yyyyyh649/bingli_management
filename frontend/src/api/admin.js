import client from './client.js';

// 删除日志
export function listDeleteLogs() {
  return client.get('/admin/delete-logs');
}

// 配镜部绩效统计
export function getPerformance(year) {
  return client.get('/admin/performance', { params: { year } });
}

// 按 IMPLEMENTATION.md Phase 5：每日积分/余额消耗明细及办理人
export function getDailyLedger(date) {
  return client.get('/admin/daily-ledger', { params: { date } });
}

// 按 IMPLEMENTATION.md Phase 5：今日生日提醒
export function getBirthdaysToday() {
  return client.get('/customers/birthdays-today');
}

// 按用户新需求 Phase F：充值数据查询
export function getRechargeStats({ phone = '', startDate = '', endDate = '' } = {}) {
  return client.get('/admin/recharge-stats', { params: { phone, startDate, endDate } });
}

// 按用户新需求 Phase I：服务器端变更记录查询（代理云端 cloud_change_log）
export function getAuditQuery({ date = '', hour = '', table = '', operation = '', store = '' } = {}) {
  return client.get('/admin/audit-query', { params: { date, hour, table, operation, store } });
}
