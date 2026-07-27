// 病例详情展示
// - 简约模式：展示各字段
// - 复杂模式：7 模块数据（主诉病史/全身检查/眼科检查/特殊检查/初步诊断/治疗计划/手术相关）
//   兼容旧格式（answers 为问答数组）
import React, { useMemo } from 'react';
import { Descriptions, Tag, List, Typography, Empty, Divider, Table, Collapse, Space } from 'antd';
import { CASE_MODE } from '@optical/shared/constants.js';
import { EYE_EXAM_ITEMS, SURGERY_TABS } from '@optical/shared/questionnaire.js';

const { Text, Paragraph } = Typography;

// 安全解析 answers
function useAnswers(c) {
  return useMemo(() => {
    if (!c || c.mode !== CASE_MODE.COMPLEX) return null;
    let raw = c.answers;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return { _legacy: [], _raw: c.answers }; }
    }
    if (Array.isArray(raw)) return { _legacy: raw }; // 旧格式
    return raw;
  }, [c]);
}

export default function CaseDetail({ caseRecord }) {
  const c = caseRecord || {};
  const isComplex = c.mode === CASE_MODE.COMPLEX;
  const ans = useAnswers(c);

  // 简约模式
  if (!isComplex) {
    return (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="姓名">{c.customer_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="性别">{c.customer_gender || '-'}</Descriptions.Item>
        <Descriptions.Item label="手机号">{c.customer_phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="住址">{c.customer_address || '-'}</Descriptions.Item>
        <Descriptions.Item label="病情">{c.condition || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记日期">{c.record_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记人">{c.operator || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记门店">{c.store || '-'}</Descriptions.Item>
      </Descriptions>
    );
  }

  // 复杂模式 - 旧格式兼容
  if (ans && ans._legacy) {
    return (
      <div>
        <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label="模式"><Tag color="purple">复杂问卷</Tag></Descriptions.Item>
          <Descriptions.Item label="登记日期">{c.record_date || '-'}</Descriptions.Item>
          <Descriptions.Item label="登记人">{c.operator || '-'}</Descriptions.Item>
          <Descriptions.Item label="登记门店">{c.store || '-'}</Descriptions.Item>
        </Descriptions>
        <List
          bordered size="small"
          dataSource={ans._legacy}
          renderItem={(item, idx) => (
            <List.Item>
              <div style={{ width: '100%' }}>
                <Text strong>{idx + 1}. {item.questionText}</Text>
                <div style={{ marginTop: 4, paddingLeft: 12 }}>
                  <Tag color="blue">{item.selectedLabel}</Tag>
                  {item.otherText ? <Text type="secondary">（{item.otherText}）</Text> : null}
                </div>
              </div>
            </List.Item>
          )}
        />
      </div>
    );
  }

  // 复杂模式 - 新格式（7 模块）
  const a = ans || {};
  const intake = a.intake_answers || [];
  const vitals = a.vitals || {};
  const eyeExam = a.eye_exam || { od: {}, os: {} };
  const special = a.special_exam || {};
  const diagnosis = a.diagnosis || [];
  const treatment = a.treatment_plan || [];
  const surgery = a.surgery || {};

  return (
    <div>
      <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="姓名">{c.customer_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="性别">{c.customer_gender || '-'}</Descriptions.Item>
        <Descriptions.Item label="手机号">{c.customer_phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记日期">{c.record_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记人">{c.operator || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记门店">{c.store || '-'}</Descriptions.Item>
      </Descriptions>

      <Collapse
        defaultActiveKey={['m1']}
        items={[
          { key: 'm1', label: '模块1：主诉与病史', children: intake.length === 0 ? <Empty /> : (
            <List size="small" dataSource={intake} renderItem={(item, idx) => (
              <List.Item>
                <div>
                  <Text strong>{idx + 1}. {item.questionText}</Text>
                  <div style={{ marginTop: 4, paddingLeft: 12 }}>
                    <Tag color="blue">{item.selectedLabel}</Tag>
                    {item.otherText ? <Text type="secondary">（{item.otherText}）</Text> : null}
                  </div>
                </div>
              </List.Item>
            )} />
          )},
          { key: 'm2', label: '模块2：全身检查', children: (
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="体温 T (℃)">{vitals.T || '-'}</Descriptions.Item>
              <Descriptions.Item label="脉搏 P (次/分)">{vitals.P || '-'}</Descriptions.Item>
              <Descriptions.Item label="呼吸 R (次/分)">{vitals.R || '-'}</Descriptions.Item>
              <Descriptions.Item label="血压 BP">{vitals.BP || '-'}</Descriptions.Item>
              <Descriptions.Item label="全身情况" span={2}>
                {vitals.general || '-'}{vitals.generalNote ? `（${vitals.generalNote}）` : ''}
              </Descriptions.Item>
            </Descriptions>
          )},
          { key: 'm3', label: '模块3：眼科检查', children: (
            <Table size="small" pagination={false} bordered
              dataSource={EYE_EXAM_ITEMS.map((it) => ({ key: it, item: it,
                od: (eyeExam.od || {})[it], os: (eyeExam.os || {})[it] }))}
              columns={[
                { title: '检查项', dataIndex: 'item', width: 120 },
                { title: '右眼 OD', render: (_, r) => cellText(r.od) },
                { title: '左眼 OS', render: (_, r) => cellText(r.os) },
              ]}
            />
          )},
          { key: 'm4', label: '模块4：特殊检查', children: (
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="角膜曲率">{special.keratometry || '-'}</Descriptions.Item>
              <Descriptions.Item label="视野">{special.visual_field || '-'}</Descriptions.Item>
              <Descriptions.Item label="OCT" span={2}>{special.oct || '-'}</Descriptions.Item>
              <Descriptions.Item label="A超">{special.a_scan || '-'}</Descriptions.Item>
              <Descriptions.Item label="B超">{special.b_scan || '-'}</Descriptions.Item>
              <Descriptions.Item label="化验" span={2}>{special.lab || '-'}</Descriptions.Item>
            </Descriptions>
          )},
          { key: 'm5', label: '模块5：初步诊断', children: diagnosis.length === 0 ? <Empty /> : (
            <Space wrap>{diagnosis.map((d, i) => <Tag key={i} color="orange">{d}</Tag>)}</Space>
          )},
          { key: 'm6', label: '模块6：治疗计划', children: treatment.length === 0 ? <Empty /> : (
            <Space wrap>{treatment.map((d, i) => <Tag key={i} color="green">{d}</Tag>)}</Space>
          )},
          { key: 'm7', label: '模块7：手术相关', children: <SurgeryDetail surgery={surgery} diagnosis={diagnosis} /> },
        ]}
      />
    </div>
  );
}

function cellText(cell) {
  if (!cell || !cell.value) return '-';
  return cell.value + (cell.note ? `（${cell.note}）` : '');
}

// 手术相关详情展示（6 子模块）
function SurgeryDetail({ surgery, diagnosis }) {
  const s = surgery || {};
  const hasData = SURGERY_TABS.some(({ key }) => {
    const v = s[key];
    if (Array.isArray(v)) return v.length > 0;
    return v && Object.keys(v).length > 0;
  });
  if (!hasData) return <Empty description="无手术相关记录" />;

  const items = [];
  // 术前记录
  const pre = s.pre_op_note || {};
  if (Object.keys(pre).length) {
    items.push({ key: 'pre', label: '术前记录', children: (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="术前诊断">{(diagnosis || []).join('、') || '-'}</Descriptions.Item>
        <Descriptions.Item label="拟施手术">{pre.surgery_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="术前准备">{pre.prep || '-'}{pre.prep_note ? `（${pre.prep_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="知情同意">{pre.consent || '-'}</Descriptions.Item>
        <Descriptions.Item label="记录人/时间">{`${pre.recorder || '-'} / ${pre.record_time || '-'}`}</Descriptions.Item>
      </Descriptions>
    )});
  }
  // 麻醉术前评估
  const anesPre = s.anesthesia_pre_assessment || {};
  if (Object.keys(anesPre).length) {
    items.push({ key: 'anespre', label: '麻醉术前评估', children: (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="麻醉方式">{anesPre.method || '-'}{anesPre.method_note ? `（${anesPre.method_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="意识状态">{anesPre.consciousness || '-'}{anesPre.consciousness_note ? `（${anesPre.consciousness_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="血压/心率">{`${anesPre.bp || '-'} / ${anesPre.heart_rate || '-'}`}</Descriptions.Item>
        <Descriptions.Item label="心律">{anesPre.rhythm || '-'}{anesPre.rhythm_note ? `（${anesPre.rhythm_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="心肺病史">{anesPre.cardiopulmonary_history || '-'}{anesPre.cardiopulmonary_note ? `（${anesPre.cardiopulmonary_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="过敏史">{anesPre.allergy_history || '-'}{anesPre.allergy_note ? `（${anesPre.allergy_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="难度预估">{anesPre.difficulty || '-'}{anesPre.difficulty_note ? `（${anesPre.difficulty_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="评估结论">{anesPre.conclusion || '-'}{anesPre.conclusion_note ? `（${anesPre.conclusion_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="记录人/时间">{`${anesPre.recorder || '-'} / ${anesPre.record_time || '-'}`}</Descriptions.Item>
      </Descriptions>
    )});
  }
  // 麻醉术中记录
  const anesIntra = s.anesthesia_intra_record || {};
  if (Object.keys(anesIntra).length) {
    items.push({ key: 'anesintra', label: '麻醉记录(术中)', children: (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="手术名称">{anesIntra.surgery_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="麻醉方式">{anesIntra.method || '-'}{anesIntra.method_note ? `（${anesIntra.method_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="操作过程">
          {(anesIntra.steps || []).length === 0 ? '-' : (
            <List size="small" dataSource={anesIntra.steps} renderItem={(st, i) => (
              <List.Item>{i + 1}. {st.time || '-'} / {st.action || '-'} / {st.detail || '-'}</List.Item>
            )} />
          )}
        </Descriptions.Item>
        <Descriptions.Item label="效果评价">{anesIntra.effect || '-'}{anesIntra.effect_note ? `（${anesIntra.effect_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="记录人/时间">{`${anesIntra.recorder || '-'} / ${anesIntra.record_time || '-'}`}</Descriptions.Item>
      </Descriptions>
    )});
  }
  // 手术记录
  const surgical = s.surgical_record || {};
  if (Object.keys(surgical).length) {
    items.push({ key: 'surgical', label: '手术记录', children: (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="手术名称">{surgical.surgery_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="术后诊断">{surgical.post_diagnosis || '-'}</Descriptions.Item>
        <Descriptions.Item label="手术者/助手">{`${surgical.surgeon || '-'} / ${surgical.assistant || '-'}`}</Descriptions.Item>
        <Descriptions.Item label="手术时间">{surgical.surgery_time || '-'}</Descriptions.Item>
        <Descriptions.Item label="麻醉方式">{surgical.method || '-'}{surgical.method_note ? `（${surgical.method_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="手术过程">
          {(surgical.steps || []).length === 0 ? '-' : (
            <List size="small" dataSource={surgical.steps} renderItem={(st, i) => (
              <List.Item>{i + 1}. {st}</List.Item>
            )} />
          )}
        </Descriptions.Item>
        <Descriptions.Item label="术中情况">{surgical.intra_assessment || '-'}{surgical.intra_note ? `（${surgical.intra_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="术后即刻">{surgical.post_immediate || '-'}{surgical.post_immediate_note ? `（${surgical.post_immediate_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="记录人">{surgical.recorder || '-'}</Descriptions.Item>
      </Descriptions>
    )});
  }
  // 麻醉术后记录
  const anesPost = s.anesthesia_post_note || {};
  if (Object.keys(anesPost).length) {
    items.push({ key: 'anespost', label: '麻醉术后记录', children: (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="离开时状态">{anesPost.leave_state || '-'}{anesPost.leave_note ? `（${anesPost.leave_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="生命体征">{anesPost.vitals_state || '-'}{anesPost.vitals_note ? `（${anesPost.vitals_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="特殊不适">{anesPost.discomfort || '-'}{anesPost.discomfort_note ? `（${anesPost.discomfort_note}）` : ''}</Descriptions.Item>
        <Descriptions.Item label="记录人/时间">{`${anesPost.recorder || '-'} / ${anesPost.record_time || '-'}`}</Descriptions.Item>
      </Descriptions>
    )});
  }
  // 术后随访
  const followups = s.followup_visits || [];
  if (followups.length > 0) {
    items.push({ key: 'followup', label: `术后随访（${followups.length}次）`, children: (
      <Space direction="vertical" style={{ width: '100%' }}>
        {followups.map((v, i) => (
          <Descriptions key={i} size="small" column={2} bordered title={`随访 #${i + 1}`}>
            <Descriptions.Item label="复查类型">{v.visit_type || '-'}{v.visit_type_note ? `（${v.visit_type_note}）` : ''}</Descriptions.Item>
            <Descriptions.Item label="症状">{v.symptoms || '-'}{v.symptoms_note ? `（${v.symptoms_note}）` : ''}</Descriptions.Item>
            <Descriptions.Item label="视力 OD/OS">{`${v.vision_od || '-'} / ${v.vision_os || '-'}`}</Descriptions.Item>
            <Descriptions.Item label="眼压 OD/OS">{`${v.iop_od || '-'} / ${v.iop_os || '-'}`}</Descriptions.Item>
            <Descriptions.Item label="结膜">{v.conjunctiva || '-'}</Descriptions.Item>
            <Descriptions.Item label="角膜">{v.cornea || '-'}</Descriptions.Item>
            <Descriptions.Item label="前房">{v.ac || '-'}</Descriptions.Item>
            <Descriptions.Item label="瞳孔">{v.pupil || '-'}</Descriptions.Item>
            <Descriptions.Item label="评估结论">{v.conclusion || '-'}{v.conclusion_note ? `（${v.conclusion_note}）` : ''}</Descriptions.Item>
            <Descriptions.Item label="医嘱">{v.advice || '-'}{v.advice_note ? `（${v.advice_note}）` : ''}</Descriptions.Item>
            <Descriptions.Item label="记录人/日期" span={2}>{`${v.recorder || '-'} / ${v.record_date || '-'}`}</Descriptions.Item>
          </Descriptions>
        ))}
      </Space>
    )});
  }

  return items.length === 0 ? <Empty /> : <Collapse size="small" items={items} />;
}
