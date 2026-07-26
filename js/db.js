// db.js - IndexedDB wrapper for local storage
// 数据库层：本地存储（IndexedDB），支持两店同步（按时间戳合并冲突）

(function (global) {
  const DB_NAME = 'opticalManager';
  const DB_VERSION = 1;
  const STORES = ['customers', 'cases', 'optometry', 'meta'];

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        STORES.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: 'id' });
            if (name !== 'meta') {
              store.createIndex('customerId', 'customerId', { unique: false });
              store.createIndex('phone', 'phone', { unique: false });
              store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode = 'readonly') {
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function reqToPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ---- Store ID ----
  function getStoreId() {
    let id = localStorage.getItem('storeId');
    if (!id) {
      id = 'store-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('storeId', id);
    }
    return id;
  }

  function setStoreId(id) {
    localStorage.setItem('storeId', id);
  }

  function getStoreName() {
    return localStorage.getItem('storeName') || '本店';
  }

  function setStoreName(name) {
    localStorage.setItem('storeName', name);
  }

  // ---- Meta (settings, sync log) ----
  async function getMeta(key, defaultVal) {
    const store = await tx('meta');
    const rec = await reqToPromise(store.get(key));
    return rec ? rec.value : defaultVal;
  }

  async function setMeta(key, value) {
    const store = await tx('meta', 'readwrite');
    await reqToPromise(store.put({ id: key, value, updatedAt: Date.now() }));
  }

  // ---- Generic CRUD ----
  async function put(storeName, record) {
    if (!record.id) record.id = genId();
    record.updatedAt = Date.now();
    if (!record.storeId) record.storeId = getStoreId();
    if (!record.createdAt) record.createdAt = Date.now();
    const store = await tx(storeName, 'readwrite');
    await reqToPromise(store.put(record));
    return record;
  }

  async function get(storeName, id) {
    const store = await tx(storeName);
    return reqToPromise(store.get(id));
  }

  async function getAll(storeName) {
    const store = await tx(storeName);
    return reqToPromise(store.getAll());
  }

  async function del(storeName, id) {
    const store = await tx(storeName, 'readwrite');
    await reqToPromise(store.delete(id));
  }

  async function findByIndex(storeName, indexName, value) {
    const store = await tx(storeName);
    const idx = store.index(indexName);
    return reqToPromise(idx.getAll(value));
  }

  // ---- ID generator ----
  function genId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- Bulk put (for sync import) ----
  async function bulkPut(storeName, records) {
    const store = await tx(storeName, 'readwrite');
    return Promise.all(records.map((r) => reqToPromise(store.put(r))));
  }

  // ---- Export all data ----
  async function exportAll() {
    const result = {};
    for (const name of STORES) {
      result[name] = await getAll(name);
    }
    return {
      version: DB_VERSION,
      exportedAt: Date.now(),
      storeId: getStoreId(),
      storeName: getStoreName(),
      data: result,
    };
  }

  // ---- Merge import: last-write-wins by updatedAt ----
  async function mergeImport(payload) {
    const data = payload.data || payload;
    let stats = {};
    for (const name of STORES) {
      if (!data[name]) continue;
      const existing = await getAll(name);
      const existingMap = new Map(existing.map((r) => [r.id, r]));
      const toWrite = [];
      for (const incoming of data[name]) {
        const cur = existingMap.get(incoming.id);
        if (!cur || (incoming.updatedAt || 0) > (cur.updatedAt || 0)) {
          toWrite.push(incoming);
        }
      }
      if (toWrite.length) await bulkPut(name, toWrite);
      stats[name] = toWrite.length;
    }
    return stats;
  }

  global.DB = {
    openDB,
    put,
    get,
    getAll,
    del,
    findByIndex,
    genId,
    getStoreId,
    setStoreId,
    getStoreName,
    setStoreName,
    getMeta,
    setMeta,
    exportAll,
    mergeImport,
    STORES,
  };
})(window);
