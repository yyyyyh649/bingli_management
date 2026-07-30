import React from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  HomeOutlined,
  UserAddOutlined,
  SearchOutlined,
  FileTextOutlined,
  EyeOutlined,
  SettingOutlined,
} from '@ant-design/icons';

import Home from './pages/Home.jsx';
import CustomerRegister from './pages/customer/Register.jsx';
import MemberSearch from './pages/customer/Search.jsx';
import CustomerSearch from './pages/customer/CustomerSearch.jsx';
import CustomerProfile from './pages/customer/Profile.jsx';
import CaseRegister from './pages/case/Register.jsx';
import CaseSimpleForm from './pages/case/SimpleForm.jsx';
import CaseComplexForm from './pages/case/ComplexForm.jsx';
import PrescriptionWizard from './pages/prescription/Wizard.jsx';
import AdminLayout from './pages/admin/Layout.jsx';
import AdminPoints from './pages/admin/PointsManual.jsx';
import AdminDelete from './pages/admin/DeleteRecords.jsx';
import AdminOperators from './pages/admin/Operators.jsx';
import AdminExport from './pages/admin/Export.jsx';
import AdminPerformance from './pages/admin/Performance.jsx';
import AdminDailyLedger from './pages/admin/DailyLedger.jsx';
import AdminRechargeQuery from './pages/admin/RechargeQuery.jsx';
import AdminAuditQuery from './pages/admin/AuditQuery.jsx';
import GlobalReminders from './components/GlobalReminders.jsx';
import NotFound from './pages/NotFound.jsx';

const { Header, Content } = Layout;

export default function App() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  const items = [
    { key: '/', icon: <HomeOutlined />, label: <Link to="/">首页</Link> },
    {
      key: '/customer',
      icon: <UserAddOutlined />,
      label: '会员',
      children: [
        {
          key: '/customer/register',
          icon: <UserAddOutlined />,
          label: <Link to="/customer/register">会员登记</Link>,
        },
        {
          key: '/customer/search',
          icon: <SearchOutlined />,
          label: <Link to="/customer/search">会员查询</Link>,
        },
        {
          key: '/customer/records',
          icon: <SearchOutlined />,
          label: <Link to="/customer/records">客户查询</Link>,
        },
      ],
    },
    {
      key: '/case',
      icon: <FileTextOutlined />,
      label: <Link to="/case">病例登记</Link>,
    },
    {
      key: '/prescription/new',
      icon: <EyeOutlined />,
      label: <Link to="/prescription/new">验光单登记</Link>,
    },
    {
      key: '/admin',
      icon: <SettingOutlined />,
      label: <Link to="/admin">后台管理</Link>,
    },
  ];

  // 计算顶部菜单选中项
  const selectedKeys = (() => {
    const p = location.pathname;
    if (p === '/') return ['/'];
    if (p.startsWith('/admin')) return ['/admin'];
    if (p.startsWith('/customer/register')) return ['/customer/register'];
    if (p.startsWith('/customer/records')) return ['/customer/records'];
    if (p.startsWith('/customer/search')) return ['/customer/search'];
    if (p.startsWith('/customer/profile')) return ['/customer/search'];
    if (p.startsWith('/case')) return ['/case'];
    if (p.startsWith('/prescription')) return ['/prescription/new'];
    return [];
  })();

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      {!isAdmin && (
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            marginBottom: 16,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18, marginRight: 32 }}>
            眼镜店登记系统
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={selectedKeys}
            defaultOpenKeys={['/customer']}
            items={items}
            style={{ flex: 1, borderBottom: 'none' }}
          />
          {/* 按 IMPLEMENTATION.md Phase 5：全站各页提示（今日生日 + 复查超期） */}
          <GlobalReminders />
        </Header>
      )}
      <Content
        style={{
          maxWidth: isAdmin ? '100%' : 1100,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/customer/register" element={<CustomerRegister />} />
          <Route path="/customer/search" element={<MemberSearch />} />
          <Route path="/customer/records" element={<CustomerSearch />} />
          <Route path="/customer/profile/:phone" element={<CustomerProfile />} />
          <Route path="/case" element={<CaseRegister />} />
          <Route path="/case/simple" element={<CaseSimpleForm />} />
          <Route path="/case/complex" element={<CaseComplexForm />} />
          <Route path="/prescription/new" element={<PrescriptionWizard />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/points" replace />} />
            <Route path="points" element={<AdminPoints />} />
            <Route path="delete" element={<AdminDelete />} />
            <Route path="operators" element={<AdminOperators />} />
            <Route path="performance" element={<AdminPerformance />} />
            <Route path="daily-ledger" element={<AdminDailyLedger />} />
            <Route path="recharge" element={<AdminRechargeQuery />} />
            <Route path="audit" element={<AdminAuditQuery />} />
            <Route path="export" element={<AdminExport />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Content>
    </Layout>
  );
}
