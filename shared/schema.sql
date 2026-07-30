-- ============================================================================
-- 眼镜店系统统一建表脚本（本地店端 + 云端共用）
-- 所有业务表通用字段：
--   id           UUID v4，客户端创建时生成（保证离线全局唯一）
--   store        store1 / store2，记录创建门店
--   operator     登记人姓名（来自 operators 配置）
--   created_at   创建时间戳（精确到秒，UTC ISO 字符串）
--   updated_at   最后修改时间戳
--   sync_status  pending / synced（本地字段，云端恒为 synced）
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- 4.2 客户/会员表
-- phone 为全局唯一识别键；member_card_no 为空表示非会员
-- balance 为缓存余额（由 balance_ledger 汇总，同步时跟随 ledger 一起走）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              TEXT PRIMARY KEY,
  phone           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL DEFAULT '',
  member_card_no  TEXT DEFAULT NULL,
  address         TEXT DEFAULT '',
  store           TEXT NOT NULL,
  operator        TEXT DEFAULT '',
  balance         REAL NOT NULL DEFAULT 0,
  age                INTEGER DEFAULT NULL,
  birthday           TEXT DEFAULT NULL,
  gender             TEXT DEFAULT '',
  age_is_estimated   INTEGER NOT NULL DEFAULT 0,
  review_cycle_days        INTEGER NOT NULL DEFAULT 90,  -- 复查周期（天），默认3个月
  review_contact_status    TEXT NOT NULL DEFAULT 'pending', -- 待联系/已联系/已到店
  review_contact_note      TEXT NOT NULL DEFAULT '',
  review_contact_updated_at TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  sync_status     TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_customers_name           ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_member_card_no ON customers(member_card_no);
CREATE INDEX IF NOT EXISTS idx_customers_phone          ON customers(phone);  -- 已是 UNIQUE，再次显式建以便 EXISTS 查询路径稳定

