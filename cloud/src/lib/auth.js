// X-Sync-Secret 校验中间件（HTTP）+ WebSocket 连接校验

/**
 * Express 中间件：校验 X-Sync-Secret header
 * 密钥来自 process.env.SYNC_SECRET
 */
export function syncAuth(req, res, next) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) {
    return res
      .status(500)
      .json({ ok: false, error: 'SYNC_SECRET not configured on server' });
  }
  const provided = req.header('X-Sync-Secret');
  if (!provided || provided !== expected) {
    return res
      .status(401)
      .json({ ok: false, error: 'Invalid or missing X-Sync-Secret', code: 'UNAUTHORIZED' });
  }
  next();
}

/**
 * WebSocket 连接校验：解析 ?store=&secret= query 参数
 * @param {object} req - HTTP upgrade request
 * @returns {{ ok: true, store: string } | { ok: false, reason: string }}
 */
export function checkWsAuth(req) {
  const expected = process.env.SYNC_SECRET;
  if (!expected) return { ok: false, reason: 'SYNC_SECRET not configured' };

  const url = new URL(req.url, 'http://localhost');
  const store = url.searchParams.get('store');
  const secret = url.searchParams.get('secret');

  if (!store || !secret) {
    return { ok: false, reason: 'missing store or secret' };
  }
  if (secret !== expected) {
    return { ok: false, reason: 'invalid secret' };
  }
  return { ok: true, store };
}
