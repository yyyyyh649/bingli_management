import client from './client.js';

// 获取当前店 operators 列表
export function listOperators() {
  return client.get('/operators'); // → data: operators[]
}

export function createOperator({ name, sortOrder }) {
  return client.post('/operators', { name, sortOrder });
}

export function updateOperator(id, { name, sortOrder }) {
  return client.put(`/operators/${id}`, { name, sortOrder });
}

export function deleteOperator(id, password) {
  return client.delete(`/operators/${id}`, { data: { password } });
}

// 自定义 hook：缓存 operator 列表，多个表单复用
import { useState, useEffect, useCallback } from 'react';

let cache = null; // 模块级缓存，跨组件复用（仅作初始值，每次挂载仍会刷新）

export function useOperators() {
  const [operators, setOperators] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listOperators();
      cache = Array.isArray(list) ? list : [];
      setOperators(cache);
      return cache;
    } catch (e) {
      // 拦截器已提示
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // 每次挂载都刷新，避免后台新增登记人后表单仍用旧缓存
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { operators, loading, refresh };
}
