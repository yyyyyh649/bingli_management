// Outbox 助手：业务写入后调用，将变更入队等待同步推送
// 用法：在业务路由的事务中，写完业务表后调用 recordChange()
import { SYNC_STATUS } from '@optical/shared/constants.js';
import { nowISO } from '@optical/shared/constants.js';
import { getDb } from '../db.js';

// 白名单：参与同步的表
const SYNC_TABLES = new Set([
  'customers',
  'points_ledger',
  'cases',
  'prescriptions',
  'operators',
]);

/**
 * 记录一条变更到 outbox，并（若是 upsert）把业务表 sync_status 置为 pending
 * @param {object} db - better-sqlite3 实例（若不传则用全局）
 * @param {object} params
 * @param {string} params.tableName
 * @param {string} params.recordId
 * @param {'upsert'|'delete'} params.operation
 * @param {object|null} params.payload - 完整记录（upsert）或 null（delete）
 */
export function recordChange(db, { tableName, recordId, operation, payload }) {
  const useDb = db || getDb();
  if (!SYNC_TABLES.has(tableName)) return; // 非同步表忽略

  const payloadStr = payload ? JSON.stringify(payload) : null;
  useDb
    .prepare(
      `INSERT INTO sync_outbox (table_name, record_id, operation, payload, created_at, sync_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .run(tableName, recordId, operation, payloadStr, nowISO());

  if (operation === 'upsert') {
    // 业务表标记为 pending（重启后也能根据 sync_status 重建）
    useDb
      .prepare(`UPDATE ${tableName} SET sync_status = ? WHERE id = ?`)
      .run(SYNC_STATUS.PENDING, recordId);
  }
}

/**
 * 在事务中执行一组写入 + recordChange。
 * 用法：withChangeTx(db, () => { insertCustomer(...); recordChange(...) })
 */
export function withChangeTx(db, fn) {
  const tx = db.transaction(fn);
  return tx();
}

// 读取所有 pending outbox 记录（按 id 升序，保证推送顺序）
export function getPendingOutbox(db, limit = 200) {
  const useDb = db || getDb();
  return useDb
    .prepare(
      `SELECT * FROM sync_outbox WHERE sync_status = 'pending' ORDER BY id ASC LIMIT ?`
    )
    .all(limit);
}

// 标记 outbox 行为已同步
export function markOutboxSynced(db, ids) {
  if (!ids.length) return;
  const useDb = db || getDb();
  const placeholders = ids.map(() => '?').join(',');
  useDb
    .prepare(
      `UPDATE sync_outbox SET sync_status = 'synced', synced_at = ? WHERE id IN (${placeholders})`
    )
    .run(nowISO(), ...ids);
}

// 标记业务记录为已同步（推送成功后）
export function markRecordsSynced(db, tableName, recordIds) {
  if (!recordIds.length || !SYNC_TABLES.has(tableName)) return;
  const useDb = db || getDb();
  const placeholders = recordIds.map(() => '?').join(',');
  useDb
    .prepare(`UPDATE ${tableName} SET sync_status = 'synced' WHERE id IN (${placeholders})`)
    .run(...recordIds);
}

// 当前 pending 数量（健康检查展示用）
export function countPendingOutbox(db) {
  const useDb = db || getDb();
  const row = useDb
    .prepare(`SELECT COUNT(*) AS n FROM sync_outbox WHERE sync_status = 'pending'`)
    .get();
  return row?.n || 0;
}
