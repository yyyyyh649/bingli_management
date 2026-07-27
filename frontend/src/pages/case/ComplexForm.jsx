// 复杂病例登记：7 模块步骤器
// 模块1: 基本信息 + 主诉与病史（分支问卷引擎，可跳模块2或直达模块7随访）
// 模块2: 全身检查 / 模块3: 眼科检查 / 模块4: 特殊检查
// 模块5: 初步诊断 / 模块6: 治疗计划 / 模块7: 手术相关（6 tab）
//
// 数据结构 ans（存入 cases.answers，JSON 字符串）：
// { intake_answers, vitals, eye_exam:{od,os}, special_exam, diagnosis, treatment_plan, surgery:{...} }
// 见 shared/questionnaire.js 的 INITIAL_COMPLEX_ANSWERS
import React, { useState, useMemo, useCallback } from 'react';
import {
  Card, Form, Input, Radio, DatePicker, Button, Space, message,
  Steps, List, Tag, Typography, Empty, Select, Checkbox, Row, Col, Divider, InputNumber,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { createCase } from '../../api/cases.js';
import { useOperators } from '../../api/operators.js';
import {
  DEFAULT_QUESTIONNAIRE, findQuestion, nextQuestionId, EXIT_TARGET,
  MODULE_NAMES, EYE_EXAM_ITEMS, DIAGNOSIS_OPTIONS, TREATMENT_OPTIONS,
  INITIAL_COMPLEX_ANSWERS,
} from '@optical/shared/questionnaire.js';
import { CASE_MODE } from '@optical/shared/constants.js';
import SurgeryModule from '../../components/SurgeryModule.jsx';

const { Text, Title } = Typography;

export default function CaseComplexForm() {
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();

  // 7 模块步骤：0=基本信息+模块1问卷 ... 6=模块7手术相关
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  // SURGERY_FOLLOWUP 直达模块7随访（跳过模块2-6）
  const [followupOnly, setFollowupOnly] = useState(false);
  const [saved, setSaved] = useState(null);

  // 基本信息
  const [basic, setBasic] = useState({
    customer_name: '', customer_gender: '', customer_phone: '', customer_address: '',
    operator: '', record_date: dayjs().format('YYYY-MM-DD'),
  });

  // 完整 answers（7 模块数据）
  const [ans, setAns] = useState(INITIAL_COMPLEX_ANSWERS);

  // ===== 问卷引擎状态（模块1） =====
  const [history, setHistory] = useState([]); // 已答历史
  const [currentId, setCurrentId] = useState(DEFAULT_QUESTIONNAIRE[0]?.id || null);
  const [pendingOption, setPendingOption] = useState(null);
  const [pendingOthers, setPendingOthers] = useState({}); // {label: text} 多选时各"其他"文本
  const [otherText, setOtherText] = useState(''); // 单选"其他"文本

  const currentQuestion = useMemo(() => findQuestion(DEFAULT_QUESTIONNAIRE, currentId), [currentId]);
  const intakeFinished = currentId === null || currentId === EXIT_TARGET.MODULE_2 || currentId === EXIT_TARGET.SURGERY_FOLLOWUP;

  const goto = useCallback((s) => {
    setStep(s);
    setMaxStep((m) => Math.max(m, s));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // 问卷完成后的跳转
  const onIntakeFinish = useCallback((answers, exitTarget) => {
    setAns((a) => ({ ...a, intake_answers: answers }));
    if (exitTarget === EXIT_TARGET.SURGERY_FOLLOWUP) {
      setFollowupOnly(true);
      goto(6);
    } else {
      goto(1);
    }
  }, [goto]);

  // 确认当前题答案并跳转下一题
  const goNext = () => {
    if (!currentQuestion) return;
    if (currentQuestion.multiSelect) {
      if (!pendingOption || pendingOption.length === 0) { message.warning('请至少选择一个选项'); return; }
      const answer = {
        questionId: currentQuestion.id,
        questionText: currentQuestion.text,
        selectedLabel: pendingOption.join('、'),
      };
      const otherLabel = pendingOption.find((l) => l === '其他');
      if (otherLabel && pendingOthers['其他']) answer.otherText = pendingOthers['其他'];
      const truncateIdx = history.findIndex((h) => h.questionId === currentQuestion.id);
      const baseHistory = truncateIdx >= 0 ? history.slice(0, truncateIdx) : history;
      const newHistory = [...baseHistory, answer];
      setHistory(newHistory);
      const nextId = currentQuestion.next ?? nextQuestionId(DEFAULT_QUESTIONNAIRE, currentId, { next: currentQuestion.next });
      setCurrentId(nextId);
      setPendingOption(null);
      setPendingOthers({});
      // 问卷结束/特殊跳转
      if (nextId === null || nextId === EXIT_TARGET.MODULE_2 || nextId === EXIT_TARGET.SURGERY_FOLLOWUP) {
        onIntakeFinish(newHistory, nextId);
      }
      return;
    }
    // 单选
    if (!pendingOption) { message.warning('请选择一个选项'); return; }
    if (pendingOption.isOther && !otherText.trim()) { message.warning('请填写"其他"的具体内容'); return; }
    const answer = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.text,
      selectedLabel: pendingOption.label,
    };
    if (pendingOption.isOther) answer.otherText = otherText.trim();
    if (pendingOption.isFreeTextFollow) {
      // isFreeTextFollow 的补充说明复用 otherText
      if (otherText.trim()) answer.otherText = otherText.trim();
    }
    const truncateIdx = history.findIndex((h) => h.questionId === currentQuestion.id);
    const baseHistory = truncateIdx >= 0 ? history.slice(0, truncateIdx) : history;
    const newHistory = [...baseHistory, answer];
    setHistory(newHistory);
    const nextId = nextQuestionId(DEFAULT_QUESTIONNAIRE, currentId, pendingOption);
    setCurrentId(nextId);
    setPendingOption(null);
    setOtherText('');
    if (nextId === null || nextId === EXIT_TARGET.MODULE_2 || nextId === EXIT_TARGET.SURGERY_FOLLOWUP) {
      onIntakeFinish(newHistory, nextId);
    }
  };

  // 回退到某题
  const goBackTo = (index) => {
    const target = history[index];
    if (!target) return;
    setHistory(history.slice(0, index));
    setCurrentId(target.questionId);
    setPendingOption(null);
    setOtherText('');
    setPendingOthers({});
  };

  // ===== 子模块数据 setter =====
  const setSub = (key, val) => setAns((a) => ({ ...a, [key]: val }));
  const setSurgery = (key, val) => setAns((a) => ({ ...a, surgery: { ...a.surgery, [key]: val } }));

  const basicOk = basic.customer_name && basic.customer_gender && basic.customer_phone && basic.customer_address;

  // ===== 提交病例 =====
  const [submitting, setSubmitting] = useState(false);
  const save = async () => {
    if (!basic.customer_name) { message.warning('请填写患者姓名'); return; }
    setSubmitting(true);
    try {
      await createCase({
        mode: CASE_MODE.COMPLEX,
        customerName: basic.customer_name,
        customerGender: basic.customer_gender,
        customerPhone: basic.customer_phone,
        customerAddress: basic.customer_address,
        answers: JSON.stringify(ans),
        recordDate: basic.record_date || dayjs().format('YYYY-MM-DD'),
        operator: basic.operator,
      });
      message.success('复杂病例已保存');
      if (basic.customer_phone) setSaved({ phone: basic.customer_phone });
      else navigate('/case');
    } catch (e) {
      // 拦截器已提示
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 渲染 =====
  return (
    <Card title="复杂病例登记">
      <Steps
        size="small"
        current={step}
        style={{ marginBottom: 16 }}
        items={MODULE_NAMES.map((n, i) => ({
          title: `${i + 1}.${n}`,
          status: i < step ? 'finish' : i === step ? 'process' : (i <= maxStep || (followupOnly && i === 6)) ? 'wait' : 'wait',
        }))}
      />

      {/* 步骤切换条（可点击已解锁的步骤） */}
      <Space wrap style={{ marginBottom: 16 }}>
        {MODULE_NAMES.map((n, i) => (
          <Button
            key={i}
            size="small"
            type={step === i ? 'primary' : 'default'}
            disabled={i > maxStep && !(followupOnly && i === 6)}
            onClick={() => goto(i)}
          >
            {i + 1}.{n}
          </Button>
        ))}
      </Space>

      {/* 模块1：基本信息 + 问卷 */}
      {step === 0 && (
        <div>
          <Divider orientation="left">患者基本信息</Divider>
          <Form layout="vertical">
            <Row gutter={12}>
              <Col span={6}>
                <Form.Item label="姓名" required>
                  <Input value={basic.customer_name} onChange={(e) => setBasic({ ...basic, customer_name: e.target.value })} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="性别" required>
                  <Select value={basic.customer_gender || undefined} onChange={(v) => setBasic({ ...basic, customer_gender: v })} allowClear>
                    <Select.Option value="男">男</Select.Option>
                    <Select.Option value="女">女</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="手机号"
                  required
                  validateStatus={
                    !basic.customer_phone ? ''
                    : /^1\d{10}$/.test(basic.customer_phone) ? 'success'
                    : 'error'
                  }
                  help={
                    !basic.customer_phone ? ''
                    : /^1\d{10}$/.test(basic.customer_phone) ? ''
                    : '手机号需为 11 位数字'
                  }
                >
                  <Input
                    value={basic.customer_phone}
                    onChange={(e) => setBasic({ ...basic, customer_phone: e.target.value })}
                    maxLength={11}
                    placeholder="11 位手机号"
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="住址" required>
                  <Input value={basic.customer_address} onChange={(e) => setBasic({ ...basic, customer_address: e.target.value })} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={6}>
                <Form.Item label="登记日期">
                  <Input value={basic.record_date} onChange={(e) => setBasic({ ...basic, record_date: e.target.value })} placeholder="YYYY-MM-DD" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="登记人">
                  <Select placeholder={opLoading ? '加载中...' : '请选择登记人'} value={basic.operator || undefined} onChange={(v) => setBasic({ ...basic, operator: v })} allowClear>
                    {operators.map((op) => (<Select.Option key={op.id} value={op.name}>{op.name}</Select.Option>))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </Form>

          {!basicOk && <Text type="secondary">填写完整基本信息后开始问卷</Text>}
          {basicOk && (
            <div style={{ marginTop: 16 }}>
              <Divider orientation="left">模块1：主诉与病史（逐题作答）</Divider>
              {/* 已答历史 */}
              {history.length > 0 && (
                <Card size="small" title="已答记录（点击可回退）" style={{ marginBottom: 12, background: '#fafafa' }}>
                  <List size="small" dataSource={history} renderItem={(item, idx) => (
                    <List.Item actions={[<Button type="link" size="small" onClick={() => goBackTo(idx)}>回退</Button>]}>
                      <div>
                        <Text strong>{idx + 1}. {item.questionText}</Text>
                        <div style={{ marginTop: 4 }}><Tag color="blue">{item.selectedLabel}</Tag>{item.otherText ? <Text type="secondary">（{item.otherText}）</Text> : null}</div>
                      </div>
                    </List.Item>
                  )} />
                </Card>
              )}
              {/* 当前题 */}
              {!intakeFinished && currentQuestion && (
                <div style={{ marginBottom: 24 }}>
                  <Title level={5}>{currentQuestion.text}</Title>
                  {currentQuestion.multiSelect ? (
                    <Checkbox.Group
                      value={pendingOption || []}
                      onChange={(vals) => setPendingOption(vals)}
                    >
                      <Space direction="vertical">
                        {currentQuestion.options.map((opt) => (
                          <Checkbox key={opt.label} value={opt.label}>{opt.label}{opt.isOther ? '（请补充说明）' : ''}</Checkbox>
                        ))}
                      </Space>
                    </Checkbox.Group>
                  ) : (
                    <Radio.Group
                      value={pendingOption?.label}
                      onChange={(e) => {
                        const opt = currentQuestion.options.find((o) => o.label === e.target.value);
                        setPendingOption(opt);
                        if (opt?.isOther || opt?.isFreeTextFollow) setOtherText('');
                      }}
                    >
                      <Space direction="vertical">
                        {currentQuestion.options.map((opt) => (
                          <Radio key={opt.label} value={opt.label}>{opt.label}{opt.isOther ? '（请补充说明）' : ''}</Radio>
                        ))}
                      </Space>
                    </Radio.Group>
                  )}
                  {/* "其他"或 isFreeTextFollow 的补充输入 */}
                  {(pendingOption?.isOther || pendingOption?.isFreeTextFollow) && (
                    <div style={{ marginTop: 12, maxWidth: 480 }}>
                      <Input placeholder="请输入具体内容" value={otherText} onChange={(e) => setOtherText(e.target.value)} onPressEnter={goNext} />
                    </div>
                  )}
                  {/* 多选"其他"的补充输入 */}
                  {currentQuestion.multiSelect && pendingOption?.includes('其他') && (
                    <div style={{ marginTop: 12, maxWidth: 480 }}>
                      <Input placeholder="其他（请说明）" value={pendingOthers['其他'] || ''} onChange={(e) => setPendingOthers({ ...pendingOthers, '其他': e.target.value })} />
                    </div>
                  )}
                  <div style={{ marginTop: 16 }}>
                    <Button type="primary" onClick={goNext} disabled={!pendingOption || (Array.isArray(pendingOption) && pendingOption.length === 0)}>
                      下一步
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <Button onClick={() => navigate('/case')}>返回</Button>
          </div>
        </div>
      )}

      {/* 模块2：全身检查 */}
      {step === 1 && <VitalsForm value={ans.vitals} onChange={(v) => setSub('vitals', v)} />}

      {/* 模块3：眼科检查 */}
      {step === 2 && <EyeExamForm value={ans.eye_exam} onChange={(v) => setSub('eye_exam', v)} />}

      {/* 模块4：特殊检查 */}
      {step === 3 && <SpecialExamForm value={ans.special_exam} onChange={(v) => setSub('special_exam', v)} />}

      {/* 模块5：初步诊断 */}
      {step === 4 && <DiagnosisForm value={ans.diagnosis} onChange={(v) => setSub('diagnosis', v)} />}

      {/* 模块6：治疗计划 */}
      {step === 5 && <TreatmentForm value={ans.treatment_plan} onChange={(v) => setSub('treatment_plan', v)} />}

      {/* 模块7：手术相关 */}
      {step === 6 && (
        <SurgeryModule
          value={ans.surgery}
          onChange={setSurgery}
          diagnosis={ans.diagnosis}
          basic={basic}
          followupOnly={followupOnly}
        />
      )}

      {/* 导航按钮（模块2-7） */}
      {step > 0 && (
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={() => goto(followupOnly ? 6 : step - 1)}>← 上一模块</Button>
          <Space>
            <Button type="primary" onClick={save} loading={submitting}>保存病例</Button>
            {step < 6 && !followupOnly && <Button type="primary" onClick={() => goto(step + 1)}>下一模块 →</Button>}
          </Space>
        </div>
      )}

      {/* 保存成功提示 */}
      {saved && (
        <Card size="small" style={{ marginTop: 16 }}>
          <Text>病例已保存。是否前往该客户的积分页面？</Text>
          <Space style={{ marginLeft: 16 }}>
            <Button type="primary" onClick={() => navigate(`/customer/${encodeURIComponent(saved.phone)}`)}>是，前往</Button>
            <Button onClick={() => navigate('/case')}>否</Button>
          </Space>
        </Card>
      )}
    </Card>
  );
}

// ===== 模块2：全身检查 =====
function VitalsForm({ value, onChange }) {
  const v = value || {};
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  const showGeneralNote = /其他|（需说明）|需说明/.test(v.general || '');
  return (
    <div>
      <Divider orientation="left">模块2：全身检查</Divider>
      <Form layout="vertical">
        <Row gutter={12}>
          <Col span={6}><Form.Item label="体温 T (℃)"><Input value={v.T || ''} onChange={set('T')} /></Form.Item></Col>
          <Col span={6}><Form.Item label="脉搏 P (次/分)"><Input value={v.P || ''} onChange={set('P')} /></Form.Item></Col>
          <Col span={6}><Form.Item label="呼吸 R (次/分)"><Input value={v.R || ''} onChange={set('R')} /></Form.Item></Col>
          <Col span={6}><Form.Item label="血压 BP (mmHg)"><Input value={v.BP || ''} onChange={set('BP')} placeholder="如 120/80" /></Form.Item></Col>
        </Row>
        <Divider orientation="left">全身情况</Divider>
        <Radio.Group value={v.general || ''} onChange={(e) => onChange({ ...v, general: e.target.value })}>
          <Space direction="vertical">
            <Radio value="良好无异常">良好无异常</Radio>
            <Radio value="有异常（需说明）">有异常（需说明）</Radio>
          </Space>
        </Radio.Group>
        {showGeneralNote && (
          <Input style={{ marginTop: 8, maxWidth: 480 }} placeholder="说明" value={v.generalNote || ''} onChange={set('generalNote')} />
        )}
      </Form>
    </div>
  );
}

// ===== 模块3：眼科检查（13项 × OD/OS） =====
function EyeExamForm({ value, onChange }) {
  const ee = value || { od: {}, os: {} };
  const setCell = (eye, item, patch) => {
    const cell = { ...(ee[eye][item] || {}), ...patch };
    onChange({ ...ee, [eye]: { ...ee[eye], [item]: cell } });
  };
  const renderCell = (eye, item) => {
    const cell = ee[eye][item] || {};
    return (
      <div>
        <Input
          value={cell.value || ''}
          onChange={(e) => setCell(eye, item, { value: e.target.value })}
          placeholder="（--）"
        />
        {cell.value === '其他' && (
          <Input style={{ marginTop: 4 }} value={cell.note || ''} onChange={(e) => setCell(eye, item, { note: e.target.value })} placeholder="说明" />
        )}
      </div>
    );
  };
  return (
    <div>
      <Divider orientation="left">模块3：眼科检查（左右眼对照）</Divider>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>检查项</th>
            <th style={{ ...thStyle, width: '42%' }}>右眼 OD</th>
            <th style={{ ...thStyle, width: '42%' }}>左眼 OS</th>
          </tr>
        </thead>
        <tbody>
          {EYE_EXAM_ITEMS.map((item) => (
            <tr key={item}>
              <td style={tdStyle}><b>{item}</b></td>
              <td style={tdStyle}>{renderCell('od', item)}</td>
              <td style={tdStyle}>{renderCell('os', item)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const thStyle = { border: '1px solid #d9d9d9', padding: '6px 8px', background: '#fafafa', textAlign: 'left' };
const tdStyle = { border: '1px solid #d9d9d9', padding: '6px 8px', verticalAlign: 'top' };

// ===== 模块4：特殊检查 =====
function SpecialExamForm({ value, onChange }) {
  const v = value || {};
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  return (
    <div>
      <Divider orientation="left">模块4：特殊检查</Divider>
      <Form layout="vertical">
        <Row gutter={12}>
          <Col span={12}><Form.Item label="角膜曲率 (K1/K2)"><Input value={v.keratometry || ''} onChange={set('keratometry')} /></Form.Item></Col>
          <Col span={12}><Form.Item label="视野"><Input value={v.visual_field || ''} onChange={set('visual_field')} /></Form.Item></Col>
        </Row>
        <Form.Item label="OCT 所见"><Input.TextArea value={v.oct || ''} onChange={set('oct')} /></Form.Item>
        <Row gutter={12}>
          <Col span={8}><Form.Item label="A超 所见"><Input value={v.a_scan || ''} onChange={set('a_scan')} /></Form.Item></Col>
          <Col span={8}><Form.Item label="B超 所见"><Input value={v.b_scan || ''} onChange={set('b_scan')} /></Form.Item></Col>
          <Col span={8}><Form.Item label="化验结果"><Input value={v.lab || ''} onChange={set('lab')} /></Form.Item></Col>
        </Row>
      </Form>
    </div>
  );
}

// ===== 模块5：初步诊断（多选） =====
function DiagnosisForm({ value, onChange }) {
  const [other, setOther] = useState('');
  const list = value || [];
  const checked = list.map((v) => (v.startsWith('其他') ? '其他' : v));
  const commit = (vals, otherText) => {
    const cleaned = vals.filter((v) => v !== '其他');
    if (vals.includes('其他') && (otherText || '').trim()) cleaned.push('其他:' + otherText.trim());
    else if (vals.includes('其他')) cleaned.push('其他');
    onChange(cleaned);
  };
  return (
    <div>
      <Divider orientation="left">模块5：初步诊断（可多选）</Divider>
      <Checkbox.Group value={checked} onChange={(vals) => commit(vals, other)}>
        <Space direction="vertical" wrap>
          {DIAGNOSIS_OPTIONS.map((o) => (<Checkbox key={o} value={o}>{o}</Checkbox>))}
        </Space>
      </Checkbox.Group>
      {checked.includes('其他') && (
        <Input style={{ marginTop: 8, maxWidth: 480 }} placeholder="其他（请说明）" value={other} onChange={(e) => { setOther(e.target.value); commit(checked, e.target.value); }} />
      )}
      <div style={{ marginTop: 8 }}><Text type="secondary">诊断清单为占位内容，正式清单确认后可配置替换。</Text></div>
    </div>
  );
}

// ===== 模块6：治疗计划（多选） =====
function TreatmentForm({ value, onChange }) {
  const [other, setOther] = useState('');
  const list = value || [];
  const checked = list.map((v) => (v.startsWith('其他') ? '其他' : v));
  const commit = (vals, otherText) => {
    const cleaned = vals.filter((v) => v !== '其他');
    if (vals.includes('其他') && (otherText || '').trim()) cleaned.push('其他:' + otherText.trim());
    else if (vals.includes('其他')) cleaned.push('其他');
    onChange(cleaned);
  };
  return (
    <div>
      <Divider orientation="left">模块6：治疗计划（可多选）</Divider>
      <Checkbox.Group value={checked} onChange={(vals) => commit(vals, other)}>
        <Space direction="vertical" wrap>
          {TREATMENT_OPTIONS.map((o) => (<Checkbox key={o} value={o}>{o}</Checkbox>))}
        </Space>
      </Checkbox.Group>
      {checked.includes('其他') && (
        <Input style={{ marginTop: 8, maxWidth: 480 }} placeholder="其他（请说明）" value={other} onChange={(e) => { setOther(e.target.value); commit(checked, e.target.value); }} />
      )}
    </div>
  );
}
