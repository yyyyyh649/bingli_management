// 按用户新需求 Phase C：回收站（软删除保留30天，可恢复，禁删回收站内容）
import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Select,
  Tag,
  Empty,
  Spin,
  Alert,
  Typography,
  message,
} from 'antd';
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { listRecycleBin, restoreRecycleBin } from '../../api/admin.js';
import DeletePasswordModal from '../../components/DeletePasswordModal.jsx';
import dayjs from 'dayjs';

const { Text } = Typography;

const TABLE_LABELS = {
  customers: '客户/会员',
  cases: '病例',
  prescriptions: '验光单',
  points_ledger: '积分明细',
  balance_ledger: '余额明细',
  operators: '登记人',
  form_templates: '模板',
};

const TABLE_COLORS = {
  customers: 'blue',
  cases: 'purple',
  prescriptions: 'cyan',
  points_ledger: 'gold',
  balance_ledger: 'green',
  operators: 'orange',
  form_templates: 'geekblue',
};

export default function RecycleBin() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [restoreItem, setRestoreItem] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRecycleBin(tableFilter);
      setData(Array.isArray(result) ? result : []);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [tableFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (password) => {
    if (!restoreItem) return;
    setRestoring(true);
    try {
      await restoreRecycleBin(restoreItem.id, password);
      message.success(`已恢复：${restoreItem.name}`);
      setRestoreItem(null);
      load();
    } catch (e) {
      // 拦截器已提示
    } finally {
      setRestoring(false);
    }
  };

  const columns = [
    {
      title: '删除时间',
      dataIndex: 'deleted_at',
      width: 170,
      render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-'),
    },
    {
      title: '类型',
      dataIndex: 'table_name',
      width: 110,
      render: (v) => <Tag color={TABLE_COLORS[v] || 'default'}>{TABLE_LABELS[v] || v}</Tag>,
    },
    {
      title: '名称/标识',
      dataIndex: 'name',
      render: (v) => v || '-',
    },
    { title: '门店', dataIndex: 'store', width: 90, render: (v) => v || '-' },
    { title: '操作人', dataIndex: 'operator', width: 100, render: (v) => v || '-' },
    {
      title: '到期时间',
      dataIndex: 'expires_at',
      width: 170,
      render: (v) => {
        if (!v) return '-';
        const d = dayjs(v);
        const now = dayjs();
        const daysLeft = d.diff(now, 'day');
        return (
          <span>
            {d.format('YYYY-MM-DD HH:mm')}
            <br />
            {daysLeft > 0 ? (
              <Text type="secondary" style={{ fontSize: 12 }}>剩 {daysLeft} 天</Text>
            ) : (
              <Text type="danger" style={{ fontSize: 12 }}>已到期</Text>
            )}
          </span>
        );
      },
    },
    {
      title: '操作',
      width: 100,
      render: (_, r) => (
        <Button
          type="primary"
          size="small"
          icon={<UndoOutlined />}
          onClick={() => setRestoreItem(r)}
        >
          恢复
        </Button>
      ),
    },
  ];

  return (
    <Card title="回收站">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message="已删除的记录在此保留30天，期间可恢复。回收站内的内容不可手动删除，到期后自动清理。"
        />

        <Space wrap>
          <Select
            placeholder="筛选类型"
            value={tableFilter || undefined}
            onChange={(v) => setTableFilter(v || '')}
            allowClear
            style={{ width: 140 }}
          >
            {Object.entries(TABLE_LABELS).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v}</Select.Option>
            ))}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        </Space>

        <Spin spinning={loading}>
          {data.length ? (
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={data}
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          ) : (
            <Empty description="回收站为空" />
          )}
        </Spin>
      </Space>

      <DeletePasswordModal
        open={!!restoreItem}
        title="恢复确认"
        content={`确认恢复「${restoreItem?.name || ''}」到原表？恢复后将重新同步到所有门店。`}
        okText="确认恢复"
        confirmLoading={restoring}
        onOk={handleRestore}
        onCancel={() => setRestoreItem(null)}
      />
    </Card>
  );
}
