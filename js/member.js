// member.js - 会员登记与查询
// 会员 = customers 表里 isMember=true 的记录；非会员也有记录但无会员卡号。
// 提供查询（手机号后四位 / 全手机号 / 姓名 / 会员卡号）。
// 也提供 findOrCreateCustomer：病例/验光单登记时自动匹配或新建客户。

(function (global) {
  const REGISTRARS = ['张医生', '李医生', '王医生', '赵医生', '前台小刘', '前台小陈'];

  // ---- 渲染：会员登记主视图 ----
  async function render(container) {
    container.innerHTML = `
      <h2 class="section-title">会员登记</h2>
      <div class="card">
        <h3 class="subsection-title" style="margin-top:0;">登记新会员</h3>
        <div class="form-grid">
          <div class="form-group">
            <label>姓名 <span class="req">*</span></label>
            <input type="text" class="form-control" id="mName" placeholder="客户姓名">
          </div>
          <div class="form-group">
            <label>手机号 <span class="req">*</span></label>
            <input type="tel" class="form-control" id="mPhone" placeholder="11位手机号" maxlength="11">
          </div>
          <div class="form-group">
            <label>会员卡号</label>
            <input type="text" class="form-control" id="mCard" placeholder="选填，无则留空">
          </div>
        </div>
        <button class="btn mt-3" id="mSubmit">登记会员</button>
      </div>

      <div class="card">
        <h3 class="subsection-title" style="margin-top:0;">查询会员 / 客户</h3>
        <p class="text-sm text-muted mb-3">可按手机号后四位、完整手机号、姓名、会员卡号查询。会员与非会员都可查到。</p>
        <div class="flex flex-wrap" style="gap:8px;">
          <input type="text" class="form-control" id="qInput" placeholder="输入查询关键词" style="flex:1;min-width:200px;">
          <button class="btn" id="qBtn">查询</button>
        </div>
        <div id="qResult" class="mt-3"></div>
      </div>
    `;

    document.getElementById('mSubmit').onclick = onRegister;
    document.getElementById('qBtn').onclick = onQuery;
    document.getElementById('qInput').onkeydown = (e) => { if (e.key === 'Enter') onQuery(); };
  }

  // ---- 登记会员 ----
  async function onRegister() {
    const name = document.getElementById('mName').value.trim();
    const phone = document.getElementById('mPhone').value.trim();
    const card = document.getElementById('mCard').value.trim();
    if (!name || !phone) { return UI.toast('请填写姓名和手机号', 'error'); }
    if (!/^\d{11}$/.test(phone)) { return UI.toast('手机号需为 11 位数字', 'error'); }

    // 先查是否已存在
    const existing = await findCustomerByPhone(phone);
    if (existing) {
      if (existing.isMember) {
        UI.toast('该客户已是会员，卡号：' + (existing.cardNumber || '无'), 'warning');
      } else {
        // 升级为会员
        existing.isMember = true;
        existing.cardNumber = card || autoCardNumber();
        existing.name = name;
        await DB.put('customers', existing);
        UI.toast('已将该客户升级为会员', 'success');
      }
      showCustomerDetail(existing.id);
      return;
    }
    const customer = {
      id: DB.genId(),
      name,
      phone,
      cardNumber: card || autoCardNumber(),
      isMember: true,
      points: 0,
      pointsHistory: [],
    };
    await DB.put('customers', customer);
    UI.toast('会员登记成功', 'success');
    document.getElementById('mName').value = '';
    document.getElementById('mPhone').value = '';
    document.getElementById('mCard').value = '';
    showCustomerDetail(customer.id);
  }

  function autoCardNumber() {
    const n = Math.floor(1000 + Math.random() * 9000);
    return 'M' + Date.now().toString().slice(-6) + n;
  }

  // ---- 查询 ----
  async function onQuery() {
    const kw = document.getElementById('qInput').value.trim();
    const resultEl = document.getElementById('qResult');
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
      resultEl.innerHTML = `<div class="empty-state"><div class="icon">🔍</div>未找到匹配的客户</div>`;
      return;
    }
    resultEl.innerHTML = matches.map((c) => customerRow(c)).join('');
    resultEl.querySelectorAll('[data-cid]').forEach((el) => {
      el.onclick = () => showCustomerDetail(el.dataset.cid);
    });
  }

  function customerRow(c) {
    const badge = c.isMember
      ? `<span class="badge badge-member">会员</span>`
      : `<span class="badge badge-non">非会员</span>`;
    const card = c.cardNumber ? ` · 卡号 ${UI.escapeHtml(c.cardNumber)}` : '';
    return `
      <div class="list-item" data-cid="${c.id}">
        <div>
          <div>${UI.escapeHtml(c.name)} ${badge} <span class="badge badge-points">${c.points || 0} 分</span></div>
          <div class="meta">${UI.escapeHtml(c.phone)}${card}</div>
        </div>
        <div class="text-sm text-muted">查看 ›</div>
      </div>
    `;
  }

  // ---- 客户详情（含积分、积分明细、关联验光单/病例） ----
  async function showCustomerDetail(customerId) {
    const c = await DB.get('customers', customerId);
    if (!c) { UI.toast('未找到客户', 'error'); return; }

    const cases = await DB.findByIndex('cases', 'customerId', customerId);
    const optos = await DB.findByIndex('optometry', 'customerId', customerId);
    cases.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    optos.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const badge = c.isMember
      ? `<span class="badge badge-member">会员</span>`
      : `<span class="badge badge-non">非会员</span>`;
    const cardInfo = c.isMember && c.cardNumber
      ? `<div class="detail-item"><label>会员卡号</label><span class="value">${UI.escapeHtml(c.cardNumber)}</span></div>`
      : '';

    const pointsRows = (c.pointsHistory || []).map((h) => {
      const sign = h.amount >= 0 ? '+' : '';
      const color = h.amount >= 0 ? 'var(--success)' : 'var(--danger)';
      return `
        <tr>
          <td>${UI.formatDate(h.date || h.createdAt)}</td>
          <td>${UI.escapeHtml(h.reason || '')}</td>
          <td style="color:${color};font-weight:600;">${sign}${h.amount}</td>
        </tr>
      `;
    }).join('');

    const caseRows = cases.map((cs) => `
      <div class="list-item" data-type="case" data-id="${cs.id}">
        <div>
          <div>📋 病例 · ${cs.type === 'complex' ? '复杂问卷' : '简约'} · ${UI.escapeHtml(cs.condition || '').slice(0, 20)}</div>
          <div class="meta">${UI.formatDate(cs.date || cs.createdAt)} · 登记人 ${UI.escapeHtml(cs.registrar || '未填')}</div>
        </div>
        <div class="text-sm text-muted">查看 ›</div>
      </div>
    `).join('');

    const optoRows = optos.map((o) => `
      <div class="list-item" data-type="optometry" data-id="${o.id}">
        <div>
          <div>👓 验光单 · +${o.pointsEarned || 0} 分</div>
          <div class="meta">${UI.formatDate(o.date || o.createdAt)} · 镜片${o.lensPrice || 0} + 镜架${o.framePrice || 0}</div>
        </div>
        <div class="text-sm text-muted">查看 ›</div>
      </div>
    `).join('');

    const recordsList = (caseRows || optoRows)
      ? (caseRows + optoRows)
      : `<div class="empty-state"><div class="icon">📭</div>暂无病例或验光单</div>`;

    const body = `
      <div class="flex-between mb-3">
        <div>
          <h3 style="margin:0;">${UI.escapeHtml(c.name)} ${badge}</h3>
          <div class="text-sm text-muted">${UI.escapeHtml(c.phone)}</div>
        </div>
      </div>
      <div class="detail-grid mb-3">
        ${cardInfo}
        <div class="detail-item"><label>登记日期</label><span class="value">${UI.formatDate(c.createdAt)}</span></div>
      </div>
      <div class="points-summary">
        <div>
          <div class="label">当前积分</div>
          <div class="total">${c.points || 0}</div>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-success btn-sm" id="addPoints">+ 增加</button>
          <button class="btn btn-danger btn-sm" id="subPoints">− 减少</button>
        </div>
      </div>
      <h4 class="subsection-title">积分明细</h4>
      ${pointsRows
        ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>说明</th><th>变动</th></tr></thead><tbody>${pointsRows}</tbody></table></div>`
        : `<div class="empty-state"><div class="icon">📭</div>暂无积分记录</div>`}
      <h4 class="subsection-title mt-4">关联病例 / 验光单</h4>
      ${recordsList}
    `;

    UI.modal({
      title: '客户详情',
      body,
      size: 'large',
      footer: `
        <button class="btn btn-outline" id="editMember">编辑信息</button>
        <button class="btn" data-modal-close>关闭</button>
      `,
    });

    document.getElementById('addPoints').onclick = () => adjustPoints(c, 1);
    document.getElementById('subPoints').onclick = () => adjustPoints(c, -1);
    document.getElementById('editMember').onclick = () => editMember(c);

    document.querySelectorAll('[data-type]').forEach((el) => {
      el.onclick = () => {
        const type = el.dataset.type;
        const id = el.dataset.id;
        UI.closeModal();
        if (type === 'case') Case.showDetail(id, customerId);
        else Optometry.showDetail(id, customerId);
      };
    });
  }

  // ---- 调整积分 ----
  async function adjustPoints(customer, sign) {
    const val = await UI.prompt(
      sign > 0 ? '增加积分（输入正数）' : '减少积分（输入正数，将自动转负）',
      '',
      { title: '调整积分', okText: '确认' }
    );
    if (val == null) return;
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) { return UI.toast('请输入正数', 'error'); }
    const reason = await UI.prompt('请输入变动原因（如：促销赠送 / 退货扣减）', '', { okText: '确认' });
    const amount = sign > 0 ? n : -n;
    customer.points = (customer.points || 0) + amount;
    customer.pointsHistory = customer.pointsHistory || [];
    customer.pointsHistory.push({
      id: DB.genId(),
      amount,
      reason: reason || (sign > 0 ? '后台增加' : '后台减少'),
      date: Date.now(),
      createdAt: Date.now(),
    });
    await DB.put('customers', customer);
    UI.toast('积分已更新', 'success');
    UI.closeModal();
    showCustomerDetail(customer.id);
  }

  // ---- 编辑会员信息 ----
  async function editMember(c) {
    UI.modal({
      title: '编辑客户信息',
      body: `
        <div class="form-group"><label>姓名</label><input class="form-control" id="eName" value="${UI.escapeHtml(c.name)}"></div>
        <div class="form-group"><label>手机号</label><input class="form-control" id="ePhone" value="${UI.escapeHtml(c.phone)}"></div>
        <div class="form-group"><label>会员卡号</label><input class="form-control" id="eCard" value="${UI.escapeHtml(c.cardNumber || '')}"></div>
        <div class="form-group">
          <label>是否会员</label>
          <select class="form-control" id="eMember">
            <option value="1" ${c.isMember ? 'selected' : ''}>是</option>
            <option value="0" ${!c.isMember ? 'selected' : ''}>否</option>
          </select>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>取消</button>
        <button class="btn btn-success" id="eSave">保存</button>
      `,
    });
    document.getElementById('eSave').onclick = async () => {
      c.name = document.getElementById('eName').value.trim();
      c.phone = document.getElementById('ePhone').value.trim();
      c.cardNumber = document.getElementById('eCard').value.trim();
      c.isMember = document.getElementById('eMember').value === '1';
      if (!c.name || !c.phone) { return UI.toast('姓名和手机号必填', 'error'); }
      await DB.put('customers', c);
      UI.toast('已保存', 'success');
      UI.closeModal();
      showCustomerDetail(c.id);
    };
  }

  // ---- 查找客户（按手机号精确） ----
  async function findCustomerByPhone(phone) {
    const matches = await DB.findByIndex('customers', 'phone', phone);
    return matches && matches.length ? matches[0] : null;
  }

  // ---- Find or create customer (供 病例/验光单 使用) ----
  // 按手机号匹配；找不到则新建非会员客户。返回 customer 对象。
  async function findOrCreateCustomer({ name, phone, cardNumber }) {
    if (phone) {
      const existing = await findCustomerByPhone(phone);
      if (existing) {
        // 同步最新姓名
        if (name && existing.name !== name) {
          existing.name = name;
          await DB.put('customers', existing);
        }
        return existing;
      }
    }
    const customer = {
      id: DB.genId(),
      name: name || '',
      phone: phone || '',
      cardNumber: cardNumber || '',
      isMember: !!cardNumber,
      points: 0,
      pointsHistory: [],
    };
    await DB.put('customers', customer);
    return customer;
  }

  // ---- 增加积分（验光单登记后调用） ----
  async function addPoints(customerId, amount, reason, refId, refType) {
    const c = await DB.get('customers', customerId);
    if (!c || !amount) return;
    c.points = (c.points || 0) + amount;
    c.pointsHistory = c.pointsHistory || [];
    c.pointsHistory.push({
      id: DB.genId(),
      amount,
      reason: reason || '验光配镜积分',
      refId,
      refType,
      date: Date.now(),
      createdAt: Date.now(),
    });
    await DB.put('customers', c);
    return c;
  }

  global.Member = {
    render,
    showCustomerDetail,
    findOrCreateCustomer,
    findCustomerByPhone,
    addPoints,
    REGISTRARS,
  };
})(window);
