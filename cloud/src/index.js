// 云端中转服务器入口：Express + WebSocket
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createServer } from 'node:http';

import { initDb } from './db.js';
import { syncAuth } from './lib/auth.js';
import { initWsHub, closeWsHub } from './lib/wsHub.js';
import healthRouter from './routes/health.js';
import pushRouter from './routes/push.js';
import pullRouter from './routes/pull.js';
import pointsBroadcastRouter from './routes/pointsBroadcast.js';
import auditRouter from './routes/audit.js';

const app = express();
const PORT = parseInt(process.env.CLOUD_PORT || '8080', 10);
const CORS_ORIGIN = process.env.CLOUD_CORS_ORIGIN || '*';
const WS_PATH = process.env.CLOUD_WS_PATH || '/ws';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('tiny'));

// 健康检查（无需鉴权，注册在 syncAuth 之前）
app.use('/api/sync/health', healthRouter);

// 其余 /api/sync/* 路由均需 X-Sync-Secret 校验
app.use('/api/sync', syncAuth);
app.use('/api/sync/push', pushRouter);
app.use('/api/sync/pull', pullRouter);
app.use('/api/sync/points-broadcast', pointsBroadcastRouter);
app.use('/api/sync/audit-query', auditRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: `Not Found: ${req.method} ${req.path}` });
});

// 统一错误处理（4 参数签名，Express 识别为错误中间件）
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('[cloud error]', err);
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal Server Error',
    code: err.code || null,
  });
});

// 初始化数据库
initDb();

// 创建 HTTP 服务器并挂载 WebSocket
const server = createServer(app);
initWsHub(server, WS_PATH);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[cloud] 云端同步服务已启动：http://localhost:${PORT} (WS path: ${WS_PATH})`
  );
});

function shutdown() {
  // eslint-disable-next-line no-console
  console.log('[cloud] 正在关闭...');
  closeWsHub();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app, server };
