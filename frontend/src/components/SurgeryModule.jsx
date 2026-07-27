// 模块7：手术相关（6 个 tab 子表单）
// 移植自 repo2 complexCase.jsx 的 SurgeryForm 及其子组件，改用 React + Ant Design
//
// 数据结构（ans.surgery）：
// {
//   pre_op_note: { surgery_name, prep, prep_note, consent, recorder, record_time },
//   anesthesia_pre_assessment: { method, method_note, consciousness, consciousness_note, bp, heart_rate,
//     rhythm, rhythm_note, cardiopulmonary_history, cardiopulmonary_note, allergy_history, allergy_note,
//     difficulty, difficulty_note, conclusion, conclusion_note, recorder, record_time },
//   anesthesia_intra_record: { surgery_name, method, method_note, steps:[{time,action,detail}],
//     effect, effect_note, recorder, record_time },
//   surgical_record: { surgery_name, post_diagnosis, surgeon, assistant, surgery_time, method, method_note,
//     steps:[string], intra_assessment, intra_note, post_immediate, post_immediate_note, recorder },
//   anesthesia_post_note: { leave_state, leave_note, vitals_state, vitals_note,
//     discomfort, discomfort_note, recorder, record_time },
//   followup_visits: [{ id, visit_type, visit_type_note, symptoms, symptoms_note, vision_od, vision_os,
//     iop_od, iop_os, conjunctiva, cornea, ac, pupil, conclusion, conclusion_note, advice, advice_note,
//     recorder, record_date }]
// }
import React, { useState } from 'react';
import { Tabs, Form, Input, InputNumber, Radio, Select, Checkbox, Button, Space, Card, Divider, Typography, Row, Col } from 'antd';
import { PlusOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { SURGERY_TABS, ANESTHESIA_OPTIONS } from '@optical/shared/questionnaire.js';
import { useOperators } from '../api/operators.js';

const { Text, Title } = Typography;

// 当前时间字符串（年-月-日 时:分）
function nowTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function todayDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 通用：单选 + 备注输入（选中含"其他"/"（需说明）"时显示备注框）
function RadioNote({ options, value, note, onChange, onNote, noteTrigger }) {
  const showNote = noteTrigger
    ? noteTrigger(value)
    : /其他|（需说明）|需说明/.test(value || '');
  return (
    <div>
      <Radio.Group value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <Space direction="vertical">
          {options.map((o) => (
            <Radio key={o} value={o}>{o}</Radio>
          ))}
        </Space>
      </Radio.Group>
      {showNote && (
        <Input
          style={{ marginTop: 8, maxWidth: 480 }}
          placeholder="请说明"
          value={note || ''}
          onChange={(e) => onNote(e.target.value)}
        />
      )}
    </div>
  );
}

// 通用：多选 + "其他"文本
function MultiCheckField({ options, value, onChange }) {
  // value: string[]，"其他:xxx" 表示其他并带文本
  const checked = (value || []).map((v) => (v.startsWith('其他') ? '其他' : v));
  const otherText = (value || []).find((v) => v.startsWith('其他:'))?.replace('其他:', '') || '';
  const commit = (vals, otherT) => {
    const cleaned = vals.filter((v) => v !== '其他');
    if (vals.includes('其他') && (otherT || '').trim()) cleaned.push('其他:' + otherT.trim());
    else if (vals.includes('其他')) cleaned.push('其他');
    onChange(cleaned);
  };
  return (
    <div>
      <Checkbox.Group
        value={checked}
        onChange={(vals) => commit(vals, otherText)}
      >
        <Space direction="vertical" wrap>
          {options.map((o) => (
            <Checkbox key={o} value={o}>{o}</Checkbox>
          ))}
        </Space>
      </Checkbox.Group>
      {checked.includes('其他') && (
        <Input
          style={{ marginTop: 8, maxWidth: 480 }}
          placeholder="其他（请说明）"
          value={otherText}
          onChange={(e) => commit(checked, e.target.value)}
        />
      )}
    </div>
  );
}

// 记录人 + 记录时间行
function RecorderRow({ value, onChange, timeValue, onTime, onFillNow, fillLabel }) {
  const { operators, loading: opLoading } = useOperators();
  return (
    <Row gutter={12}>
      <Col>
        <Form.Item label="记录人">
          <Select
            style={{ width: 160 }}
            placeholder={opLoading ? '加载中...' : '选择记录人'}
            value={value || undefined}
            onChange={onChange}
            allowClear
          >
            {operators.map((op) => (
              <Select.Option key={op.id} value={op.name}>{op.name}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Col>
      <Col>
        <Form.Item label="记录时间">
          <Input
            style={{ width: 200 }}
            placeholder="年-月-日 时:分"
            value={timeValue || ''}
            onChange={(e) => onTime(e.target.value)}
          />
        </Form.Item>
      </Col>
      {onFillNow && (
        <Col style={{ display: 'flex', alignItems: 'center' }}>
          <Button size="small" icon={<ClockCircleOutlined />} onClick={onFillNow}>{fillLabel || '填入当前时间'}</Button>
        </Col>
      )}
    </Row>
  );
}

// ===== 8.1 术前记录 =====
function PreOpNote({ value, onChange, diagnosis, nowTimeFn }) {
  const v = value || {};
  const set = (k, val) => onChange({ ...v, [k]: val });
  return (
    <div>
      <Form layout="vertical">
        <Row gutter={12}>
          <Col span={12}>
            <Form.Item label="术前诊断（自动引用模块5）">
              <Input value={(diagnosis || []).join('、')} readOnly placeholder="自动引用模块5诊断结果" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="拟施手术名称">
              <Input value={v.surgery_name || ''} onChange={(e) => set('surgery_name', e.target.value)} />
            </Form.Item>
          </Col>
        </Row>
        <Divider orientation="left">术前准备情况</Divider>
        <RadioNote options={['已完善术前检查', '等待结果', '其他']} value={v.prep} note={v.prep_note}
          onChange={(val) => set('prep', val)} onNote={(t) => set('prep_note', t)} />
        <Divider orientation="left">患者/家属知情同意</Divider>
        <RadioNote options={['已签字', '未签字']} value={v.consent} note=""
          onChange={(val) => set('consent', val)} onNote={() => {}} noteTrigger={() => false} />
        <RecorderRow value={v.recorder} onChange={(val) => set('recorder', val)}
          timeValue={v.record_time} onTime={(t) => set('record_time', t)}
          onFillNow={() => set('record_time', nowTimeFn())} />
      </Form>
    </div>
  );
}

// ===== 8.2 麻醉术前评估 =====
function AnesPre({ value, onChange, nowTimeFn }) {
  const v = value || {};
  const set = (k, val) => onChange({ ...v, [k]: val });
  return (
    <Form layout="vertical">
      <Divider orientation="left">拟施麻醉方式</Divider>
      <RadioNote options={ANESTHESIA_OPTIONS} value={v.method} note={v.method_note}
        onChange={(val) => set('method', val)} onNote={(t) => set('method_note', t)} />
      <Divider orientation="left">患者意识状态</Divider>
      <RadioNote options={['清楚能配合', '欠配合', '其他']} value={v.consciousness} note={v.consciousness_note}
        onChange={(val) => set('consciousness', val)} onNote={(t) => set('consciousness_note', t)} />
      <Row gutter={12}>
        <Col span={6}><Form.Item label="血压"><Input value={v.bp || ''} onChange={(e) => set('bp', e.target.value)} placeholder="如 120/80" /></Form.Item></Col>
        <Col span={6}><Form.Item label="心率"><Input value={v.heart_rate || ''} onChange={(e) => set('heart_rate', e.target.value)} /></Form.Item></Col>
      </Row>
      <Divider orientation="left">心律</Divider>
      <RadioNote options={['齐', '不齐', '其他']} value={v.rhythm} note={v.rhythm_note}
        onChange={(val) => set('rhythm', val)} onNote={(t) => set('rhythm_note', t)} noteTrigger={(val) => val !== '齐'} />
      <Divider orientation="left">心肺疾病史</Divider>
      <RadioNote options={['无', '有（需说明）']} value={v.cardiopulmonary_history} note={v.cardiopulmonary_note}
        onChange={(val) => set('cardiopulmonary_history', val)} onNote={(t) => set('cardiopulmonary_note', t)} />
      <Divider orientation="left">药物过敏史</Divider>
      <RadioNote options={['无', '有（需说明）']} value={v.allergy_history} note={v.allergy_note}
        onChange={(val) => set('allergy_history', val)} onNote={(t) => set('allergy_note', t)} />
      <Divider orientation="left">手术难度预估</Divider>
      <RadioNote options={['常规', '复杂', '其他']} value={v.difficulty} note={v.difficulty_note}
        onChange={(val) => set('difficulty', val)} onNote={(t) => set('difficulty_note', t)} />
      <Divider orientation="left">评估结论</Divider>
      <RadioNote options={['适合该麻醉方式', '暂缓（需说明原因）']} value={v.conclusion} note={v.conclusion_note}
        onChange={(val) => set('conclusion', val)} onNote={(t) => set('conclusion_note', t)} />
      <RecorderRow value={v.recorder} onChange={(val) => set('recorder', val)}
        timeValue={v.record_time} onTime={(t) => set('record_time', t)}
        onFillNow={() => set('record_time', nowTimeFn())} />
    </Form>
  );
}

// ===== 8.3 麻醉记录（术中，步骤可增减） =====
function AnesIntra({ value, onChange, nowTimeFn }) {
  const v = value.steps ? value : { ...value, steps: [] };
  const set = (k, val) => onChange({ ...v, [k]: val });
  const setStep = (i, patch) => set('steps', v.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  return (
    <Form layout="vertical">
      <Form.Item label="手术名称">
        <Input value={v.surgery_name || ''} onChange={(e) => set('surgery_name', e.target.value)} />
      </Form.Item>
      <Divider orientation="left">麻醉方式</Divider>
      <RadioNote options={ANESTHESIA_OPTIONS} value={v.method} note={v.method_note}
        onChange={(val) => set('method', val)} onNote={(t) => set('method_note', t)} />
      <Divider orientation="left">操作过程（可添加步骤）</Divider>
      {v.steps.map((s, i) => (
        <Row key={i} gutter={8} style={{ marginBottom: 8 }} align="middle">
          <Col><Input style={{ width: 130 }} placeholder="时间" value={s.time || ''} onChange={(e) => setStep(i, { time: e.target.value })} /></Col>
          <Col>
            <Select style={{ width: 150 }} placeholder="操作" value={s.action || undefined} onChange={(val) => setStep(i, { action: val })}>
              <Select.Option value="滴麻醉药">滴麻醉药</Select.Option>
              <Select.Option value="置开睑器">置开睑器</Select.Option>
              <Select.Option value="其他">其他</Select.Option>
            </Select>
          </Col>
          <Col flex="auto"><Input placeholder="具体内容" value={s.detail || ''} onChange={(e) => setStep(i, { detail: e.target.value })} /></Col>
          <Col><Button danger size="small" icon={<DeleteOutlined />} onClick={() => set('steps', v.steps.filter((_, idx) => idx !== i))} /></Col>
        </Row>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => set('steps', [...v.steps, { time: '', action: '', detail: '' }])}>添加步骤</Button>
      <Divider orientation="left">麻醉效果评价</Divider>
      <RadioNote options={['满意', '一般', '不满意（需说明）']} value={v.effect} note={v.effect_note}
        onChange={(val) => set('effect', val)} onNote={(t) => set('effect_note', t)} />
      <RecorderRow value={v.recorder} onChange={(val) => set('recorder', val)}
        timeValue={v.record_time} onTime={(t) => set('record_time', t)}
        onFillNow={() => set('record_time', nowTimeFn())} />
    </Form>
  );
}

// ===== 8.4 手术记录 =====
function SurgicalRecord({ value, onChange, diagnosis, basic, nowTimeFn }) {
  const v = value.steps ? value : { ...value, steps: [] };
  const set = (k, val) => onChange({ ...v, [k]: val });
  const setStep = (i, text) => set('steps', v.steps.map((s, idx) => (idx === i ? text : s)));
  return (
    <Form layout="vertical">
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size="large">
          <Text><b>患者信息：</b>{basic?.customer_name || '-'} / {basic?.customer_gender || '-'}</Text>
          <Text><b>术前诊断：</b>{(diagnosis || []).join('、') || '（模块5未填写）'}</Text>
        </Space>
      </Card>
      <Row gutter={12}>
        <Col span={8}><Form.Item label="手术名称"><Input value={v.surgery_name || ''} onChange={(e) => set('surgery_name', e.target.value)} /></Form.Item></Col>
        <Col span={8}><Form.Item label="术后诊断"><Input value={v.post_diagnosis || ''} onChange={(e) => set('post_diagnosis', e.target.value)} /></Form.Item></Col>
      </Row>
      <Row gutter={12}>
        <Col span={6}><Form.Item label="手术者"><Input value={v.surgeon || ''} onChange={(e) => set('surgeon', e.target.value)} /></Form.Item></Col>
        <Col span={6}><Form.Item label="助手"><Input value={v.assistant || ''} onChange={(e) => set('assistant', e.target.value)} /></Form.Item></Col>
        <Col span={8}><Form.Item label="手术时间"><Input value={v.surgery_time || ''} onChange={(e) => set('surgery_time', e.target.value)} placeholder="年-月-日 时:分" /></Form.Item></Col>
      </Row>
      <Divider orientation="left">麻醉方式</Divider>
      <RadioNote options={ANESTHESIA_OPTIONS} value={v.method} note={v.method_note}
        onChange={(val) => set('method', val)} onNote={(t) => set('method_note', t)} />
      <Divider orientation="left">手术过程（可添加步骤）</Divider>
      {v.steps.map((s, i) => (
        <Row key={i} gutter={8} style={{ marginBottom: 8 }} align="middle">
          <Col style={{ minWidth: 28 }}><Text>{i + 1}.</Text></Col>
          <Col flex="auto"><Input placeholder="步骤描述" value={s} onChange={(e) => setStep(i, e.target.value)} /></Col>
          <Col><Button danger size="small" icon={<DeleteOutlined />} onClick={() => set('steps', v.steps.filter((_, idx) => idx !== i))} /></Col>
        </Row>
      ))}
      <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => set('steps', [...v.steps, ''])}>添加步骤</Button>
      <Divider orientation="left">术中情况评估</Divider>
      <RadioNote options={['顺利', '顺利伴轻微出血', '中转其他术式', '其他']} value={v.intra_assessment} note={v.intra_note}
        onChange={(val) => set('intra_assessment', val)} onNote={(t) => set('intra_note', t)} />
      <Divider orientation="left">术后即刻评估</Divider>
      <RadioNote options={['患者无不适', '有不适（需说明）']} value={v.post_immediate} note={v.post_immediate_note}
        onChange={(val) => set('post_immediate', val)} onNote={(t) => set('post_immediate_note', t)} />
      <RecorderRow value={v.recorder} onChange={(val) => set('recorder', val)}
        timeValue={v.record_time} onTime={(t) => set('record_time', t)} />
    </Form>
  );
}

// ===== 8.5 麻醉术后记录 =====
function AnesPost({ value, onChange, nowTimeFn }) {
  const v = value || {};
  const set = (k, val) => onChange({ ...v, [k]: val });
  return (
    <Form layout="vertical">
      <Divider orientation="left">离开手术室时状态</Divider>
      <RadioNote options={['意识清楚', '嗜睡', '其他']} value={v.leave_state} note={v.leave_note}
        onChange={(val) => set('leave_state', val)} onNote={(t) => set('leave_note', t)} />
      <Divider orientation="left">生命体征</Divider>
      <RadioNote options={['平稳', '异常（需说明）']} value={v.vitals_state} note={v.vitals_note}
        onChange={(val) => set('vitals_state', val)} onNote={(t) => set('vitals_note', t)} />
      <Divider orientation="left">特殊不适</Divider>
      <RadioNote options={['无', '有（需说明）']} value={v.discomfort} note={v.discomfort_note}
        onChange={(val) => set('discomfort', val)} onNote={(t) => set('discomfort_note', t)} />
      <RecorderRow value={v.recorder} onChange={(val) => set('recorder', val)}
        timeValue={v.record_time} onTime={(t) => set('record_time', t)}
        onFillNow={() => set('record_time', nowTimeFn())} />
    </Form>
  );
}

// ===== 8.6 术后复查/随访（可多次追加） =====
function FollowupVisits({ value, onChange }) {
  const list = value || [];
  const add = () => onChange([...list, { id: Date.now() }]);
  const setV = (i, patch) => onChange(list.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const { operators, loading: opLoading } = useOperators();
  return (
    <div>
      {list.length === 0 && <Text type="secondary">暂无随访记录</Text>}
      {list.map((v, i) => (
        <Card key={v.id || i} size="small" style={{ marginBottom: 12 }}
          title={`随访 #${i + 1}`}
          extra={<Button danger size="small" icon={<DeleteOutlined />} onClick={() => onChange(list.filter((_, idx) => idx !== i))}>删除本次</Button>}>
          <Form layout="vertical">
            <Divider orientation="left" plain>复查类型</Divider>
            <RadioNote options={['术后第1天', '第3天', '第7天', '1个月', '其他']} value={v.visit_type} note={v.visit_type_note}
              onChange={(val) => setV(i, { visit_type: val })} onNote={(t) => setV(i, { visit_type_note: t })} />
            <Divider orientation="left" plain>自诉症状</Divider>
            <RadioNote options={['无明显不适', '有不适（需说明）']} value={v.symptoms} note={v.symptoms_note}
              onChange={(val) => setV(i, { symptoms: val })} onNote={(t) => setV(i, { symptoms_note: t })} />
            <Row gutter={12}>
              <Col span={6}><Form.Item label="视力 OD"><Input value={v.vision_od || ''} onChange={(e) => setV(i, { vision_od: e.target.value })} /></Form.Item></Col>
              <Col span={6}><Form.Item label="视力 OS"><Input value={v.vision_os || ''} onChange={(e) => setV(i, { vision_os: e.target.value })} /></Form.Item></Col>
              <Col span={6}><Form.Item label="眼压 OD"><Input value={v.iop_od || ''} onChange={(e) => setV(i, { iop_od: e.target.value })} /></Form.Item></Col>
              <Col span={6}><Form.Item label="眼压 OS"><Input value={v.iop_os || ''} onChange={(e) => setV(i, { iop_os: e.target.value })} /></Form.Item></Col>
            </Row>
            <Row gutter={12}>
              <Col span={6}>
                <Form.Item label="结膜">
                  <Select value={v.conjunctiva || undefined} onChange={(val) => setV(i, { conjunctiva: val })} allowClear>
                    <Select.Option value="正常">正常</Select.Option><Select.Option value="充血">充血</Select.Option>
                    <Select.Option value="水肿">水肿</Select.Option><Select.Option value="其他">其他</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="角膜">
                  <Select value={v.cornea || undefined} onChange={(val) => setV(i, { cornea: val })} allowClear>
                    <Select.Option value="透明">透明</Select.Option><Select.Option value="水肿">水肿</Select.Option>
                    <Select.Option value="其他">其他</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="前房">
                  <Select value={v.ac || undefined} onChange={(val) => setV(i, { ac: val })} allowClear>
                    <Select.Option value="正常">正常</Select.Option><Select.Option value="浅">浅</Select.Option>
                    <Select.Option value="深">深</Select.Option><Select.Option value="其他">其他</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="瞳孔">
                  <Select value={v.pupil || undefined} onChange={(val) => setV(i, { pupil: val })} allowClear>
                    <Select.Option value="正常">正常</Select.Option><Select.Option value="散大">散大</Select.Option>
                    <Select.Option value="缩小">缩小</Select.Option><Select.Option value="其他">其他</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Divider orientation="left" plain>评估结论</Divider>
            <RadioNote options={['恢复良好', '需继续观察', '其他']} value={v.conclusion} note={v.conclusion_note}
              onChange={(val) => setV(i, { conclusion: val })} onNote={(t) => setV(i, { conclusion_note: t })} />
            <Divider orientation="left" plain>医嘱</Divider>
            <RadioNote options={['继续原用药', '调整用药（需说明）', '其他']} value={v.advice} note={v.advice_note}
              onChange={(val) => setV(i, { advice: val })} onNote={(t) => setV(i, { advice_note: t })} />
            <Row gutter={12} align="middle">
              <Col>
                <Form.Item label="记录人">
                  <Select style={{ width: 160 }} placeholder={opLoading ? '加载中...' : '选择记录人'} value={v.recorder || undefined} onChange={(val) => setV(i, { recorder: val })} allowClear>
                    {operators.map((op) => (<Select.Option key={op.id} value={op.name}>{op.name}</Select.Option>))}
                  </Select>
                </Form.Item>
              </Col>
              <Col>
                <Form.Item label="记录日期">
                  <Input style={{ width: 180 }} placeholder="年-月-日" value={v.record_date || ''} onChange={(e) => setV(i, { record_date: e.target.value })} />
                </Form.Item>
              </Col>
              <Col><Button size="small" onClick={() => setV(i, { record_date: todayDate() })}>填入今天</Button></Col>
            </Row>
          </Form>
        </Card>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={add}>添加随访记录</Button>
    </div>
  );
}

// ===== 手术相关主组件（6 tab） =====
export default function SurgeryModule({ value, onChange, diagnosis, basic, followupOnly }) {
  const [tab, setTab] = useState(followupOnly ? 'followup_visits' : 'pre_op_note');
  const s = value || {};
  const nowTimeFn = nowTime;
  const setSurgery = (key, val) => onChange(key, val);
  return (
    <div>
      {followupOnly && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          术后复查路径：已跳过模块2-6，直接记录随访。
        </Text>
      )}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={SURGERY_TABS.map(({ key, label }) => ({
          key,
          label,
          children: key === 'pre_op_note' ? (
            <PreOpNote value={s.pre_op_note || {}} onChange={(v) => setSurgery('pre_op_note', v)} diagnosis={diagnosis} nowTimeFn={nowTimeFn} />
          ) : key === 'anesthesia_pre_assessment' ? (
            <AnesPre value={s.anesthesia_pre_assessment || {}} onChange={(v) => setSurgery('anesthesia_pre_assessment', v)} nowTimeFn={nowTimeFn} />
          ) : key === 'anesthesia_intra_record' ? (
            <AnesIntra value={s.anesthesia_intra_record || { steps: [] }} onChange={(v) => setSurgery('anesthesia_intra_record', v)} nowTimeFn={nowTimeFn} />
          ) : key === 'surgical_record' ? (
            <SurgicalRecord value={s.surgical_record || { steps: [] }} onChange={(v) => setSurgery('surgical_record', v)} diagnosis={diagnosis} basic={basic} nowTimeFn={nowTimeFn} />
          ) : key === 'anesthesia_post_note' ? (
            <AnesPost value={s.anesthesia_post_note || {}} onChange={(v) => setSurgery('anesthesia_post_note', v)} nowTimeFn={nowTimeFn} />
          ) : key === 'followup_visits' ? (
            <FollowupVisits value={s.followup_visits || []} onChange={(v) => setSurgery('followup_visits', v)} />
          ) : null,
        }))}
      />
    </div>
  );
}
