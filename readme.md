# 🀄 马来西亚麻将 - 在线联机游戏

一个基于 Web 的四人联机麻将游戏，支持实时对战、完整的游戏规则和番型系统。

## ✨ 功能特色

### 🎮 核心功能
- ✅ **4人实时对战** - 支持房间创建和加入
- ✅ **完整麻将规则** - 吃、碰、杠、胡
- ✅ **番型系统** - 平胡、碰碰胡、清一色、混一色、自摸
- ✅ **自动洗牌发牌** - 每人13张起手牌
- ✅ **回合制系统** - 轮流摸牌出牌
- ✅ **实时同步** - Socket.IO 实现即时通信
- ✅ **流局判定** - 牌堆用完自动流局

### 🎨 界面设计
- 🌑 **深色主题** - 黑金配色，优雅专业
- 📱 **响应式布局** - 支持桌面和移动设备
- ✨ **动画效果** - 发牌、出牌、胡牌闪烁
- 🎯 **直观操作** - 点击出牌，按钮提示操作

## 🚀 快速开始

### 环境要求
- Node.js 14.0 或更高版本
- npm 或 yarn 包管理器

### 安装步骤

1. **克隆或下载项目**
```bash
cd mahjong-game
```

2. **安装依赖**
```bash
npm install
```

3. **启动服务器**
```bash
npm start
```

4. **访问游戏**
打开浏览器访问：`http://localhost:3000`

### 🎲 开始游戏

#### 方式一：创建房间
1. 输入你的昵称
2. 点击"创建房间"
3. 分享房间号给朋友
4. 等待4名玩家加入
5. 房主点击"开始游戏"

#### 方式二：加入房间
1. 输入你的昵称
2. 输入朋友分享的房间号
3. 点击"加入房间"
4. 等待房主开始游戏

### 🎯 游戏玩法

#### 基本流程
1. **发牌** - 每人13张手牌
2. **摸牌** - 轮到你时点击"摸牌"按钮
3. **出牌** - 点击要打出的牌
4. **操作** - 其他玩家打牌后，可以选择吃、碰、杠、胡或过
5. **胡牌** - 达成胡牌条件时点击"胡"按钮
6. **结算** - 显示番型和番数

#### 操作说明
- **吃** - 组成顺子（只能吃上家的牌）
- **碰** - 组成刻子（三张相同）
- **杠** - 组成杠子（四张相同）
- **胡** - 达成胡牌条件
- **过** - 放弃本次操作

#### 番型说明
- **平胡** - 基础胡牌（1番）
- **自摸** - 自己摸牌胡牌（+1番）
- **碰碰胡** - 全部为刻子（+2番）
- **混一色** - 单一花色+字牌（+3番）
- **清一色** - 单一花色（+5番）

## 📁 项目结构

```
mahjong-game/
├── server.js              # Node.js 后端服务器
├── package.json           # 项目配置
├── public/                # 前端文件
│   ├── index.html        # 游戏主页面
│   ├── style.css         # 样式文件
│   └── client.js         # 前端逻辑
└── README.md             # 说明文档
```

## 🔌 Socket.IO 事件说明

### 客户端发送事件

| 事件 | 参数 | 说明 |
|------|------|------|
| `create_room` | `{ roomId, playerName }` | 创建房间 |
| `join_room` | `{ roomId, playerName }` | 加入房间 |
| `start_game` | `{ roomId }` | 开始游戏 |
| `draw_tile` | `{ roomId }` | 摸牌 |
| `play_tile` | `{ roomId, tile }` | 出牌 |
| `claim_pong` | `{ roomId }` | 碰牌 |
| `claim_chow` | `{ roomId, combination }` | 吃牌 |
| `claim_kong` | `{ roomId }` | 杠牌 |
| `declare_win` | `{ roomId, isSelfDraw }` | 胡牌 |
| `pass` | `{ roomId }` | 过 |

