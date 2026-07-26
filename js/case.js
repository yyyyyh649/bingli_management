// case.js - 病例登记（简约 / 复杂问卷两种模式）
// 复杂模式：一题一题答，按选项跳转，每题都有「其他」自定义。

(function (global) {
  // ---- 问卷题目定义（框架示例，可后续完善） ----
  // 每个 option 可指定 next：跳到下一题 id；若不指定则按顺序下一题。
  // allowCustom: true 表示该选项需用户自定义输入文本。
  const QUESTIONNAIRE = [
    {
      id: 'q1',
      text: '您此次就诊的主要不适是？',
      options: [
        { label: '视力下降', value: '视力下降', next: 'q2' },
        { label: '眼部不适（干涩/疼痛/异物感）', value: '眼部不适', next: 'q3' },
        { label: '视物模糊/变形', value: '视物模糊', next: 'q4' },
        { label: '其他', value: '其他', next: 'q5', allowCustom: true },
      ],
    },
    {
      id: 'q2',
      text: '视力下降持续多久？',
      options: [
        { label: '一周以内', value: '一周以内', next: 'q5' },
        { label: '一个月以内', value: '一个月以内', next: 'q5' },
        { label: '半年以内', value: '半年以内', next: 'q5' },
        { label: '半年以上', value: '半年以上', next: 'q5' },
        { label: '其他', value: '其他', next: 'q5', allowCustom: true },
      ],
    },
    {
      id: 'q3',
      text: '眼部不适的具体表现？',
      options: [
        { label: '干涩', value: '干涩', next: 'q5' },
        { label: '胀痛', value: '胀痛', next: 'q5' },
        { label: '异物感', value: '异物感', next: 'q5' },
        { label: '流泪', value: '流泪', next: 'q5' },
        { label: '其他', value: '其他', next: 'q5', allowCustom: true },
      ],
    },
    {
      id: 'q4',
      text: '视物模糊/变形出现频率？',
      options: [
        { label: '偶发', value: '偶发', next: 'q5' },
        { label: '经常', value: '经常', next: 'q5' },
        { label: '持续', value: '持续', next: 'q5' },
        { label: '其他', value: '其他', next: 'q5', allowCustom: true },
      ],
    },
    {
      id: 'q5',
      text: '是否伴随其他全身性疾病？',
      options: [
        { label: '无', value: '无', next: 'q6' },
        { label: '糖尿病', value: '糖尿病', next: 'q6' },
        { label: '高血压', value: '高血压', next: 'q6' },
        { label: '其他', value: '其他', next: 'q6', allowCustom: true },
      ],
    },
    {
      id: 'q6',
      text: '是否有过往眼病史或手术史？',
      options: [
        { label: '无', value: '无' }, // 不指定 next → 结束
        { label: '有（白内障/青光眼等）', value: '有眼病史', allowCustom: true },
        { label: '有手术史', value: '有手术史', allowCustom: true },
        { label: '其他', value: '其他', allowCustom: true },
      ],
    },
  ];

  // ---- 渲染主视图 ----
  async function render(container) {
    container.innerHTML = `
      <h2 class="section-title">病例登记</h2>
      <div class="card">
        <p class="text-sm text-muted mb-3">请选择登记方式</p>
        <div class="flex flex-wrap" style="gap:12px;">
          <button class="btn" id="goSimple">📝 简约登记</button>
          <button class="btn btn-secondary" id="goComplex">📋 复杂问卷登记</button>
        </div>
      </div>
      <div id="caseForm"></div>
    `;
    document.getElementById('goSimple').onclick = () => renderSimple(document.getElementById('caseForm'));
    document.getElementById('goComplex').onclick = () => renderComplex(document.getElementById('caseForm'));
  }

  // ---- 简约登记 ----
  function renderSimple(container) {
    const today = UI.todayStr();
    container.innerHTML = `
      <div class="card">
        <h3 class="subsection-title" style="margin-top:0;">简约登记</h3>
        <div class="form-grid">
          <div class="form-group"><label>姓名 <span class="req">*</span></label><input class="form-control" id="cName"></div>
          <div class="form-group">
            <label>性别</label>
            <select class="form-control" id="cGender">
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
          <div class="form-group"><label>手机号 <span class="req">*</span></label><input class="form-control" id="cPhone" maxlength="11"></div>
          <div class="form-group"><label>住址</label><input class="form-control" id="cAddr"></div>
          <div class="form-group">
            <label>登记人</label>
            <select class="form-control" id="cRegistrar">
              ${Member.REGISTRARS.map((r) => `<option value="${r}">${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>登记日期</label><input type="date" class="form-control" id="cDate" value="${today}"></div>
        </div>
        <div class="form-group"><label>病情 <span class="req">*</span></label><textarea class="form-control" id="cCond" placeholder="请描述病情..."></textarea></div>
        <div class="flex gap-sm mt-3">
          <button class="btn btn-success" id="cSave">保存</button>
          <button class="btn btn-outline" id="cCancel">取消</button>
        </div>
      </div>
    `;
    document.getElementById('cCancel').onclick = () => { container.innerHTML = ''; };
    document.getElementById('cSave').onclick = saveSimple;
  }

  async function saveSimple() {
    const name = document.getElementById('cName').value.trim();
    const phone = document.getElementById('cPhone').value.trim();
    const cond = document.getElementById('cCond').value.trim();
    if (!name || !phone) { return UI.toast('请填写姓名和手机号', 'error'); }
    if (!cond) { return UI.toast('请填写病情', 'error'); }
    if (!/^\d{11}$/.test(phone)) { return UI.toast('手机号需为 11 位', 'error'); }

    const customer = await Member.findOrCreateCustomer({ name, phone });
    const rec = {
      id: DB.genId(),
      customerId: customer.id,
      name,
      gender: document.getElementById('cGender').value,
      phone,
      address: document.getElementById('cAddr').value.trim(),
      condition: cond,
      registrar: document.getElementById('cRegistrar').value,
      date: document.getElementById('cDate').value || UI.todayStr(),
      type: 'simple',
    };
    await DB.put('cases', rec);
    UI.toast('病例已保存', 'success');
    UI.askGoPoints(customer.id);
  }

  // ---- 复杂问卷登记 ----
  // 状态：当前题目路径、答案
  let quizState = null;

  function renderComplex(container) {
    quizState = {
      basic: { name: '', phone: '', gender: '男', address: '', registrar: Member.REGISTRARS[0], date: UI.todayStr() },
      path: [],      // 已答题的 id 序列
      answers: {},   // { qId: { value, label, custom } }
      currentId: QUESTIONNAIRE[0].id,
    };
    renderQuizStep(container);
  }

  function renderQuizStep(container) {
    const q = QUESTIONNAIRE.find((x) => x.id === quizState.currentId);
    if (!q) return finishQuiz(container);

    const idx = quizState.path.length;
    const total = QUESTIONNAIRE.length;
    const progress = QUESTIONNAIRE.map((_, i) => {
      const cls = i < idx ? 'done' : (i === idx ? 'current' : '');
      return `<div class="step ${cls}"></div>`;
    }).join('');

    const prevAns = quizState.answers[q.id];
    const optionsHtml = q.options.map((o, i) => {
      const selected = prevAns && prevAns.value === o.value ? 'selected' : '';
      return `
        <div class="option-item ${selected}" data-idx="${i}">
          <input type="radio" name="opt" ${selected ? 'checked' : ''}>
          <span>${UI.escapeHtml(o.label)}</span>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card">
        <h3 class="subsection-title" style="margin-top:0;">复杂问卷登记</h3>
        <div class="quiz-progress">${progress}</div>

        <div class="form-grid mb-3" style="background:#f8fafc;padding:12px;border-radius:8px;">
          <div class="form-group" style="min-width:160px;"><label>姓名 <span class="req">*</span></label><input class="form-control" id="qzName" value="${UI.escapeHtml(quizState.basic.name)}"></div>
          <div class="form-group" style="min-width:120px;">
            <label>性别</label>
            <select class="form-control" id="qzGender">
              <option value="男" ${quizState.basic.gender === '男' ? 'selected' : ''}>男</option>
              <option value="女" ${quizState.basic.gender === '女' ? 'selected' : ''}>女</option>
            </select>
          </div>
          <div class="form-group" style="min-width:160px;"><label>手机号 <span class="req">*</span></label><input class="form-control" id="qzPhone" value="${UI.escapeHtml(quizState.basic.phone)}" maxlength="11"></div>
          <div class="form-group" style="min-width:200px;"><label>住址</label><input class="form-control" id="qzAddr" value="${UI.escapeHtml(quizState.basic.address)}"></div>
          <div class="form-group" style="min-width:140px;">
            <label>登记人</label>
            <select class="form-control" id="qzRegistrar">
              ${Member.REGISTRARS.map((r) => `<option value="${r}" ${quizState.basic.registrar === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="min-width:140px;"><label>登记日期</label><input type="date" class="form-control" id="qzDate" value="${quizState.basic.date}"></div>
        </div>

        <div class="question-card">
          <div class="question-num">第 ${idx + 1} 题 / 共 ${total} 题</div>
          <div class="question-text">${UI.escapeHtml(q.text)}</div>
          <div class="option-list">${optionsHtml}</div>
          <div class="custom-input hidden mt-3">
            <input type="text" class="form-control" id="qzCustom" placeholder="请输入其他内容">
          </div>
        </div>

        <div class="wizard-nav">
          <button class="btn btn-outline" id="qzBack" ${idx === 0 ? 'disabled' : ''}>‹ 上一题</button>
          <div class="spacer"></div>
          <button class="btn btn-ghost" id="qzCancel">取消</button>
          <button class="btn btn-success" id="qzNext">下一题 ›</button>
        </div>
      </div>
    `;

    // 同步基本信息到 state
    const syncBasic = () => {
      quizState.basic.name = document.getElementById('qzName').value.trim();
      quizState.basic.gender = document.getElementById('qzGender').value;
      quizState.basic.phone = document.getElementById('qzPhone').value.trim();
      quizState.basic.address = document.getElementById('qzAddr').value.trim();
      quizState.basic.registrar = document.getElementById('qzRegistrar').value;
      quizState.basic.date = document.getElementById('qzDate').value || UI.todayStr();
    };

    let selectedIdx = prevAns ? q.options.findIndex((o) => o.value === prevAns.value) : null;
    const customBox = container.querySelector('.custom-input');

    container.querySelectorAll('.option-item').forEach((el) => {
      el.onclick = () => {
        container.querySelectorAll('.option-item').forEach((x) => x.classList.remove('selected'));
        el.classList.add('selected');
        el.querySelector('input[type="radio"]').checked = true;
        selectedIdx = parseInt(el.dataset.idx);
        const opt = q.options[selectedIdx];
        if (opt.allowCustom) {
          customBox.classList.remove('hidden');
          const inp = document.getElementById('qzCustom');
          inp.value = prevAns && prevAns.custom ? prevAns.custom : '';
          inp.focus();
        } else {
          customBox.classList.add('hidden');
        }
      };
    });

    // 若已有答案且该选项允许自定义，显示自定义框
    if (prevAns) {
      const opt = q.options[selectedIdx];
      if (opt && opt.allowCustom) {
        customBox.classList.remove('hidden');
        document.getElementById('qzCustom').value = prevAns.custom || '';
      }
    }

    document.getElementById('qzBack').onclick = () => {
      syncBasic();
      if (quizState.path.length > 0) {
        // 回到上一道已答题（保留其答案以便预填/修改）
        quizState.currentId = quizState.path[quizState.path.length - 1];
        quizState.path.pop();
        renderQuizStep(container);
      }
    };

    document.getElementById('qzCancel').onclick = async () => {
      if (await UI.confirm('确认取消？已填内容将丢失。')) {
        quizState = null;
        App.navigate('case');
      }
    };

    document.getElementById('qzNext').onclick = () => {
      syncBasic();
      if (selectedIdx === null) { return UI.toast('请选择一个选项', 'warning'); }
      const opt = q.options[selectedIdx];
      let custom = '';
      if (opt.allowCustom) {
        custom = document.getElementById('qzCustom').value.trim();
        if (!custom) { return UI.toast('请输入「其他」内容', 'warning'); }
      }
      quizState.answers[q.id] = { value: opt.value, label: opt.label, custom };
      if (!quizState.path.includes(q.id)) quizState.path.push(q.id);

      // 校验基本信息（最后一题时）
      const isLast = !opt.next || !QUESTIONNAIRE.find((x) => x.id === opt.next);
      if (isLast) {
        if (!quizState.basic.name || !quizState.basic.phone) {
          return UI.toast('请填写姓名和手机号', 'warning');
        }
        if (!/^\d{11}$/.test(quizState.basic.phone)) {
          return UI.toast('手机号需为 11 位', 'warning');
        }
      }

      if (opt.next) {
        quizState.currentId = opt.next;
        renderQuizStep(container);
      } else {
        finishQuiz(container);
      }
    };
  }

  async function finishQuiz(container) {
    if (!quizState) return;
    const b = quizState.basic;
    const customer = await Member.findOrCreateCustomer({ name: b.name, phone: b.phone });
    const answersText = quizState.path.map((qid) => {
      const q = QUESTIONNAIRE.find((x) => x.id === qid);
      const a = quizState.answers[qid];
      if (!q || !a) return '';
      const val = a.custom ? `${a.label}（${a.custom}）` : a.label;
      return `${q.text}\n  → ${val}`;
    }).filter(Boolean).join('\n');

    const rec = {
      id: DB.genId(),
      customerId: customer.id,
      name: b.name,
      gender: b.gender,
      phone: b.phone,
      address: b.address,
      condition: answersText,
      registrar: b.registrar,
      date: b.date,
      type: 'complex',
      questionnaireData: {
        answers: quizState.answers,
        path: quizState.path,
      },
    };
    await DB.put('cases', rec);
    UI.toast('病例已保存', 'success');
    quizState = null;
    UI.askGoPoints(customer.id);
  }

  // ---- 病例详情 ----
  async function showDetail(caseId, returnToCustomerId) {
    const c = await DB.get('cases', caseId);
    if (!c) { UI.toast('未找到病例', 'error'); return; }

    const qa = c.questionnaireData && c.questionnaireData.answers
      ? Object.entries(c.questionnaireData.answers).map(([qid, a]) => {
          const q = QUESTIONNAIRE.find((x) => x.id === qid);
          const val = a.custom ? `${a.label}（${a.custom}）` : a.label;
          return `
            <div class="question-card" style="margin-bottom:8px;">
              <div class="question-num">${UI.escapeHtml(q ? q.text : qid)}</div>
              <div class="text-sm" style="font-weight:500;">${UI.escapeHtml(val)}</div>
            </div>
          `;
        }).join('')
      : '';

    const body = `
      <div class="detail-grid mb-3">
        <div class="detail-item"><label>姓名</label><span class="value">${UI.escapeHtml(c.name)}</span></div>
        <div class="detail-item"><label>性别</label><span class="value">${UI.escapeHtml(c.gender || '')}</span></div>
        <div class="detail-item"><label>手机号</label><span class="value">${UI.escapeHtml(c.phone)}</span></div>
        <div class="detail-item"><label>登记人</label><span class="value">${UI.escapeHtml(c.registrar || '')}</span></div>
        <div class="detail-item"><label>登记日期</label><span class="value">${UI.formatDate(c.date || c.createdAt)}</span></div>
        <div class="detail-item"><label>登记方式</label><span class="value">${c.type === 'complex' ? '复杂问卷' : '简约'}</span></div>
      </div>
      <div class="detail-item mb-3"><label>住址</label><span class="value">${UI.escapeHtml(c.address || '未填')}</span></div>
      ${qa ? `
        <h4 class="subsection-title">问卷回答</h4>
        ${qa}
      ` : `
        <h4 class="subsection-title">病情</h4>
        <div class="card" style="background:#f8fafc;box-shadow:none;white-space:pre-wrap;">${UI.escapeHtml(c.condition || '')}</div>
      `}
    `;

    UI.modal({
      title: '病例详情',
      body,
      size: 'large',
      footer: `
        ${returnToCustomerId ? `<button class="btn btn-outline" id="backToCustomer">返回客户</button>` : ''}
        <button class="btn btn-danger btn-outline" id="deleteCase">删除</button>
        <button class="btn" data-modal-close>关闭</button>
      `,
    });

    if (returnToCustomerId) {
      document.getElementById('backToCustomer').onclick = () => {
        UI.closeModal();
        Member.showCustomerDetail(returnToCustomerId);
      };
    }
    document.getElementById('deleteCase').onclick = async () => {
      if (await UI.confirm('确认删除此病例？此操作不可撤销。', { okText: '删除', okClass: 'btn btn-danger' })) {
        await DB.del('cases', caseId);
        UI.toast('已删除', 'success');
        UI.closeModal();
        if (returnToCustomerId) Member.showCustomerDetail(returnToCustomerId);
      }
    };
  }

  global.Case = { render, renderSimple, renderComplex, showDetail, QUESTIONNAIRE };
})(window);
