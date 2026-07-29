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

// 按 IMPLEMENTATION.md Phase 2：候选列表接口（会员匹配 ∪ 客户历史代表）
// 用于登记时让店员选择"这是哪个人"，从而确定 customer_ref_id
router.get('/candidates', (req, res) => {
  const { name, phone } = req.query;
  const qName = String(name || '').trim();
  const qPhone = String(phone || '').trim();
  if (!qName && !qPhone) return res.json(ok([]));
  const db = getDb();
  const candidates = [];
  const seenRefIds = new Set();

  // 1. 会员系统匹配
  let members = [];
  if (qPhone && /^\d+$/.test(qPhone)) {
    members = db
      .prepare('SELECT id, name, phone, gender, age, birthday FROM customers WHERE phone = ? OR phone LIKE ? LIMIT 20')
      .all(qPhone, `%${qPhone}`);
  } else if (qName) {
    members = db
      .prepare('SELECT id, name, phone, gender, age, birthday FROM customers WHERE name LIKE ? LIMIT 20')
      .all(`%${qName}%`);
  }
  for (const m of members) {
    if (!seenRefIds.has(m.id)) {
      seenRefIds.add(m.id);
      candidates.push({
        refId: m.id,
        name: m.name,
        phone: m.phone,
        source: 'member',
        gender: m.gender || '',
        age: m.age,
        birthday: m.birthday || '',
      });
    }
  }

  // 2. 客户系统历史代表（cases + prescriptions 按 customer_ref_id 去重）
  const histConditions = [];
  const histParams = [];
  if (qPhone && /^\d+$/.test(qPhone)) {
    histConditions.push('customer_phone = ?');
    histParams.push(qPhone);
  }
  if (qName) {
    histConditions.push('customer_name LIKE ?');
    histParams.push(`%${qName}%`);
  }
  const histWhere = histConditions.length ? `WHERE ${histConditions.join(' AND ')}` : '';
  const histSql = `
    SELECT customer_ref_id, customer_name, customer_phone, MAX(record_date) AS last_record_date
    FROM (
      SELECT customer_ref_id, customer_name, customer_phone, record_date FROM cases WHERE customer_ref_id != ''
      UNION ALL
      SELECT customer_ref_id, customer_name, customer_phone, record_date FROM prescriptions WHERE customer_ref_id != ''
    ) ${histWhere}
    GROUP BY customer_ref_id
    ORDER BY last_record_date DESC
    LIMIT 30
  `;
  const history = db.prepare(histSql).all(...histParams);
  for (const h of history) {
    if (!seenRefIds.has(h.customer_ref_id)) {
      seenRefIds.add(h.customer_ref_id);
      candidates.push({
        refId: h.customer_ref_id,
        name: h.customer_name,
        phone: h.customer_phone,
        source: 'history',
        lastRecordDate: h.last_record_date,
      });
    }
  }

  res.json(ok(candidates));
});

