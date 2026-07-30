import React from 'react';
import { Layout, Menu, Button } from 'antd';
import {
  HomeOutlined,
  PlusCircleOutlined,
  DeleteOutlined,
  TeamOutlined,
  DownloadOutlined,
  BarChartOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';

const { Sider, Header, Content } = Layout;

const menuItems = [
  {
    key: '/admin/points',
    icon: <PlusCircleOutlined />,
    label: <Link to="/admin/points">手动积分增减</Link>,
  },
  {
    key: '/admin/delete',
    icon: <DeleteOutlined />,
    label: <Link to="/admin/delete">删除记录</Link>,
  },
  {
    key: '/admin/operators',
    icon: <TeamOutlined />,
    label: <Link to="/admin/operators">登记人维护</Link>,
  },
  {
    key: '/admin/export',
    icon: <DownloadOutlined />,
    label: <Link to="/admin/export">数据导出</Link>,
  },
  {
    key: '/admin/performance',
    icon: <BarChartOutlined />,
    label: <Link to="/admin/performance">配镜部绩效</Link>,
  },
  // 按 IMPLEMENTATION.md Phase 5：每日积分/余额消耗明细及办理人
  {
    key: '/admin/daily-ledger',
    icon: <WalletOutlined />,
    label: <Link to="/admin/daily-ledger">每日明细</Link>,
  },
  // 按用户新需求 Phase F：充值数据查询
  {
    key: '/admin/recharge',
    icon: <WalletOutlined />,
    label: <Link to="/admin/recharge">充值查询</Link>,
  },
  // 按用户新需求 Phase I：服务器变更记录查询
  {
    key: '/admin/audit',
    icon: <BarChartOutlined />,
    label: <Link to="/admin/audit">变更记录</Link>,
  },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedKey = menuItems
    .map((m) => m.key)
    .find((k) => location.pathname.startsWith(k));

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff', borderRadius: 8 }}>
      <Sider breakpoint="md" collapsedWidth="0" theme="light" width={220}>
        <div
          style={{
            padding: '16px 20px',
            fontWeight: 700,
            fontSize: 16,
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          后台管理
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          style={{ borderRight: 'none' }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <span style={{ fontWeight: 600 }}>后台管理</span>
          <Button
            type="primary"
            icon={<HomeOutlined />}
            onClick={() => navigate('/')}
          >
            返回首页
          </Button>
        </Header>
        <Content style={{ padding: 24, background: '#f5f5f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
