import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Button,
  Space,
  Statistic,
  Modal,
  message,
  Divider,
} from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { createPoint, listPoints } from '../../api/points.js';
import { getCustomerByPhone } from '../../api/customers.js';
import {
  POINTS_SOURCE,
  POINTS_DEDUCT_REASONS,
} from '@optical/shared/constants.js';
import { ApiError, DUPLICATE_CONFIRM_REQUIRED } from '../../api/client.js';

// 扣除原因 → source_type 映射
const DEDUCT_REASON_TO_SOURCE = {
  提现: POINTS_SOURCE.WITHDRAW,
  兑换小礼品: POINTS_SOURCE.GIFT_REDEEM,
};

export default function PointsManual() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [phone, setPhone] = useState(searchParams.get('phone') || '');
  const [customer, setCustomer] = useState(null);
  const [currentPoints, setCurrentPoints] = useState(0);
  const [querying, setQuerying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [opType, setOpType] = useState('add'); // add | deduct

  // 查询客户及当前积分
  const queryCustomer = async (p) => {
    if (!p) return;
    setQuerying(true);
    try {
      const c = await getCustomerByPhone(p);
      setCustomer(c);
      const ledger = await listPoints(p);
      const arr = Array.isArray(ledger) ? ledger : [];
      setCurrentPoints(arr.reduce((s, x) => s + Number(x.amount || 0), 0));
    } catch (e) {
      setCustomer(null);
      setCurrentPoints(0);
    } finally {
      setQuerying(false);
    }
  };

  useEffect(() => {
    const p = searchParams.get('phone');
    if (p) {
      setPhone(p);
      queryCustomer(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFinish = async (values) => {
    if (!customer) {
      message.warning('请先查询有效客户');
      return;
    }
    const amount =
      opType === 'add' ? Math.abs(Number(values.amount)) : -Math.abs(Number(values.amount));
    let sourceType;
    let note = values.note || '';
    if (opType === 'add') {
      sourceType = POINTS_SOURCE.MANUAL_ADD;
    } else {
      // 扣分：必须有原因
      if (!values.deductReason) {
        message.warning('扣分时必须选择原因');
        return;
      }
      sourceType = DEDUCT_REASON_TO_SOURCE[values.deductReason];
      note = note || values.deductReason;
    }
    await submitPoint({ amount, sourceType, note });
  };

  const submitPoint = async ({ amount, sourceType, note }, confirmDuplicate = false) => {
    setSubmitting(true);
    try {
      await createPoint({
        customerPhone: customer.phone,
        amount,
        sourceType,
        note,
        confirmDuplicate,
      });
      message.success(opType === 'add' ? '加分成功' : '扣分成功');
      form.resetFields();
      await queryCustomer(customer.phone); // 刷新积分
    } catch (e) {
      if (e instanceof ApiError && e.code === DUPLICATE_CONFIRM_REQUIRED) {
        const existing = e.data?.existingRecord || e.data || {};
        const dateStr = existing.created_at || '(未知时间)';
        Modal.confirm({
          title: '重复登记确认',
          content: `已存在一条相同金额的积分记录，登记于 ${dateStr}，是否仍要继续？`,
          okText: '继续',
          cancelText: '取消',
          onOk: () =>
            submitPoint({ amount, sourceType, note }, true),
        });
        return;
      }
      // 其它错误拦截器已提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="手动积分增减">
      <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
        <Space.Compact style={{ maxWidth: 480 }}>
          <Input
            placeholder="客户手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={11}
            onPressEnter={() => queryCustomer(phone.trim())}
          />
          <Button type="primary" loading={querying} onClick={() => queryCustomer(phone.trim())}>
            查询
          </Button>
        </Space.Compact>
        {customer && (
          <div>
            <Statistic
              title={`当前积分（${customer.name || '客户'}）`}
              value={currentPoints}
              valueStyle={{ color: '#1677ff' }}
              suffix="分"
            />
          </div>
        )}
      </Space>

      <Divider />

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        style={{ maxWidth: 480 }}
        initialValues={{ opType: 'add' }}
      >
        <Form.Item label="操作类型">
          <Radio.Group
            value={opType}
            onChange={(e) => setOpType(e.target.value)}
          >
            <Radio.Button value="add">加分</Radio.Button>
            <Radio.Button value="deduct">扣分</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          label={opType === 'add' ? '金额（正数加分）' : '金额（正数扣分）'}
          name="amount"
          rules={[{ required: true, message: '请输入金额' }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} placeholder="整数" precision={0} />
        </Form.Item>
        {opType === 'deduct' && (
          <Form.Item
            label="扣除原因"
            name="deductReason"
            rules={[{ required: true, message: '请选择扣除原因' }]}
          >
            <Select
              placeholder="请选择"
              options={POINTS_DEDUCT_REASONS.map((r) => ({ value: r, label: r }))}
            />
          </Form.Item>
        )}
        <Form.Item label="备注（可选）" name="note">
          <Input.TextArea rows={2} placeholder="选填" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting} disabled={!customer}>
              提交
            </Button>
            <Button onClick={() => form.resetFields()}>重置</Button>
            {customer && (
              <Button onClick={() => navigate(`/customer/profile/${customer.phone}`)}>
                查看客户积分页
              </Button>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
