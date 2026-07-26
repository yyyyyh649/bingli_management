# 眼镜店验光单/病例登记系统

本地运行的眼镜店登记管理系统，覆盖：会员登记与积分查询、病例登记、验光单登记。

详细需求见交付实施方案。本期交付 **第一阶段：本地单店闭环**，已在数据模型上预留 `sync_status` 字段与 outbox 概念，第二阶段接入云端同步时无需改表。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 复制环境配置，按需修改 STORE_ID
cp .env.example .env

# 3. 初始化数据库（首次运行）
npm run init-db

# 4. 启动服务
npm start
```

浏览器访问 `http://localhost:3000`。

## 配置说明

- `STORE_ID`：本店标识，`store1` 或 `store2`，两店分别配置。
- `PORT`：本地服务端口，默认 3000。
- `DB_PATH`：SQLite 数据库文件路径，默认 `./data/local.db`。
- `DELETE_PASSWORD`：删除记录所需密码，默认 `safe@safe`。

## 目录结构

```
.
├── server/                # 后端 Express 服务
│   ├── index.js           # 入口
│   ├── db.js              # SQLite 初始化与连接
│   ├── schema.sql         # 建表 SQL
│   ├── lib/               # 公共工具
│   └── routes/            # 路由模块
├── public/                # 前端静态资源（纯 HTML/JS）
│   ├── *.html
│   └── assets/
└── data/                  # SQLite 数据文件（运行时生成）
```
