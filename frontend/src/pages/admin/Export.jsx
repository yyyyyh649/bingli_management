import React from 'react';
import { Card, Button, Space, Typography, Alert } from 'antd';
import { DatabaseOutlined, FileExcelOutlined } from '@ant-design/icons';

const { Text } = Typography;

export default function Export() {
  const downloadDb = () => {
    // 直接跳转触发浏览器下载（后端返回二进制流）
    window.location = '/api/admin/export?type=db';
  };

  const downloadExcel = () => {
    window.location = '/api/admin/export?type=excel';
  };

  return (
    <Card title="数据导出">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
        message="两种导出方式的用途区别"
        description={
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <Text strong>数据库文件</Text>：导出当前门店的 SQLite 数据库文件，可用于备份、迁移或在另一台机器恢复完整数据。
            </li>
            <li>
              <Text strong>Excel</Text>：导出多 Sheet 的 Excel 文件，将各业务表的 JSON 字段展开，便于人工查阅、统计或交给非技术人员使用。
            </li>
          </ul>
        }
      />

      <Space size="large" wrap>
        <Button
          type="primary"
          size="large"
          icon={<DatabaseOutlined />}
          onClick={downloadDb}
        >
          下载数据库文件
        </Button>
        <Button
          size="large"
          icon={<FileExcelOutlined />}
          onClick={downloadExcel}
        >
          导出 Excel
        </Button>
      </Space>
    </Card>
  );
}
