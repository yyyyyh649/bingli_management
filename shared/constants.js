// 通用常量与枚举（backend / cloud / frontend 共用）

// 店铺标识
export const STORE_IDS = ['store1', 'store2'];

// 同步状态
export const SYNC_STATUS = {
  PENDING: 'pending',
  SYNCED: 'synced',
};

// 病例模式
export const CASE_MODE = {
  SIMPLE: 'simple',
  COMPLEX: 'complex',
};

// 积分来源类型
export const POINTS_SOURCE = {
  PRESCRIPTION: 'prescription',   // 验光配镜自动积分
  MANUAL_ADD: 'manual_add',       // 后台手动加分
  WITHDRAW: 'withdraw',           // 提现
  GIFT_REDEEM: 'gift_redeem',     // 兑换小礼品
  CONSUME_DEDUCT: 'consume_deduct', // 验光单积分抵扣（扣减）
};

// 余额来源类型
export const BALANCE_SOURCE = {
  TOPUP: 'topup',                 // 充值
  CONSUME: 'consume',             // 验光单消费抵扣
  MANUAL_DEDUCT: 'manual_deduct', // 手动扣减（客户查询处）
};

// 部门
export const DEPARTMENT = {
  OPTICAL: 'optical',             // 配镜部
  OPHTHALMOLOGY: 'ophthalmology', // 眼科部
};

// 积分抵扣比例：100积分 = 1元
export const POINTS_TO_YUAN_RATE = 100;

// 积分扣除原因（扣分时必选，仅这两项，扩展需需求方确认）
export const POINTS_DEDUCT_REASONS = ['提现', '兑换小礼品'];

// 业务表名（同步白名单）
export const SYNC_TABLES = [
  'customers',
  'points_ledger',
  'balance_ledger',
  'cases',
  'prescriptions',
  'operators',
];

// 验光单 6 个项目键（DS 与 DC 共用同一组顺序）
export const PRESCRIPTION_STEPS = [
  'auto_refraction',   // 电脑验光
  'retinoscopy_fast',  // 检影验光(快散)
  'retinoscopy_slow',  // 检影验光(慢散)
  'trial_lens_check',  // 插片复检
  'final_rx_far',      // 配装眼镜(远用)
  'final_rx_near',     // 配装眼镜(近用)
];

export const PRESCRIPTION_STEP_LABELS = {
  auto_refraction: '电脑验光',
  retinoscopy_fast: '检影验光(快散)',
  retinoscopy_slow: '检影验光(慢散)',
  trial_lens_check: '插片复检',
  final_rx_far: '配装眼镜(远用)',
  final_rx_near: '配装眼镜(近用)',
};

// 眼睛 / 度数类型
export const EYE_TYPES = ['od', 'os'];           // 右眼 / 左眼
export const RX_TYPES = ['ds', 'dc'];            // 球镜 / 柱镜（DC 含轴向）

export const EYE_LABELS = { od: '右眼 (OD)', os: '左眼 (OS)' };
export const RX_LABELS = { ds: 'DS (球镜)', dc: 'DC (柱镜)' };

// 默认删除密码（可被环境变量覆盖）
export const DEFAULT_DELETE_PASSWORD = 'safe@safe';

// 同步相关默认值
export const SYNC_DEFAULTS = {
  INTERVAL_MS: 5000,
  HEALTH_TIMEOUT_MS: 3000,
  PULL_BATCH_SIZE: 500,
  WS_RECONNECT_MS: 5000,
  POLLING_FALLBACK_MS: 8000,
};

// 当前时间戳（精确到秒，ISO 字符串）
export function nowISO() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// 当前日期 YYYY-MM-DD
export function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
