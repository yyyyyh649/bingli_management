import React from 'react';
import { Card, Form, Input, Button, Modal, Space, Select } from 'antd';
import { useNavigate } from 'react-router-dom';
import { createCustomer } from '../../api/customers.js';
import { useOperators } from '../../api/operators.js';

export default function CustomerRegister() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();
  const [submitting, setSubmitting] = React.useState(false);

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      const customer = await createCustomer(values);
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
          rules={[
            { required: true, message: '请输入手机号' },
            { pattern: /^1\d{10}$/, message: '手机号需为 11 位数字' },
          ]}
        >
          <Input placeholder="11 位手机号" maxLength={11} />
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
