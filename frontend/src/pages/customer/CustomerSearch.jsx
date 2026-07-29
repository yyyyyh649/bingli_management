import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Input, Button, Table, Tag, Space, Empty, Modal, Spin, Typography,
} from 'antd';
import { SearchOutlined, EyeOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getCustomerRecords } from '../../api/customers.js';
import { getPrescription } from '../../api/prescriptions.js';
import { getCase } from '../../api/cases.js';
import PrescriptionDetail from '../../components/PrescriptionDetail.jsx';
import CaseDetail from '../../components/CaseDetail.jsx';

const { Text } = Typography;

// 按 IMPLEMENTATION.md Phase 3：新建"客户查询"页
// 数据源 = cases + prescriptions 聚合（不新建表），按姓名分列展示
// 同一手机号多名 → 多个姓名分组；含会员与非会员；支持按 姓名/手机号/手机号后四位 搜索；记录可跳详情
export default function CustomerSearch() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detailModal, setDetailModal] = useState(null); // { type, id }
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCustomerRecords(keyword.trim());
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = () => load();

  const openDetail = async (type, id) => {
    setDetailModal({ type, id });
    setDetailLoading(true);
    setDetailRecord(null);
    try {
      const rec = type === 'prescription' ? await getPrescription(id) : await getCase(id);
      setDetailRecord(rec);
    } catch (e) {
      // 拦截器已提示
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailModal(null);
    setDetailRecord(null);
  };

  // 展开行：某姓名分组下的所有记录
  const expandedRowRender = (group) => (
    <Table
      rowKey={(r) => `${r.type}-${r.id}`}
      size="small"
      pagination={false}
      dataSource={group.records}
      columns={[
        {
          title: '类型',
          dataIndex: 'type',
          width: 90,
          render: (v) => (
            <Tag color={v === 'prescription' ? 'cyan' : 'purple'}>
              {v === 'prescription' ? '验光单' : '病例'}
            </Tag>
          ),
        },
        { title: '登记日期', dataIndex: 'record_date', width: 130 },
        { title: '登记人', dataIndex: 'operator', width: 120 },
        { title: '门店', dataIndex: 'store', width: 100 },
        {
          title: '操作',
          width: 100,
          render: (_, r) => (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetail(r.type, r.id)}
            >
              详情
            </Button>
          ),
        },
      ]}
    />
  );

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (v, r) => (
        <Space>
          <Text strong>{v || '-'}</Text>
          {r.is_member ? <Tag color="gold">会员</Tag> : <Tag>非会员</Tag>}
        </Space>
      ),
    },
    { title: '手机号', dataIndex: 'phone', width: 140 },
    { title: '记录数', dataIndex: 'record_count', width: 80 },
    { title: '最近登记', dataIndex: 'last_record_date', width: 130 },
    {
      title: '操作',
      width: 120,
      render: (_, r) =>
        r.is_member ? (
          <Button
            type="link"
            size="small"
            icon={<UserOutlined />}
            onClick={() => navigate(`/customer/profile/${r.phone}`)}
          >
            会员档案
          </Button>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            无会员档案
          </Text>
        ),
    },
  ];

  return (
    <Card title="客户查询">
      <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
        <div style={{ color: '#888', fontSize: 12 }}>
          按 姓名 / 手机号 / 手机号后四位 搜索；同一手机号多名客户按姓名分列展示（含会员与非会员）。
        </div>
        <Space.Compact style={{ width: '100%', maxWidth: 600 }}>
          <Input
            placeholder="输入姓名 / 手机号 / 后4位"
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

      {!loading && groups.length === 0 ? (
        <Empty description="未找到匹配客户记录" />
      ) : (
        <Table
          rowKey={(r) => `${r.name || ''}||${r.phone || ''}`}
          size="small"
          columns={columns}
          dataSource={groups}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          expandable={{ expandedRowRender, defaultExpandAllRows: false }}
        />
      )}

      {/* 记录详情 Modal */}
      <Modal
        open={!!detailModal}
        title={
          detailModal
            ? detailModal.type === 'prescription'
              ? '验光单详情'
              : '病例详情'
            : ''
        }
        footer={null}
        onCancel={closeDetail}
        width={720}
        destroyOnClose
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin />
          </div>
        ) : detailRecord ? (
          detailModal.type === 'prescription' ? (
            <PrescriptionDetail prescription={detailRecord} />
          ) : (
            <CaseDetail caseRecord={detailRecord} />
          )
        ) : (
          <Empty />
        )}
      </Modal>
    </Card>
  );
}
