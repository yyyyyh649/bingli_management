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
