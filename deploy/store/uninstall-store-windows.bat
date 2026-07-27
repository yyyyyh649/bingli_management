@echo off
REM ============================================================================
REM 店内本地应用一键卸载脚本（Windows 版）
REM
REM 用途：停止并删除 Windows 服务 + 删除安装目录 C:\optical-store
REM
REM 注意：本脚本只清理"本机"数据，云端同步数据需 SSH 上服务器手动删除
REM       （云端 SQL：DELETE FROM cloud_change_log WHERE store = '<STORE_ID>';
REM
REM 使用方法：
REM   右键此文件 → 以管理员身份运行
REM ============================================================================

setlocal EnableDelayedExpansion
chcp 65001 >nul

echo.
echo ========================================
echo   眼镜店本地应用卸载（Windows）
echo ========================================
echo.

REM ---------- 检查管理员权限 ----------
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 需要以管理员身份运行此脚本
  echo 右键此文件 → "以管理员身份运行"
  pause
  exit /b 1
)

REM ---------- 收集 STORE_ID ----------
set /p STORE_ID="请输入要卸载的 STORE_ID（例如 store1 / 朝阳店）: "
if "!STORE_ID!"=="" (
  echo [错误] STORE_ID 必填
  pause
  exit /b 1
)

set SERVICE_NAME=OpticalStore-!STORE_ID!
echo [INFO] 目标服务名：!SERVICE_NAME!

REM ---------- 二次确认 ----------
set /p CONFIRM="即将停止服务、删除服务、删除 C:\optical-store 整个目录，确认？(y/N): "
if /i not "!CONFIRM!"=="y" (
  echo [INFO] 已取消
  pause
  exit /b 0
)

REM ---------- 1. 停止 + 删除 Windows 服务 ----------
echo [INFO] 停止服务 !SERVICE_NAME! ...
nssm stop !SERVICE_NAME! >nul 2>&1
if %errorlevel% neq 0 (
  sc stop !SERVICE_NAME! >nul 2>&1
)

echo [INFO] 删除服务 !SERVICE_NAME! ...
nssm remove !SERVICE_NAME! confirm >nul 2>&1
if %errorlevel% neq 0 (
  sc delete !SERVICE_NAME! >nul 2>&1
)

REM 验证服务是否已删除
sc query !SERVICE_NAME! >nul 2>&1
if %errorlevel% equ 0 (
  echo [警告] 服务 !SERVICE_NAME! 仍然存在，可能需要重启电脑才能彻底移除
) else (
  echo [INFO] 服务已删除
)

REM ---------- 2. 删除安装目录 ----------
set INSTALL_DIR=C:\optical-store
if exist "!INSTALL_DIR!" (
  echo [INFO] 删除目录 !INSTALL_DIR! ...
  rd /s /q "!INSTALL_DIR!"
  if exist "!INSTALL_DIR!" (
    echo [警告] 目录 !INSTALL_DIR! 未删除干净，可能被占用，请手动删除
  ) else (
    echo [INFO] 目录已删除
  )
) else (
  echo [INFO] 目录 !INSTALL_DIR! 不存在，跳过
)

REM ---------- 3. 完成提示 ----------
echo.
echo ========================================
echo   卸载完成
echo ========================================
echo.
echo [提示] 本机已清理：Windows 服务 + C:\optical-store 目录
echo [提示] 云端同步数据未删除，如需清理请 SSH 上服务器执行：
echo        sqlite3 /opt/optical-cloud/cloud/data/cloud.db ^
echo        "DELETE FROM cloud_change_log WHERE store = '!STORE_ID!';"
echo.
pause
