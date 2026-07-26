// 后台管理：删除日志、数据导出
import { Router } from 'express';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { createReadStream, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { PRESCRIPTION_STEPS, PRESCRIPTION_STEP_LABELS } from '@optical/shared/constants.js';

const router = Router();

// 删除日志列表
router.get('/delete-logs', (req, res) => {
  const db = getDb();
  const limit = Math.min(Number(req.query.limit || 200), 1000);
  const rows = db
    .prepare('SELECT * FROM delete_logs ORDER BY id DESC LIMIT ?')
    .all(limit);
  res.json(ok(rows));
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

// 把病例记录展开（复杂模式的 answers 展开）
function flattenCase(row) {
  const base = {
    id: row.id,
    mode: row.mode,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_gender: row.customer_gender,
    customer_address: row.customer_address,
    condition: row.condition,
    record_date: row.record_date,
    store: row.store,
    operator: row.operator,
    created_at: row.created_at,
  };
  if (row.mode === 'complex') {
    const answers = safeParse(row.answers, []);
    answers.forEach((a, i) => {
      base[`Q${i + 1}_${a.questionText || a.questionId || ''}`] =
        a.selectedLabel + (a.otherText ? ` (${a.otherText})` : '');
    });
  }
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
      const cases = db.prepare('SELECT * FROM cases ORDER BY created_at ASC').all();
      const prescriptions = db.prepare('SELECT * FROM prescriptions ORDER BY created_at ASC').all();

      const wsCustomers = XLSX.utils.json_to_sheet(customers);
      XLSX.utils.book_append_sheet(wb, wsCustomers, '客户');

      const wsPoints = XLSX.utils.json_to_sheet(points);
      XLSX.utils.book_append_sheet(wb, wsPoints, '积分明细');

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
