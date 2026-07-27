#!/usr/bin/env bash
# ============================================================================
# 店内本地应用一键卸载脚本（Linux 版）
#
# 用途：停止并删除 systemd 服务 + 删除安装目录 /opt/optical-store
#
# 注意：本脚本只清理"本机"数据，云端同步数据需 SSH 上服务器手动删除
#       （云端 SQL：DELETE FROM cloud_change_log WHERE store = '<STORE_ID>';
#
# 使用方法（在店内电脑上以 root 或 sudo 执行）：
#   sudo STORE_ID=store1 bash deploy/store/uninstall-store.sh
#   或交互式：sudo bash deploy/store/uninstall-store.sh
# ============================================================================

set -euo pipefail

INSTALL_DIR="/opt/optical-store"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fatal() { echo -e "${RED}[FATAL]${NC} $*"; exit 1; }

[[ $EUID -eq 0 ]] || fatal "请用 root 或 sudo 执行此脚本"

STORE_ID="${STORE_ID:-}"
[[ -n "$STORE_ID" ]] || read -rp "请输入要卸载的 STORE_ID（例如 store1 / 朝阳店）: " STORE_ID
[[ -n "$STORE_ID" ]] || fatal "STORE_ID 必填"

SERVICE_NAME="optical-store-${STORE_ID}"
info "目标服务名：$SERVICE_NAME"

# 二次确认
read -rp "即将停止服务、删除服务、删除 $INSTALL_DIR 整个目录，确认？(y/N): " CONFIRM
[[ "$CONFIRM" =~ ^[yY]$ ]] || { info "已取消"; exit 0; }

# ---------- 1. 停止 + 删除 systemd 服务 ----------
if systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
  info "停止服务 $SERVICE_NAME ..."
  systemctl stop "$SERVICE_NAME" || warn "服务未运行或停止失败"
  info "禁用并删除服务 $SERVICE_NAME ..."
  systemctl disable "$SERVICE_NAME" || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  info "服务已删除"
else
  info "服务 $SERVICE_NAME 不存在，跳过"
fi

# ---------- 2. 删除安装目录 ----------
if [[ -d "$INSTALL_DIR" ]]; then
  info "删除目录 $INSTALL_DIR ..."
  rm -rf "$INSTALL_DIR"
  if [[ -d "$INSTALL_DIR" ]]; then
    warn "目录 $INSTALL_DIR 未删除干净，可能被占用，请手动删除"
  else
    info "目录已删除"
  fi
else
  info "目录 $INSTALL_DIR 不存在，跳过"
fi

# ---------- 3. 完成提示 ----------
echo
info "卸载完成"
echo
warn "本机已清理：systemd 服务 + $INSTALL_DIR 目录"
warn "云端同步数据未删除，如需清理请 SSH 上服务器执行："
echo "  sqlite3 /opt/optical-cloud/cloud/data/cloud.db \\"
echo "  \"DELETE FROM cloud_change_log WHERE store = '${STORE_ID}';\""
