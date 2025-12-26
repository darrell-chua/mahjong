// Socket.IO 连接（使用同源，避免不同环境下的连接问题）
const socket = io();

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
    hasDrawnThisTurn: false
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
    const discardedEl = opponentEl.querySelector('.opponent-discarded');
    
    nameEl.textContent = playerData.name;
    handCountEl.textContent = `🀄 × ${playerData.handCount}`;
    
    // 更新碰/杠显示
    if (meldsEl) {
        renderMelds(playerData.melds || [], meldsEl);
    }
    
    // 更新弃牌显示
    if (discardedEl) {
        discardedEl.innerHTML = '';
        (playerData.discarded || []).forEach(tile => {
            const tileEl = createTileElement(tile, 'tiny', false);
            discardedEl.appendChild(tileEl);
        });
    }
    
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
    console.log('已连接到服务器');
    gameState.playerId = socket.id;
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
    
    showScreen(waitingScreen);
    showToast('房间创建成功！');
});

socket.on('player_joined', (data) => {
    // 清空所有槽位
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`player-slot-${i}`);
        slot.classList.remove('filled');
        slot.querySelector('.player-name').textContent = '等待中...';
    }
    
    // 更新玩家列表
    data.players.forEach((player, index) => {
        const slot = document.getElementById(`player-slot-${index}`);
        slot.classList.add('filled');
        slot.querySelector('.player-name').textContent = player.name;
        slot.querySelector('.player-avatar').textContent = '👤';
    });
    
    // 启用开始按钮
    if (data.players.length === 4) {
        startGameBtn.disabled = false;
        startGameBtn.textContent = '开始游戏';
    } else {
        startGameBtn.disabled = true;
        startGameBtn.textContent = `开始游戏 (${data.players.length}/4)`;
    }
    
    showToast(`玩家加入，当前 ${data.players.length}/4 人`);
});

socket.on('player_left', (data) => {
    showToast('有玩家离开了房间');
    
    // 清空所有槽位
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`player-slot-${i}`);
        slot.classList.remove('filled');
        slot.querySelector('.player-name').textContent = '等待中...';
    }
    
    // 更新玩家列表
    data.players.forEach((player, index) => {
        const slot = document.getElementById(`player-slot-${index}`);
        slot.classList.add('filled');
        slot.querySelector('.player-name').textContent = player.name;
    });
});

socket.on('game_started', (data) => {
    gameState.hand = data.hand;
    gameState.playerIndex = data.playerIndex;
    gameState.currentPlayerIndex = data.currentPlayerIndex;
    gameState.players = data.players;
    
    document.getElementById('game-room-id').textContent = gameState.roomId;
    document.getElementById('player-name-display').textContent = gameState.playerName;
    document.getElementById('wall-count').textContent = data.wallCount;
    
    renderHand();
    updateGameState(data);
    
    showScreen(gameScreen);
    showToast('游戏开始！');
});

socket.on('tile_drawn', (data) => {
    gameState.hand.push(data.tile);
    renderHand();
    showToast('摸牌: ' + TILE_DISPLAY[data.tile]);
    
    // 隐藏摸牌按钮
    drawButtonContainer.style.display = 'none';
    // 本回合已摸牌，可出牌
    gameState.hasDrawnThisTurn = true;
    gameState.canPlayWithoutDraw = false;
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
    
    showToast(`${gameState.players[data.playerIndex].name} 打出 ${TILE_DISPLAY[data.tile]}`);
});

socket.on('can_claim', (data) => {
    gameState.canClaim = data;
    
    // 显示操作按钮
    actionButtons.style.display = 'flex';
    
    document.getElementById('btn-chow').style.display = data.canChow ? 'inline-block' : 'none';
    document.getElementById('btn-pong').style.display = data.canPong ? 'inline-block' : 'none';
    document.getElementById('btn-kong').style.display = data.canKong ? 'inline-block' : 'none';
    document.getElementById('btn-win').style.display = data.canWin ? 'inline-block' : 'none';
    
    // 设置超时自动过
    setTimeout(() => {
        if (actionButtons.style.display === 'flex') {
            socket.emit('pass', { roomId: gameState.roomId });
            actionButtons.style.display = 'none';
        }
    }, 10000); // 10秒超时
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
});

// 杠牌后摸牌的通知
socket.on('tile_drawn_after_kong', (data) => {
    showToast('杠牌后摸到：' + TILE_DISPLAY[data.tile]);
    // 杠后自动摸牌，允许直接出牌
    gameState.hasDrawnThisTurn = true;
    gameState.canPlayWithoutDraw = true;
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
    
    const roomId = generateRoomId();
    gameState.playerName = playerName;
    
    socket.emit('create_room', { roomId, playerName });
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
    
    gameState.playerName = playerName;
    gameState.roomId = roomId;
    currentRoomId.textContent = roomId;
    
    socket.emit('join_room', { roomId, playerName });
    showScreen(waitingScreen);
});

startGameBtn.addEventListener('click', () => {
    socket.emit('start_game', { roomId: gameState.roomId });
});

leaveRoomBtn.addEventListener('click', () => {
    window.location.reload();
});

document.getElementById('btn-draw').addEventListener('click', () => {
    socket.emit('draw_tile', { roomId: gameState.roomId });
});

document.getElementById('btn-chow').addEventListener('click', () => {
    // 简化处理：使用第一个可用的吃牌组合
    // 实际应该让玩家选择
    socket.emit('claim_chow', {
        roomId: gameState.roomId,
        combination: [] // 服务器会自动找到可用组合
    });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-pong').addEventListener('click', () => {
    socket.emit('claim_pong', { roomId: gameState.roomId });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-kong').addEventListener('click', () => {
    socket.emit('claim_kong', { roomId: gameState.roomId });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-win').addEventListener('click', () => {
    socket.emit('declare_win', {
        roomId: gameState.roomId,
        isSelfDraw: gameState.hand.length === 14
    });
    actionButtons.style.display = 'none';
});

document.getElementById('btn-pass').addEventListener('click', () => {
    socket.emit('pass', { roomId: gameState.roomId });
    actionButtons.style.display = 'none';
});

modalClose.addEventListener('click', () => {
    gameOverModal.classList.remove('active');
    window.location.reload(); // 重新加载页面
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