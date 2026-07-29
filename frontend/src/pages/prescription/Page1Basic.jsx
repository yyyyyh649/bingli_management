import React from 'react';
import { Form, Input, InputNumber, DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import PhoneInput, { phoneValidator } from '../../components/PhoneInput.jsx';
import CandidatePicker from '../../components/CandidatePicker.jsx';
import RegistrationContext from '../../components/RegistrationContext.jsx';

// 验光单向导 - 第1步：基本信息
// 表单实例由父级 Wizard 传入
// 按 IMPLEMENTATION.md Phase 2 / 1.5：本页内嵌候选列表，店员选择后写入隐藏字段 customerRefId
// 按 IMPLEMENTATION.md Phase 3：本页内嵌双区（会员信息 + 客户历史）
export default function Page1Basic({ form }) {
  const navigate = useNavigate();
  const name = Form.useWatch('name', form);
  const phone = Form.useWatch('phone', form);
  const customerRefId = Form.useWatch('customerRefId', form);

  // 按 IMPLEMENTATION.md Phase 4：办卡跳转自动带入已填姓名/手机号/住址/年龄/生日
  const handlePrefillRegister = () => {
    const v = form.getFieldsValue();
    navigate('/customer/register', {
      state: {
        name: v.name || '',
        phone: v.phone || '',
        address: v.address || '',
        age: v.age || undefined,
      },
    });
  };

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ record_date: dayjs(), customerRefId: '' }}
      style={{ maxWidth: 560 }}
    >
      <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
        <Input placeholder="请输入姓名" />
      </Form.Item>
      <Form.Item label="性别" name="gender" rules={[{ required: true, message: '请选择性别' }]}>
        <Select placeholder="请选择性别">
          <Select.Option value="男">男</Select.Option>
          <Select.Option value="女">女</Select.Option>
        </Select>
      </Form.Item>
      <Form.Item label="年龄" name="age">
        <InputNumber min={0} max={150} style={{ width: '100%' }} placeholder="选填" />
      </Form.Item>
      <Form.Item label="住址" name="address">
        <Input.TextArea rows={2} placeholder="选填" />
      </Form.Item>
      <Form.Item
        label="电话"
        name="phone"
        hasFeedback
        rules={[
          { required: true, message: '请输入手机号' },
          { validator: phoneValidator, validateTrigger: 'onChange' },
        ]}
      >
        <PhoneInput placeholder="11 位手机号" />
      </Form.Item>
      <Form.Item
        label="登记日期"
        name="record_date"
        rules={[{ required: true, message: '请选择登记日期' }]}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      {/* 按 IMPLEMENTATION.md Phase 2 / 1.5：候选列表，选择本次登记归属的人 */}
      <CandidatePicker
        name={name}
        phone={phone}
        value={customerRefId ?? ''}
        onChange={(refId) => form.setFieldsValue({ customerRefId: refId || '' })}
      />
      {/* 隐藏字段：保存店员选择的 customerRefId（'' = 新客户/自引用） */}
      <Form.Item name="customerRefId" hidden>
        <Input />
      </Form.Item>

      {/* 按 IMPLEMENTATION.md Phase 3：双区（会员信息 + 客户历史） */}
      <div style={{ marginTop: 16, maxWidth: 'none' }}>
        <RegistrationContext
          name={name}
          phone={phone}
          onPrefillRegister={handlePrefillRegister}
        />
      </div>
    </Form>
  );
}
