import React from 'react';
import { Card, Form, Input, Button, Modal, Space, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useNavigate, useLocation } from 'react-router-dom';
import { createCustomer } from '../../api/customers.js';
import { useOperators } from '../../api/operators.js';
import PhoneInput, { phoneValidator } from '../../components/PhoneInput.jsx';

export default function CustomerRegister() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { operators, loading: opLoading } = useOperators();
  const [submitting, setSubmitting] = React.useState(false);

  // 按 IMPLEMENTATION.md Phase 4：从验光单"一键办卡"跳转时带入已填数据
  React.useEffect(() => {
    const state = location.state;
    if (state && typeof state === 'object') {
      const preset = {};
      if (state.name) preset.name = state.name;
      if (state.phone) preset.phone = state.phone;
      if (state.address) preset.address = state.address;
      if (state.age != null) preset.age = state.age;
      if (Object.keys(preset).length) form.setFieldsValue(preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      // 按 IMPLEMENTATION.md 1.4：birthday 格式化为 YYYY-MM-DD
      const payload = {
        ...values,
        birthday: values.birthday ? dayjs(values.birthday).format('YYYY-MM-DD') : '',
      };
      await createCustomer(payload);
      const phone = values.phone;
      Modal.confirm({
        title: '登记成功',
        content: '是否前往该客户积分页面？',
        okText: '前往',
        cancelText: '留在本页',
        onOk: () => navigate(`/customer/profile/${phone}`),
      });
      form.resetFields();
    } catch (e) {
      // 拦截器已提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="会员登记">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        style={{ maxWidth: 560 }}
        initialValues={{ operator: '' }}
      >
        <Form.Item
          label="姓名"
          name="name"
          rules={[{ required: true, message: '请输入姓名' }]}
        >
          <Input placeholder="请输入姓名" />
        </Form.Item>
        <Form.Item
          label="手机号"
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
          label="生日"
          name="birthday"
          rules={[{ required: true, message: '请选择生日' }]}
        >
          <DatePicker style={{ width: '100%' }} placeholder="选择出生日期" />
        </Form.Item>
        <Form.Item
          label="性别"
          name="gender"
          rules={[{ required: true, message: '请选择性别' }]}
        >
          <Select placeholder="请选择性别">
            <Select.Option value="男">男</Select.Option>
            <Select.Option value="女">女</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="会员卡号（可选）" name="memberCardNo">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item label="住址（可选）" name="address">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
        <Form.Item
          label="登记人"
          name="operator"
          rules={[{ required: true, message: '请选择登记人' }]}
        >
          <Select placeholder={opLoading ? '加载中...' : '请选择登记人'} loading={opLoading} allowClear>
            {operators.map((op) => (
              <Select.Option key={op.id} value={op.name}>
                {op.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交
            </Button>
            <Button onClick={() => form.resetFields()}>重置</Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
