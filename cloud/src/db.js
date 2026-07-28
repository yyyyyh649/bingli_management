// SQLite 连接与初始化（云端）
// 复用 shared/schema.sql 全部建表语句（含 cloud_change_log）
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;
  throw new Error('DB not initialized. Call initDb() first.');
}

export function initDb(opts = {}) {
  const dbPath = opts.dbPath || process.env.CLOUD_DB_PATH || './data/cloud.db';
  const abs = resolve(dbPath);
  mkdirSync(dirname(abs), { recursive: true });

  const db = new Database(abs, { fileMustExist: false });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaPath = opts.schemaPath || join(__dirname, '../../shared/schema.sql');
  const schema = readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // 兼容旧库：为已有表补新增列
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
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch { /* 列已存在，忽略 */ }
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
