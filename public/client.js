// Socket.IO 连接（使用同源，避免不同环境下的连接问题）
// 添加连接配置，支持自动重连
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  timeout: 20000,
  transports: ['websocket', 'polling']
});

// 全局状态
let gameState = {
    roomId: null,
    playerName: null,
    playerId: null,
    playerIndex: null,
    hand: [],
    currentPlayerIndex: null,
    players: [],
    canClaim: null,
    selectedTile: null,
    // 当服务器发出 can_play（例如吃/碰/杠后）时，允许不摸直接出牌
    canPlayWithoutDraw: false,
    // 本回合是否已摸过牌（用于允许摸后出牌，即使手牌绝对数量不是14）
    hasDrawnThisTurn: false,
    // 操作超时定时器
    claimTimeout: null,
    // 是否可以暗杠
    canSelfKong: false,
    // 选择的游戏类型
    gameType: null // 'mahjong' 或 'uno'
};

// 麻将牌显示映射
const TILE_DISPLAY = {
    // 万
    '1w': '一萬', '2w': '二萬', '3w': '三萬', '4w': '四萬', '5w': '五萬',
    '6w': '六萬', '7w': '七萬', '8w': '八萬', '9w': '九萬',
    // 条
    '1t': '一条', '2t': '二条', '3t': '三条', '4t': '四条', '5t': '五条',
    '6t': '六条', '7t': '七条', '8t': '八条', '9t': '九条',
    // 筒
    '1b': '一筒', '2b': '二筒', '3b': '三筒', '4b': '四筒', '5b': '五筒',
    '6b': '六筒', '7b': '七筒', '8b': '八筒', '9b': '九筒',
    // 字牌
    'dong': '东', 'nan': '南', 'xi': '西', 'bei': '北',
    'zhong': '中', 'fa': '发', 'bai': '白'
};

// DOM 元素
const gameSelectionScreen = document.getElementById('game-selection-screen');
const loginScreen = document.getElementById('login-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');

const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');

const currentRoomId = document.getElementById('current-room-id');
const startGameBtn = document.getElementById('start-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');

const playerHand = document.getElementById('player-hand');
const playerMelds = document.getElementById('player-melds');
const actionButtons = document.getElementById('action-buttons');
const drawButtonContainer = document.getElementById('draw-button-container');

