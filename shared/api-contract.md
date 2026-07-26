# API 契约（backend + cloud 共用）

所有响应统一 JSON 信封：
```json
{ "ok": true, "data": <...> }
```
错误：
```json
{ "ok": false, "error": "<message>", "code": "<optional>" }
```

## 业务接口（本地 backend 提供，前端调用）

### 通用
- `GET  /api/health`                            → 健康检查，返回 `{ store, sync: {enabled, lastPullAt, pendingCount} }`
- `GET  /api/operators`                         → 当前店 + 公共 operators 列表
- `POST /api/operators`                         → 新增 operator {name, sortOrder?}
- `PUT  /api/operators/:id`                     → 修改 operator {name, sortOrder?}
- `DELETE /api/operators/:id`                   → 删除（需 body: {password}）

### 客户/会员
- `GET  /api/customers/search?q=<keyword>`      → 按 手机号后4位/完整手机号/姓名/会员卡号 模糊查询
- `GET  /api/customers/by-phone/:phone`         → 精确查询单个客户
- `POST /api/customers`                         → 新建/合并 {phone, name, memberCardNo?, address?}，返回客户对象
- `PUT  /api/customers/:id`                     → 修改 {name?, memberCardNo?, address?}
- `DELETE /api/customers/:id`                   → 删除（body: {password}）

### 客户积分页面
- `GET  /api/customers/:phone/profile`          → 聚合返回：个人信息 + 当前积分 + 全部 points_ledger + 全部 cases + 全部 prescriptions

### 积分明细
- `GET  /api/points?customerPhone=<phone>`      → 该客户积分明细列表
- `POST /api/points`                            → 新增积分 {customerPhone, amount, sourceType, note?, relatedPrescriptionId?}
                                                   - 扣分时 sourceType 必须为 withdraw/gift_redeem
                                                   - 触发"重复登记"检测：返回 `{ok:true, data:{...}}` 或 `{ok:false, code:'DUPLICATE_CONFIRM_REQUIRED', data:{existingRecord}}`
                                                   - 前端二次确认时带 `confirmDuplicate:true` 重新提交
- `DELETE /api/points/:id`                      → 删除（body: {password}）

### 病例
- `POST /api/cases`                             → 新增 {mode, customerName?, customerPhone?, customerGender?, customerAddress?, condition?, answers?, recordDate?, operator}
- `GET  /api/cases/:id`                         → 详情
- `DELETE /api/cases/:id`                       → 删除（body: {password}）

### 验光单
- `POST /api/prescriptions`                     → 新增验光单（完整结构，见 shared/constants）
                                                   - 后端自动计算 points = floor(lens_price + frame_price)
                                                   - 若 points_target_phone 非空且 points > 0，自动写一条 points_ledger
                                                   - 同样触发积分重复登记检测，二次确认通过 `confirmDuplicate:true`
- `GET  /api/prescriptions/:id`                 → 详情
- `DELETE /api/prescriptions/:id`               → 删除（body: {password}）

### 后台
- `GET  /api/admin/delete-logs`                 → 删除日志列表
- `GET  /api/admin/export?type=db`              → 下载 SQLite 文件（Content-Type: application/octet-stream）
- `GET  /api/admin/export?type=excel`           → 下载 Excel xlsx（多 sheet，JSON 字段展开）

---

## 同步接口（cloud 提供，backend 调用）

所有同步接口需 Header: `X-Sync-Secret: <SYNC_SECRET>`

- `GET  /api/sync/health`                       → 健康检查
- `POST /api/sync/push`                         → 批量推送变更
   body: `{ store, changes: [{ tableName, recordId, operation, payload }] }`
   resp: `{ accepted: N, changeLogIds: [...] }`（同时写入 cloud 业务表 + cloud_change_log）
- `GET  /api/sync/pull?since=<seq>&limit=<n>`   → 增量拉取 change_log
   resp: `{ changes: [...], nextSeq: <最新 id>, hasMore: bool }`
   - 默认排除调用方自己的变更（通过 `X-Sync-Store` header 识别）
- `POST /api/sync/points-broadcast`             → 积分变更即时广播
   body: `{ store, change: {...} }`
   云端通过 WebSocket 推送给其他在线店铺

### WebSocket
- 路径：`/ws?store=<store_id>&secret=<SYNC_SECRET>`
- 云端 → 店铺的事件：
   `{ type: 'points_update', data: <points_ledger 记录> }`
   `{ type: 'change_notify', data: { tableName, recordId } }`（通知有新变更可拉取）
