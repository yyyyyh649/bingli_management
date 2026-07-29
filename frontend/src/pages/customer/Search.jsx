import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card, Input, Button, Table, Tag, Space, Empty, message, Tooltip, Badge,
} from 'antd';
import {
  SearchOutlined, DeleteOutlined, BellOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  searchCustomers, listCustomers, deleteCustomer,
  getReviewReminders, updateCustomerReview,
} from '../../api/customers.js';
import DeletePasswordModal from '../../components/DeletePasswordModal.jsx';
import { REVIEW_CONTACT_STATUS, REVIEW_CONTACT_STATUS_LABELS } from '@optical/shared/constants.js';

const CONTACT_STATUS_COLOR = {
  pending: 'red',
  contacted: 'orange',
  visited: 'green',
};

// 按 IMPLEMENTATION.md Phase 3：原"客户查询"改名为"会员查询"（数据源仍为 customers 表）
export default function MemberSearch() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reminders, setReminders] = useState({ optical: [], ophthalmology: [] });
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // 待删除客户

  // 复查提醒：phone → 提醒信息（合并配镜部/眼科部，取逾期更久的）
  const reminderMap = useMemo(() => {
    const map = new Map();
    for (const r of reminders.optical) {
      const prev = map.get(r.phone);
      if (!prev || r.overdue_days > prev.overdue_days) {
        map.set(r.phone, { ...r, dept: 'optical' });
      }
    }
    for (const r of reminders.ophthalmology) {
      const prev = map.get(r.phone);
      if (!prev || r.overdue_days > prev.overdue_days) {
        map.set(r.phone, { ...r, dept: 'ophthalmology' });
      } else if (prev.dept === 'optical' && r.overdue_days > 0) {
        // 已有配镜部提醒，补充眼科部标记
        prev.ophthalmologyOverdue = r.overdue_days;
      }
    }
    return map;
  }, [reminders]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, rem] = await Promise.all([listCustomers(), getReviewReminders()]);
      setResults(Array.isArray(list) ? list : []);
      setReminders(rem || { optical: [], ophthalmology: [] });
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const doSearch = async () => {
    const q = keyword.trim();
    if (!q) {
      loadAll();
      return;
    }
    setLoading(true);
    try {
      const list = await searchCustomers(q);
      setResults(Array.isArray(list) ? list : []);
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // 排序：需复查置顶（按逾期天数降序），其余按创建时间倒序
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const ra = reminderMap.get(a.phone);
      const rb = reminderMap.get(b.phone);
      if (ra && !rb) return -1;
      if (!ra && rb) return 1;
      if (ra && rb) return rb.overdue_days - ra.overdue_days;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }, [results, reminderMap]);

  const handleDelete = async (password) => {
    if (!deleteTarget) return;
    await deleteCustomer(deleteTarget.id, password);
    message.success('客户已删除');
    setDeleteTarget(null);
    await loadAll();
  };

  // 切换联系状态
  const cycleStatus = (current) => {
    const order = [REVIEW_CONTACT_STATUS.PENDING, REVIEW_CONTACT_STATUS.CONTACTED, REVIEW_CONTACT_STATUS.VISITED];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  };

  const handleToggleStatus = async (record) => {
    const reminder = reminderMap.get(record.phone);
    const current = reminder?.review_contact_status || record.review_contact_status || REVIEW_CONTACT_STATUS.PENDING;
    const next = cycleStatus(current);
    try {
      await updateCustomerReview(record.id, { reviewContactStatus: next });
      message.success(`联系状态已更新为「${REVIEW_CONTACT_STATUS_LABELS[next]}」`);
      // 刷新复查提醒
      const rem = await getReviewReminders();
      setReminders(rem || { optical: [], ophthalmology: [] });
    } catch (e) {
      // 拦截器已提示
    }
  };

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v, r) => {
        const reminder = reminderMap.get(r.phone);
        return (
          <Space>
            <span>{v || '-'}</span>
            {reminder && (
              <Tooltip title={`需复查：逾期 ${reminder.overdue_days} 天`}>
                <Tag color="red" style={{ margin: 0 }}>需复查</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: '会员卡号',
      dataIndex: 'member_card_no',
      key: 'member_card_no',
      render: (v) => (v ? <Tag color="gold">{v}</Tag> : <Tag>非会员</Tag>),
    },
    {
      title: '复查联系状态',
      key: 'review_status',
      width: 130,
      render: (_, r) => {
        const reminder = reminderMap.get(r.phone);
        if (!reminder) return <Tag>无</Tag>;
        const status = reminder.review_contact_status || REVIEW_CONTACT_STATUS.PENDING;
        return (
          <Tooltip title="点击切换状态">
            <Tag
              color={CONTACT_STATUS_COLOR[status]}
              style={{ cursor: 'pointer', margin: 0 }}
              onClick={() => handleToggleStatus(r)}
            >
              {REVIEW_CONTACT_STATUS_LABELS[status]}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '创建门店',
      dataIndex: 'store',
      key: 'store',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/customer/profile/${r.phone}`)}>
            详情
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => setDeleteTarget(r)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const totalOverdue = reminders.optical.length + reminders.ophthalmology.length;

  return (
    <Card title="会员查询">
      <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
        <div style={{ color: '#888', fontSize: 12 }}>
          支持按 手机号后4位 / 完整手机号 / 姓名 / 会员卡号 查询，系统自动判断。需复查会员自动标红置顶。
        </div>
        <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
          <Input
            placeholder="输入查询关键字"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={doSearch}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={doSearch} loading={loading}>
            查询
          </Button>
        </Space.Compact>
      </Space>

      {!loading && results.length === 0 ? (
        <Empty description="未找到匹配会员" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={sortedResults}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          rowClassName={(r) => (reminderMap.get(r.phone) ? 'review-overdue-row' : '')}
        />
      )}

      {/* 右下角复查提醒浮窗 */}
      <div
        style={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          zIndex: 1000,
        }}
      >
        {remindersOpen && (
          <Card
            size="small"
            title="复查提醒"
            extra={<Button type="text" size="small" onClick={() => setRemindersOpen(false)}>收起</Button>}
            style={{ width: 360, marginBottom: 8, maxHeight: '60vh', overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
          >
            <ReminderList title="配镜部（验光单）" items={reminders.optical} navigate={navigate} onToggle={handleToggleStatus} />
            <ReminderList title="眼科部（病例）" items={reminders.ophthalmology} navigate={navigate} onToggle={handleToggleStatus} />
            {totalOverdue === 0 && <Empty description="暂无待复查客户" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        )}
        <Badge count={totalOverdue} offset={[-4, 4]}>
          <Button
            type="primary"
            danger={totalOverdue > 0}
            shape="circle"
            size="large"
            icon={<BellOutlined />}
            onClick={() => setRemindersOpen((v) => !v)}
          />
        </Badge>
      </div>

      <DeletePasswordModal
        open={!!deleteTarget}
        title="删除客户"
        content={`将删除客户「${deleteTarget?.name || ''}」（${deleteTarget?.phone || ''}），积分/病例/验光单历史记录保留。此操作不可撤销。`}
        onOk={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <style>{`
        .review-overdue-row td {
          background: #fff1f0 !important;
        }
      `}</style>
    </Card>
  );
}

// 复查提醒子列表
function ReminderList({ title, items, navigate, onToggle }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#cf1322' }}>
        {title}（{items.length} 人）
      </div>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {items.map((r) => {
          const status = r.review_contact_status || REVIEW_CONTACT_STATUS.PENDING;
          return (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px dashed #f0f0f0' }}>
              <Space size={6}>
                <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/customer/profile/${r.phone}`)}>
                  {r.name || '-'}
                </Button>
                <span style={{ fontSize: 12, color: '#999' }}>{r.phone}</span>
                <Tag color="red" style={{ margin: 0 }}>逾期{r.overdue_days}天</Tag>
              </Space>
              <Tag
                color={CONTACT_STATUS_COLOR[status]}
                style={{ cursor: 'pointer', margin: 0 }}
                onClick={() => onToggle(r)}
              >
                {REVIEW_CONTACT_STATUS_LABELS[status]}
              </Tag>
            </div>
          );
        })}
      </Space>
    </div>
  );
}
