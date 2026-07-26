// ui.js - UI helper utilities (toast, modal, render, formatting)

(function (global) {
  // ---- Toast ----
  function toast(msg, type = 'info', duration = 3000) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ---- Modal ----
  function modal({ title, body, footer, size }) {
    const root = document.getElementById('modalRoot');
    root.classList.remove('hidden');
    root.innerHTML = `
      <div class="modal" style="${size === 'large' ? 'max-width:780px;' : ''}">
        <div class="modal-header">
          <h3>${title || ''}</h3>
          <button class="modal-close" data-modal-close>×</button>
        </div>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
    root.querySelectorAll('[data-modal-close]').forEach((b) => {
      b.onclick = closeModal;
    });
    root.onclick = (e) => { if (e.target === root) closeModal(); };
    return root.querySelector('.modal');
  }

  function closeModal() {
    const root = document.getElementById('modalRoot');
    root.classList.add('hidden');
    root.innerHTML = '';
  }

  // ---- Confirm dialog (returns Promise<boolean>) ----
  function confirm(message, { title = '确认', okText = '确定', cancelText = '取消', okClass = 'btn' } = {}) {
    return new Promise((resolve) => {
      modal({
        title,
        body: `<p style="font-size:15px;">${message}</p>`,
        footer: `
          <button class="btn btn-outline" id="confirmCancel">${cancelText}</button>
          <button class="btn ${okClass}" id="confirmOk">${okText}</button>
        `,
      });
      document.getElementById('confirmOk').onclick = () => { closeModal(); resolve(true); };
      document.getElementById('confirmCancel').onclick = () => { closeModal(); resolve(false); };
    });
  }

  // ---- Prompt dialog ----
  function prompt(message, defaultValue = '', { title = '输入', okText = '确定' } = {}) {
    return new Promise((resolve) => {
      modal({
        title,
        body: `
          <p style="font-size:15px;margin-bottom:10px;">${message}</p>
          <input type="text" class="form-control" id="promptInput" value="${escapeHtml(defaultValue)}">
        `,
        footer: `
          <button class="btn btn-outline" id="promptCancel">取消</button>
          <button class="btn" id="promptOk">${okText}</button>
        `,
      });
      const input = document.getElementById('promptInput');
      input.focus();
      input.select();
      document.getElementById('promptOk').onclick = () => { closeModal(); resolve(input.value); };
      document.getElementById('promptCancel').onclick = () => { closeModal(); resolve(null); };
      input.onkeydown = (e) => { if (e.key === 'Enter') { closeModal(); resolve(input.value); } };
    });
  }

  // ---- Helpers ----
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function todayStr() { return formatDate(Date.now()); }

  // ---- Popup: 是否前往积分页面 ----
  function askGoPoints(customerId) {
    return new Promise((resolve) => {
      modal({
        title: '登记成功',
        body: `<p style="font-size:15px;">✅ 已保存记录。<br>是否前往该客户的积分页面？</p>`,
        footer: `
          <button class="btn btn-outline" id="askNo">稍后</button>
          <button class="btn btn-success" id="askYes">前往积分页</button>
        `,
      });
      document.getElementById('askYes').onclick = () => {
        closeModal();
        if (customerId) App.navigate('points', { customerId });
        resolve(true);
      };
      document.getElementById('askNo').onclick = () => { closeModal(); resolve(false); };
    });
  }

  global.UI = {
    toast, modal, closeModal, confirm, prompt,
    escapeHtml, formatDate, formatDateTime, todayStr, askGoPoints,
  };
})(window);
