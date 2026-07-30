import React, { useState } from 'react';
import { Card, Form, Input, Radio, DatePicker, Button, Space, Modal, message, Select, InputNumber, Divider, Typography } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { createCase } from '../../api/cases.js';
import { useOperators } from '../../api/operators.js';
import { CASE_MODE, DEPARTMENT } from '@optical/shared/constants.js';
import { ApiError, DUPLICATE_CONFIRM_REQUIRED } from '../../api/client.js';
import PhoneInput, { phoneValidator } from '../../components/PhoneInput.jsx';
import CandidatePicker from '../../components/CandidatePicker.jsx';
import PaymentModal from '../prescription/PaymentModal.jsx';

const { Text } = Typography;

export default function CaseSimpleForm() {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();
  const [submitting, setSubmitting] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [originalAmount, setOriginalAmount] = useState(0);

  // 只显示眼科部的登记人
  const ophthalmologyOperators = operators.filter((op) => {
    const depts = (op.department || '').split(',').filter(Boolean);
    return depts.includes(DEPARTMENT.OPHTHALMOLOGY);
  });

  // 按 IMPLEMENTATION.md Phase 2 / 1.5：监听姓名/手机号以驱动候选列表
  const name = Form.useWatch('name', form);
  const phone = Form.useWatch('phone', form);

  // 提交：先校验表单，弹支付弹窗
  const onFinish = (values) => {
    const total = Number(values.originalAmount || 0);
    setOriginalAmount(total);
    setPayModalOpen(true);
  };

  const buildPayload = (paymentResult, confirmDuplicate = false) => {
    const values = form.getFieldsValue();
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
      // 支付参数（按用户新需求 Phase D）
      originalAmount: Number(values.originalAmount || 0),
      discountType: paymentResult.discountType,
      discountValue: paymentResult.discountValue,
      balanceDeduction: paymentResult.balanceDeduction,
      balanceDeductionPhone: paymentResult.balanceDeductionPhone,
      pointsDeduction: paymentResult.pointsDeduction,
      pointsDeductionPhone: paymentResult.pointsDeductionPhone,
      paidAmount: paymentResult.paidAmount,
      pointsEarned: paymentResult.pointsEarned,
      pointsTargetPhone: paymentResult.pointsTargetPhone,
    };
    if (confirmDuplicate) payload.confirmDuplicate = true;
    return payload;
  };

  const doSubmit = async (paymentResult, confirmDuplicate = false) => {
    setSubmitting(true);
    try {
      const payload = buildPayload(paymentResult, confirmDuplicate);
      await createCase(payload);
      message.success('病例登记成功');
      setPayModalOpen(false);
      // 在 resetFields 之前捕获手机号
      const targetPhone = paymentResult.pointsTargetPhone || form.getFieldValue('phone') || '';
      form.resetFields();
      form.setFieldsValue({
        gender: '男',
        recordDate: dayjs(),
      });
      if (targetPhone) {
        Modal.confirm({
          title: '登记成功',
          content: '是否前往该客户积分页面？',
          okText: '前往',
          cancelText: '留在本页',
          onOk: () => navigate(`/customer/profile/${targetPhone}`),
        });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === DUPLICATE_CONFIRM_REQUIRED) {
        const existing = e.data?.existingRecord || e.data || {};
        const dateStr = existing.record_date || existing.created_at || '(未知日期)';
        Modal.confirm({
          title: '重复登记确认',
          content: `已存在一条相同数值的积分记录，登记于 ${dateStr}，是否仍要继续登记？`,
          okText: '继续登记',
          cancelText: '取消',
          onOk: () => doSubmit(paymentResult, true),
        });
        return;
      }
      // 其它错误拦截器已提示
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
        initialValues={{ gender: '男', recordDate: dayjs(), customerRefId: '', originalAmount: 0 }}
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

        {/* 按 IMPLEMENTATION.md Phase 2 / 1.5：候选列表 */}
        <CandidatePicker
          name={name}
          phone={phone}
          value={''}
          onChange={() => {}}
        />
        <Form.Item name="customerRefId" hidden>
          <Input />
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

        <Divider orientation="left">支付信息</Divider>
        <Form.Item
          label="总金额"
          name="originalAmount"
          rules={[{ required: true, message: '请输入总金额' }]}
          extra="填写后点击「提交」进入支付页面"
        >
          <InputNumber min={0} step={0.01} precision={2} prefix="¥" style={{ width: '100%' }} placeholder="本次病例总金额" />
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

      <PaymentModal
        open={payModalOpen}
        originalAmount={originalAmount}
        selfPhone={phone || ''}
        onOk={(result) => doSubmit(result)}
        onCancel={() => setPayModalOpen(false)}
      />
    </Card>
  );
}
