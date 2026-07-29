import React, { useState, useEffect } from 'react';
import { Badge, Button, Tooltip, Popover, List, Tag, Space, Typography, Empty } from 'antd';
import { BellOutlined, GiftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getReviewReminders } from '../api/customers.js';
import { getBirthdaysToday } from '../api/admin.js';

const { Text } = Typography;

// 按 IMPLEMENTATION.md Phase 5：全站各页提示
// 1. 有客户需复查（计数/角标，接口返回超期人数）
// 2. 今日生日会员（列表含登记人字段）
export default function GlobalReminders() {
  const navigate = useNavigate();
  const [reviewCount, setReviewCount] = useState(0);
  const [birthdays, setBirthdays] = useState([]);

  const load = async () => {
    try {
      const [rem, bd] = await Promise.all([getReviewReminders(), getBirthdaysToday()]);
      const total = (rem?.optical?.length || 0) + (rem?.ophthalmology?.length || 0);
      setReviewCount(total);
      setBirthdays(bd?.birthdays || []);
    } catch {
      // 拦截器已提示
    }
  };

  useEffect(() => {
    load();
    // 每 5 分钟刷新一次
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const birthdayContent = birthdays.length ? (
    <div style={{ width: 300 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        今日生日会员（{birthdays.length} 人）
      </div>
      <List
        size="small"
        dataSource={birthdays}
        renderItem={(m) => (
          <List.Item>
            <Space direction="vertical" size={0} style={{ width: '100%' }}>
              <Space>
                <Text strong>{m.name || '-'}</Text>
                <Text type="secondary">{m.phone}</Text>
                {m.member_card_no ? <Tag color="gold">{m.member_card_no}</Tag> : null}
              </Space>
              {/* 按 IMPLEMENTATION.md Phase 5：含登记人字段，便于登记人亲自联系 */}
              <Text type="secondary" style={{ fontSize: 12 }}>
                登记人：{m.operator || '-'}｜门店：{m.store || '-'}
              </Text>
            </Space>
          </List.Item>
        )}
      />
    </div>
  ) : (
    <Empty description="今日无生日会员" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  );

  return (
    <Space size={12}>
      {/* 今日生日提醒 */}
      <Popover content={birthdayContent} title="今日生日" trigger="click" placement="bottomRight">
        <Badge count={birthdays.length} offset={[-2, 2]}>
          <Tooltip title="今日生日会员">
            <Button
              type="text"
              icon={<GiftOutlined style={{ color: birthdays.length ? '#eb2f96' : undefined, fontSize: 18 }} />}
            />
          </Tooltip>
        </Badge>
      </Popover>

      {/* 复查超期提醒 */}
      <Badge count={reviewCount} offset={[-2, 2]}>
        <Tooltip title={reviewCount > 0 ? `${reviewCount} 位客户需复查` : '无超期复查'}>
          <Button
            type="text"
            icon={<BellOutlined style={{ color: reviewCount > 0 ? '#ff4d4f' : undefined, fontSize: 18 }} />}
            onClick={() => navigate('/customer/search')}
          />
        </Tooltip>
      </Badge>
    </Space>
  );
}
