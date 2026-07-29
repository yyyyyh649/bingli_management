// 后台管理：删除日志、数据导出
import { Router } from 'express';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { createReadStream, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { PRESCRIPTION_STEPS, PRESCRIPTION_STEP_LABELS, todayDate } from '@optical/shared/constants.js';
import { EYE_EXAM_ITEMS } from '@optical/shared/questionnaire.js';

const router = Router();

// 按 IMPLEMENTATION.md Phase 5：每日积分/余额消耗明细及办理人
// 默认今日，可切日期；列出每笔变动的时间/会员/金额/类型/办理人
router.get('/daily-ledger', (req, res) => {
  const db = getDb();
  // 按 IMPLEMENTATION.md 红线规则9：created_at 为北京时间字符串（YYYY-MM-DDTHH:mm:ss）
  // 取 created_at 的日期部分与指定日期比较
  const date = String(req.query.date || todayDate()).trim();
  // 关联查客户姓名
  const points = db
    .prepare(
      `SELECT p.id, p.customer_phone, p.amount, p.source_type, p.note, p.store, p.operator,
              p.created_at, c.name AS customer_name
       FROM points_ledger p
       LEFT JOIN customers c ON c.phone = p.customer_phone
       WHERE substr(p.created_at, 1, 10) = ?
       ORDER BY p.created_at DESC`
    )
    .all(date);
  const balance = db
    .prepare(
      `SELECT b.id, b.customer_phone, b.amount, b.source_type, b.note, b.store, b.operator,
              b.created_at, c.name AS customer_name
       FROM balance_ledger b
       LEFT JOIN customers c ON c.phone = b.customer_phone
       WHERE substr(b.created_at, 1, 10) = ?
       ORDER BY b.created_at DESC`
    )
    .all(date);

  // 汇总
  const pointsTotal = points.reduce((s, r) => s + Number(r.amount || 0), 0);
  const balanceTotal = balance.reduce((s, r) => s + Number(r.amount || 0), 0);

  res.json(ok({ date, points, balance, pointsTotal, balanceTotal }));
});

// 删除日志列表
router.get('/delete-logs', (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit || 200), 1000);
  const rows = db
    .prepare('SELECT * FROM delete_logs ORDER BY id DESC LIMIT ?')
    .all(limit);
  res.json(ok(rows));
});

// 配镜部绩效统计：年度按月营业额 + 当前月汇总 + 按登记人明细
// 营业额 = prescriptions.paid_amount（按 record_date 年月分组）
router.get('/performance', (req, res) => {
  const db = getDb();
  const year = Number(req.query.year) || new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-12

  // 年度按月营业额（1~12 月）
  const monthlyRows = db
    .prepare(
      `SELECT CAST(strftime('%m', record_date) AS INTEGER) AS month,
              COUNT(*) AS cnt,
              COALESCE(SUM(paid_amount), 0) AS revenue,
              COALESCE(SUM(original_amount), 0) AS original,
              COALESCE(SUM(discounted_amount - paid_amount), 0) AS deduction
       FROM prescriptions
       WHERE strftime('%Y', record_date) = ?
         AND paid_amount IS NOT NULL
       GROUP BY month`
    )
    .all(String(year));
  const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const found = monthlyRows.find((r) => r.month === m);
    return {
      month: m,
      label: `${m}月`,
      count: found?.cnt || 0,
      revenue: Number(found?.revenue || 0),
      original: Number(found?.original || 0),
      deduction: Number(found?.deduction || 0),
    };
  });

  const yearTotal = monthlyRevenue.reduce((s, r) => s + r.revenue, 0);
  const yearCount = monthlyRevenue.reduce((s, r) => s + r.count, 0);
  const currentMonthData = monthlyRevenue.find((r) => r.month === currentMonth) || monthlyRevenue[0];

  // 按登记人绩效（本年）
  const operatorRows = db
    .prepare(
      `SELECT operator,
              COUNT(*) AS cnt,
              COALESCE(SUM(paid_amount), 0) AS revenue
       FROM prescriptions
       WHERE strftime('%Y', record_date) = ?
         AND paid_amount IS NOT NULL
       GROUP BY operator
       ORDER BY revenue DESC`
    )
    .all(String(year))
    .map((r) => ({
      operator: r.operator || '（未指定）',
      count: r.cnt,
      revenue: Number(r.revenue),
    }));

  res.json(
    ok({
      year,
      currentMonth,
      monthlyRevenue,
      yearTotal: Number(yearTotal.toFixed(2)),
      yearCount,
      currentMonthTotal: Number((currentMonthData?.revenue || 0).toFixed(2)),
      currentMonthCount: currentMonthData?.count || 0,
      operatorBreakdown: operatorRows,
    })
  );
});

