import React, { useState, useEffect } from 'react';
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
  Tooltip,
} from 'antd';
import { UserAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import Page1Basic from './Page1Basic.jsx';
import PageEye from './PageEye.jsx';
import PaymentModal from './PaymentModal.jsx';
import { useOperators } from '../../api/operators.js';
import { createPrescription } from '../../api/prescriptions.js';
import { ApiError, DUPLICATE_CONFIRM_REQUIRED } from '../../api/client.js';
import { DEPARTMENT, DEFAULT_REVIEW_CYCLE_DAYS } from '@optical/shared/constants.js';

// 按 IMPLEMENTATION.md Phase 4：两页化
// 第1页 = 个人信息（含必填校验）+ 候选列表 + 双区 + 办卡跳转按钮
// 第2页 = 全部眼部信息 + 金额 + 复查时间（默认90）+ 备注 + 登记人
// 其后  = 支付页（PaymentModal）
const PAGE_TITLES = ['基本信息', '验光信息'];

// 按 IMPLEMENTATION.md Phase 4：办卡跳转时暂存表单数据到 sessionStorage，返回时恢复
const FORM_SNAPSHOT_KEY = 'rx_wizard_snapshot';

export default function PrescriptionWizard() {
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();

  // 只显示配镜部的登记人
  const opticalOperators = operators.filter((op) => {
    const depts = (op.department || '').split(',').filter(Boolean);
    return depts.includes(DEPARTMENT.OPTICAL);
  });

  const [page1Form] = Form.useForm();
  const [odDsForm] = Form.useForm();
  const [odDcForm] = Form.useForm();
  const [osDsForm] = Form.useForm();
  const [osDcForm] = Form.useForm();
  const [page2Form] = Form.useForm(); // 金额 + 瞳距 + 复查周期 + 备注 + 登记人

  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [originalAmount, setOriginalAmount] = useState(0);
  const [page1Snapshot, setPage1Snapshot] = useState({});
  // 按 IMPLEMENTATION.md Phase 4：会员匹配结果（来自 RegistrationContext），用于控制办卡按钮可点/禁用
  const [memberMatch, setMemberMatch] = useState(null);

  // 按 IMPLEMENTATION.md Phase 4：从会员登记页返回时，恢复暂存的表单数据
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(FORM_SNAPSHOT_KEY);
      if (raw) {
        const snap = JSON.parse(raw);
        if (snap.page1) {
          page1Form.setFieldsValue({
            ...snap.page1,
            record_date: snap.page1.record_date ? dayjs(snap.page1.record_date) : dayjs(),
          });
        }
        if (snap.odDs) odDsForm.setFieldsValue(snap.odDs);
        if (snap.odDc) odDcForm.setFieldsValue(snap.odDc);
        if (snap.osDs) osDsForm.setFieldsValue(snap.osDs);
        if (snap.osDc) osDcForm.setFieldsValue(snap.osDc);
        if (snap.page2) page2Form.setFieldsValue(snap.page2);
        // 恢复后清除快照，避免下次进入仍恢复
        sessionStorage.removeItem(FORM_SNAPSHOT_KEY);
        if (snap.currentPage) setCurrent(snap.currentPage);
      }
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const next = async () => {
    try {
      const values = await page1Form.validateFields();
      const normalized = {
        ...values,
        record_date: values.record_date
          ? dayjs(values.record_date).format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
      };
      setPage1Snapshot(normalized);
      page1Form.setFieldsValue({ record_date: dayjs(normalized.record_date) });
      setCurrent((c) => Math.min(c + 1, PAGE_TITLES.length - 1));
    } catch (e) {
      // 校验失败
    }
  };

  const prev = () => {
    setCurrent((c) => Math.max(c - 1, 0));
  };

  // 第2页点击"提交"：先校验 page2，计算原价，弹支付弹窗
  const onSubmitClick = async () => {
    try {
      await page2Form.validateFields();
      const v = page2Form.getFieldsValue();
      const lens = Number(v.lens_price || 0);
      const frame = Number(v.frame_price || 0);
      const total = lens + frame;
      setOriginalAmount(total);
      setPayModalOpen(true);
    } catch (e) {
      // 校验失败
    }
  };

  const buildPayload = (paymentResult, confirmDuplicate = false) => {
    const page1 = {
      ...page1Snapshot,
      record_date: page1Snapshot.record_date
        ? dayjs(page1Snapshot.record_date).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD'),
    };
    const page2 = page2Form.getFieldsValue();
    const payload = {
      customer_phone: page1.phone || '',
      customer_name: page1.name || '',
      // 按 IMPLEMENTATION.md Phase 2 / 1.5：店员在第一页候选列表选择的客户标识
      customerRefId: page1.customerRefId || '',
      page1,
      od_ds: odDsForm.getFieldsValue(),
      od_dc: odDcForm.getFieldsValue(),
      os_ds: osDsForm.getFieldsValue(),
      os_dc: osDcForm.getFieldsValue(),
      page6: {
        lens_price: page2.lens_price,
        frame_price: page2.frame_price,
        pd_near: page2.pd_near,
        pd_far: page2.pd_far,
      },
      // 按 IMPLEMENTATION.md Phase 4 / 1.6：复查周期 + 备注（显式列，已就绪）
      reviewCycleDays: Number(page2.review_cycle_days) || DEFAULT_REVIEW_CYCLE_DAYS,
      notes: String(page2.notes || '').trim(),
      record_date: page1.record_date,
      operator: page2.operator,
      // 支付参数
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
      await createPrescription(payload);
      message.success('验光单登记成功');
      setPayModalOpen(false);
      // 提交成功后清除快照
      sessionStorage.removeItem(FORM_SNAPSHOT_KEY);
      const phone = paymentResult.pointsTargetPhone || page1Snapshot.phone;
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

  const resetAll = () => {
    [page1Form, odDsForm, odDcForm, osDsForm, osDcForm, page2Form].forEach((f) =>
      f.resetFields()
    );
    page1Form.setFieldsValue({ record_date: dayjs() });
    page2Form.setFieldsValue({ review_cycle_days: DEFAULT_REVIEW_CYCLE_DAYS });
    setPage1Snapshot({});
    setCurrent(0);
    setOriginalAmount(0);
    sessionStorage.removeItem(FORM_SNAPSHOT_KEY);
  };

  // 按 IMPLEMENTATION.md Phase 4：办卡跳转按钮
  // 规则：输入姓名+手机号后，若会员匹配列表为空 → 可点；已有会员 → 禁用
  // 跳转时自动带入已填姓名/手机号/住址/年龄/生日；返回时保留已填数据（用 sessionStorage 快照）
  const handleGoRegister = () => {
    const v = page1Form.getFieldsValue();
    // 暂存全部表单数据，返回时恢复
    const snapshot = {
      page1: {
        ...v,
        record_date: v.record_date ? dayjs(v.record_date).format('YYYY-MM-DD') : '',
      },
      odDs: odDsForm.getFieldsValue(),
      odDc: odDcForm.getFieldsValue(),
      osDs: osDsForm.getFieldsValue(),
      osDc: osDcForm.getFieldsValue(),
      page2: page2Form.getFieldsValue(),
      currentPage: current,
    };
    sessionStorage.setItem(FORM_SNAPSHOT_KEY, JSON.stringify(snapshot));
    navigate('/customer/register', {
      state: {
        name: v.name || '',
        phone: v.phone || '',
        address: v.address || '',
        age: v.age || undefined,
        // birthday 不在验光单 page1 表单中，但若未来加入则一并带入
      },
    });
  };

  // 办卡按钮可点条件：姓名和手机号都已填 + 会员匹配为空
  const canGoRegister = (() => {
    const name = String(page1Snapshot.name || page1Form.getFieldValue('name') || '').trim();
    const phone = String(page1Snapshot.phone || page1Form.getFieldValue('phone') || '').trim();
    const hasNamePhone = name && /^\d{11}$/.test(phone);
    const hasMember = !!memberMatch;
    return hasNamePhone && !hasMember;
  })();

  // 按 IMPLEMENTATION.md Phase 0 Bug-1 调整：
  // 渲染所有步骤、用 CSS display 控制显隐，确保所有 Form.Item 始终挂载，字段值始终可取。
  const renderStep = () => {
    const steps = [
      <Page1Basic form={page1Form} onMemberChange={setMemberMatch} />,
      <div>
        {/* 第2页：全部眼部信息 */}
        <PageEye form={odDsForm} eye="od" rxType="ds" />
        <PageEye form={odDcForm} eye="od" rxType="dc" />
        <PageEye form={osDsForm} eye="os" rxType="ds" />
        <PageEye form={osDcForm} eye="os" rxType="dc" />
        {/* 第2页：金额 + 瞳距 + 复查时间 + 备注 + 登记人 */}
        <Form form={page2Form} layout="vertical" style={{ maxWidth: 560, marginTop: 16 }}
          initialValues={{ review_cycle_days: DEFAULT_REVIEW_CYCLE_DAYS }}>
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
          {/* 按 IMPLEMENTATION.md Phase 4 / 1.2：复查周期，默认 90 天 */}
          <Form.Item
            label="复查周期（天）"
            name="review_cycle_days"
            rules={[{ required: true, message: '请输入复查周期' }]}
            extra={`默认 ${DEFAULT_REVIEW_CYCLE_DAYS} 天（3 个月）`}
          >
            <InputNumber min={1} step={1} precision={0} style={{ width: '100%' }} placeholder="复查周期天数" />
          </Form.Item>
          {/* 按 IMPLEMENTATION.md Phase 4 / 1.6：备注显式列 */}
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
          <Form.Item label="登记人" name="operator" rules={[{ required: true, message: '请选择登记人' }]}>
            <Select
              placeholder={opLoading ? '加载中...' : '请选择登记人（仅配镜部）'}
              loading={opLoading}
              allowClear
            >
              {opticalOperators.map((op) => (
                <Select.Option key={op.id} value={op.name}>
                  {op.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </div>,
    ];
    return steps.map((node, i) => (
      <div key={i} style={{ display: i === current ? 'block' : 'none' }}>
        {node}
      </div>
    ));
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
        items={PAGE_TITLES.map((t) => ({ title: t }))}
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
          {/* 按 IMPLEMENTATION.md Phase 4：办卡跳转按钮，放在"下一步"按钮之前 */}
          {current === 0 && (
            <Tooltip
              title={
                memberMatch
                  ? '该手机号已有会员，无需办卡'
                  : !canGoRegister
                    ? '请先填写姓名和手机号'
                    : '该客户非会员，可跳转办理会员卡'
              }
            >
              <Button
                icon={<UserAddOutlined />}
                disabled={!canGoRegister}
                onClick={handleGoRegister}
              >
                办卡
              </Button>
            </Tooltip>
          )}
          {current < PAGE_TITLES.length - 1 ? (
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

      <PaymentModal
        open={payModalOpen}
        originalAmount={originalAmount}
        selfPhone={page1Snapshot.phone || ''}
        onOk={(result) => doSubmit(result)}
        onCancel={() => setPayModalOpen(false)}
      />
    </Card>
  );
}