const gameOverModal = document.getElementById('game-over-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

// 工具函数
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// 显示右上角游戏通知（用于摸牌、弃牌等）
function showGameNotification(message, duration = 2000) {
    const notification = document.getElementById('game-notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getTileType(tile) {
    if (tile.endsWith('w')) return 'wan';
    if (tile.endsWith('t')) return 'tiao';
    if (tile.endsWith('b')) return 'tong';
    return 'honor';
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

function createTileElement(tile, size = 'normal', clickable = false) {
    const tileEl = document.createElement('div');
    tileEl.className = `tile ${size === 'small' ? 'small' : ''} ${size === 'tiny' ? 'tiny' : ''}`;
    tileEl.setAttribute('data-tile', tile);
    tileEl.setAttribute('data-type', getTileType(tile));
    tileEl.textContent = TILE_DISPLAY[tile] || tile;
    
    if (clickable) {
        tileEl.style.cursor = 'pointer';
        tileEl.addEventListener('click', () => onTileClick(tile, tileEl));
    }
    
    return tileEl;
}

function renderHand() {
    playerHand.innerHTML = '';
    gameState.hand = sortTiles(gameState.hand); // 使用新的排序函数
    
    gameState.hand.forEach(tile => {
        const tileEl = createTileElement(tile, 'normal', true);
        tileEl.classList.add('tile-appear');
        playerHand.appendChild(tileEl);
    });
}

function renderMelds(melds, container) {
    container.innerHTML = '';
    
    melds.forEach(meld => {
        const meldGroup = document.createElement('div');
        meldGroup.className = 'meld-group';
        
        meld.tiles.forEach(tile => {
            const tileEl = createTileElement(tile, 'small', false);
            meldGroup.appendChild(tileEl);
        });
        
        container.appendChild(meldGroup);
    });
}

function onTileClick(tile, tileEl) {
    // 检查是否轮到我出牌
    if (gameState.currentPlayerIndex !== gameState.playerIndex) {
        showToast('还没轮到你！');
        return;
    }
    
    // 允许两种出牌路径：
    // 1) 本回合已摸过牌（hasDrawnThisTurn = true）
    // 2) 吃/碰/杠后由服务器下发 can_play（canPlayWithoutDraw = true）
    if (!(gameState.hasDrawnThisTurn || gameState.canPlayWithoutDraw)) {
        showToast('请先摸牌！');
        return;
    }
    
    // 取消之前的选择
    document.querySelectorAll('.tile.selected').forEach(el => el.classList.remove('selected'));
    
    // 选择当前牌
    tileEl.classList.add('selected');
    gameState.selectedTile = tile;
    
    // 出牌
    setTimeout(() => {
        socket.emit('play_tile', {
            roomId: gameState.roomId,
            tile: tile
        });
        
        // 从手牌中移除
        const index = gameState.hand.indexOf(tile);
        if (index !== -1) {
            gameState.hand.splice(index, 1);
            renderHand();
        }
        
        gameState.selectedTile = null;
        // 一旦出牌，重置标记
        gameState.canPlayWithoutDraw = false;
        gameState.hasDrawnThisTurn = false;
        
        // 隐藏摸牌按钮
        drawButtonContainer.style.display = 'none';
    }, 200);
}

function updateOpponentDisplay(playerIndex, playerData) {
    const opponentIndex = (playerIndex - gameState.playerIndex + 4) % 4;
    if (opponentIndex === 0) return; // 跳过自己
    
    const opponentEl = document.getElementById(`opponent-${opponentIndex}`);
    if (!opponentEl) return;
    
    const nameEl = opponentEl.querySelector('.opponent-name');
    const handCountEl = opponentEl.querySelector('.opponent-hand-count');
    const meldsEl = opponentEl.querySelector('.opponent-melds');
    
    nameEl.textContent = playerData.name;
    handCountEl.textContent = `🀄 × ${playerData.handCount}`;
    
    // 更新碰/杠显示
    if (meldsEl) {
        renderMelds(playerData.melds || [], meldsEl);
    }
    
    // 不再显示其他玩家的弃牌（只显示在弃牌池中）
    
    // 高亮当前回合玩家
    if (gameState.currentPlayerIndex === playerIndex) {
        opponentEl.classList.add('current-turn');
    } else {
        opponentEl.classList.remove('current-turn');
    }
}

function updateGameState(data) {
    if (data.currentPlayerIndex !== undefined) {
        gameState.currentPlayerIndex = data.currentPlayerIndex;
    }
    
    if (data.players) {
        gameState.players = data.players;
        
        // 更新所有对手显示
        data.players.forEach((player, index) => {
            if (index !== gameState.playerIndex) {
                updateOpponentDisplay(index, player);
            }
        });
        
        // 更新当前回合显示
        const currentPlayerName = data.players[gameState.currentPlayerIndex].name;
        document.getElementById('current-turn-name').textContent = currentPlayerName;
        
        // 更新自己的碰杠显示
        if (gameState.playerIndex !== undefined) {
            const myData = data.players[gameState.playerIndex];
            if (myData.melds) {
                renderMelds(myData.melds, playerMelds);
            }
        }
    }
    
    if (data.wallCount !== undefined) {
        document.getElementById('wall-count').textContent = data.wallCount;
    }
    
    // 不在这里自动控制摸牌按钮，改由具体事件控制：
    // - next_turn 时（轮到我）显示摸牌按钮
    // - 吃/碰/杠后收到 can_play 时隐藏摸牌按钮，直接出牌
}

// Socket 事件监听
socket.on('connect', () => {
    console.log('✅ 已连接到服务器');
    console.log('Socket ID:', socket.id);
    gameState.playerId = socket.id;
    showToast('已连接到服务器', 2000);
});

socket.on('connect_error', (error) => {
    console.error('❌ 连接错误:', error);
    showToast('连接失败: ' + error.message, 5000);
    console.log('💡 提示: 请确保服务器正在运行 (npm start)');
});

socket.on('disconnect', (reason) => {
    console.warn('⚠️ 已断开连接:', reason);
    if (reason === 'io server disconnect') {
        // 服务器主动断开，需要手动重连
        socket.connect();
    }
    showToast('连接已断开: ' + reason, 3000);
});

socket.on('reconnect', (attemptNumber) => {
    console.log('✅ 重新连接成功 (尝试次数: ' + attemptNumber + ')');
    showToast('重新连接成功', 2000);
});

socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('🔄 正在尝试重新连接... (第 ' + attemptNumber + ' 次)');
});

socket.on('reconnect_error', (error) => {
    console.error('❌ 重连失败:', error);
});

socket.on('reconnect_failed', () => {
    console.error('❌ 重连失败，已达到最大尝试次数');
    showToast('无法连接到服务器，请刷新页面重试', 10000);
});

socket.on('error', (data) => {
    showToast('错误: ' + data.message);
});

socket.on('room_created', (data) => {
    gameState.roomId = data.roomId;
    currentRoomId.textContent = data.roomId;
    
    // 更新玩家列表
    data.players.forEach((player, index) => {
        const slot = document.getElementById(`player-slot-${index}`);
        slot.classList.add('filled');
        slot.querySelector('.player-name').textContent = player.name;
        slot.querySelector('.player-avatar').textContent = '👤';
    });
    
    // 清空房间号输入框，避免混淆
    roomIdInput.value = '';
    
    showScreen(waitingScreen);
    showToast('房间创建成功！房间号: ' + data.roomId);
});

socket.on('player_joined', (data) => {
    // 清空所有槽位
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`player-slot-${i}`);
        if (slot) {
            slot.classList.remove('filled');
            const nameEl = slot.querySelector('.player-name');
            if (nameEl) nameEl.textContent = '等待中...';
        }
    }
    
    // 更新玩家列表
    data.players.forEach((player, index) => {
        const slot = document.getElementById(`player-slot-${index}`);
        if (slot) {
            slot.classList.add('filled');
            const nameEl = slot.querySelector('.player-name');
            if (nameEl) nameEl.textContent = player.name;
        }
    });
    
    // 根据游戏类型更新开始按钮
    if (gameState.gameType === 'uno') {
        if (data.players.length >= 2 && data.players.length <= 5) {
            startGameBtn.disabled = false;
            startGameBtn.textContent = `开始游戏 (${data.players.length}/2-5)`;
        } else {
            startGameBtn.disabled = true;
            startGameBtn.textContent = `开始游戏 (${data.players.length}/2-5)`;
        }
    } else {
        if (data.players.length === 4) {
            startGameBtn.disabled = false;
            startGameBtn.textContent = '开始游戏';
        } else {
            startGameBtn.disabled = true;
            startGameBtn.textContent = `开始游戏 (${data.players.length}/4)`;
        }
    }
    
    showToast(`玩家加入，当前 ${data.players.length} 人`);
});

