import React, { useCallback, useEffect, useState } from 'react';
import {
  Card,
  Tabs,
  Button,
  Space,
  Table,
  Tag,
  Empty,
  Spin,
  message,
  Typography,
  Modal,
  Input,
  Select,
  Radio,
  Checkbox,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
} from '../../api/admin.js';
import DeletePasswordModal from '../../components/DeletePasswordModal.jsx';
import {
  TEMPLATE_TYPES,
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_MAX_PER_TYPE,
  TEMPLATE_PAGE_MAX_COLS,
} from '@optical/shared/constants.js';

const { Text, Paragraph } = Typography;

const OTHER_LABEL = '其他';

function newId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 空模板
function blankTemplate(type) {
  return {
    id: '',
    type,
    name: '',
    pages: [{ items: [] }],
  };
}

export default function Templates() {
  const [activeType, setActiveType] = useState(TEMPLATE_TYPES.PRESCRIPTION);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState(null); // 编辑中的模板对象
  const [delTarget, setDelTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTemplates(activeType);
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    const cnt = list.length;
    if (cnt >= TEMPLATE_MAX_PER_TYPE) {
      message.warning(`${TEMPLATE_TYPE_LABELS[activeType]}模板已达上限（${TEMPLATE_MAX_PER_TYPE} 个）`);
      return;
    }
    setEditor(blankTemplate(activeType));
  };

  const openEdit = async (id) => {
    try {
      const detail = await getTemplate(id);
      setEditor(detail);
    } catch (e) {
      // 拦截器已提示
    }
  };

  const handleSaved = () => {
    setEditor(null);
    load();
  };

  const columns = [
    { title: '模板名称', dataIndex: 'name', key: 'name', render: (v) => <Text strong>{v}</Text> },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (v) => <Tag color={v === TEMPLATE_TYPES.PRESCRIPTION ? 'cyan' : 'purple'}>{TEMPLATE_TYPE_LABELS[v] || v}</Tag>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (v) => (v ? String(v).replace('T', ' ') : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r.id)}>编辑</Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => setDelTarget(r)}>删除</Button>
        </Space>
      ),
    },
  ];

  const tabs = Object.values(TEMPLATE_TYPES).map((t) => ({
    key: t,
    label: `${TEMPLATE_TYPE_LABELS[t]}模板（${list.length}/${TEMPLATE_MAX_PER_TYPE}）`,
    children: (
      <Spin spinning={loading}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`编辑${TEMPLATE_TYPE_LABELS[t]}的检查/验光内容模板（个人信息页固定，不在模板内）`}
            description={
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>每页最多 {TEMPLATE_PAGE_MAX_COLS} 列，可拖拽排序题目、设置每题宽度。</li>
                <li>新建题目先选「选项」或「填空」；选项题可自建选项，系统默认追加「其他」（可手动输入）。</li>
                <li>每类型最多保存 {TEMPLATE_MAX_PER_TYPE} 个模板，可自定义命名。</li>
              </ul>
            }
          />
          <div>
            <Button type="primary" icon={<PlusOutlined />} onClick={openNew} style={{ marginBottom: 12 }}>
              新建模板
            </Button>
            {list.length === 0 && !loading ? (
              <Empty description="暂无模板" />
            ) : (
              <Table
                rowKey="id"
                size="small"
                columns={columns}
                dataSource={list}
                pagination={false}
              />
            )}
          </div>
        </Space>
      </Spin>
    ),
  }));

  return (
    <>
      <Card title="验光单 / 病例模板编辑">
        <Tabs activeKey={activeType} onChange={(k) => setActiveType(k)} items={tabs} />
      </Card>

      {editor && (
        <TemplateEditorModal
          template={editor}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
        />
      )}

      <DeletePasswordModal
        open={!!delTarget}
        title="删除模板确认"
        content={`确认删除模板「${delTarget?.name || ''}」？删除后可在回收站保留30天。`}
        onOk={async (password) => {
          try {
            await deleteTemplate(delTarget.id, password);
            message.success('已删除');
            setDelTarget(null);
            load();
          } catch (e) {
            throw e;
          }
        }}
        onCancel={() => setDelTarget(null)}
      />
    </>
  );
}

