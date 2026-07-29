import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, DatePicker, Table, Tag, Statistic, Row, Col, Space, Spin, Empty, Typography,
} from 'antd';
import dayjs from 'dayjs';
import { getDailyLedger } from '../../api/admin.js';

const { Text } = Typography;

// 按 IMPLEMENTATION.md Phase 5：后台新增模块"每日积分/余额消耗明细及办理人"
// 默认今日，可切日期；列出每笔变动的时间/会员/金额/类型/办理人
export default function DailyLedger() {
  const [date, setDate] = useState(dayjs());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDailyLedger(date.format('YYYY-MM-DD'));
      setData(result);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const pointsColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => String(v || '').replace('T', ' '),
    },
    { title: '会员', dataIndex: 'customer_name', width: 100, render: (v) => v || '-' },
    { title: '手机号', dataIndex: 'customer_phone', width: 130 },
    {
      title: '积分变动',
      dataIndex: 'amount',
      width: 100,
      render: (v) => {
        const n = Number(v || 0);
        return <Text type={n >= 0 ? 'success' : 'danger'} strong>{n > 0 ? '+' : ''}{n}</Text>;
      },
    },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 120,
      render: (v) => <Tag>{v || '-'}</Tag>,
    },
    { title: '办理人', dataIndex: 'operator', width: 100, render: (v) => v || '-' },
    { title: '门店', dataIndex: 'store', width: 80 },
    { title: '备注', dataIndex: 'note', render: (v) => v || '-' },
  ];

  const balanceColumns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 160,
      render: (v) => String(v || '').replace('T', ' '),
    },
    { title: '会员', dataIndex: 'customer_name', width: 100, render: (v) => v || '-' },
    { title: '手机号', dataIndex: 'customer_phone', width: 130 },
    {
      title: '余额变动',
      dataIndex: 'amount',
      width: 110,
      render: (v) => {
        const n = Number(v || 0);
        return <Text type={n >= 0 ? 'success' : 'danger'} strong>{n > 0 ? '+' : ''}¥{n.toFixed(2)}</Text>;
      },
    },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 120,
      render: (v) => <Tag>{v || '-'}</Tag>,
    },
    { title: '办理人', dataIndex: 'operator', width: 100, render: (v) => v || '-' },
    { title: '门店', dataIndex: 'store', width: 80 },
    { title: '备注', dataIndex: 'note', render: (v) => v || '-' },
  ];

  return (
    <Card title="每日积分/余额消耗明细">
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text style={{ marginRight: 8 }}>选择日期：</Text>
          <DatePicker
            value={date}
            onChange={(d) => d && setDate(d)}
            allowClear={false}
          />
        </div>

        <Row gutter={16}>
          <Col>
            <Statistic
              title="积分变动总额"
              value={Number(data?.pointsTotal || 0)}
              suffix="分"
              valueStyle={{ color: '#1677ff' }}
            />
          </Col>
          <Col>
            <Statistic
              title="余额变动总额"
              value={Number(data?.balanceTotal || 0)}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
        </Row>

        <Spin spinning={loading}>
          <Card type="inner" title={`积分明细（${data?.points?.length || 0} 笔）`} size="small">
            {data?.points?.length ? (
              <Table
                rowKey="id"
                size="small"
                columns={pointsColumns}
                dataSource={data.points}
                pagination={{ pageSize: 20, showSizeChanger: false }}
                scroll={{ x: 800 }}
              />
            ) : (
              <Empty description="当日无积分变动" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          <Card type="inner" title={`余额明细（${data?.balance?.length || 0} 笔）`} size="small" style={{ marginTop: 16 }}>
            {data?.balance?.length ? (
              <Table
                rowKey="id"
                size="small"
                columns={balanceColumns}
                dataSource={data.balance}
                pagination={{ pageSize: 20, showSizeChanger: false }}
                scroll={{ x: 800 }}
              />
            ) : (
              <Empty description="当日无余额变动" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Spin>
      </Space>
    </Card>
  );
}
