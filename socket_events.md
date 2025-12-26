# 🔌 Socket.IO 事件完整说明

本文档详细说明了游戏中所有的 Socket.IO 事件及其数据结构。

---

## 📤 客户端发送事件 (Client → Server)

### 1. create_room - 创建房间
**触发时机**：玩家点击"创建房间"按钮

**发送数据**：
```javascript
{
  roomId: String,      // 房间ID (6位字符)
  playerName: String   // 玩家昵称
}
```

**示例**：
```javascript
socket.emit('create_room', {
  roomId: 'ABC123',
  playerName: '玩家1'
});
```

**服务器响应**：`room_created` 或 `error`

---

### 2. join_room - 加入房间
**触发时机**：玩家输入房间号并点击"加入房间"

**发送数据**：
```javascript
{
  roomId: String,      // 要加入的房间ID
  playerName: String   // 玩家昵称
}
```

**示例**：
```javascript
socket.emit('join_room', {
  roomId: 'ABC123',
  playerName: '玩家2'
});
```

**服务器响应**：`player_joined` 或 `error`

---

### 3. start_game - 开始游戏
**触发时机**：房主点击"开始游戏"按钮（需要4人齐全）

**发送数据**：
```javascript
{
  roomId: String      // 房间ID
}
```

**示例**：
```javascript
socket.emit('start_game', {
  roomId: 'ABC123'
});
```

**服务器响应**：`game_started` 或 `error`

---

### 4. draw_tile - 摸牌
**触发时机**：轮到玩家时点击"摸牌"按钮

**发送数据**：
```javascript
{
  roomId: String      // 房间ID
}
```

**示例**：
```javascript
socket.emit('draw_tile', {
  roomId: 'ABC123'
});
```

**服务器响应**：`tile_drawn` + `game_state` 或 `game_over` (流局) 或 `error`

---

### 5. play_tile - 出牌
**触发时机**：玩家点击手牌中的某张牌

**发送数据**：
```javascript
{
  roomId: String,     // 房间ID
  tile: String        // 要打出的牌 (如 '1w', '5t', 'dong')
}
```

**示例**：
```javascript
socket.emit('play_tile', {
  roomId: 'ABC123',
  tile: '3w'
});
```

**服务器响应**：`tile_played` + `can_claim` (给其他玩家) 或 `next_turn` 或 `error`

---

### 6. claim_pong - 碰牌
**触发时机**：玩家点击"碰"按钮

**发送数据**：
```javascript
{
  roomId: String      // 房间ID
}
```

**示例**：
```javascript
socket.emit('claim_pong', {
  roomId: 'ABC123'
});
```

**服务器响应**：`pong_claimed` + `game_state` 或 `error`

---

### 7. claim_chow - 吃牌
**触发时机**：玩家点击"吃"按钮

**发送数据**：
```javascript
{
  roomId: String,           // 房间ID
  combination: Array<String> // 吃牌组合 (如 ['1w', '2w', '3w'])
}
```

**示例**：
```javascript
socket.emit('claim_chow', {
  roomId: 'ABC123',
  combination: ['3t', '4t', '5t']
});
```

**服务器响应**：`chow_claimed` + `game_state` 或 `error`

---

### 8. claim_kong - 杠牌
**触发时机**：玩家点击"杠"按钮

**发送数据**：
```javascript
{
  roomId: String      // 房间ID
}
```

**示例**：
```javascript
socket.emit('claim_kong', {
  roomId: 'ABC123'
});
```

**服务器响应**：`kong_claimed` + `game_state` 或 `error`

---

### 9. declare_win - 胡牌
**触发时机**：玩家点击"胡"按钮

**发送数据**：
```javascript
{
  roomId: String,       // 房间ID
  isSelfDraw: Boolean   // 是否自摸
}
```

**示例**：
```javascript
socket.emit('declare_win', {
  roomId: 'ABC123',
  isSelfDraw: true
});
```

**服务器响应**：`game_over` (胜利) 或 `error`

---

### 10. pass - 过
**触发时机**：玩家点击"过"按钮或超时

**发送数据**：
```javascript
{
  roomId: String      // 房间ID
}
```

**示例**：
```javascript
socket.emit('pass', {
  roomId: 'ABC123'
});
```

**服务器响应**：`next_turn`

---

## 📥 服务器发送事件 (Server → Client)

### 1. room_created - 房间创建成功
**触发时机**：服务器成功创建房间

**接收数据**：
```javascript
{
  roomId: String,           // 房间ID
  players: Array<{          // 玩家列表
    id: String,            // 玩家Socket ID
    name: String,          // 玩家昵称
    score: Number          // 分数
  }>
}
```

