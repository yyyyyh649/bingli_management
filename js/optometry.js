// optometry.js - 验光单（6页问卷式）
// P1 基本信息 P2 右眼DS P3 右眼DC P4 左眼DS P5 左眼DC P6 价格+瞳距
// 镜片价格 + 镜架价格 = 本次积分，自动写入客户积分。

(function (global) {
  const SIX_ITEMS = [
    { key: 'auto', label: '电脑验光' },
    { key: 'retinoFast', label: '检影验光（快散）' },
    { key: 'retinoSlow', label: '检影验光（慢散）' },
    { key: 'insert', label: '插片复检' },
    { key: 'farFit', label: '配装眼镜（远用）' },
    { key: 'nearFit', label: '配装眼镜（近用）' },
  ];

  const PAGE_LABELS = ['基本信息', '右眼 DS', '右眼 DC', '左眼 DS', '左眼 DC', '价格瞳距'];

  let wiz = null;

  function newRecord() {
    return {
      name: '', age: '', address: '', phone: '', date: UI.todayStr(),
      rightDS: emptyEye(), rightDC: emptyEye(),
      leftDS: emptyEye(), leftDC: emptyEye(),
      lensPrice: '', framePrice: '', pdNear: '', pdFar: '',
    };
  }
  function emptyEye() {
    const o = {};
    SIX_ITEMS.forEach((i) => (o[i.key] = ''));
    return o;
  }

  async function render(container) {
    wiz = { data: newRecord(), page: 0, customerId: null };
    renderPage(container);
  }

  function renderPage(container) {
    const p = wiz.page;
    const dots = PAGE_LABELS.map((label, i) => {
      const cls = i < p ? 'done' : i === p ? 'current' : '';
      return `<span class="page-dot ${cls}" title="${label}">${i + 1}</span>`;
    }).join('');

    const pageLabel = PAGE_LABELS[p];

    container.innerHTML = `
      <h2 class="section-title">验光单登记</h2>
      <div class="card">
        <div class="wizard-pages">${dots}</div>
        <div class="text-sm text-muted mb-3">第 ${p + 1} 页 / 共 6 页 · ${pageLabel}</div>
        <div id="pageBody"></div>
        <div class="wizard-nav">
          <button class="btn btn-outline" id="wPrev" ${p === 0 ? 'disabled' : ''}>‹ 上一页</button>
          <div class="spacer"></div>
          <button class="btn btn-ghost" id="wCancel">取消</button>
          ${p === 5
            ? `<button class="btn btn-success" id="wSave">💾 保存</button>`
            : `<button class="btn" id="wNext">下一页 ›</button>`}
        </div>
      </div>
    `;
    document.getElementById('wPrev').onclick = () => { collectPage(p); if (p > 0) { wiz.page--; renderPage(container); } };
    document.getElementById('wCancel').onclick = async () => {
      if (await UI.confirm('确认取消？已填内容将丢失。')) { wiz = null; App.navigate('optometry'); }
    };
    const nextBtn = document.getElementById('wNext');
    if (nextBtn) nextBtn.onclick = () => { if (collectPage(p)) { if (p < 5) { wiz.page++; renderPage(container); } } };
    const saveBtn = document.getElementById('wSave');
    if (saveBtn) saveBtn.onclick = () => { if (collectPage(p)) save(container); };

    renderPageBody(p);
  }

  function renderPageBody(p) {
    const body = document.getElementById('pageBody');
    const d = wiz.data;
    if (p === 0) {
      body.innerHTML = `
        <div class="form-grid">
          <div class="form-group"><label>姓名 <span class="req">*</span></label><input class="form-control" id="f_name" value="${UI.escapeHtml(d.name)}"></div>
          <div class="form-group"><label>年龄</label><input type="number" class="form-control" id="f_age" value="${UI.escapeHtml(d.age)}"></div>
          <div class="form-group"><label>手机号 <span class="req">*</span></label><input class="form-control" id="f_phone" value="${UI.escapeHtml(d.phone)}" maxlength="11"></div>
          <div class="form-group"><label>登记日期</label><input type="date" class="form-control" id="f_date" value="${UI.escapeHtml(d.date)}"></div>
        </div>
        <div class="form-group"><label>住址</label><input class="form-control" id="f_address" value="${UI.escapeHtml(d.address)}"></div>
      `;
    } else if (p >= 1 && p <= 4) {
      const map = ['rightDS', 'rightDC', 'leftDS', 'leftDC'];
      const field = map[p - 1];
      const eyeLabel = p <= 2 ? '右眼' : '左眼';
      const dsdc = (p === 1 || p === 3) ? 'DS' : 'DC';
      body.innerHTML = `
        <h3 class="subsection-title" style="margin-top:0;">${eyeLabel} ${dsdc}</h3>
        <div class="form-grid">
          ${SIX_ITEMS.map((it) => `
            <div class="form-group">
              <label>${it.label}</label>
              <input class="form-control" id="f_${field}_${it.key}" value="${UI.escapeHtml(d[field][it.key])}" placeholder="${it.label}数值">
            </div>
          `).join('')}
        </div>
      `;
    } else if (p === 5) {
      const lens = parseFloat(d.lensPrice) || 0;
      const frame = parseFloat(d.framePrice) || 0;
      body.innerHTML = `
        <div class="form-grid">
          <div class="form-group"><label>镜片价格（元）</label><input type="number" class="form-control" id="f_lensPrice" value="${UI.escapeHtml(d.lensPrice)}"></div>
          <div class="form-group"><label>镜架价格（元）</label><input type="number" class="form-control" id="f_framePrice" value="${UI.escapeHtml(d.framePrice)}"></div>
          <div class="form-group"><label>瞳距（近）</label><input class="form-control" id="f_pdNear" value="${UI.escapeHtml(d.pdNear)}"></div>
          <div class="form-group"><label>瞳距（远）</label><input class="form-control" id="f_pdFar" value="${UI.escapeHtml(d.pdFar)}"></div>
        </div>
        <div class="points-summary mt-3">
          <div>
            <div class="label">本次积分（镜片 + 镜架）</div>
            <div class="total" id="previewPoints">${(lens + frame).toFixed(0)}</div>
          </div>
          <div class="text-sm" style="color:#78350f;">保存后将自动计入客户积分</div>
        </div>
      `;
      const updatePreview = () => {
        const l = parseFloat(document.getElementById('f_lensPrice').value) || 0;
        const f = parseFloat(document.getElementById('f_framePrice').value) || 0;
        document.getElementById('previewPoints').textContent = (l + f).toFixed(0);
      };
      document.getElementById('f_lensPrice').oninput = updatePreview;
      document.getElementById('f_framePrice').oninput = updatePreview;
    }
  }

  function collectPage(p) {
    const d = wiz.data;
    if (p === 0) {
      d.name = val('f_name');
      d.age = val('f_age');
      d.phone = val('f_phone');
      d.date = val('f_date') || UI.todayStr();
      d.address = val('f_address');
      if (!d.name || !d.phone) { UI.toast('请填写姓名和手机号', 'warning'); return false; }
      if (!/^\d{11}$/.test(d.phone)) { UI.toast('手机号需为 11 位', 'warning'); return false; }
    } else if (p >= 1 && p <= 4) {
      const map = ['rightDS', 'rightDC', 'leftDS', 'leftDC'];
      const field = map[p - 1];
      SIX_ITEMS.forEach((it) => { d[field][it.key] = val(`f_${field}_${it.key}`); });
    } else if (p === 5) {
      d.lensPrice = val('f_lensPrice');
      d.framePrice = val('f_framePrice');
      d.pdNear = val('f_pdNear');
      d.pdFar = val('f_pdFar');
    }
    return true;
  }
  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  async function save(container) {
    const d = wiz.data;
    const lens = parseFloat(d.lensPrice) || 0;
    const frame = parseFloat(d.framePrice) || 0;
    const points = Math.round(lens + frame);

    const customer = await Member.findOrCreateCustomer({ name: d.name, phone: d.phone });
    wiz.customerId = customer.id;

    const rec = {
      id: DB.genId(),
      customerId: customer.id,
      name: d.name,
      age: d.age,
      address: d.address,
      phone: d.phone,
      date: d.date,
      rightDS: d.rightDS,
      rightDC: d.rightDC,
      leftDS: d.leftDS,
      leftDC: d.leftDC,
      lensPrice: lens,
      framePrice: frame,
      pdNear: d.pdNear,
      pdFar: d.pdFar,
      pointsEarned: points,
    };
    await DB.put('optometry', rec);

    if (points > 0) {
      await Member.addPoints(customer.id, points, '验光配镜积分', rec.id, 'optometry');
    }
    UI.toast('验光单已保存' + (points > 0 ? `，已计入 ${points} 积分` : ''), 'success');
    wiz = null;
    UI.askGoPoints(customer.id);
  }

  // ---- 详情 ----
  async function showDetail(optoId, returnToCustomerId) {
    const o = await DB.get('optometry', optoId);
    if (!o) { UI.toast('未找到验光单', 'error'); return; }

    function eyeTable(title, eye) {
      return `
        <h4 class="subsection-title">${title}</h4>
        <table class="eye-table">
          <thead>
            <tr><th>项目</th><th>数值</th></tr>
          </thead>
          <tbody>
            ${SIX_ITEMS.map((it) => `
              <tr><td class="row-label">${it.label}</td><td>${UI.escapeHtml(String(eye[it.key] || '')) || '—'}</td></tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    const body = `
      <div class="detail-grid mb-3">
        <div class="detail-item"><label>姓名</label><span class="value">${UI.escapeHtml(o.name)}</span></div>
        <div class="detail-item"><label>年龄</label><span class="value">${UI.escapeHtml(String(o.age || ''))}</span></div>
        <div class="detail-item"><label>手机号</label><span class="value">${UI.escapeHtml(o.phone)}</span></div>
        <div class="detail-item"><label>登记日期</label><span class="value">${UI.formatDate(o.date || o.createdAt)}</span></div>
      </div>
      <div class="detail-item mb-3"><label>住址</label><span class="value">${UI.escapeHtml(o.address || '未填')}</span></div>
      <div class="flex flex-wrap" style="gap:12px;">
        <div style="flex:1;min-width:280px;">${eyeTable('右眼 DS', o.rightDS)}</div>
        <div style="flex:1;min-width:280px;">${eyeTable('右眼 DC', o.rightDC)}</div>
        <div style="flex:1;min-width:280px;">${eyeTable('左眼 DS', o.leftDS)}</div>
        <div style="flex:1;min-width:280px;">${eyeTable('左眼 DC', o.leftDC)}</div>
      </div>
      <h4 class="subsection-title mt-4">价格与瞳距</h4>
      <div class="detail-grid">
        <div class="detail-item"><label>镜片价格</label><span class="value">${o.lensPrice || 0} 元</span></div>
        <div class="detail-item"><label>镜架价格</label><span class="value">${o.framePrice || 0} 元</span></div>
        <div class="detail-item"><label>瞳距（近）</label><span class="value">${UI.escapeHtml(String(o.pdNear || '')) || '—'}</span></div>
        <div class="detail-item"><label>瞳距（远）</label><span class="value">${UI.escapeHtml(String(o.pdFar || '')) || '—'}</span></div>
      </div>
      <div class="points-summary mt-3">
        <div>
          <div class="label">本次积分</div>
          <div class="total">+${o.pointsEarned || 0}</div>
        </div>
      </div>
    `;

    UI.modal({
      title: '验光单详情',
      body,
      size: 'large',
      footer: `
        ${returnToCustomerId ? `<button class="btn btn-outline" id="backToCustomer">返回客户</button>` : ''}
        <button class="btn btn-danger" id="deleteOpto">删除</button>
        <button class="btn" data-modal-close>关闭</button>
      `,
    });

    if (returnToCustomerId) {
      document.getElementById('backToCustomer').onclick = () => {
        UI.closeModal();
        Member.showCustomerDetail(returnToCustomerId);
      };
    }
    document.getElementById('deleteOpto').onclick = async () => {
      if (await UI.confirm('确认删除此验光单？已计入的积分不会自动扣减，需手动调整。', { okText: '删除', okClass: 'btn btn-danger' })) {
        await DB.del('optometry', optoId);
        UI.toast('已删除', 'success');
        UI.closeModal();
        if (returnToCustomerId) Member.showCustomerDetail(returnToCustomerId);
      }
    };
  }

  global.Optometry = { render, showDetail, SIX_ITEMS };
})(window);