socket.on('player_left', (data) => {
    showToast('有玩家离开了房间');
    
    // 如果游戏正在进行且被停止，返回等待界面
    if (data.gameStopped && gameScreen.classList.contains('active')) {
        showScreen(waitingScreen);
        showToast('有玩家退出，游戏已停止，等待新玩家加入');
        
        // 重置游戏状态
        gameState.hand = [];
        gameState.canClaim = null;
        gameState.selectedTile = null;
        gameState.canPlayWithoutDraw = false;
        gameState.hasDrawnThisTurn = false;
        gameState.canSelfKong = false;
        
        // 清空手牌显示
        playerHand.innerHTML = '';
        playerMelds.innerHTML = '';
        
        // 清空弃牌池
        const poolTiles = document.querySelector('.pool-tiles');
        if (poolTiles) {
            poolTiles.innerHTML = '';
        }
        
        // 隐藏操作按钮
        actionButtons.style.display = 'none';
        drawButtonContainer.style.display = 'none';
        
        // 关闭游戏结束模态框（如果打开）
        if (gameOverModal.classList.contains('active')) {
            gameOverModal.classList.remove('active');
        }
    }
    
    // 更新游戏状态中的玩家列表
    gameState.players = data.players.map(p => ({
        id: p.id,
        name: p.name,
        handCount: 0,
        discarded: [],
        melds: [],
        score: p.score
    }));
    
    // 如果游戏结束模态框正在显示，更新按钮状态
    if (gameOverModal.classList.contains('active')) {
        const isHost = gameState.playerIndex === 0;
        const playerCount = data.players.length;
        
        // 更新按钮文本，显示当前玩家数量
        const continueBtn = document.getElementById('modal-continue');
        const closeBtn = document.getElementById('modal-close-new');
        
        if (continueBtn && isHost) {
            if (playerCount < 4) {
                continueBtn.textContent = `继续游戏 (${playerCount}/4)`;
                continueBtn.disabled = false; // 允许房主决定是否继续
            } else {
                continueBtn.textContent = '继续游戏';
                continueBtn.disabled = false;
            }
        }
        
        if (closeBtn && !isHost) {
            closeBtn.textContent = `等待房主继续 (${playerCount}/4)`;
        }
    }
    
    // 清空所有槽位
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`player-slot-${i}`);
        if (slot) {
            slot.classList.remove('filled');
            const nameEl = slot.querySelector('.player-name');
            if (nameEl) {
                nameEl.textContent = '等待中...';
            }
        }
    }
    
    // 更新玩家列表
    data.players.forEach((player, index) => {
        const slot = document.getElementById(`player-slot-${index}`);
        if (slot) {
            slot.classList.add('filled');
            const nameEl = slot.querySelector('.player-name');
            if (nameEl) {
                nameEl.textContent = player.name;
            }
        }
    });
    
    // 更新开始游戏按钮状态
    if (waitingScreen.classList.contains('active')) {
        if (data.players.length === 4) {
            startGameBtn.disabled = false;
            startGameBtn.textContent = '开始游戏';
        } else {
            startGameBtn.disabled = true;
            startGameBtn.textContent = `开始游戏 (${data.players.length}/4)`;
        }
    }
});

socket.on('game_started', (data) => {
    // 清空弃牌池
    const poolTiles = document.querySelector('.pool-tiles');
    if (poolTiles) {
        poolTiles.innerHTML = '';
    }
    
    // 检查是否是继续游戏（模态框是否显示）
    const isNewRound = gameOverModal.classList.contains('active');
    
    // 重置游戏状态
    gameState.hand = data.hand;
    gameState.playerIndex = data.playerIndex;
    gameState.currentPlayerIndex = data.currentPlayerIndex;
    gameState.players = data.players;
    gameState.canClaim = null;
    gameState.selectedTile = null;
    gameState.canPlayWithoutDraw = false;
    gameState.hasDrawnThisTurn = false;
    
    // 更新显示
    document.getElementById('game-room-id').textContent = gameState.roomId;
    document.getElementById('player-name-display').textContent = gameState.playerName;
    document.getElementById('wall-count').textContent = data.wallCount;
    
    renderHand();
    updateGameState(data);
    
    // 确保游戏界面显示
    showScreen(gameScreen);
    
    // 如果是新一局，关闭模态框并清理按钮
    if (isNewRound) {
        gameOverModal.classList.remove('active');
        // 清理动态添加的按钮
        const continueBtn = document.getElementById('modal-continue');
        const closeBtn = document.getElementById('modal-close-new');
        if (continueBtn) continueBtn.remove();
        if (closeBtn) closeBtn.remove();
        // 恢复原来的关闭按钮显示
        if (modalClose) {
            modalClose.style.display = 'inline-block';
        }
        showToast('新一局开始！');
    } else {
        showToast('游戏开始！');
    }
});

socket.on('tile_drawn', (data) => {
    gameState.hand.push(data.tile);
    renderHand();
    showGameNotification('摸牌: ' + TILE_DISPLAY[data.tile]);
    
    // 隐藏摸牌按钮
    drawButtonContainer.style.display = 'none';
    // 本回合已摸牌，可出牌
    gameState.hasDrawnThisTurn = true;
    gameState.canPlayWithoutDraw = false;
    
    // 如果可以自摸，显示胡牌按钮
    if (data.canSelfWin) {
        actionButtons.style.display = 'flex';
        document.getElementById('btn-chow').style.display = 'none';
        document.getElementById('btn-pong').style.display = 'none';
        document.getElementById('btn-kong').style.display = 'none';
        document.getElementById('btn-win').style.display = 'inline-block';
        document.getElementById('btn-pass').style.display = 'inline-block';
        showToast('可以自摸胡牌！');
    }
    // 如果可以暗杠，显示暗杠按钮（优先级低于胡）
    else if (data.canSelfKong) {
        actionButtons.style.display = 'flex';
        document.getElementById('btn-chow').style.display = 'none';
        document.getElementById('btn-pong').style.display = 'none';
        document.getElementById('btn-kong').style.display = 'none';
        document.getElementById('btn-win').style.display = 'none';
        document.getElementById('btn-pass').style.display = 'inline-block';
        // 标记这是暗杠模式
        gameState.canSelfKong = true;
        showToast('可以暗杠！');
    }
});

// 服务器通知可以自摸
socket.on('can_self_win', (data) => {
    if (data.canWin) {
        actionButtons.style.display = 'flex';
        document.getElementById('btn-chow').style.display = 'none';
        document.getElementById('btn-pong').style.display = 'none';
        document.getElementById('btn-kong').style.display = 'none';
        document.getElementById('btn-win').style.display = 'inline-block';
        document.getElementById('btn-pass').style.display = 'inline-block';
        showToast('可以自摸胡牌！');
    }
});

// 服务器通知可以暗杠
socket.on('can_self_kong', (data) => {
    if (data.canKong) {
        actionButtons.style.display = 'flex';
        document.getElementById('btn-chow').style.display = 'none';
        document.getElementById('btn-pong').style.display = 'none';
        document.getElementById('btn-kong').style.display = 'inline-block';
        document.getElementById('btn-kong').textContent = '暗杠';
        document.getElementById('btn-win').style.display = 'none';
        document.getElementById('btn-pass').style.display = 'inline-block';
        // 标记这是暗杠模式
        gameState.canSelfKong = true;
        showToast('可以暗杠！');
    }
});

socket.on('game_state', (data) => {
    updateGameState(data);
});

socket.on('tile_played', (data) => {
    // 显示弃牌到池中
    const poolTiles = document.querySelector('.pool-tiles');
    const tileEl = createTileElement(data.tile, 'small', false);
    tileEl.classList.add('tile-appear');
    poolTiles.appendChild(tileEl);
    
    showGameNotification(`${gameState.players[data.playerIndex].name} 打出 ${TILE_DISPLAY[data.tile]}`);
});

