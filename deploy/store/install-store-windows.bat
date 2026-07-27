@echo off
REM ============================================================================
REM 店内本地应用部署脚本（Windows 版）
REM
REM 用途：在店内 Windows 电脑上部署 backend + 构建好的 frontend，注册为开机自启
REM
REM 使用方法：
REM   1. 以管理员身份右键"以管理员身份运行"此脚本
REM   2. 或在 PowerShell 中：Start-Process deploy\store\install-store-windows.bat -Verb RunAs
REM
REM 前置条件：需先安装 Node.js 20+（https://nodejs.org/）
REM ============================================================================

setlocal EnableDelayedExpansion
chcp 65001 >nul

echo.
echo ========================================
echo   眼镜店本地应用部署（Windows）
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

REM ---------- 检查 Node.js ----------
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 20+ LTS
  echo 下载地址：https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [INFO] Node.js 版本：!NODE_VER!

REM 抓取 node.exe 的实际绝对路径（Node 是全局安装的，不会在项目 backend 目录里）
REM where node 可能返回多行（如 node.exe + node.cmd），取第一个真实 .exe
set NODE_EXE=
for /f "delims=" %%p in ('where node') do (
  if "!NODE_EXE!"=="" set NODE_EXE=%%p
)
if "!NODE_EXE!"=="" (
  echo [错误] 无法获取 node.exe 的路径
  pause
  exit /b 1
)
echo [INFO] node.exe 路径：!NODE_EXE!

REM ---------- 收集参数 ----------
set /p STORE_ID="请输入店铺标识 STORE_ID（仅限英文字母和数字，例如 store1 / store2）: "
if "!STORE_ID!"=="" (
  echo [错误] STORE_ID 必填
  pause
  exit /b 1
)
REM 输入清洗：仅允许英文字母和数字（用 PowerShell 做正则校验，findstr 的 \+ 不可靠）
for /f "delims=" %%r in ('powershell -NoProfile -Command "if ('!STORE_ID!' -match '^[a-zA-Z0-9]+$') { 'ok' } else { 'fail' }"') do set "CHECK=%%r"
if not "!CHECK!"=="ok" (
  echo [错误] STORE_ID 只能包含英文字母和数字（不允许中文、空格、下划线、连字符等）
  pause
  exit /b 1
)

set /p CLOUD_URL="请输入云端域名（例如 https://cloud.example.com）: "
if "!CLOUD_URL!"=="" (
  echo [错误] 云端域名必填
  pause
  exit /b 1
)

set /p SYNC_SECRET="请输入 SYNC_SECRET（与云端一致）: "
if "!SYNC_SECRET!"=="" (
  echo [错误] SYNC_SECRET 必填
  pause
  exit /b 1
)

set PORT=3000
set /p PORT_INPUT="请输入本地端口（直接回车默认 3000）: "
if not "!PORT_INPUT!"=="" set PORT=!PORT_INPUT!

REM ---------- 部署目录 ----------
set INSTALL_DIR=C:\optical-store
echo [INFO] 部署目录：!INSTALL_DIR!

REM 拷贝项目文件
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..\

if exist "!INSTALL_DIR!" (
  echo [INFO] 已存在旧版本，备份到 !INSTALL_DIR!.bak
  move "!INSTALL_DIR!" "!INSTALL_DIR!.bak" >nul
)

echo [INFO] 拷贝项目文件...
xcopy "%PROJECT_ROOT%*" "!INSTALL_DIR!\" /E /I /Q /Y /EXCLUDE:%SCRIPT_DIR%exclude.txt >nul 2>&1
if %errorlevel% neq 0 (
  REM exclude.txt 不存在则直接全拷
  xcopy "%PROJECT_ROOT%*" "!INSTALL_DIR!\" /E /I /Q /Y >nul
)

cd /d "!INSTALL_DIR!"

echo [INFO] 安装依赖...
call npm install --omit=dev
if %errorlevel% neq 0 (
  echo [错误] 依赖安装失败
  pause
  exit /b 1
)

echo [INFO] 构建前端...
REM vite 在 devDependencies，构建前需单独装 frontend 的 dev 依赖
call npm install --workspace=frontend
call npm run build:frontend
if %errorlevel% neq 0 (
  echo [错误] 前端构建失败
  pause
  exit /b 1
)
REM 构建完清理 dev 依赖，减小体积
call npm prune --omit=dev

