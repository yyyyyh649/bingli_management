import React, { useMemo } from 'react';
import { Table, Descriptions, Typography } from 'antd';
import {
  PRESCRIPTION_STEPS,
  PRESCRIPTION_STEP_LABELS,
  EYE_LABELS,
} from '@optical/shared/constants.js';

const { Title, Text } = Typography;

// 安全解析后端可能返回的 JSON 字符串或对象
function parseJson(raw) {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }
  return raw;
}

function buildRows(dsObj, dcObj) {
  return PRESCRIPTION_STEPS.map((key) => {
    const ds = dsObj[key] || {};
    const dc = dcObj[key] || {};
    return {
      key,
      label: PRESCRIPTION_STEP_LABELS[key],
      ds: ds.value ?? '',
      dc: dc.value ?? '',
      axis: dc.axis ?? '',
    };
  });
}

const columns = [
  { title: '项目', dataIndex: 'label', key: 'label' },
  { title: 'DS (球镜)', dataIndex: 'ds', key: 'ds', align: 'center' },
  { title: 'DC (柱镜)', dataIndex: 'dc', key: 'dc', align: 'center' },
  { title: '轴向', dataIndex: 'axis', key: 'axis', align: 'center' },
];

// 验光单详情（贴近纸质验光单的表格布局）
export default function PrescriptionDetail({ prescription }) {
  const { odTable, osTable, page1, page6, meta } = useMemo(() => {
    const p = prescription || {};
    const page1 = parseJson(p.page1);
    const page6 = parseJson(p.page6);
    const odTable = buildRows(parseJson(p.od_ds), parseJson(p.od_dc));
    const osTable = buildRows(parseJson(p.os_ds), parseJson(p.os_dc));
    return {
      odTable,
      osTable,
      page1,
      page6,
      meta: p,
    };
  }, [prescription]);

  return (
    <div>
      <Title level={5} style={{ marginTop: 0 }}>
        右眼 (OD)
      </Title>
      <Table
        size="small"
        columns={columns}
        dataSource={odTable}
        pagination={false}
        bordered
      />
      <Title level={5} style={{ marginTop: 16 }}>
        左眼 (OS)
      </Title>
      <Table
        size="small"
        columns={columns}
        dataSource={osTable}
        pagination={false}
        bordered
      />
      <Descriptions
        size="small"
        column={2}
        bordered
        style={{ marginTop: 16 }}
        items={[
          { key: 'lens', label: '镜片价', children: page6.lens_price ?? '-' },
          { key: 'frame', label: '镜架价', children: page6.frame_price ?? '-' },
          { key: 'pd_near', label: '瞳距(近)', children: page6.pd_near ?? '-' },
          { key: 'pd_far', label: '瞳距(远)', children: page6.pd_far ?? '-' },
          { key: 'date', label: '登记日期', children: meta.record_date || page1.record_date || '-' },
          { key: 'op', label: '登记人', children: meta.operator || '-' },
          { key: 'store', label: '登记门店', children: meta.store || '-' },
          // 按 IMPLEMENTATION.md Phase 4 / 1.2：复查周期
          { key: 'review_cycle', label: '复查周期', children: meta.review_cycle_days ? `${meta.review_cycle_days} 天` : '-' },
          {
            key: 'points',
            label: '产生积分',
            children: meta.points_amount != null ? `${meta.points_amount} 分` : '-',
          },
          // 按 IMPLEMENTATION.md Phase 4 / 1.6：备注
          ...(meta.notes ? [{ key: 'notes', label: '备注', children: meta.notes }] : []),
        ]}
      />
    </div>
  );
}
