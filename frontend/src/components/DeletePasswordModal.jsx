import React, { useState } from 'react';
import { Modal, Input, Form } from 'antd';
import { DEFAULT_DELETE_PASSWORD } from '@optical/shared/constants.js';

// 通用删除密码 Modal，多处复用
// onOk(password) 返回 Promise
export default function DeletePasswordModal({
  open,
  title = '删除确认',
  content = '此操作不可撤销，请输入删除密码以确认',
  onOk,
  onCancel,
}) {
  const [form] = Form.useForm();
  const [confirmLoading, setConfirmLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setConfirmLoading(true);
      await onOk(values.password);
      form.resetFields();
    } catch (e) {
      // 校验失败或 onOk 抛错（onOk 内已提示），不关闭
      if (e?.errorFields) return; // 表单校验失败
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel?.();
  };

  return (
    <Modal
      open={open}
      title={title}
      okText="确认删除"
      cancelText="取消"
      okButtonProps={{ danger: true }}
      confirmLoading={confirmLoading}
      onOk={handleOk}
      onCancel={handleCancel}
      destroyOnClose
    >
      <p style={{ color: '#666', marginBottom: 16 }}>{content}</p>
      <Form form={form} layout="vertical">
        <Form.Item
          name="password"
          label="删除密码"
          rules={[{ required: true, message: '请输入删除密码' }]}
        >
          <Input.Password
            placeholder={`默认密码：${DEFAULT_DELETE_PASSWORD}`}
            autoFocus
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
