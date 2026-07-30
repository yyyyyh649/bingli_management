// 余额明细：充值 / 手动扣减
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, BALANCE_SOURCE } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { ensureCustomer } from '../lib/customer.js';
import { saveToRecycleBin } from '../lib/recycleBin.js';

const router = Router();

const VALID_SOURCES = new Set(Object.values(BALANCE_SOURCE));

// 列表
router.get('/', (req, res) => {
  const customerPhone = (req.query.customerPhone || '').toString().trim();
  if (!customerPhone) throw new ApiError('缺少 customerPhone 参数');
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM balance_ledger WHERE customer_phone = ? ORDER BY created_at ASC')
    .all(customerPhone);
  res.json(ok(rows));
});

// 充值 / 手动扣减
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      customerPhone,
      amount,
      sourceType,
      note = '',
      operator = '',
      // 按用户新需求 Phase E：实充金额（实际收款），仅充值时有效；不传则等于 amount
      actualAmount = null,
    } = req.body || {};

    if (!customerPhone) throw new ApiError('缺少 customerPhone');
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt === 0) throw new ApiError('amount 必须为非零数值');
    if (!VALID_SOURCES.has(sourceType)) throw new ApiError('sourceType 非法');

    // 充值必须为正，扣减必须为负
    if (amt > 0 && sourceType !== BALANCE_SOURCE.TOPUP) {
      throw new ApiError('充值时 sourceType 必须为 topup');
    }
    if (amt < 0 && ![BALANCE_SOURCE.MANUAL_DEDUCT, BALANCE_SOURCE.CONSUME].includes(sourceType)) {
      throw new ApiError('扣减时 sourceType 必须为 manual_deduct 或 consume');
    }

    // 实充金额：仅充值时记录；扣减时为 null
    let actualAmt = null;
    if (sourceType === BALANCE_SOURCE.TOPUP) {
      const a = Number(actualAmount);
      actualAmt = Number.isFinite(a) && a >= 0 ? a : amt;
    }

    const db = getDb();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();

    const id = uuidv4();
    const row = {
      id,
      customer_phone: customerPhone,
      amount: amt,
      source_type: sourceType,
      related_prescription_id: null,
      note: String(note || ''),
      store,
      operator: String(operator || ''),
      created_at: now,
      sync_status: 'pending',
      actual_amount: actualAmt,
    };

    withChangeTx(db, () => {
      // 确保客户存在
      ensureCustomer(db, { phone: customerPhone, operator: String(operator || '') });

      // 检查余额是否足够（扣减时）
      if (amt < 0) {
        const customer = db.prepare('SELECT balance FROM customers WHERE phone = ?').get(customerPhone);
        const currentBalance = Number(customer?.balance || 0);
        if (currentBalance + amt < 0) {
          throw new ApiError(`余额不足（当前余额 ${currentBalance.toFixed(2)} 元）`);
        }
      }

      db.prepare(
        `INSERT INTO balance_ledger (id, customer_phone, amount, source_type, related_prescription_id, note, store, operator, created_at, sync_status, actual_amount)
         VALUES (@id, @customer_phone, @amount, @source_type, @related_prescription_id, @note, @store, @operator, @created_at, @sync_status, @actual_amount)`
      ).run(row);
      recordChange(db, { tableName: 'balance_ledger', recordId: id, operation: 'upsert', payload: row });

      // 更新 customers.balance 缓存
      db.prepare('UPDATE customers SET balance = balance + ?, updated_at = ?, sync_status = ? WHERE phone = ?')
        .run(amt, now, 'pending', customerPhone);

      // 记录 customers 变更以便同步
      const updatedCustomer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(customerPhone);
      if (updatedCustomer) {
        recordChange(db, { tableName: 'customers', recordId: updatedCustomer.id, operation: 'upsert', payload: updatedCustomer });
      }
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
    const existing = db.prepare('SELECT * FROM balance_ledger WHERE id = ?').get(id);
    if (!existing) throw new ApiError('余额记录不存在', 404);

    withChangeTx(db, () => {
      saveToRecycleBin(db, 'balance_ledger', existing);
      // 反向调整 customers.balance
      db.prepare('UPDATE customers SET balance = balance - ?, updated_at = ?, sync_status = ? WHERE phone = ?')
        .run(existing.amount, nowISO(), 'pending', existing.customer_phone);

      db.prepare('DELETE FROM balance_ledger WHERE id = ?').run(id);
      recordChange(db, { tableName: 'balance_ledger', recordId: id, operation: 'delete', payload: null });

      const updatedCustomer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(existing.customer_phone);
      if (updatedCustomer) {
        recordChange(db, { tableName: 'customers', recordId: updatedCustomer.id, operation: 'upsert', payload: updatedCustomer });
      }

      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('balance_ledger', id, process.env.STORE_ID || 'store1', nowISO());
    });
    res.json(ok({ deleted: true }));
  })
);

export default router;
