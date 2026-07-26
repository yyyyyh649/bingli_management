# 眼镜店验光单/病例登记系统

本地运行的眼镜店登记管理系统，覆盖：会员登记与积分查询、病例登记、验光单登记。两店通过云端中转服务器同步数据。

## 功能概览

- **会员登记与查询**：以手机号为唯一识别键，自动去重合并；支持按手机号后4位/完整手机号/姓名/会员卡号查询
- **病例登记**：简约模式（基础字段）/ 复杂模式（通用分支问卷引擎，题目可配置）
- **验光单登记**：6 页向导式表单（基本信息 → 右眼DS → 右眼DC → 左眼DS → 左眼DC → 价格瞳距），自动计算积分并选择归属
- **客户积分页面**：聚合展示个人信息、当前积分、积分明细、全部病例、全部验光单
- **后台管理**：积分手动增减（含重复登记检测）、删除密码保护（`safe@safe`）、删除留痕日志、登记人名单维护、SQLite/Excel 双方式数据导出
- **同步机制**：本地优先架构（离线可完整登记），云端总账本（不丢数据），积分 WebSocket 近乎实时推送，病例/验光单常规轮询

## 技术栈

- **本地应用**：Node.js + Express + better-sqlite3 + React 18 + Vite + Ant Design 5
- **云端中转**：Node.js + Express + better-sqlite3 + ws（WebSocket）
- **同步协议**：HTTPS REST（推送/拉取）+ WebSocket（积分即时广播）
- **数据库**：SQLite（WAL 模式），每店一份完整数据，云端一份总账本
- **部署**：systemd（Linux）/ nssm（Windows）+ nginx + Let's Encrypt

## 目录结构

```
.
├── shared/                # 共享代码（schema、常量、问卷配置、API 契约）
│   ├── schema.sql         # 统一建表脚本
│   ├── constants.js       # 通用常量与枚举
│   ├── questionnaire.js   # 复杂病例问卷占位题库
│   └── api-contract.md    # API 契约文档
├── backend/               # 店内本地应用（Node + Express + SQLite）
│   ├── src/
│   │   ├── index.js       # Express 入口
│   │   ├── db.js          # SQLite 连接与初始化
│   │   ├── lib/           # 响应、密码、outbox、重复检测
│   │   ├── routes/        # 业务路由（customers/points/cases/prescriptions/operators/admin）
│   │   └── sync/          # 同步模块（push/pull/ws/applyChange）
│   ├── scripts/init-db.js # 数据库初始化
│   └── public/            # 前端构建产物（npm run build:frontend 后生成）
├── frontend/              # React 前端（Vite + Ant Design）
│   ├── src/
│   │   ├── api/           # API 客户端
│   │   ├── components/    # 复用组件（积分表、验光单详情、病例详情、密码 Modal）
│   │   ├── pages/         # 页面（首页、客户、病例、验光单、后台管理）
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── vite.config.js     # dev 代理 + 构建产物输出到 ../backend/public
├── cloud/                 # 云端中转服务器
│   ├── src/
│   │   ├── index.js       # Express + WebSocket 入口
│   │   ├── db.js          # SQLite 连接
│   │   ├── lib/           # 鉴权、applyChange、wsHub
│   │   └── routes/        # 同步路由（health/push/pull/points-broadcast）
│   └── scripts/init-db.js
└── deploy/                # 部署脚本
    ├── cloud/install-cloud.sh           # 云端一键部署
    ├── store/install-store.sh           # 店内部署（Linux）
    ├── store/install-store-windows.bat  # 店内部署（Windows）
    └── README.md                        # 部署详细说明
```

## 开发模式

需要 Node.js 18+。

```bash
# 安装所有 workspace 依赖
npm install

# 初始化本地 + 云端数据库（首次）
npm run init-db
npm run init-cloud-db

# 开发：同时启动后端 + 前端（两个终端）
npm run dev:backend          # 后端 http://localhost:3000
npm run dev:frontend         # 前端 http://localhost:5173（已配 /api 代理到 3000）

# 单独启动云端（开发用）
cd cloud && CLOUD_PORT=8080 SYNC_SECRET=dev-secret npm start
```

开发模式下前端跑在 5173，所有 `/api/*` 请求代理到后端 3000，方便热重载调试。

## 生产部署

详见 [deploy/README.md](deploy/README.md)。简要步骤：

