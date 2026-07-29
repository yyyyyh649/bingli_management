import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Radio,
  Input,
  InputNumber,
  Button,
  Space,
  Spin,
  message,
  Typography,
  Divider,
  Row,
  Col,
  Tag,
  Alert,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { searchCustomers, getCustomerByPhone } from '../../api/customers.js';
import { listPoints } from '../../api/points.js';
import { POINTS_TO_YUAN_RATE } from '@optical/shared/constants.js';

const { Text, Title } = Typography;

// 验光单提交前的支付弹窗
// 流程：原价 → 打折/立减 → 折后价 → 余额抵扣 → 积分抵扣 → 实付金额 → 新增积分
// 同时处理积分归属（本人/他人/不积分）
//
// props: {
//   open, originalAmount (镜片价+镜架价),
//   selfPhone (page1.phone),
//   onOk(result), onCancel
// }
// result = {
//   discountType, discountValue, discountedAmount,
//   balanceDeduction, balanceDeductionPhone,
//   pointsDeduction, pointsDeductionAmount, pointsDeductionPhone,
//   paidAmount, pointsEarned,
//   pointsTargetPhone  // 积分归属
// }

export default function PaymentModal({
  open,
  originalAmount = 0,
  selfPhone = '',
  onOk,
  onCancel,
}) {
  // 折扣
  const [discountType, setDiscountType] = useState(''); // '' | 'discount' | 'reduction'
  const [discountValue, setDiscountValue] = useState(null);

  // 余额抵扣
  const [useBalance, setUseBalance] = useState(false);
  const [balanceSearchKey, setBalanceSearchKey] = useState('');
  // 按 IMPLEMENTATION.md Phase 4：支付改"列表+店员选"，不再自动绑定
  const [balanceCustomerList, setBalanceCustomerList] = useState([]); // 搜索结果列表
  const [balanceCustomer, setBalanceCustomer] = useState(null); // 店员选中的客户 {phone, name, balance, points}
  const [balanceDeduction, setBalanceDeduction] = useState(0);
  const [balanceSearching, setBalanceSearching] = useState(false);
  const [balanceSelecting, setBalanceSelecting] = useState(false); // 选中后查积分 loading

  // 积分抵扣
  const [usePoints, setUsePoints] = useState(false);
  const [pointsDeduction, setPointsDeduction] = useState(0); // 消耗的积分数

  // 积分归属
  const [pointsChoice, setPointsChoice] = useState(selfPhone ? 'self' : 'none');
  const [otherPhone, setOtherPhone] = useState('');
  const [otherName, setOtherName] = useState('');
  const [otherQueried, setOtherQueried] = useState(null); // null=未查, object=已查, false=未找到
  const [otherQuerying, setOtherQuerying] = useState(false);

  // 实付与积分
  const [paidAmount, setPaidAmount] = useState(0);
  const [paidAmountEdited, setPaidAmountEdited] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [pointsEarnedEdited, setPointsEarnedEdited] = useState(false);

  // 每次打开时重置
  useEffect(() => {
    if (open) {
      setDiscountType('');
      setDiscountValue(null);
      setUseBalance(false);
      setBalanceSearchKey('');
      setBalanceCustomerList([]);
      setBalanceCustomer(null);
      setBalanceDeduction(0);
      setUsePoints(false);
      setPointsDeduction(0);
      setPointsChoice(selfPhone ? 'self' : 'none');
      setOtherPhone('');
      setOtherName('');
      setOtherQueried(null);
      setPaidAmountEdited(false);
      setPointsEarnedEdited(false);
    }
  }, [open, selfPhone]);

  // 折后价
  const discountedAmount = useMemo(() => {
    if (!discountType || discountValue == null) return originalAmount;
    if (discountType === 'discount') {
      const rate = Number(discountValue);
      if (!Number.isFinite(rate) || rate < 0 || rate > 1) return originalAmount;
      return Math.round(originalAmount * rate * 100) / 100;
    }
    if (discountType === 'reduction') {
      const reduction = Number(discountValue);
      if (!Number.isFinite(reduction) || reduction < 0) return originalAmount;
      return Math.max(0, originalAmount - reduction);
    }
    return originalAmount;
  }, [discountType, discountValue, originalAmount]);

  // 积分抵扣金额
  const pointsDeductionAmount = useMemo(() => {
    const pts = Math.max(0, Math.floor(Number(pointsDeduction) || 0));
    const rounded = Math.floor(pts / POINTS_TO_YUAN_RATE) * POINTS_TO_YUAN_RATE;
    return rounded / POINTS_TO_YUAN_RATE;
  }, [pointsDeduction]);

  // 自动计算实付金额（折后价 - 余额抵扣 - 积分抵扣金额）
  const autoPaidAmount = useMemo(() => {
    return Math.max(0, discountedAmount - (useBalance ? balanceDeduction : 0) - (usePoints ? pointsDeductionAmount : 0));
  }, [discountedAmount, useBalance, balanceDeduction, usePoints, pointsDeductionAmount]);

  // 如果实付金额未被手动编辑，自动跟随
  useEffect(() => {
    if (!paidAmountEdited) {
      setPaidAmount(Math.round(autoPaidAmount * 100) / 100);
    }
  }, [autoPaidAmount, paidAmountEdited]);

  // 自动计算新增积分（实付金额取整）
  useEffect(() => {
    if (!pointsEarnedEdited) {
      setPointsEarned(Math.floor(paidAmount));
    }
  }, [paidAmount, pointsEarnedEdited]);

  // 按 IMPLEMENTATION.md Phase 4：搜索客户返回列表，不再自动绑定
  // 支持按 姓名/手机号/卡号 查询（后端 /customers/search 自动适配）
  const searchCustomer = async () => {
    const q = balanceSearchKey.trim();
    if (!q) return;
    setBalanceSearching(true);
    try {
      const list = await searchCustomers(q);
      const arr = Array.isArray(list) ? list : [];
      if (arr.length === 0) {
        message.warning('未找到匹配客户');
        setBalanceCustomerList([]);
      } else {
        setBalanceCustomerList(arr);
      }
      // 清除之前选中的客户（需重新选择）
      setBalanceCustomer(null);
      setBalanceDeduction(0);
      setUsePoints(false);
      setPointsDeduction(0);
    } catch (e) {
      // 拦截器已提示
      setBalanceCustomerList([]);
    } finally {
      setBalanceSearching(false);
    }
  };

  // 按 IMPLEMENTATION.md Phase 4：店员从列表中勾选确认后，才使用该卡余额/积分
  const selectBalanceCustomer = async (customer) => {
    setBalanceSelecting(true);
    try {
      // 查积分
      let points = 0;
      try {
        const ledger = await listPoints(customer.phone);
        if (Array.isArray(ledger)) {
          points = ledger.reduce((s, x) => s + Number(x.amount || 0), 0);
        }
      } catch { /* ignore */ }
      setBalanceCustomer({ ...customer, points });
      setBalanceDeduction(0);
      setUsePoints(false);
      setPointsDeduction(0);
      // 自动同步积分归属为选中的客户
      setPointsChoice('balance_customer');
    } catch (e) {
      // 拦截器已提示
    } finally {
      setBalanceSelecting(false);
    }
  };

  // 查询积分归属"其他人"
  const queryOther = async () => {
    const p = otherPhone.trim();
    if (!/^1\d{10}$/.test(p)) {
      message.warning('请输入有效的 11 位手机号');
      return;
    }
    setOtherQuerying(true);
    try {
      const c = await getCustomerByPhone(p);
      setOtherQueried(c || false);
      setOtherName(c?.name || '');
    } catch {
      setOtherQueried(false);
      setOtherName('');
    } finally {
      setOtherQuerying(false);
    }
  };

  const handleOk = async () => {
    // 校验
    if (useBalance && balanceCustomer && balanceDeduction > 0) {
      if (balanceDeduction > Number(balanceCustomer.balance || 0)) {
        message.warning(`余额不足（当前余额 ¥${Number(balanceCustomer.balance || 0).toFixed(2)}）`);
        return;
      }
      if (balanceDeduction > discountedAmount) {
        message.warning('余额抵扣不能超过折后价');
        return;
      }
    }
    if (usePoints && balanceCustomer && pointsDeduction > 0) {
      if (pointsDeduction > Number(balanceCustomer.points || 0)) {
        message.warning(`积分不足（当前 ${balanceCustomer.points} 分）`);
        return;
      }
    }

    // 积分归属手机号
    let pointsTargetPhone = '';
    if (pointsChoice === 'self') {
      if (!selfPhone) {
        message.warning('基本信息未填电话，无法归属本人');
        return;
      }
      pointsTargetPhone = selfPhone;
    } else if (pointsChoice === 'balance_customer' && balanceCustomer) {
      pointsTargetPhone = balanceCustomer.phone;
    } else if (pointsChoice === 'other') {
      const p = otherPhone.trim();
      if (!/^1\d{10}$/.test(p)) {
        message.warning('请输入有效的 11 位手机号');
        return;
      }
      pointsTargetPhone = p;
    }

    const result = {
      discountType: discountType || '',
      discountValue: discountType ? Number(discountValue) || 0 : 0,
      discountedAmount,
      balanceDeduction: useBalance && balanceCustomer ? Number(balanceDeduction) || 0 : 0,
      balanceDeductionPhone: useBalance && balanceCustomer ? balanceCustomer.phone : '',
      pointsDeduction: usePoints && balanceCustomer ? Math.floor(Number(pointsDeduction) || 0) : 0,
      pointsDeductionAmount: usePoints && balanceCustomer ? pointsDeductionAmount : 0,
      pointsDeductionPhone: usePoints && balanceCustomer ? balanceCustomer.phone : '',
      paidAmount: Number(paidAmount) || 0,
      pointsEarned: Number(pointsEarned) || 0,
      pointsTargetPhone,
    };

    onOk(result);
  };

  return (
    <Modal
      open={open}
      title="实付与抵扣"
      okText="确认提交"
      cancelText="取消"
      onOk={handleOk}
      onCancel={onCancel}
      width={640}
      destroyOnClose
    >
      {/* 原价与折扣 */}
      <div style={{ marginBottom: 16 }}>
        <Space align="baseline" style={{ marginBottom: 12 }}>
          <Text>原价：</Text>
          <Text strong style={{ fontSize: 20 }}>¥{originalAmount.toFixed(2)}</Text>
        </Space>

        <Divider style={{ margin: '8px 0' }} />

        <Title level={5}>折扣（可选）</Title>
        <Radio.Group
          value={discountType}
          onChange={(e) => {
            setDiscountType(e.target.value);
            setDiscountValue(null);
          }}
        >
          <Space direction="vertical">
            <Radio value="">不打折</Radio>
            <Radio value="discount">打折（输入折扣率，如 0.8 = 8折）</Radio>
            <Radio value="reduction">立减（输入立减金额）</Radio>
          </Space>
        </Radio.Group>
        {discountType === 'discount' && (
          <div style={{ marginTop: 8 }}>
            <InputNumber
              min={0}
              max={1}
              step={0.05}
              precision={2}
              placeholder="如 0.8"
              value={discountValue}
              onChange={(v) => setDiscountValue(v)}
              style={{ width: 200 }}
            />
            <Text type="secondary" style={{ marginLeft: 12 }}>
              折后价：<Text strong style={{ color: '#1677ff' }}>¥{discountedAmount.toFixed(2)}</Text>
            </Text>
          </div>
        )}
        {discountType === 'reduction' && (
          <div style={{ marginTop: 8 }}>
            <InputNumber
              min={0}
              step={1}
              precision={2}
              placeholder="立减金额"
              value={discountValue}
              onChange={(v) => setDiscountValue(v)}
              style={{ width: 200 }}
            />
            <Text type="secondary" style={{ marginLeft: 12 }}>
              折后价：<Text strong style={{ color: '#1677ff' }}>¥{discountedAmount.toFixed(2)}</Text>
            </Text>
          </div>
        )}
      </div>

      <Divider />

      {/* 余额抵扣 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={5}>余额抵扣（可选）</Title>
        {!useBalance ? (
          <Button onClick={() => setUseBalance(true)}>使用余额抵扣</Button>
        ) : (
          <div>
            {!balanceCustomer ? (
              <div>
                {/* 按 IMPLEMENTATION.md Phase 4：搜索框 + 列表展示，店员勾选确认后才绑定 */}
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="输入 姓名 / 手机号 / 卡号 搜索客户"
                    value={balanceSearchKey}
                    onChange={(e) => setBalanceSearchKey(e.target.value)}
                    onPressEnter={searchCustomer}
                    allowClear
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={searchCustomer} loading={balanceSearching}>
                    搜索
                  </Button>
                  <Button onClick={() => { setUseBalance(false); setBalanceCustomerList([]); }}>取消</Button>
                </Space.Compact>
                {/* 搜索结果列表：店员从中选择要抵扣的客户 */}
                {balanceCustomerList.length > 0 && (
                  <Spin spinning={balanceSelecting}>
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        共 {balanceCustomerList.length} 条匹配，请选择要使用余额/积分的客户：
                      </Text>
                      <div style={{ marginTop: 8 }}>
                        {balanceCustomerList.map((c) => (
                          <div
                            key={c.id || c.phone}
                            style={{
                              padding: '8px 12px',
                              marginBottom: 4,
                              border: '1px solid #f0f0f0',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                            onClick={() => selectBalanceCustomer(c)}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1677ff'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#f0f0f0'; }}
                          >
                            <Space wrap>
                              <Tag color="blue">{c.name || '(未填姓名)'}</Tag>
                              <Text type="secondary">{c.phone}</Text>
                              {c.member_card_no ? <Tag color="gold">{c.member_card_no}</Tag> : null}
                              <Tag color="green">余额 ¥{Number(c.balance || 0).toFixed(2)}</Tag>
                            </Space>
                            <Button type="link" size="small">选择</Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Spin>
                )}
              </div>
            ) : (
              <div>
                <Space style={{ marginBottom: 8 }} wrap>
                  <Tag color="blue">{balanceCustomer.name || '(未填姓名)'}</Tag>
                  <Text type="secondary">{balanceCustomer.phone}</Text>
                  <Tag color="green">余额 ¥{Number(balanceCustomer.balance || 0).toFixed(2)}</Tag>
                  <Tag color="orange">积分 {balanceCustomer.points || 0} 分</Tag>
                  <Button size="small" onClick={() => { setBalanceCustomer(null); setBalanceDeduction(0); setBalanceCustomerList([]); }}>
                    更换客户
                  </Button>
                </Space>
                <div>
                  <Text>消耗余额（元）：</Text>
                  <InputNumber
                    min={0}
                    max={Math.min(Number(balanceCustomer.balance || 0), discountedAmount)}
                    step={0.01}
                    precision={2}
                    value={balanceDeduction}
                    onChange={(v) => setBalanceDeduction(v || 0)}
                    style={{ width: 160 }}
                  />
                  <Button size="small" style={{ marginLeft: 8 }} onClick={() => setBalanceDeduction(Math.min(Number(balanceCustomer.balance || 0), discountedAmount))}>
                    全部抵扣
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 积分抵扣 */}
      {useBalance && balanceCustomer && (
        <div style={{ marginBottom: 16 }}>
          <Title level={5}>积分抵扣（可选，{POINTS_TO_YUAN_RATE} 积分 = 1 元）</Title>
          {!usePoints ? (
            <Button onClick={() => setUsePoints(true)}>使用积分抵扣</Button>
          ) : (
            <div>
              <Text>消耗积分：</Text>
              <InputNumber
                min={0}
                max={Number(balanceCustomer.points || 0)}
                step={POINTS_TO_YUAN_RATE}
                precision={0}
                value={pointsDeduction}
                onChange={(v) => setPointsDeduction(v || 0)}
                style={{ width: 160 }}
              />
              <Text type="secondary" style={{ marginLeft: 12 }}>
                抵扣金额：<Text strong>¥{pointsDeductionAmount.toFixed(2)}</Text>
                {pointsDeduction > 0 && pointsDeduction % POINTS_TO_YUAN_RATE !== 0 && (
                  <Text type="warning" style={{ marginLeft: 8 }}>
                    （实际消耗 {Math.floor(pointsDeduction / POINTS_TO_YUAN_RATE) * POINTS_TO_YUAN_RATE} 积分）
                  </Text>
                )}
              </Text>
              <Button size="small" style={{ marginLeft: 8 }} onClick={() => setPointsDeduction(Number(balanceCustomer.points || 0))}>
                全部积分
              </Button>
              <Button size="small" style={{ marginLeft: 4 }} onClick={() => { setUsePoints(false); setPointsDeduction(0); }}>
                取消
              </Button>
            </div>
          )}
        </div>
      )}

      <Divider />

      {/* 实付金额 */}
      <div style={{ marginBottom: 16, padding: 16, background: '#f6ffed', borderRadius: 8 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Text>折后价</Text>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>
              ¥{discountedAmount.toFixed(2)}
            </div>
          </Col>
          <Col span={12}>
            <Text>总抵扣</Text>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#f5222d' }}>
              -¥{((useBalance ? balanceDeduction : 0) + (usePoints ? pointsDeductionAmount : 0)).toFixed(2)}
            </div>
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <div>
          <Text strong>实付金额（店员可修改）：</Text>
          <InputNumber
            min={0}
            step={0.01}
            precision={2}
            value={paidAmount}
            onChange={(v) => { setPaidAmount(v || 0); setPaidAmountEdited(true); }}
            style={{ width: 160, marginLeft: 12 }}
            prefix="¥"
          />
          {!paidAmountEdited && (
            <Button size="small" type="link" onClick={() => setPaidAmountEdited(false)}>
              自动计算
            </Button>
          )}
        </div>
      </div>

      {/* 新增积分 */}
      <div style={{ marginBottom: 16 }}>
        <Text strong>本次新增积分（默认=实付金额取整，店员可修改）：</Text>
        <InputNumber
          min={0}
          precision={0}
          value={pointsEarned}
          onChange={(v) => { setPointsEarned(v || 0); setPointsEarnedEdited(true); }}
          style={{ width: 160, marginLeft: 12 }}
          suffix="分"
        />
      </div>

      {/* 积分归属 */}
      {pointsEarned > 0 && (
        <div>
          <Divider />
          <Title level={5}>积分归属</Title>
          <Radio.Group
            value={pointsChoice}
            onChange={(e) => setPointsChoice(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value="self" disabled={!selfPhone}>
                本人 ({selfPhone || '未填电话'})
              </Radio>
              {balanceCustomer && (
                <Radio value="balance_customer">
                  抵扣客户 ({balanceCustomer.name || balanceCustomer.phone})
                </Radio>
              )}
              <Radio value="other">其他人</Radio>
              {pointsChoice === 'other' && (
                <div style={{ paddingLeft: 24, marginTop: 4 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="11 位手机号"
                      value={otherPhone}
                      onChange={(e) => { setOtherPhone(e.target.value); setOtherQueried(null); }}
                      maxLength={11}
                    />
                    <Button onClick={queryOther} loading={otherQuerying}>查询</Button>
                  </Space.Compact>
                  {otherQueried && (
                    <div style={{ marginTop: 8, color: '#52c41a' }}>
                      已找到客户：{otherQueried.name || '(未填姓名)'}
                    </div>
                  )}
                  {otherQueried === false && (
                    <Alert
                      style={{ marginTop: 8 }}
                      type="warning"
                      message="未找到该客户，请先在会员登记处建档"
                    />
                  )}
                </div>
              )}
              <Radio value="none">不积分</Radio>
            </Space>
          </Radio.Group>
        </div>
      )}
    </Modal>
  );
}
