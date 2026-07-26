// 登记人名单
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';

const router = Router();

// 列表：当前店 + 跨店同步过来的全部 operators（按 store, sort_order, name 排序）
router.get('/', (_req, res) => {
  const db = getDb();
  const store = process.env.STORE_ID || 'store1';
  // 本店优先置顶，再按 sort_order, name
  const rows = db
    .prepare(
      `SELECT * FROM operators
       ORDER BY (store = ?) DESC, sort_order ASC, name ASC`
    )
    .all(store);
  res.json(ok(rows));
});

// 新增
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, sortOrder = 0 } = req.body || {};
    if (!name || !name.trim()) throw new ApiError('姓名不能为空');
    const db = getDb();
    const id = uuidv4();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const row = { id, name: name.trim(), store, sort_order: Number(sortOrder) || 0, created_at: now, updated_at: now, sync_status: 'pending' };

    withChangeTx(db, () => {
      db.prepare(
        `INSERT INTO operators (id, name, store, sort_order, created_at, updated_at, sync_status)
         VALUES (@id, @name, @store, @sort_order, @created_at, @updated_at, @sync_status)`
      ).run(row);
      recordChange(db, { tableName: 'operators', recordId: id, operation: 'upsert', payload: row });
    });
    res.json(ok(row));
  })
);

// 修改
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, sortOrder } = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM operators WHERE id = ?').get(id);
    if (!existing) throw new ApiError('登记人不存在', 404);

    const next = {
      ...existing,
      name: name !== undefined ? String(name).trim() : existing.name,
      sort_order: sortOrder !== undefined ? Number(sortOrder) || 0 : existing.sort_order,
      updated_at: nowISO(),
      sync_status: 'pending',
    };
    withChangeTx(db, () => {
      db.prepare(
        `UPDATE operators SET name = ?, sort_order = ?, updated_at = ?, sync_status = ? WHERE id = ?`
      ).run(next.name, next.sort_order, next.updated_at, 'pending', id);
      recordChange(db, { tableName: 'operators', recordId: id, operation: 'upsert', payload: next });
    });
    res.json(ok(next));
  })
);

// 删除（需密码）
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!checkDeletePassword(password)) throw new ApiError('密码错误', 403);

    const db = getDb();
    const existing = db.prepare('SELECT * FROM operators WHERE id = ?').get(id);
    if (!existing) throw new ApiError('登记人不存在', 404);

    withChangeTx(db, () => {
      db.prepare('DELETE FROM operators WHERE id = ?').run(id);
      recordChange(db, { tableName: 'operators', recordId: id, operation: 'delete', payload: null });
      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('operators', id, process.env.STORE_ID || 'store1', nowISO());
    });
    res.json(ok({ deleted: true }));
  })
);

export default router;
