// 拉取：从云端增量拉取变更并应用到本地
import { getDb } from '../db.js';
import { applyChangeToLocal } from './applyChange.js';
import { SYNC_DEFAULTS, nowISO } from '@optical/shared/constants.js';

let pullInFlight = false;

export async function pullOnce() {
  if (pullInFlight) return { skipped: true };
  pullInFlight = true;
  try {
    const cloudUrl = process.env.CLOUD_SERVER_URL;
    const secret = process.env.SYNC_SECRET;
    if (!cloudUrl || !secret) return { skipped: true, reason: 'no_cloud_config' };

    const db = getDb();
    const state = db.prepare('SELECT last_seq FROM sync_state WHERE key = ?').get('cloud_pull');
    const since = state?.last_seq || 0;

    const url = `${cloudUrl.replace(/\/$/, '')}/api/sync/pull?since=${since}&limit=${SYNC_DEFAULTS.PULL_BATCH_SIZE}`;
    const resp = await fetch(url, {
      headers: {
        'X-Sync-Secret': secret,
        'X-Sync-Store': process.env.STORE_ID || 'store1',
      },
      signal: AbortSignal.timeout(SYNC_DEFAULTS.HEALTH_TIMEOUT_MS * 4),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`pull HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const body = await resp.json();
    if (!body.ok) throw new Error(body.error || 'pull failed');

    const { changes = [], nextSeq } = body.data || {};
    if (!changes.length) {
      // 更新拉取时间戳
      db.prepare('UPDATE sync_state SET last_pull_at = ? WHERE key = ?').run(nowISO(), 'cloud_pull');
      return { pulled: 0 };
    }

    const tx = db.transaction(() => {
      for (const c of changes) {
        try {
          applyChangeToLocal(db, {
            tableName: c.tableName,
            recordId: c.recordId,
            operation: c.operation,
            payload: c.payload,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[pull] 应用变更失败，跳过该条：', e.message, c);
        }
      }
      db.prepare('UPDATE sync_state SET last_seq = ?, last_pull_at = ? WHERE key = ?').run(
        nextSeq || since,
        nowISO(),
        'cloud_pull'
      );
    });
    tx();

    return { pulled: changes.length, nextSeq };
  } finally {
    pullInFlight = false;
  }
}
