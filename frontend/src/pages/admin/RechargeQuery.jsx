import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Tag, Statistic, Row, Col, Space, Spin, Empty, Typography, Input, Button, DatePicker,
} from 'antd';
import dayjs from 'dayjs';
import { getRechargeStats } from '../../api/admin.js';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// 按用户新需求 Phase F：充值数据查询
// 显示总实充金额 + 总到账金额，可按手机号/日期区间查每次充值记录
export default function RechargeQuery() {
  const [phone, setPhone] = useState('');
  const [dateRange, setDateRange] = useState([null, null]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getRechargeStats({
        phone: phone.trim(),
        startDate: dateRange?.[0]?.format('YYYY-MM-DD') || '',
        endDate: dateRange?.[1]?.format('YYYY-MM-DD') || '',
      });
      setData(result);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [phone, dateRange]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (v) => (v ? String(v).replace('T', ' ') : '-'),
    },
    { title: '会员', dataIndex: 'customer_name', render: (v) => v || '-', width: 100 },
    { title: '手机号', dataIndex: 'customer_phone', width: 130 },
    {
      title: '实充金额',
      dataIndex: 'actual_amount',
      width: 110,
      align: 'right',
      render: (v) => (
        <Text type="warning" strong>
          ¥{Number(v || 0).toFixed(2)}
        </Text>
      ),
    },
    {
      title: '到账金额',
      dataIndex: 'amount',
      width: 110,
      align: 'right',
      render: (v) => (
        <Text type="success" strong>
          ¥{Number(v || 0).toFixed(2)}
        </Text>
      ),
    },
    {
      title: '赠费',
      key: 'bonus',
      width: 90,
      align: 'right',
      render: (_, r) => {
        const bonus = Number(r.amount || 0) - Number(r.actual_amount || 0);
        if (bonus <= 0) return '-';
        return <Tag color="orange">+¥{bonus.toFixed(2)}</Tag>;
      },
    },
    { title: '办理人', dataIndex: 'operator', render: (v) => v || '-', width: 100 },
    { title: '门店', dataIndex: 'store', width: 100 },
    { title: '备注', dataIndex: 'note', render: (v) => v || '-' },
  ];

  return (
    <Card title="充值数据查询">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Space wrap>
          <Input
            placeholder="按手机号查询"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: 180 }}
            allowClear
          />
          <RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates || [null, null])}
            allowClear
          />
          <Button type="primary" onClick={load} loading={loading}>
            查询
          </Button>
        </Space>

        <Row gutter={32}>
          <Col>
            <Statistic
              title="总实充金额"
              value={Number(data?.totalActual || 0)}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Col>
          <Col>
            <Statistic
              title="总到账金额"
              value={Number(data?.totalCredited || 0)}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col>
            <Statistic title="充值笔数" value={Number(data?.totalCount || 0)} suffix="笔" />
          </Col>
        </Row>

        <Spin spinning={loading}>
          {data?.records?.length ? (
            <Table
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={data.records}
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          ) : (
            <Empty description="暂无充值记录" />
          )}
        </Spin>
      </Space>
    </Card>
  );
}
