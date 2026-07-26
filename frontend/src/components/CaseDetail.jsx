import React, { useMemo } from 'react';
import { Descriptions, Tag, List, Typography, Empty } from 'antd';
import { CASE_MODE } from '@optical/shared/constants.js';

const { Text } = Typography;

// 病例详情
// - 简约模式：展示各字段
// - 复杂模式：按问答顺序展示「题目 → 所选答案」对话式列表
export default function CaseDetail({ caseRecord }) {
  const c = caseRecord || {};
  const isComplex = c.mode === CASE_MODE.COMPLEX;

  const answers = useMemo(() => {
    if (!isComplex) return [];
    if (Array.isArray(c.answers)) return c.answers;
    if (typeof c.answers === 'string') {
      try {
        const parsed = JSON.parse(c.answers);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  }, [c.answers, isComplex]);

  if (!isComplex) {
    return (
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="姓名">{c.customer_name || '-'}</Descriptions.Item>
        <Descriptions.Item label="性别">{c.customer_gender || '-'}</Descriptions.Item>
        <Descriptions.Item label="手机号">{c.customer_phone || '-'}</Descriptions.Item>
        <Descriptions.Item label="住址">{c.customer_address || '-'}</Descriptions.Item>
        <Descriptions.Item label="病情">{c.condition || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记日期">{c.record_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记人">{c.operator || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记门店">{c.store || '-'}</Descriptions.Item>
      </Descriptions>
    );
  }

  return (
    <div>
      <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="模式">
          <Tag color="purple">复杂问卷</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="登记日期">{c.record_date || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记人">{c.operator || '-'}</Descriptions.Item>
        <Descriptions.Item label="登记门店">{c.store || '-'}</Descriptions.Item>
      </Descriptions>

      {answers.length === 0 ? (
        <Empty description="无问卷作答记录" />
      ) : (
        <List
          bordered
          size="small"
          dataSource={answers}
          renderItem={(item, idx) => (
            <List.Item>
              <div style={{ width: '100%' }}>
                <div>
                  <Text strong>
                    {idx + 1}. {item.questionText}
                  </Text>
                </div>
                <div style={{ marginTop: 4, paddingLeft: 12 }}>
                  <Tag color="blue">{item.selectedLabel}</Tag>
                  {item.otherText ? (
                    <Text type="secondary">（{item.otherText}）</Text>
                  ) : null}
                </div>
              </div>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
