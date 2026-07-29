// 客户/会员
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ok, asyncHandler, ApiError } from '../lib/response.js';
import { getDb } from '../db.js';
import { recordChange, withChangeTx } from '../lib/outbox.js';
import { nowISO, todayDate } from '@optical/shared/constants.js';
import { REVIEW_CONTACT_STATUS, DEFAULT_REVIEW_CYCLE_DAYS } from '@optical/shared/constants.js';
import { checkDeletePassword } from '../lib/password.js';

const router = Router();

// 手机号校验：11 位数字
function validatePhone(phone) {
  if (!phone) return false;
  return /^1\d{10}$/.test(String(phone).trim());
}

// 按 IMPLEMENTATION.md 1.4：由生日派生年龄（周岁）
function ageFromBirthday(birthday) {
  const b = String(birthday || '').trim();
  const m = b.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const today = todayDate();
  let age = Number(today.slice(0, 4)) - Number(m[1]);
  const monthDay = today.slice(5);
  if (monthDay < `${m[2]}-${m[3]}`) age -= 1;
  return age >= 0 ? age : 0;
}

const VALID_CONTACT_STATUS = new Set(Object.values(REVIEW_CONTACT_STATUS));

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

// 复查提醒：分开返回 配镜部(验光单) / 眼科部(病例) 到期未复查客户
// 规则：最近一次记录日期 + review_cycle_days < 今天 → 需复查
router.get('/review-reminders', (req, res) => {
  const db = getDb();
  const today = todayDate();

  // 配镜部：基于最近一次验光单
  const optical = db
    .prepare(
      `SELECT c.*, MAX(p.record_date) AS last_record_date,
              date(MAX(p.record_date), '+' || COALESCE(c.review_cycle_days, ${DEFAULT_REVIEW_CYCLE_DAYS}) || ' days') AS due_date
       FROM customers c
       JOIN prescriptions p ON p.customer_phone = c.phone
       GROUP BY c.id
       HAVING due_date IS NOT NULL AND due_date < date(?)`
    )
    .all(today)
    .map((r) => {
      const cycle = Number(r.review_cycle_days || DEFAULT_REVIEW_CYCLE_DAYS);
      return {
        ...r,
        review_cycle_days: cycle,
        overdue_days: Math.floor((Date.parse(today) - Date.parse(r.due_date)) / 86400000),
      };
    });

  // 眼科部：基于最近一次病例
  const ophthalmology = db
    .prepare(
      `SELECT c.*, MAX(cs.record_date) AS last_record_date,
              date(MAX(cs.record_date), '+' || COALESCE(c.review_cycle_days, ${DEFAULT_REVIEW_CYCLE_DAYS}) || ' days') AS due_date
       FROM customers c
       JOIN cases cs ON cs.customer_phone = c.phone
       GROUP BY c.id
       HAVING due_date IS NOT NULL AND due_date < date(?)`
    )
    .all(today)
    .map((r) => {
      const cycle = Number(r.review_cycle_days || DEFAULT_REVIEW_CYCLE_DAYS);
      return {
        ...r,
        review_cycle_days: cycle,
        overdue_days: Math.floor((Date.parse(today) - Date.parse(r.due_date)) / 86400000),
      };
    });

  res.json(ok({ optical, ophthalmology, today }));
});

