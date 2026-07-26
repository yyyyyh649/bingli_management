import React, { useState, useMemo } from 'react';
import {
  Card,
  Form,
  Input,
  Radio,
  DatePicker,
  Button,
  Space,
  message,
  Steps,
  List,
  Tag,
  Typography,
  Empty,
  Select,
} from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { createCase } from '../../api/cases.js';
import { useOperators } from '../../api/operators.js';
import {
  DEFAULT_QUESTIONNAIRE,
  findQuestion,
  nextQuestionId,
} from '@optical/shared/questionnaire.js';
import { CASE_MODE } from '@optical/shared/constants.js';

const { Title, Text } = Typography;

// 通用问卷分支引擎：题目/选项/跳转全部由 DEFAULT_QUESTIONNAIRE 配置驱动，不写死
export default function CaseComplexForm() {
  const navigate = useNavigate();
  const { operators, loading: opLoading } = useOperators();
  const [metaForm] = Form.useForm();

  // 已答历史：[{ questionId, questionText, selectedLabel, otherText? }, ...]
  const [history, setHistory] = useState([]);
  // 当前题目 id（null 表示问卷已完成）
  const [currentId, setCurrentId] = useState(
    DEFAULT_QUESTIONNAIRE[0]?.id || null
  );
  // 当前题已选 option（暂存，配合"下一步"按钮提交）
  const [pendingOption, setPendingOption] = useState(null);
  // "其他"选项的自定义文本
  const [otherText, setOtherText] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const currentQuestion = useMemo(
    () => findQuestion(DEFAULT_QUESTIONNAIRE, currentId),
    [currentId]
  );

  const isFinished = currentId === null && currentQuestion === null;

  // 选择某个 option（暂存，等"下一步"确认）
  const onSelectOption = (option) => {
    setPendingOption(option);
    if (option?.isOther) {
      setOtherText(''); // 切换到"其他"时重置
    }
  };

  // 确认当前题答案并跳转下一题
  const goNext = () => {
    if (!pendingOption) {
      message.warning('请选择一个选项');
      return;
    }
    if (pendingOption.isOther && !otherText.trim()) {
      message.warning('请填写"其他"的具体内容');
      return;
    }
    const answer = {
      questionId: currentQuestion.id,
      questionText: currentQuestion.text,
      selectedLabel: pendingOption.label,
    };
    if (pendingOption.isOther) {
      answer.otherText = otherText.trim();
    }
    // 截断到当前题之后（处理回退后重新作答的情况），追加新答案
    const truncateIdx = history.findIndex(
      (h) => h.questionId === currentQuestion.id
    );
    const baseHistory =
      truncateIdx >= 0 ? history.slice(0, truncateIdx) : history;
    const newHistory = [...baseHistory, answer];
    setHistory(newHistory);

    const nextId = nextQuestionId(DEFAULT_QUESTIONNAIRE, currentId, pendingOption);
    setCurrentId(nextId); // null 表示问卷结束
    setPendingOption(null);
    setOtherText('');
  };

  // 点击历史回退到某题：截断历史到该题之前，重新作答
  const goBackTo = (index) => {
    const target = history[index];
    if (!target) return;
    setHistory(history.slice(0, index));
    setCurrentId(target.questionId);
    setPendingOption(null);
    setOtherText('');
  };

  // 提交病例
  const onSubmit = async (metaValues) => {
    if (history.length === 0) {
      message.warning('请先完成问卷');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        mode: CASE_MODE.COMPLEX,
        answers: JSON.stringify(history),
        recordDate: metaValues.recordDate
          ? dayjs(metaValues.recordDate).format('YYYY-MM-DD')
          : dayjs().format('YYYY-MM-DD'),
        operator: metaValues.operator,
        // 复杂模式默认无客户关联
        customerName: '',
        customerPhone: '',
      };
      await createCase(payload);
      message.success('复杂病例登记成功');
      // 重置问卷
      setHistory([]);
      setCurrentId(DEFAULT_QUESTIONNAIRE[0]?.id || null);
      setPendingOption(null);
      setOtherText('');
      metaForm.resetFields();
      metaForm.setFieldsValue({ recordDate: dayjs() });
    } catch (e) {
      // 拦截器已提示
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="复杂病例问卷登记">
      <Steps
        size="small"
        current={isFinished ? history.length : history.length}
        status={isFinished ? 'finish' : 'process'}
        style={{ marginBottom: 16 }}
        items={[
          { title: '问卷作答' },
          { title: '完成提交' },
        ]}
      />

      {/* 已答历史，可点击回退 */}
      {history.length > 0 && (
        <Card
          size="small"
          title="已答记录（点击可回退到该题）"
          style={{ marginBottom: 16, background: '#fafafa' }}
        >
          <List
            size="small"
            dataSource={history}
            renderItem={(item, idx) => (
              <List.Item
                actions={[
                  <Button type="link" size="small" onClick={() => goBackTo(idx)}>
                    回退到此题
                  </Button>,
                ]}
              >
                <div>
                  <Text strong>
                    {idx + 1}. {item.questionText}
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <Tag color="blue">{item.selectedLabel}</Tag>
                    {item.otherText ? (
                      <Text type="secondary">（{item.otherText}）</Text>
                    ) : null}
                  </div>
                </div>
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* 当前题目 */}
      {!isFinished && currentQuestion ? (
        <div style={{ marginBottom: 24 }}>
          <Title level={5}>
            {currentQuestion.text}
          </Title>
          <Radio.Group
            value={pendingOption?.label}
            onChange={(e) => {
              const opt = currentQuestion.options.find(
                (o) => o.label === e.target.value
              );
              onSelectOption(opt);
            }}
          >
            <Space direction="vertical">
              {currentQuestion.options.map((opt) => (
                <Radio key={opt.label} value={opt.label}>
                  {opt.label}
                  {opt.isOther ? '（请补充说明）' : ''}
                </Radio>
              ))}
            </Space>
          </Radio.Group>

          {pendingOption?.isOther && (
            <div style={{ marginTop: 12, maxWidth: 480 }}>
              <Input
                placeholder="请输入具体内容"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                onPressEnter={goNext}
              />
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <Button type="primary" onClick={goNext} disabled={!pendingOption}>
              {pendingOption && nextQuestionId(DEFAULT_QUESTIONNAIRE, currentId, pendingOption) === null
                ? '完成本题'
                : '下一步'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* 问卷完成 → 显示提交表单 */}
      {isFinished && (
        <Card
          size="small"
          type="inner"
          title="问卷已完成，请补充登记信息后提交"
          style={{ marginBottom: 16 }}
        >
          <Form
            form={metaForm}
            layout="vertical"
            onFinish={onSubmit}
            style={{ maxWidth: 480 }}
            initialValues={{ recordDate: dayjs() }}
          >
            <Form.Item
              label="登记人"
              name="operator"
              rules={[{ required: true, message: '请选择登记人' }]}
            >
              <Select placeholder={opLoading ? '加载中...' : '请选择登记人'} loading={opLoading} allowClear>
                {operators.map((op) => (
                  <Select.Option key={op.id} value={op.name}>
                    {op.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              label="登记日期"
              name="recordDate"
              rules={[{ required: true, message: '请选择登记日期' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={submitting}>
                  提交病例
                </Button>
                <Button onClick={() => navigate('/case')}>返回</Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>
      )}

      {!isFinished && !currentQuestion && (
        <Empty description="问卷配置为空" />
      )}
    </Card>
  );
}
