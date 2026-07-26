// WebSocket 连接管理 + 广播
// 维护 Map<store, Set<ws>>，提供 broadcastToOtherStores(sourceStore, message)
import { WebSocketServer } from 'ws';
import { checkWsAuth } from './auth.js';

// Map<store, Set<ws>>：每个店铺可能有多个连接（多实例/重连）
const storeSockets = new Map();

let wss = null;

/**
 * 初始化 WebSocket 服务，挂载到给定 HTTP server 上
 * @param {import('node:http').Server} server
 * @param {string} path - WS 路径，如 '/ws'
 */
export function initWsHub(server, path) {
  wss = new WebSocketServer({ server, path });
  wss.on('connection', (ws, req) => {
    const auth = checkWsAuth(req);
    if (!auth.ok) {
      // 鉴权失败：关闭连接（4001 = 自定义鉴权失败码）
      try { ws.close(4001, auth.reason); } catch (_) { /* ignore */ }
      return;
    }
    const store = auth.store;
    if (!storeSockets.has(store)) storeSockets.set(store, new Set());
    storeSockets.get(store).add(ws);

    // 仅服务端→客户端单向；收到客户端消息时忽略
    ws.on('message', () => {
      // no-op：云端不处理客户端上行消息
    });

    ws.on('close', () => {
      const set = storeSockets.get(store);
      if (set) {
        set.delete(ws);
        if (set.size === 0) storeSockets.delete(store);
      }
    });

    ws.on('error', () => {
      // 静默处理，避免单连接异常拖垮进程
    });
  });
  return wss;
}

/**
 * 广播给除来源店铺外的所有在线店铺
 * @param {string} sourceStore - 变更来源店铺（不回推给自己）
 * @param {object|string} message - 消息体（对象会被 JSON.stringify）
 */
export function broadcastToOtherStores(sourceStore, message) {
  if (!wss) return;
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  for (const [store, set] of storeSockets.entries()) {
    if (store === sourceStore) continue;
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(payload); } catch (_) { /* ignore single-send failure */ }
      }
    }
  }
}

/** 当前在线店铺列表（健康检查展示用） */
export function getOnlineStores() {
  return Array.from(storeSockets.keys());
}

/** 关闭 WS 服务（测试用） */
export function closeWsHub() {
  if (wss) {
    // 关闭所有连接
    for (const set of storeSockets.values()) {
      for (const ws of set) {
        try { ws.close(); } catch (_) { /* ignore */ }
      }
    }
    storeSockets.clear();
    wss.close();
    wss = null;
  }
}
