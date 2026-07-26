import axios from 'axios';
import { message } from 'antd';

// 统一业务错误，附带 code / data 供调用方分支处理
export class ApiError extends Error {
  constructor(message, code = null, data = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.data = data;
  }
}

// 重复登记需要二次确认的特殊错误码
export const DUPLICATE_CONFIRM_REQUIRED = 'DUPLICATE_CONFIRM_REQUIRED';

const client = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 响应拦截器：拆信封，ok=true 返回 data，ok=false 统一提示并 reject
// 对 DUPLICATE_CONFIRM_REQUIRED 不弹 message（调用方需弹 Modal）
client.interceptors.response.use(
  (response) => {
    const body = response.data;
    // 非标准信封（如文件下载），直接返回原 response
    if (!body || typeof body !== 'object' || typeof body.ok === 'undefined') {
      return response;
    }
    if (body.ok) {
      return body.data;
    }
    // ok === false
    const err = new ApiError(
      body.error || '请求失败',
      body.code || null,
      body.data || null
    );
    if (body.code !== DUPLICATE_CONFIRM_REQUIRED) {
      message.error(body.error || '请求失败');
    }
    return Promise.reject(err);
  },
  (error) => {
    // 网络或 HTTP 状态错误
    let msg = '网络错误，请稍后重试';
    if (error.response) {
      const body = error.response.data;
      if (body && typeof body === 'object' && body.error) {
        msg = body.error;
      } else {
        msg = `请求失败 (${error.response.status})`;
      }
    } else if (error.request) {
      msg = '服务器无响应，请检查后端服务是否启动';
    } else if (error.message) {
      msg = error.message;
    }
    message.error(msg);
    return Promise.reject(
      new ApiError(msg, error.response?.data?.code || null, error.response?.data?.data || null)
    );
  }
);

export default client;
