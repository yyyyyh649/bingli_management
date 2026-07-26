import React, { useState } from 'react';
import {
  Card,
  Steps,
  Button,
  Space,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Spin,
  Select,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import Page1Basic from './Page1Basic.jsx';
import PageEye from './PageEye.jsx';
import PointsAttribution from './PointsAttribution.jsx';
import { useOperators } from '../../api/operators.js';
import { createPrescription } from '../../api/prescriptions.js';
import { ApiError, DUPLICATE_CONFIRM_REQUIRED } from '../../api/client.js';

const STEP_TITLES = [
  '基本信息',
  '右眼 DS',
  '右眼 DC',
  '左眼 DS',
  '左眼 DC',
  '价格与瞳距',
];

export default function PrescriptionWizard() {
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();

  const [page1Form] = Form.useForm();
  const [odDsForm] = Form.useForm();
  const [odDcForm] = Form.useForm();
  const [osDsForm] = Form.useForm();
  const [osDcForm] = Form.useForm();
  const [page6Form] = Form.useForm();

  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [attrOpen, setAttrOpen] = useState(false);
  const [pendingPoints, setPendingPoints] = useState(0);
  const [page1Snapshot, setPage1Snapshot] = useState({}); // 用于归属"本人"取 phone

  const forms = [page1Form, odDsForm, odDcForm, osDsForm, osDcForm, page6Form];

  const next = async () => {
    try {
      const values = await forms[current].validateFields();
      if (current === 0) {
        // 记录 page1，并规范化 record_date
        const normalized = {
          ...values,
          record_date: values.record_date
            ? dayjs(values.record_date).format('YYYY-MM-DD')
            : dayjs().format('YYYY-MM-DD'),
        };
        setPage1Snapshot(normalized);
        page1Form.setFieldsValue({ record_date: dayjs(normalized.record_date) });
      }
      setCurrent((c) => Math.min(c + 1, STEP_TITLES.length - 1));
    } catch (e) {
      // 校验失败，Form 自动提示
    }
  };

  const prev = () => {
    setCurrent((c) => Math.max(c - 1, 0));
  };

  // 最后一步点击"提交"：先校验 page6，计算积分，弹归属 Modal
  const onSubmitClick = async () => {
    try {
      await page6Form.validateFields();
      const v = page6Form.getFieldsValue();
      const lens = Number(v.lens_price || 0);
      const frame = Number(v.frame_price || 0);
      const points = Math.floor(lens + frame);
      setPendingPoints(points);
      // 若积分 > 0 才弹归属；积分为 0 直接提交（points_target_phone 留空）
      if (points > 0) {
        setAttrOpen(true);
      } else {
        doSubmit('');
      }
    } catch (e) {
      // 校验失败
    }
  };

  const buildPayload = (targetPhone, confirmDuplicate = false) => {
    const page1 = {
      ...page1Snapshot,
      record_date: page1Snapshot.record_date
        ? dayjs(page1Snapshot.record_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD'),
    };
    const page6 = page6Form.getFieldsValue();
    const payload = {
      customer_phone: page1.phone || '',
      customer_name: page1.name || '',
      page1,
      od_ds: odDsForm.getFieldsValue(),
      od_dc: odDcForm.getFieldsValue(),
      os_ds: osDsForm.getFieldsValue(),
      os_dc: osDcForm.getFieldsValue(),
      page6: {
        lens_price: page6.lens_price,
        frame_price: page6.frame_price,
        pd_near: page6.pd_near,
        pd_far: page6.pd_far,
      },
      record_date: page1.record_date,
      operator: page6.operator,
      points_target_phone: targetPhone || '',
    };
    if (confirmDuplicate) payload.confirmDuplicate = true;
    return payload;
  };

  const doSubmit = async (targetPhone, confirmDuplicate = false) => {
    setSubmitting(true);
    try {
      const payload = buildPayload(targetPhone, confirmDuplicate);
      await createPrescription(payload);
      message.success('验光单登记成功');
      setAttrOpen(false);
      const phone = targetPhone || page1Snapshot.phone;
      if (phone) {
        Modal.confirm({
          title: '登记成功',
          content: '是否前往该客户积分页面？',
          okText: '前往',
          cancelText: '留在本页',
          onOk: () => navigate(`/customer/profile/${phone}`),
        });
      } else {
        Modal.confirm({
          title: '登记成功',
          content: '本次未关联客户手机号，是否登记新的一单？',
          okText: '继续登记',
          cancelText: '返回首页',
          onOk: () => resetAll(),
          onCancel: () => navigate('/'),
        });
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === DUPLICATE_CONFIRM_REQUIRED) {
        // 重复登记检测：弹确认
        const existing = e.data?.existingRecord || e.data || {};
        const dateStr = existing.record_date || existing.created_at || '(未知日期)';
        Modal.confirm({
          title: '重复登记确认',
          content: `已存在一条相同数值的记录，登记于 ${dateStr}，是否仍要继续登记？`,
          okText: '继续登记',
          cancelText: '取消',
          onOk: () => doSubmit(targetPhone, true),
        });
        return;
      }
      // 其它错误拦截器已提示
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    [page1Form, odDsForm, odDcForm, osDsForm, osDcForm, page6Form].forEach((f) =>
      f.resetFields()
    );
    page1Form.setFieldsValue({ record_date: dayjs() });
    setPage1Snapshot({});
    setCurrent(0);
    setPendingPoints(0);
  };

  const renderStep = () => {
    switch (current) {
      case 0:
        return <Page1Basic form={page1Form} />;
      case 1:
        return <PageEye form={odDsForm} eye="od" rxType="ds" />;
      case 2:
        return <PageEye form={odDcForm} eye="od" rxType="dc" />;
      case 3:
        return <PageEye form={osDsForm} eye="os" rxType="ds" />;
      case 4:
        return <PageEye form={osDcForm} eye="os" rxType="dc" />;
      case 5:
        return (
          <Form form={page6Form} layout="vertical" style={{ maxWidth: 560 }}>
            <Form.Item label="镜片价（元）" name="lens_price" rules={[{ required: true, message: '请输入镜片价' }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="数字" />
            </Form.Item>
            <Form.Item label="镜架价（元）" name="frame_price" rules={[{ required: true, message: '请输入镜架价' }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="数字" />
            </Form.Item>
            <Form.Item label="瞳距（近）" name="pd_near">
              <Input placeholder="如 60" />
            </Form.Item>
            <Form.Item label="瞳距（远）" name="pd_far">
              <Input placeholder="如 62" />
            </Form.Item>
            <Form.Item label="登记人" name="operator" rules={[{ required: true, message: '请选择登记人' }]}>
              <Select placeholder={opLoading ? '加载中...' : '请选择登记人'} loading={opLoading} allowClear>
                {operators.map((op) => (
                  <Select.Option key={op.id} value={op.name}>
                    {op.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Form>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      title="验光单登记"
      extra={
        <Button onClick={resetAll}>重置全部</Button>
      }
    >
      <Steps
        current={current}
        size="small"
        style={{ marginBottom: 24 }}
        items={STEP_TITLES.map((t) => ({ title: t }))}
      />

      <Spin spinning={submitting} tip="提交中...">
        <div style={{ minHeight: 200 }}>{renderStep()}</div>
      </Spin>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
        <Button disabled={current === 0} onClick={prev}>
          上一步
        </Button>
        <Space>
          <Button onClick={() => navigate('/')}>取消</Button>
          {current < STEP_TITLES.length - 1 ? (
            <Button type="primary" onClick={next}>
              下一步
            </Button>
          ) : (
            <Button type="primary" onClick={onSubmitClick} loading={submitting}>
              提交
            </Button>
          )}
        </Space>
      </div>

      <PointsAttribution
        open={attrOpen}
        points={pendingPoints}
        selfPhone={page1Snapshot.phone || ''}
        onOk={(phone) => doSubmit(phone)}
        onCancel={() => setAttrOpen(false)}
      />
    </Card>
  );
}
