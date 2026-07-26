// 统一响应助手
export function ok(data) {
  return { ok: true, data };
}

export function fail(error, code = null, extra = null) {
  const body = { ok: false, error };
  if (code) body.code = code;
  if (extra) body.data = extra;
  return body;
}

// 错误中间件：捕获同步抛出的 Error，转成 JSON 信封
export function errorHandler(err, _req, res, _next) {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json(fail(err.message || 'Internal Server Error', err.code || null));
}

// 包装 async 路由，自动把 throw 转 next(err)
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// 业务校验失败时抛此错误
export class ApiError extends Error {
  constructor(message, status = 400, code = null, extra = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
