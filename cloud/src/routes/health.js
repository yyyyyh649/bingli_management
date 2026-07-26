// GET /api/sync/health —— 健康检查（无需鉴权）
import { Router } from 'express';
import { getDb } from '../db.js';
import { getOnlineStores } from '../lib/wsHub.js';

const router = Router();

router.get('/', (_req, res) => {
  const db = getDb();
  let logCount = 0;
  let lastSeq = 0;
  try {
    const row = db
      .prepare('SELECT COUNT(*) AS n, COALESCE(MAX(id), 0) AS m FROM cloud_change_log')
      .get();
    logCount = row?.n || 0;
    lastSeq = row?.m || 0;
  } catch (_) {
    /* ignore */
  }
  res.json({
    ok: true,
    data: {
      service: 'cloud',
      changeLogCount: logCount,
      lastSeq,
      onlineStores: getOnlineStores(),
    },
  });
});

export default router;