// ============================================================================
// 模板编辑器 Modal
// ============================================================================
function TemplateEditorModal({ template, onClose, onSaved }) {
  const [name, setName] = useState(template.name || '');
  const [pages, setPages] = useState(
    Array.isArray(template.pages) && template.pages.length > 0
      ? template.pages.map((p) => ({ items: Array.isArray(p.items) ? p.items.map((it) => ({ ...it })) : [] }))
      : [{ items: [] }]
  );
  const [activePage, setActivePage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);

  // 新建题目弹窗
  const [newItemModal, setNewItemModal] = useState(false);
  const [newItemType, setNewItemType] = useState('text');

  const isEdit = !!template.id;

  // ---- 页面操作 ----
  const addPage = () => {
    setPages([...pages, { items: [] }]);
    setActivePage(pages.length);
  };

  const removePage = (idx) => {
    if (pages.length <= 1) {
      message.warning('至少保留 1 页');
      return;
    }
    const next = pages.filter((_, i) => i !== idx);
    setPages(next);
    setActivePage((p) => Math.max(0, Math.min(p, next.length - 1)));
  };

  // ---- 题目操作 ----
  const currentPage = pages[activePage] || { items: [] };

  const updateItems = (updater) => {
    setPages((prev) => prev.map((pg, i) => (i === activePage ? { items: updater(pg.items || []) } : pg)));
  };

  const addItemAt = (item) => {
    updateItems((items) => [...items, item]);
  };

  const updateItem = (idx, patch) => {
    updateItems((items) => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx) => {
    updateItems((items) => items.filter((_, i) => i !== idx));
  };

  // 选项题：选项操作
  const addOption = (idx) => {
    updateItem(idx, {});
    updateItems((items) =>
      items.map((it, i) => (i === idx ? { ...it, options: [...(it.options || []), ''] } : it))
    );
  };
  const updateOption = (itemIdx, optIdx, val) => {
    updateItems((items) =>
      items.map((it, i) =>
        i === itemIdx ? { ...it, options: (it.options || []).map((o, j) => (j === optIdx ? val : o)) } : it
      )
    );
  };
  const removeOption = (itemIdx, optIdx) => {
    updateItems((items) =>
      items.map((it, i) =>
        i === itemIdx ? { ...it, options: (it.options || []).filter((_, j) => j !== optIdx) } : it
      )
    );
  };

  // ---- 拖拽排序 ----
  const onDragStart = (idx) => setDragIndex(idx);
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (idx) => {
    if (dragIndex == null || dragIndex === idx) return;
    updateItems((items) => {
      const next = [...items];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  // ---- 保存 ----
  const handleSave = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      message.warning('请输入模板名称');
      return;
    }
    // 校验题目
    for (let pi = 0; pi < pages.length; pi++) {
      const items = pages[pi].items || [];
      for (let ii = 0; ii < items.length; ii++) {
        if (!String(items[ii].label || '').trim()) {
          message.warning(`第 ${pi + 1} 页第 ${ii + 1} 题缺少问题文本`);
          return;
        }
        if (items[ii].type === 'choice') {
          const opts = (items[ii].options || []).map((o) => String(o || '').trim()).filter(Boolean);
          if (opts.length === 0) {
            message.warning(`第 ${pi + 1} 页第 ${ii + 1} 题至少需要 1 个选项`);
            return;
          }
        }
      }
    }
    setSaving(true);
    try {
      // 规整 pages（过滤空选项、补 id、限制宽度）
      const cleanPages = pages.map((pg) => ({
        items: (pg.items || []).map((it) => ({
          id: it.id || newId(),
          type: it.type,
          label: String(it.label || '').trim(),
          width: Math.min(Math.max(Number(it.width) || 1, 1), TEMPLATE_PAGE_MAX_COLS),
          required: !!it.required,
          options: it.type === 'choice'
            ? (it.options || []).map((o) => String(o || '').trim()).filter(Boolean)
            : [],
        })),
      }));
      await saveTemplate({
        id: template.id || '',
        type: template.type,
        name: cleanName,
        pages: cleanPages,
      });
      message.success(isEdit ? '模板已更新' : '模板已保存');
      onSaved();
    } catch (e) {
      // 拦截器已提示
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${isEdit ? '编辑' : '新建'}${TEMPLATE_TYPE_LABELS[template.type] || ''}模板`}
      width={960}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
            保存模板
          </Button>
        </Space>
      }
      destroyOnClose
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Text strong style={{ marginRight: 8 }}>模板名称：</Text>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="自定义模板名称（如：标准验光流程）"
            style={{ width: 320 }}
            maxLength={50}
          />
        </div>

        {/* 页面导航 */}
        <Card size="small" title="页面" extra={
          <Space>
            <Button size="small" icon={<PlusOutlined />} onClick={addPage}>新增页</Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removePage(activePage)} disabled={pages.length <= 1}>删除当前页</Button>
          </Space>
        }>
          <Space wrap>
            {pages.map((pg, i) => (
              <Button
                key={i}
                size="small"
                type={i === activePage ? 'primary' : 'default'}
                onClick={() => setActivePage(i)}
              >
                第 {i + 1} 页（{(pg.items || []).length} 题）
              </Button>
            ))}
          </Space>
        </Card>

        {/* 当前页编辑区 */}
        <Card
          size="small"
          title={`第 ${activePage + 1} 页编辑（最多 ${TEMPLATE_PAGE_MAX_COLS} 列）`}
          extra={
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { setNewItemType('text'); setNewItemModal(true); }}>
              新建题目
            </Button>
          }
        >
          {(currentPage.items || []).length === 0 ? (
            <Empty description="本页还没有题目，点击右上角「新建题目」" />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
              {(currentPage.items || []).map((it, idx) => (
                <ItemCard
                  key={it.id || idx}
                  item={it}
                  idx={idx}
                  width={it.width}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onChange={(patch) => updateItem(idx, patch)}
                  onRemove={() => removeItem(idx)}
                  onAddOption={() => addOption(idx)}
                  onUpdateOption={(oi, val) => updateOption(idx, oi, val)}
                  onRemoveOption={(oi) => removeOption(idx, oi)}
                />
              ))}
            </div>
          )}
          <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            提示：拖拽题目卡片可调整顺序；选项题默认在末尾自动追加「其他」（可手动输入），无需在此添加。
          </Paragraph>
        </Card>
      </Space>

      {/* 新建题目选择类型 */}
      <Modal
        open={newItemModal}
        title="新建题目"
        onCancel={() => setNewItemModal(false)}
        onOk={() => {
          const item = {
            id: newId(),
            type: newItemType,
            label: '',
            width: 1,
            required: false,
            options: newItemType === 'choice' ? [''] : undefined,
          };
          addItemAt(item);
          setNewItemModal(false);
        }}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Paragraph type="secondary">先选择题目类型：</Paragraph>
        <Radio.Group
          value={newItemType}
          onChange={(e) => setNewItemType(e.target.value)}
        >
          <Radio value="text">填空题（出现文本框）</Radio>
          <Radio value="choice">选项题（可自建选项 + 自动追加「其他」）</Radio>
        </Radio.Group>
      </Modal>
    </Modal>
  );
}

// ============================================================================
// 单个题目卡片（可拖拽）
// ============================================================================
function ItemCard({ item, idx, width, onDragStart, onDragOver, onDrop, onChange, onRemove, onAddOption, onUpdateOption, onRemoveOption }) {
  const cols = TEMPLATE_PAGE_MAX_COLS;
  const w = Math.min(Math.max(Number(width) || 1, 1), cols);
  const pct = (w / cols) * 100;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(idx)}
      onDragOver={onDragOver}
      onDrop={() => onDrop(idx)}
      style={{
        width: `calc(${pct}% - 12px * ${(cols - 1) / cols})`,
        minWidth: 240,
        border: '1px solid #e8e8e8',
        borderRadius: 6,
        padding: 12,
        background: '#fafafa',
        cursor: 'grab',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space size={4}>
          <HolderOutlined style={{ color: '#999' }} />
          <Tag color={item.type === 'choice' ? 'blue' : 'green'}>{item.type === 'choice' ? '选项' : '填空'}</Tag>
        </Space>
        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onRemove} />
      </div>

      <Input
        value={item.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="问题文本"
        style={{ marginBottom: 8 }}
      />

      <Space size={8} wrap style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#666' }}>宽度：</span>
        <Select
          value={w}
          onChange={(v) => onChange({ width: v })}
          style={{ width: 90 }}
          size="small"
          options={Array.from({ length: cols }, (_, i) => ({ value: i + 1, label: `${i + 1} 列` }))}
        />
        <Checkbox
          checked={!!item.required}
          onChange={(e) => onChange({ required: e.target.checked })}
        >
          必填
        </Checkbox>
      </Space>

      {item.type === 'text' && (
        <Input.TextArea
          autoSize={{ minRows: 1, maxRows: 2 }}
          placeholder="文本框预览（填写时显示）"
          disabled
        />
      )}

      {item.type === 'choice' && (
        <div style={{ marginTop: 4 }}>
          {(item.options || []).map((opt, oi) => (
            <Space key={oi} size={4} style={{ display: 'flex', marginBottom: 4 }}>
              <Input
                value={opt}
                onChange={(e) => onUpdateOption(oi, e.target.value)}
                placeholder={`选项 ${oi + 1}`}
                size="small"
                style={{ width: 200 }}
              />
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onRemoveOption(oi)} />
            </Space>
          ))}
          <div style={{ marginTop: 4 }}>
            <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onAddOption}>新增选项</Button>
          </div>
          <div style={{ marginTop: 6, padding: '2px 8px', background: '#f0f0f0', borderRadius: 4, fontSize: 12, color: '#888', display: 'inline-block' }}>
            其他（自动追加，填写时可手动输入）
          </div>
        </div>
      )}
    </div>
  );
}
