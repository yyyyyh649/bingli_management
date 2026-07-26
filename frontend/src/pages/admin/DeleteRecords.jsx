import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Input,
  Button,
  Table,
  Space,
  Tag,
  Empty,
  message,
  Typography,
} from 'antd';
import { DeleteOutlined, SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import DeletePasswordModal from '../../components/DeletePasswordModal.jsx';
import {
  searchCustomers,
  getCustomerProfile,
  deleteCustomer,
} from '../../api/customers.js';
import { listPoints, deletePoint } from '../../api/points.js';
import { deleteCase } from '../../api/cases.js';
import { deletePrescription } from '../../api/prescriptions.js';
import { listDeleteLogs } from '../../api/admin.js';
import { CASE_MODE } from '@optical/shared/constants.js';

const { Text } = Typography;

const TAB_KEYS = {
  CUSTOMER: 'customer',
  CASE: 'case',
  PRESCRIPTION: 'prescription',
  POINTS: 'points',
};

export default function DeleteRecords() {
  const [activeTab, setActiveTab] = useState(TAB_KEYS.CUSTOMER);
  const [phone, setPhone] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [delModal, setDelModal] = useState({ open: false, record: null, type: null });
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await listDeleteLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      // 拦截器已提示
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const doSearch = async () => {
    const p = phone.trim();
    if (!p) {
      message.warning('请输入手机号进行查询');
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      if (activeTab === TAB_KEYS.CUSTOMER) {
        const list = await searchCustomers(p);
        setRecords(Array.isArray(list) ? list : []);
      } else if (activeTab === TAB_KEYS.POINTS) {
        const list = await listPoints(p);
        setRecords(Array.isArray(list) ? list : []);
      } else {
        // case / prescription 通过 profile 聚合接口取
        const profile = await getCustomerProfile(p);
        if (activeTab === TAB_KEYS.CASE) {
          setRecords(profile?.cases || []);
        } else {
          setRecords(profile?.prescriptions || []);
        }
      }
    } catch (e) {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const onTabChange = (key) => {
    setActiveTab(key);
    setRecords([]);
    setSearched(false);
    setPhone('');
  };

  const openDelete = (record, type) => {
    setDelModal({ open: true, record, type });
  };

  const handleDelete = async (password) => {
    const { record, type } = delModal;
    try {
      if (type === TAB_KEYS.CUSTOMER) {
        await deleteCustomer(record.id, password);
      } else if (type === TAB_KEYS.POINTS) {
        await deletePoint(record.id, password);
      } else if (type === TAB_KEYS.CASE) {
        await deleteCase(record.id, password);
      } else if (type === TAB_KEYS.PRESCRIPTION) {
        await deletePrescription(record.id, password);
      }
      message.success('删除成功');
      setDelModal({ open: false, record: null, type: null });
      // 刷新列表 + 日志
      await doSearch();
      await loadLogs();
    } catch (e) {
      // 拦截器已提示，Modal 不关闭以便重试
      throw e;
    }
  };

  const columns = (() => {
    if (activeTab === TAB_KEYS.CUSTOMER) {
      return [
        { title: '姓名', dataIndex: 'name', key: 'name', render: (v) => v || '-' },
        { title: '手机号', dataIndex: 'phone', key: 'phone' },
        {
          title: '会员卡号',
          dataIndex: 'member_card_no',
          key: 'member_card_no',
          render: (v) => (v ? <Tag color="gold">{v}</Tag> : <Tag>非会员</Tag>),
        },
        { title: '门店', dataIndex: 'store', key: 'store' },
        {
          title: '创建时间',
          dataIndex: 'created_at',
          key: 'created_at',
          render: (v) => (v ? String(v).replace('T', ' ') : '-'),
        },
        {
          title: '操作',
          key: 'action',
          render: (_, r) => (
            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => openDelete(r, TAB_KEYS.CUSTOMER)}>
              删除
            </Button>
          ),
        },
      ];
    }
    if (activeTab === TAB_KEYS.POINTS) {
      return [
        {
          title: '时间',
          dataIndex: 'created_at',
          key: 'created_at',
          render: (v) => (v ? String(v).replace('T', ' ') : '-'),
        },
        {
          title: '金额',
          dataIndex: 'amount',
          key: 'amount',
          align: 'right',
          render: (v) => {
            const n = Number(v);
            return <span style={{ color: n >= 0 ? '#52c41a' : '#f5222d', fontWeight: 600 }}>{n >= 0 ? `+${n}` : n}</span>;
          },
        },
        { title: '来源', dataIndex: 'source_type', key: 'source_type' },
        { title: '备注', dataIndex: 'note', key: 'note', render: (v) => v || '-' },
        { title: '门店', dataIndex: 'store', key: 'store' },
        { title: '登记人', dataIndex: 'operator', key: 'operator', render: (v) => v || '-' },
        {
          title: '操作',
          key: 'action',
          render: (_, r) => (
            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => openDelete(r, TAB_KEYS.POINTS)}>
              删除
            </Button>
          ),
        },
      ];
    }
    if (activeTab === TAB_KEYS.CASE) {
      return [
        {
          title: '模式',
          dataIndex: 'mode',
          key: 'mode',
          render: (v) => (
            <Tag color={v === CASE_MODE.COMPLEX ? 'purple' : 'blue'}>
              {v === CASE_MODE.COMPLEX ? '复杂' : '简约'}
            </Tag>
          ),
        },
        { title: '姓名', dataIndex: 'customer_name', key: 'customer_name', render: (v) => v || '-' },
        { title: '手机号', dataIndex: 'customer_phone', key: 'customer_phone', render: (v) => v || '-' },
        { title: '登记日期', dataIndex: 'record_date', key: 'record_date' },
        { title: '门店', dataIndex: 'store', key: 'store' },
        { title: '登记人', dataIndex: 'operator', key: 'operator', render: (v) => v || '-' },
        {
          title: '操作',
          key: 'action',
          render: (_, r) => (
            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => openDelete(r, TAB_KEYS.CASE)}>
              删除
            </Button>
          ),
        },
      ];
    }
    // prescription
    return [
      { title: '姓名', dataIndex: 'customer_name', key: 'customer_name', render: (v) => v || '-' },
      { title: '手机号', dataIndex: 'customer_phone', key: 'customer_phone', render: (v) => v || '-' },
      { title: '登记日期', dataIndex: 'record_date', key: 'record_date' },
      { title: '门店', dataIndex: 'store', key: 'store' },
      { title: '登记人', dataIndex: 'operator', key: 'operator', render: (v) => v || '-' },
      {
        title: '积分',
        dataIndex: 'points_amount',
        key: 'points_amount',
        render: (v) => (v ? `+${v}` : '-'),
      },
      {
        title: '操作',
        key: 'action',
        render: (_, r) => (
          <Button danger size="small" icon={<DeleteOutlined />} onClick={() => openDelete(r, TAB_KEYS.PRESCRIPTION)}>
            删除
          </Button>
        ),
      },
    ];
  })();

  const logColumns = [
    { title: '时间', dataIndex: 'deleted_at', key: 'deleted_at', render: (v) => (v ? String(v).replace('T', ' ') : '-') },
    { title: '表', dataIndex: 'deleted_table', key: 'deleted_table' },
    { title: '记录 ID', dataIndex: 'deleted_record_id', key: 'deleted_record_id', render: (v) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: '门店', dataIndex: 'store', key: 'store' },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="删除记录">
        <Tabs
          activeKey={activeTab}
          onChange={onTabChange}
          items={[
            { key: TAB_KEYS.CUSTOMER, label: '客户' },
            { key: TAB_KEYS.CASE, label: '病例' },
            { key: TAB_KEYS.PRESCRIPTION, label: '验光单' },
            { key: TAB_KEYS.POINTS, label: '积分明细' },
          ]}
        />
        <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          按客户手机号查询相关记录（客户 Tab 支持模糊查询）。删除操作均需密码。
        </div>
        <Space.Compact style={{ maxWidth: 480, marginBottom: 16 }}>
          <Input
            placeholder="客户手机号"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onPressEnter={doSearch}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={doSearch} loading={loading}>
            查询
          </Button>
        </Space.Compact>

        {searched && !loading && records.length === 0 ? (
          <Empty description="未找到记录" />
        ) : (
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={records}
            loading={loading}
            pagination={{ pageSize: 10, showSizeChanger: false }}
          />
        )}
      </Card>

      <Card
        title="删除日志"
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadLogs}>刷新</Button>}
      >
        <Table
          rowKey="id"
          size="small"
          columns={logColumns}
          dataSource={logs}
          loading={logsLoading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>

      <DeletePasswordModal
        open={delModal.open}
        title="删除记录确认"
        content="删除后不可恢复，操作将记录到删除日志。"
        onOk={handleDelete}
        onCancel={() => setDelModal({ open: false, record: null, type: null })}
      />
    </Space>
  );
}
