import React, { useState, useEffect, useRef } from 'react';
import { Radio, Space, Tag, Spin, Typography, Alert } from 'antd';
import { getCustomerCandidates } from '../api/customers.js';

const { Text } = Typography;

// 按 IMPLEMENTATION.md Phase 2 / 1.5：登记时让店员选择"这是哪个人"
// 用于确定本次记录的 customer_ref_id：
//   - 选会员/历史 → 继承该 refId
//   - 选"新客户"或不选 → 自引用（提交时由后端置为记录自身 id）
//
// props:
//   name    : 当前输入的姓名（来自表单/状态）
//   phone   : 当前输入的手机号
//   value   : 选中的 refId（'' = 新客户/自引用）
//   onChange : (refId) => void
export default function CandidatePicker({ name, phone, value, onChange }) {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    const qName = String(name || '').trim();
    const qPhone = String(phone || '').trim();
    const hasName = qName.length >= 1;
    const hasPhone = /^\d{4,}$/.test(qPhone); // 至少 4 位数字（含后4位匹配）
    if (!hasName && !hasPhone) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const list = await getCustomerCandidates({ name: qName, phone: qPhone });
        setCandidates(list || []);
        setSearched(true);
      } catch (e) {
        // 拦截器已提示
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [name, phone]);

  // 未搜索 / 无候选：不渲染（默认即"新客户/自引用"，无需打扰店员）
  if (!searched) return null;
  if (!loading && candidates.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        style={{ marginTop: 8, marginBottom: 8 }}
        message="未匹配到已有会员/客户历史，将作为新人员登记（自引用）"
      />
    );
  }

  return (
    <Spin spinning={loading}>
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <Text type="secondary">
          识别到同名/同手机号的已有客户，请确认本次登记归属：
        </Text>
      </div>
      <Radio.Group
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Radio value="">新客户（作为新的人员起点）</Radio>
          {candidates.map((c) => (
            <Radio key={c.refId} value={c.refId}>
              <Space wrap>
                <Text strong>{c.name || '(未填姓名)'}</Text>
                <Text type="secondary">{c.phone}</Text>
                <Tag color={c.source === 'member' ? 'gold' : 'blue'}>
                  {c.source === 'member' ? '会员' : '历史客户'}
                </Tag>
                {c.lastRecordDate ? (
                  <Text type="secondary">最近登记：{c.lastRecordDate}</Text>
                ) : null}
                {c.birthday ? (
                  <Text type="secondary">生日：{c.birthday}</Text>
                ) : null}
              </Space>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </Spin>
  );
}
