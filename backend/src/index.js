// 本地店铺应用入口
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initDb } from './db.js';
import { errorHandler } from './lib/response.js';
import healthRouter from './routes/health.js';
import operatorsRouter from './routes/operators.js';
import customersRouter from './routes/customers.js';
import pointsRouter from './routes/points.js';
import balanceRouter from './routes/balance.js';
import casesRouter from './routes/cases.js';
import prescriptionsRouter from './routes/prescriptions.js';
import adminRouter from './routes/admin.js';
import { startSyncLoop, stopSyncLoop } from './sync/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

// 健康检查
app.use('/api/health', healthRouter);

// 业务路由
app.use('/api/operators', operatorsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/points', pointsRouter);
app.use('/api/balance', balanceRouter);
app.use('/api/cases', casesRouter);
app.use('/api/prescriptions', prescriptionsRouter);
app.use('/api/admin', adminRouter);

// 生产环境：托管前端构建产物（backend/public 由 build:frontend 拷贝过来）
const publicDir = join(__dirname, '../public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA 回退：非 /api 路径都返回 index.html
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
}

app.use(errorHandler);

// 启动
initDb();

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] 店铺应用已启动：http://localhost:${PORT} (STORE_ID=${process.env.STORE_ID || 'store1'})`);
});

// 启动同步循环（若启用）
let syncHandle = null;
(async () => {
  try {
    syncHandle = await startSyncLoop();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[backend] 同步循环启动失败（不影响本地使用）：', e.message);
  }
})();

function shutdown() {
  // eslint-disable-next-line no-console
  console.log('[backend] 正在关闭...');
  stopSyncLoop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server };
