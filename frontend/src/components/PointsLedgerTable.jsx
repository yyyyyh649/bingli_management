import React from 'react';
import { Table, Tag, Empty } from 'antd';

// 积分来源类型 → 中文标签
export const SOURCE_TYPE_LABELS = {
  prescription: '验光配镜',
  manual_add: '手动加分',
  withdraw: '提现',
  gift_redeem: '兑换小礼品',
};

// 积分明细表（多处复用）
// props: { points, loading }
export default function PointsLedgerTable({ points = [], loading = false }) {
  const columns = [
    {
      title: '日期时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v) => (v ? String(v).replace('T', ' ') : '-'),
    },
    {
      title: '加/减',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      align: 'right',
      render: (v) => {
        if (v == null) return '-';
        const num = Number(v);
        const positive = num >= 0;
        return (
          <span style={{ color: positive ? '#52c41a' : '#f5222d', fontWeight: 600 }}>
            {positive ? `+${num}` : num}
          </span>
        );
      },
    },
    {
      title: '来源类型',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 110,
      render: (v) => (
        <Tag color={v === 'prescription' ? 'blue' : v === 'manual_add' ? 'green' : 'orange'}>
          {SOURCE_TYPE_LABELS[v] || v}
        </Tag>
      ),
    },
    {
      title: '原因/备注',
      key: 'note',
      render: (_, r) => r.note || '-',
    },
    {
      title: '登记门店',
      dataIndex: 'store',
      key: 'store',
      width: 100,
    },
    {
      title: '登记人',
      dataIndex: 'operator',
      key: 'operator',
      width: 100,
      render: (v) => v || '-',
    },
  ];

  if (!loading && (!points || points.length === 0)) {
    return <Empty description="暂无积分明细" />;
  }

  return (
    <Table
      rowKey={(r) => r.id || r.created_at}
      size="small"
      columns={columns}
      dataSource={points}
      loading={loading}
      pagination={{ pageSize: 10, showSizeChanger: false }}
    />
  );
}
