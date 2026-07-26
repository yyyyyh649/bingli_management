import React from 'react';
import { Form, Input, InputNumber, Space, Typography } from 'antd';
import {
  PRESCRIPTION_STEPS,
  PRESCRIPTION_STEP_LABELS,
  EYE_LABELS,
  RX_LABELS,
} from '@optical/shared/constants.js';

const { Title, Text } = Typography;

// 验光单向导 - 单眼单类型的6项表单（步骤2-5复用）
// props: { form, eye: 'od'|'os', rxType: 'ds'|'dc' }
// 字段结构：{ [stepKey]: { value } } (DS) 或 { [stepKey]: { value, axis } } (DC)
export default function PageEye({ form, eye, rxType }) {
  const isDc = rxType === 'dc';

  return (
    <div>
      <Title level={5}>
        {EYE_LABELS[eye]} - {RX_LABELS[rxType]}
        {isDc ? '（含轴向 0-180）' : ''}
      </Title>
      <Form form={form} layout="vertical" style={{ maxWidth: 600 }}>
        {PRESCRIPTION_STEPS.map((key) => (
          <Form.Item
            key={key}
            label={PRESCRIPTION_STEP_LABELS[key]}
            style={{ marginBottom: 12 }}
          >
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name={[key, 'value']} noStyle>
                <Input
                  style={{ width: isDc ? '50%' : '100%' }}
                  placeholder="度数值"
                />
              </Form.Item>
              {isDc && (
                <Form.Item name={[key, 'axis']} noStyle>
                  <InputNumber
                    style={{ width: '50%' }}
                    min={0}
                    max={180}
                    placeholder="轴向 (0-180)"
                  />
                </Form.Item>
              )}
            </Space.Compact>
          </Form.Item>
        ))}
      </Form>
      <Text type="secondary" style={{ fontSize: 12 }}>
        提示：度数值可填如 -2.50、+1.00 等；DC（柱镜）需补充轴向。
      </Text>
    </div>
  );
}
