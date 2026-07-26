// 同步编排：启动 push/pull 循环 + WebSocket，提供积分即时推送 API
import { getDb } from '../db.js';
import { pushOnce } from './push.js';
import { pullOnce } from './pull.js';
import { startWsClient, stopWsClient, notifyCloudChange } from './ws.js';
import { SYNC_DEFAULTS, nowISO } from '@optical/shared/constants.js';
import { getPendingOutbox } from '../lib/outbox.js';

let loopTimer = null;
let loopRunning = false;
let lastHealthCheck = 0;
let cloudReachable = false;

function syncEnabled() {
  return process.env.SYNC_ENABLED === 'true' && !!process.env.CLOUD_SERVER_URL && !!process.env.SYNC_SECRET;
}

async function checkCloudHealth() {
  const cloudUrl = process.env.CLOUD_SERVER_URL;
  if (!cloudUrl) { cloudReachable = false; return false; }
  try {
    const resp = await fetch(`${cloudUrl.replace(/\/$/, '')}/api/sync/health`, {
      signal: AbortSignal.timeout(SYNC_DEFAULTS.HEALTH_TIMEOUT_MS),
    });
    cloudReachable = resp.ok;
    return cloudReachable;
  } catch {
    cloudReachable = false;
    return false;
  }
}

async function tick() {
  if (loopRunning) return;
  loopRunning = true;
  try {
    const now = Date.now();
    // 每 30 秒做一次健康检查（轻量）
    if (now - lastHealthCheck > 30000) {
      await checkCloudHealth();
      lastHealthCheck = now;
    }
    if (!cloudReachable) return;

    // 先推送本地 pending，再拉取远端变更
    await pushOnce().catch((e) => console.error('[sync] push error:', e.message));
    await pullOnce().catch((e) => console.error('[sync] pull error:', e.message));
  } finally {
    loopRunning = false;
  }
}

export async function startSyncLoop() {
  if (!syncEnabled()) {
    // eslint-disable-next-line no-console
    console.log('[sync] 未启用（SYNC_ENABLED!=true 或缺少 CLOUD_SERVER_URL/SYNC_SECRET），仅本地模式运行');
    return null;
  }
  // eslint-disable-next-line no-console
  console.log('[sync] 启动同步循环，云端：', process.env.CLOUD_SERVER_URL);
  startWsClient();
  // 启动后立即跑一次
  setTimeout(() => tick().catch(() => {}), 1000);
  const interval = Number(process.env.SYNC_INTERVAL_MS) || SYNC_DEFAULTS.INTERVAL_MS;
  loopTimer = setInterval(() => tick().catch(() => {}), interval);
  return { interval };
}

export function stopSyncLoop() {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
  stopWsClient();
}

/**
 * 积分即时推送：把指定的 points_ledger 行立即推送到云端 + 通过 WS 通知其他店
 * 失败不抛错（常规轮询会补推）
 */
export async function triggerPointsImmediatePush(pointsRow) {
  if (!syncEnabled()) return;
  const cloudUrl = process.env.CLOUD_SERVER_URL;
  const secret = process.env.SYNC_SECRET;
  const store = process.env.STORE_ID || 'store1';

  // 1. 直接调用 points-broadcast（云端会写入业务表 + change_log + WS 转发）
  try {
    await fetch(`${cloudUrl.replace(/\/$/, '')}/api/sync/points-broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Secret': secret,
        'X-Sync-Store': store,
      },
      body: JSON.stringify({ store, change: pointsRow }),
      signal: AbortSignal.timeout(SYNC_DEFAULTS.HEALTH_TIMEOUT_MS * 2),
    });
    // 标记本地 outbox 与业务表为 synced
    const db = getDb();
    // 找到这条记录对应的 pending outbox 行
    const pending = getPendingOutbox(db, 500).filter(
      (r) => r.table_name === 'points_ledger' && r.record_id === pointsRow.id
    );
    if (pending.length) {
      const tx = db.transaction(() => {
        db.prepare(`UPDATE sync_outbox SET sync_status = 'synced', synced_at = ? WHERE id = ?`)
          .run(nowISO(), pending[0].id);
        db.prepare(`UPDATE points_ledger SET sync_status = 'synced' WHERE id = ?`).run(pointsRow.id);
      });
      tx();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[sync] points 即时推送失败（待常规轮询补推）:', e.message);
  }
}

export function isCloudReachable() {
  return cloudReachable;
}
