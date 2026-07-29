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
  Tag,
  Checkbox,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  listOperators,
  createOperator,
  updateOperator,
  deleteOperator,
} from '../../api/operators.js';
import DeletePasswordModal from '../../components/DeletePasswordModal.jsx';
import { DEPARTMENT } from '@optical/shared/constants.js';

const DEPT_LABELS = {
  [DEPARTMENT.OPTICAL]: '配镜部',
  [DEPARTMENT.OPHTHALMOLOGY]: '眼科部',
};

// 把 department 字符串转为数组
function deptStrToArr(deptStr) {
  if (!deptStr) return [];
  return String(deptStr).split(',').filter(Boolean);
}

// 把数组转为 department 字符串
function deptArrToStr(arr) {
  return [...new Set(arr)].sort().join(',');
}

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
    editForm.setFieldsValue({
      name: record.name,
      sortOrder: record.sort_order ?? 0,
      department: deptStrToArr(record.department),
    });
    setEditModal({ open: true, record });
  };

  const handleAdd = async () => {
    try {
      const values = await addForm.validateFields();
      await createOperator({
        name: values.name,
        sortOrder: values.sortOrder ?? 0,
        department: deptArrToStr(values.department || []),
      });
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
        department: deptArrToStr(values.department || []),
        password: values.password,
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
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      render: (v) => {
        const arr = deptStrToArr(v);
        if (!arr.length) return <Tag>未设置</Tag>;
        return (
          <Space size={4}>
            {arr.map((d) => (
              <Tag key={d} color={d === DEPARTMENT.OPTICAL ? 'blue' : 'purple'}>
                {DEPT_LABELS[d] || d}
              </Tag>
            ))}
          </Space>
        );
      },
    },
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

  const deptCheckboxGroup = (
    <Checkbox.Group>
      <Checkbox value={DEPARTMENT.OPTICAL}>配镜部（可登记验光单）</Checkbox>
      <Checkbox value={DEPARTMENT.OPHTHALMOLOGY}>眼科部（可登记病例）</Checkbox>
    </Checkbox.Group>
  );

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
        <Form form={addForm} layout="vertical" initialValues={{ sortOrder: 0, department: [] }}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item label="部门（可多选）" name="department">
            {deptCheckboxGroup}
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
          <Form.Item label="部门（可多选）" name="department">
            {deptCheckboxGroup}
          </Form.Item>
          <Form.Item label="排序（数字越小越靠前）" name="sortOrder">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {/* 按 IMPLEMENTATION.md Phase 5 / 红线规则1：修改需密码 */}
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" autoFocus />
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
