// GET /api/sync/audit-query —— 服务器端变更记录粗略查询（防篡改审计）
// header: X-Sync-Secret 鉴权（与其他 sync 路由一致）
// query: date(YYYY-MM-DD) / hour(HH) / table / operation / store
// 返回 cloud_change_log 的记录（payload 截断预览，避免响应过大）
import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = getDb();
  const date = String(req.query.date || '').trim();
  const hour = String(req.query.hour || '').trim();
  const table = String(req.query.table || '').trim();
  const operation = String(req.query.operation || '').trim();
  const store = String(req.query.store || '').trim();

  const conditions = [];
  const params = [];
  if (date) {
    conditions.push('substr(created_at, 1, 10) = ?');
    params.push(date);
    if (hour) {
      conditions.push('substr(created_at, 12, 2) = ?');
      params.push(hour);
    }
  }
  if (table) {
    conditions.push('table_name = ?');
    params.push(table);
  }
  if (operation) {
    conditions.push('operation = ?');
    params.push(operation);
  }
  if (store) {
    conditions.push('source_store = ?');
    params.push(store);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT id, table_name, record_id, operation, source_store, created_at,
              substr(payload, 1, 800) AS payload_preview
       FROM cloud_change_log ${where}
       ORDER BY id DESC
       LIMIT 500`
    )
    .all(...params);

  res.json({ ok: true, data: rows });
});

export default router;
