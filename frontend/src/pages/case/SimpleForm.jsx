import React, { useState } from 'react';
import { Card, Form, Input, Radio, DatePicker, Button, Space, Modal, message, Select } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { createCase } from '../../api/cases.js';
import { useOperators } from '../../api/operators.js';
import { CASE_MODE, DEPARTMENT } from '@optical/shared/constants.js';
import PhoneInput, { phoneValidator } from '../../components/PhoneInput.jsx';

export default function CaseSimpleForm() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();
  const [submitting, setSubmitting] = useState(false);

  // 只显示眼科部的登记人
  const ophthalmologyOperators = operators.filter((op) => {
    const depts = (op.department || '').split(',').filter(Boolean);
    return depts.includes(DEPARTMENT.OPHTHALMOLOGY);
  });

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        mode: CASE_MODE.SIMPLE,
        customerName: values.name,
        customerGender: values.gender,
        customerPhone: values.phone,
        customerAddress: values.address,
        condition: values.condition,
        recordDate: values.recordDate
          ? dayjs(values.recordDate).format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
        operator: values.operator,
      };
      await createCase(payload);
      message.success('病例登记成功');
      form.resetFields();
      form.setFieldsValue({
        gender: '男',
        recordDate: dayjs(),
      });
      if (values.phone) {
        Modal.confirm({
          title: '登记成功',
          content: '是否前往该客户积分页面？',
          okText: '前往',
          cancelText: '留在本页',
          onOk: () => navigate(`/customer/profile/${values.phone}`),
        });
      }
    } catch (e) {
      // 拦截器已提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="简约病例登记">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        style={{ maxWidth: 640 }}
        initialValues={{ gender: '男', recordDate: dayjs() }}
      >
        <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
          <Input placeholder="请输入姓名" />
        </Form.Item>
        <Form.Item label="性别" name="gender" rules={[{ required: true, message: '请选择性别' }]}>
          <Radio.Group>
            <Radio value="男">男</Radio>
            <Radio value="女">女</Radio>
          </Radio.Group>
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
        <Form.Item label="住址" name="address">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
        <Form.Item label="病情" name="condition" rules={[{ required: true, message: '请输入病情描述' }]}>
          <Input.TextArea rows={4} placeholder="请描述病情" />
        </Form.Item>
        <Form.Item label="登记人" name="operator" rules={[{ required: true, message: '请选择登记人' }]}>
          <Select placeholder={opLoading ? '加载中...' : '请选择登记人（仅眼科部）'} loading={opLoading} allowClear>
            {ophthalmologyOperators.map((op) => (
              <Select.Option key={op.id} value={op.name}>
                {op.name}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item label="登记日期" name="recordDate" rules={[{ required: true, message: '请选择登记日期' }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交
            </Button>
            <Button onClick={() => form.resetFields()}>重置</Button>
            <Button onClick={() => navigate('/case')}>返回</Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
