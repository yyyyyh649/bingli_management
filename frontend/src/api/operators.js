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

let cache = null; // 模块级缓存，跨组件复用

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

  useEffect(() => {
    if (cache) return;
    refresh();
  }, [refresh]);

  return { operators, loading, refresh };
}
