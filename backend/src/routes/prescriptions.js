// 验光单
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, todayDate, POINTS_SOURCE, BALANCE_SOURCE, DEPARTMENT, POINTS_TO_YUAN_RATE } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { findDuplicatePoints } from '../lib/duplicate.js';
import { ensureCustomer } from '../lib/customer.js';
import { triggerPointsImmediatePush } from '../sync/index.js';

const router = Router();

// 校验登记人是否属于配镜部
function assertOpticalOperator(db, operatorName) {
  if (!operatorName) throw new ApiError('验光单只能由配镜部登记人登记，请选择登记人');
  const op = db.prepare('SELECT * FROM operators WHERE name = ?').get(String(operatorName).trim());
  if (!op) throw new ApiError(`登记人「${operatorName}」不存在，请先在后台维护`);
  const depts = (op.department || '').split(',').filter(Boolean);
  if (!depts.includes(DEPARTMENT.OPTICAL)) {
    throw new ApiError(`登记人「${operatorName}」不属于配镜部，验光单只能由配镜部登记人登记`);
  }
}

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
      // 支付与抵扣参数
      discountType = '',          // 'discount' | 'reduction' | ''
      discountValue = 0,          // 打折:折扣率(如0.8); 立减:金额
      balanceDeduction = 0,       // 余额抵扣金额
      balanceDeductionPhone = '', // 余额抵扣客户手机号（可不同于验光单本人）
      pointsDeduction = 0,        // 积分抵扣消耗的积分数
      pointsDeductionPhone = '',  // 积分抵扣客户手机号
      paidAmount = 0,             // 实付金额（店员确认/可修改）
      pointsEarned = null,        // 本次新增积分（店员可修改，null=自动按实付取整）
      // 按 IMPLEMENTATION.md 1.5 / Phase 2：店员在候选列表选择的客户标识
      customerRefId = '',
      // 按 IMPLEMENTATION.md Phase 4 / 1.2：复查周期与备注（显式列，两页化后由第2页提交）
      reviewCycleDays = null,
    } = req.body || {};

    const db = getDb();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const recDate = page1.record_date || todayDate();
    const phone = page1.phone ? String(page1.phone).trim() : '';
    const customerName = String(page1.name || '').trim();
    const gender = String(page1.gender || '').trim();

    // 按 IMPLEMENTATION.md 1.3 必填校验：姓名/手机号/性别必填
    if (!customerName) throw new ApiError('姓名为必填项');
    if (!phone) throw new ApiError('手机号为必填项');
    if (!/^1\d{10}$/.test(phone)) throw new ApiError('手机号格式不正确（需 11 位数字）');
    if (!gender) throw new ApiError('性别为必填项');

    // 校验登记人必须属于配镜部
    assertOpticalOperator(db, operator);

    // 按 IMPLEMENTATION.md 1.5 / Phase 2：确定 customer_ref_id
    // 店员选了会员/历史 → 继承该 refId；未选或新建 → 自引用（= 本条记录 id，见下方赋值）
    const providedRefId = String(customerRefId || '').trim();

    // 原价 = 镜片价 + 镜架价
    const lensPrice = Number(page6.lens_price || 0);
    const framePrice = Number(page6.frame_price || 0);
    const originalAmount = lensPrice + framePrice;

    // 折后价
    let discountedAmount = originalAmount;
    if (discountType === 'discount') {
      const rate = Number(discountValue);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new ApiError('打折折扣率必须在 0~1 之间（如 0.8 表示 8 折）');
      discountedAmount = Math.round(originalAmount * rate * 100) / 100;
    } else if (discountType === 'reduction') {
      const reduction = Number(discountValue);
      if (!Number.isFinite(reduction) || reduction < 0) throw new ApiError('立减金额必须 ≥ 0');
      discountedAmount = Math.max(0, originalAmount - reduction);
    }

    // 余额抵扣
    const balDeduct = Math.max(0, Number(balanceDeduction) || 0);
    const balDeductPhone = balanceDeductionPhone ? String(balanceDeductionPhone).trim() : '';

    // 积分抵扣
    const ptsDeduct = Math.max(0, Math.floor(Number(pointsDeduction) || 0));
    // 积分抵扣必须是 POINTS_TO_YUAN_RATE 的倍数
    const ptsDeductRounded = Math.floor(ptsDeduct / POINTS_TO_YUAN_RATE) * POINTS_TO_YUAN_RATE;
    const ptsDeductAmount = ptsDeductRounded / POINTS_TO_YUAN_RATE;
    const ptsDeductPhone = pointsDeductionPhone ? String(pointsDeductionPhone).trim() : '';

    // 实付金额
    const paid = Math.max(0, Number(paidAmount) || 0);

    // 新增积分（默认 = 实付金额取整，店员可覆盖）
    const earned = pointsEarned != null ? Math.floor(Number(pointsEarned) || 0) : Math.floor(paid);

    // 积分归属手机号
    const targetPhone = pointsTargetPhone ? String(pointsTargetPhone).trim() : '';

    // 重复登记检测：仅当会写积分时
    if (earned > 0 && targetPhone && !confirmDuplicate) {
      const dup = findDuplicatePoints(db, { customerPhone: targetPhone, amount: earned });
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
      customer_name: customerName,
      // 按 IMPLEMENTATION.md 1.5 / Phase 2：店员选了候选 → 继承其 refId；未选 → 自引用（id）
      customer_ref_id: providedRefId || id,
      // 按 IMPLEMENTATION.md Phase 4 / 1.2：复查周期优先取顶层 reviewCycleDays（两页化后由第2页提交），
      // 兼容旧版 page1.review_cycle_days
      review_cycle_days: Number(reviewCycleDays != null ? reviewCycleDays : page1.review_cycle_days) || 90,
      gender,
      notes: String(req.body?.notes || page1.notes || '').trim(),
      page1: JSON.stringify(page1),
      od_ds: JSON.stringify(od_ds),
      od_dc: JSON.stringify(od_dc),
      os_ds: JSON.stringify(os_ds),
      os_dc: JSON.stringify(os_dc),
      page6: JSON.stringify(page6),
      points_target_phone: targetPhone,
      points_amount: earned > 0 && targetPhone ? earned : 0,
      original_amount: originalAmount,
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      discounted_amount: discountedAmount,
      balance_deduction: balDeduct,
      points_deduction: ptsDeductRounded,
      points_deduction_amount: ptsDeductAmount,
      paid_amount: paid,
      points_earned: earned > 0 && targetPhone ? earned : 0,
      record_date: recDate,
      store,
      operator: String(operator || ''),
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };

    let pointsEarnedRow = null;
    let pointsDeductRow = null;
    let balanceDeductRow = null;

    withChangeTx(db, () => {
      // 自动为客户建 stub 档案（按规则3仅空回填 age/gender/birthday）
      if (phone) {
        ensureCustomer(db, {
          phone,
          name: customerName,
          address: String(page1.address || '').trim(),
          operator: String(operator || ''),
          age: page1.age != null ? page1.age : null,
          gender,
          birthday: page1.birthday || '',
        });
      }
      if (targetPhone && targetPhone !== phone) {
        ensureCustomer(db, { phone: targetPhone, operator: String(operator || '') });
      }

      // 余额抵扣：检查余额 + 写 balance_ledger + 更新 customers.balance
      if (balDeduct > 0 && balDeductPhone) {
        const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(balDeductPhone);
        if (!customer) throw new ApiError(`余额抵扣客户「${balDeductPhone}」不存在`);
        const currentBalance = Number(customer.balance || 0);
        if (currentBalance < balDeduct) {
          throw new ApiError(`客户「${balDeductPhone}」余额不足（当前 ${currentBalance.toFixed(2)} 元，需扣减 ${balDeduct.toFixed(2)} 元）`);
        }
        const bid = uuidv4();
        balanceDeductRow = {
          id: bid,
          customer_phone: balDeductPhone,
          amount: -balDeduct,
          source_type: BALANCE_SOURCE.CONSUME,
          related_prescription_id: id,
          note: '',
          store,
          operator: String(operator || ''),
          created_at: now,
          sync_status: 'pending',
        };
        db.prepare(
          `INSERT INTO balance_ledger (id, customer_phone, amount, source_type, related_prescription_id, note, store, operator, created_at, sync_status)
           VALUES (@id, @customer_phone, @amount, @source_type, @related_prescription_id, @note, @store, @operator, @created_at, @sync_status)`
        ).run(balanceDeductRow);
        recordChange(db, { tableName: 'balance_ledger', recordId: bid, operation: 'upsert', payload: balanceDeductRow });

        db.prepare('UPDATE customers SET balance = balance + ?, updated_at = ?, sync_status = ? WHERE phone = ?')
          .run(-balDeduct, now, 'pending', balDeductPhone);
        const updatedCust = db.prepare('SELECT * FROM customers WHERE phone = ?').get(balDeductPhone);
        if (updatedCust) recordChange(db, { tableName: 'customers', recordId: updatedCust.id, operation: 'upsert', payload: updatedCust });
      }

      // 积分抵扣：检查积分 + 写 points_ledger（负数）
      if (ptsDeductRounded > 0 && ptsDeductPhone) {
        const existingPoints = db
          .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM points_ledger WHERE customer_phone = ?')
          .get(ptsDeductPhone);
        const currentPoints = Number(existingPoints?.total || 0);
        if (currentPoints < ptsDeductRounded) {
          throw new ApiError(`客户「${ptsDeductPhone}」积分不足（当前 ${currentPoints} 分，需消耗 ${ptsDeductRounded} 分）`);
        }
        const pid = uuidv4();
        pointsDeductRow = {
          id: pid,
          customer_phone: ptsDeductPhone,
          amount: -ptsDeductRounded,
          source_type: POINTS_SOURCE.CONSUME_DEDUCT,
          related_prescription_id: id,
          note: `验光单积分抵扣（${ptsDeductAmount}元）`,
          store,
          operator: String(operator || ''),
          created_at: now,
          sync_status: 'pending',
        };
        db.prepare(
          `INSERT INTO points_ledger (id, customer_phone, amount, source_type, related_prescription_id, note, store, operator, created_at, sync_status)
           VALUES (@id, @customer_phone, @amount, @source_type, @related_prescription_id, @note, @store, @operator, @created_at, @sync_status)`
        ).run(pointsDeductRow);
        recordChange(db, { tableName: 'points_ledger', recordId: pid, operation: 'upsert', payload: pointsDeductRow });
      }

      // 写验光单
      db.prepare(
        `INSERT INTO prescriptions (id, customer_phone, customer_name, customer_ref_id, review_cycle_days, gender, notes, page1, od_ds, od_dc, os_ds, os_dc, page6, points_target_phone, points_amount,
           original_amount, discount_type, discount_value, discounted_amount, balance_deduction, points_deduction, points_deduction_amount, paid_amount, points_earned,
           record_date, store, operator, created_at, updated_at, sync_status)
         VALUES (@id, @customer_phone, @customer_name, @customer_ref_id, @review_cycle_days, @gender, @notes, @page1, @od_ds, @od_dc, @os_ds, @os_dc, @page6, @points_target_phone, @points_amount,
           @original_amount, @discount_type, @discount_value, @discounted_amount, @balance_deduction, @points_deduction, @points_deduction_amount, @paid_amount, @points_earned,
           @record_date, @store, @operator, @created_at, @updated_at, @sync_status)`
      ).run(prescriptionRow);
      recordChange(db, { tableName: 'prescriptions', recordId: id, operation: 'upsert', payload: prescriptionRow });

      // 写新增积分
      if (earned > 0 && targetPhone) {
        const pid2 = uuidv4();
        pointsEarnedRow = {
          id: pid2,
          customer_phone: targetPhone,
          amount: earned,
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
        ).run(pointsEarnedRow);
        recordChange(db, { tableName: 'points_ledger', recordId: pid2, operation: 'upsert', payload: pointsEarnedRow });
      }
    });

    // 积分即时推送
    if (pointsEarnedRow) {
      triggerPointsImmediatePush(pointsEarnedRow).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[prescription] 积分即时推送失败（待常规轮询补推）:', e.message);
      });
    }

    res.json(ok({
      prescription: prescriptionRow,
      pointsEarned: pointsEarnedRow,
      pointsDeducted: pointsDeductRow,
      balanceDeducted: balanceDeductRow,
    }));
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
