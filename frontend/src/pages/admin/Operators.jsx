import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Space,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  listOperators,
  createOperator,
  updateOperator,
  deleteOperator,
} from '../../api/operators.js';
import DeletePasswordModal from '../../components/DeletePasswordModal.jsx';

export default function Operators() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editModal, setEditModal] = useState({ open: false, record: null });
  const [addModal, setAddModal] = useState(false);
  const [delModal, setDelModal] = useState({ open: false, record: null });
  const [editForm] = Form.useForm();
  const [addForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const list = await listOperators();
      setOperators(Array.isArray(list) ? list : []);
    } catch (e) {
      // 拦截器已提示
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, [refreshKey]);

  const openAdd = () => {
    addForm.resetFields();
    setAddModal(true);
  };

  const openEdit = (record) => {
    editForm.setFieldsValue({ name: record.name, sortOrder: record.sort_order ?? 0 });
    setEditModal({ open: true, record });
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      await createOperator({ name: values.name, sortOrder: values.sortOrder ?? 0 });
      message.success('新增成功');
      setAddModal(false);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      // 校验失败或 API 错误
    }
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      await updateOperator(editModal.record.id, {
        name: values.name,
        sortOrder: values.sortOrder ?? 0,
      });
      message.success('修改成功');
      setEditModal({ open: false, record: null });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      // 校验失败或 API 错误
    }
  };

  const handleDelete = async (password) => {
    try {
      await deleteOperator(delModal.record.id, password);
      message.success('删除成功');
      setDelModal({ open: false, record: null });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      throw e; // 让 Modal 保持打开以便重试
    }
  };

  const columns = [
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '所属门店', dataIndex: 'store', key: 'store' },
    { title: '排序', dataIndex: 'sort_order', key: 'sort_order' },
    {
      title: '操作',
      key: 'action',
      render: (_, r) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => setDelModal({ open: true, record: r })}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="登记人维护"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          新增登记人
        </Button>
      }
    >
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={operators}
        loading={loading}
        pagination={false}
      />

      {/* 新增 Modal */}
      <Modal
        open={addModal}
        title="新增登记人"
        okText="新增"
        cancelText="取消"
        onOk={handleAdd}
        onCancel={() => setAddModal(false)}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical" initialValues={{ sortOrder: 0 }}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item label="排序（数字越小越靠前）" name="sortOrder">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑 Modal */}
      <Modal
        open={editModal.open}
        title="编辑登记人"
        okText="保存"
        cancelText="取消"
        onOk={handleEdit}
        onCancel={() => setEditModal({ open: false, record: null })}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item label="排序（数字越小越靠前）" name="sortOrder">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <DeletePasswordModal
        open={delModal.open}
        title="删除登记人确认"
        content={`确认删除登记人「${delModal.record?.name || ''}」？`}
        onOk={handleDelete}
        onCancel={() => setDelModal({ open: false, record: null })}
      />
    </Card>
  );
}
