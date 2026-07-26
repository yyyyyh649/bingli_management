// 复杂病例问卷题库配置（占位框架，正式题目待需求方提供后替换）
//
// 设计原则：
//  - 通用 JSON 配置驱动，分支跳转逻辑不写死在业务代码中
//  - 每题 options 数组，每项可包含：
//      label      选项文字
//      next       下一题 id（null 表示问卷结束）
//      isOther    true 表示"其他"选项，作答时可自由输入文本
//  - 作答记录结构：[{ questionId, questionText, selectedLabel, otherText? }, ...]

export const DEFAULT_QUESTIONNAIRE = [
  {
    id: 'q1',
    text: '主诉类型？',
    options: [
      { label: '视力下降', next: 'q2' },
      { label: '眼部不适', next: 'q3' },
      { label: '定期复查', next: 'q4' },
      { label: '其他', isOther: true, next: 'q4' },
    ],
  },
  {
    id: 'q2',
    text: '视力下降持续时间？',
    options: [
      { label: '一周内', next: 'q4' },
      { label: '一个月以上', next: 'q4' },
      { label: '其他', isOther: true, next: 'q4' },
    ],
  },
  {
    id: 'q3',
    text: '不适类型？',
    options: [
      { label: '眼干', next: 'q4' },
      { label: '眼痛', next: 'q4' },
      { label: '其他', isOther: true, next: 'q4' },
    ],
  },
  {
    id: 'q4',
    text: '既往眼部病史？',
    options: [
      { label: '无', next: null },
      { label: '有', next: null },
      { label: '其他', isOther: true, next: null },
    ],
  },
];

// 根据当前题 id 与所选选项，返回下一题 id（null 表示结束）
export function nextQuestionId(questionnaire, currentId, selectedOption) {
  if (!selectedOption) return null;
  return selectedOption.next ?? null;
}

// 按 id 查找题目
export function findQuestion(questionnaire, id) {
  return questionnaire.find((q) => q.id === id) || null;
}