1. **云端**（Oracle 云 1核6G）：`sudo bash deploy/cloud/install-cloud.sh`，按提示输入域名、邮箱、SYNC_SECRET
2. **两店**（每台店内电脑）：`sudo bash deploy/store/install-store.sh` 或 Windows 双击 `install-store-windows.bat`，按提示输入 STORE_ID（store1/store2）、云端域名、SYNC_SECRET

部署完成后：
- 员工在浏览器访问 `http://localhost:3000` 使用
- 电脑可随时关机，开机后服务自启并补同步
- 云端通过 HTTPS 域名访问，证书自动续期

## 配置项

### 本地应用（backend/.env）
| 变量 | 说明 | 默认值 |
|---|---|---|
| `STORE_ID` | 店铺标识，store1 或 store2 | - |
| `PORT` | 本地监听端口 | 3000 |
| `DB_PATH` | SQLite 文件路径 | ./data/local.db |
| `DELETE_PASSWORD` | 删除记录密码 | safe@safe |
| `CLOUD_SERVER_URL` | 云端 HTTPS 域名 | - |
| `SYNC_SECRET` | 同步密钥（与云端一致） | - |
| `SYNC_ENABLED` | 是否启用同步 | true |
| `SYNC_INTERVAL_MS` | 同步轮询间隔 | 5000 |

### 云端（cloud/.env）
| 变量 | 说明 | 默认值 |
|---|---|---|
| `CLOUD_PORT` | 云端监听端口（HTTP，由 nginx 终结 HTTPS） | 8080 |
| `CLOUD_DB_PATH` | 云端 SQLite 路径 | ./data/cloud.db |
| `CLOUD_WS_PATH` | WebSocket 路径 | /ws |
| `SYNC_SECRET` | 同步密钥（与两店一致） | - |
| `CLOUD_CORS_ORIGIN` | CORS 允许来源 | * |

## 关键业务规则

- **客户去重**：以手机号为唯一键。先做会员登记或先做病例/验光单都行，只要手机号一致即视为同一人。
- **积分计算**：`floor(镜片价 + 镜架价)`，1元=1积分，向下取整。
- **积分流水**：只增不改的累加模式，避免并发冲突。当前积分 = 所有 amount 求和。
- **扣分原因**：仅"提现""兑换小礼品"两项，扩展需需求方确认。
- **重复登记检测**：新增积分时检查是否存在金额+正负号都相同的历史记录，存在则提示确认（不阻止）。
- **删除保护**：任何记录的删除操作必须输入密码 `safe@safe`，并记录删除日志（含执行门店、时间，永久保留）。
- **复杂病例问卷**：题目内容来自 `shared/questionnaire.js`，是占位框架，正式题目待需求方提供后替换即可（引擎通用，不需改代码）。
- **登记人名单**：当前为空，需求方后续提供；可在后台"登记人维护"页面增删改。

## 同步机制要点

- 本地始终以本地 SQLite 为准读写，不依赖网络
- outbox 队列：每次写入业务数据同时入队，后台异步推送云端
- 云端总账本：存储完整数据，两店可异步同步，互不依赖在线
- 积分优先级最高：新增积分立即推送 + WebSocket 广播，做到近乎实时
- 客户表 LWW 合并：同手机号不同 id 时取 `updated_at` 较新者
- 其他表按 UUID 并集合并（创建后基本不修改）

## 运维命令

### Linux
```bash
# 云端
sudo systemctl status optical-cloud
sudo journalctl -u optical-cloud -f
sudo systemctl restart optical-cloud

# 店内
sudo systemctl status optical-store-store1
sudo journalctl -u optical-store-store1 -f
```

### Windows
```cmd
nssm status OpticalStore-store1
nssm restart OpticalStore-store1
notepad C:\optical-store\backend\data\service.log
```

## 数据备份

- **本地数据库**：后台"数据导出"→ 选择"下载数据库文件"或"导出 Excel"
- **云端数据库**：定期 `cp /opt/optical-cloud/cloud/data/cloud.db /backup/cloud-$(date +%Y%m%d).db`
- **Excel 导出**：4 个 sheet（客户/积分明细/病例/验光单），JSON 字段（验光单各页、问卷作答）已展开为可读列

## 不在本次范围

- 拍照上传验光单/病历原件识别功能：本期不做，主体功能验收通过后再评估
- 用户登录鉴权：不需要，仅删除操作需要密码
