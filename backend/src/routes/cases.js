// 病例
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, CASE_MODE, todayDate, DEPARTMENT, POINTS_SOURCE, BALANCE_SOURCE, POINTS_TO_YUAN_RATE } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';
import { ensureCustomer, resolveCustomerRefId } from '../lib/customer.js';
import { findDuplicatePoints } from '../lib/duplicate.js';
import { triggerPointsImmediatePush } from '../sync/index.js';
import { saveToRecycleBin } from '../lib/recycleBin.js';

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
      // 按 IMPLEMENTATION.md 1.5 / Phase 2：店员在候选列表选择的客户标识
      customerRefId = '',
      // 按用户新需求 Phase D：病例登记移植支付页，支付与抵扣参数（与 prescriptions 对称）
      originalAmount = 0,         // 总金额（店员填写）
      discountType = '',          // 'discount' | 'reduction' | ''
      discountValue = 0,          // 打折:折扣率(如0.8); 立减:金额
      balanceDeduction = 0,       // 余额抵扣金额
      balanceDeductionPhone = '', // 余额抵扣客户手机号
      pointsDeduction = 0,        // 积分抵扣消耗的积分数
      pointsDeductionPhone = '',  // 积分抵扣客户手机号
      paidAmount = 0,             // 实付金额（店员确认/可修改）
      pointsEarned = null,        // 本次新增积分（店员可修改，null=自动按实付取整）
      pointsTargetPhone = '',     // 积分归属手机号
      confirmDuplicate = false,
    } = req.body || {};
    // 注：customerRefId 已废弃，改为自动按「同手机号+同姓名」判定同一人

    if (!VALID_MODES.has(mode)) throw new ApiError('mode 必须为 simple 或 complex');

    const db = getDb();

    // 按 IMPLEMENTATION.md 1.3 必填校验：姓名/手机号/性别必填
    const cleanName = String(customerName || '').trim();
    const cleanPhone = customerPhone ? String(customerPhone).trim() : '';
    const cleanGender = String(customerGender || '').trim();
    if (!cleanName) throw new ApiError('姓名为必填项');
    if (!cleanPhone) throw new ApiError('手机号为必填项');
    if (!/^1\d{10}$/.test(cleanPhone)) throw new ApiError('手机号格式不正确（需 11 位数字）');
    if (!cleanGender) throw new ApiError('性别为必填项');

    // 校验登记人必须属于眼科部
    assertOphthalmologyOperator(db, operator);

    const id = uuidv4();
    const store = process.env.STORE_ID || 'store1';
    const now = nowISO();
    const recDate = recordDate || todayDate();

    // 按用户新需求：姓名+手机号必填，自动按「同手机号+同姓名」判定同一人，
    // 不再依赖店员手选候选。命中 → 继承已有 customer_ref_id；未命中 → 自引用（本条 id）。
    const resolvedRefId = resolveCustomerRefId(db, cleanPhone, cleanName);

    // ===== 支付参数计算（与 prescriptions 对称） =====
    // 原价 = 店员填写的总金额
    const origAmt = Math.max(0, Number(originalAmount) || 0);

    // 折后价
    let discountedAmount = origAmt;
    if (discountType === 'discount') {
      const rate = Number(discountValue);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new ApiError('打折折扣率必须在 0~1 之间（如 0.8 表示 8 折）');
      discountedAmount = Math.round(origAmt * rate * 100) / 100;
    } else if (discountType === 'reduction') {
      const reduction = Number(discountValue);
      if (!Number.isFinite(reduction) || reduction < 0) throw new ApiError('立减金额必须 ≥ 0');
      discountedAmount = Math.max(0, origAmt - reduction);
    }

    // 余额抵扣
    const balDeduct = Math.max(0, Number(balanceDeduction) || 0);
    const balDeductPhone = balanceDeductionPhone ? String(balanceDeductionPhone).trim() : '';

    // 积分抵扣
    const ptsDeduct = Math.max(0, Math.floor(Number(pointsDeduction) || 0));
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

    const row = {
      id,
      mode,
      customer_name: cleanName,
      customer_phone: cleanPhone,
      customer_gender: cleanGender,
      customer_address: String(customerAddress || ''),
      customer_ref_id: resolvedRefId || id,
      review_cycle_days: Number(req.body?.reviewCycleDays) || 90,
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
      // 支付字段
      original_amount: origAmt,
      discount_type: discountType,
      discount_value: Number(discountValue) || 0,
      discounted_amount: discountedAmount,
      balance_deduction: balDeduct,
      balance_deduction_phone: balDeductPhone,
      points_deduction: ptsDeductRounded,
      points_deduction_amount: ptsDeductAmount,
      points_deduction_phone: ptsDeductPhone,
      paid_amount: paid,
      points_earned: earned > 0 && targetPhone ? earned : 0,
      points_target_phone: targetPhone,
    };

    let pointsEarnedRow = null;
    let pointsDeductRow = null;
    let balanceDeductRow = null;

    withChangeTx(db, () => {
      // 若手机号非空且客户表里没有，自动建 stub 客户档案（保证先登记病例也能查到该客户）
      // 按规则3仅空回填 gender
      if (cleanPhone) {
        ensureCustomer(db, {
          phone: cleanPhone,
          name: row.customer_name,
          address: row.customer_address,
          operator: row.operator,
          gender: cleanGender,
        });
      }
      if (targetPhone && targetPhone !== cleanPhone) {
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
          note: '病例消费抵扣',
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
          note: `病例积分抵扣（${ptsDeductAmount}元）`,
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

      // 写病例（含支付字段）
      db.prepare(
        `INSERT INTO cases (id, mode, customer_name, customer_phone, customer_gender, customer_address, customer_ref_id, review_cycle_days, condition, answers, record_date, store, operator, created_at, updated_at, sync_status,
           original_amount, discount_type, discount_value, discounted_amount, balance_deduction, balance_deduction_phone, points_deduction, points_deduction_amount, points_deduction_phone, paid_amount, points_earned, points_target_phone)
         VALUES (@id, @mode, @customer_name, @customer_phone, @customer_gender, @customer_address, @customer_ref_id, @review_cycle_days, @condition, @answers, @record_date, @store, @operator, @created_at, @updated_at, @sync_status,
           @original_amount, @discount_type, @discount_value, @discounted_amount, @balance_deduction, @balance_deduction_phone, @points_deduction, @points_deduction_amount, @points_deduction_phone, @paid_amount, @points_earned, @points_target_phone)`
      ).run(row);
      recordChange(db, { tableName: 'cases', recordId: id, operation: 'upsert', payload: row });

      // 写新增积分（病例积分来源 = CASE）
      if (earned > 0 && targetPhone) {
        const pid2 = uuidv4();
        pointsEarnedRow = {
          id: pid2,
          customer_phone: targetPhone,
          amount: earned,
          source_type: POINTS_SOURCE.CASE,
          related_prescription_id: id,
          note: '病例登记积分',
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
        console.error('[case] 积分即时推送失败（待常规轮询补推）:', e.message);
      });
    }

    res.json(ok({
      case: row,
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
    const existing = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
    if (!existing) throw new ApiError('病例不存在', 404);

    withChangeTx(db, () => {
      saveToRecycleBin(db, 'cases', existing);
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
