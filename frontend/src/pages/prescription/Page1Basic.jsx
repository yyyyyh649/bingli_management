import React from 'react';
import { Form, Input, InputNumber, DatePicker } from 'antd';
import dayjs from 'dayjs';
import PhoneInput, { phoneValidator } from '../../components/PhoneInput.jsx';

// 验光单向导 - 第1步：基本信息
// 表单实例由父级 Wizard 传入
export default function Page1Basic({ form }) {
  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ record_date: dayjs() }}
      style={{ maxWidth: 560 }}
    >
      <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
        <Input placeholder="请输入姓名" />
      </Form.Item>
      <Form.Item label="年龄" name="age" rules={[{ required: true, message: '请输入年龄' }]}>
        <InputNumber min={0} max={150} style={{ width: '100%' }} placeholder="岁" />
      </Form.Item>
      <Form.Item label="住址" name="address">
        <Input.TextArea rows={2} placeholder="选填" />
      </Form.Item>
      <Form.Item
        label="电话"
        name="phone"
        hasFeedback
        rules={[
          { validator: phoneValidator, validateTrigger: 'onChange' },
        ]}
      >
        <PhoneInput placeholder="11 位手机号（选填，但归属本人积分时必填）" />
      </Form.Item>
      <Form.Item
        label="登记日期"
        name="record_date"
        rules={[{ required: true, message: '请选择登记日期' }]}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    </Form>
  );
}
