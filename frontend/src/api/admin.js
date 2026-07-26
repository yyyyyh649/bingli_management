import client from './client.js';

// 删除日志
export function listDeleteLogs() {
  return client.get('/admin/delete-logs');
}