// 解析 JSON 字段（容错）
function safeParse(s, fallback) {
  if (s == null) return fallback;
  if (typeof s !== 'string') return s;
  try { return JSON.parse(s); } catch { return fallback; }
}

// 把验光单记录展开为可读列
function flattenPrescription(row) {
  const page1 = safeParse(row.page1, {});
  const odDs = safeParse(row.od_ds, {});
  const odDc = safeParse(row.od_dc, {});
  const osDs = safeParse(row.os_ds, {});
  const osDc = safeParse(row.os_dc, {});
  const page6 = safeParse(row.page6, {});
  const out = {
    id: row.id,
    customer_phone: row.customer_phone,
    customer_name: row.customer_name,
    record_date: row.record_date,
    store: row.store,
    operator: row.operator,
    created_at: row.created_at,
    points_target_phone: row.points_target_phone,
    points_amount: row.points_amount,
    original_amount: row.original_amount ?? '',
    discount_type: row.discount_type || '',
    discount_value: row.discount_value ?? '',
    discounted_amount: row.discounted_amount ?? '',
    balance_deduction: row.balance_deduction ?? '',
    points_deduction: row.points_deduction ?? '',
    points_deduction_amount: row.points_deduction_amount ?? '',
    paid_amount: row.paid_amount ?? '',
    points_earned: row.points_earned ?? '',
    age: page1.age ?? '',
    address: page1.address ?? '',
    lens_price: page6.lens_price ?? '',
    frame_price: page6.frame_price ?? '',
    pd_near: page6.pd_near ?? '',
    pd_far: page6.pd_far ?? '',
  };
  for (const step of PRESCRIPTION_STEPS) {
    const label = PRESCRIPTION_STEP_LABELS[step];
    out[`OD_DS_${label}`] = odDs[step]?.value ?? '';
    out[`OD_DC_${label}`] = odDc[step]?.value ?? '';
    out[`OD_DC_${label}_轴向`] = odDc[step]?.axis ?? '';
    out[`OS_DS_${label}`] = osDs[step]?.value ?? '';
    out[`OS_DC_${label}`] = osDc[step]?.value ?? '';
    out[`OS_DC_${label}_轴向`] = osDc[step]?.axis ?? '';
  }
  return out;
}

