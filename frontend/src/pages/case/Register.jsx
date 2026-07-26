import React from 'react';
import { Card, Row, Col, Typography } from 'antd';
import { FileTextOutlined, ApartmentOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

export default function CaseRegister() {
  const navigate = useNavigate();
  const cards = [
    {
      key: 'simple',
      title: '简约模式',
      desc: '快速登记：姓名、性别、手机号、病情等基础字段',
      icon: <FileTextOutlined style={{ fontSize: 40, color: '#1677ff' }} />,
      onClick: () => navigate('/case/simple'),
    },
    {
      key: 'complex',
      title: '复杂模式',
      desc: '问卷分支引擎：根据作答动态跳转下一题',
      icon: <ApartmentOutlined style={{ fontSize: 40, color: '#722ed1' }} />,
      onClick: () => navigate('/case/complex'),
    },
  ];

  return (
    <div>
      <Title level={3}>病例登记</Title>
      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col xs={24} sm={12} key={c.key}>
            <Card hoverable onClick={c.onClick} style={{ height: '100%' }} bodyStyle={{ padding: 32, textAlign: 'center' }}>
              <div style={{ marginBottom: 16 }}>{c.icon}</div>
              <Title level={4} style={{ marginTop: 0 }}>{c.title}</Title>
              <Text type="secondary">{c.desc}</Text>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
