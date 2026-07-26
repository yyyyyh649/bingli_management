// 健康检查 + 同步状态
import { Router } from 'express';
import { ok } from '../lib/response.js';
import { getDb } from '../db.js';
import { countPendingOutbox } from '../lib/outbox.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  const lastPull = db
    .prepare('SELECT last_seq, last_pull_at FROM sync_state WHERE key = ?')
    .get('cloud_pull');

  res.json(
    ok({
      store: process.env.STORE_ID || 'store1',
      sync: {
        enabled: process.env.SYNC_ENABLED === 'true' && !!process.env.CLOUD_SERVER_URL,
        cloudUrl: process.env.CLOUD_SERVER_URL || null,
        lastSeq: lastPull?.last_seq || 0,
        lastPullAt: lastPull?.last_pull_at || null,
        pendingCount: countPendingOutbox(db),
      },
    })
  );
});

export default router;
