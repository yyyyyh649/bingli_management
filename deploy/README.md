# 部署脚本

本目录包含云端与店内应用的部署脚本。

## 文件清单

```
deploy/
├── cloud/
│   └── install-cloud.sh        # 云端服务器一键部署（Linux + systemd + nginx + Let's Encrypt）
└── store/
    ├── install-store.sh        # 店内部署（Linux 版，systemd 自启）
    ├── install-store-windows.bat  # 店内部署（Windows 版，nssm 注册服务自启）
    └── exclude.txt             # rsync/xcopy 排除项
```

## 部署顺序

### 第一步：部署云端（在 Oracle 云服务器上）

```bash
# 把整个项目拷到云端服务器，然后执行
sudo bash deploy/cloud/install-cloud.sh
```

脚本会交互式询问：
- 云端域名（需提前在 ClouDNS 或其他 DNS 服务把域名 A 记录指向云端公网 IP）
- 管理员邮箱（用于 Let's Encrypt 证书申请）
- SYNC_SECRET（直接回车自动生成；请妥善保存）

完成后可访问 `https://<域名>/api/sync/health` 验证。

### 第二步：部署两店（在每台店内电脑上）

**Linux 店内电脑：**
```bash
sudo STORE_ID=store1 CLOUD_URL=https://cloud.example.com SYNC_SECRET=xxx \
  bash deploy/store/install-store.sh
```

**Windows 店内电脑：**
1. 右键 `deploy/store/install-store-windows.bat` → "以管理员身份运行"
2. 按提示输入 STORE_ID（store1 或 store2）、云端域名、SYNC_SECRET

部署完成后浏览器访问 `http://localhost:3000` 即可使用。

## 关键设计

- **固定端口 3000**：员工每天访问路径统一。
- **开机自启**：Linux 用 systemd（`optical-store-store1.service`），Windows 用 nssm 注册为系统服务（自动启动）。
- **离线可补同步**：电脑随时可关机，重启联网后服务自动启动并通过 outbox 补推未同步的变更。
- **HTTPS 由 nginx 终结**：云端 nginx 监听 443，反代到内部 8080 端口的 Node 服务；WebSocket 走 `/ws` 路径自动升级。
- **证书自动续期**：certbot 安装时会注册 systemd timer，无需人工干预。

## 常用运维命令

### 云端（Linux）
```bash
# 查看服务状态
sudo systemctl status optical-cloud

# 实时日志
sudo journalctl -u optical-cloud -f

# 重启服务
sudo systemctl restart optical-cloud

# 备份数据库
cp /opt/optical-cloud/cloud/data/cloud.db /backup/cloud-$(date +%Y%m%d).db
```

### 店内（Linux）
```bash
sudo systemctl status optical-store-store1
sudo journalctl -u optical-store-store1 -f
sudo systemctl restart optical-store-store1
```

### 店内（Windows）
```cmd
nssm status OpticalStore-store1
nssm restart OpticalStore-store1
notepad C:\optical-store\backend\data\service.log
```

## 重新部署 / 升级

直接重新运行对应的部署脚本即可。旧版本会自动备份为 `<安装目录>.bak`。

## 注意事项

- **SYNC_SECRET 必须三处一致**：云端、store1、store2 都要用同一个密钥。
- **域名解析**：部署云端前，需先把域名 A 记录指向云端公网 IP（ClouDNS 免费 DNS 即可）。
- **防火墙**：云端需放行 80（用于证书申请）和 443 端口；店内只需出站访问云端的 443，不需入站端口。
- **数据库备份**：建议定期备份云端 `cloud.db` 文件，作为最终数据兜底。