-- ----------------------------------------------------------------------------
-- 4.3 积分明细表（只增不改的流水账）
-- amount 正数=增加，负数=扣除；source_type 枚举见 constants.js
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS points_ledger (
  id                       TEXT PRIMARY KEY,
  customer_phone           TEXT NOT NULL,
  amount                   INTEGER NOT NULL,
  source_type              TEXT NOT NULL,
  related_prescription_id  TEXT DEFAULT NULL,
  note                     TEXT DEFAULT '',
  store                    TEXT NOT NULL,
  operator                 TEXT DEFAULT '',
  created_at               TEXT NOT NULL,
  sync_status              TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_points_customer_phone ON points_ledger(customer_phone);
CREATE INDEX IF NOT EXISTS idx_points_created_at     ON points_ledger(created_at);

-- ----------------------------------------------------------------------------
-- 4.3b 余额明细表（只增不改的流水账，与积分明细对称）
-- amount 正数=充值，负数=消费/扣减；source_type 见 constants.js
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS balance_ledger (
  id                       TEXT PRIMARY KEY,
  customer_phone           TEXT NOT NULL,
  amount                   REAL NOT NULL,
  source_type              TEXT NOT NULL,
  related_prescription_id  TEXT DEFAULT NULL,
  note                     TEXT DEFAULT '',
  store                    TEXT NOT NULL,
  operator                 TEXT DEFAULT '',
  created_at               TEXT NOT NULL,
  sync_status              TEXT NOT NULL DEFAULT 'pending',
  -- 按用户新需求：充值记录区分实充金额（实际收款）与到账金额（充入卡内=amount）
  -- 仅充值(topup)有意义；扣减记录该字段为 NULL
  actual_amount            REAL DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_balance_customer_phone ON balance_ledger(customer_phone);
CREATE INDEX IF NOT EXISTS idx_balance_created_at     ON balance_ledger(created_at);

-- ----------------------------------------------------------------------------
-- 4.4 病例表
-- mode: simple(简约) / complex(复杂)
-- answers: 复杂模式的问卷作答 JSON，[{questionId, selectedLabel, otherText?}, ...]
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cases (
  id                TEXT PRIMARY KEY,
  mode              TEXT NOT NULL,           -- 'simple' | 'complex'
  customer_name     TEXT DEFAULT '',
  customer_phone    TEXT DEFAULT '',
  customer_gender   TEXT DEFAULT '',         -- '男' | '女' | ''
  customer_address  TEXT DEFAULT '',
  customer_ref_id    TEXT DEFAULT '',
  review_cycle_days  INTEGER NOT NULL DEFAULT 90,
  condition         TEXT DEFAULT '',         -- 简约模式病情描述
  answers           TEXT DEFAULT '[]',       -- 复杂模式问卷作答 JSON
  record_date       TEXT NOT NULL,             -- 登记日期 YYYY-MM-DD
  store             TEXT NOT NULL,
  operator          TEXT DEFAULT '',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  sync_status       TEXT NOT NULL DEFAULT 'pending',
  -- 按用户新需求 Phase D：病例登记移植支付页，保留全部支付优惠信息（与 prescriptions 对称）
  original_amount          REAL DEFAULT 0,       -- 原价（总金额）
  discount_type            TEXT DEFAULT '',       -- 'discount' 打折 | 'reduction' 立减 | ''
  discount_value           REAL DEFAULT 0,        -- 打折:折扣率; 立减:金额
  discounted_amount        REAL DEFAULT 0,        -- 折后价
  balance_deduction        REAL DEFAULT 0,        -- 余额抵扣金额
  balance_deduction_phone  TEXT DEFAULT '',       -- 余额抵扣客户手机号
  points_deduction         INTEGER DEFAULT 0,     -- 积分抵扣消耗的积分数
  points_deduction_amount  REAL DEFAULT 0,        -- 积分抵扣折算金额
  points_deduction_phone   TEXT DEFAULT '',       -- 积分抵扣客户手机号
  paid_amount              REAL DEFAULT 0,        -- 实付金额
  points_earned            INTEGER DEFAULT 0,     -- 本次新增积分
  points_target_phone      TEXT DEFAULT '',       -- 积分归属手机号
  template_id              TEXT DEFAULT '',       -- 按用户新需求 Phase H：所用模板 id
  template_answers         TEXT DEFAULT '[]'      -- 模板作答 JSON
);
CREATE INDEX IF NOT EXISTS idx_cases_customer_phone ON cases(customer_phone);
CREATE INDEX IF NOT EXISTS idx_cases_record_date    ON cases(record_date);
-- idx_cases_customer_ref_id 不在此处创建：旧库升级时 cases 表已存在但无 customer_ref_id 列，
-- 会导致 db.exec(schema) 中断。改为在 db.js 迁移末尾（ALTER TABLE 加列之后）创建。

-- ----------------------------------------------------------------------------
-- 4.5 验光单表
-- customer_phone 为顶层独立字段（用于索引）；page1/od_ds/od_dc/os_ds/os_dc/page6 为 JSON 字符串
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
  id                  TEXT PRIMARY KEY,
  customer_phone      TEXT DEFAULT '',       -- 顶层独立字段，与 page1.phone 保持一致
  customer_name       TEXT DEFAULT '',
  customer_ref_id    TEXT DEFAULT '',
  review_cycle_days  INTEGER NOT NULL DEFAULT 90,
  gender             TEXT DEFAULT '',
  notes              TEXT DEFAULT '',
  page1               TEXT DEFAULT '{}',     -- JSON: {name,age,address,phone,record_date}
  od_ds               TEXT DEFAULT '{}',     -- JSON: 6 项 {key: {value}}
  od_dc               TEXT DEFAULT '{}',     -- JSON: 6 项 {key: {value, axis}}
  os_ds               TEXT DEFAULT '{}',
  os_dc               TEXT DEFAULT '{}',
  page6               TEXT DEFAULT '{}',     -- JSON: {lens_price, frame_price, pd_near, pd_far}
  points_target_phone TEXT DEFAULT '',       -- 积分归属手机号
  points_amount       INTEGER DEFAULT 0,     -- 实际写入的积分（0 表示未生成积分）
  -- 支付与抵扣字段
  original_amount     REAL DEFAULT 0,        -- 原价 = 镜片价 + 镜架价
  discount_type       TEXT DEFAULT '',       -- 'discount'(打折) / 'reduction'(立减) / ''
  discount_value      REAL DEFAULT 0,        -- 打折: 折扣率如0.8; 立减: 金额
  discounted_amount   REAL DEFAULT 0,        -- 折后价
  balance_deduction   REAL DEFAULT 0,        -- 余额抵扣金额
  points_deduction    INTEGER DEFAULT 0,     -- 积分抵扣消耗的积分数
  points_deduction_amount REAL DEFAULT 0,    -- 积分抵扣金额 = points_deduction / 100
  paid_amount         REAL DEFAULT 0,        -- 实付金额（最终）
  points_earned       INTEGER DEFAULT 0,     -- 本次新增积分（实付金额取整，店员可改）
  record_date         TEXT NOT NULL,
  store               TEXT NOT NULL,
  operator            TEXT DEFAULT '',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  sync_status         TEXT NOT NULL DEFAULT 'pending',
  template_id         TEXT DEFAULT '',       -- 按用户新需求 Phase H：所用模板 id
  template_answers    TEXT DEFAULT '[]'      -- 模板作答 JSON
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer_phone ON prescriptions(customer_phone);
CREATE INDEX IF NOT EXISTS idx_prescriptions_record_date    ON prescriptions(record_date);
-- idx_prescriptions_customer_ref_id 不在此处创建：旧库升级时 prescriptions 表已存在但无 customer_ref_id 列，
-- 会导致 db.exec(schema) 中断。改为在 db.js 迁移末尾（ALTER TABLE 加列之后）创建。

-- ----------------------------------------------------------------------------
-- 4.8 登记人名单（每店各自维护）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operators (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  store       TEXT NOT NULL,                 -- 该员工所属门店
  department  TEXT DEFAULT '',               -- 部门，逗号分隔: 'optical'(配镜部) / 'ophthalmology'(眼科部) / 'optical,ophthalmology'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_operators_store ON operators(store);

-- ----------------------------------------------------------------------------
-- 4.9 会员积分档位配置（按用户新需求 Phase G：1-10档，自定义档位名+阈值+年度清零）
-- 单行配置（id 固定为 'default'），tiers 为 JSON 数组，按阈值升序：
--   [{"name":"普通","threshold":0}, {"name":"银卡","threshold":1000}, ...]
-- reset_month/reset_day 为空表示永不清零
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS point_tier_config (
  id           TEXT PRIMARY KEY DEFAULT 'default',
  tiers        TEXT DEFAULT '[]',
  reset_month  INTEGER DEFAULT NULL,
  reset_day    INTEGER DEFAULT NULL,
  updated_at   TEXT NOT NULL,
  sync_status  TEXT NOT NULL DEFAULT 'pending'
);

-- ----------------------------------------------------------------------------
-- 4.10 验光单/病例模板（按用户新需求 Phase H）
-- type: 'prescription' | 'case'，每类型最多 10 个模板
-- pages: JSON 数组，结构为 [{ items: [{ id, type:'choice'|'text', label, width(1-4),
--          required, options:[string] }] }]，"其他"选项在渲染时自动追加、不入库
-- 个人信息页固定，模板只描述验光/检查/手术内容
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS form_templates (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,                 -- 'prescription' | 'case'
  name         TEXT NOT NULL,                 -- 模板名称
  pages        TEXT NOT NULL DEFAULT '[]',    -- JSON: pages 数组
  store        TEXT NOT NULL,
  operator     TEXT DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  sync_status  TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_form_templates_type ON form_templates(type);

-- ----------------------------------------------------------------------------
-- 5.6 删除留痕日志（永久保留，不可再删除）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delete_logs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  deleted_table     TEXT NOT NULL,
  deleted_record_id TEXT NOT NULL,
  store             TEXT NOT NULL,
  deleted_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_delete_logs_deleted_at ON delete_logs(deleted_at);

-- ----------------------------------------------------------------------------
-- 5.7 回收站（按用户新需求 Phase C：软删除保留30天，可恢复，禁删回收站内容）
-- 删除时把完整记录快照存入此表；30天后自动清理；期间可恢复
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recycle_bin (
  id           TEXT PRIMARY KEY,             -- UUID
  table_name   TEXT NOT NULL,                -- 原始表名
  record_id    TEXT NOT NULL,                -- 原始记录 id
  payload      TEXT NOT NULL,                -- 完整记录 JSON 快照
  store        TEXT NOT NULL,
  operator     TEXT DEFAULT '',
  deleted_at   TEXT NOT NULL,                -- 删除时间（ISO）
  expires_at   TEXT NOT NULL                 -- deleted_at + 30天（ISO），到期后自动清理
);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires_at ON recycle_bin(expires_at);
CREATE INDEX IF NOT EXISTS idx_recycle_bin_table      ON recycle_bin(table_name, record_id);

-- ============================================================================
-- 以下为同步机制相关表
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 本地 outbox：待推送的变更队列（仅本地店端使用）
-- operation: 'upsert' | 'delete'
-- payload:   完整记录的 JSON（upsert）或 null（delete）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_outbox (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  operation     TEXT NOT NULL,              -- 'upsert' | 'delete'
  payload       TEXT,                       -- JSON 字符串，delete 时为 NULL
  created_at    TEXT NOT NULL,
  sync_status   TEXT NOT NULL DEFAULT 'pending',
  synced_at     TEXT,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(sync_status, created_at);

-- ----------------------------------------------------------------------------
-- 本地同步游标：记录从云端拉取到的最大 change_log id（仅本地店端使用）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_state (
  key            TEXT PRIMARY KEY,          -- 当前固定为 'cloud_pull'
  last_seq       INTEGER NOT NULL DEFAULT 0,
  last_pull_at   TEXT
);

-- ----------------------------------------------------------------------------
-- 云端变更日志：每条业务变更追加一行，自增 id 作为店铺拉取游标
-- payload: 完整记录 JSON（upsert），或 null（delete）
-- source_store: 变更来源门店；用于推送转发时排除自己
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cloud_change_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name    TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  operation     TEXT NOT NULL,              -- 'upsert' | 'delete'
  payload       TEXT,
  source_store  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_change_log_id     ON cloud_change_log(id);
CREATE INDEX IF NOT EXISTS idx_change_log_table  ON cloud_change_log(table_name, record_id);