// 从弃牌池移除牌（当被碰/吃/杠时）
socket.on('tile_removed_from_pool', (data) => {
    const poolTiles = document.querySelector('.pool-tiles');
    if (!poolTiles) return;
    
    // 从后往前查找匹配的牌（因为被碰/吃/杠的总是最后打出的牌）
    const tiles = poolTiles.querySelectorAll('[data-tile]');
    for (let i = tiles.length - 1; i >= 0; i--) {
        if (tiles[i].getAttribute('data-tile') === data.tile) {
            tiles[i].remove();
            break; // 只移除第一张匹配的牌
        }
    }
});

socket.on('can_claim', (data) => {
    gameState.canClaim = data;
    
    // 显示操作按钮
    actionButtons.style.display = 'flex';
    
    document.getElementById('btn-chow').style.display = data.canChow ? 'inline-block' : 'none';
    document.getElementById('btn-pong').style.display = data.canPong ? 'inline-block' : 'none';
    document.getElementById('btn-kong').style.display = data.canKong ? 'inline-block' : 'none';
    document.getElementById('btn-kong').textContent = '杠'; // 明杠
    document.getElementById('btn-win').style.display = data.canWin ? 'inline-block' : 'none';
    document.getElementById('btn-pass').style.display = 'inline-block';
    
    // 重置暗杠标记（这是明杠场景）
    gameState.canSelfKong = false;
    
    // 设置超时自动过
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
    }
    gameState.claimTimeout = setTimeout(() => {
        if (actionButtons.style.display === 'flex') {
            socket.emit('pass', { roomId: gameState.roomId });
            actionButtons.style.display = 'none';
        }
    }, 10000); // 10秒超时
});

// 操作被取消的通知
socket.on('claim_cancelled', (data) => {
    // 清除超时
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
        gameState.claimTimeout = null;
    }
    
    // 隐藏操作按钮
    actionButtons.style.display = 'none';
    
    // 显示提示
    if (data.message) {
        showToast(data.message);
    }
});

socket.on('next_turn', (data) => {
    updateGameState(data);
    actionButtons.style.display = 'none';
    // 仅在自然进入下一回合时显示摸牌按钮（不是吃/碰/杠后的出牌回合）
    if (gameState.currentPlayerIndex === gameState.playerIndex) {
        drawButtonContainer.style.display = 'block';
    } else {
        drawButtonContainer.style.display = 'none';
    }
    // 进入新回合，需摸牌前不可直接出牌
    gameState.canPlayWithoutDraw = false;
    gameState.hasDrawnThisTurn = false;
    // 重置暗杠标记
    gameState.canSelfKong = false;
    document.getElementById('btn-kong').textContent = '杠';
});

socket.on('pong_claimed', (data) => {
    if (data.playerId === socket.id) {
        showToast('碰牌成功！请出牌');
    } else {
        showToast(`${gameState.players[data.playerIndex]?.name} 碰牌！`);
    }
    
    updateGameState({
        currentPlayerIndex: data.playerIndex,
        players: gameState.players
    });
    
    actionButtons.style.display = 'none';
    
    // 如果是自己碰牌，不显示摸牌按钮（直接出牌）
    if (data.playerId === socket.id) {
        drawButtonContainer.style.display = 'none';
        gameState.canPlayWithoutDraw = true;
    }
});

socket.on('chow_claimed', (data) => {
    if (data.playerId === socket.id) {
        renderHand();
        showToast('吃牌成功！请出牌');
    } else {
        showToast(`${gameState.players[data.playerIndex]?.name} 吃牌！`);
    }
    
    updateGameState({
        currentPlayerIndex: data.playerIndex,
        players: gameState.players
    });
    
    actionButtons.style.display = 'none';
    
    // 如果是自己吃牌，不显示摸牌按钮（直接出牌）
    if (data.playerId === socket.id) {
        drawButtonContainer.style.display = 'none';
        gameState.canPlayWithoutDraw = true;
    }
});

socket.on('kong_claimed', (data) => {
    if (data.playerId === socket.id) {
        renderHand();
        showToast('杠牌成功！已自动摸牌，请出牌');
    } else {
        showToast(`${gameState.players[data.playerIndex]?.name} 杠牌！`);
    }
    
    updateGameState({
        currentPlayerIndex: data.playerIndex,
        players: gameState.players
    });
    
    actionButtons.style.display = 'none';
    
    // 如果是自己杠牌，不显示摸牌按钮（已经自动摸牌了）
    if (data.playerId === socket.id) {
        drawButtonContainer.style.display = 'none';
        // 杠后服务器会自动摸一张，之后允许出牌
        gameState.canPlayWithoutDraw = true;
    }
    // 重置杠按钮文本
    document.getElementById('btn-kong').textContent = '杠';
});

// 暗杠成功
socket.on('self_kong_claimed', (data) => {
    if (data.playerId === socket.id) {
        renderHand();
        showToast('暗杠成功！已自动摸牌，请出牌');
    } else {
        showToast(`${gameState.players[data.playerIndex]?.name} 暗杠！`);
    }
    
    updateGameState({
        currentPlayerIndex: data.playerIndex,
        players: gameState.players
    });
    
    actionButtons.style.display = 'none';
    
    // 如果是自己暗杠，不显示摸牌按钮（已经自动摸牌了）
    if (data.playerId === socket.id) {
        drawButtonContainer.style.display = 'none';
        // 暗杠后服务器会自动摸一张，之后允许出牌
        gameState.canPlayWithoutDraw = true;
    }
    // 重置标记和按钮文本
    gameState.canSelfKong = false;
    document.getElementById('btn-kong').textContent = '杠';
});

// 杠牌后摸牌的通知
socket.on('tile_drawn_after_kong', (data) => {
    showGameNotification('杠牌后摸到：' + TILE_DISPLAY[data.tile]);
    // 杠后自动摸牌，允许直接出牌
    gameState.hasDrawnThisTurn = true;
    gameState.canPlayWithoutDraw = true;
    
    // 如果可以自摸，显示胡牌按钮
    if (data.canSelfWin) {
        actionButtons.style.display = 'flex';
        document.getElementById('btn-chow').style.display = 'none';
        document.getElementById('btn-pong').style.display = 'none';
        document.getElementById('btn-kong').style.display = 'none';
        document.getElementById('btn-win').style.display = 'inline-block';
        document.getElementById('btn-pass').style.display = 'inline-block';
        showToast('可以自摸胡牌！');
    }
});

