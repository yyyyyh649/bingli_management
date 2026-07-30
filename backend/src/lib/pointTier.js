// 按用户新需求 Phase G：会员积分档位管理
// 档位判定依据：历史累计获得的积分总量（只统计 amount > 0 的记录）
// 提现/兑换/消费扣减不影响档位（只上升不下降）
// 可配置年度清零日（reset_month/reset_day），不设置则永不清零
import { nowISO } from '@optical/shared/constants.js';

/**
 * 读取档位配置（单行 singleton，id='default'）
 * @returns {{tiers: Array, reset_month: number|null, reset_day: number|null}}
 */
export function getTierConfig(db) {
  const row = db.prepare('SELECT * FROM point_tier_config WHERE id = ?').get('default');
  if (!row) {
    return { tiers: [], reset_month: null, reset_day: null };
  }
  let tiers = [];
  try { tiers = JSON.parse(row.tiers || '[]'); } catch { tiers = []; }
  if (!Array.isArray(tiers)) tiers = [];
  return {
    tiers,
    reset_month: row.reset_month != null ? Number(row.reset_month) : null,
    reset_day: row.reset_day != null ? Number(row.reset_day) : null,
  };
}

/**
 * 计算最近一次清零日期（如果配置了年度清零）
 * @returns {string|null} ISO 日期字符串，或 null（永不清零）
 */
export function getLastResetDate(config) {
  if (!config.reset_month || !config.reset_day) return null;
  const now = new Date();
  // 今年的清零日
  let reset = new Date(now.getFullYear(), config.reset_month - 1, config.reset_day, 0, 0, 0);
  // 如果今年的清零日还没到，则上次清零是去年
  if (reset > now) {
    reset = new Date(now.getFullYear() - 1, config.reset_month - 1, config.reset_day, 0, 0, 0);
  }
  return reset.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * 计算会员的历史累计获得积分（只统计 amount > 0，扣除清零日之前的）
 * @returns {number}
 */
export function getCumulativePoints(db, phone, config) {
  if (!phone) return 0;
  const useConfig = config || getTierConfig(db);
  const sinceDate = getLastResetDate(useConfig);
  if (sinceDate) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM points_ledger
         WHERE customer_phone = ? AND amount > 0 AND created_at >= ?`
      )
      .get(phone, sinceDate);
    return Number(row?.total || 0);
  }
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM points_ledger
       WHERE customer_phone = ? AND amount > 0`
    )
    .get(phone);
  return Number(row?.total || 0);
}

/**
 * 根据累计积分判定档位
 * @returns {{index: number, name: string}} index 从 0 开始，name 为档位名（未命名显示"第N档"）
 */
export function getTierForPoints(cumulative, config) {
  const tiers = config?.tiers || [];
  if (tiers.length === 0) return { index: -1, name: '' };
  // tiers 按阈值升序排列，找到最后一个 threshold <= cumulative 的档位
  let result = { index: 0, name: tiers[0].name || '第1档' };
  for (let i = 0; i < tiers.length; i++) {
    const threshold = Number(tiers[i].threshold || 0);
    if (cumulative >= threshold) {
      result = { index: i, name: tiers[i].name || `第${i + 1}档` };
    } else {
      break;
    }
  }
  return result;
}

/**
 * 便捷：获取会员档位完整信息
 * @returns {{cumulative: number, tierIndex: number, tierName: string}}
 */
export function getMemberTierInfo(db, phone) {
  const config = getTierConfig(db);
  const cumulative = getCumulativePoints(db, phone, config);
  const tier = getTierForPoints(cumulative, config);
  return { cumulative, tierIndex: tier.index, tierName: tier.name };
}

/**
 * 保存档位配置（upsert singleton）
 */
export function saveTierConfig(db, { tiers, reset_month, reset_day }) {
  const now = nowISO();
  const row = {
    id: 'default',
    tiers: JSON.stringify(tiers || []),
    reset_month: reset_month != null ? Number(reset_month) : null,
    reset_day: reset_day != null ? Number(reset_day) : null,
    updated_at: now,
    sync_status: 'pending',
  };
  db.prepare(
    `INSERT INTO point_tier_config (id, tiers, reset_month, reset_day, updated_at, sync_status)
     VALUES (@id, @tiers, @reset_month, @reset_day, @updated_at, @sync_status)
     ON CONFLICT(id) DO UPDATE SET
       tiers = @tiers, reset_month = @reset_month, reset_day = @reset_day,
       updated_at = @updated_at, sync_status = @sync_status`
  ).run(row);
  return row;
}