REM ---------- 生成配置 ----------
echo [INFO] 生成 backend\.env...
(
  echo STORE_ID=!STORE_ID!
  echo PORT=!PORT!
  echo DB_PATH=!INSTALL_DIR!\backend\data\local.db
  echo DELETE_PASSWORD=safe@safe
  echo.
  echo CLOUD_SERVER_URL=!CLOUD_URL!
  echo SYNC_INTERVAL_MS=5000
  echo SYNC_HEALTH_TIMEOUT_MS=3000
  echo SYNC_ENABLED=true
) > "!INSTALL_DIR!\backend\.env"

REM ---------- 初始化数据库 ----------
echo [INFO] 初始化数据库...
cd "!INSTALL_DIR!\backend"
if not exist data mkdir data
call node scripts\init-db.js

REM ---------- 注册为 Windows 服务（使用 nssm） ----------
set SERVICE_NAME=OpticalStore-!STORE_ID!
echo [INFO] 注册 Windows 服务：!SERVICE_NAME!

REM 检查 nssm
where nssm >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] 下载 nssm（用于注册 Windows 服务）...
  powershell -Command "Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '%TEMP%\nssm.zip'"
  powershell -Command "Expand-Archive -Path '%TEMP%\nssm.zip' -DestinationPath '%TEMP%\nssm' -Force"
  copy "%TEMP%\nssm\nssm-2.24\win64\nssm.exe" "C:\Windows\System32\nssm.exe" >nul
)

nssm stop !SERVICE_NAME! >nul 2>&1
nssm remove !SERVICE_NAME! confirm >nul 2>&1

nssm install !SERVICE_NAME! "!NODE_EXE!" "src\index.js"
nssm set !SERVICE_NAME! AppDirectory "!INSTALL_DIR!\backend"
nssm set !SERVICE_NAME! AppEnvironmentExtra "STORE_ID=!STORE_ID!" "PORT=!PORT!" "DB_PATH=!INSTALL_DIR!\backend\data\local.db" "DELETE_PASSWORD=safe@safe" "CLOUD_SERVER_URL=!CLOUD_URL!" "SYNC_SECRET=!SYNC_SECRET!" "SYNC_ENABLED=true" "SYNC_INTERVAL_MS=5000"
nssm set !SERVICE_NAME! Start SERVICE_AUTO_START
nssm set !SERVICE_NAME! Description "眼镜店登记管理系统 - !STORE_ID!"
nssm set !SERVICE_NAME! AppStdout "!INSTALL_DIR!\backend\data\service.log"
nssm set !SERVICE_NAME! AppStderr "!INSTALL_DIR!\backend\data\service.log"
nssm set !SERVICE_NAME! AppRotateFiles 1
nssm set !SERVICE_NAME! AppRotateBytes 10485760

nssm start !SERVICE_NAME!

REM ---------- 等待启动并验证 ----------
echo [INFO] 等待服务启动...
timeout /t 3 /nobreak >nul

echo [INFO] 验证服务...
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:!PORT!/api/health' -UseBasicParsing -TimeoutSec 5; $r.Content } catch { Write-Host '[警告] 服务可能未完全启动，请稍后访问 http://localhost:!PORT!' }"

echo.
echo ========================================
echo   部署完成！(!STORE_ID!)
echo ========================================
echo.
echo   访问地址:     http://localhost:!PORT!
echo   云端地址:     !CLOUD_URL!
echo   STORE_ID:     !STORE_ID!
echo   数据库:       !INSTALL_DIR!\backend\data\local.db
echo   Windows 服务: !SERVICE_NAME!
echo   日志文件:     !INSTALL_DIR!\backend\data\service.log
echo.
echo [提示] 员工只需在浏览器打开 http://localhost:!PORT! 即可使用
echo [提示] 电脑可随时关机，开机后服务自动启动并补同步
echo.
echo 常用运维命令（管理员 CMD）：
echo   启动:   nssm start !SERVICE_NAME!
echo   停止:   nssm stop !SERVICE_NAME!
echo   重启:   nssm restart !SERVICE_NAME!
echo   查看日志: notepad "!INSTALL_DIR!\backend\data\service.log"
echo.
pause
