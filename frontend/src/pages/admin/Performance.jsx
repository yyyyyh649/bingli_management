import React, { useEffect, useState, useMemo } from 'react';
import {
  Card, Spin, Empty, Row, Col, Statistic, Table, Tag, Select, Space,
} from 'antd';
import { BarChartOutlined } from '@ant-design/icons';
import { getPerformance } from '../../api/admin.js';

// 纯 CSS 柱状图：不引入额外依赖
function MonthBarChart({ data }) {
  const max = useMemo(() => {
    const m = Math.max(...data.map((d) => d.revenue), 1);
    return m;
  }, [data]);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 220, padding: '8px 4px 0' }}>
      {data.map((d) => {
        const h = Math.max(2, (d.revenue / max) * 180);
        const isCurrent = d.isCurrent;
        return (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 2, whiteSpace: 'nowrap' }}>
              {d.revenue > 0 ? `¥${Math.round(d.revenue)}` : ''}
            </div>
            <div
              title={`${d.label}：¥${d.revenue.toFixed(2)}（${d.count} 单）`}
              style={{
                width: '70%',
                height: h,
                background: isCurrent
                  ? 'linear-gradient(180deg, #1677ff, #69b1ff)'
                  : d.revenue > 0
                    ? 'linear-gradient(180deg, #52c41a, #95de64)'
                    : '#f0f0f0',
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.3s',
                cursor: 'pointer',
              }}
            />
            <div style={{ fontSize: 11, color: isCurrent ? '#1677ff' : '#999', marginTop: 4, fontWeight: isCurrent ? 600 : 400 }}>
              {d.month}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminPerformance() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async (y) => {
    setLoading(true);
    try {
      const res = await getPerformance(y);
      setData(res);
    } catch (e) {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.monthlyRevenue.map((m) => ({ ...m, isCurrent: m.month === data.currentMonth }));
  }, [data]);

  const operatorColumns = [
    {
      title: '登记人',
      dataIndex: 'operator',
      key: 'operator',
      render: (v) => v || '（未指定）',
    },
    {
      title: '单数',
      dataIndex: 'count',
      key: 'count',
      align: 'right',
      width: 100,
    },
    {
      title: '营业额',
      dataIndex: 'revenue',
      key: 'revenue',
      align: 'right',
      width: 140,
      render: (v) => <span style={{ color: '#1677ff', fontWeight: 600 }}>¥{Number(v).toFixed(2)}</span>,
      sorter: (a, b) => a.revenue - b.revenue,
    },
  ];

  const yearOptions = [];
  for (let y = currentYear; y >= currentYear - 4; y--) {
    yearOptions.push({ value: y, label: `${y} 年` });
  }

  return (
    <Card
      title={
        <Space>
          <BarChartOutlined />
          <span>配镜部绩效统计</span>
        </Space>
      }
      extra={
        <Select
          value={year}
          onChange={setYear}
          options={yearOptions}
          style={{ width: 120 }}
        />
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
      ) : !data ? (
        <Empty description="暂无数据" />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {/* 顶部汇总卡片 */}
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="本月营业额"
                  value={data.currentMonthTotal}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#1677ff', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title="本月单数" value={data.currentMonthCount} suffix="单" />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title={`${year} 年度营业额`}
                  value={data.yearTotal}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#52c41a', fontWeight: 700 }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic title={`${year} 年度单数`} value={data.yearCount} suffix="单" />
              </Card>
            </Col>
          </Row>

          {/* 年度按月柱状图 */}
          <Card size="small" title={`${year} 年度按月营业额`}>
            <MonthBarChart data={chartData} />
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              <Tag color="blue">本月</Tag>
              <Tag color="green">历史月份</Tag>
              <span style={{ marginLeft: 8 }}>悬停柱形可查看明细</span>
            </div>
          </Card>

          {/* 按登记人绩效 */}
          <Card size="small" title={`${year} 年度按登记人绩效`}>
            {data.operatorBreakdown.length === 0 ? (
              <Empty description="暂无登记记录" />
            ) : (
              <Table
                rowKey="operator"
                size="small"
                columns={operatorColumns}
                dataSource={data.operatorBreakdown}
                pagination={false}
              />
            )}
          </Card>
        </Space>
      )}
    </Card>
  );
}