// 更新客户复查信息（周期/联系状态/备注）
router.patch(
  '/:id/review',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reviewCycleDays, reviewContactStatus, reviewContactNote } = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!existing) throw new ApiError('客户不存在', 404);

    const next = { ...existing };
    if (reviewCycleDays !== undefined) {
      const n = Number(reviewCycleDays);
      if (!Number.isFinite(n) || n <= 0) throw new ApiError('复查周期必须为正整数（天）');
      next.review_cycle_days = Math.floor(n);
    }
    if (reviewContactStatus !== undefined) {
      const s = String(reviewContactStatus);
      if (!VALID_CONTACT_STATUS.has(s)) throw new ApiError('联系状态不合法');
      next.review_contact_status = s;
    }
    if (reviewContactNote !== undefined) {
      next.review_contact_note = String(reviewContactNote || '');
    }
    next.review_contact_updated_at = nowISO();
    next.updated_at = nowISO();
    next.sync_status = 'pending';

    withChangeTx(db, () => {
      db.prepare(
        `UPDATE customers SET review_cycle_days = ?, review_contact_status = ?, review_contact_note = ?, review_contact_updated_at = ?, updated_at = ?, sync_status = ? WHERE id = ?`
      ).run(next.review_cycle_days, next.review_contact_status, next.review_contact_note, next.review_contact_updated_at, next.updated_at, 'pending', id);
      recordChange(db, { tableName: 'customers', recordId: id, operation: 'upsert', payload: next });
    });
    res.json(ok(next));
  })
);

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
  const balanceLedger = db
    .prepare('SELECT * FROM balance_ledger WHERE customer_phone = ? ORDER BY created_at ASC')
    .all(phone);
  const cases = db
    .prepare('SELECT * FROM cases WHERE customer_phone = ? ORDER BY record_date DESC, created_at DESC')
    .all(phone);
  const prescriptions = db
    .prepare('SELECT * FROM prescriptions WHERE customer_phone = ? ORDER BY record_date DESC, created_at DESC')
    .all(phone);

  const totalPoints = points.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalBalance = balanceLedger.reduce((s, r) => s + Number(r.amount || 0), 0);

  res.json(
    ok({
      customer,
      totalPoints,
      totalBalance,
      pointsLedger: points,
      balanceLedger,
      cases,
      prescriptions,
    })
  );
});

// 新建/合并客户（会员登记）
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { phone, name, memberCardNo, address, operator, birthday, gender, age } = req.body || {};
    const cleanPhone = String(phone || '').trim();
    if (!validatePhone(cleanPhone)) throw new ApiError('手机号格式不正确（需 11 位数字）');
    // 按 IMPLEMENTATION.md 1.4：会员登记时生日、性别必选
    const cleanBirthday = String(birthday || '').trim();
    const cleanGender = String(gender || '').trim();
    if (!cleanBirthday) throw new ApiError('生日为必填项');
    if (!cleanGender) throw new ApiError('性别为必填项');

    // 年龄派生：有生日→由生日算（age_is_estimated=0）；无生日但有年龄→估算（age_is_estimated=1）
    let derivedAge = null;
    let ageIsEstimated = 0;
    if (cleanBirthday) {
      derivedAge = ageFromBirthday(cleanBirthday);
      ageIsEstimated = 0;
    } else if (age != null && age !== '') {
      derivedAge = Number(age) || null;
      ageIsEstimated = 1;
    }

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
        birthday: cleanBirthday || existing.birthday || null,
        gender: cleanGender || existing.gender || '',
        age: derivedAge != null ? derivedAge : existing.age,
        age_is_estimated: ageIsEstimated,
        updated_at: nowISO(),
        sync_status: 'pending',
      };
      withChangeTx(db, () => {
        db.prepare(
          `UPDATE customers SET name = ?, member_card_no = ?, address = ?, birthday = ?, gender = ?, age = ?, age_is_estimated = ?, updated_at = ?, sync_status = ? WHERE id = ?`
        ).run(next.name, next.member_card_no, next.address, next.birthday, next.gender, next.age, next.age_is_estimated, next.updated_at, 'pending', existing.id);
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
      balance: 0,
      birthday: cleanBirthday || null,
      gender: cleanGender,
      age: derivedAge,
      age_is_estimated: ageIsEstimated,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };
    withChangeTx(db, () => {
      db.prepare(
        `INSERT INTO customers (id, phone, name, member_card_no, address, store, operator, balance, birthday, gender, age, age_is_estimated, created_at, updated_at, sync_status)
         VALUES (@id, @phone, @name, @member_card_no, @address, @store, @operator, @balance, @birthday, @gender, @age, @age_is_estimated, @created_at, @updated_at, @sync_status)`
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
