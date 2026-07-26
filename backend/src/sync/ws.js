// WebSocket 客户端：接收云端积分变更即时推送 + change_notify 触发即时拉取
import WebSocket from 'ws';
import { getDb } from '../db.js';
import { applyChangeToLocal } from './applyChange.js';
import { SYNC_DEFAULTS, nowISO } from '@optical/shared/constants.js';
import { pullOnce } from './pull.js';

let ws = null;
let reconnectTimer = null;
let stopped = false;
let immediatePullTimer = null;

function buildWsUrl() {
  const cloudUrl = process.env.CLOUD_SERVER_URL;
  const secret = process.env.SYNC_SECRET;
  const wsPath = process.env.CLOUD_WS_PATH || '/ws';
  if (!cloudUrl || !secret) return null;
  // https → wss, http → ws
  const wsBase = cloudUrl.replace(/^http/, 'ws').replace(/\/$/, '');
  const store = process.env.STORE_ID || 'store1';
  return `${wsBase}${wsPath}?store=${encodeURIComponent(store)}&secret=${encodeURIComponent(secret)}`;
}

export function startWsClient() {
  if (stopped) return;
  const url = buildWsUrl();
  if (!url) return;

  try {
    ws = new WebSocket(url);
  } catch (e) {
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    // eslint-disable-next-line no-console
    console.log('[sync/ws] 已连接云端 WebSocket');
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'points_update' && msg.data) {
      // 即时积分变更：直接应用（同时更新 sync_state 中的 last_seq 由下次 pull 统一推进）
      try {
        const db = getDb();
        const tx = db.transaction(() => {
          applyChangeToLocal(db, {
            tableName: 'points_ledger',
            recordId: msg.data.id,
            operation: 'upsert',
            payload: msg.data,
          });
        });
        tx();
        // eslint-disable-next-line no-console
        console.log('[sync/ws] 收到即时积分更新，已应用：', msg.data.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[sync/ws] 应用积分更新失败：', e.message);
      }
    } else if (msg.type === 'change_notify') {
      // 通知有新变更，触发一次即时拉取（防抖）
      scheduleImmediatePull();
    }
  });

  ws.on('close', () => {
    // eslint-disable-next-line no-console
    console.log('[sync/ws] 连接关闭，将尝试重连');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[sync/ws] 错误：', err.message);
    // close 事件会处理重连
  });
}

export function stopWsClient() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (immediatePullTimer) { clearTimeout(immediatePullTimer); immediatePullTimer = null; }
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
}

function scheduleReconnect() {
  if (stopped) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    startWsClient();
  }, SYNC_DEFAULTS.WS_RECONNECT_MS);
}

function scheduleImmediatePull() {
  if (stopped) return;
  if (immediatePullTimer) return;
  immediatePullTimer = setTimeout(() => {
    immediatePullTimer = null;
    pullOnce().catch(() => {});
  }, 500); // 防抖 500ms
}

// 通过 WS 主动告知云端有积分变更（用于触发其他店即时同步）
export function notifyCloudChange(change) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ type: 'points_local', data: change }));
    return true;
  } catch {
    return false;
  }
}
