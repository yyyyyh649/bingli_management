// 客户 stub 自动创建助手
//
// 业务背景：cases / prescriptions / points 创建时若手机号在 customers 表不存在，
// 必须自动建一条 stub 客户记录，否则后续该手机号的 profile 接口会 404。
// 这保证"无论先做会员登记，还是先做病例/验光单登记，只要手机号一致都能查到"。
//
// 行为：
//   - 若客户已存在，返回已有记录（不做任何修改，姓名等以已登记的为准）
//   - 若不存在，插入一条 stub（name 取传入的 fallbackName 或空字符串，会员卡号为空=非会员）
//   - 自动 recordChange 入 outbox，参与云端同步
//   - 必须在调用方的事务内调用，以保证原子性
import { v4 as uuidv4 } from 'uuid';
import { nowISO } from '@optical/shared/constants.js';
import { recordChange } from './outbox.js';

/**
 * 在已有事务中确保客户存在；不存在则建 stub。
 * @param {object} db
 * @param {object} params
 * @param {string} params.phone        手机号（已校验过格式）
 * @param {string} [params.name]       可选姓名 fallback（仅新建时使用，已存在不覆盖）
 * @param {string} [params.address]    可选住址 fallback
 * @param {string} [params.operator]   可选登记人
 * @returns {object} 客户记录（已存在或新建）
 */
export function ensureCustomer(db, { phone, name = '', address = '', operator = '' }) {
  const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (existing) return existing;

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
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };
  db.prepare(
    `INSERT INTO customers (id, phone, name, member_card_no, address, store, operator, created_at, updated_at, sync_status)
     VALUES (@id, @phone, @name, @member_card_no, @address, @store, @operator, @created_at, @updated_at, @sync_status)`
  ).run(row);
  recordChange(db, { tableName: 'customers', recordId: id, operation: 'upsert', payload: row });
  return row;
}
