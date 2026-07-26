// GET /api/sync/pull?since=<seq>&limit=<n> —— 增量拉取 cloud_change_log
// header: X-Sync-Store 标识调用方店铺（用于排除自己刚推上来的变更）
// resp: { ok: true, data: { changes: [...], nextSeq, hasMore } }
import { Router } from 'express';
import { SYNC_DEFAULTS } from '@optical/shared/constants.js';
import { getDb } from '../db.js';

const router = Router();

const MAX_LIMIT = 2000;

router.get('/', (req, res) => {
  const since = parseInt(req.query.since, 10);
  const sinceSeq = Number.isFinite(since) && since > 0 ? since : 0;

  const limitRaw = parseInt(req.query.limit, 10);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, MAX_LIMIT)
      : SYNC_DEFAULTS.PULL_BATCH_SIZE;

  const callerStore = req.header('X-Sync-Store') || '';

  const db = getDb();
  // 多取 1 条用于判断是否还有更多；排除 source_store == 调用方 的记录
  const rows = db
    .prepare(
      `SELECT id, table_name, record_id, operation, payload, source_store, created_at
       FROM cloud_change_log
       WHERE id > ? AND (? = '' OR source_store != ?)
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(sinceSeq, callerStore, callerStore, limit + 1);

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const nextSeq = slice.length ? slice[slice.length - 1].id : sinceSeq;

  const changes = slice.map((r) => ({
    id: r.id,
    tableName: r.table_name,
    recordId: r.record_id,
    operation: r.operation,
    payload: r.payload ? JSON.parse(r.payload) : null,
    sourceStore: r.source_store,
    createdAt: r.created_at,
  }));

  res.json({ ok: true, data: { changes, nextSeq, hasMore } });
});

export default router;
