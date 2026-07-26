// 初始化数据库（首次部署运行）
import 'dotenv/config';
import { initDb, closeDb } from '../src/db.js';

console.log('[init-db] 开始初始化数据库...');
const db = initDb();
console.log('[init-db] 建表完成，数据库路径：', process.env.DB_PATH || './data/local.db');

// 检查是否已有 operators，没有则提示
const count = db.prepare('SELECT COUNT(*) AS n FROM operators').get();
console.log('[init-db] 当前 operators 数量：', count.n);
console.log('[init-db] 完成。可通过 npm start 启动服务。');

closeDb();
