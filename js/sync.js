// sync.js - 数据同步（两店之间）
// 由于两店不在同一局域网，采用「导出 JSON 文件 → 传给对方 → 导入合并」的方式。
// 合并策略：按 updatedAt 时间戳，新数据覆盖旧数据（last-write-wins）。
// 也能记录最近一次同步时间，方便人工对账。

(function (global) {
  async function exportToFile() {
    const payload = await DB.exportAll();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `optical-sync-${payload.storeName}-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    await DB.setMeta('lastSyncExport', Date.now());
    return payload;
  }

  function pickFile() {
    return new Promise((resolve, reject) => {
      const input = document.getElementById('syncFileInput');
      if (!input) return reject(new Error('file input missing'));
      input.value = '';
      input.onchange = () => {
        const file = input.files[0];
        if (!file) return reject(new Error('未选择文件'));
        const reader = new FileReader();
        reader.onload = () => {
          try { resolve(JSON.parse(reader.result)); }
          catch (e) { reject(new Error('文件格式错误，请上传 JSON')); }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      };
      input.click();
    });
  }

  async function importFromFile() {
    const payload = await pickFile();
    const stats = await DB.mergeImport(payload);
    await DB.setMeta('lastSyncImport', Date.now());
    await DB.setMeta('lastSyncImportFrom', payload.storeName || '未知');
    return stats;
  }

  // 同步对话框：选择导出 / 导入
  async function showSyncDialog(onDone) {
    const lastExport = await DB.getMeta('lastSyncExport');
    const lastImport = await DB.getMeta('lastSyncImport');
    const lastImportFrom = await DB.getMeta('lastSyncImportFrom');
    const fmt = (t) => t ? new Date(t).toLocaleString('zh-CN') : '从未';

    UI.modal({
      title: '数据同步',
      body: `
        <div class="card" style="box-shadow:none;margin:0;background:#f8fafc;">
          <p class="text-sm text-muted mb-3">两店不在同一局域网，使用「导出/导入」文件方式同步。
          合并时按修改时间，新数据覆盖旧数据。</p>
          <div class="detail-grid">
            <div class="detail-item"><label>上次导出</label><span class="value">${fmt(lastExport)}</span></div>
            <div class="detail-item"><label>上次导入</label><span class="value">${fmt(lastImport)}${lastImportFrom ? ' (' + lastImportFrom + ')' : ''}</span></div>
          </div>
        </div>
        <div class="mt-3">
          <button id="syncExport" class="btn btn-block mt-2">📤 导出本店数据（生成 JSON 文件）</button>
          <button id="syncImport" class="btn btn-secondary btn-block mt-2">📥 导入对方数据（合并到本店）</button>
        </div>
      `,
      footer: `<button class="btn btn-outline" data-modal-close>关闭</button>`,
    });

    document.getElementById('syncExport').onclick = async () => {
      await exportToFile();
      UI.toast('已导出本店数据，请将文件发送给对方门店导入', 'success');
      UI.closeModal();
      onDone && onDone();
    };
    document.getElementById('syncImport').onclick = async () => {
      try {
        const stats = await importFromFile();
        const sum = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join('，');
        UI.toast('导入完成，更新：' + sum, 'success');
        UI.closeModal();
        onDone && onDone();
      } catch (e) {
        UI.toast('导入失败：' + e.message, 'error');
      }
    };
  }

  global.Sync = { exportToFile, importFromFile, showSyncDialog };
})(window);
