// 客户/会员
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';

const router = Router();

// 手机号校验：11 位数字
function validatePhone(phone) {
  if (!phone) return false;
  return /^1\d{10}$/.test(String(phone).trim());
}

// 列出全部客户（按创建时间倒序，最多 500 条）
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT 500')
    .all();
  res.json(ok(rows));
});

// 模糊查询（手机号后4位 / 完整手机号 / 姓名 / 会员卡号）
router.get('/search', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json(ok([]));
  const db = getDb();
  // 单一关键词，自动适配：纯数字 → 手机号（精确或后4位）+ 会员卡号；非数字 → 姓名
  let rows;
  if (/^\d+$/.test(q)) {
    rows = db
      .prepare(
        `SELECT * FROM customers
         WHERE phone = ? OR phone LIKE ? OR member_card_no LIKE ?
         ORDER BY (phone = ?) DESC, name ASC LIMIT 100`
      )
      .all(q, `%${q}`, `%${q}`, q);
  } else {
    rows = db
      .prepare(
        `SELECT * FROM customers WHERE name LIKE ? ORDER BY name ASC LIMIT 100`
      )
      .all(`%${q}%`);
  }
  res.json(ok(rows));
});

// 精确按手机号查
router.get('/by-phone/:phone', (req, res) => {
  const phone = req.params.phone;
  const db = getDb();
  const row = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!row) throw new ApiError('客户不存在', 404);
  res.json(ok(row));
});

// 聚合：客户积分页面数据
router.get('/:phone/profile', (req, res) => {
  const phone = req.params.phone;
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!customer) throw new ApiError('客户不存在', 404);

  const points = db
    .prepare('SELECT * FROM points_ledger WHERE customer_phone = ? ORDER BY created_at ASC')
    .all(phone);
  const cases = db
    .prepare('SELECT * FROM cases WHERE customer_phone = ? ORDER BY record_date DESC, created_at DESC')
    .all(phone);
  const prescriptions = db
    .prepare('SELECT * FROM prescriptions WHERE customer_phone = ? ORDER BY record_date DESC, created_at DESC')
    .all(phone);

  const totalPoints = points.reduce((s, r) => s + Number(r.amount || 0), 0);

  res.json(
    ok({
      customer,
      totalPoints,
      pointsLedger: points,
      cases,
      prescriptions,
    })
  );
});

// 新建/合并客户
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { phone, name, memberCardNo, address, operator } = req.body || {};
    const cleanPhone = String(phone || '').trim();
    if (!validatePhone(cleanPhone)) throw new ApiError('手机号格式不正确（需 11 位数字）');
    const db = getDb();
    const store = process.env.STORE_ID || 'store1';

    // 去重：phone 已存在则合并（取最后更新时间较新的为准 LWW）
    const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(cleanPhone);
    if (existing) {
      const next = {
        ...existing,
        name: name !== undefined ? String(name).trim() : existing.name,
        member_card_no: memberCardNo !== undefined ? (memberCardNo ? String(memberCardNo).trim() : null) : existing.member_card_no,
        address: address !== undefined ? String(address || '') : existing.address,
        updated_at: nowISO(),
        sync_status: 'pending',
      };
      withChangeTx(db, () => {
        db.prepare(
          `UPDATE customers SET name = ?, member_card_no = ?, address = ?, updated_at = ?, sync_status = ? WHERE id = ?`
        ).run(next.name, next.member_card_no, next.address, next.updated_at, 'pending', existing.id);
        recordChange(db, { tableName: 'customers', recordId: existing.id, operation: 'upsert', payload: next });
      });
      return res.json(ok(next));
    }

    const id = uuidv4();
    const now = nowISO();
    const row = {
      id,
      phone: cleanPhone,
      name: String(name || '').trim(),
      member_card_no: memberCardNo ? String(memberCardNo).trim() : null,
      address: String(address || ''),
      store,
      operator: String(operator || ''),
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };
    withChangeTx(db, () => {
      db.prepare(
        `INSERT INTO customers (id, phone, name, member_card_no, address, store, operator, created_at, updated_at, sync_status)
         VALUES (@id, @phone, @name, @member_card_no, @address, @store, @operator, @created_at, @updated_at, @sync_status)`
      ).run(row);
      recordChange(db, { tableName: 'customers', recordId: id, operation: 'upsert', payload: row });
    });
    res.json(ok(row));
  })
);

// 修改
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, memberCardNo, address } = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) throw new ApiError('客户不存在', 404);

    const next = {
      ...existing,
      name: name !== undefined ? String(name).trim() : existing.name,
      member_card_no: memberCardNo !== undefined ? (memberCardNo ? String(memberCardNo).trim() : null) : existing.member_card_no,
      address: address !== undefined ? String(address || '') : existing.address,
      updated_at: nowISO(),
      sync_status: 'pending',
    };
    withChangeTx(db, () => {
      db.prepare(
        `UPDATE customers SET name = ?, member_card_no = ?, address = ?, updated_at = ?, sync_status = ? WHERE id = ?`
      ).run(next.name, next.member_card_no, next.address, next.updated_at, 'pending', id);
      recordChange(db, { tableName: 'customers', recordId: id, operation: 'upsert', payload: next });
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
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) throw new ApiError('客户不存在', 404);

    withChangeTx(db, () => {
      db.prepare('DELETE FROM customers WHERE id = ?').run(id);
      // 注意：积分明细、病例、验光单不级联删除（保留历史）；用户单独删
      recordChange(db, { tableName: 'customers', recordId: id, operation: 'delete', payload: null });
      db.prepare(
        `INSERT INTO delete_logs (deleted_table, deleted_record_id, store, deleted_at) VALUES (?, ?, ?, ?)`
      ).run('customers', id, process.env.STORE_ID || 'store1', nowISO());
    });
    res.json(ok({ deleted: true }));
  })
);

export default router;
