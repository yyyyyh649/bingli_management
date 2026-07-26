// points.js - 积分查询入口
// 完整的积分详情页（个人信息、积分、会员码、积分明细、关联验光单/病例）
// 已在 member.js 的 showCustomerDetail 中实现。本模块提供「查找客户 → 进入积分页」入口。

(function (global) {
  async function render(container, params) {
    // 渲染搜索页作为背景，然后弹出客户积分详情
    await renderSearch(container);
    if (params && params.customerId) {
      Member.showCustomerDetail(params.customerId);
    }
  }

  async function renderSearch(container) {
    container.innerHTML = `
      <h2 class="section-title">积分查询</h2>
      <div class="card">
        <p class="text-sm text-muted mb-3">输入手机号后四位 / 完整手机号 / 姓名 / 会员卡号，查找客户并查看积分详情。</p>
        <div class="flex flex-wrap" style="gap:8px;">
          <input type="text" class="form-control" id="pSearch" placeholder="查询关键词" style="flex:1;min-width:200px;">
          <button class="btn" id="pBtn">查询</button>
        </div>
        <div id="pResult" class="mt-3"></div>
      </div>
    `;
    document.getElementById('pBtn').onclick = onSearch;
    document.getElementById('pSearch').onkeydown = (e) => { if (e.key === 'Enter') onSearch(); };
    document.getElementById('pSearch').focus();
  }

  async function onSearch() {
    const kw = document.getElementById('pSearch').value.trim();
    const resultEl = document.getElementById('pResult');
    if (!kw) { resultEl.innerHTML = ''; return; }
    const all = await DB.getAll('customers');
    const k = kw.toLowerCase();
    const last4 = kw.length === 4 && /^\d{4}$/.test(kw) ? kw : null;
    const matches = all.filter((c) => {
      if (last4 && c.phone && c.phone.slice(-4) === last4) return true;
      if (c.phone && c.phone === kw) return true;
      if (c.name && c.name.toLowerCase().includes(k)) return true;
      if (c.cardNumber && c.cardNumber.toLowerCase().includes(k)) return true;
      return false;
    });
    if (!matches.length) {
      resultEl.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>未找到匹配客户</div>`;
      return;
    }
    resultEl.innerHTML = matches.map((c) => {
      const badge = c.isMember
        ? `<span class="badge badge-member">会员</span>`
        : `<span class="badge badge-non">非会员</span>`;
      return `
        <div class="list-item" data-cid="${c.id}">
          <div>
            <div>${UI.escapeHtml(c.name)} ${badge} <span class="badge badge-points">${c.points || 0} 分</span></div>
            <div class="meta">${UI.escapeHtml(c.phone)}${c.cardNumber ? ' · 卡号 ' + UI.escapeHtml(c.cardNumber) : ''}</div>
          </div>
          <div class="text-sm text-muted">查看积分 ›</div>
        </div>
      `;
    }).join('');
    resultEl.querySelectorAll('[data-cid]').forEach((el) => {
      el.onclick = () => Member.showCustomerDetail(el.dataset.cid);
    });
  }

  global.Points = { render };
})(window);
