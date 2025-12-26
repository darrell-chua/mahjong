# 🚀 快速启动指南

## 一键启动（3步即玩）

### 1️⃣ 安装依赖
```bash
npm install
```
⏱️ 预计时间：30秒 - 1分钟

### 2️⃣ 启动服务器
```bash
npm start
```
✅ 看到以下信息表示成功：
```
🀄 马来西亚麻将服务器启动成功！
🌐 访问地址: http://localhost:3000
📱 准备接受玩家连接...
```

### 3️⃣ 开始游戏
在浏览器打开：`http://localhost:3000`

---

## 🎮 快速测试（单机4人）

### 方法一：多窗口测试
1. 打开 4 个浏览器窗口（Chrome、Firefox、Edge、Safari）
2. 窗口1：创建房间，记住房间号
3. 窗口2-4：使用房间号加入
4. 窗口1 点击"开始游戏"

### 方法二：无痕模式
1. 普通模式打开 1 个窗口
2. 无痕模式打开 3 个窗口
3. 按上述流程测试

---

## 📱 多设备联机测试

### 同一局域网
1. 查看电脑IP地址：
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig
   ```
2. 找到类似 `192.168.x.x` 的地址
3. 其他设备访问：`http://192.168.x.x:3000`

### 外网访问
需要部署到云服务器，参考 README.md 的部署章节

---

## ⚠️ 常见问题

### 问题1：端口被占用
```
Error: listen EADDRINUSE: address already in use :::3000
```
**解决**：
```bash
# 方法1：更改端口
PORT=3001 npm start

# 方法2：杀死占用进程
# Windows
netstat -ano | findstr :3000
taskkill /PID <进程号> /F

# Mac/Linux
lsof -i :3000
kill -9 <进程号>
```

### 问题2：npm install 失败
**解决**：
```bash
# 清除缓存
npm cache clean --force

# 使用淘宝镜像
npm install --registry=https://registry.npmmirror.com

# 或全局设置
npm config set registry https://registry.npmmirror.com
```

### 问题3：无法连接 Socket.IO
- 检查防火墙是否开放 3000 端口
- 确保服务器正在运行
- 检查浏览器控制台错误信息

---

## 🎯 游戏操作速查

| 操作 | 说明 |
|------|------|
| **创建房间** | 输入昵称 → 点击创建 → 分享房间号 |
| **加入房间** | 输入昵称和房间号 → 点击加入 |
| **开始游戏** | 4人齐全后，房主点击开始 |
| **摸牌** | 轮到你时点击"摸牌"按钮 |
| **出牌** | 摸牌后点击要打出的牌 |
| **吃碰杠** | 别人出牌后，弹出按钮选择操作 |
| **胡牌** | 能胡时点击"胡"按钮 |

---

## 📊 Socket 事件流程图

```
创建/加入房间
    ↓
等待玩家
    ↓
开始游戏 (发牌)
    ↓
玩家1 摸牌
    ↓
玩家1 出牌 ←─────┐
    ↓            │
其他玩家判断     │
吃/碰/杠/胡/过  │
    ↓            │
下一位玩家摸牌 ──┘
    ↓
某人胡牌 → 游戏结束
或牌堆空 → 流局
```

---

## 🔧 开发提示

### 热重载开发
```bash
npm run dev  # 使用 nodemon，修改代码自动重启
```

### 调试技巧
1. 打开浏览器开发者工具（F12）
2. 查看 Console 标签的日志
3. 查看 Network 标签的 WebSocket 连接

### 修改端口
编辑 `server.js` 最后几行：
```javascript
const PORT = process.env.PORT || 3000; // 改为你想要的端口
```

---

## 🎨 自定义配置

### 修改游戏规则
编辑 `server.js` 中的以下部分：
- `startGame()` - 修改初始手牌数
- `calculateFan()` - 修改番型和分数
- `checkWin()` - 修改胡牌判定

### 修改界面样式
编辑 `public/style.css`：
- `:root` - 修改颜色主题
- `.tile` - 修改麻将牌样式
- `.game-board` - 修改布局

---

## 📞 需要帮助？

1. 查看完整的 `README.md`
2. 检查浏览器控制台错误
3. 查看服务器终端日志
4. 提交 GitHub Issue

---

**现在就开始你的麻将之旅吧！🀄✨**