// 服务器通知可以出牌
socket.on('can_play', (data) => {
    // 碰吃杠后的提示
    if (data.message) {
        console.log(data.message);
    }
    // 服务器要求出牌时，隐藏摸牌按钮
    drawButtonContainer.style.display = 'none';
    // 明确允许无需摸牌直接出牌
    gameState.canPlayWithoutDraw = true;
    // 该路径不是“自然摸牌”，不设置 hasDrawnThisTurn
});

socket.on('update_hand', (data) => {
    gameState.hand = data.hand;
    renderHand();
});

socket.on('game_over', (data) => {
    // 先移除之前可能绑定的事件监听器
    const oldContinueBtn = document.getElementById('modal-continue');
    const oldCloseBtn = document.getElementById('modal-close-new');
    if (oldContinueBtn) oldContinueBtn.remove();
    if (oldCloseBtn) oldCloseBtn.remove();
    
    if (data.type === 'win') {
        modalTitle.textContent = '🎉 ' + data.winnerName + ' 胡牌！';
        
        let bodyHTML = `<div style="margin: 20px 0;">`;
        bodyHTML += `<p style="color: var(--gold); font-size: 1.5rem; margin-bottom: 15px;">`;
        bodyHTML += data.isSelfDraw ? '自摸' : '点炮';
        bodyHTML += `</p>`;
        
        bodyHTML += `<p style="margin-bottom: 10px;">番型：</p>`;
        bodyHTML += `<p style="color: var(--gold); font-size: 1.2rem; margin-bottom: 15px;">`;
        bodyHTML += data.fan.types.join(' + ');
        bodyHTML += `</p>`;
        
        bodyHTML += `<p>番数: <span style="color: var(--gold); font-size: 1.5rem; font-weight: 700;">${data.fan.count}</span> 番</p>`;
        bodyHTML += `</div>`;
        
        // 显示手牌
        bodyHTML += `<div style="margin-top: 20px;">`;
        bodyHTML += `<p style="margin-bottom: 10px;">胡牌手牌：</p>`;
        bodyHTML += `<div style="display: flex; gap: 5px; flex-wrap: wrap; justify-content: center;">`;
        data.hand.forEach(tile => {
            bodyHTML += `<span style="background: #f5f5f5; color: #333; padding: 5px 10px; border-radius: 5px; font-size: 0.9rem;">${TILE_DISPLAY[tile]}</span>`;
        });
        bodyHTML += `</div></div>`;
        
        modalBody.innerHTML = bodyHTML;
    } else if (data.type === 'draw') {
        modalTitle.textContent = '流局';
        modalBody.innerHTML = `<p>${data.message}</p>`;
    }
    
    // 检查是否是房主（第一个玩家），如果是则显示"继续游戏"按钮
    const isHost = gameState.playerIndex === 0;
    
    // 添加按钮容器
    let buttonsHTML = `<div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">`;
    if (isHost) {
        buttonsHTML += `<button id="modal-continue" class="btn btn-primary">继续游戏</button>`;
        buttonsHTML += `<button id="modal-close-new" class="btn btn-secondary">退出游戏</button>`;
    } else {
        // 其他玩家显示"等待继续"按钮，让他们知道需要等待房主
        buttonsHTML += `<button id="modal-close-new" class="btn btn-primary">等待房主继续</button>`;
    }
    buttonsHTML += `</div>`;
    
    // 如果不是房主，添加等待提示
    if (!isHost) {
        buttonsHTML += `<p style="text-align: center; color: var(--text-secondary); margin-top: 15px; font-size: 0.9rem;">点击按钮关闭窗口，等待房主开始新一局</p>`;
    }
    
    modalBody.innerHTML += buttonsHTML;
    
    // 绑定继续游戏按钮事件（仅房主可见）
    const continueBtn = document.getElementById('modal-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', handleContinueGame);
    }
    
    // 绑定关闭按钮事件
    const closeBtn = document.getElementById('modal-close-new');
    if (closeBtn) {
        closeBtn.addEventListener('click', handleCloseModal);
    }
    
    // 隐藏原来的关闭按钮（如果存在）
    if (modalClose) {
        modalClose.style.display = 'none';
    }
    
    gameOverModal.classList.add('active');
    
    // 隐藏操作按钮
    actionButtons.style.display = 'none';
    drawButtonContainer.style.display = 'none';
});

// 按钮事件
createRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    
    if (!playerName) {
        showToast('请输入昵称！');
        return;
    }
    
    if (!gameState.gameType) {
        showToast('请先选择游戏！');
        return;
    }
    
    // 生成随机房间号（创建新房间总是使用新房间号）
    const roomId = generateRoomId();
    
    gameState.playerName = playerName;
    gameState.roomId = roomId;
    currentRoomId.textContent = roomId;
    
    // 清空房间号输入框
    roomIdInput.value = '';
    
    socket.emit('create_room', { roomId, playerName, gameType: gameState.gameType });
});

joinRoomBtn.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim().toUpperCase();
    
    if (!playerName) {
        showToast('请输入昵称！');
        return;
    }
    
    if (!roomId) {
        showToast('请输入房间号！');
        return;
    }
    
    if (roomId.length !== 6) {
        showToast('房间号必须是6位字符！');
        return;
    }
    
    gameState.playerName = playerName;
    gameState.roomId = roomId;
    currentRoomId.textContent = roomId;
    
    if (!gameState.gameType) {
        showToast('请先选择游戏！');
        return;
    }
    
    socket.emit('join_room', { roomId, playerName, gameType: gameState.gameType });
    showScreen(waitingScreen);
});

startGameBtn.addEventListener('click', () => {
    socket.emit('start_game', { roomId: gameState.roomId });
});

// UNO卡牌显示映射
const UNO_CARD_DISPLAY = {
    'red': '🔴',
    'yellow': '🟡',
    'green': '🟢',
    'blue': '🔵'
};

