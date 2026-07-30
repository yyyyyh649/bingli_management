import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Tabs,
  Form,
  InputNumber,
  Input,
  Button,
  Space,
  Table,
  Tag,
  Empty,
  Spin,
  message,
  Typography,
  Divider,
  Alert,
  Select,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ReloadOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
  getPointTiers,
  savePointTiers,
  listMemberTiers,
  getMemberTier,
} from '../../api/admin.js';

const { Text, Paragraph } = Typography;

// 档位颜色循环（最多10档）
const TIER_COLORS = [
  'default',
  'blue',
  'green',
  'gold',
  'orange',
  'red',
  'purple',
  'cyan',
  'magenta',
  'geekblue',
];

export default function PointTiers() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Alert
        type="info"
        showIcon
        message="会员积分档位管理"
        description={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>档位判定依据：会员<b>历史累计获得的积分总量</b>（提现/兑换/消费扣减不影响档位，只升不降）。</li>
            <li>可自定义 1-10 个档位，每档可设名称与积分阈值；阈值按升序，第 1 档阈值固定为 0。</li>
            <li>可设置每年某一天对累计积分清零（月份+日期需同时设置），不设置则永不清零。</li>
          </ul>
        }
      />
      <Tabs
        items={[
          { key: 'config', label: '档位配置', children: <ConfigPanel /> },
          { key: 'members', label: '会员档位查询', children: <MembersPanel /> },
        ]}
      />
    </Space>
  );
}

// ============ 档位配置面板 ============
function ConfigPanel() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPointTiers();
      const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
      // 不足1档时补一行空档位
      const initTiers = tiers.length > 0 ? tiers : [{ name: '', threshold: 0 }];
      form.setFieldsValue({
        tiers: initTiers,
        resetMonth: data?.reset_month ?? null,
        resetDay: data?.reset_day ?? null,
      });
    } catch (e) {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const tiers = (values.tiers || []).map((t) => ({
        name: String(t?.name || '').trim(),
        threshold: Math.max(0, Math.floor(Number(t?.threshold || 0))),
      }));
      if (tiers.length < 1 || tiers.length > 10) {
        message.warning('档位数量必须为 1-10 个');
        return;
      }
      // 第1档阈值强制为0
      tiers[0].threshold = 0;
      const payload = {
        tiers,
        resetMonth: values.resetMonth ?? null,
        resetDay: values.resetDay ?? null,
      };
      setSaving(true);
      await savePointTiers(payload);
      message.success('档位配置已保存');
      load();
    } catch (e) {
      if (e?.errorFields) return; // 表单校验失败
      // 拦截器已提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="档位配置" extra={<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>}>
      <Spin spinning={loading}>
        <Form form={form} layout="vertical">
          <Text type="secondary">最多 10 档，阈值按升序排列；第 1 档阈值固定为 0。新增档位时阈值应大于前一档。</Text>
          <Form.List
            name="tiers"
            rules={[
              {
                validator: async (_, list) => {
                  if (!list || list.length < 1) return Promise.reject(new Error('至少需要 1 个档位'));
                  if (list.length > 10) return Promise.reject(new Error('最多 10 个档位'));
                },
              },
            ]}
          >
            {(fields, { add, remove }, { errors }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 8, marginTop: 12 }}>
                    <Tag color={TIER_COLORS[field.name % TIER_COLORS.length]} style={{ marginRight: 0 }}>
                      第 {field.name + 1} 档
                    </Tag>
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      noStyle
                    >
                      <Input placeholder="档位名（可选，留空显示第N档）" style={{ width: 220 }} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'threshold']}
                      noStyle
                      rules={[{ required: true, message: '请输入阈值' }]}
                    >
                      <InputNumber
                        min={0}
                        step={1}
                        placeholder="积分阈值"
                        style={{ width: 140 }}
                        disabled={field.name === 0}
                      />
                    </Form.Item>
                    {fields.length > 1 && field.name !== 0 && (
                      <DeleteOutlined
                        style={{ color: '#ff4d4f', cursor: 'pointer' }}
                        onClick={() => remove(field.name)}
                      />
                    )}
                    {field.name === 0 && (
                      <Tooltip title="第 1 档阈值为 0，不可删除">
                        <Text type="secondary" style={{ fontSize: 12 }}>基础档</Text>
                      </Tooltip>
                    )}
                  </Space>
                ))}
                <Form.ErrorList errors={errors} />
                {fields.length < 10 && (
                  <Button
                    type="dashed"
                    onClick={() => add({ name: '', threshold: 0 })}
                    icon={<PlusOutlined />}
                    style={{ marginTop: 8 }}
                  >
                    新增档位
                  </Button>
                )}
              </>
            )}
          </Form.List>

          <Divider />
          <Paragraph type="secondary" style={{ marginBottom: 8 }}>
            年度累计积分清零日（可选，月份和日期需同时设置；不设置则永不清零）
          </Paragraph>
          <Space>
            <Form.Item name="resetMonth" noStyle>
              <Select
                placeholder="月份"
                allowClear
                style={{ width: 120 }}
                options={Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月` }))}
              />
            </Form.Item>
            <Form.Item name="resetDay" noStyle>
              <Select
                placeholder="日期"
                allowClear
                style={{ width: 120 }}
                options={Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1} 日` }))}
              />
            </Form.Item>
          </Space>

          <div style={{ marginTop: 24 }}>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
              保存配置
            </Button>
          </div>
        </Form>
      </Spin>
    </Card>
  );
}

