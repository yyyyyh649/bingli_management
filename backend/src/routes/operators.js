// 登记人名单
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, DEPARTMENT } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { saveToRecycleBin } from '../lib/recycleBin.js';

const router = Router();

const VALID_DEPTS = new Set(Object.values(DEPARTMENT));

// 规范化 department：接受数组或逗号字符串，去重后返回逗号字符串
function normalizeDepartment(dept) {
  if (!dept) return '';
  const arr = Array.isArray(dept)
    ? dept
    : String(dept).split(',').map((s) => s.trim()).filter(Boolean);
  const unique = [...new Set(arr)].filter((d) => VALID_DEPTS.has(d));
  return unique.sort().join(',');
}

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
    const { name, sortOrder = 0, department = '' } = req.body || {};
    if (!name || !name.trim()) throw new ApiError('姓名不能为空');
    const db = getDb();
    const id = uuidv4();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const row = {
      id,
      name: name.trim(),
      store,
      department: normalizeDepartment(department),
      sort_order: Number(sortOrder) || 0,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    withChangeTx(db, () => {
      db.prepare(
        `INSERT INTO operators (id, name, store, department, sort_order, created_at, updated_at, sync_status)
         VALUES (@id, @name, @store, @department, @sort_order, @created_at, @updated_at, @sync_status)`
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
    const { name, sortOrder, department, password } = req.body || {};
    // 按 IMPLEMENTATION.md Phase 5 / 红线规则1：修改旧记录必须密码验证
    if (!checkDeletePassword(password)) throw new ApiError('密码错误', 403);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM operators WHERE id = ?').get(id);
    if (!existing) throw new ApiError('登记人不存在', 404);

    const next = {
      ...existing,
      name: name !== undefined ? String(name).trim() : existing.name,
      department: department !== undefined ? normalizeDepartment(department) : existing.department,
      sort_order: sortOrder !== undefined ? Number(sortOrder) || 0 : existing.sort_order,
      updated_at: nowISO(),
      sync_status: 'pending',
    };
    withChangeTx(db, () => {
      db.prepare(
        `UPDATE operators SET name = ?, department = ?, sort_order = ?, updated_at = ?, sync_status = ? WHERE id = ?`
      ).run(next.name, next.department, next.sort_order, next.updated_at, 'pending', id);
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
      saveToRecycleBin(db, 'operators', existing);
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