### 服务器发送事件

| 事件 | 说明 |
|------|------|
| `room_created` | 房间创建成功 |
| `player_joined` | 玩家加入房间 |
| `player_left` | 玩家离开房间 |
| `game_started` | 游戏开始 |
| `tile_drawn` | 摸牌成功 |
| `tile_played` | 出牌广播 |
| `can_claim` | 可以吃碰杠胡提示 |
| `next_turn` | 下一回合 |
| `pong_claimed` | 碰牌成功 |
| `chow_claimed` | 吃牌成功 |
| `kong_claimed` | 杠牌成功 |
| `update_hand` | 更新手牌 |
| `game_state` | 游戏状态更新 |
| `game_over` | 游戏结束 |
| `error` | 错误消息 |

## 🌐 线上部署

### 部署到 Render

1. 注册 [Render](https://render.com) 账号
2. 创建新的 Web Service
3. 连接 GitHub 仓库
4. 设置构建命令：`npm install`
5. 设置启动命令：`node server.js`
6. 点击部署

### 部署到 Railway

1. 注册 [Railway](https://railway.app) 账号
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. Railway 会自动识别 Node.js 项目并部署

### 部署到 Vercel

由于 Vercel 主要用于静态网站，需要使用 Serverless Functions：
1. 将 `server.js` 改为支持 Serverless
2. 配置 `vercel.json`
3. 使用 Vercel CLI 部署：`vercel --prod`

### 自建 VPS

```bash
# 安装 Node.js 和 npm
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 克隆项目
git clone <your-repo-url>
cd mahjong-game

# 安装依赖
npm install

# 使用 PM2 运行（保持后台运行）
sudo npm install -g pm2
pm2 start server.js --name mahjong
pm2 save
pm2 startup
```

## 🔧 开发说明

### 开发模式
```bash
npm run dev  # 使用 nodemon 自动重启
```

### 技术栈
- **后端**: Node.js + Express + Socket.IO
- **前端**: HTML5 + CSS3 + 原生 JavaScript
- **通信**: WebSocket (Socket.IO)
- **实时**: 事件驱动架构

### 核心算法
- **洗牌算法** - Fisher-Yates 洗牌
- **胡牌判断** - 递归回溯算法
- **番型计算** - 规则匹配系统

## 📝 测试说明

### 本地多人测试
1. 启动服务器：`npm start`
2. 打开4个浏览器窗口（或使用无痕模式）
3. 第一个窗口创建房间
4. 其他窗口使用房间号加入
5. 开始游戏测试

### 网络测试
1. 部署到线上服务器
2. 分享链接给朋友
3. 4人同时加入测试

## 🚧 未来扩展方向

- [ ] **AI 机器人** - 单人模式对战电脑
- [ ] **排行榜系统** - 记录玩家胜率和积分
- [ ] **观战模式** - 允许观众观看游戏
- [ ] **聊天功能** - 房间内文字聊天
- [ ] **更多番型** - 七对子、十三幺等
- [ ] **房间设置** - 自定义规则和计分方式
- [ ] **回放功能** - 保存和回看游戏录像
- [ ] **好友系统** - 添加好友、私密房间
- [ ] **语音聊天** - WebRTC 语音通话
- [ ] **动画优化** - 更流畅的牌动画

## 🐛 已知问题

- 吃牌时需要选择具体组合（当前使用第一个可用组合）
- 断线重连功能待完善
- 移动端操作体验可以进一步优化

## 📄 许可证

MIT License - 自由使用和修改

## 👥 贡献

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件反馈

---

## 🎮 游戏截图说明

### 登录界面
- 深色主题，金色点缀
- 昵称输入框
- 创建/加入房间按钮
- 游戏规则说明

### 等待界面
- 显示房间号（大字体金色）
- 4个玩家槽位
- 玩家头像和昵称
- 开始游戏按钮（房主可见）

### 游戏界面
- 顶部信息栏：房间号、剩余牌数、当前回合
- 对手区域（上、左、右）：显示手牌数量和弃牌
- 中央弃牌池：所有玩家的弃牌
- 玩家区域（底部）：手牌、碰杠显示
- 操作按钮：吃、碰、杠、胡、过
- 摸牌按钮：轮到自己时显示

### 结算界面
- 胜者昵称
- 番型列表
- 番数显示
- 手牌展示

---

**享受游戏！祝你胡牌连连！🀄🎉**

# Assets 目录说明

此目录用于存放游戏资源文件（可选）。

## 📁 可添加的资源

### 麻将牌图片
如果您想使用图片替代文字显示麻将牌，可以在此目录添加：

```
assets/
├── tiles/
│   ├── 1w.png    # 一万
│   ├── 2w.png    # 二万
│   ├── ...
│   ├── 1t.png    # 一条
│   ├── ...
│   ├── 1b.png    # 一筒
│   ├── ...
│   ├── dong.png  # 东
│   ├── nan.png   # 南
│   ├── xi.png    # 西
│   ├── bei.png   # 北
│   ├── zhong.png # 中
│   ├── fa.png    # 发
│   └── bai.png   # 白
├── background/
│   └── table.jpg # 麻将桌背景
└── sounds/       # 音效文件（可选）
    ├── draw.mp3  # 摸牌音效
    ├── play.mp3  # 出牌音效
    └── win.mp3   # 胡牌音效
```

## 🎨 如何使用图片

### 修改 client.js

将 `createTileElement` 函数修改为：

```javascript
function createTileElement(tile, size = 'normal', clickable = false) {
    const tileEl = document.createElement('div');
    tileEl.className = `tile ${size === 'small' ? 'small' : ''} ${size === 'tiny' ? 'tiny' : ''}`;
    tileEl.setAttribute('data-tile', tile);
    tileEl.setAttribute('data-type', getTileType(tile));
    
    // 使用图片
    const img = document.createElement('img');
    img.src = `/assets/tiles/${tile}.png`;
    img.alt = TILE_DISPLAY[tile];
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    tileEl.appendChild(img);
    
    if (clickable) {
        tileEl.style.cursor = 'pointer';
        tileEl.addEventListener('click', () => onTileClick(tile, tileEl));
    }
    
    return tileEl;
}
```

### 修改 style.css

```css
.tile {
    width: 50px;
    height: 70px;
    background: white;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    border: 2px solid #ccc;
    position: relative;
    user-select: none;
    padding: 5px; /* 为图片留出空间 */
}

.tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
```

## 🎵 添加音效

在 client.js 中添加音效播放函数：

```javascript
function playSound(soundName) {
    const audio = new Audio(`/assets/sounds/${soundName}.mp3`);
    audio.volume = 0.5;
    audio.play().catch(e => console.log('音效播放失败:', e));
}

// 在相应位置调用
socket.on('tile_drawn', (data) => {
    playSound('draw');
    gameState.hand.push(data.tile);
    renderHand();
    showToast('摸牌: ' + TILE_DISPLAY[data.tile]);
});

socket.on('tile_played', (data) => {
    playSound('play');
    // ... 其他代码
});

socket.on('game_over', (data) => {
    if (data.type === 'win') {
        playSound('win');
    }
    // ... 其他代码
});
```

## 📦 资源来源

您可以从以下途径获取麻将牌素材：
1. 使用免费图标网站（如 Flaticon, Icons8）
2. 自己设计绘制
3. 使用开源麻将素材
4. 委托设计师制作

## 💡 提示

- 图片文件建议使用 PNG 格式（支持透明背景）
- 建议尺寸：100x140 像素
- 保持所有图片风格一致
- 压缩图片以提高加载速度
- 音效文件保持在 100KB 以内

---

**当前版本使用文字显示，无需添加图片即可运行！**