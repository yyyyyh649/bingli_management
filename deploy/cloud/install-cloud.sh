#!/usr/bin/env bash
# ============================================================================
# 云端服务器一键部署脚本（Oracle 云 / 任何 Ubuntu/Debian Linux）
#
# 用途：在云端服务器上部署 cloud 包，作为两店同步的总账本 + 转发中心
#
# 使用方法（在云端服务器上以 root 或 sudo 用户执行）：
#   sudo bash deploy/cloud/install-cloud.sh
#
# 脚本会完成：
#   1. 安装 Node.js 20.x（若未装）
#   2. 创建运行用户 optical-cloud
#   3. 部署代码到 /opt/optical-cloud
#   4. 生成 .env 配置（提示输入 SYNC_SECRET 等）
#   5. 初始化数据库
#   6. 注册 systemd 服务 optical-cloud.service（开机自启）
#   7. 安装 nginx + certbot，配置 HTTPS 反代 + WebSocket 升级
#   8. 申请 Let's Encrypt 证书
#
# 部署完成后可通过 https://<你的域名>/api/sync/health 验证
# ============================================================================

set -euo pipefail

CLOUD_DOMAIN="${CLOUD_DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
INSTALL_DIR="/opt/optical-cloud"
RUN_USER="optical-cloud"

# ---------- 颜色输出 ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fatal() { echo -e "${RED}[FATAL]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || fatal "请用 root 或 sudo 执行此脚本"

# ---------- 1. 收集参数 ----------
read -rp "请输入云端域名（例如 cloud.example.com）: " CLOUD_DOMAIN
[[ -n "$CLOUD_DOMAIN" ]] || fatal "域名必填"

read -rp "请输入管理员邮箱（用于 Let's Encrypt 证书申请）: " ADMIN_EMAIL
[[ -n "$ADMIN_EMAIL" ]] || fatal "邮箱必填"

read -rp "请输入同步密钥 SYNC_SECRET（直接回车自动生成）: " SYNC_SECRET
SYNC_SECRET="${SYNC_SECRET:-$(openssl rand -hex 24)}"
info "已设置 SYNC_SECRET（请妥善保存，店内应用需配置相同值）: $SYNC_SECRET"

# ---------- 2. 安装 Node.js ----------
if ! command -v node &>/dev/null; then
  info "安装 Node.js 20.x ..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
NODE_VER=$(node -v)
info "Node.js 版本：$NODE_VER"

# ---------- 3. 创建运行用户 ----------
if ! id -u "$RUN_USER" &>/dev/null; then
  info "创建运行用户 $RUN_USER"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$RUN_USER"
fi

# ---------- 4. 部署代码 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# 确保 rsync 可用（Oracle Ubuntu 精简镜像默认未装）
if ! command -v rsync &>/dev/null; then
  info "安装 rsync"
  apt-get update -qq
  apt-get install -y rsync
fi

info "部署代码到 $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
# 若是首次部署，从当前脚本所在项目拷贝；若是更新，先备份
if [[ -f "$INSTALL_DIR/package.json" ]]; then
  info "已存在旧版本，备份到 $INSTALL_DIR.bak.$(date +%s)"
  mv "$INSTALL_DIR" "$INSTALL_DIR.bak.$(date +%s)"
fi
# 拷贝项目（排除 node_modules / data / .git）
rsync -a --exclude='node_modules' --exclude='data' --exclude='.git' \
  --exclude='backend/public' --exclude='deploy/cloud/certs' \
  "$PROJECT_ROOT/" "$INSTALL_DIR/"

cd "$INSTALL_DIR"
info "安装依赖（仅安装 cloud 必需）"
# 用 npm workspaces 安装，但只关心 cloud
npm install --omit=dev --workspace=cloud --workspace=shared
# 也安装 backend（构建前端需要）
npm install --omit=dev

# ---------- 5. 生成配置 ----------
info "生成 cloud/.env"
cat > "$INSTALL_DIR/cloud/.env" <<EOF
CLOUD_PORT=8080
CLOUD_DB_PATH=$INSTALL_DIR/cloud/data/cloud.db
CLOUD_WS_PATH=/ws
SYNC_SECRET=$SYNC_SECRET
CLOUD_CORS_ORIGIN=*
EOF

# ---------- 6. 初始化数据库 ----------
info "初始化云端数据库"
cd "$INSTALL_DIR/cloud"
mkdir -p data
node scripts/init-db.js

# ---------- 7. 构建前端并拷贝到 backend/public ----------
info "构建前端到 backend/public"
cd "$INSTALL_DIR"
npm run build:frontend

# ---------- 8. 权限 ----------
chown -R "$RUN_USER:$RUN_USER" "$INSTALL_DIR"

# ---------- 9. systemd 服务 ----------
info "注册 systemd 服务 optical-cloud.service"
cat > /etc/systemd/system/optical-cloud.service <<EOF
[Unit]
Description=Optical Shop Cloud Sync Server
After=network.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$INSTALL_DIR/cloud
EnvironmentFile=$INSTALL_DIR/cloud/.env
ExecStart=$(which node) src/index.js
Restart=on-failure
RestartSec=5s
# 日志输出到 journald
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable optical-cloud
systemctl restart optical-cloud
sleep 2
systemctl --no-pager --lines=10 status optical-cloud || warn "服务状态异常，请用 journalctl -u optical-cloud 查看日志"

# ---------- 10. nginx + Let's Encrypt ----------
info "安装 nginx + certbot"
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

info "配置 nginx 反代"
cat > /etc/nginx/sites-available/optical-cloud <<EOF
server {
    listen 80;
    server_name $CLOUD_DOMAIN;

    # 健康检查 + REST API
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket 升级
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;  # WS 长连接保活
    }

    # 其余路径返回 404（云端不托管前端）
    location / {
        return 404;
    }
}
EOF

ln -sf /etc/nginx/sites-available/optical-cloud /etc/nginx/sites-enabled/optical-cloud
# 移除默认站点避免冲突
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

info "申请 Let's Encrypt 证书"
certbot --nginx -d "$CLOUD_DOMAIN" --non-interactive --agree-tos -m "$ADMIN_EMAIL" --redirect

# ---------- 11. 完成 ----------
echo
info "========================================="
info "云端部署完成！"
info "========================================="
echo
echo "  域名:           https://$CLOUD_DOMAIN"
echo "  健康检查:       https://$CLOUD_DOMAIN/api/sync/health"
echo "  SYNC_SECRET:    $SYNC_SECRET"
echo "  数据库:         $INSTALL_DIR/cloud/data/cloud.db"
echo "  systemd 服务:   optical-cloud.service"
echo "  日志查看:       journalctl -u optical-cloud -f"
echo
warn "请妥善保存 SYNC_SECRET，店内应用部署时需要填入相同的值"
warn "证书自动续期已由 certbot 配置（systemd timer）"
echo
info "下一步：在两台店内电脑上运行 deploy/store/install-store.sh 完成店内部署"