**示例**：
```javascript
socket.on('room_created', (data) => {
  console.log('房间创建:', data.roomId);
  console.log('玩家:', data.players);
});
```

---

### 2. player_joined - 玩家加入
**触发时机**：有新玩家加入房间（广播给房间所有人）

**接收数据**：
```javascript
{
  players: Array<{          // 更新后的玩家列表
    id: String,
    name: String,
    score: Number
  }>
}
```

**示例**：
```javascript
socket.on('player_joined', (data) => {
  console.log('当前玩家数:', data.players.length);
  updatePlayerList(data.players);
});
```

---

### 3. player_left - 玩家离开
**触发时机**：玩家断线或离开房间

**接收数据**：
```javascript
{
  playerId: String,         // 离开的玩家ID
  players: Array<{          // 剩余玩家列表
    id: String,
    name: String,
    score: Number
  }>
}
```

---

### 4. game_started - 游戏开始
**触发时机**：房主开始游戏，发牌完成

**接收数据**：
```javascript
{
  hand: Array<String>,      // 自己的手牌 (13张)
  playerIndex: Number,      // 自己的座位号 (0-3)
  currentPlayerIndex: Number, // 当前回合玩家
  players: Array<{          // 所有玩家信息
    id: String,
    name: String,
    handCount: Number,      // 手牌数量
    discarded: Array<String>, // 弃牌
    melds: Array<Object>,   // 碰杠组合
    score: Number
  }>,
  wallCount: Number         // 剩余牌数
}
```

**示例**：
```javascript
socket.on('game_started', (data) => {
  myHand = data.hand;
  myIndex = data.playerIndex;
  renderGameBoard(data);
});
```

---

### 5. tile_drawn - 摸牌成功
**触发时机**：玩家摸牌成功（仅发给该玩家）

**接收数据**：
```javascript
{
  tile: String              // 摸到的牌
}
```

**示例**：
```javascript
socket.on('tile_drawn', (data) => {
  console.log('摸牌:', data.tile);
  addToHand(data.tile);
});
```

---

### 6. tile_played - 出牌广播
**触发时机**：有玩家出牌（广播给所有人）

**接收数据**：
```javascript
{
  playerId: String,         // 出牌玩家ID
  tile: String,            // 打出的牌
  playerIndex: Number      // 出牌玩家座位号
}
```

**示例**：
```javascript
socket.on('tile_played', (data) => {
  console.log(`玩家${data.playerIndex}打出${data.tile}`);
  addToDiscardPool(data.tile);
});
```

---

### 7. can_claim - 可操作提示
**触发时机**：别人出牌后，检测到玩家可以吃/碰/杠/胡

**接收数据**：
```javascript
{
  playerId: String,         // 本玩家ID
  playerIndex: Number,      // 本玩家座位号
  canPong: Boolean,        // 是否可以碰
  canChow: Boolean,        // 是否可以吃
  canKong: Boolean,        // 是否可以杠
  canWin: Boolean          // 是否可以胡
}
```

**示例**：
```javascript
socket.on('can_claim', (data) => {
  showActionButtons(data);
  
  // 10秒超时自动过
  setTimeout(() => {
    socket.emit('pass', { roomId });
  }, 10000);
});
```

---

### 8. next_turn - 下一回合
**触发时机**：无人吃碰杠或玩家选择过

**接收数据**：
```javascript
{
  currentPlayerIndex: Number, // 当前回合玩家
  players: Array<Object>      // 更新后的玩家状态
}
```

**示例**：
```javascript
socket.on('next_turn', (data) => {
  currentPlayer = data.currentPlayerIndex;
  updateTurnIndicator(data);
});
```

---

### 9. pong_claimed - 碰牌成功
**触发时机**：玩家成功碰牌

**接收数据**：
```javascript
{
  playerId: String,         // 碰牌玩家ID
  playerIndex: Number,      // 碰牌玩家座位号
  melds: Array<{           // 更新后的碰杠组合
    type: String,          // 'pong', 'chow', 'kong'
    tiles: Array<String>   // 牌组
  }>
}
```

**示例**：
```javascript
socket.on('pong_claimed', (data) => {
  console.log(`玩家${data.playerIndex}碰牌`);
  updateMelds(data.melds);
});
```

---

### 10. chow_claimed - 吃牌成功
**接收数据结构同** `pong_claimed`

---

### 11. kong_claimed - 杠牌成功
**接收数据结构同** `pong_claimed`

---

### 12. update_hand - 更新手牌
**触发时机**：吃碰杠后更新玩家手牌（仅发给该玩家）

**接收数据**：
```javascript
{
  hand: Array<String>       // 更新后的手牌
}
```

**示例**：
```javascript
socket.on('update_hand', (data) => {
  myHand = data.hand;
  renderHand();
});
```

