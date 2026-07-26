// 初始化云端数据库（首次部署运行）
import 'dotenv/config';
import { initDb, closeDb } from '../src/db.js';

console.log('[cloud init-db] 开始初始化云端数据库...');
const db = initDb();
console.log(
  '[cloud init-db] 建表完成，数据库路径：',
  process.env.CLOUD_DB_PATH || './data/cloud.db'
);

// 检查 cloud_change_log 是否就绪
const row = db.prepare('SELECT COUNT(*) AS n FROM cloud_change_log').get();
console.log('[cloud init-db] 当前 cloud_change_log 记录数：', row.n);
console.log('[cloud init-db] 完成。可通过 npm start 启动服务。');

closeDb();
