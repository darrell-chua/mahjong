const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.IO 配置 - 支持跨域连接
const io = socketIo(server, {
  cors: {
    origin: "*", // 允许所有来源（生产环境建议指定具体域名）
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'] // 支持多种传输方式
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 房间数据存储
const rooms = new Map();

// 麻将牌定义（马来西亚麻将）
const TILES = {
  // 万（1-9）
  WAN: ['1w', '2w', '3w', '4w', '5w', '6w', '7w', '8w', '9w'],
  // 条（1-9）
  TIAO: ['1t', '2t', '3t', '4t', '5t', '6t', '7t', '8t', '9t'],
  // 筒（1-9）
  TONG: ['1b', '2b', '3b', '4b', '5b', '6b', '7b', '8b', '9b'],
  // 字牌（东南西北中发白）
  HONOR: ['dong', 'nan', 'xi', 'bei', 'zhong', 'fa', 'bai']
};

// 生成完整牌堆（每种牌4张）
function createDeck() {
  const deck = [];
  Object.values(TILES).forEach(suit => {
    suit.forEach(tile => {
      for (let i = 0; i < 4; i++) {
        deck.push(tile);
      }
    });
  });
  return shuffleDeck(deck);
}

// 洗牌
function shuffleDeck(deck) {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// 麻将牌排序函数 - 按照万、筒、条、字牌的顺序
function sortTiles(tiles) {
  const order = {
    'w': 1,  // 万
    'b': 2,  // 筒
    't': 3,  // 条
    'honor': 4  // 字牌
  };
  
  const honorOrder = {
    'dong': 1,
    'nan': 2,
    'xi': 3,
    'bei': 4,
    'zhong': 5,
    'fa': 6,
    'bai': 7
  };
  
  return tiles.sort((a, b) => {
    // 判断牌的类型
    const typeA = a.match(/[wtb]$/) ? a.slice(-1) : 'honor';
    const typeB = b.match(/[wtb]$/) ? b.slice(-1) : 'honor';
    
    // 先按花色排序
    if (order[typeA] !== order[typeB]) {
      return order[typeA] - order[typeB];
    }
    
    // 同花色，按数字排序
    if (typeA !== 'honor') {
      return parseInt(a[0]) - parseInt(b[0]);
    }
    
    // 字牌按固定顺序排序
    return honorOrder[a] - honorOrder[b];
  });
}

// 房间类
class Room {
  constructor(roomId, hostId, hostName) {
    this.roomId = roomId;
    this.players = [{
      id: hostId,
      name: hostName,
      hand: [],
      discarded: [],
      melds: [], // 吃碰杠的牌组
      isReady: false,
      score: 0
    }];
    this.deck = [];
    this.currentPlayerIndex = 0;
    this.dealerIndex = 0; // 庄家索引，初始为房主（索引0）
    this.gameStarted = false;
    this.lastDiscard = null;
    this.turnTimer = null;
    this.wall = []; // 剩余牌墙
    this.pendingClaim = null; // 当前等待的操作 { playerId, action, priority, timestamp }
    // 优先级：胡=4, 杠=3, 碰=2, 吃=1
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= 4) return false;
    if (this.gameStarted) return false;
    
    this.players.push({
      id: playerId,
      name: playerName,
      hand: [],
      discarded: [],
      melds: [],
      isReady: false,
      score: 0
    });
    return true;
  }

  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
    }
  }

  startGame() {
    if (this.players.length !== 4) return false;
    
    this.gameStarted = true;
    this.deck = createDeck();
    this.wall = [...this.deck];
    this.dealerIndex = 0; // 第一局，庄家是房主（索引0）
    
    // 发牌：每人13张
    this.players.forEach(player => {
      player.hand = [];
      for (let i = 0; i < 13; i++) {
        player.hand.push(this.wall.shift());
      }
      player.hand = sortTiles(player.hand); // 使用新的排序函数
      player.discarded = [];
      player.melds = [];
    });
    
    // 庄家起手额外摸一张，起手14张后先打牌
    this.currentPlayerIndex = this.dealerIndex;
    const dealer = this.players[this.currentPlayerIndex];
    const dealerExtra = this.wall.shift();
    if (dealerExtra) {
      dealer.hand.push(dealerExtra);
      dealer.hand = sortTiles(dealer.hand);
    }
    return true;
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  drawTile(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.wall.length === 0) return null;
    
    const tile = this.wall.shift();
    player.hand.push(tile);
    player.hand = sortTiles(player.hand); // 使用新的排序函数
    return tile;
  }

  discardTile(playerId, tile) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    
    const index = player.hand.indexOf(tile);
    if (index === -1) return false;
    
    player.hand.splice(index, 1);
    player.discarded.push(tile);
    this.lastDiscard = { tile, playerId };
    return true;
  }

  canPong(playerId) {
    if (!this.lastDiscard) return false;
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.id === this.lastDiscard.playerId) return false;
    
    const count = player.hand.filter(t => t === this.lastDiscard.tile).length;
    return count >= 2;
  }

  canChow(playerId) {
    if (!this.lastDiscard) return false;
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    
    // 只能吃下一个玩家（打出者的下家）的牌
    const nextPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (player.id !== this.players[nextPlayerIndex].id) return false;
    
    return this.findChowCombinations(player.hand, this.lastDiscard.tile).length > 0;
  }

  findChowCombinations(hand, tile) {
    const combinations = [];
    const type = tile.slice(-1); // w, t, b
    if (!['w', 't', 'b'].includes(type)) return combinations; // 字牌不能吃
    
    const num = parseInt(tile[0]);
    
    // 检查 [n-2, n-1, n], [n-1, n, n+1], [n, n+1, n+2]
    const patterns = [
      [num - 2, num - 1, num],
      [num - 1, num, num + 1],
      [num, num + 1, num + 2]
    ];
    
    patterns.forEach(pattern => {
      if (pattern[0] >= 1 && pattern[2] <= 9) {
        const tiles = pattern.map(n => `${n}${type}`);
        const needed = tiles.filter(t => t !== tile);
        if (needed.every(t => hand.includes(t))) {
          combinations.push(tiles);
        }
      }
    });
    
    return combinations;
  }

  canKong(playerId) {
    if (!this.lastDiscard) return false;
    const player = this.players.find(p => p.id === playerId);
    if (!player || player.id === this.lastDiscard.playerId) return false;
    
    const count = player.hand.filter(t => t === this.lastDiscard.tile).length;
    return count >= 3;
  }

  // 检查是否可以暗杠（手牌有4张相同的牌）
  canSelfKong(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    
    // 统计手牌中每种牌的数量
    const counts = {};
    player.hand.forEach(tile => {
      counts[tile] = (counts[tile] || 0) + 1;
    });
    
    // 检查是否有4张相同的牌
    return Object.values(counts).some(count => count === 4);
  }

  // 检查是否可以执行某个操作（考虑优先级）
  canExecuteAction(playerId, action) {
    if (!this.pendingClaim) return true; // 没有待处理的操作
    
    // 操作优先级：胡=4, 杠=3, 碰=2, 吃=1
    const priority = {
      'win': 4,
      'kong': 3,
      'pong': 2,
      'chow': 1
    };
    
    const currentPriority = priority[this.pendingClaim.action] || 0;
    const requestPriority = priority[action] || 0;
    
    // 如果当前操作优先级更高或相同，且是同一个玩家，允许执行
    if (this.pendingClaim.playerId === playerId && currentPriority >= requestPriority) {
      return true;
    }
    
    // 如果请求的操作优先级更高，可以抢占
    if (requestPriority > currentPriority) {
      return true;
    }
    
    // 否则不允许执行
    return false;
  }

  // 取消当前待处理的操作
  cancelPendingClaim() {
    this.pendingClaim = null;
  }

  performPong(playerId) {
    if (!this.canPong(playerId)) return false;
    
    // 检查是否可以执行（考虑优先级）
    if (!this.canExecuteAction(playerId, 'pong')) {
      return false;
    }
    
    const player = this.players.find(p => p.id === playerId);
    const tile = this.lastDiscard.tile;
    
    // 从手牌中移除2张相同的牌
    for (let i = 0; i < 2; i++) {
      const index = player.hand.indexOf(tile);
      player.hand.splice(index, 1);
    }
    
    // 添加到已碰牌组
    player.melds.push({ type: 'pong', tiles: [tile, tile, tile] });
    
    // 从弃牌区移除最后一张
    const discardPlayer = this.players.find(p => p.id === this.lastDiscard.playerId);
    discardPlayer.discarded.pop();
    
    this.lastDiscard = null;
    this.pendingClaim = null; // 清除待处理操作
    
    // 碰牌的玩家继续出牌（不摸牌，不进入下一回合）
    this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
    
    // 手牌重新排序
    player.hand = sortTiles(player.hand);
    
    return true;
  }

  performChow(playerId, combination) {
    if (!this.canChow(playerId)) return false;
    
    // 检查是否可以执行（考虑优先级）
    if (!this.canExecuteAction(playerId, 'chow')) {
      return false;
    }
    
    const player = this.players.find(p => p.id === playerId);
    const tile = this.lastDiscard.tile;
    
    // 从手牌中移除需要的牌
    combination.forEach(t => {
      if (t !== tile) {
        const index = player.hand.indexOf(t);
        player.hand.splice(index, 1);
      }
    });
    
    // 添加到已吃牌组
    player.melds.push({ type: 'chow', tiles: combination });
    
    // 从弃牌区移除最后一张
    const discardPlayer = this.players.find(p => p.id === this.lastDiscard.playerId);
    discardPlayer.discarded.pop();
    
    this.lastDiscard = null;
    this.pendingClaim = null; // 清除待处理操作
    
    // 吃牌的玩家继续出牌（不摸牌，不进入下一回合）
    this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
    
    // 手牌重新排序
    player.hand = sortTiles(player.hand);
    
    return true;
  }

  performKong(playerId) {
    if (!this.canKong(playerId)) return false;
    
    // 检查是否可以执行（考虑优先级）
    if (!this.canExecuteAction(playerId, 'kong')) {
      return false;
    }
    
    const player = this.players.find(p => p.id === playerId);
    const tile = this.lastDiscard.tile;
    
    // 从手牌中移除3张相同的牌
    for (let i = 0; i < 3; i++) {
      const index = player.hand.indexOf(tile);
      player.hand.splice(index, 1);
    }
    
    // 添加到已杠牌组
    player.melds.push({ type: 'kong', tiles: [tile, tile, tile, tile] });
    
    // 从弃牌区移除最后一张
    const discardPlayer = this.players.find(p => p.id === this.lastDiscard.playerId);
    discardPlayer.discarded.pop();
    
    this.lastDiscard = null;
    this.pendingClaim = null; // 清除待处理操作
    
    // 杠牌后摸一张牌
    const drawnTile = this.wall.shift();
    if (drawnTile) {
      player.hand.push(drawnTile);
      player.hand = sortTiles(player.hand);
    }
    
    // 杠牌的玩家继续出牌（不进入下一回合）
    this.currentPlayerIndex = this.players.findIndex(p => p.id === playerId);
    
    return drawnTile; // 返回摸到的牌，让前端知道
  }

  // 执行暗杠（手牌4张相同牌）
  performSelfKong(playerId, tile) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;
    
    // 检查手牌中是否有4张该牌
    const count = player.hand.filter(t => t === tile).length;
    if (count !== 4) return false;
    
    // 从手牌中移除4张相同的牌
    for (let i = 0; i < 4; i++) {
      const index = player.hand.indexOf(tile);
      player.hand.splice(index, 1);
    }
    
    // 添加到已杠牌组
    player.melds.push({ type: 'kong', tiles: [tile, tile, tile, tile] });
    
    // 暗杠后摸一张牌
    const drawnTile = this.wall.shift();
    if (drawnTile) {
      player.hand.push(drawnTile);
      player.hand = sortTiles(player.hand);
    }
    
    // 手牌重新排序
    player.hand = sortTiles(player.hand);
    
    return drawnTile; // 返回摸到的牌，让前端知道
  }

  checkWin(playerId, isSelfDraw = false) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) return null;
    
    const hand = [...player.hand];
    if (!isSelfDraw && this.lastDiscard) {
      hand.push(this.lastDiscard.tile);
    }
    
    if (this.isWinningHand(hand, player.melds)) {
      const fanType = this.calculateFan(hand, player.melds, isSelfDraw);
      return { win: true, fan: fanType };
    }
    
    return null;
  }

  isWinningHand(hand, melds) {
    // 简化的胡牌判断：需要4组顺子/刻子 + 1对将
    const sortedHand = [...hand].sort();
    return this.checkWinRecursive(sortedHand, 0);
  }

  checkWinRecursive(hand, pairCount) {
    if (hand.length === 0) {
      return pairCount === 1;
    }
    
    if (hand.length === 2 && hand[0] === hand[1] && pairCount === 0) {
      return true;
    }
    
    // 尝试组成刻子
    if (hand.length >= 3 && hand[0] === hand[1] && hand[1] === hand[2]) {
      const newHand = hand.slice(3);
      if (this.checkWinRecursive(newHand, pairCount)) return true;
    }
    
    // 尝试组成顺子
    if (hand.length >= 3) {
      const tile = hand[0];
      const type = tile.slice(-1);
      if (['w', 't', 'b'].includes(type)) {
        const num = parseInt(tile[0]);
        const next1 = `${num + 1}${type}`;
        const next2 = `${num + 2}${type}`;
        
        const idx1 = hand.indexOf(next1);
        const idx2 = hand.indexOf(next2);
        
        if (idx1 !== -1 && idx2 !== -1) {
          const newHand = hand.filter((_, i) => i !== 0 && i !== idx1 && i !== idx2);
          if (this.checkWinRecursive(newHand, pairCount)) return true;
        }
      }
    }
    
    // 尝试组成对子
    if (hand.length >= 2 && hand[0] === hand[1] && pairCount === 0) {
      const newHand = hand.slice(2);
      if (this.checkWinRecursive(newHand, 1)) return true;
    }
    
    return false;
  }

  calculateFan(hand, melds, isSelfDraw) {
    const fanTypes = [];
    let fanCount = 1;
    
    // 自摸
    if (isSelfDraw) {
      fanTypes.push('自摸');
      fanCount += 1;
    }
    
    // 碰碰胡
    const allPongs = hand.length === 0 || this.isAllPongs(hand, melds);
    if (allPongs) {
      fanTypes.push('碰碰胡');
      fanCount += 2;
    }
    
    // 清一色
    if (this.isAllOneSuit(hand, melds)) {
      fanTypes.push('清一色');
      fanCount += 5;
    }
    
    // 混一色
    if (this.isMixedOneSuit(hand, melds) && !this.isAllOneSuit(hand, melds)) {
      fanTypes.push('混一色');
      fanCount += 3;
    }
    
    if (fanTypes.length === 0) {
      fanTypes.push('平胡');
    }
    
    return { types: fanTypes, count: fanCount };
  }

  isAllPongs(hand, melds) {
    // 检查是否所有牌组都是刻子
    const pongMelds = melds.filter(m => m.type === 'pong' || m.type === 'kong');
    if (melds.some(m => m.type === 'chow')) return false;
    
    // 检查手牌是否都能组成刻子+对
    const counts = {};
    hand.forEach(tile => {
      counts[tile] = (counts[tile] || 0) + 1;
    });
    
    let pairs = 0;
    let pongs = 0;
    
    Object.values(counts).forEach(count => {
      if (count === 2) pairs++;
      if (count === 3) pongs++;
      if (count === 4) pongs++;
    });
    
    return pairs <= 1 && (pongs + pongMelds.length) >= 4;
  }

  isAllOneSuit(hand, melds) {
    const allTiles = [...hand];
    melds.forEach(m => allTiles.push(...m.tiles));
    
    if (allTiles.length === 0) return false;
    
    const suits = new Set(allTiles.map(t => t.slice(-1)));
    return suits.size === 1 && !allTiles[0].match(/dong|nan|xi|bei|zhong|fa|bai/);
  }

  isMixedOneSuit(hand, melds) {
    const allTiles = [...hand];
    melds.forEach(m => allTiles.push(...m.tiles));
    
    const numberTiles = allTiles.filter(t => t.match(/[wtb]$/));
    const honorTiles = allTiles.filter(t => t.match(/dong|nan|xi|bei|zhong|fa|bai/));
    
    if (numberTiles.length === 0) return false;
    
    const suits = new Set(numberTiles.map(t => t.slice(-1)));
    return suits.size === 1 && honorTiles.length > 0;
  }

  // 重置游戏状态，保留玩家列表
  resetGame() {
    if (this.players.length !== 4) return false;
    
    // 轮换庄家：下一局庄家是当前庄家的下一个玩家
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    
    // 重置游戏状态
    this.deck = createDeck();
    this.wall = [...this.deck];
    this.lastDiscard = null;
    this.currentPlayerIndex = this.dealerIndex; // 新的庄家
    
    // 重置每个玩家的游戏数据，保留名字和分数
    this.players.forEach(player => {
      player.hand = [];
      player.discarded = [];
      player.melds = [];
      player.isReady = false;
    });
    
    // 发牌：每人13张
    this.players.forEach(player => {
      for (let i = 0; i < 13; i++) {
        player.hand.push(this.wall.shift());
      }
      player.hand = sortTiles(player.hand);
    });
    
    // 庄家起手额外摸一张
    const dealer = this.players[this.currentPlayerIndex];
    const dealerExtra = this.wall.shift();
    if (dealerExtra) {
      dealer.hand.push(dealerExtra);
      dealer.hand = sortTiles(dealer.hand);
    }
    
    this.gameStarted = true;
    return true;
  }
}

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log('新玩家连接:', socket.id);

  // 创建房间
  socket.on('create_room', (data) => {
    const { roomId, playerName } = data;
    
    // 验证房间号格式（6位字符）
    if (!roomId || roomId.length !== 6 || !/^[A-Z0-9]{6}$/.test(roomId)) {
      socket.emit('error', { message: '房间号必须是6位字母或数字' });
      return;
    }
    
    if (rooms.has(roomId)) {
      socket.emit('error', { message: '房间已存在，请使用"加入房间"或选择其他房间号' });
      return;
    }
    
    const room = new Room(roomId, socket.id, playerName);
    rooms.set(roomId, room);
    socket.join(roomId);
    
    socket.emit('room_created', {
      roomId,
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
    });
    
    console.log(`房间创建: ${roomId}, 房主: ${playerName}`);
  });

  // 加入房间
  socket.on('join_room', (data) => {
    const { roomId, playerName } = data;
    
    if (!rooms.has(roomId)) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    const room = rooms.get(roomId);
    
    if (!room.addPlayer(socket.id, playerName)) {
      socket.emit('error', { message: '房间已满或游戏已开始' });
      return;
    }
    
    socket.join(roomId);
    
    io.to(roomId).emit('player_joined', {
      players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score }))
    });
    
    console.log(`玩家加入: ${playerName} -> 房间 ${roomId}`);
  });

  // 开始游戏
  socket.on('start_game', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    if (room.players[0].id !== socket.id) {
      socket.emit('error', { message: '只有房主可以开始游戏' });
      return;
    }
    
    if (!room.startGame()) {
      socket.emit('error', { message: '需要4名玩家才能开始' });
      return;
    }
    
    // 向每个玩家发送各自的手牌（庄家可能已是14张）
    room.players.forEach((player, index) => {
      io.to(player.id).emit('game_started', {
        hand: player.hand,
        playerIndex: index,
        currentPlayerIndex: room.currentPlayerIndex,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          handCount: p.hand.length,
          discarded: p.discarded,
          melds: p.melds,
          score: p.score
        })),
        wallCount: room.wall.length
      });
    });
    
    // 首轮：通知庄家无需摸牌，直接出牌
    const dealerId = room.players[room.currentPlayerIndex].id;
    io.to(dealerId).emit('can_play', { message: '首轮开始，请出牌' });
    
    console.log(`游戏开始: 房间 ${roomId}`);
  });

  // 摸牌
  socket.on('draw_tile', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '还没轮到你' });
      return;
    }
    
    const tile = room.drawTile(socket.id);
    
    if (!tile) {
      // 流局
      io.to(roomId).emit('game_over', {
        type: 'draw',
        message: '流局 - 牌堆已空'
      });
      return;
    }
    
    // 检查是否可以自摸
    const canSelfWin = room.checkWin(socket.id, true);
    
    // 检查是否可以暗杠
    const canSelfKong = room.canSelfKong(socket.id);
    
    socket.emit('tile_drawn', { 
      tile,
      canSelfWin: canSelfWin !== null,
      canSelfKong: canSelfKong
    });
    
    // 如果可以自摸，通知玩家
    if (canSelfWin) {
      socket.emit('can_self_win', {
        canWin: true
      });
    }
    
    // 如果可以暗杠，通知玩家
    if (canSelfKong) {
      socket.emit('can_self_kong', {
        canKong: true
      });
    }
    
    io.to(roomId).emit('game_state', {
      currentPlayerIndex: room.currentPlayerIndex,
      wallCount: room.wall.length,
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        discarded: p.discarded,
        melds: p.melds
      }))
    });
  });

  // 出牌
  socket.on('play_tile', (data) => {
    const { roomId, tile } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '还没轮到你' });
      return;
    }
    
    if (!room.discardTile(socket.id, tile)) {
      socket.emit('error', { message: '无效的牌' });
      return;
    }
    
    // 广播出牌
    io.to(roomId).emit('tile_played', {
      playerId: socket.id,
      tile,
      playerIndex: room.currentPlayerIndex
    });
    
    // 重置待处理操作
    room.pendingClaim = null;
    
    // 检查其他玩家是否可以吃碰杠胡
    const canClaim = [];
    room.players.forEach((player, index) => {
      if (player.id !== socket.id) {
        const canWin = room.checkWin(player.id, false) !== null;
        const canKong = room.canKong(player.id);
        const canPong = room.canPong(player.id);
        const canChow = room.canChow(player.id);
        
        const claims = {
          playerId: player.id,
          playerIndex: index,
          canPong: canPong,
          canChow: canChow,
          canKong: canKong,
          canWin: canWin
        };
        
        if (canPong || canChow || canKong || canWin) {
          canClaim.push(claims);
          io.to(player.id).emit('can_claim', claims);
        }
      }
    });
    
    // 如果没人可以吃碰杠胡，自动进入下一轮
    if (canClaim.length === 0) {
      room.nextTurn();
      io.to(roomId).emit('next_turn', {
        currentPlayerIndex: room.currentPlayerIndex,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          handCount: p.hand.length,
          discarded: p.discarded,
          melds: p.melds
        }))
      });
    }
  });

  // 碰牌
  socket.on('claim_pong', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    // 检查是否有更高优先级的操作待处理
    if (room.pendingClaim && room.pendingClaim.action !== 'pong' && room.pendingClaim.playerId !== socket.id) {
      const priority = { 'win': 4, 'kong': 3, 'pong': 2, 'chow': 1 };
      if (priority[room.pendingClaim.action] > priority['pong']) {
        socket.emit('error', { message: '有更高优先级的操作正在进行' });
        return;
      }
    }
    
    // 设置待处理操作
    if (!room.pendingClaim || room.canExecuteAction(socket.id, 'pong')) {
      room.pendingClaim = { playerId: socket.id, action: 'pong', timestamp: Date.now() };
      
      // 在调用 performPong 之前保存被碰的牌（因为 performPong 会将 lastDiscard 设为 null）
      const claimedTile = room.lastDiscard ? room.lastDiscard.tile : null;
      
      if (room.performPong(socket.id)) {
        const player = room.players.find(p => p.id === socket.id);
        
        // 通知其他玩家操作被取消
        io.to(roomId).emit('claim_cancelled', { message: '有其他玩家执行了更高优先级的操作' });
        
        io.to(roomId).emit('pong_claimed', {
          playerId: socket.id,
          playerIndex: room.currentPlayerIndex,
          melds: player.melds
        });
        
        // 通知所有客户端从弃牌池移除该牌
        if (claimedTile) {
          io.to(roomId).emit('tile_removed_from_pool', {
            tile: claimedTile
          });
        }
        
        socket.emit('update_hand', { hand: player.hand });
        
        io.to(roomId).emit('game_state', {
          currentPlayerIndex: room.currentPlayerIndex,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            handCount: p.hand.length,
            discarded: p.discarded,
            melds: p.melds
          }))
        });
        
        // 通知碰牌玩家可以直接出牌（手牌13张）
        socket.emit('can_play', { message: '请出牌' });
      } else {
        room.pendingClaim = null;
        socket.emit('error', { message: '碰牌失败' });
      }
    } else {
      socket.emit('error', { message: '有其他玩家正在操作，请稍候' });
    }
  });

  // 吃牌
  socket.on('claim_chow', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    // 检查是否有更高优先级的操作待处理（吃是最低优先级）
    if (room.pendingClaim && room.pendingClaim.playerId !== socket.id) {
      socket.emit('error', { message: '有其他玩家正在执行更高优先级的操作（碰/杠/胡）' });
      return;
    }
    
    // 如果前端未提供组合，让服务器自动选择第一组可吃组合
    let chosenCombo = data.combination;
    if (!Array.isArray(chosenCombo) || chosenCombo.length === 0) {
      const player = room.players.find(p => p.id === socket.id);
      if (!player || !room.lastDiscard) return;
      const combos = room.findChowCombinations(player.hand, room.lastDiscard.tile);
      if (!combos || combos.length === 0) {
        socket.emit('error', { message: '没有可用的吃牌组合' });
        return;
      }
      chosenCombo = combos[0];
    }
    
    // 设置待处理操作
    if (!room.pendingClaim || room.canExecuteAction(socket.id, 'chow')) {
      room.pendingClaim = { playerId: socket.id, action: 'chow', timestamp: Date.now() };
      
      // 在调用 performChow 之前保存被吃的牌（因为 performChow 会将 lastDiscard 设为 null）
      const claimedTile = room.lastDiscard ? room.lastDiscard.tile : null;
      
      if (room.performChow(socket.id, chosenCombo)) {
        const player = room.players.find(p => p.id === socket.id);
        
        // 通知其他玩家操作被取消
        io.to(roomId).emit('claim_cancelled', { message: '有其他玩家执行了操作' });
        
        io.to(roomId).emit('chow_claimed', {
          playerId: socket.id,
          playerIndex: room.currentPlayerIndex,
          melds: player.melds
        });
        
        // 通知所有客户端从弃牌池移除该牌
        if (claimedTile) {
          io.to(roomId).emit('tile_removed_from_pool', {
            tile: claimedTile
          });
        }
        
        socket.emit('update_hand', { hand: player.hand });
        
        io.to(roomId).emit('game_state', {
          currentPlayerIndex: room.currentPlayerIndex,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            handCount: p.hand.length,
            discarded: p.discarded,
            melds: p.melds
          }))
        });
        
        // 通知吃牌玩家可以直接出牌（手牌13张）
        socket.emit('can_play', { message: '请出牌' });
      } else {
        room.pendingClaim = null;
        socket.emit('error', { message: '吃牌失败' });
      }
    } else {
      socket.emit('error', { message: '有其他玩家正在操作，请稍候' });
    }
  });

  // 杠牌
  socket.on('claim_kong', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    // 检查是否有更高优先级的操作待处理（胡）
    if (room.pendingClaim && room.pendingClaim.action === 'win' && room.pendingClaim.playerId !== socket.id) {
      socket.emit('error', { message: '有玩家正在胡牌' });
      return;
    }
    
    // 设置待处理操作
    if (!room.pendingClaim || room.canExecuteAction(socket.id, 'kong')) {
      room.pendingClaim = { playerId: socket.id, action: 'kong', timestamp: Date.now() };
      
      // 在调用 performKong 之前保存被杠的牌（因为 performKong 会将 lastDiscard 设为 null）
      const claimedTile = room.lastDiscard ? room.lastDiscard.tile : null;
      
      const drawnTile = room.performKong(socket.id);
      
      if (drawnTile) {
        const player = room.players.find(p => p.id === socket.id);
        
        // 通知其他玩家操作被取消
        io.to(roomId).emit('claim_cancelled', { message: '有其他玩家执行了更高优先级的操作' });
        
        // 检查杠牌后是否可以自摸
        const canSelfWin = room.checkWin(socket.id, true);
        
        io.to(roomId).emit('kong_claimed', {
          playerId: socket.id,
          playerIndex: room.currentPlayerIndex,
          melds: player.melds
        });
        
        // 通知所有客户端从弃牌池移除该牌
        if (claimedTile) {
          io.to(roomId).emit('tile_removed_from_pool', {
            tile: claimedTile
          });
        }
        
        socket.emit('update_hand', { hand: player.hand });
        socket.emit('tile_drawn_after_kong', { 
          tile: drawnTile,
          message: '杠牌后摸牌，请出牌',
          canSelfWin: canSelfWin !== null
        });
        
        // 如果可以自摸，通知玩家
        if (canSelfWin) {
          socket.emit('can_self_win', {
            canWin: true
          });
        } else {
          // 如果不能自摸，通知杠牌玩家可以直接出牌（手牌14张）
          socket.emit('can_play', { message: '杠牌后已摸牌，请出牌' });
        }
        
        io.to(roomId).emit('game_state', {
          currentPlayerIndex: room.currentPlayerIndex,
          wallCount: room.wall.length,
          players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            handCount: p.hand.length,
            discarded: p.discarded,
            melds: p.melds
          }))
        });
      } else {
        room.pendingClaim = null;
        socket.emit('error', { message: '杠牌失败' });
      }
    } else {
      socket.emit('error', { message: '有其他玩家正在操作，请稍候' });
    }
  });

  // 暗杠（手牌4张相同牌）
  socket.on('claim_self_kong', (data) => {
    const { roomId, tile } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    const currentPlayer = room.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) {
      socket.emit('error', { message: '还没轮到你' });
      return;
    }
    
    // 检查是否可以暗杠
    if (!room.canSelfKong(socket.id)) {
      socket.emit('error', { message: '不能暗杠' });
      return;
    }
    
    // 如果没有指定牌，自动找到可以暗杠的牌
    let kongTile = tile;
    if (!kongTile) {
      const player = room.players.find(p => p.id === socket.id);
      const counts = {};
      player.hand.forEach(t => {
        counts[t] = (counts[t] || 0) + 1;
      });
      
      // 找到第一张有4张的牌
      for (const [t, count] of Object.entries(counts)) {
        if (count === 4) {
          kongTile = t;
          break;
        }
      }
    }
    
    if (!kongTile) {
      socket.emit('error', { message: '没有可暗杠的牌' });
      return;
    }
    
    const drawnTile = room.performSelfKong(socket.id, kongTile);
    
    if (drawnTile !== false) {
      const player = room.players.find(p => p.id === socket.id);
      
      // 检查暗杠后是否可以自摸
      const canSelfWin = room.checkWin(socket.id, true);
      
      io.to(roomId).emit('self_kong_claimed', {
        playerId: socket.id,
        playerIndex: room.currentPlayerIndex,
        melds: player.melds,
        tile: kongTile
      });
      
      socket.emit('update_hand', { hand: player.hand });
      socket.emit('tile_drawn_after_kong', { 
        tile: drawnTile,
        message: '暗杠后摸牌，请出牌',
        canSelfWin: canSelfWin !== null
      });
      
      // 如果可以自摸，通知玩家
      if (canSelfWin) {
        socket.emit('can_self_win', {
          canWin: true
        });
      } else {
        // 如果不能自摸，通知暗杠玩家可以直接出牌
        socket.emit('can_play', { message: '暗杠后已摸牌，请出牌' });
      }
      
      io.to(roomId).emit('game_state', {
        currentPlayerIndex: room.currentPlayerIndex,
        wallCount: room.wall.length,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          handCount: p.hand.length,
          discarded: p.discarded,
          melds: p.melds
        }))
      });
    } else {
      socket.emit('error', { message: '暗杠失败' });
    }
  });

  // 胡牌
  socket.on('declare_win', (data) => {
    const { roomId, isSelfDraw } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    // 胡牌优先级最高，总是可以执行（除非已经有其他人在胡）
    if (room.pendingClaim && room.pendingClaim.action === 'win' && room.pendingClaim.playerId !== socket.id) {
      socket.emit('error', { message: '其他玩家已经胡牌' });
      return;
    }
    
    // 设置待处理操作（胡牌优先级最高）
    room.pendingClaim = { playerId: socket.id, action: 'win', timestamp: Date.now() };
    
    const winResult = room.checkWin(socket.id, isSelfDraw);
    
    if (winResult && winResult.win) {
      const winner = room.players.find(p => p.id === socket.id);
      const winnerIndex = room.players.findIndex(p => p.id === socket.id);
      
      // 通知其他玩家操作被取消（胡牌是最高的）
      io.to(roomId).emit('claim_cancelled', { message: '有玩家胡牌，本局结束' });
      
      io.to(roomId).emit('game_over', {
        type: 'win',
        winnerId: socket.id,
        winnerIndex,
        winnerName: winner.name,
        hand: winner.hand,
        melds: winner.melds,
        fan: winResult.fan,
        isSelfDraw
      });
      
      // 清除待处理操作
      room.pendingClaim = null;
      
      console.log(`${winner.name} 胡牌! 番型: ${winResult.fan.types.join(', ')}, 番数: ${winResult.fan.count}`);
    } else {
      room.pendingClaim = null;
      socket.emit('error', { message: '不能胡牌' });
    }
  });

  // 过
  socket.on('pass', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room || !room.gameStarted) return;
    
    // 如果当前玩家有待处理的操作，取消它
    if (room.pendingClaim && room.pendingClaim.playerId === socket.id) {
      room.pendingClaim = null;
    }
    
    // 检查是否还有其他玩家可以操作
    const stillCanClaim = [];
    if (room.lastDiscard) {
      room.players.forEach((player, index) => {
        if (player.id !== socket.id) {
          const canWin = room.checkWin(player.id, false) !== null;
          const canKong = room.canKong(player.id);
          const canPong = room.canPong(player.id);
          const canChow = room.canChow(player.id);
          
          if (canWin || canKong || canPong || canChow) {
            stillCanClaim.push(player.id);
          }
        }
      });
    }
    
    // 如果没有人可以操作了，进入下一轮
    if (stillCanClaim.length === 0) {
      room.nextTurn();
      
      io.to(roomId).emit('next_turn', {
        currentPlayerIndex: room.currentPlayerIndex,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          handCount: p.hand.length,
          discarded: p.discarded,
          melds: p.melds
        }))
      });
    }
  });

  // 继续游戏（新一局）
  socket.on('continue_game', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: '房间不存在' });
      return;
    }
    
    if (room.players.length === 0 || room.players[0].id !== socket.id) {
      socket.emit('error', { message: '只有房主可以开始新一局' });
      return;
    }
    
    // 允许在有玩家离开的情况下继续游戏（只要至少还有1个玩家）
    if (room.players.length < 1) {
      socket.emit('error', { message: '房间中没有玩家' });
      return;
    }
    
    // 如果有玩家离开了，我们需要调整玩家索引
    // 但为了简化，我们要求至少2个玩家才能继续（或者可以允许继续）
    // 这里我们允许继续，即使玩家数量少于4
    
    if (!room.resetGame()) {
      socket.emit('error', { message: '无法重置游戏，玩家数量不足' });
      return;
    }
    
    // 向每个玩家发送各自的手牌（庄家可能已是14张）
    room.players.forEach((player, index) => {
      io.to(player.id).emit('game_started', {
        hand: player.hand,
        playerIndex: index,
        currentPlayerIndex: room.currentPlayerIndex,
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          handCount: p.hand.length,
          discarded: p.discarded,
          melds: p.melds,
          score: p.score
        })),
        wallCount: room.wall.length
      });
    });
    
    // 首轮：通知庄家无需摸牌，直接出牌
    const dealerId = room.players[room.currentPlayerIndex].id;
    io.to(dealerId).emit('can_play', { message: '首轮开始，请出牌' });
    
    console.log(`继续游戏: 房间 ${roomId}`);
  });

  // 主动退出房间
  socket.on('leave_room', (data) => {
    const { roomId } = data;
    const room = rooms.get(roomId);
    
    if (!room) return;
    
    const playerIndex = room.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) return;
    
    const wasInGame = room.gameStarted;
    room.removePlayer(socket.id);
    socket.leave(roomId);
    
    if (room.players.length === 0) {
      rooms.delete(roomId);
      console.log(`房间 ${roomId} 已清空`);
    } else {
      // 如果游戏正在进行，停止游戏并让其他玩家返回等待界面
      if (wasInGame) {
        room.gameStarted = false;
        room.lastDiscard = null;
        room.pendingClaim = null;
        room.currentPlayerIndex = 0;
        room.dealerIndex = 0;
      }
      
      io.to(roomId).emit('player_left', {
        playerId: socket.id,
        players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
        gameStopped: wasInGame // 标记游戏是否被停止
      });
    }
    
    console.log(`玩家退出房间: ${roomId}`);
  });

  // 断线处理
  socket.on('disconnect', () => {
    console.log('玩家断线:', socket.id);
    
    // 从所有房间中移除该玩家
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const wasInGame = room.gameStarted;
        room.removePlayer(socket.id);
        
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`房间 ${roomId} 已清空`);
        } else {
          // 如果游戏正在进行，停止游戏并让其他玩家返回等待界面
          if (wasInGame) {
            room.gameStarted = false;
            room.lastDiscard = null;
            room.pendingClaim = null;
            room.currentPlayerIndex = 0;
            room.dealerIndex = 0;
          }
          
          io.to(roomId).emit('player_left', {
            playerId: socket.id,
            players: room.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
            gameStopped: wasInGame // 标记游戏是否被停止
          });
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🀄 马来西亚麻将服务器启动成功！`);
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`📱 准备接受玩家连接...`);
});