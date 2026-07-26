// 积分重复登记检测：检查同一客户是否存在金额数值+正负号相同的记录
import { getDb } from '../db.js';

/**
 * @returns {object|null} 若存在相同金额的历史记录，返回该记录；否则 null
 */
export function findDuplicatePoints(db, { customerPhone, amount }) {
  const useDb = db || getDb();
  return useDb
    .prepare(
      `SELECT * FROM points_ledger
       WHERE customer_phone = ? AND amount = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(customerPhone, amount);
}
