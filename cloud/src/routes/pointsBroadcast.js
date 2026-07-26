// POST /api/sync/points-broadcast —— 积分变更即时广播
// body: { store, change: {...points_ledger record} }
// 行为：1) 追加到 cloud_change_log（保证离线店下次拉取能拿到）
//      2) 通过 wsHub 广播给除来源店外所有在线店铺
// resp: { ok: true, data: { ok: true } }
import { Router } from 'express';
import { nowISO } from '@optical/shared/constants.js';
import { getDb } from '../db.js';
import { broadcastToOtherStores } from '../lib/wsHub.js';

const router = Router();

router.post('/', (req, res) => {
  const { store, change } = req.body || {};

  if (!store || !change || !change.id) {
    return res
      .status(400)
      .json({ ok: false, error: 'body requires { store, change: { id, ... } }' });
  }

  const db = getDb();
  try {
    // 追加到 cloud_change_log（离线店下次 pull 能拿到）
    const payloadStr = JSON.stringify(change);
    db.prepare(
      `INSERT INTO cloud_change_log (table_name, record_id, operation, payload, source_store, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('points_ledger', change.id, 'upsert', payloadStr, store, nowISO());
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || 'broadcast failed' });
  }

  // WebSocket 即时广播给除来源店外的在线店铺
  broadcastToOtherStores(store, { type: 'points_update', data: change });

  res.json({ ok: true, data: { ok: true } });
});

export default router;
