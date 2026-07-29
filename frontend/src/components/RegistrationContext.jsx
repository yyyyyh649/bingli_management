import React, { useState, useEffect, useRef } from 'react';
import { Card, Spin, Tag, Space, Button, Empty, Typography, Descriptions, Statistic, Row, Col, List } from 'antd';
import {
  UserOutlined, EyeOutlined, UserAddOutlined, HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getRegistrationContext } from '../api/customers.js';

const { Text } = Typography;

// 按 IMPLEMENTATION.md Phase 3：验光单登记页双区
// 输入姓名或手机号后，下方同时渲染：
//   1. 会员信息区：是否会员、余额/积分，按钮=跳会员详情 / 一键办卡
//   2. 客户历史区：该人过往验光/病历，可跳历史结果
//
// props: { name, phone, onPrefillRegister, onMemberChange }
//   onPrefillRegister: 点击"一键办卡"时回调，用于带入已填数据跳转会员登记
//   onMemberChange:    (member|null) => void，会员匹配结果变化时通知父级
//                      按 IMPLEMENTATION.md Phase 4：父级据此控制"办卡跳转按钮"可点/禁用
export default function RegistrationContext({ name, phone, onPrefillRegister, onMemberChange }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const qName = String(name || '').trim();
    const qPhone = String(phone || '').trim();
    const hasName = qName.length >= 1;
    const hasPhone = /^\d{4,}$/.test(qPhone);
    if (!hasName && !hasPhone) {
      setData(null);
      setSearched(false);
      onMemberChange?.(null);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const ctx = await getRegistrationContext({ name: qName, phone: qPhone });
        setData(ctx);
        setSearched(true);
        onMemberChange?.(ctx?.member || null);
      } catch (e) {
        // 拦截器已提示
        onMemberChange?.(null);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [name, phone]);

  if (!searched) return null;

  const member = data?.member || null;
  const history = data?.history || [];

  const handleRegister = () => {
    if (onPrefillRegister) {
      onPrefillRegister();
    } else {
      navigate('/customer/register');
    }
  };

  return (
    <Spin spinning={loading}>
      <Row gutter={16}>
        {/* 会员信息区 */}
        <Col xs={24} md={10}>
          <Card
            size="small"
            title={<Space><UserOutlined />会员信息</Space>}
            styles={{ body: { padding: 16 } }}
          >
            {member ? (
              <>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="姓名">
                    <Text strong>{member.name || '-'}</Text>
                    <Tag color="gold" style={{ marginLeft: 8 }}>会员</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="手机号">{member.phone}</Descriptions.Item>
                  {member.member_card_no ? (
                    <Descriptions.Item label="卡号">{member.member_card_no}</Descriptions.Item>
                  ) : null}
                </Descriptions>
                <Row gutter={16} style={{ marginTop: 8 }}>
                  <Col>
                    <Statistic
                      title="余额"
                      value={Number(member.balance || 0)}
                      precision={2}
                      prefix="¥"
                      valueStyle={{ color: '#52c41a', fontSize: 20 }}
                    />
                  </Col>
                  <Col>
                    <Statistic
                      title="积分"
                      value={Number(member.points || 0)}
                      suffix="分"
                      valueStyle={{ color: '#1677ff', fontSize: 20 }}
                    />
                  </Col>
                </Row>
                <Button
                  type="link"
                  icon={<EyeOutlined />}
                  style={{ paddingLeft: 0, marginTop: 8 }}
                  onClick={() => navigate(`/customer/profile/${member.phone}`)}
                >
                  查看会员详情
                </Button>
              </>
            ) : (
              <div>
                <Tag>非会员</Tag>
                <Text type="secondary" style={{ marginLeft: 8 }}>该姓名/手机号未匹配到会员</Text>
                <div style={{ marginTop: 12 }}>
                  <Button type="primary" icon={<UserAddOutlined />} onClick={handleRegister}>
                    一键办卡
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </Col>

        {/* 客户历史区 */}
        <Col xs={24} md={14}>
          <Card
            size="small"
            title={<Space><HistoryOutlined />客户历史（{history.length}）</Space>}
            styles={{ body: { padding: history.length ? 0 : 16 } }}
          >
            {history.length === 0 ? (
              <Empty description="暂无历史记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <List
                size="small"
                dataSource={history}
                renderItem={(r) => (
                  <List.Item
                    actions={[
                      <Button
                        type="link"
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/customer/profile/${r.customer_phone || ''}`)}
                      >
                        查看
                      </Button>,
                    ]}
                  >
                    <Space size={8} wrap>
                      <Tag color={r.type === 'prescription' ? 'cyan' : 'purple'}>
                        {r.type === 'prescription' ? '验光单' : '病例'}
                      </Tag>
                      <Text>{r.record_date || '-'}</Text>
                      <Text type="secondary">{r.customer_name || '-'}</Text>
                      <Text type="secondary">{r.customer_phone || ''}</Text>
                      {r.operator ? <Text type="secondary">登记人：{r.operator}</Text> : null}
                    </Space>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </Spin>
  );
}
