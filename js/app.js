// app.js - 主应用：路由 + 首页

(function (global) {
  const app = document.getElementById('app');

  const ROUTES = {
    home: { render: renderHome, title: '首页' },
    member: { render: (c) => Member.render(c), title: '会员登记' },
    case: { render: (c) => Case.render(c), title: '病例登记' },
    optometry: { render: (c) => Optometry.render(c), title: '验光单登记' },
    points: { render: (c, p) => Points.render(c, p), title: '积分查询' },
  };

  let currentRoute = 'home';

  async function navigate(route, params) {
    if (!ROUTES[route]) route = 'home';
    currentRoute = route;
    UI.closeModal();
    await ROUTES[route].render(app, params || {});
    window.scrollTo(0, 0);
  }

  function renderHome() {
    app.innerHTML = `
      <div class="home-grid">
        <div class="home-card" data-route="member">
          <div class="icon">👤</div>
          <h3>会员登记</h3>
          <p>登记新会员、查询会员积分。会员与非会员统一管理，按手机号自动匹配。</p>
        </div>
        <div class="home-card" data-route="case">
          <div class="icon">📋</div>
          <h3>病例登记</h3>
          <p>简约登记或复杂问卷登记，问卷支持跳题逻辑与「其他」自定义输入。</p>
        </div>
        <div class="home-card" data-route="optometry">
          <div class="icon">👓</div>
          <h3>验光单</h3>
          <p>6 页问卷式登记：基本信息、左右眼 DS/DC、价格瞳距。自动计入积分。</p>
        </div>
      </div>

      <div class="home-grid mt-4">
        <div class="home-card" data-route="points">
          <div class="icon">⭐</div>
          <h3>积分查询</h3>
          <p>查询客户积分、会员码、积分明细及关联的验光单/病例。</p>
        </div>
      </div>

      <div class="card mt-4" style="background:#f8fafc;">
        <h3 class="subsection-title" style="margin-top:0;">数据同步说明</h3>
        <p class="text-sm text-muted">
          两店不在同一局域网，请使用顶部「同步」按钮：导出本店数据为 JSON 文件 → 发送给对方门店 → 对方导入合并。
          合并时按修改时间自动解决冲突，双方各自保留完整副本。
        </p>
      </div>
    `;
    app.querySelectorAll('.home-card').forEach((el) => {
      el.onclick = () => navigate(el.dataset.route);
    });
  }

  function updateStoreLabel() {
    const label = document.getElementById('storeLabel');
    if (label) label.textContent = DB.getStoreName() + ' · ' + DB.getStoreId().slice(0, 8);
  }

  async function editStoreInfo() {
    const curName = DB.getStoreName();
    const curId = DB.getStoreId();
    UI.modal({
      title: '本店信息',
      body: `
        <div class="form-group">
          <label>门店名称（用于区分两家店）</label>
          <input class="form-control" id="storeNameInput" value="${UI.escapeHtml(curName)}" placeholder="如：总店 / 分店">
        </div>
        <div class="form-group">
          <label>门店 ID（系统自动生成，可手动指定以区分两店）</label>
          <input class="form-control" id="storeIdInput" value="${UI.escapeHtml(curId)}">
          <div class="form-hint">两店需使用不同 ID；建议分别为 store-A、store-B。</div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>取消</button>
        <button class="btn btn-success" id="saveStore">保存</button>
      `,
    });
    document.getElementById('saveStore').onclick = () => {
      const name = document.getElementById('storeNameInput').value.trim() || '本店';
      const id = document.getElementById('storeIdInput').value.trim() || ('store-' + Math.random().toString(36).slice(2, 10));
      DB.setStoreName(name);
      DB.setStoreId(id);
      updateStoreLabel();
      UI.toast('已保存门店信息', 'success');
      UI.closeModal();
    };
  }

  async function init() {
    await DB.openDB();
    updateStoreLabel();

    document.getElementById('homeBtn').onclick = () => navigate('home');
    document.getElementById('syncBtn').onclick = async () => {
      await Sync.showSyncDialog(() => { /* 刷新当前页 */ navigate(currentRoute); });
    };
    document.getElementById('storeLabel').onclick = editStoreInfo;

    navigate('home');
  }

  global.App = { navigate, init };
  document.addEventListener('DOMContentLoaded', init);
})(window);