// UNO卡牌显示函数
function getUnoCardDisplay(cardStr) {
    const card = parseUnoCard(cardStr);
    if (!card) return cardStr;
    
    const colorEmoji = UNO_CARD_DISPLAY[card.color] || '';
    
    if (card.type === 'number') {
        return `${colorEmoji} ${card.value}`;
    } else if (card.type === 'action') {
        const actionText = {
            'skip': '跳过',
            'reverse': '反转',
            'draw2': '+2'
        };
        return `${colorEmoji} ${actionText[card.action] || card.action}`;
    } else if (card.type === 'wild') {
        if (card.action === 'wild_draw4') {
            return '🌈 +4';
        } else {
            return '🌈 变色';
        }
    }
    return cardStr;
}

// 解析UNO卡牌字符串
function parseUnoCard(cardStr) {
    const parts = cardStr.split('_');
    if (parts.length === 1) {
        // 万能牌
        return { type: 'wild', color: null, action: cardStr };
    } else if (parts.length === 2) {
        const [color, value] = parts;
        if (['skip', 'reverse', 'draw2'].includes(value)) {
            return { type: 'action', color, action: value };
        } else {
            return { type: 'number', color, value: parseInt(value) };
        }
    }
    return null;
}

// 创建UNO卡牌元素
function createUnoCardElement(cardStr, size = 'normal', clickable = false, isPlayable = false) {
    const cardEl = document.createElement('div');
    const card = parseUnoCard(cardStr);
    
    cardEl.className = `uno-card ${size === 'small' ? 'small' : ''} ${size === 'tiny' ? 'tiny' : ''}`;
    cardEl.setAttribute('data-card', cardStr);
    
    if (card) {
        if (card.color) {
            cardEl.classList.add(`uno-${card.color}`);
        } else {
            cardEl.classList.add('uno-wild');
        }
        
        if (isPlayable) {
            cardEl.classList.add('playable');
        }
    }
    
    cardEl.textContent = getUnoCardDisplay(cardStr);
    
    if (clickable) {
        cardEl.style.cursor = 'pointer';
        cardEl.addEventListener('click', () => onUnoCardClick(cardStr, cardEl));
    }
    
    return cardEl;
}

// UNO卡牌点击处理
function onUnoCardClick(cardStr, cardEl) {
    if (gameState.gameType !== 'uno') return;
    
    // 检查是否轮到我
    if (gameState.currentPlayerIndex !== gameState.playerIndex) {
        showToast('还没轮到你！');
        return;
    }
    
    const card = parseUnoCard(cardStr);
    if (!card) return;
    
    // 如果是万能牌，需要选择颜色
    if (card.type === 'wild') {
        showColorSelection(cardStr);
        return;
    }
    
    // 出牌
    socket.emit('play_tile', {
        roomId: gameState.roomId,
        tile: cardStr
    });
    
    // 从手牌中移除
    const index = gameState.hand.indexOf(cardStr);
    if (index !== -1) {
        gameState.hand.splice(index, 1);
        renderUnoHand();
    }
}

