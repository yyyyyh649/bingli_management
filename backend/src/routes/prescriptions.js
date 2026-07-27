// 验光单
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, todayDate, POINTS_SOURCE } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { findDuplicatePoints } from '../lib/duplicate.js';
import { ensureCustomer } from '../lib/customer.js';
import { triggerPointsImmediatePush } from '../sync/index.js';

const router = Router();

// 详情
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError('验光单不存在', 404);
  res.json(ok(row));
});

// 新增
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const {
      page1 = {},
      od_ds = {},
      od_dc = {},
      os_ds = {},
      os_dc = {},
      page6 = {},
      pointsTargetPhone = '',
      operator = '',
      confirmDuplicate = false,
    } = req.body || {};

    const db = getDb();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const recDate = page1.record_date || todayDate();
    const phone = page1.phone ? String(page1.phone).trim() : '';
    if (phone && !/^1\d{10}$/.test(phone)) throw new ApiError('手机号格式不正确');

    // 计算积分
    const lensPrice = Number(page6.lens_price || 0);
    const framePrice = Number(page6.frame_price || 0);
    const total = lensPrice + framePrice;
    const points = Math.floor(total); // 向下取整

    // 积分归属手机号
    const targetPhone = pointsTargetPhone ? String(pointsTargetPhone).trim() : '';

    // 重复登记检测：仅当会写积分时
    if (points > 0 && targetPhone && !confirmDuplicate) {
      const dup = findDuplicatePoints(db, { customerPhone: targetPhone, amount: points });
      if (dup) {
        return res.json({
          ok: false,
          code: 'DUPLICATE_CONFIRM_REQUIRED',
          error: `已存在一条相同数值的积分记录，登记于 ${dup.created_at}，是否仍要继续登记？`,
          data: { existingRecord: dup },
        });
      }
    }

    const id = uuidv4();
    const prescriptionRow = {
      id,
      customer_phone: phone,
      customer_name: String(page1.name || '').trim(),
      page1: JSON.stringify(page1),
      od_ds: JSON.stringify(od_ds),
      od_dc: JSON.stringify(od_dc),
      os_ds: JSON.stringify(os_ds),
      os_dc: JSON.stringify(os_dc),
      page6: JSON.stringify(page6),
      points_target_phone: targetPhone,
      points_amount: points > 0 && targetPhone ? points : 0,
      record_date: recDate,
      store,
      operator: String(operator || ''),
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    let pointsRow = null;

    withChangeTx(db, () => {
      // 自动为客户建 stub 档案：
      //   - page1.phone（验光单本人）：若不存在则建
      //   - pointsTargetPhone（积分归属手机号，可能是朋友/家人）：若不存在则建
      //   - 两者可能不同，需分别 ensure
      if (phone) {
        ensureCustomer(db, {
          phone,
          name: String(page1.name || '').trim(),
          address: String(page1.address || '').trim(),
          operator: String(operator || ''),
        });
      }
      if (targetPhone && targetPhone !== phone) {
        ensureCustomer(db, { phone: targetPhone, operator: String(operator || '') });
      }

      db.prepare(
        `INSERT INTO prescriptions (id, customer_phone, customer_name, page1, od_ds, od_dc, os_ds, os_dc, page6, points_target_phone, points_amount, record_date, store, operator, created_at, updated_at, sync_status)
         VALUES (@id, @customer_phone, @customer_name, @page1, @od_ds, @od_dc, @os_ds, @os_dc, @page6, @points_target_phone, @points_amount, @record_date, @store, @operator, @created_at, @updated_at, @sync_status)`
      ).run(prescriptionRow);
      recordChange(db, { tableName: 'prescriptions', recordId: id, operation: 'upsert', payload: prescriptionRow });

      // 写积分
      if (points > 0 && targetPhone) {
        const pid = uuidv4();
        pointsRow = {
          id: pid,
          customer_phone: targetPhone,
          amount: points,
          source_type: POINTS_SOURCE.PRESCRIPTION,
          related_prescription_id: id,
          note: '',
          store,
          operator: String(operator || ''),
          created_at: now,
          sync_status: 'pending',
        };
        db.prepare(
          `INSERT INTO points_ledger (id, customer_phone, amount, source_type, related_prescription_id, note, store, operator, created_at, sync_status)
           VALUES (@id, @customer_phone, @amount, @source_type, @related_prescription_id, @note, @store, @operator, @created_at, @sync_status)`
        ).run(pointsRow);
        recordChange(db, { tableName: 'points_ledger', recordId: pid, operation: 'upsert', payload: pointsRow });
      }
    });

    // 积分即时推送
    if (pointsRow) {
      triggerPointsImmediatePush(pointsRow).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[prescription] 积分即时推送失败（待常规轮询补推）:', e.message);
      });
    }

    res.json(ok({ prescription: prescriptionRow, pointsLedger: pointsRow }));
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
    const existing = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id);
    if (!existing) throw new ApiError('验光单不存在', 404);

    withChangeTx(db, () => {
      db.prepare('DELETE FROM prescriptions WHERE id = ?').run(id);
      recordChange(db, { tableName: 'prescriptions', recordId: id, operation: 'delete', payload: null });
      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('prescriptions', id, process.env.STORE_ID || 'store1', nowISO());
    });
    res.json(ok({ deleted: true }));
  })
);

export default router;
