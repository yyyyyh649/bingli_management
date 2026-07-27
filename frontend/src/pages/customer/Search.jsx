import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Table, Tag, Space, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { searchCustomers, listCustomers } from '../../api/customers.js';

export default function CustomerSearch() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  // 进入页面默认加载全部客户
  const loadAll = async () => {
    setLoading(true);
    try {
      const list = await listCustomers();
      setResults(Array.isArray(list) ? list : []);
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const doSearch = async () => {
    const q = keyword.trim();
    if (!q) {
      // 关键字为空时回到"显示全部"
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

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v) => v || '-',
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
      title: '创建门店',
      dataIndex: 'store',
      key: 'store',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <Button type="link" onClick={() => navigate(`/customer/profile/${r.phone}`)}>
          查看积分页
        </Button>
      ),
    },
  ];

  return (
    <Card title="客户查询">
      <Space style={{ marginBottom: 16, width: '100%' }} direction="vertical">
        <div style={{ color: '#888', fontSize: 12 }}>
          支持按 手机号后4位 / 完整手机号 / 姓名 / 会员卡号 查询，系统自动判断。关键字为空时显示全部客户。
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
        <Empty description="未找到匹配客户" />
      ) : (
        <Table
          rowKey="id"
          size="small"
          columns={columns}
          dataSource={results}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      )}
    </Card>
  );
}
