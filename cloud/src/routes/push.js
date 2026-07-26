// POST /api/sync/push —— 批量推送变更
// body: { store, changes: [{ tableName, recordId, operation, payload }] }
// resp: { ok: true, data: { accepted: N, changeLogIds: [...] } }
import { Router } from 'express';
import { SYNC_TABLES } from '@optical/shared/constants.js';
import { getDb } from '../db.js';
import { applyChange } from '../lib/applyChange.js';

const router = Router();
const SYNC_TABLES_SET = new Set(SYNC_TABLES);

router.post('/', (req, res) => {
  const { store, changes } = req.body || {};

  if (!store || !Array.isArray(changes)) {
    return res
      .status(400)
      .json({ ok: false, error: 'body requires { store, changes: [...] }' });
  }

  // 预校验：任一变更非法即拒绝整批（防注入 + 数据完整性）
  for (const c of changes) {
    if (!c || !c.tableName || !c.recordId || !c.operation) {
      return res.status(400).json({
        ok: false,
        error: 'each change requires { tableName, recordId, operation }',
      });
    }
    if (!SYNC_TABLES_SET.has(c.tableName)) {
      return res.status(400).json({
        ok: false,
        error: `invalid table: ${c.tableName}`,
        code: 'INVALID_TABLE',
      });
    }
    if (c.operation !== 'upsert' && c.operation !== 'delete') {
      return res.status(400).json({
        ok: false,
        error: `invalid operation: ${c.operation}`,
        code: 'INVALID_OPERATION',
      });
    }
  }

  const db = getDb();
  const changeLogIds = [];

  try {
    // 整批包裹在一个事务里：任一失败则全部回滚
    const runBatch = () => {
      for (const c of changes) {
        const id = applyChange(db, {
          tableName: c.tableName,
          recordId: c.recordId,
          operation: c.operation,
          payload: c.payload,
          sourceStore: store,
        });
        changeLogIds.push(id);
      }
    };
    const tx = db.transaction(runBatch);
    tx();
  } catch (e) {
    return res.status(400).json({
      ok: false,
      error: e.message || 'push failed',
      code: e.code || null,
    });
  }

  res.json({ ok: true, data: { accepted: changeLogIds.length, changeLogIds } });
});

export default router;
