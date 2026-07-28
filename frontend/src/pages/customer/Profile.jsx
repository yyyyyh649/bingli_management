import React, { useEffect, useState, useMemo } from 'react';
import {
  Card,
  Descriptions,
  Spin,
  Empty,
  Collapse,
  Tag,
  Button,
  Statistic,
  Row,
  Col,
  Space,
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  message,
} from 'antd';
import { EditOutlined, WalletOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { getCustomerProfile } from '../../api/customers.js';
import { createBalance } from '../../api/balance.js';
import { useOperators } from '../../api/operators.js';
import { BALANCE_SOURCE } from '@optical/shared/constants.js';
import PointsLedgerTable from '../../components/PointsLedgerTable.jsx';
import BalanceLedgerTable from '../../components/BalanceLedgerTable.jsx';
import CaseDetail from '../../components/CaseDetail.jsx';
import PrescriptionDetail from '../../components/PrescriptionDetail.jsx';
import { CASE_MODE } from '@optical/shared/constants.js';

export default function CustomerProfile() {
  const { phone } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [balanceModalOpen, setBalanceModalOpen] = useState(false);
  const [balanceType, setBalanceType] = useState('topup'); // 'topup' | 'deduct'
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);
  const [balanceForm] = Form.useForm();
  const { operators } = useOperators();

  const load = async () => {
    setLoading(true);
    try {
      const profile = await getCustomerProfile(phone);
      setData(profile);
    } catch (e) {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const currentPoints = useMemo(() => {
    if (data?.totalPoints != null) return data.totalPoints;
    if (!data?.pointsLedger) return 0;
    return data.pointsLedger.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [data]);

  const currentBalance = useMemo(() => {
    if (data?.totalBalance != null) return data.totalBalance;
    if (!data?.balanceLedger) return 0;
    return data.balanceLedger.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  }, [data]);

  const openBalanceModal = (type) => {
    setBalanceType(type);
    balanceForm.resetFields();
    setBalanceModalOpen(true);
  };

  const handleBalanceSubmit = async () => {
    try {
      const values = await balanceForm.validateFields();
      setBalanceSubmitting(true);
      const amt =
        balanceType === 'topup'
          ? Math.abs(Number(values.amount))
          : -Math.abs(Number(values.amount));
      await createBalance({
        customerPhone: phone,
        amount: amt,
        sourceType: balanceType === 'topup' ? BALANCE_SOURCE.TOPUP : BALANCE_SOURCE.MANUAL_DEDUCT,
        note: values.note || '',
        operator: values.operator || '',
      });
      message.success(balanceType === 'topup' ? '充值成功' : '扣减成功');
      setBalanceModalOpen(false);
      await load();
    } catch (e) {
      // 校验失败或 API 错误
    } finally {
      setBalanceSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!data) {
    return <Empty description="未找到客户信息" />;
  }

  const customer = data.customer || {};
  const points = data.pointsLedger || [];
  const balanceLedger = data.balanceLedger || [];
  const cases = data.cases || [];
  const prescriptions = data.prescriptions || [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="个人信息"
        extra={
          <Space>
            <Button
              icon={<WalletOutlined />}
              onClick={() => openBalanceModal('topup')}
            >
              充值
            </Button>
            <Button
              danger
              icon={<WalletOutlined />}
              onClick={() => openBalanceModal('deduct')}
            >
              扣减余额
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => navigate(`/admin/points?phone=${encodeURIComponent(customer.phone || phone)}`)}
            >
              手动加减积分
            </Button>
          </Space>
        }
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="姓名">{customer.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="手机号">{customer.phone || phone}</Descriptions.Item>
          <Descriptions.Item label="住址">{customer.address || '-'}</Descriptions.Item>
          <Descriptions.Item label="会员卡号">
            {customer.member_card_no ? (
              <Tag color="gold">{customer.member_card_no}</Tag>
            ) : (
              <Tag>非会员</Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="创建门店">{customer.store || '-'}</Descriptions.Item>
          <Descriptions.Item label="登记人">{customer.operator || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Row gutter={32}>
          <Col>
            <Statistic
              title="当前积分"
              value={currentPoints}
              valueStyle={{ fontSize: 36, fontWeight: 700, color: '#1677ff' }}
              suffix="分"
            />
          </Col>
          <Col>
            <Statistic
              title="当前余额"
              value={currentBalance}
              precision={2}
              valueStyle={{ fontSize: 36, fontWeight: 700, color: '#52c41a' }}
              prefix="¥"
              suffix=""
            />
          </Col>
        </Row>
      </Card>

      <Card title="余额明细">
        <BalanceLedgerTable balance={balanceLedger} />
      </Card>

      <Card title="积分明细">
        <PointsLedgerTable points={points} />
      </Card>

      <Card title={`病例记录（${cases.length}）`}>
        {cases.length === 0 ? (
          <Empty description="暂无病例" />
        ) : (
          <Collapse
            items={cases.map((c) => ({
              key: c.id,
              label: (
                <Space size={8} wrap>
                  <Tag color={c.mode === CASE_MODE.COMPLEX ? 'purple' : 'blue'}>
                    {c.mode === CASE_MODE.COMPLEX ? '复杂' : '简约'}
                  </Tag>
                  <span>登记日期：{c.record_date || '-'}</span>
                  <span>门店：{c.store || '-'}</span>
                  <span>登记人：{c.operator || '-'}</span>
                </Space>
              ),
              children: <CaseDetail caseRecord={c} />,
            }))}
          />
        )}
      </Card>

      <Card title={`验光单记录（${prescriptions.length}）`}>
        {prescriptions.length === 0 ? (
          <Empty description="暂无验光单" />
        ) : (
          <Collapse
            items={prescriptions.map((p) => (
              {
                key: p.id,
                label: (
                  <Space size={8} wrap>
                    <span>登记日期：{p.record_date || '-'}</span>
                    <span>门店：{p.store || '-'}</span>
                    <span>登记人：{p.operator || '-'}</span>
                    {p.paid_amount != null && Number(p.paid_amount) > 0 && (
                      <Tag color="cyan">实付 ¥{Number(p.paid_amount).toFixed(2)}</Tag>
                    )}
                    {p.points_earned ? (
                      <Tag color="green">+{p.points_earned} 分</Tag>
                    ) : null}
                  </Space>
                ),
                children: <PrescriptionDetail prescription={p} />,
              }
            ))}
          />
        )}
      </Card>

      {/* 充值 / 扣减余额 Modal */}
      <Modal
        open={balanceModalOpen}
        title={balanceType === 'topup' ? '余额充值' : '余额扣减'}
        okText={balanceType === 'topup' ? '充值' : '扣减'}
        cancelText="取消"
        onOk={handleBalanceSubmit}
        onCancel={() => setBalanceModalOpen(false)}
        confirmLoading={balanceSubmitting}
        destroyOnClose
      >
        <div style={{ marginBottom: 16, color: '#888' }}>
          客户：{customer.name || '-'}（{phone}）
          {balanceType === 'deduct' && (
            <span style={{ marginLeft: 12 }}>
              当前余额：<strong style={{ color: '#52c41a' }}>¥{currentBalance.toFixed(2)}</strong>
            </span>
          )}
        </div>
        <Form form={balanceForm} layout="vertical">
          <Form.Item
            label={balanceType === 'topup' ? '充值金额（元）' : '扣减金额（元）'}
            name="amount"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              min={0.01}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="请输入金额"
            />
          </Form.Item>
          <Form.Item
            label="登记人"
            name="operator"
            rules={[{ required: true, message: '请选择登记人' }]}
          >
            <Select placeholder="请选择登记人" allowClear>
              {operators.map((op) => (
                <Select.Option key={op.id} value={op.name}>
                  {op.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="备注（可选）" name="note">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
