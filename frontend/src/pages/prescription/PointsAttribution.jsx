import React, { useState, useEffect } from 'react';
import { Modal, Radio, Input, Button, Space, message, Typography } from 'antd';
import { getCustomerByPhone, createCustomer } from '../../api/customers.js';

const { Text } = Typography;

// 提交验光单前的积分归属选择 Modal
// props: { open, points, selfPhone, onOk(targetPhone), onCancel }
// - selfPhone: page1.phone，若为空则"本人"选项不可用
// - onOk(targetPhone): '' 表示不积分
export default function PointsAttribution({
  open,
  points,
  selfPhone,
  onOk,
  onCancel,
}) {
  const [choice, setChoice] = useState(selfPhone ? 'self' : 'none');
  const [otherPhone, setOtherPhone] = useState('');
  const [otherName, setOtherName] = useState('');
  const [queried, setQueried] = useState(null); // null=未查, object=已查客户, false=未找到
  const [querying, setQuerying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setChoice(selfPhone ? 'self' : 'none');
      setOtherPhone('');
      setOtherName('');
      setQueried(null);
    }
  }, [open, selfPhone]);

  const queryOther = async () => {
    const p = otherPhone.trim();
    if (!/^1\d{10}$/.test(p)) {
      message.warning('请输入有效的 11 位手机号');
      return;
    }
    setQuerying(true);
    try {
      const c = await getCustomerByPhone(p);
      setQueried(c || false);
      setOtherName(c?.name || '');
    } catch (e) {
      // 404 等错误视为未找到
      setQueried(false);
      setOtherName('');
    } finally {
      setQuerying(false);
    }
  };

  const handleOk = async () => {
    try {
      setConfirming(true);
      if (choice === 'none') {
        onOk('');
        return;
      }
      if (choice === 'self') {
        if (!selfPhone) {
          message.warning('基本信息未填电话，无法归属本人');
          return;
        }
        onOk(selfPhone);
        return;
      }
      // 其他人
      const p = otherPhone.trim();
      if (!/^1\d{10}$/.test(p)) {
        message.warning('请输入有效的 11 位手机号');
        return;
      }
      if (queried === false) {
        // 未找到，需先新建
        if (!otherName.trim()) {
          message.warning('该手机号尚未登记，请填写姓名后系统将自动新建客户');
          return;
        }
        try {
          await createCustomer({ phone: p, name: otherName.trim() });
        } catch (e) {
          return; // 拦截器已提示
        }
      }
      onOk(p);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal
      open={open}
      title="积分归属"
      okText="确认提交"
      cancelText="取消"
      onOk={handleOk}
      onCancel={onCancel}
      confirmLoading={confirming}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        <Text>本次产生积分 </Text>
        <Text strong style={{ fontSize: 20, color: '#1677ff' }}>
          {points}
        </Text>
        <Text> 分，归属给谁？</Text>
      </div>
      <Radio.Group
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio value="self" disabled={!selfPhone}>
            本人 ({selfPhone || '未填电话'})
          </Radio>
          <Radio value="other">其他人</Radio>
          {choice === 'other' && (
            <div style={{ paddingLeft: 24, marginTop: 4 }}>
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="11 位手机号"
                  value={otherPhone}
                  onChange={(e) => {
                    setOtherPhone(e.target.value);
                    setQueried(null);
                  }}
                  maxLength={11}
                />
                <Button onClick={queryOther} loading={querying}>
                  查询
                </Button>
              </Space.Compact>
              {queried && (
                <div style={{ marginTop: 8, color: '#52c41a' }}>
                  已找到客户：{queried.name || '(未填姓名)'}
                </div>
              )}
              {queried === false && (
                <div style={{ marginTop: 8 }}>
                  <Text type="warning">未找到该客户，将自动新建。</Text>
                  <Input
                    style={{ marginTop: 4 }}
                    placeholder="请输入客户姓名"
                    value={otherName}
                    onChange={(e) => setOtherName(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <Radio value="none">不积分</Radio>
        </Space>
      </Radio.Group>
    </Modal>
  );
}
