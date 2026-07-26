import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Spin, Typography } from 'antd';
import {
  UserAddOutlined,
  EyeOutlined,
  FileTextOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import client from '../api/client.js';

const { Title, Text } = Typography;

export default function Home() {
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await client.get('/health');
        if (active) setHealth(data);
      } catch (e) {
        // 拦截器已提示
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const cards = [
    {
      key: 'customer',
      title: '会员登记 / 查询',
      desc: '登记新会员、查询客户积分与历史记录',
      icon: <UserAddOutlined style={{ fontSize: 40, color: '#1677ff' }} />,
      onClick: () => navigate('/customer/register'),
    },
    {
      key: 'case',
      title: '病例登记',
      desc: '简约模式 / 复杂问卷分支模式',
      icon: <FileTextOutlined style={{ fontSize: 40, color: '#722ed1' }} />,
      onClick: () => navigate('/case'),
    },
    {
      key: 'prescription',
      title: '验光单登记',
      desc: '6 步向导，自动计算积分',
      icon: <EyeOutlined style={{ fontSize: 40, color: '#13c2c2' }} />,
      onClick: () => navigate('/prescription/new'),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          眼镜店登记系统
        </Title>
        {loading ? (
          <Spin size="small" />
        ) : health ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tag color="blue">当前门店：{health.store || '-'}</Tag>
            <Tag icon={<CloudUploadOutlined />} color={health.sync?.enabled ? 'green' : 'default'}>
              {health.sync?.enabled ? '同步已启用' : '同步未启用'}
            </Tag>
            <Tag color="orange">待同步：{health.sync?.pendingCount ?? 0} 条</Tag>
            {health.sync?.lastPullAt && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                最后同步：{String(health.sync.lastPullAt).replace('T', ' ')}
              </Text>
            )}
          </div>
        ) : (
          <Text type="danger">无法连接后端</Text>
        )}
      </div>

      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col xs={24} sm={12} md={8} key={c.key}>
            <Card
              hoverable
              onClick={c.onClick}
              style={{ height: '100%', textAlign: 'center' }}
              bodyStyle={{ padding: 32 }}
            >
              <div style={{ marginBottom: 16 }}>{c.icon}</div>
              <Title level={4} style={{ marginTop: 0 }}>
                {c.title}
              </Title>
              <Text type="secondary">{c.desc}</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
