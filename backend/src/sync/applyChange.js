// 把从云端拉取的变更应用到本地业务表（与 cloud/lib/applyChange.js 对称）
// 关键差异：customers 表 phone 是 UNIQUE，需要 LWW 合并（同手机号不同 id 时取较新者）
import { SYNC_STATUS } from '@optical/shared/constants.js';

// 各同步表的可写字段白名单（与 schema 一致，防注入）
const TABLE_FIELDS = {
  customers: ['id', 'phone', 'name', 'member_card_no', 'address', 'store', 'operator', 'created_at', 'updated_at', 'sync_status'],
  points_ledger: ['id', 'customer_phone', 'amount', 'source_type', 'related_prescription_id', 'note', 'store', 'operator', 'created_at', 'sync_status'],
  cases: ['id', 'mode', 'customer_name', 'customer_phone', 'customer_gender', 'customer_address', 'condition', 'answers', 'record_date', 'store', 'operator', 'created_at', 'updated_at', 'sync_status'],
  prescriptions: ['id', 'customer_phone', 'customer_name', 'page1', 'od_ds', 'od_dc', 'os_ds', 'os_dc', 'page6', 'points_target_phone', 'points_amount', 'record_date', 'store', 'operator', 'created_at', 'updated_at', 'sync_status'],
  operators: ['id', 'name', 'store', 'sort_order', 'created_at', 'updated_at', 'sync_status'],
};

function pickFields(table, payload) {
  const fields = TABLE_FIELDS[table];
  const out = {};
  for (const f of fields) {
    if (payload && Object.prototype.hasOwnProperty.call(payload, f)) {
      out[f] = payload[f];
    } else {
      out[f] = null;
    }
  }
  // 从云端来的数据本地标记为 synced
  out.sync_status = SYNC_STATUS.SYNCED;
  return out;
}

// 客户表特殊处理：同手机号不同 id 时走 LWW 合并
function applyCustomerUpsert(db, payload) {
  const remote = pickFields('customers', payload);
  const local = db.prepare('SELECT id, updated_at FROM customers WHERE phone = ?').get(remote.phone);
  if (local && local.id !== remote.id) {
    // 同手机号但不同 id：取 updated_at 较新者
    if (remote.updated_at && local.updated_at && remote.updated_at > local.updated_at) {
      // 远端较新，更新本地记录（保留本地 id 以免分裂）
      db.prepare(
        `UPDATE customers SET name = ?, member_card_no = ?, address = ?, updated_at = ?, sync_status = ? WHERE id = ?`
      ).run(remote.name, remote.member_card_no, remote.address, remote.updated_at, SYNC_STATUS.SYNCED, local.id);
    }
    // 否则丢弃远端（本地较新）
    return;
  }
  // 正常 upsert
  const cols = TABLE_FIELDS.customers.join(', ');
  const placeholders = TABLE_FIELDS.customers.map(() => '?').join(', ');
  db.prepare(`INSERT OR REPLACE INTO customers (${cols}) VALUES (${placeholders})`).run(
    ...TABLE_FIELDS.customers.map((f) => remote[f])
  );
}

function applyGenericUpsert(db, table, payload) {
  const fields = TABLE_FIELDS[table];
  const picked = pickFields(table, payload);
  const cols = fields.join(', ');
  const placeholders = fields.map(() => '?').join(', ');
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${placeholders})`).run(
    ...fields.map((f) => picked[f])
  );
}

/**
 * 应用一条变更到本地
 * @param {object} db
 * @param {{ tableName: string, recordId: string, operation: 'upsert'|'delete', payload: object|null }} change
 */
export function applyChangeToLocal(db, change) {
  const { tableName, recordId, operation, payload } = change;
  if (operation === 'delete') {
    db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(recordId);
    return;
  }
  if (operation === 'upsert') {
    if (tableName === 'customers') {
      applyCustomerUpsert(db, payload);
    } else {
      applyGenericUpsert(db, tableName, payload);
    }
  }
}
