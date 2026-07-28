import client from './client.js';

// 删除日志
export function listDeleteLogs() {
  return client.get('/admin/delete-logs');
}

// 配镜部绩效统计
export function getPerformance(year) {
  return client.get('/admin/performance', { params: { year } });
}
