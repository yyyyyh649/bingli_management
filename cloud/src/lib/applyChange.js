// 把推送来的变更写入云端业务表 + cloud_change_log（事务）
// 每张同步表配一个白名单字段映射，从 payload 中取值，
// 防止 payload 含多余字段导致 SQL 错误，同时避免 SQL 注入。
import { SYNC_TABLES, nowISO } from '@optical/shared/constants.js';

// 每张同步表的白名单字段（与 schema.sql 列顺序保持一致）
// sync_status 在云端恒为 'synced'
const TABLE_FIELDS = {
  customers: [
    'id', 'phone', 'name', 'member_card_no', 'address',
    'store', 'operator', 'balance',
    'age', 'birthday', 'gender', 'age_is_estimated',
    'review_cycle_days', 'review_contact_status', 'review_contact_note', 'review_contact_updated_at',
    'created_at', 'updated_at', 'sync_status',
  ],
  points_ledger: [
    'id', 'customer_phone', 'amount', 'source_type',
    'related_prescription_id', 'note', 'store', 'operator',
    'created_at', 'sync_status',
  ],
  balance_ledger: [
    'id', 'customer_phone', 'amount', 'source_type',
    'related_prescription_id', 'note', 'store', 'operator',
    'created_at', 'sync_status', 'actual_amount',
  ],
  cases: [
    'id', 'mode', 'customer_name', 'customer_phone', 'customer_gender',
    'customer_address', 'customer_ref_id', 'review_cycle_days', 'condition', 'answers', 'record_date',
    'store', 'operator', 'created_at', 'updated_at', 'sync_status',
  ],
  prescriptions: [
    'id', 'customer_phone', 'customer_name', 'customer_ref_id', 'review_cycle_days', 'gender', 'notes', 'page1',
    'od_ds', 'od_dc', 'os_ds', 'os_dc', 'page6',
    'points_target_phone', 'points_amount',
    'original_amount', 'discount_type', 'discount_value', 'discounted_amount',
    'balance_deduction', 'points_deduction', 'points_deduction_amount',
    'paid_amount', 'points_earned',
    'record_date', 'store', 'operator', 'created_at', 'updated_at', 'sync_status',
  ],
  operators: [
    'id', 'name', 'store', 'department', 'sort_order',
    'created_at', 'updated_at', 'sync_status',
  ],
};

const SYNC_TABLES_SET = new Set(SYNC_TABLES);

export function isSyncTable(tableName) {
  return SYNC_TABLES_SET.has(tableName);
}

/**
 * 把单条变更写入云端业务表 + cloud_change_log（事务）
 * @param {object} db - better-sqlite3 实例
 * @param {object} params
 * @param {string} params.tableName
 * @param {string} params.recordId
 * @param {'upsert'|'delete'} params.operation
 * @param {object|null} params.payload - 完整记录（upsert）或 null（delete）
 * @param {string} params.sourceStore - 变更来源门店
 * @returns {number} 新插入的 cloud_change_log id
 */
export function applyChange(db, { tableName, recordId, operation, payload, sourceStore }) {
  if (!isSyncTable(tableName)) {
    const err = new Error(`Invalid table: ${tableName}`);
    err.code = 'INVALID_TABLE';
    throw err;
  }
  if (operation !== 'upsert' && operation !== 'delete') {
    const err = new Error(`Invalid operation: ${operation}`);
    err.code = 'INVALID_OPERATION';
    throw err;
  }

  const fields = TABLE_FIELDS[tableName];

  const doApply = () => {
    if (operation === 'upsert') {
      if (!payload || typeof payload !== 'object') {
        const err = new Error('payload required for upsert');
        err.code = 'INVALID_PAYLOAD';
        throw err;
      }
      // 从 payload 取白名单字段；sync_status 强制为 'synced'
      const values = fields.map((f) => {
        if (f === 'sync_status') return 'synced';
        const v = payload[f];
        return v === undefined ? null : v;
      });
      const placeholders = fields.map(() => '?').join(', ');
      // tableName 已通过白名单校验，可安全拼接
      const sql = `INSERT OR REPLACE INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
      db.prepare(sql).run(...values);
    } else {
      // delete
      db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(recordId);
    }

    // 追加 cloud_change_log
    const payloadStr = payload ? JSON.stringify(payload) : null;
    const info = db
      .prepare(
        `INSERT INTO cloud_change_log (table_name, record_id, operation, payload, source_store, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(tableName, recordId, operation, payloadStr, sourceStore, nowISO());

    // lastInsertRowid 可能为 bigint（大 ID 时），统一转 number 以便 JSON 序列化
    return Number(info.lastInsertRowid);
  };

  // 包裹在事务中：业务表写入与 change_log 写入要么同时成功，要么同时回滚
  const tx = db.transaction(doApply);
  return tx();
}