---

### 13. game_state - 游戏状态更新
**触发时机**：游戏状态改变时（摸牌、出牌、吃碰杠后）

**接收数据**：
```javascript
{
  currentPlayerIndex: Number,
  wallCount: Number,
  players: Array<{
    id: String,
    name: String,
    handCount: Number,
    discarded: Array<String>,
    melds: Array<Object>
  }>
}
```

**示例**：
```javascript
socket.on('game_state', (data) => {
  updateGameBoard(data);
});
```

---

### 14. game_over - 游戏结束
**触发时机**：有人胡牌或流局

**接收数据 (胡牌)**：
```javascript
{
  type: 'win',
  winnerId: String,         // 胜者ID
  winnerIndex: Number,      // 胜者座位号
  winnerName: String,       // 胜者昵称
  hand: Array<String>,      // 胜者手牌
  melds: Array<Object>,     // 胜者碰杠组合
  fan: {                    // 番型信息
    types: Array<String>,   // 番型列表 ['平胡', '自摸']
    count: Number           // 总番数
  },
  isSelfDraw: Boolean       // 是否自摸
}
```

**接收数据 (流局)**：
```javascript
{
  type: 'draw',
  message: String           // 流局原因
}
```

**示例**：
```javascript
socket.on('game_over', (data) => {
  if (data.type === 'win') {
    showWinModal(data);
  } else {
    showDrawModal(data.message);
  }
});
```

---

### 15. error - 错误消息
**触发时机**：操作失败或非法操作

**接收数据**：
```javascript
{
  message: String           // 错误描述
}
```

**示例**：
```javascript
socket.on('error', (data) => {
  showToast('错误: ' + data.message);
});
```

---

## 🔄 典型游戏流程

### 场景1：房间创建和加入
```
玩家1: create_room → room_created
玩家2: join_room → player_joined (广播)
玩家3: join_room → player_joined (广播)
玩家4: join_room → player_joined (广播)
```

### 场景2：游戏开始
```
玩家1(房主): start_game
服务器: → game_started (发给每个玩家不同的手牌)
```

### 场景3：正常出牌流程
```
玩家1: draw_tile
服务器: → tile_drawn (给玩家1)
       → game_state (广播)

玩家1: play_tile
服务器: → tile_played (广播)
       → can_claim (给可以操作的玩家)
       → next_turn (如果无人操作)
```

### 场景4：碰牌流程
```
玩家1: play_tile (打3万)
服务器: → tile_played (广播)
       → can_claim (给玩家2，canPong: true)

玩家2: claim_pong
服务器: → pong_claimed (广播)
       → update_hand (给玩家2)
       → game_state (广播)

玩家2: play_tile (继续出牌)
```

### 场景5：胡牌流程
```
玩家1: play_tile (打5条)
服务器: → tile_played (广播)
       → can_claim (给玩家3，canWin: true)

玩家3: declare_win
服务器: → game_over (广播胜利信息)
```

---

## 🛡️ 错误处理

常见错误消息：
- `"房间已存在"` - 创建房间时房间号重复
- `"房间不存在"` - 加入不存在的房间
- `"房间已满或游戏已开始"` - 无法加入
- `"只有房主可以开始游戏"` - 非房主尝试开始
- `"需要4名玩家才能开始"` - 人数不足
- `"还没轮到你"` - 非法操作
- `"无效的牌"` - 打出不存在的牌
- `"不能胡牌"` - 胡牌判定失败

---

## 💡 最佳实践

### 1. 事件监听
```javascript
// ✅ 好的做法
socket.on('game_started', handleGameStart);
socket.on('tile_drawn', handleTileDraw);

// ❌ 避免重复监听
socket.on('game_started', ...);
socket.on('game_started', ...); // 重复
```

### 2. 错误处理
```javascript
// ✅ 总是监听 error 事件
socket.on('error', (data) => {
  console.error('Socket错误:', data.message);
  showToast(data.message);
});
```

### 3. 超时处理
```javascript
// ✅ 为可选操作设置超时
socket.on('can_claim', (data) => {
  const timeoutId = setTimeout(() => {
    socket.emit('pass', { roomId });
  }, 10000);
  
  // 用户操作后清除超时
  document.getElementById('btn-pass').onclick = () => {
    clearTimeout(timeoutId);
    socket.emit('pass', { roomId });
  };
});
```

### 4. 状态同步
```javascript
// ✅ 始终基于服务器返回的状态
socket.on('game_state', (data) => {
  // 更新本地状态
  gameState = { ...gameState, ...data };
  // 重新渲染UI
  renderGameBoard(gameState);
});
```

---

**完整的事件文档，帮助你理解游戏的通信机制！🔌✨**