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
} from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { getCustomerProfile } from '../../api/customers.js';
import PointsLedgerTable from '../../components/PointsLedgerTable.jsx';
import CaseDetail from '../../components/CaseDetail.jsx';
import PrescriptionDetail from '../../components/PrescriptionDetail.jsx';
import { CASE_MODE } from '@optical/shared/constants.js';

export default function CustomerProfile() {
  const { phone } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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
    if (!data?.points_ledger) return 0;
    return data.points_ledger.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [data]);

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
  const points = data.points_ledger || [];
  const cases = data.cases || [];
  const prescriptions = data.prescriptions || [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card
        title="个人信息"
        extra={
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => navigate(`/admin/points?phone=${encodeURIComponent(customer.phone || phone)}`)}
          >
            手动加减积分
          </Button>
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
        <Row gutter={16}>
          <Col>
            <Statistic
              title="当前积分"
              value={currentPoints}
              valueStyle={{ fontSize: 36, fontWeight: 700, color: '#1677ff' }}
              suffix="分"
            />
          </Col>
        </Row>
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
            items={prescriptions.map((p) => ({
              key: p.id,
              label: (
                <Space size={8} wrap>
                  <span>登记日期：{p.record_date || '-'}</span>
                  <span>门店：{p.store || '-'}</span>
                  <span>登记人：{p.operator || '-'}</span>
                  {p.points_amount ? (
                    <Tag color="green">+{p.points_amount} 分</Tag>
                  ) : null}
                </Space>
              ),
              children: <PrescriptionDetail prescription={p} />,
            }))}
          />
        )}
      </Card>
    </Space>
  );
}
