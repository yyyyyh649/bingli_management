// 推送：把 pending outbox 推送到云端
import { getDb } from '../db.js';
import { getPendingOutbox, markOutboxSynced, markRecordsSynced } from '../lib/outbox.js';
import { SYNC_DEFAULTS } from '@optical/shared/constants.js';

let pushInFlight = false;

export async function pushOnce() {
  if (pushInFlight) return { skipped: true };
  pushInFlight = true;
  try {
    const cloudUrl = process.env.CLOUD_SERVER_URL;
    const secret = process.env.SYNC_SECRET;
    if (!cloudUrl || !secret) return { skipped: true, reason: 'no_cloud_config' };

    const db = getDb();
    const pending = getPendingOutbox(db, 200);
    if (!pending.length) return { pushed: 0 };

    const changes = pending.map((r) => ({
      tableName: r.table_name,
      recordId: r.record_id,
      operation: r.operation,
      payload: r.payload ? JSON.parse(r.payload) : null,
    }));

    const resp = await fetch(`${cloudUrl.replace(/\/$/, '')}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Secret': secret,
        'X-Sync-Store': process.env.STORE_ID || 'store1',
      },
      body: JSON.stringify({ store: process.env.STORE_ID || 'store1', changes }),
      signal: AbortSignal.timeout(SYNC_DEFAULTS.HEALTH_TIMEOUT_MS * 4),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`push HTTP ${resp.status}: ${txt.slice(0, 200)}`);
    }
    const body = await resp.json();
    if (!body.ok) throw new Error(body.error || 'push failed');

    // 标记 outbox 与业务表为 synced
    const ids = pending.map((r) => r.id);
    const tableGroups = {};
    for (const r of pending) {
      if (r.operation === 'upsert') {
        (tableGroups[r.table_name] ||= []).push(r.record_id);
      }
    }
    const tx = db.transaction(() => {
      markOutboxSynced(db, ids);
      for (const [table, recordIds] of Object.entries(tableGroups)) {
        markRecordsSynced(db, table, recordIds);
      }
    });
    tx();

    return { pushed: pending.length };
  } finally {
    pushInFlight = false;
  }
}
