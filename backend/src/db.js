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
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* 列已存在，忽略 */ }
  }

  // 初始化 sync_state 单例
  const row = db.prepare('SELECT key FROM sync_state WHERE key = ?').get('cloud_pull');
  if (!row) {
    db.prepare("INSERT INTO sync_state (key, last_seq, last_pull_at) VALUES ('cloud_pull', 0, NULL)").run();
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
