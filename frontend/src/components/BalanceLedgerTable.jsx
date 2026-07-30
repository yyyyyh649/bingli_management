import React from 'react';
import { Table, Tag, Empty } from 'antd';

// 余额来源类型 → 中文标签
export const BALANCE_SOURCE_LABELS = {
  topup: '充值',
  consume: '消费抵扣',
  manual_deduct: '手动扣减',
};

// 余额明细表（与积分明细对称）
// props: { balance, loading }
export default function BalanceLedgerTable({ balance = [], loading = false }) {
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
            {positive ? `+${num.toFixed(2)}` : num.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: '实充金额',
      dataIndex: 'actual_amount',
      key: 'actual_amount',
      width: 100,
      align: 'right',
      render: (v, r) => {
        // 按用户新需求 Phase E：充值显示实充金额，扣减显示 -
        if (r.source_type !== 'topup' || v == null) return '-';
        return <span style={{ color: '#fa8c16' }}>¥{Number(v).toFixed(2)}</span>;
      },
    },
    {
      title: '来源类型',
      dataIndex: 'source_type',
      key: 'source_type',
      width: 110,
      render: (v) => (
        <Tag color={v === 'topup' ? 'green' : v === 'consume' ? 'blue' : 'orange'}>
          {BALANCE_SOURCE_LABELS[v] || v}
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

  if (!loading && (!balance || balance.length === 0)) {
    return <Empty description="暂无余额明细" />;
  }

  return (
    <Table
      rowKey={(r) => r.id || r.created_at}
      size="small"
      columns={columns}
      dataSource={balance}
      loading={loading}
      pagination={{ pageSize: 10, showSizeChanger: false }}
    />
  );
}