// ============ 会员档位查询面板 ============
function MembersPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ config: { tiers: [] }, members: [] });
  const [tierFilter, setTierFilter] = useState('');
  const [singlePhone, setSinglePhone] = useState('');
  const [singleInfo, setSingleInfo] = useState(null);
  const [singleLoading, setSingleLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMemberTiers(tierFilter);
      setData(result || { config: { tiers: [] }, members: [] });
    } catch (e) {
      setData({ config: { tiers: [] }, members: [] });
    } finally {
      setLoading(false);
    }
  }, [tierFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const querySingle = async () => {
    const p = singlePhone.trim();
    if (!p) {
      message.warning('请输入手机号');
      return;
    }
    setSingleLoading(true);
    try {
      const info = await getMemberTier(p);
      setSingleInfo(info);
    } catch (e) {
      setSingleInfo(null);
    } finally {
      setSingleLoading(false);
    }
  };

  const tiers = data.config?.tiers || [];

  const columns = [
    {
      title: '排名',
      key: 'rank',
      width: 70,
      render: (_, __, idx) => idx + 1,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (v, r) => {
        const tierName = r.tierName || (tiers[r.tierIndex]?.name) || `第${(r.tierIndex ?? -1) + 1}档`;
        return (
          <Space>
            <Link to={`/customer/profile/${encodeURIComponent(r.phone)}`}>{v || '-'}</Link>
            {r.tierIndex >= 0 && <Tag color={TIER_COLORS[r.tierIndex % TIER_COLORS.length]}>{tierName}</Tag>}
          </Space>
        );
      },
    },
    { title: '手机号', dataIndex: 'phone', key: 'phone' },
    { title: '会员卡号', dataIndex: 'member_card_no', key: 'member_card_no', render: (v) => v ? <Tag color="gold">{v}</Tag> : <Tag>无</Tag> },
    {
      title: '累计积分',
      dataIndex: 'cumulative',
      key: 'cumulative',
      align: 'right',
      sorter: (a, b) => b.cumulative - a.cumulative,
      render: (v) => <Text strong style={{ color: '#1677ff' }}>{Number(v || 0)}</Text>,
    },
    {
      title: '档位',
      dataIndex: 'tierIndex',
      key: 'tierIndex',
      render: (idx, r) => {
        if (idx == null || idx < 0) return '-';
        const name = r.tierName || tiers[idx]?.name || `第${idx + 1}档`;
        return <Tag color={TIER_COLORS[idx % TIER_COLORS.length]} icon={<CrownOutlined />}>{name}</Tag>;
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="单个会员查询">
        <Space.Compact style={{ maxWidth: 480 }}>
          <Input
            placeholder="会员手机号"
            value={singlePhone}
            onChange={(e) => setSinglePhone(e.target.value)}
            onPressEnter={querySingle}
            allowClear
          />
          <Button type="primary" onClick={querySingle} loading={singleLoading}>查询</Button>
        </Space.Compact>
        {singleInfo && (
          <Descriptions2 info={singleInfo} tiers={tiers} />
        )}
      </Card>

      <Card
        title="全部会员档位（按累计积分降序）"
        extra={
          <Space>
            <Select
              placeholder="按档位筛选"
              value={tierFilter || undefined}
              onChange={(v) => setTierFilter(v ?? '')}
              allowClear
              style={{ width: 160 }}
              options={tiers.map((t, i) => ({ value: i, label: t.name || `第${i + 1}档` }))}
            />
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
          </Space>
        }
      >
        <Spin spinning={loading}>
          {data.members?.length ? (
            <Table
              rowKey="phone"
              size="small"
              columns={columns}
              dataSource={data.members}
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          ) : (
            <Empty description="暂无会员" />
          )}
        </Spin>
      </Card>
    </Space>
  );
}

function Descriptions2({ info, tiers }) {
  const idx = info.tierIndex ?? -1;
  const name = info.tierName || (idx >= 0 ? (tiers[idx]?.name || `第${idx + 1}档`) : '-');
  return (
    <div style={{ marginTop: 16 }}>
      <Space size="large" wrap>
        <Text>累计积分：<Text strong style={{ color: '#1677ff' }}>{Number(info.cumulative || 0)}</Text></Text>
        <Text>档位：{idx >= 0 ? <Tag color={TIER_COLORS[idx % TIER_COLORS.length]}>{name}</Tag> : '-'}</Text>
        {info.resetDate && <Text type="secondary">最近清零日：{String(info.resetDate).slice(0, 10)}</Text>}
      </Space>
    </div>
  );
}
