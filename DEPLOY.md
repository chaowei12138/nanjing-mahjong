# 部署指南（HTTPS）

本服务只有一个进程：`server.js` 同时承担 HTTP 静态文件和 WebSocket（同一端口、默认路径），并读取 `process.env.PORT`。这意味着所有「连 Git 仓库自动部署」的平台都能开箱即用，Nginx 反代也只需要加一段 WebSocket 升级头。

部署前自检清单：

```bash
node -v          # >= 16
npm install
npm test         # 23 项引擎测试应全部通过
```

如果还没有 Git 仓库：

```bash
cd nanjing-mahjong
git init
echo "node_modules/" > .gitignore
git add -A && git commit -m "nanjing mahjong"
# 在 GitHub 建一个空仓库后：
git remote add origin git@github.com:你的用户名/nanjing-mahjong.git
git push -u origin main
```

---

## 方案一：Railway（最快）

1. 打开 [railway.app](https://railway.app)，用 GitHub 账号登录
2. **New Project → Deploy from GitHub repo**，选中刚才推送的仓库
3. Railway 会自动识别 Node 项目：构建命令 `npm install`，启动命令 `npm start`，不用改
4. **端口不用配置**：Railway 注入 `PORT` 环境变量，`server.js` 已经在读它
5. 部署完成后进入服务 → **Settings → Networking → Generate Domain**，得到 `https://xxx.up.railway.app`
6. 用手机打开这个地址，验证：能进大厅 → 创建房间 → 另一台手机用邀请链接能入座

注意事项：

- Railway 免费额度按用量计费，一个纯 Node + ws 服务每月成本很低，但要绑卡才能开通
- Railway 的域名默认就是 https，WebSocket（wss）自动可用，零配置
- 想换自己的域名：Networking → Custom Domain，按提示加 CNAME

## 方案二：Render

1. 打开 [render.com](https://render.com)，登录后 **New → Web Service**
2. 连接 GitHub 仓库，配置如下：

| 项 | 值 |
|---|---|
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/` |

3. 实例类型选 **Starter（付费）**——这一点很重要：**Free 实例闲置 15 分钟会休眠**，休眠时正在打的牌局会直接断线、房间丢失。麻将是有状态服务（房间和牌局都在内存里），必须常驻
4. Render 自动签发 https 证书，WebSocket 直接可用
5. 部署完成后用分配的 `https://xxx.onrender.com` 验证

> 同理，Railway 若使用按量计费的服务，只要不手动停机就常驻；只有「免费实例 + 休眠」对牌局是致命的。

## 方案三：自己的服务器（腾讯云轻量 / 阿里云 ECS / 任何 VPS）

国内服务器访问最快，但**域名必须备案**；不想备案就用 Railway/Render，或买香港/海外节点。

### 0. 买服务器与域名

- **机型**：1 核 2G 足够（纯 Node 服务内存占用 < 100MB）。腾讯云轻量应用服务器或阿里云 ECS 最低配即可
- **系统镜像**：Ubuntu 22.04 LTS（本文命令以此为准）
- **域名**：在国内域名商（腾讯云/阿里云）购买；用国内服务器则必须 **ICP 备案**（在域名商控制台提交，个人备案约 1–2 周）。不想备案 → 买香港/新加坡节点，或直接用方案一/二
- **DNS 解析**：域名控制台加一条 A 记录，主机记录 `@` 或 `mahjong`，记录值填服务器公网 IP，TTL 默认
- **安全组/防火墙（云控制台侧）**：放行 22（SSH）、80、443

### 1. 登录服务器

```bash
ssh root@服务器公网IP
# 建议建一个普通用户跑服务，root 只做管理（可跳过）：
adduser mahjong && usermod -aG sudo mahjong
```

### 2. 装 Node 20、Nginx、pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y nodejs nginx git
sudo npm i -g pm2
node -v   # 应输出 v20.x
```

### 3. 上传代码并安装依赖

二选一：

```bash
# A. 用 git（推荐，以后更新方便）
sudo git clone git@github.com:你的用户名/nanjing-mahjong.git /opt/mahjong
# GitHub 私有仓库需要先在服务器上配 deploy key；公开仓库可直接 clone

# B. 本地直接传
# 本地执行：scp -r nanjing-mahjong root@服务器IP:/opt/mahjong
```

```bash
cd /opt/mahjong
sudo npm install --omit=dev
sudo npm test    # 23 项测试全过再往下走
```

### 4. pm2 常驻 + 开机自启

```bash
cd /opt/mahjong
pm2 start server.js --name mahjong --time
pm2 startup           # 执行后会输出一行 sudo env ... 命令，复制执行
pm2 save

pm2 logs mahjong      # 看到「南京麻将已启动：http://localhost:3000」
pm2 status            # online 状态
```

`--time` 会给每条日志加时间戳，排查问题时很有用。

### 5. Nginx 反向代理

新建 `/etc/nginx/sites-available/mahjong`：

```nginx
server {
    listen 80;
    server_name mahjong.example.com;   # ← 换成你的域名（或服务器 IP）

    # 静态文件直接由 Nginx 发，减轻 Node 负担（可选）
    location /css/ { root /opt/mahjong/public; }
    location /js/  { root /opt/mahjong/public; }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # —— WebSocket 升级头，缺了这 3 行联机进不了牌桌 ——
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 长时间牌局不断连（默认 60s 会把挂机的玩家踢下线）
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/mahjong /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # 移除默认站点，避免冲突
sudo nginx -t && sudo systemctl reload nginx
```

此时 `http://你的域名` 已经能打开大厅（先用 http 验证一遍，再上 https）。

### 6. 上 https（Let's Encrypt，免费自动续期）

前置条件：域名 A 记录已生效（`ping 你的域名` 返回服务器 IP），且 80 端口能被公网访问。

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d mahjong.example.com
# 按提示输入邮箱；同意条款；选「Redirect」(2) 强制 https
```

certbot 会自动改写 Nginx 配置加 443 和 http→https 跳转。证书 90 天有效，certbot 自带 systemd timer 自动续期，验证续期：

```bash
sudo certbot renew --dry-run
```

### 7. 系统防火墙

云控制台的安全组之外，系统内再收一层：

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
sudo ufw status
```

3000 端口**不要**对公网开放，只让 Nginx 在本机回环访问它。

### 8. 部署后验收

1. 微信内打开 `https://你的域名` —— 能进大厅
2. 创建房间 → 复制邀请链接发到微信群 → 第二部手机点链接入座
3. 两边各打出一张牌，确认牌河同步
4. 打一局到结算，点「验证发牌」确认两个哈希一致
5. 打牌中途把手机断网再重进链接，确认能拿回座位

### 9. 日常运维

| 操作 | 命令 |
|---|---|
| 看日志 | `pm2 logs mahjong` |
| 重启服务 | `pm2 restart mahjong` |
| 看资源占用 | `pm2 monit` |
| 更新代码 | `cd /opt/mahjong && sudo git pull && sudo npm install && pm2 restart mahjong` |
| Nginx 改配置后 | `sudo nginx -t && sudo systemctl reload nginx` |

注意：房间和牌局在**内存**里，`pm2 restart` 会清空所有房间，请在没人在打牌时操作。

### 10. 常见故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 浏览器打不开页面 | Nginx 没起 / 安全组没放 80 | `sudo systemctl status nginx`；云控制台检查安全组 |
| 大厅能开，建房后别人进不来 | WebSocket 升级头缺失 | 检查 `proxy_set_header Upgrade` 和 `Connection` 两行 |
| 打一会儿牌就掉线 | `proxy_read_timeout` 太短 | 改成 `3600s` 后 reload |
| `certbot` 报 DNS 解析失败 | A 记录未生效或域名填错 | `dig +short 你的域名` 核对 IP |
| 微信里打开提示不安全/被拦 | 证书无效或域名未备案 | `curl -vI https://域名` 看证书；国内服务器需完成备案 |
| `npm install` 卡住 | 国内访问 npm 慢 | `sudo npm config set registry https://registry.npmmirror.com` |

---

## 部署后验收

1. 手机浏览器（微信内也可）打开 `https://你的域名`
2. 昵称 → 创建房间 → 复制邀请链接 → 发到微信群
3. 另一部手机点链接入座 → 房主开始游戏 → 两边手牌同步
4. 打一局到结算，点「验证发牌」确认两个哈希一致
5. （可选）把一张牌打出后断开网络重进，确认能拿回座位

如果第 3 步卡在「等待其他玩家」，十有八九是 WebSocket 没通：Railway/Render 检查是否用了 https 域名而非预览地址；自建服务器检查 Nginx 的 Upgrade/Connection 两行和 `proxy_read_timeout`。

## 运维提示

- 房间和牌局数据都在**内存**里，进程重启即清空（牌局结束后才有结算记录在页面里）。升级代码前等大家打完这局
- 常驻方案下 `pm2 restart mahjong` / 平台 Redeploy 都会清房间，建议人少时段操作
- 有真实用户后可以加 `pm2 monit` 或平台监控看内存（纯 Node 服务占用很小，最低配实例绰绰有余）
