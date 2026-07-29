#!/usr/bin/env bash
# ============================================================================
# 店内本地应用一键部署脚本（Linux 版，例如 Ubuntu 桌面/Ubuntu Server）
#
# 用途：在店内电脑上部署 backend + 构建好的 frontend，注册为开机自启服务
#
# 使用方法（在店内电脑上以 root 或 sudo 执行）：
#   sudo STORE_ID=store1 bash deploy/store/install-store.sh
#
# 环境变量：
#   STORE_ID       必填，仅限英文字母和数字（例如 store1 / store2）
#   CLOUD_URL      必填，云端域名（例如 https://cloud.example.com）
#   SYNC_SECRET    必填，与云端一致的同步密钥
#   PORT           可选，本地端口（默认 3000）
# ============================================================================

set -euo pipefail

INSTALL_DIR="/opt/optical-store"
RUN_USER="optical-store"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fatal() { echo -e "${RED}[FATAL]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || fatal "请用 root 或 sudo 执行此脚本"

STORE_ID="${STORE_ID:-}"
CLOUD_URL="${CLOUD_URL:-}"
SYNC_SECRET="${SYNC_SECRET:-}"
PORT="${PORT:-3000}"
# 按 IMPLEMENTATION.md 红线规则1：删除/修改密码由部署方自定义，脚本不硬编码默认值
DELETE_PASSWORD="${DELETE_PASSWORD:-}"

# ---------- 1. 收集参数 ----------
[[ -n "$STORE_ID" ]] || read -rp "请输入 STORE_ID（仅限英文字母和数字，例如 store1 / store2）: " STORE_ID
[[ -n "$STORE_ID" ]] || fatal "STORE_ID 必填"
# 仅允许英文字母和数字
[[ "$STORE_ID" =~ ^[a-zA-Z0-9]+$ ]] || fatal "STORE_ID 只能包含英文字母和数字"

[[ -n "$CLOUD_URL" ]] || read -rp "请输入云端域名（例如 https://cloud.example.com）: " CLOUD_URL
[[ -n "$CLOUD_URL" ]] || fatal "云端域名必填"

[[ -n "$SYNC_SECRET" ]] || read -rp "请输入 SYNC_SECRET（与云端一致）: " SYNC_SECRET
[[ -n "$SYNC_SECRET" ]] || fatal "SYNC_SECRET 必填"

# 删除/修改密码：部署方自定义，留空则随机生成一个并回显（系统永不显示默认密码）
if [[ -z "$DELETE_PASSWORD" ]]; then
  DELETE_PASSWORD="$(head -c 12 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 12)"
  warn "未设置 DELETE_PASSWORD，已随机生成：$DELETE_PASSWORD（请妥善保存，系统不会再次显示）"
fi

[[ "$CLOUD_URL" == https://* ]] || warn "建议使用 HTTPS 域名访问云端，避免密钥明文传输"

# ---------- 2. 安装 Node.js ----------
if ! command -v node &>/dev/null; then
  info "安装 Node.js 20.x ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
info "Node.js 版本：$(node -v)"

# ---------- 3. 创建运行用户 ----------
if ! id -u "$RUN_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$RUN_USER"
fi

# ---------- 4. 部署代码 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

info "部署代码到 $INSTALL_DIR"
if [[ -f "$INSTALL_DIR/package.json" ]]; then
  info "已存在旧版本，备份到 $INSTALL_DIR.bak.$(date +%s)"
  mv "$INSTALL_DIR" "$INSTALL_DIR.bak.$(date +%s)"
fi
rsync -a --exclude='node_modules' --exclude='data' --exclude='.git' \
  --exclude='backend/public' --exclude='deploy/cloud/certs' \
  "$PROJECT_ROOT/" "$INSTALL_DIR/"

cd "$INSTALL_DIR"
info "安装依赖"
npm install --omit=dev

info "构建前端到 backend/public"
# vite 在 devDependencies，构建前需单独装 frontend 的 dev 依赖
npm install --workspace=frontend
npm run build:frontend
# 构建完清理 dev 依赖，减小体积
npm prune --omit=dev

# ---------- 5. 生成配置 ----------
info "生成 backend/.env"
cat > "$INSTALL_DIR/backend/.env" <<EOF
STORE_ID=$STORE_ID
PORT=$PORT
DB_PATH=$INSTALL_DIR/backend/data/local.db
DELETE_PASSWORD=$DELETE_PASSWORD

CLOUD_SERVER_URL=$CLOUD_URL
SYNC_INTERVAL_MS=5000
SYNC_HEALTH_TIMEOUT_MS=3000
SYNC_ENABLED=true
EOF

# ---------- 6. 初始化数据库 ----------
info "初始化本地数据库"
cd "$INSTALL_DIR/backend"
mkdir -p data
node scripts/init-db.js

# ---------- 7. 权限 ----------
chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"

# ---------- 8. systemd 服务 ----------
SERVICE_NAME="optical-store-${STORE_ID}"
info "注册 systemd 服务 $SERVICE_NAME"
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Optical Shop Local App ($STORE_ID)
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$INSTALL_DIR/backend
EnvironmentFile=$INSTALL_DIR/backend/.env
ExecStart=$(which node) src/index.js
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}
sleep 2
systemctl --no-pager --lines=10 status ${SERVICE_NAME} || warn "服务状态异常，请用 journalctl -u $SERVICE_NAME 查看"

# ---------- 9. 完成 ----------
echo
info "========================================="
info "店内应用部署完成！($STORE_ID)"
info "========================================="
echo
echo "  访问地址:     http://localhost:$PORT"
echo "  云端地址:     $CLOUD_URL"
echo "  STORE_ID:     $STORE_ID"
echo "  数据库:       $INSTALL_DIR/backend/data/local.db"
echo "  systemd 服务: $SERVICE_NAME"
echo "  日志查看:     journalctl -u $SERVICE_NAME -f"
echo
warn "员工只需在浏览器打开 http://localhost:$PORT 即可使用"
warn "电脑可随时关机，重新开机联网后服务自动启动并补同步"
echo
info "常用运维命令："
echo "  启动:   sudo systemctl start $SERVICE_NAME"
echo "  停止:   sudo systemctl stop $SERVICE_NAME"
echo "  重启:   sudo systemctl restart $SERVICE_NAME"
echo "  看日志: sudo journalctl -u $SERVICE_NAME -f"
