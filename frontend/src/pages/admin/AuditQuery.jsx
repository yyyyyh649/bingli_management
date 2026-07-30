import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Space, Spin, Empty, Typography, Input, Button, Select, DatePicker, Alert,
} from 'antd';
import dayjs from 'dayjs';
import { getAuditQuery } from '../../api/admin.js';

const { Text } = Typography;

// 按用户新需求 Phase I：服务器端变更记录查询（防篡改审计）
// 查云端 cloud_change_log，按日期/小时/表/操作/门店 筛选
const TABLE_LABELS = {
  customers: '会员',
  cases: '病例',
  prescriptions: '验光单',
  points_ledger: '积分流水',
  balance_ledger: '余额流水',
  operators: '登记人',
};

const OP_LABELS = { upsert: '写入/修改', delete: '删除' };
const OP_COLORS = { upsert: 'blue', delete: 'red' };

export default function AuditQuery() {
  const [date, setDate] = useState(dayjs());
  const [hour, setHour] = useState('');
  const [table, setTable] = useState('');
  const [operation, setOperation] = useState('');
  const [store, setStore] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getAuditQuery({
        date: date ? date.format('YYYY-MM-DD') : '',
        hour,
        table,
        operation,
        store,
      });
      setData(result);
    } catch (e) {
      setError(e?.message || '查询失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, hour, table, operation, store]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { title: '序号', dataIndex: 'id', width: 70 },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => (v ? String(v).replace('T', ' ') : '-'),
    },
    {
      title: '表',
      dataIndex: 'table_name',
      width: 100,
      render: (v) => <Tag>{TABLE_LABELS[v] || v}</Tag>,
    },
    {
      title: '操作',
      dataIndex: 'operation',
      width: 100,
      render: (v) => <Tag color={OP_COLORS[v] || 'default'}>{OP_LABELS[v] || v}</Tag>,
    },
    { title: '门店', dataIndex: 'source_store', width: 100, render: (v) => v || '-' },
    { title: '记录ID', dataIndex: 'record_id', width: 120, render: (v) => <Text code>{String(v || '').slice(0, 12)}</Text> },
    {
      title: '数据预览',
      dataIndex: 'payload_preview',
      render: (v) => {
        if (!v) return <Text type="secondary">（删除/无数据）</Text>;
        const s = String(v);
        return (
          <Text style={{ fontSize: 12, wordBreak: 'break-all' }} type="secondary">
            {s.length > 200 ? s.slice(0, 200) + '…' : s}
          </Text>
        );
      },
    },
  ];

  return (
    <Card title="服务器变更记录查询（防篡改审计）">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="此页面查询云端服务器记录的所有写入/修改/删除操作，用于排查异常改动。数据来源：cloud_change_log。"
        />
        <Space wrap>
          <DatePicker value={date} onChange={(d) => setDate(d)} allowClear={false} />
          <Select
            placeholder="小时（可选）"
            value={hour || undefined}
            onChange={(v) => setHour(v || '')}
            allowClear
            style={{ width: 100 }}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <Select.Option key={i} value={String(i).padStart(2, '0')}>
                {String(i).padStart(2, '0')}时
              </Select.Option>
            ))}
          </Select>
          <Select
            placeholder="数据表"
            value={table || undefined}
            onChange={(v) => setTable(v || '')}
            allowClear
            style={{ width: 130 }}
          >
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="操作类型"
            value={operation || undefined}
            onChange={(v) => setOperation(v || '')}
            allowClear
            style={{ width: 130 }}
          >
            {Object.entries(OP_LABELS).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v}</Select.Option>
            ))}
          </Select>
          <Input
            placeholder="门店ID"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            style={{ width: 120 }}
            allowClear
          />
          <Button type="primary" onClick={load} loading={loading}>查询</Button>
        </Space>

        {error && <Alert type="error" showIcon message={error} />}

        <Spin spinning={loading}>
          {data?.length ? (
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={data}
              pagination={{ pageSize: 50, showSizeChanger: true }}
            />
          ) : (
            <Empty description={error ? '查询失败' : '无变更记录'} />
          )}
        </Spin>
      </Space>
    </Card>
  );
}
