// 病例
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, CASE_MODE, todayDate, DEPARTMENT } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { ensureCustomer } from '../lib/customer.js';

const router = Router();

const VALID_MODES = new Set([CASE_MODE.SIMPLE, CASE_MODE.COMPLEX]);

// 校验登记人是否属于眼科部
function assertOphthalmologyOperator(db, operatorName) {
  if (!operatorName) throw new ApiError('病例只能由眼科部登记人登记，请选择登记人');
  const op = db.prepare('SELECT * FROM operators WHERE name = ?').get(String(operatorName).trim());
  if (!op) throw new ApiError(`登记人「${operatorName}」不存在，请先在后台维护`);
  const depts = (op.department || '').split(',').filter(Boolean);
  if (!depts.includes(DEPARTMENT.OPHTHALMOLOGY)) {
    throw new ApiError(`登记人「${operatorName}」不属于眼科部，病例只能由眼科部登记人登记`);
  }
}

// 详情
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError('病例不存在', 404);
  res.json(ok(row));
});

// 新增
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      mode,
      customerName = '',
      customerPhone = '',
      customerGender = '',
      customerAddress = '',
      condition = '',
      answers = [],
      recordDate,
      operator = '',
    } = req.body || {};

    if (!VALID_MODES.has(mode)) throw new ApiError('mode 必须为 simple 或 complex');

    const db = getDb();

    // 校验登记人必须属于眼科部
    assertOphthalmologyOperator(db, operator);

    const id = uuidv4();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const recDate = recordDate || todayDate();

    // 手机号校验（若提供）
    const cleanPhone = customerPhone ? String(customerPhone).trim() : '';
    if (cleanPhone && !/^1\d{10}$/.test(cleanPhone)) {
      throw new ApiError('手机号格式不正确');
    }

    const row = {
      id,
      mode,
      customer_name: String(customerName || '').trim(),
      customer_phone: cleanPhone,
      customer_gender: String(customerGender || ''),
      customer_address: String(customerAddress || ''),
      condition: String(condition || ''),
      answers:
        typeof answers === 'string'
          ? answers
          : JSON.stringify(answers || []),
      record_date: recDate,
      store,
      operator: String(operator || ''),
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    withChangeTx(db, () => {
      // 若手机号非空且客户表里没有，自动建 stub 客户档案（保证先登记病例也能查到该客户）
      if (cleanPhone) {
        ensureCustomer(db, {
          phone: cleanPhone,
          name: row.customer_name,
          address: row.customer_address,
          operator: row.operator,
        });
      }
      db.prepare(
        `INSERT INTO cases (id, mode, customer_name, customer_phone, customer_gender, customer_address, condition, answers, record_date, store, operator, created_at, updated_at, sync_status)
         VALUES (@id, @mode, @customer_name, @customer_phone, @customer_gender, @customer_address, @condition, @answers, @record_date, @store, @operator, @created_at, @updated_at, @sync_status)`
      ).run(row);
      recordChange(db, { tableName: 'cases', recordId: id, operation: 'upsert', payload: row });
    });
    res.json(ok(row));
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
    const existing = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
    if (!existing) throw new ApiError('病例不存在', 404);

    withChangeTx(db, () => {
      db.prepare('DELETE FROM cases WHERE id = ?').run(id);
      recordChange(db, { tableName: 'cases', recordId: id, operation: 'delete', payload: null });
      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('cases', id, process.env.STORE_ID || 'store1', nowISO());
    });
    res.json(ok({ deleted: true }));
  })
);

export default router;
