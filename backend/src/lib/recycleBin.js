// 按用户新需求 Phase C：回收站（软删除保留30天，可恢复，禁删回收站内容）
// 删除时把完整记录快照存入 recycle_bin；30天后自动清理；期间可恢复
import { v4 as uuidv4 } from 'uuid';
import { nowISO } from '@optical/shared/constants.js';

// 回收站保留天数
export const RECYCLE_RETENTION_DAYS = 30;

// 各同步表的白名单字段（用于恢复时 INSERT OR REPLACE，与 applyChange.js 保持一致）
const TABLE_FIELDS = {
  customers: ['id', 'phone', 'name', 'member_card_no', 'address', 'store', 'operator', 'balance', 'age', 'birthday', 'gender', 'age_is_estimated', 'review_cycle_days', 'review_contact_status', 'review_contact_note', 'review_contact_updated_at', 'created_at', 'updated_at', 'sync_status'],
  points_ledger: ['id', 'customer_phone', 'amount', 'source_type', 'related_prescription_id', 'note', 'store', 'operator', 'created_at', 'sync_status'],
  balance_ledger: ['id', 'customer_phone', 'amount', 'source_type', 'related_prescription_id', 'note', 'store', 'operator', 'created_at', 'sync_status', 'actual_amount'],
  cases: ['id', 'mode', 'customer_name', 'customer_phone', 'customer_gender', 'customer_address', 'customer_ref_id', 'review_cycle_days', 'condition', 'answers', 'record_date', 'store', 'operator', 'created_at', 'updated_at', 'sync_status', 'original_amount', 'discount_type', 'discount_value', 'discounted_amount', 'balance_deduction', 'balance_deduction_phone', 'points_deduction', 'points_deduction_amount', 'points_deduction_phone', 'paid_amount', 'points_earned', 'points_target_phone', 'template_id', 'template_answers'],
  prescriptions: ['id', 'customer_phone', 'customer_name', 'customer_ref_id', 'review_cycle_days', 'gender', 'notes', 'page1', 'od_ds', 'od_dc', 'os_ds', 'os_dc', 'page6', 'points_target_phone', 'points_amount', 'original_amount', 'discount_type', 'discount_value', 'discounted_amount', 'balance_deduction', 'points_deduction', 'points_deduction_amount', 'paid_amount', 'points_earned', 'record_date', 'store', 'operator', 'created_at', 'updated_at', 'sync_status', 'template_id', 'template_answers'],
  operators: ['id', 'name', 'store', 'department', 'sort_order', 'created_at', 'updated_at', 'sync_status'],
  form_templates: ['id', 'type', 'name', 'pages', 'store', 'operator', 'created_at', 'updated_at', 'sync_status'],
};

// 计算 expires_at = now + 30天
function computeExpiresAt(now) {
  const d = new Date(now);
  d.setDate(d.getDate() + RECYCLE_RETENTION_DAYS);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 删除前把完整记录快照存入回收站
 * @param {object} db
 * @param {string} tableName - 原始表名
 * @param {object} record - 完整记录（删除前查出的行）
 * @param {string} operator - 操作人
 */
export function saveToRecycleBin(db, tableName, record, operator = '') {
  if (!record || !tableName) return;
  const id = uuidv4();
  const now = nowISO();
  const expiresAt = computeExpiresAt(now);
  db.prepare(
    `INSERT INTO recycle_bin (id, table_name, record_id, payload, store, operator, deleted_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tableName,
    String(record.id || ''),
    JSON.stringify(record),
    record.store || process.env.STORE_ID || 'store1',
    String(operator || ''),
    now,
    expiresAt
  );
}

/**
 * 清理已过期的回收站记录（expires_at <= now）
 * 由调用方在合适时机调用（如启动时、列表时）
 */
export function cleanExpiredRecycleBin(db) {
  const now = nowISO();
  db.prepare('DELETE FROM recycle_bin WHERE expires_at <= ?').run(now);
}

/**
 * 恢复回收站记录到原表
 * @returns {object} { tableName, recordId, restored: true }
 * @throws 若记录不存在或已过期
 */
export function restoreFromRecycleBin(db, recycleId) {
  const item = db.prepare('SELECT * FROM recycle_bin WHERE id = ?').get(recycleId);
  if (!item) throw new Error('回收站记录不存在');

  let record;
  try {
    record = JSON.parse(item.payload);
  } catch {
    throw new Error('回收站记录数据损坏，无法恢复');
  }

  const fields = TABLE_FIELDS[item.table_name];
  if (!fields) throw new Error(`不支持恢复的表：${item.table_name}`);

  // 恢复时标记 sync_status = pending（让同步机制重新推送这条 upsert）
  record.sync_status = 'pending';
  record.updated_at = nowISO();

  const cols = fields.join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  db.prepare(`INSERT OR REPLACE INTO ${item.table_name} (${cols}) VALUES (${placeholders})`).run(
    ...fields.map((f) => (record[f] === undefined ? null : record[f]))
  );

  // 从回收站移除（已恢复）
  db.prepare('DELETE FROM recycle_bin WHERE id = ?').run(recycleId);

  return { tableName: item.table_name, recordId: item.record_id, record };
}
