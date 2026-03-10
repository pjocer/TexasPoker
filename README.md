# Texas Poker - 德州扑克

支持单机与联网多人对战的德州扑克游戏。

## 快速开始

### 环境要求

- Node.js >= 16

### 安装与启动

```bash
git clone <repo-url>
cd TexasPoker
npm install
node server.js
```

服务启动后访问 `http://localhost:3000`。

---

## 多人联网对战

### 本地测试（同一台机器）

1. 启动服务器：

```bash
npm install
node server.js
```

2. 在浏览器中打开 `http://localhost:3000`
3. 选择 **联网模式** -> 输入名字 -> **创建房间**
4. 记下 4 位房间号
5. 打开新的浏览器标签页，同样访问 `http://localhost:3000`
6. 选择 **联网模式** -> 输入名字 -> 输入房间号 -> **加入房间**
7. 房主点击 **开始游戏**

可以开多个标签页模拟多人。不够人数的座位会由 AI 自动填补。

### 局域网内其他设备访问

如果朋友和你在同一个 Wi-Fi/局域网下：

1. 查看本机 IP：

```bash
# macOS
ifconfig | grep "inet " | grep -v 127.0.0.1

# Linux
hostname -I

# Windows
ipconfig
```

2. 启动服务器后，让朋友在浏览器访问 `http://<你的局域网IP>:3000`

### 公网访问（朋友在不同网络）

推荐使用 **Cloudflare Tunnel**，免费、无需云服务器、无需公网 IP。

#### 方式一：Cloudflare Tunnel（推荐）

```bash
# 安装 cloudflared
# macOS
brew install cloudflared
# Linux
# 参考 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# 启动 Node 服务
node server.js

# 另开一个终端，启动隧道
cloudflared tunnel --url http://localhost:3000
```

终端会输出一个公网地址，类似 `https://xxx-yyy-zzz.trycloudflare.com`，把这个地址发给朋友即可。

特点：
- 免费，无需注册（临时隧道）
- 自动 HTTPS，支持 WebSocket
- 每次启动地址会变；需要固定地址可注册 Cloudflare 账号绑定域名

#### 方式二：ngrok

```bash
brew install ngrok
# 需要注册免费账号获取 token: https://dashboard.ngrok.com
ngrok config add-authtoken <your-token>
ngrok http 3000
```

---

## 朋友在另一台机器上部署

如果朋友想在自己的机器上跑一个独立的游戏服务器：

### 步骤

1. **安装 Node.js**

   前往 https://nodejs.org 下载安装 LTS 版本（>= 16）。

2. **获取代码**

```bash
git clone <repo-url>
cd TexasPoker
```

或者直接把项目文件夹拷贝/压缩发给朋友。

3. **安装依赖并启动**

```bash
npm install
node server.js
```

4. **访问游戏**

   浏览器打开 `http://localhost:3000`。

5. **让其他人访问**

   参考上方「局域网内其他设备访问」或「公网访问」章节。

---

## 游戏功能

- 标准德州扑克（52 张）和短牌德州（36 张，6-A）
- 2-6 人桌，支持单机 AI 和联网真人
- 房间系统：创建/加入房间，4 位房间号
- 真人不够时 AI 自动补位
- 手牌隐私：服务端只给每个玩家发送自己的手牌数据
- 操作验证：服务端校验轮次和操作合法性
- 断线处理：玩家断线后由 AI 接管
- 30 秒操作倒计时
- 键盘快捷键：F 弃牌、C 过牌/跟注、空格/回车 下一手

## 技术栈

- 前端：原生 HTML/CSS/JS
- 后端：Node.js + Express（静态文件）+ ws（WebSocket）
- 通信：WebSocket JSON 协议