// 显示颜色选择界面（万能牌）
function showColorSelection(cardStr) {
    const colorModal = document.getElementById('uno-color-modal');
    if (!colorModal) {
        // 创建颜色选择模态框
        const modal = document.createElement('div');
        modal.id = 'uno-color-modal';
        modal.className = 'uno-color-modal';
        modal.innerHTML = `
            <div class="uno-color-modal-content">
                <h3>选择颜色</h3>
                <div class="uno-color-buttons">
                    <button class="uno-color-btn uno-red" data-color="red">🔴 红色</button>
                    <button class="uno-color-btn uno-yellow" data-color="yellow">🟡 黄色</button>
                    <button class="uno-color-btn uno-green" data-color="green">🟢 绿色</button>
                    <button class="uno-color-btn uno-blue" data-color="blue">🔵 蓝色</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // 绑定颜色选择事件
        modal.querySelectorAll('.uno-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.getAttribute('data-color');
                socket.emit('play_tile', {
                    roomId: gameState.roomId,
                    tile: cardStr,
                    wildColor: color
                });
                
                // 从手牌中移除
                const index = gameState.hand.indexOf(cardStr);
                if (index !== -1) {
                    gameState.hand.splice(index, 1);
                    renderUnoHand();
                }
                
                modal.remove();
            });
        });
    }
    
    const modal = document.getElementById('uno-color-modal');
    modal.classList.add('active');
}

// 渲染UNO手牌
function renderUnoHand() {
    playerHand.innerHTML = '';
    
    // 排序手牌：按颜色和类型
    const sortedHand = [...gameState.hand].sort((a, b) => {
        const cardA = parseUnoCard(a);
        const cardB = parseUnoCard(b);
        
        if (!cardA || !cardB) return 0;
        
        // 万能牌放最后
        if (cardA.type === 'wild' && cardB.type !== 'wild') return 1;
        if (cardA.type !== 'wild' && cardB.type === 'wild') return -1;
        
        // 同类型按颜色排序
        const colorOrder = { 'red': 1, 'yellow': 2, 'green': 3, 'blue': 4 };
        if (cardA.color && cardB.color) {
            if (colorOrder[cardA.color] !== colorOrder[cardB.color]) {
                return colorOrder[cardA.color] - colorOrder[cardB.color];
            }
        }
        
        // 同颜色按值排序
        if (cardA.value !== undefined && cardB.value !== undefined) {
            return cardA.value - cardB.value;
        }
        
        return 0;
    });
    
    sortedHand.forEach(cardStr => {
        const cardEl = createUnoCardElement(cardStr, 'normal', true, false);
        playerHand.appendChild(cardEl);
    });
}

// 更新可出牌状态
function updatePlayableCards(playableCards) {
    const cards = playerHand.querySelectorAll('.uno-card');
    cards.forEach(cardEl => {
        const cardStr = cardEl.getAttribute('data-card');
        if (playableCards.includes(cardStr)) {
            cardEl.classList.add('playable');
        } else {
            cardEl.classList.remove('playable');
        }
    });
}

// UNO游戏相关事件处理
socket.on('uno_game_started', (data) => {
    gameState.hand = data.hand;
    gameState.playerIndex = data.playerIndex;
    gameState.currentPlayerIndex = data.currentPlayerIndex;
    gameState.players = data.players;
    gameState.gameType = 'uno';
    
    // 更新显示
    document.getElementById('game-room-id').textContent = gameState.roomId;
    document.getElementById('player-name-display').textContent = gameState.playerName;
    document.getElementById('wall-count').textContent = data.deckCount;
    
    // 更新当前回合
    if (data.players[data.currentPlayerIndex]) {
        document.getElementById('current-turn-name').textContent = data.players[data.currentPlayerIndex].name;
    }
    
    // 渲染UNO手牌
    renderUnoHand();
    
    // 显示牌堆顶的牌
    const discardPool = document.querySelector('.pool-tiles');
    if (discardPool) {
        discardPool.innerHTML = '';
        const topCardEl = createUnoCardElement(data.topCard, 'normal', false);
        topCardEl.style.transform = 'scale(1.2)';
        discardPool.appendChild(topCardEl);
    }
    
    // 更新对手显示
    updateUnoOpponents(data.players, data.playerIndex);
    
    // 显示游戏界面
    showScreen(gameScreen);
    showToast('UNO游戏开始！');
    
    // 如果是当前玩家，显示操作提示
    if (data.currentPlayerIndex === data.playerIndex) {
        drawButtonContainer.style.display = 'block';
        // 等待服务器发送uno_can_play事件来更新可出牌状态
    } else {
        drawButtonContainer.style.display = 'none';
    }
});

socket.on('uno_can_play', (data) => {
    if (gameState.currentPlayerIndex === gameState.playerIndex) {
        updatePlayableCards(data.playableCards);
        
        if (data.mustDraw) {
            showToast('必须抽牌！');
            drawButtonContainer.style.display = 'block';
            // 禁用所有卡牌点击
            playerHand.querySelectorAll('.uno-card').forEach(card => {
                card.style.pointerEvents = 'none';
            });
        } else {
            drawButtonContainer.style.display = 'block';
            // 启用可出牌的点击
            playerHand.querySelectorAll('.uno-card').forEach(card => {
                card.style.pointerEvents = 'auto';
            });
        }
    }
});

socket.on('uno_card_played', (data) => {
    showToast(`${gameState.players[data.playerIndex]?.name} 出牌`);
    
    // 更新牌堆显示
    const discardPool = document.querySelector('.pool-tiles');
    if (discardPool) {
        discardPool.innerHTML = '';
        const topCardEl = createUnoCardElement(data.topCard, 'normal', false);
        topCardEl.style.transform = 'scale(1.2)';
        discardPool.appendChild(topCardEl);
    }
    
    // 显示当前颜色
    if (data.currentColor) {
        const colorEmoji = UNO_CARD_DISPLAY[data.currentColor] || '';
        showGameNotification(`当前颜色: ${colorEmoji} ${data.currentColor}`);
    }
});

socket.on('uno_card_drawn', (data) => {
    gameState.hand = data.hand;
    renderUnoHand();
    showToast('抽到 ' + data.cards.length + ' 张牌');
    
    // 等待服务器通知是否可以出牌
    // playableCards会在uno_can_play事件中更新
    // 如果抽牌后没有待抽取的牌，服务器会发送uno_can_play事件
});

socket.on('uno_hand_updated', (data) => {
    gameState.hand = data.hand;
    renderUnoHand();
});

socket.on('uno_game_state', (data) => {
    gameState.currentPlayerIndex = data.currentPlayerIndex;
    gameState.players = data.players;
    
    // 更新信息栏
    document.getElementById('wall-count').textContent = data.deckCount;
    if (data.players[data.currentPlayerIndex]) {
        document.getElementById('current-turn-name').textContent = data.players[data.currentPlayerIndex].name;
    }
    
    // 更新对手显示
    updateUnoOpponents(data.players, gameState.playerIndex);
    
    // 更新牌堆
    const discardPool = document.querySelector('.pool-tiles');
    if (discardPool && data.topCard) {
        discardPool.innerHTML = '';
        const topCardEl = createUnoCardElement(data.topCard, 'normal', false);
        topCardEl.style.transform = 'scale(1.2)';
        discardPool.appendChild(topCardEl);
    }
    
    // 显示当前颜色
    if (data.currentColor) {
        const colorEmoji = UNO_CARD_DISPLAY[data.currentColor] || '';
        // 可以在信息栏显示当前颜色
    }
    
    // 如果是当前玩家，显示操作提示
    if (data.currentPlayerIndex === gameState.playerIndex) {
        if (data.pendingDraw > 0) {
            showToast('必须抽牌！');
            drawButtonContainer.style.display = 'block';
        } else {
            drawButtonContainer.style.display = 'block';
        }
    } else {
        drawButtonContainer.style.display = 'none';
    }
});

socket.on('uno_game_over', (data) => {
    if (data.type === 'win') {
        modalTitle.textContent = '🎉 ' + data.winnerName + ' 获胜！';
        modalBody.innerHTML = `<p>${data.winnerName} 先出完所有手牌！</p>`;
        gameOverModal.classList.add('active');
    }
});

// 更新UNO对手显示
function updateUnoOpponents(players, myIndex) {
    players.forEach((player, index) => {
        if (index === myIndex) return;
        
        const opponentIndex = (index - myIndex + players.length) % players.length;
        const opponentEl = document.getElementById(`opponent-${opponentIndex}`);
        if (!opponentEl) return;
        
        const nameEl = opponentEl.querySelector('.opponent-name');
        const handCountEl = opponentEl.querySelector('.opponent-hand-count');
        
        if (nameEl) nameEl.textContent = player.name;
        if (handCountEl) handCountEl.textContent = `🃏 × ${player.handCount}`;
        
        // 高亮当前回合玩家
        if (gameState.currentPlayerIndex === index) {
            opponentEl.classList.add('current-turn');
        } else {
            opponentEl.classList.remove('current-turn');
        }
    });
}

leaveRoomBtn.addEventListener('click', () => {
    if (gameState.roomId) {
        socket.emit('leave_room', { roomId: gameState.roomId });
    }
    window.location.reload();
});

// 游戏界面退出按钮
if (leaveGameBtn) {
    leaveGameBtn.addEventListener('click', () => {
        if (confirm('确定要退出房间吗？')) {
            if (gameState.roomId) {
                socket.emit('leave_room', { roomId: gameState.roomId });
            }
            window.location.reload();
        }
    });
}

document.getElementById('btn-draw').addEventListener('click', () => {
    socket.emit('draw_tile', { roomId: gameState.roomId });
});

document.getElementById('btn-chow').addEventListener('click', () => {
    // 清除超时
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
        gameState.claimTimeout = null;
    }
    
    // 简化处理：使用第一个可用的吃牌组合
    // 实际应该让玩家选择
    socket.emit('claim_chow', {
        roomId: gameState.roomId,
        combination: [] // 服务器会自动找到可用组合
    });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-pong').addEventListener('click', () => {
    // 清除超时
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
        gameState.claimTimeout = null;
    }
    
    socket.emit('claim_pong', { roomId: gameState.roomId });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-kong').addEventListener('click', () => {
    // 清除超时
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
        gameState.claimTimeout = null;
    }
    
    // 判断是暗杠还是明杠
    if (gameState.canSelfKong) {
        // 暗杠：手牌4张相同牌
        socket.emit('claim_self_kong', { 
            roomId: gameState.roomId,
            tile: null // 服务器会自动找到可以暗杠的牌
        });
        gameState.canSelfKong = false; // 重置标记
    } else {
        // 明杠：杠别人打出的牌
        socket.emit('claim_kong', { roomId: gameState.roomId });
    }
    actionButtons.style.display = 'none';
});

document.getElementById('btn-win').addEventListener('click', () => {
    // 清除超时
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
        gameState.claimTimeout = null;
    }
    
    // 判断是自摸还是点炮
    // 如果是在摸牌后（hasDrawnThisTurn为true）或者手牌14张，则是自摸
    // 否则是点炮
    const isSelfDraw = gameState.hasDrawnThisTurn || gameState.hand.length === 14;
    
    socket.emit('declare_win', {
        roomId: gameState.roomId,
        isSelfDraw: isSelfDraw
    });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-pass').addEventListener('click', () => {
    // 清除超时
    if (gameState.claimTimeout) {
        clearTimeout(gameState.claimTimeout);
        gameState.claimTimeout = null;
    }
    
    socket.emit('pass', { roomId: gameState.roomId });
    actionButtons.style.display = 'none';
});

// 原有的关闭按钮，用于非房主玩家
modalClose.addEventListener('click', () => {
    gameOverModal.classList.remove('active');
    window.location.reload(); // 重新加载页面
});

// 防止重复绑定事件的处理函数
function handleContinueGame() {
    socket.emit('continue_game', { roomId: gameState.roomId });
    gameOverModal.classList.remove('active');
}

function handleCloseModal() {
    const isHost = gameState.playerIndex === 0;
    
    // 关闭模态框
    gameOverModal.classList.remove('active');
    
    if (isHost) {
        // 房主点击退出，重新加载页面（离开房间）
        window.location.reload();
    } else {
        // 其他玩家点击后，关闭模态框但保持在房间中，等待房主继续
        // 显示等待提示信息
        showToast('已关闭，等待房主继续游戏...');
        
        // 可以在这里添加一个等待界面提示（可选）
        // 或者保持游戏界面显示，只是隐藏了模态框
    }
}

// 处理继续游戏后的界面重置
socket.on('game_started', (data) => {
    // 清空弃牌池
    const poolTiles = document.querySelector('.pool-tiles');
    if (poolTiles) {
        poolTiles.innerHTML = '';
    }
    
    // 重置游戏状态
    gameState.hand = data.hand;
    gameState.playerIndex = data.playerIndex;
    gameState.currentPlayerIndex = data.currentPlayerIndex;
    gameState.players = data.players;
    gameState.canClaim = null;
    gameState.selectedTile = null;
    gameState.canPlayWithoutDraw = false;
    gameState.hasDrawnThisTurn = false;
    
    // 更新显示
    document.getElementById('game-room-id').textContent = gameState.roomId;
    document.getElementById('player-name-display').textContent = gameState.playerName;
    document.getElementById('wall-count').textContent = data.wallCount;
    
    renderHand();
    updateGameState(data);
    
    // 确保游戏界面显示
    showScreen(gameScreen);
    showToast('新一局开始！');
    
    // 隐藏模态框（如果还在显示）
    gameOverModal.classList.remove('active');
});

// 回车键快捷操作
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        createRoomBtn.click();
    }
});

roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomBtn.click();
    }
});

// 游戏选择相关
const gameSelectBtns = document.querySelectorAll('.game-select-btn');
const backToSelectionBtn = document.getElementById('back-to-selection-btn');
const selectedGameTitle = document.getElementById('selected-game-title');
const selectedGameSubtitle = document.getElementById('selected-game-subtitle');
const gameInstructionsList = document.getElementById('game-instructions-list');

// 游戏配置
const gameConfigs = {
    mahjong: {
        title: '🀄 马来西亚麻将',
        subtitle: '四人联机对战',
        instructions: [
            '4人对战，每人13张手牌',
            '支持吃、碰、杠、胡操作',
            '支持平胡、碰碰胡、清一色等番型',
            '轮流出牌，先胡牌者获胜'
        ]
    },
    uno: {
        title: '🃏 UNO',
        subtitle: '经典卡牌游戏',
        instructions: [
            '2-5人对战，每人7张手牌',
            '按颜色或数字出牌',
            '特殊功能牌：跳过、反转、+2、+4、变色',
            '先出完手牌者获胜'
        ]
    }
};

// 游戏选择按钮事件
gameSelectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const gameType = btn.getAttribute('data-game');
        gameState.gameType = gameType;
        
        // 更新登录界面内容
        const config = gameConfigs[gameType];
        if (config) {
            selectedGameTitle.textContent = config.title;
            selectedGameSubtitle.textContent = config.subtitle;
            
            // 更新游戏说明
            gameInstructionsList.innerHTML = '';
            config.instructions.forEach(instruction => {
                const li = document.createElement('li');
                li.textContent = instruction;
                gameInstructionsList.appendChild(li);
            });
        }
        
        // 切换到登录界面
        showScreen(loginScreen);
    });
});

// 返回选择界面
if (backToSelectionBtn) {
    backToSelectionBtn.addEventListener('click', () => {
        showScreen(gameSelectionScreen);
        // 清空输入
        playerNameInput.value = '';
        roomIdInput.value = '';
        gameState.gameType = null;
    });
}