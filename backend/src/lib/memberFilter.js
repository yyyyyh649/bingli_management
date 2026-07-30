// 会员筛选条件：真会员 = member_card_no 有值
// 占位客户（member_card_no IS NULL，仅登记病例/验光单未办卡）不视为会员。
// 共享给 customers / admin / pointTier 等模块，避免各处重复定义导致口径不一致。
export const MEMBER_WHERE = "member_card_no IS NOT NULL AND member_card_no != ''";
