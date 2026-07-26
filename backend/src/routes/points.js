// 积分明细
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, POINTS_SOURCE } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { findDuplicatePoints } from '../lib/duplicate.js';
import { triggerPointsImmediatePush } from '../sync/index.js';

const router = Router();

const VALID_SOURCES = new Set(Object.values(POINTS_SOURCE));

// 列表
router.get('/', (req, res) => {
  const customerPhone = (req.query.customerPhone || '').toString().trim();
  if (!customerPhone) throw new ApiError('缺少 customerPhone 参数');
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM points_ledger WHERE customer_phone = ? ORDER BY created_at ASC')
    .all(customerPhone);
  res.json(ok(rows));
});

// 新增（含重复登记检测）
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      customerPhone,
      amount,
      sourceType,
      note = '',
      relatedPrescriptionId = null,
      operator = '',
      confirmDuplicate = false,
    } = req.body || {};

    // 参数校验
    if (!customerPhone) throw new ApiError('缺少 customerPhone');
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt === 0) throw new ApiError('amount 必须是非零整数');
    if (!VALID_SOURCES.has(sourceType)) throw new ApiError('sourceType 非法');

    // 扣分必须为 withdraw / gift_redeem
    if (amt < 0 && ![POINTS_SOURCE.WITHDRAW, POINTS_SOURCE.GIFT_REDEEM].includes(sourceType)) {
      throw new ApiError('扣分时 sourceType 必须为 withdraw 或 gift_redeem');
    }
    // 加分必须为 prescription / manual_add
    if (amt > 0 && ![POINTS_SOURCE.PRESCRIPTION, POINTS_SOURCE.MANUAL_ADD].includes(sourceType)) {
      throw new ApiError('加分时 sourceType 必须为 prescription 或 manual_add');
    }

    const db = getDb();

    // 重复登记检测：金额数值+正负号相同
    if (!confirmDuplicate) {
      const dup = findDuplicatePoints(db, { customerPhone, amount: amt });
      if (dup) {
        return res.json({
          ok: false,
          code: 'DUPLICATE_CONFIRM_REQUIRED',
          error: `已存在一条相同数值的记录，登记于 ${dup.created_at}，是否仍要继续登记？`,
          data: { existingRecord: dup },
        });
      }
    }

    const id = uuidv4();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const row = {
      id,
      customer_phone: customerPhone,
      amount: amt,
      source_type: sourceType,
      related_prescription_id: relatedPrescriptionId || null,
      note: String(note || ''),
      store,
      operator: String(operator || ''),
      created_at: now,
      sync_status: 'pending',
    };

    withChangeTx(db, () => {
      db.prepare(
        `INSERT INTO points_ledger (id, customer_phone, amount, source_type, related_prescription_id, note, store, operator, created_at, sync_status)
         VALUES (@id, @customer_phone, @amount, @source_type, @related_prescription_id, @note, @store, @operator, @created_at, @sync_status)`
      ).run(row);
      recordChange(db, { tableName: 'points_ledger', recordId: id, operation: 'upsert', payload: row });
    });

    // 积分类数据优先级最高：立即尝试推送 + WebSocket 广播
    triggerPointsImmediatePush(row).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[points] 即时推送失败（不影响本地写入，待常规轮询补推）:', e.message);
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
    const existing = db.prepare('SELECT * FROM points_ledger WHERE id = ?').get(id);
    if (!existing) throw new ApiError('积分记录不存在', 404);

    withChangeTx(db, () => {
      db.prepare('DELETE FROM points_ledger WHERE id = ?').run(id);
      recordChange(db, { tableName: 'points_ledger', recordId: id, operation: 'delete', payload: null });
      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('points_ledger', id, process.env.STORE_ID || 'store1', nowISO());
    });
    res.json(ok({ deleted: true }));
  })
);

export default router;
