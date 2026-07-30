// 后台管理：删除日志、数据导出
import { Router } from 'express';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { createReadStream, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import {
  PRESCRIPTION_STEPS,
  PRESCRIPTION_STEP_LABELS,
  todayDate,
  nowISO,
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_MAX_PER_TYPE,
  TEMPLATE_PAGE_MAX_COLS,
} from '@optical/shared/constants.js';
import { EYE_EXAM_ITEMS } from '@optical/shared/questionnaire.js';
import { v4 as uuidv4 } from 'uuid';

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

// 按用户新需求 Phase F：充值数据查询
// 返回总实充金额 + 总到账金额 + 充值记录（可按手机号/日期区间筛选）
router.get('/recharge-stats', (req, res) => {
  const db = getDb();
  const phone = String(req.query.phone || '').trim();
  const startDate = String(req.query.startDate || '').trim();
  const endDate = String(req.query.endDate || '').trim();

  // 总实充 + 总到账（全部充值记录）
  const stats = db
    .prepare(
      `SELECT
         COALESCE(SUM(actual_amount), 0) AS total_actual,
         COALESCE(SUM(amount), 0) AS total_credited,
         COUNT(*) AS total_count
       FROM balance_ledger
       WHERE source_type = 'topup' AND amount > 0`
    )
    .get();

  // 充值记录列表（可筛选）
  const conditions = ["b.source_type = 'topup'", 'b.amount > 0'];
  const params = [];
  if (phone) {
    conditions.push('b.customer_phone = ?');
    params.push(phone);
  }
  if (startDate) {
    conditions.push('substr(b.created_at, 1, 10) >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('substr(b.created_at, 1, 10) <= ?');
    params.push(endDate);
  }
  const records = db
    .prepare(
      `SELECT b.id, b.customer_phone, b.amount, b.actual_amount, b.note, b.store, b.operator,
              b.created_at, c.name AS customer_name
       FROM balance_ledger b
       LEFT JOIN customers c ON c.phone = b.customer_phone
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.created_at DESC
       LIMIT 1000`
    )
    .all(...params);

  res.json(
    ok({
      totalActual: Number(stats.total_actual || 0),
      totalCredited: Number(stats.total_credited || 0),
      totalCount: Number(stats.total_count || 0),
      records,
    })
  );
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

// 按用户新需求 Phase I：服务器端变更记录查询（代理转发到云端 cloud_change_log）
// 防篡改审计：按日期/小时/表/操作/门店 查 cloud_change_log
router.get(
  '/audit-query',
  asyncHandler(async (req, res) => {
    const cloudUrl = process.env.CLOUD_SERVER_URL;
    const secret = process.env.SYNC_SECRET;
    if (!cloudUrl || !secret) throw new ApiError('未配置云端同步，无法查询服务器变更记录');

    const params = new URLSearchParams();
    for (const k of ['date', 'hour', 'table', 'operation', 'store']) {
      const v = String(req.query[k] || '').trim();
      if (v) params.set(k, v);
    }
    const url = `${cloudUrl.replace(/\/$/, '')}/api/sync/audit-query?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { 'X-Sync-Secret': secret, 'X-Sync-Store': process.env.STORE_ID || 'store1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new ApiError(`云端查询失败: HTTP ${resp.status} ${txt.slice(0, 200)}`);
    }
    const json = await resp.json();
    res.json(ok(json.data || []));
  })
);

// ============================================================================
// 按用户新需求 Phase C：回收站（软删除保留30天，可恢复，禁删回收站内容）
// ============================================================================
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { cleanExpiredRecycleBin, restoreFromRecycleBin, RECYCLE_RETENTION_DAYS } from '../lib/recycleBin.js';
import { checkDeletePassword } from '../lib/password.js';

// 表名 -> 中文名映射
const TABLE_LABELS_CN = {
  customers: '客户/会员',
  cases: '病例',
  prescriptions: '验光单',
  points_ledger: '积分明细',
  balance_ledger: '余额明细',
  operators: '登记人',
  form_templates: '模板',
};

// 列表（自动清理已过期项）
router.get('/recycle-bin', (req, res) => {
  const db = getDb();
  // 先清理过期项
  cleanExpiredRecycleBin(db);
  const table = String(req.query.table || '').trim();
  const conditions = [];
  const params = [];
  if (table) {
    conditions.push('table_name = ?');
    params.push(table);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(
      `SELECT id, table_name, record_id, store, operator, deleted_at, expires_at,
              substr(payload, 1, 500) AS payload_preview
       FROM recycle_bin ${where}
       ORDER BY deleted_at DESC
       LIMIT 1000`
    )
    .all(...params);
  const items = rows.map((r) => {
    let preview = {};
    try { preview = JSON.parse(r.payload_preview || '{}'); } catch { /* ignore */ }
    return {
      ...r,
      table_label: TABLE_LABELS_CN[r.table_name] || r.table_name,
      name: preview.name || preview.customer_name || preview.customer_phone || '(无名称)',
      retention_days: RECYCLE_RETENTION_DAYS,
    };
  });
  res.json(ok(items));
});

// 恢复（需密码）
router.post(
  '/recycle-bin/:id/restore',
  asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    if (!checkDeletePassword(password)) throw new ApiError('密码错误', 403);

    const db = getDb();
    const result = withChangeTx(db, () => {
      const r = restoreFromRecycleBin(db, req.params.id);
      // 恢复后记录变更，让同步机制重新推送这条 upsert 到其他门店
      recordChange(db, { tableName: r.tableName, recordId: r.recordId, operation: 'upsert', payload: r.record });
      return r;
    });
    res.json(ok({ restored: true, tableName: result.tableName, recordId: result.recordId }));
  })
);

// ============================================================================
// 按用户新需求 Phase G：会员积分档位管理
// ============================================================================
import {
  getTierConfig,
  getCumulativePoints,
  getTierForPoints,
  getMemberTierInfo,
  saveTierConfig,
  getLastResetDate,
} from '../lib/pointTier.js';
import { MEMBER_WHERE } from '../lib/memberFilter.js';

// 读取档位配置
router.get('/point-tiers', (req, res) => {
  const db = getDb();
  const config = getTierConfig(db);
  res.json(ok(config));
});

// 保存档位配置（1-10档，自定义名称+阈值，可选年度清零日）
router.post(
  '/point-tiers',
  asyncHandler(async (req, res) => {
    const { tiers = [], resetMonth = null, resetDay = null } = req.body || {};
    if (!Array.isArray(tiers)) throw new ApiError('tiers 必须是数组');
    if (tiers.length < 1 || tiers.length > 10) throw new ApiError('档位数量必须为 1-10 个');

    // 校验并排序：每个档位有 name（可选）和 threshold（>=0），按 threshold 升序
    const cleanTiers = tiers
      .map((t, i) => ({
        name: String(t.name || '').trim(),
        threshold: Math.max(0, Math.floor(Number(t.threshold || 0))),
      }))
      .sort((a, b) => a.threshold - b.threshold);

    // 第一个档位阈值必须为 0
    if (cleanTiers[0].threshold !== 0) {
      cleanTiers[0].threshold = 0;
    }

    let rm = resetMonth != null && resetMonth !== '' ? Number(resetMonth) : null;
    let rd = resetDay != null && resetDay !== '' ? Number(resetDay) : null;
    if (rm != null && (rm < 1 || rm > 12)) throw new ApiError('清零月份必须在 1-12 之间');
    if (rd != null && (rd < 1 || rd > 31)) throw new ApiError('清零日期必须在 1-31 之间');
    // 月份和日期必须同时有或同时无
    if ((rm != null) !== (rd != null)) throw new ApiError('清零月份和日期必须同时设置或同时不设置');

    const db = getDb();
    const row = withChangeTx(db, () => {
      const r = saveTierConfig(db, { tiers: cleanTiers, reset_month: rm, reset_day: rd });
      recordChange(db, { tableName: 'point_tier_config', recordId: 'default', operation: 'upsert', payload: r });
      return r;
    });
    res.json(ok({ tiers: cleanTiers, reset_month: rm, reset_day: rd }));
  })
);

// 查询某个会员的累计积分和档位
router.get('/point-tiers/member/:phone', (req, res) => {
  const db = getDb();
  const info = getMemberTierInfo(db, req.params.phone);
  const config = getTierConfig(db);
  res.json(ok({ ...info, resetDate: getLastResetDate(config) }));
});

// 查询全部会员的累计积分+档位（按累计积分降序），可按档位筛选
router.get('/point-tiers/members', (req, res) => {
  const db = getDb();
  const tierIndex = req.query.tier;
  const config = getTierConfig(db);

  // 查全部真会员
  const members = db
    .prepare(
      `SELECT id, phone, name, member_card_no FROM customers WHERE ${MEMBER_WHERE} ORDER BY created_at DESC`
    )
    .all();

  // 计算每个会员的累计积分和档位
  const results = members.map((m) => {
    const cumulative = getCumulativePoints(db, m.phone, config);
    const tier = getTierForPoints(cumulative, config);
    return { ...m, cumulative, tierIndex: tier.index, tierName: tier.name };
  });

  // 按累计积分降序
  results.sort((a, b) => b.cumulative - a.cumulative);

  // 按档位筛选
  let filtered = results;
  if (tierIndex != null && tierIndex !== '') {
    const idx = Number(tierIndex);
    filtered = results.filter((r) => r.tierIndex === idx);
  }

  res.json(ok({ config, members: filtered }));
});

// ============================================================================
// 按用户新需求 Phase H：验光单/病例模板 CRUD
// 个人信息页固定；模板只描述验光/检查/手术内容
// pages 结构: [{ items: [{ id, type:'choice'|'text', label, width(1-N), required, options:[string] }] }]
// "其他" 选项在渲染时自动追加、不入库
// ============================================================================
const VALID_TEMPLATE_TYPES = new Set(Object.values(TEMPLATE_TYPES));

// 校验并规整 pages 结构
function normalizePages(pages) {
  if (!Array.isArray(pages)) throw new ApiError('pages 必须是数组');
  const result = pages.map((page, pi) => {
    if (!page || typeof page !== 'object') throw new ApiError(`第 ${pi + 1} 页格式错误`);
    const items = Array.isArray(page.items) ? page.items : [];
    const normItems = items.map((it, ii) => {
      if (!it || typeof it !== 'object') throw new ApiError(`第 ${pi + 1} 页第 ${ii + 1} 题格式错误`);
      const type = String(it.type || '');
      if (type !== 'choice' && type !== 'text') throw new ApiError('题目类型必须是 choice 或 text');
      const label = String(it.label || '').trim();
      if (!label) throw new ApiError(`第 ${pi + 1} 页第 ${ii + 1} 题缺少问题文本`);
      let width = Math.floor(Number(it.width || 1));
      if (!Number.isFinite(width) || width < 1) width = 1;
      if (width > TEMPLATE_PAGE_MAX_COLS) width = TEMPLATE_PAGE_MAX_COLS;
      const required = !!it.required;
      let options = [];
      if (type === 'choice') {
        options = Array.isArray(it.options)
          ? it.options.map((o) => String(o || '').trim()).filter(Boolean)
          : [];
      }
      return {
        id: String(it.id || uuidv4()),
        type,
        label,
        width,
        required,
        options,
      };
    });
    return { items: normItems };
  });
  return result;
}

// 列表（按 type 过滤）
router.get('/templates', (req, res) => {
  const db = getDb();
  const type = String(req.query.type || '').trim();
  const conditions = [];
  const params = [];
  if (type) {
    if (!VALID_TEMPLATE_TYPES.has(type)) throw new ApiError('type 必须是 prescription 或 case');
    conditions.push('type = ?');
    params.push(type);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db
    .prepare(`SELECT id, type, name, store, operator, created_at, updated_at FROM form_templates ${where} ORDER BY updated_at DESC`)
    .all(...params);
  res.json(ok(rows));
});

// 详情
router.get('/templates/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(req.params.id);
  if (!row) throw new ApiError('模板不存在', 404);
  let pages = [];
  try { pages = JSON.parse(row.pages || '[]'); } catch { pages = []; }
  res.json(ok({ ...row, pages }));
});

// 新建 / 更新（id 为空则新建；每类型上限 TEMPLATE_MAX_PER_TYPE）
router.post(
  '/templates',
  asyncHandler(async (req, res) => {
    const { id = '', type, name, pages = [] } = req.body || {};
    if (!VALID_TEMPLATE_TYPES.has(type)) throw new ApiError('type 必须是 prescription 或 case');
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new ApiError('模板名称不能为空');
    if (cleanName.length > 50) throw new ApiError('模板名称过长（最多 50 字）');
    const cleanPages = normalizePages(pages);

    const db = getDb();
    const now = nowISO();
    const store = process.env.STORE_ID || 'store1';
    const operator = String(req.body?.operator || '');

    const result = withChangeTx(db, () => {
      if (id) {
        const existing = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(id);
        if (!existing) throw new ApiError('模板不存在', 404);
        if (existing.type !== type) throw new ApiError('不能修改模板类型');
        const row = {
          id,
          type,
          name: cleanName,
          pages: JSON.stringify(cleanPages),
          store: existing.store,
          operator: operator || existing.operator,
          created_at: existing.created_at,
          updated_at: now,
          sync_status: 'pending',
        };
        db.prepare(
          `UPDATE form_templates SET name = ?, pages = ?, operator = ?, updated_at = ?, sync_status = ? WHERE id = ?`
        ).run(row.name, row.pages, row.operator, row.updated_at, row.sync_status, row.id);
        recordChange(db, { tableName: 'form_templates', recordId: id, operation: 'upsert', payload: row });
        return row;
      }
      // 新建：检查同类型上限
      const cnt = db.prepare('SELECT COUNT(*) AS c FROM form_templates WHERE type = ?').get(type);
      if (Number(cnt?.c || 0) >= TEMPLATE_MAX_PER_TYPE) {
        throw new ApiError(`${TEMPLATE_TYPE_LABELS[type]}模板已达上限（${TEMPLATE_MAX_PER_TYPE} 个）`);
      }
      const newId = uuidv4();
      const row = {
        id: newId,
        type,
        name: cleanName,
        pages: JSON.stringify(cleanPages),
        store,
        operator,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
      };
      const cols = Object.keys(row).join(', ');
      const placeholders = Object.keys(row).map(() => '?').join(', ');
      db.prepare(`INSERT INTO form_templates (${cols}) VALUES (${placeholders})`).run(...Object.values(row));
      recordChange(db, { tableName: 'form_templates', recordId: newId, operation: 'upsert', payload: row });
      return row;
    });
    res.json(ok({ id: result.id, type, name: cleanName }));
  })
);

// 删除（密码确认 + 回收站）
router.delete(
  '/templates/:id',
  asyncHandler(async (req, res) => {
    const { password } = req.body || {};
    if (!checkDeletePassword(password)) throw new ApiError('密码错误', 403);
    const db = getDb();
    const result = withChangeTx(db, () => {
      const row = db.prepare('SELECT * FROM form_templates WHERE id = ?').get(req.params.id);
      if (!row) throw new ApiError('模板不存在', 404);
      let payload = row;
      try { payload = { ...row, pages: JSON.parse(row.pages || '[]') }; } catch { /* keep raw */ }
      saveToRecycleBin(db, 'form_templates', row, String(req.body?.operator || ''));
      db.prepare('DELETE FROM form_templates WHERE id = ?').run(req.params.id);
      // 删除留痕日志
      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('form_templates', row.id, row.store || '', nowISO());
      recordChange(db, { tableName: 'form_templates', recordId: row.id, operation: 'delete', payload: null });
      return { deleted: true, id: row.id };
    });
    res.json(ok(result));
  })
);

export default router;
