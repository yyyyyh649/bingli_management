// 客户 stub 自动创建助手
//
// 业务背景：cases / prescriptions / points 创建时若手机号在 customers 表不存在，
// 必须自动建一条 stub 客户记录，否则后续该手机号的 profile 接口会 404。
// 这保证"无论先做会员登记，还是先做病例/验光单登记，只要手机号一致都能查到"。
//
// 行为（按 IMPLEMENTATION.md 红线规则3：仅空回填，不覆盖已有值）：
//   - 若客户已存在：仅当该字段为空时才回填 name/address/age/gender/birthday；已有值绝不覆盖
//   - 若不存在，插入一条 stub（含传入的 age/gender/birthday，会员卡号为空=非会员）
//   - 自动 recordChange 入 outbox，参与云端同步
//   - 必须在调用方的事务内调用，以保证原子性
import { v4 as uuidv4 } from 'uuid';
import { nowISO } from '@optical/shared/constants.js';
import { recordChange } from './outbox.js';

/**
 * 在已有事务中确保客户存在；不存在则建 stub；已存在则仅空回填。
 * @param {object} db
 * @param {object} params
 * @param {string} params.phone        手机号（已校验过格式）
 * @param {string} [params.name]       可选姓名（仅空回填/新建时使用）
 * @param {string} [params.address]    可选住址（仅空回填/新建时使用）
 * @param {string} [params.operator]   可选登记人
 * @param {number|string} [params.age] 可选年龄（仅空回填/新建时使用）
 * @param {string} [params.gender]     可选性别（仅空回填/新建时使用）
 * @param {string} [params.birthday]   可选生日（仅空回填/新建时使用）
 * @returns {object} 客户记录（已存在或新建）
 */
export function ensureCustomer(db, { phone, name = '', address = '', operator = '', age = null, gender = '', birthday = '' }) {
  const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (existing) {
    // 规则3：仅空回填，已有值绝不覆盖
    const updates = {};
    const trimmedName = String(name || '').trim();
    const trimmedAddr = String(address || '').trim();
    const trimmedGender = String(gender || '').trim();
    const trimmedBirthday = String(birthday || '').trim();
    if (!existing.name && trimmedName) updates.name = trimmedName;
    if (!existing.address && trimmedAddr) updates.address = trimmedAddr;
    if (existing.gender == null || existing.gender === '') updates.gender = trimmedGender;
    if (existing.birthday == null || existing.birthday === '') updates.birthday = trimmedBirthday;
    if (existing.age == null && age != null && age !== '') updates.age = Number(age) || null;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = nowISO();
      updates.sync_status = 'pending';
      const setClauses = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE customers SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), existing.id);
      const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(existing.id);
      recordChange(db, { tableName: 'customers', recordId: existing.id, operation: 'upsert', payload: updated });
      return updated;
    }
    return existing;
  }

  const id = uuidv4();
  const store = process.env.STORE_ID || 'store1';
  const now = nowISO();
  const row = {
    id,
    phone,
    name: String(name || '').trim(),
    member_card_no: null, // stub，无会员卡号 = 非会员
    address: String(address || ''),
    store,
    operator: String(operator || ''),
    balance: 0,
    age: age != null && age !== '' ? Number(age) || null : null,
    birthday: String(birthday || '').trim(),
    gender: String(gender || '').trim(),
    age_is_estimated: 0,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };
  db.prepare(
    `INSERT INTO customers (id, phone, name, member_card_no, address, store, operator, balance, age, birthday, gender, age_is_estimated, created_at, updated_at, sync_status)
     VALUES (@id, @phone, @name, @member_card_no, @address, @store, @operator, @balance, @age, @birthday, @gender, @age_is_estimated, @created_at, @updated_at, @sync_status)`
  ).run(row);
  recordChange(db, { tableName: 'customers', recordId: id, operation: 'upsert', payload: row });
  return row;
}

/**
 * 按姓名+手机号自动判定同一人，返回应使用的 customer_ref_id。
 * 规则（按用户新需求，替代旧版"店员选候选"逻辑）：
 *   - 在 cases + prescriptions 中查「手机号相同 AND 姓名相同」的最早一条记录
 *   - 命中 → 继承其 customer_ref_id（同一个人）
 *   - 未命中 → 返回 null，调用方用本条记录 id 自引用（这个人的"起点"）
 *
 * 复查时间按 customer_ref_id 分组、同类记录分开算（验光单/病例各自独立），
 * customer_ref_id 跨表共享同一个人的标识。
 *
 * @param {object} db
 * @param {string} phone  已校验格式的手机号
 * @param {string} name   已 trim 的姓名
 * @returns {string|null} 已有 customer_ref_id 或 null（自引用）
 */
export function resolveCustomerRefId(db, phone, name) {
  if (!phone || !name) return null;
  const row = db
    .prepare(
      `SELECT customer_ref_id FROM (
         SELECT customer_ref_id, created_at FROM cases
           WHERE customer_phone = ? AND customer_name = ? AND customer_ref_id IS NOT NULL AND customer_ref_id != ''
         UNION ALL
         SELECT customer_ref_id, created_at FROM prescriptions
           WHERE customer_phone = ? AND customer_name = ? AND customer_ref_id IS NOT NULL AND customer_ref_id != ''
       )
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(phone, name, phone, name);
  return row?.customer_ref_id || null;
}
