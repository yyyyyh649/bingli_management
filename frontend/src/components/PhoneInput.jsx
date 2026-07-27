// 可复用的手机号输入框
// - 受控组件，配合 antd Form.Item 使用
// - 空：无提示无图标
// - 格式正确（11 位且 1 开头）：右侧绿色对勾
// - 格式错误：红字提示"手机号需为 11 位数字"
//
// 用法：
//   <Form.Item label="手机号" name="phone" rules={[{ validator: PhoneInput.validator }]}>
//     <PhoneInput />
//   </Form.Item>
//
// 在非 Form 场景（如 ComplexForm 的手动 state）下，直接用 PhoneInput + 手动判断 validateStatus：
//   <Form.Item label="手机号" validateStatus={PhoneInput.status(value)} help={PhoneInput.help(value)}>
//     <PhoneInput value={value} onChange={...} />
//   </Form.Item>
import React from 'react';
import { Input } from 'antd';

const PHONE_RE = /^1\d{10}$/;

// 供 Form.Item rules 使用的 validator（与其他 rules 共存）
// 注意：空值不报错（选填场景），只有填了且格式不对才报错
export const phoneValidator = (_rule, value) => {
  if (!value || !String(value).trim()) return Promise.resolve();
  if (PHONE_RE.test(String(value).trim())) return Promise.resolve();
  return Promise.reject(new Error('手机号需为 11 位数字'));
};

// 计算 validateStatus（供手动场景使用）
export function phoneStatus(value) {
  const v = value ? String(value).trim() : '';
  if (!v) return '';
  return PHONE_RE.test(v) ? 'success' : 'error';
}

// 计算 help 文案（供手动场景使用）
export function phoneHelp(value) {
  const v = value ? String(value).trim() : '';
  if (!v) return '';
  return PHONE_RE.test(v) ? '' : '手机号需为 11 位数字';
}

export default function PhoneInput({ value = '', onChange, ...rest }) {
  return (
    <Input
      value={value}
      onChange={onChange}
      maxLength={11}
      placeholder="11 位手机号"
      {...rest}
    />
  );
}
