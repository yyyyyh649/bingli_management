// 复杂病例问卷配置 + 模块2-7 常量
//
// 设计原则：
//  - 通用 JSON 配置驱动，分支跳转逻辑不写死在业务代码中
//  - 每题 options 数组，每项可包含：
//      label           选项文字
//      next            下一题 id；null 表示问卷结束；
//                      'MODULE_2' 表示进模块2（全身检查）；
//                      'SURGERY_FOLLOWUP' 表示直达模块7（手术相关→术后随访）
//      isOther         true 表示"其他"选项，作答时可自由输入文本
//      isFreeTextFollow true 表示该选项需补充自由文本（如"有（需说明）"）
//      multiSelect     （题目级）true 表示多选
//  - 作答记录结构：[{ questionId, questionText, selectedLabel, otherText? }, ...]

// ===== 模块1 问卷题库（主诉与病史） =====
export const DEFAULT_QUESTIONNAIRE = [
  { id: 'q1', text: '就诊类型？', options: [
    { label: '新症状就诊', next: 'q2' },
    { label: '复诊/术后随访', next: 'q1a' },
    { label: '常规检查', next: 'MODULE_2' },
    { label: '其他', isOther: true, next: 'q2' },
  ]},
  { id: 'q1a', text: '复诊类型？', options: [
    { label: '术后复查', next: 'SURGERY_FOLLOWUP' },
    { label: '病情跟踪复查', next: 'MODULE_2' },
    { label: '其他', isOther: true, next: 'MODULE_2' },
  ]},
  { id: 'q2', text: '主诉部位？', options: [
    { label: '视力相关（看不清/视力下降）', next: 'q3' },
    { label: '眼部不适（红/痛/痒/异物感）', next: 'q4' },
    { label: '外观异常（斜视/眼皮下垂等）', next: 'q5' },
    { label: '无不适，定期检查', next: 'q6' },
    { label: '其他', isOther: true, next: 'q6' },
  ]},
  { id: 'q3', text: '视力问题类型？', options: [
    { label: '逐渐下降', next: 'q3a' },
    { label: '突然下降/丧失', next: 'q3b' },
    { label: '近距离模糊（老花相关）', next: 'q6' },
    { label: '远距离模糊（近视相关）', next: 'q6' },
    { label: '视物变形/有黑影飘动', next: 'q6' },
    { label: '其他', isOther: true, next: 'q6' },
  ]},
  { id: 'q3a', text: '病程多久？', options: [
    { label: '1周内', next: 'q6' }, { label: '1个月内', next: 'q6' },
    { label: '1-6个月', next: 'q6' }, { label: '半年-2年', next: 'q6' },
    { label: '2年以上', next: 'q6' }, { label: '其他', isOther: true, next: 'q6' },
  ]},
  { id: 'q3b', text: '伴随症状？', options: [
    { label: '伴眼痛', next: 'q6' }, { label: '伴眼红', next: 'q6' },
    { label: '无痛无红', next: 'q6' }, { label: '其他', isOther: true, next: 'q6' },
  ]},
  { id: 'q4', text: '眼部不适类型？（多选）', multiSelect: true, next: 'q6', options: [
    { label: '眼红' }, { label: '眼痛' }, { label: '眼痒' }, { label: '异物感' },
    { label: '干涩' }, { label: '畏光流泪' }, { label: '分泌物增多' },
    { label: '其他', isOther: true },
  ]},
  { id: 'q5', text: '外观异常类型？', options: [
    { label: '斜视', next: 'q6' }, { label: '眼睑下垂', next: 'q6' },
    { label: '眼球突出/内陷', next: 'q6' }, { label: '眼睑内翻/外翻', next: 'q6' },
    { label: '眼部肿物', next: 'q6' }, { label: '其他', isOther: true, next: 'q6' },
  ]},
  { id: 'q6', text: '眼部外伤史？', options: [
    { label: '无', next: 'q7' },
    { label: '有（需说明受伤方式与时间）', isFreeTextFollow: true, next: 'q7' },
  ]},
  { id: 'q7', text: '既往眼病史？（多选）', multiSelect: true, next: 'q8', options: [
    { label: '无' }, { label: '白内障' }, { label: '青光眼' }, { label: '近视' },
    { label: '远视' }, { label: '散光' }, { label: '弱视' }, { label: '斜视' },
    { label: '干眼症' }, { label: '结膜炎' }, { label: '角膜炎' },
    { label: '视网膜疾病' }, { label: '眼部手术史' }, { label: '其他', isOther: true },
  ]},
  { id: 'q8', text: '全身病史？（多选）', multiSelect: true, next: 'q9', options: [
    { label: '无' }, { label: '高血压' }, { label: '糖尿病' }, { label: '心脏病' },
    { label: '甲状腺疾病' }, { label: '自身免疫性疾病' }, { label: '其他', isOther: true },
  ]},
  { id: 'q9', text: '药物过敏史？', options: [
    { label: '无', next: 'q10' },
    { label: '有（需说明过敏药物）', isFreeTextFollow: true, next: 'q10' },
  ]},
  { id: 'q10', text: '个人史？', options: [
    { label: '无特殊', next: 'q11' }, { label: '长期吸烟', next: 'q11' },
    { label: '长期饮酒', next: 'q11' }, { label: '长期用眼过度', next: 'q11' },
    { label: '其他', isOther: true, next: 'q11' },
  ]},
  { id: 'q11', text: '婚姻史？', options: [
    { label: '未婚', next: 'q12' }, { label: '已婚', next: 'q12' },
    { label: '其他', isOther: true, next: 'q12' },
  ]},
  { id: 'q12', text: '家族史？', options: [
    { label: '无家族及遗传病史', next: 'MODULE_2' },
    { label: '有（需说明）', isFreeTextFollow: true, next: 'MODULE_2' },
  ]},
];

