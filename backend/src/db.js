// SQLite 连接与初始化（本地店端）
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  throw new Error('DB not initialized. Call initDb() first.');
}

export function initDb(opts = {}) {
  const dbPath = opts.dbPath || process.env.DB_PATH || './data/local.db';
  const abs = resolve(dbPath);
  mkdirSync(dirname(abs), { recursive: true });

  const db = new Database(abs, { fileMustExist: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = opts.schemaPath || join(__dirname, '../../shared/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // 兼容旧库：为已有表补新增列（CREATE TABLE IF NOT EXISTS 不会改已有表结构）
  const migrations = [
    'ALTER TABLE customers ADD COLUMN balance REAL NOT NULL DEFAULT 0',
    'ALTER TABLE operators ADD COLUMN department TEXT DEFAULT ""',
    'ALTER TABLE prescriptions ADD COLUMN original_amount REAL DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN discount_type TEXT DEFAULT ""',
    'ALTER TABLE prescriptions ADD COLUMN discount_value REAL DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN discounted_amount REAL DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN balance_deduction REAL DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN points_deduction INTEGER DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN points_deduction_amount REAL DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN paid_amount REAL DEFAULT 0',
    'ALTER TABLE prescriptions ADD COLUMN points_earned INTEGER DEFAULT 0',
    // 复查提醒相关字段
    'ALTER TABLE customers ADD COLUMN review_cycle_days INTEGER DEFAULT 90',
    'ALTER TABLE customers ADD COLUMN review_contact_status TEXT DEFAULT "pending"',
    'ALTER TABLE customers ADD COLUMN review_contact_note TEXT DEFAULT ""',
    'ALTER TABLE customers ADD COLUMN review_contact_updated_at TEXT DEFAULT ""',
    'ALTER TABLE customers ADD COLUMN age INTEGER DEFAULT NULL',
    'ALTER TABLE customers ADD COLUMN birthday TEXT DEFAULT NULL',
    'ALTER TABLE customers ADD COLUMN gender TEXT DEFAULT ""',
    'ALTER TABLE customers ADD COLUMN age_is_estimated INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE cases ADD COLUMN customer_ref_id TEXT DEFAULT ""',
    'ALTER TABLE cases ADD COLUMN review_cycle_days INTEGER NOT NULL DEFAULT 90',
    'ALTER TABLE prescriptions ADD COLUMN customer_ref_id TEXT DEFAULT ""',
    'ALTER TABLE prescriptions ADD COLUMN review_cycle_days INTEGER NOT NULL DEFAULT 90',
    'ALTER TABLE prescriptions ADD COLUMN gender TEXT DEFAULT ""',
    'ALTER TABLE prescriptions ADD COLUMN notes TEXT DEFAULT ""',
    // 索引必须在 ALTER TABLE 加列之后创建（旧库表已存在但无 customer_ref_id 列，schema.sql 里无法建）
    'CREATE INDEX IF NOT EXISTS idx_cases_customer_ref_id ON cases(customer_ref_id)',
    'CREATE INDEX IF NOT EXISTS idx_prescriptions_customer_ref_id ON prescriptions(customer_ref_id)',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* 列已存在，忽略 */ }
  }

  // 初始化 sync_state 单例
  const row = db.prepare('SELECT key FROM sync_state WHERE key = ?').get('cloud_pull');
  if (!row) {
    db.prepare("INSERT INTO sync_state (key, last_seq, last_pull_at) VALUES ('cloud_pull', 0, NULL)").run();
  }

  // 按 IMPLEMENTATION.md Phase 2：存量 customer_ref_id 回填（仅执行一次）
  // 规则：按"同手机号+同姓名"归为一人，组内 created_at 最早的作为代表（自引用），其余指向它
  const refMigrated = db.prepare("SELECT key FROM sync_state WHERE key = 'customer_ref_migrated'").get();
  if (!refMigrated) {
    // 1. 空值设为自引用
    db.prepare("UPDATE prescriptions SET customer_ref_id = id WHERE customer_ref_id = '' OR customer_ref_id IS NULL").run();
    db.prepare("UPDATE cases SET customer_ref_id = id WHERE customer_ref_id = '' OR customer_ref_id IS NULL").run();
    // 2. 按 (customer_phone, customer_name) 分组归并
    for (const table of ['prescriptions', 'cases']) {
      const groups = db
        .prepare(
          `SELECT customer_phone, customer_name FROM ${table}
           WHERE customer_phone != '' AND customer_name != ''
           GROUP BY customer_phone, customer_name HAVING COUNT(*) > 1`
        )
        .all();
      for (const g of groups) {
        const rep = db
          .prepare(
            `SELECT id FROM ${table} WHERE customer_phone = ? AND customer_name = ? ORDER BY created_at ASC LIMIT 1`
          )
          .get(g.customer_phone, g.customer_name);
        if (rep) {
          db.prepare(
            `UPDATE ${table} SET customer_ref_id = ? WHERE customer_phone = ? AND customer_name = ?`
          ).run(rep.id, g.customer_phone, g.customer_name);
        }
      }
    }
    db.prepare("INSERT INTO sync_state (key, last_seq, last_pull_at) VALUES ('customer_ref_migrated', 0, NULL)").run();
  }

  dbInstance = db;
  return db;
}

// 仅用于测试或脚本：关闭连接
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
