import React, { useEffect, useMemo } from 'react';
import { Form, Input, Radio, Typography, Divider, Empty } from 'antd';
import {
  TEMPLATE_PAGE_MAX_COLS,
} from '@optical/shared/constants.js';

const { Text } = Typography;

// "其他" 选项固定文案，渲染时自动追加到每个 choice 题末尾，不存入模板
const OTHER_LABEL = '其他';

/**
 * 按用户新需求 Phase H：模板表单渲染器
 * 根据 template.pages 渲染可填写的表单（个人信息页固定，本组件只渲染模板部分）
 * - choice 题：Radio 单选（含自动追加的"其他"，选中后展开文本框）
 * - text 题：Input 文本框
 * - 每页最多 TEMPLATE_PAGE_MAX_COLS 列，按 item.width 占列宽
 * 答案以 { [itemId]: { value, otherText? } } 形式通过 form 存取（form name = `tpl_${itemId}`）
 *
 * @param {object} props
 * @param {object} props.template - { pages: [{ items }] }
 * @param {object} props.form - antd Form 实例（必传，调用方控制）
 * @param {object} props.initialAnswers - 可选，初始答案 { [itemId]: { value, otherText } }
 */
export default function TemplateFormRenderer({ template, form, initialAnswers }) {
  const pages = useMemo(() => {
    if (!template || !Array.isArray(template.pages)) return [];
    return template.pages;
  }, [template]);

  // 初始值注入
  useEffect(() => {
    if (!form) return;
    const vals = {};
    for (const page of pages) {
      for (const it of page.items || []) {
        const key = `tpl_${it.id}`;
        const a = initialAnswers?.[it.id];
        if (a) {
          if (it.type === 'choice') {
            vals[key] = a.value === OTHER_LABEL && a.otherText != null ? OTHER_LABEL : a.value;
            if (a.value === OTHER_LABEL && a.otherText != null) {
              vals[`${key}_other`] = a.otherText;
            }
          } else {
            vals[key] = a.value ?? '';
          }
        }
      }
    }
    form.setFieldsValue(vals);
  }, [pages, form, initialAnswers]);

  if (pages.length === 0) {
    return <Empty description="该模板没有题目" />;
  }

  return (
    <div>
      {pages.map((page, pi) => (
        <div key={pi}>
          {pages.length > 1 && (
            <Divider orientation="left" style={{ marginTop: pi === 0 ? 0 : 16 }}>
              第 {pi + 1} 页
            </Divider>
          )}
          <RowGrid>
            {(page.items || []).map((it) => (
              <GridItem key={it.id} width={it.width}>
                <ItemField item={it} form={form} />
              </GridItem>
            ))}
          </RowGrid>
        </div>
      ))}
    </div>
  );
}

// 简单的列布局：每行 TEMPLATE_PAGE_MAX_COLS 列，item 占 width 列
function RowGrid({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>{children}</div>;
}

function GridItem({ width, children }) {
  const cols = TEMPLATE_PAGE_MAX_COLS;
  const pct = (Math.min(Math.max(Number(width) || 1, 1), cols) / cols) * 100;
  return (
    <div style={{ width: `calc(${pct}% - 12px * ${(cols - 1) / cols})`, minWidth: 200 }}>
      {children}
    </div>
  );
}

function ItemField({ item, form }) {
  const key = `tpl_${item.id}`;
  const label = (
    <span>
      {item.label}
      {item.required && <Text type="danger"> *</Text>}
    </span>
  );

  if (item.type === 'text') {
    return (
      <Form.Item name={key} label={label} rules={item.required ? [{ required: true, message: '必填' }] : []}>
        <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} placeholder="请输入" />
      </Form.Item>
    );
  }

  // choice
  const options = (item.options || []).map((o) => ({ label: o, value: o }));
  options.push({ label: OTHER_LABEL, value: OTHER_LABEL });
  return (
    <>
      <Form.Item
        name={key}
        label={label}
        rules={item.required ? [{ required: true, message: '必填' }] : []}
      >
        <Radio.Group>
          {options.map((o) => (
            <Radio key={o.value} value={o.value} style={{ display: 'block', marginBottom: 4 }}>
              {o.label}
            </Radio>
          ))}
        </Radio.Group>
      </Form.Item>
      <Form.Item shouldUpdate={(prev, cur) => prev[key] !== cur[key]} noStyle>
        {() => {
          const v = form.getFieldValue(key);
          if (v !== OTHER_LABEL) return null;
          return (
            <Form.Item
              name={`${key}_other`}
              rules={[{ required: true, message: '请输入其他内容' }]}
              style={{ marginTop: -8 }}
            >
              <Input placeholder="请输入其他内容" />
            </Form.Item>
          );
        }}
      </Form.Item>
    </>
  );
}

/**
 * 从 form 中提取答案，转为 { [itemId]: { value, otherText? } } 数组结构
 * 便于存为 template_answers JSON：[{ itemId, type, label, value, otherText? }]
 */
export function collectTemplateAnswers(form, template) {
  if (!form || !template) return [];
  const pages = Array.isArray(template.pages) ? template.pages : [];
  const out = [];
  for (const page of pages) {
    for (const it of page.items || []) {
      const key = `tpl_${it.id}`;
      const raw = form.getFieldValue(key);
      if (it.type === 'choice') {
        if (raw === OTHER_LABEL) {
          const other = form.getFieldValue(`${key}_other`);
          out.push({ itemId: it.id, type: it.type, label: it.label, value: OTHER_LABEL, otherText: other || '' });
        } else if (raw != null && raw !== '') {
          out.push({ itemId: it.id, type: it.type, label: it.label, value: raw });
        } else {
          out.push({ itemId: it.id, type: it.type, label: it.label, value: '' });
        }
      } else {
        out.push({ itemId: it.id, type: it.type, label: it.label, value: raw ?? '' });
      }
    }
  }
  return out;
}