// 特殊跳转目标
export const EXIT_TARGET = {
  MODULE_2: 'MODULE_2',                 // 进入模块2（全身检查）
  SURGERY_FOLLOWUP: 'SURGERY_FOLLOWUP', // 直达模块7（手术相关→术后随访）
};

// 根据当前题 id 与所选选项，返回下一题 id
//   - 普通题目 id（字符串）
//   - null 表示问卷结束
//   - 'MODULE_2' / 'SURGERY_FOLLOWUP' 等特殊目标（由前端引擎解释跳模块）
export function nextQuestionId(questionnaire, currentId, selectedOption) {
  if (!selectedOption) return null;
  return selectedOption.next ?? null;
}

// 按 id 查找题目
export function findQuestion(questionnaire, id) {
  return questionnaire.find((q) => q.id === id) || null;
}

// ===== 模块名（7 模块步骤器） =====
export const MODULE_NAMES = [
  '主诉与病史',  // 模块1
  '全身检查',    // 模块2
  '眼科检查',    // 模块3
  '特殊检查',    // 模块4
  '初步诊断',    // 模块5
  '治疗计划',    // 模块6
  '手术相关',    // 模块7
];

// ===== 模块3 眼科检查项（13项 × OD/OS） =====
export const EYE_EXAM_ITEMS = [
  '视力', '眼压', '眼睑', '结膜', '角膜', '前房', '虹膜',
  '瞳孔', '晶状体', '玻璃体', '视盘', '视网膜', '黄斑',
];

// ===== 模块5 初步诊断选项（占位，待需求方确认正式清单后替换） =====
export const DIAGNOSIS_OPTIONS = [
  '青光眼', '白内障', '近视', '远视', '散光', '弱视', '斜视',
  '结膜炎', '角膜炎', '翼状胬肉', '视网膜疾病', '干眼症', '屈光不正', '其他',
];

// ===== 模块6 治疗计划选项 =====
export const TREATMENT_OPTIONS = [
  '药物治疗（滴眼液/口服药）', '手术治疗', '配镜矫正',
  '定期观察随访', '转诊上级医院', '其他',
];

// ===== 模块7 手术相关 tab 配置（6 个子表单） =====
export const SURGERY_TABS = [
  { key: 'pre_op_note', label: '术前记录' },
  { key: 'anesthesia_pre_assessment', label: '麻醉术前评估' },
  { key: 'anesthesia_intra_record', label: '麻醉记录(术中)' },
  { key: 'surgical_record', label: '手术记录' },
  { key: 'anesthesia_post_note', label: '麻醉术后记录' },
  { key: 'followup_visits', label: '术后复查/随访' },
];

// ===== 麻醉方式选项（8.2/8.3/8.4 共用） =====
export const ANESTHESIA_OPTIONS = ['表面麻醉', '局部麻醉', '全身麻醉', '其他'];

// ===== 复杂病例 answers 初始结构（前端 ComplexForm 用） =====
export const INITIAL_COMPLEX_ANSWERS = {
  intake_answers: [],
  vitals: {},
  eye_exam: { od: {}, os: {} },
  special_exam: {},
  diagnosis: [],
  treatment_plan: [],
  surgery: {
    pre_op_note: {},
    anesthesia_pre_assessment: {},
    anesthesia_intra_record: { steps: [] },
    surgical_record: { steps: [] },
    anesthesia_post_note: {},
    followup_visits: [],
  },
};