// 把病例记录展开（复杂模式展开7模块数据：主诉病史问答/全身检查/眼科13项/特殊检查/诊断/治疗/手术摘要）
function flattenCase(row) {
  const base = {
    id: row.id,
    mode: row.mode,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_gender: row.customer_gender,
    customer_address: row.customer_address,
    condition: row.condition || '',
    record_date: row.record_date,
    store: row.store,
    operator: row.operator,
    created_at: row.created_at,
  };
  if (row.mode !== 'complex') return base;

  const an = safeParse(row.answers, {});
  // 旧格式兼容：若 answers 是数组（旧版仅问答），按问答展开
  if (Array.isArray(an)) {
    an.forEach((a, i) => {
      base[`Q${i + 1}_${a.questionText || a.questionId || ''}`] =
        a.selectedLabel + (a.otherText ? ` (${a.otherText})` : '');
    });
    return base;
  }

  // 模块1 主诉与病史（问答）
  base['主诉病史问答'] = (an.intake_answers || [])
    .map((x) => `${x.questionText || x.questionId}→${x.selectedLabel}${x.otherText ? '(' + x.otherText + ')' : ''}`)
    .join('；');

  // 模块2 全身检查
  const v = an.vitals || {};
  base['体温'] = v.T || '';
  base['脉搏'] = v.P || '';
  base['呼吸'] = v.R || '';
  base['血压'] = v.BP || '';
  base['全身情况'] = (v.general || '') + (v.generalNote ? '(' + v.generalNote + ')' : '');

  // 模块3 眼科检查（13项 × OD/OS）
  const ee = an.eye_exam || {};
  for (const eye of ['od', 'os']) {
    for (const it of EYE_EXAM_ITEMS) {
      const cell = (ee[eye] || {})[it];
      base[`${it}(${eye.toUpperCase()})`] = cell
        ? (cell.value || '') + (cell.note ? '(' + cell.note + ')' : '')
        : '';
    }
  }

  // 模块4 特殊检查
  const se = an.special_exam || {};
  base['角膜曲率'] = se.keratometry || '';
  base['OCT'] = se.oct || '';
  base['A超'] = se.a_scan || '';
  base['B超'] = se.b_scan || '';
  base['化验'] = se.lab || '';
  base['视野'] = se.visual_field || '';

  // 模块5 初步诊断 / 模块6 治疗计划
  base['初步诊断'] = (an.diagnosis || []).join('、');
  base['治疗计划'] = (an.treatment_plan || []).join('、');

  // 模块7 手术摘要
  const sg = an.surgery || {};
  const parts = [];
  if (sg.surgical_record && sg.surgical_record.surgery_name) parts.push('手术:' + sg.surgical_record.surgery_name);
  if (sg.anesthesia_pre_assessment && sg.anesthesia_pre_assessment.method) parts.push('麻醉:' + sg.anesthesia_pre_assessment.method);
  if (sg.followup_visits && sg.followup_visits.length) parts.push(`随访${sg.followup_visits.length}次`);
  base['手术摘要'] = parts.join('；');

  return base;
}

// 数据导出
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const type = (req.query.type || '').toString().toLowerCase();
    const db = getDb();

    if (type === 'db') {
      // 使用 better-sqlite3 的 backup API：保证 WAL 数据一并写入，且不阻塞主连接
      const tmpPath = resolve(`./data/export-${process.env.STORE_ID || 'store'}-${Date.now()}.db`);
      await db.backup(tmpPath);
      let st;
      try { st = statSync(tmpPath); } catch { throw new ApiError('备份文件生成失败', 500); }
      const filename = `local-${process.env.STORE_ID || 'store'}-${Date.now()}.db`;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', st.size);
      // 流式发送，结束后清理临时文件
      const stream = createReadStream(tmpPath);
      stream.on('close', () => {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      });
      stream.pipe(res);
      return;
    }

    if (type === 'excel') {
      const wb = XLSX.utils.book_new();

      const customers = db.prepare('SELECT * FROM customers ORDER BY created_at ASC').all();
      const points = db.prepare('SELECT * FROM points_ledger ORDER BY created_at ASC').all();
      const balance = db.prepare('SELECT * FROM balance_ledger ORDER BY created_at ASC').all();
      const cases = db.prepare('SELECT * FROM cases ORDER BY created_at ASC').all();
      const prescriptions = db.prepare('SELECT * FROM prescriptions ORDER BY created_at ASC').all();

      const wsCustomers = XLSX.utils.json_to_sheet(customers);
      XLSX.utils.book_append_sheet(wb, wsCustomers, '客户');

      const wsPoints = XLSX.utils.json_to_sheet(points);
      XLSX.utils.book_append_sheet(wb, wsPoints, '积分明细');

      const wsBalance = XLSX.utils.json_to_sheet(balance.length ? balance : [{}]);
      XLSX.utils.book_append_sheet(wb, wsBalance, '余额明细');

      const flatCases = cases.map(flattenCase);
      const wsCases = XLSX.utils.json_to_sheet(flatCases.length ? flatCases : [{}]);
      XLSX.utils.book_append_sheet(wb, wsCases, '病例');

      const flatRx = prescriptions.map(flattenPrescription);
      const wsRx = XLSX.utils.json_to_sheet(flatRx.length ? flatRx : [{}]);
      XLSX.utils.book_append_sheet(wb, wsRx, '验光单');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const filename = `export-${process.env.STORE_ID || 'store'}-${Date.now()}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buf);
      return;
    }

    throw new ApiError('type 参数必须为 db 或 excel');
  })
);

export default router;
