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