// 按 IMPLEMENTATION.md Phase 3：客户查询页数据源
// 聚合 cases + prescriptions，按 (customer_name, customer_phone) 分组（同一手机号多名 → 多个姓名分组）
// 含会员与非会员标记；支持按 姓名 / 手机号 / 手机号后四位 搜索
router.get('/records', (req, res) => {
  const q = String(req.query.q || '').trim();
  const db = getDb();
  const params = [];
  const conditions = [];
  if (q) {
    if (/^\d+$/.test(q)) {
      // 纯数字 → 手机号精确 / 后4位 LIKE
      conditions.push('customer_phone = ? OR customer_phone LIKE ?');
      params.push(q, `%${q}`);
    } else {
      conditions.push('customer_name LIKE ?');
      params.push(`%${q}%`);
    }
  }
  const sql = `
    SELECT type, id, customer_name, customer_phone, record_date, operator, store, created_at FROM (
      SELECT 'prescription' AS type, id, customer_name, customer_phone, record_date, operator, store, created_at
      FROM prescriptions ${conditions.length ? 'WHERE ' + conditions.join(' OR ') : ''}
      UNION ALL
      SELECT 'case' AS type, id, customer_name, customer_phone, record_date, operator, store, created_at
      FROM cases ${conditions.length ? 'WHERE ' + conditions.join(' OR ') : ''}
    )
    ORDER BY record_date DESC, created_at DESC
    LIMIT 500
  `;
  // 注意：UNION ALL 内部各自带 WHERE，参数需重复两份
  const rows = db.prepare(sql).all(...params, ...params);

  // 按 (customer_name, customer_phone) 分组
  const groupMap = new Map();
  for (const r of rows) {
    const key = `${r.customer_name || ''}||${r.customer_phone || ''}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        name: r.customer_name || '',
        phone: r.customer_phone || '',
        records: [],
        last_record_date: r.record_date,
      });
    }
    groupMap.get(key).records.push({
      type: r.type,
      id: r.id,
      record_date: r.record_date,
      operator: r.operator,
      store: r.store,
    });
  }

  // 批量查会员标记（按手机号）
  const groups = Array.from(groupMap.values());
  const phones = [...new Set(groups.map((g) => g.phone).filter(Boolean))];
  const memberMap = new Map();
  if (phones.length) {
    const placeholders = phones.map(() => '?').join(',');
    const members = db
      .prepare(`SELECT phone, member_card_no FROM customers WHERE phone IN (${placeholders})`)
      .all(...phones);
    for (const m of members) memberMap.set(m.phone, m);
  }
  for (const g of groups) {
    const m = memberMap.get(g.phone);
    g.is_member = !!m;
    g.member_card_no = m?.member_card_no || '';
    g.record_count = g.records.length;
  }

  // 排序：按最近登记日期倒序
  groups.sort((a, b) => (b.last_record_date || '').localeCompare(a.last_record_date || ''));
  res.json(ok(groups));
});

// 按 IMPLEMENTATION.md Phase 3：登记页双区数据（会员信息 + 客户历史）
// 用于验光单/病例登记页输入姓名或手机号后，下方同时展示会员信息区与客户历史区
router.get('/registration-context', (req, res) => {
  const { name, phone } = req.query;
  const qName = String(name || '').trim();
  const qPhone = String(phone || '').trim();
  const db = getDb();

  // 1. 会员信息：优先按完整手机号精确查，否则按姓名查
  let member = null;
  if (qPhone && /^1\d{10}$/.test(qPhone)) {
    member = db
      .prepare(
        `SELECT c.*, COALESCE((SELECT SUM(amount) FROM points_ledger WHERE customer_phone = c.phone), 0) AS points
         FROM customers c WHERE c.phone = ?`
      )
      .get(qPhone);
  } else if (qName) {
    member = db
      .prepare(
        `SELECT c.*, COALESCE((SELECT SUM(amount) FROM points_ledger WHERE customer_phone = c.phone), 0) AS points
         FROM customers c WHERE c.name LIKE ? ORDER BY c.updated_at DESC LIMIT 1`
      )
      .get(`%${qName}%`);
  }

  // 2. 客户历史：cases + prescriptions 按 name/phone 匹配，取最近 20 条
  const conditions = [];
  const params = [];
  if (qPhone && /^\d{4,}$/.test(qPhone)) {
    conditions.push('customer_phone = ?');
    params.push(qPhone);
  }
  if (qName) {
    conditions.push('customer_name LIKE ?');
    params.push(`%${qName}%`);
  }
  const history = db
    .prepare(
      `SELECT type, id, customer_name, customer_phone, record_date, operator FROM (
        SELECT 'prescription' AS type, id, customer_name, customer_phone, record_date, operator, created_at
        FROM prescriptions ${conditions.length ? 'WHERE ' + conditions.join(' OR ') : ''}
        UNION ALL
        SELECT 'case' AS type, id, customer_name, customer_phone, record_date, operator, created_at
        FROM cases ${conditions.length ? 'WHERE ' + conditions.join(' OR ') : ''}
      )
      ORDER BY record_date DESC, created_at DESC
      LIMIT 20`
    )
    .all(...params, ...params);

  res.json(ok({ member, history }));
});

// 复查提醒：分开返回 配镜部(验光单) / 眼科部(病例) 到期未复查客户
// 按 IMPLEMENTATION.md Phase 2 / 红线规则4：按 customer_ref_id 分组，同类记录取最近一条；验光单与病历分开算
router.get('/review-reminders', (req, res) => {
  const db = getDb();
  const today = todayDate();

  // 配镜部：基于 prescriptions 按 customer_ref_id 分组取最近一条
  const optical = db
    .prepare(
      `SELECT p.customer_ref_id, p.customer_name, p.customer_phone, p.record_date AS last_record_date,
              p.review_cycle_days,
              date(p.record_date, '+' || COALESCE(p.review_cycle_days, ${DEFAULT_REVIEW_CYCLE_DAYS}) || ' days') AS due_date,
              c.id AS customer_id, c.review_contact_status, c.review_contact_note
       FROM prescriptions p
       LEFT JOIN customers c ON c.phone = p.customer_phone
       WHERE p.id = (
         SELECT p2.id FROM prescriptions p2
         WHERE p2.customer_ref_id = p.customer_ref_id
         ORDER BY p2.record_date DESC, p2.created_at DESC LIMIT 1
       )
       AND date(p.record_date, '+' || COALESCE(p.review_cycle_days, ${DEFAULT_REVIEW_CYCLE_DAYS}) || ' days') < date(?)
       ORDER BY due_date ASC`
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

  // 眼科部：基于 cases 按 customer_ref_id 分组取最近一条
  const ophthalmology = db
    .prepare(
      `SELECT cs.customer_ref_id, cs.customer_name, cs.customer_phone, cs.record_date AS last_record_date,
              cs.review_cycle_days,
              date(cs.record_date, '+' || COALESCE(cs.review_cycle_days, ${DEFAULT_REVIEW_CYCLE_DAYS}) || ' days') AS due_date,
              c.id AS customer_id, c.review_contact_status, c.review_contact_note
       FROM cases cs
       LEFT JOIN customers c ON c.phone = cs.customer_phone
       WHERE cs.id = (
         SELECT cs2.id FROM cases cs2
         WHERE cs2.customer_ref_id = cs.customer_ref_id
         ORDER BY cs2.record_date DESC, cs2.created_at DESC LIMIT 1
       )
       AND date(cs.record_date, '+' || COALESCE(cs.review_cycle_days, ${DEFAULT_REVIEW_CYCLE_DAYS}) || ' days') < date(?)
       ORDER BY due_date ASC`
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
