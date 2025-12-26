# 🚀 部署指南

## ⚠️ 重要提示：为什么不能部署到 Vercel？

**Vercel 是 serverless 平台，不支持 Socket.IO 的 WebSocket 长连接！**

- ❌ Vercel 的 serverless 函数是无状态的，不能维持长连接
- ❌ Socket.IO 需要持续运行的服务器来维护 WebSocket 连接
- ❌ 这个应用使用 Express + Socket.IO，需要传统的 Node.js 服务器环境

## ✅ 推荐的部署平台

以下是支持 Socket.IO 的平台（按推荐顺序）：

---

## 1️⃣ Render（最推荐）⭐

### 优点
- ✅ 完全免费（休眠后会自动唤醒）
- ✅ 支持 WebSocket
- ✅ 自动部署（连接 GitHub）
- ✅ 使用简单

### 部署步骤

1. **准备代码**
   ```bash
   # 确保代码已推送到 GitHub
   git add .
   git commit -m "准备部署到 Render"
   git push
   ```

2. **在 Render 创建服务**
   - 访问 https://render.com
   - 点击 "New +" → "Web Service"
   - 连接你的 GitHub 仓库

3. **配置设置**
   - **Name**: `mahjong-game` (或你喜欢的名称)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (512MB RAM)

4. **环境变量**（可选）
   - 如果设置了 `PORT`，确保 `server.js` 中已使用 `process.env.PORT`

5. **部署**
   - 点击 "Create Web Service"
   - 等待构建完成（约 2-5 分钟）
   - 获取你的 URL，例如：`https://mahjong-game.onrender.com`

6. **更新客户端连接**（如果需要）
   - 如果前端需要连接特定后端，修改 `public/client.js` 中的 Socket.IO 连接

---

## 2️⃣ Railway

### 优点
- ✅ 支持 WebSocket
- ✅ 部署简单
- ✅ 提供免费额度

### 部署步骤

1. 访问 https://railway.app
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的仓库
4. Railway 会自动检测 Node.js 项目
5. 确保启动命令是 `npm start`
6. 部署完成后获取 URL

---

## 3️⃣ Fly.io

### 优点
- ✅ 支持 WebSocket
- ✅ 全球部署
- ✅ 免费额度充足

### 部署步骤

1. **安装 Fly CLI**
   ```bash
   # Windows (PowerShell)
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. **登录**
   ```bash
   fly auth login
   ```

3. **初始化项目**
   ```bash
   fly launch
   ```
   - 选择应用名称
   - 选择区域
   - 不需要数据库（选择 No）

4. **确保 fly.toml 配置正确**
   ```toml
   [build]
     builder = "paketobuildpacks/builder:base"

   [http_service]
     internal_port = 3000
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0
     processes = ["app"]

     [[http_service.checks]]
       grace_period = "10s"
       interval = "30s"
       method = "GET"
       timeout = "5s"
       path = "/"
   ```

5. **部署**
   ```bash
   fly deploy
   ```

---

## 4️⃣ Heroku（需要信用卡验证）

### 部署步骤

1. 安装 Heroku CLI
2. 登录：`heroku login`
3. 创建应用：`heroku create your-app-name`
4. 部署：`git push heroku main`
5. 访问：`https://your-app-name.herokuapp.com`

---

## 📝 部署前检查清单

- [ ] 代码已推送到 GitHub
- [ ] `package.json` 中有正确的 `start` 脚本
- [ ] `server.js` 使用 `process.env.PORT || 3000`
- [ ] 没有硬编码的端口号
- [ ] 测试本地运行：`npm start`

---

## 🔧 如果必须使用 Vercel（不推荐）

如果你想使用 Vercel，需要**拆分架构**：

1. **前端部署到 Vercel**
   - 只部署 `public/` 目录中的文件
   - 作为静态网站

2. **后端部署到其他平台**
   - 后端部署到 Render/Railway/Fly.io
   - 获取后端 URL

3. **修改客户端连接**
   ```javascript
   // public/client.js
   const socket = io('https://your-backend-url.com');
   ```

4. **配置 CORS**
   ```javascript
   // server.js
   const io = socketIo(server, {
     cors: {
       origin: "https://your-vercel-app.vercel.app",
       methods: ["GET", "POST"]
     }
   });
   ```

**但这种方法更复杂，建议直接使用 Render 等平台！**

---

## 🎯 快速部署建议

**最简单的方法：使用 Render**

1. 推送到 GitHub
2. 在 Render 创建 Web Service
3. 连接 GitHub 仓库
4. 点击部署
5. 完成！✅

---

## ❓ 常见问题

### Q: 为什么部署后无法连接？
A: 检查：
- 平台是否支持 WebSocket（Vercel 不支持）
- 端口配置是否正确
- 防火墙设置

### Q: Render 免费版会休眠吗？
A: 是的，15 分钟无活动后会休眠。第一次访问需要几秒唤醒。可以考虑升级到付费版避免休眠。

### Q: 如何查看日志？
A: 在 Render/Railway/Fly.io 的仪表板中都有日志查看功能。

### Q: 可以自定义域名吗？
A: 大部分平台都支持绑定自定义域名，在平台设置中配置即可。

