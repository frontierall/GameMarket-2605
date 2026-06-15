// 게임 상태 관리
const gameState = {
    isRunning: false,
    isPaused: false,
    score: 0,
    highScore: localStorage.getItem('highScore') || 0,
    player: null,
    enemies: [],
    collectibles: [],
    keys: {},
    gameLoop: null,
    mouseX: 0,
    mouseY: 0
};

// DOM 요소
const elements = {
    gameCanvas: document.getElementById('gameCanvas'),
    startBtn: document.getElementById('startBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    restartBtn: document.getElementById('restartBtn'),
    scoreDisplay: document.getElementById('score'),
    highScoreDisplay: document.getElementById('highScore'),
    finalScoreDisplay: document.getElementById('finalScore'),
    gameOverScreen: document.getElementById('gameOverScreen')
};

// 게임 설정
const config = {
    playerSpeed: 5,
    enemySpeed: 2,
    enemySpawnRate: 2000, // 밀리초
    collectibleSpawnRate: 3000,
    canvasWidth: 0,
    canvasHeight: 0
};

// 초기화
function init() {
    config.canvasWidth = elements.gameCanvas.offsetWidth;
    config.canvasHeight = elements.gameCanvas.offsetHeight;

    elements.highScoreDisplay.textContent = gameState.highScore;

    // 이벤트 리스너
    elements.startBtn.addEventListener('click', startGame);
    elements.pauseBtn.addEventListener('click', togglePause);
    elements.restartBtn.addEventListener('click', restartGame);

    // 키보드 이벤트
    document.addEventListener('keydown', (e) => {
        gameState.keys[e.key] = true;
        // 스페이스바로 일시정지
        if (e.key === ' ' && gameState.isRunning) {
            e.preventDefault();
            togglePause();
        }
    });

    document.addEventListener('keyup', (e) => {
        gameState.keys[e.key] = false;
    });

    // 마우스 이벤트
    elements.gameCanvas.addEventListener('mousemove', (e) => {
        const rect = elements.gameCanvas.getBoundingClientRect();
        gameState.mouseX = e.clientX - rect.left;
        gameState.mouseY = e.clientY - rect.top;
    });
}

// 플레이어 생성
function createPlayer() {
    const player = document.createElement('div');
    player.className = 'game-object player';
    player.style.left = '50%';
    player.style.top = '50%';
    elements.gameCanvas.appendChild(player);

    return {
        element: player,
        x: config.canvasWidth / 2,
        y: config.canvasHeight / 2,
        width: 35,
        height: 35
    };
}

// 적 생성
function createEnemy() {
    const enemy = document.createElement('div');
    enemy.className = 'game-object enemy';

    // 랜덤 위치 (화면 가장자리에서 스폰)
    const side = Math.floor(Math.random() * 4);
    let x, y;

    switch(side) {
        case 0: x = Math.random() * config.canvasWidth; y = -40; break; // 위
        case 1: x = config.canvasWidth + 40; y = Math.random() * config.canvasHeight; break; // 오른쪽
        case 2: x = Math.random() * config.canvasWidth; y = config.canvasHeight + 40; break; // 아래
        case 3: x = -40; y = Math.random() * config.canvasHeight; break; // 왼쪽
    }

    enemy.style.left = x + 'px';
    enemy.style.top = y + 'px';
    elements.gameCanvas.appendChild(enemy);

    return {
        element: enemy,
        x: x,
        y: y,
        width: 40,
        height: 40
    };
}

// 수집 아이템 생성
function createCollectible() {
    const collectible = document.createElement('div');
    collectible.className = 'game-object collectible';

    const x = Math.random() * (config.canvasWidth - 30);
    const y = Math.random() * (config.canvasHeight - 30);

    collectible.style.left = x + 'px';
    collectible.style.top = y + 'px';
    elements.gameCanvas.appendChild(collectible);

    return {
        element: collectible,
        x: x,
        y: y,
        width: 30,
        height: 30
    };
}

// 플레이어 이동
function updatePlayer() {
    const player = gameState.player;

    // 마우스 위치로 이동 (플레이어 중심이 마우스 커서를 따라가도록)
    const targetX = gameState.mouseX - player.width / 2;
    const targetY = gameState.mouseY - player.height / 2;

    // 경계 체크
    player.x = Math.max(0, Math.min(config.canvasWidth - player.width, targetX));
    player.y = Math.max(0, Math.min(config.canvasHeight - player.height, targetY));

    player.element.style.left = player.x + 'px';
    player.element.style.top = player.y + 'px';
}

// 적 이동 (플레이어를 향해)
function updateEnemies() {
    const player = gameState.player;

    gameState.enemies.forEach((enemy, index) => {
        // 플레이어 방향으로 이동
        const dx = player.x - enemy.x;
        const dy = player.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0) {
            enemy.x += (dx / distance) * config.enemySpeed;
            enemy.y += (dy / distance) * config.enemySpeed;

            enemy.element.style.left = enemy.x + 'px';
            enemy.element.style.top = enemy.y + 'px';
        }

        // 충돌 감지
        if (checkCollision(player, enemy)) {
            gameOver();
        }
    });
}

// 수집 아이템 확인
function updateCollectibles() {
    const player = gameState.player;

    gameState.collectibles.forEach((collectible, index) => {
        if (checkCollision(player, collectible)) {
            // 점수 증가
            gameState.score += 10;
            elements.scoreDisplay.textContent = gameState.score;

            // 아이템 제거
            collectible.element.remove();
            gameState.collectibles.splice(index, 1);
        }
    });
}

// 충돌 감지
function checkCollision(obj1, obj2) {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
}

// 게임 루프
function gameLoop() {
    if (!gameState.isRunning || gameState.isPaused) return;

    updatePlayer();
    updateEnemies();
    updateCollectibles();

    requestAnimationFrame(gameLoop);
}

// 게임 시작
function startGame() {
    gameState.isRunning = true;
    gameState.score = 0;
    gameState.enemies = [];
    gameState.collectibles = [];

    elements.scoreDisplay.textContent = 0;
    elements.gameCanvas.innerHTML = '';
    elements.startBtn.classList.add('hidden');
    elements.pauseBtn.classList.remove('hidden');
    elements.gameOverScreen.classList.add('hidden');

    // 플레이어 생성
    gameState.player = createPlayer();

    // 적 생성 타이머
    const enemyInterval = setInterval(() => {
        if (!gameState.isRunning) {
            clearInterval(enemyInterval);
            return;
        }
        gameState.enemies.push(createEnemy());
    }, config.enemySpawnRate);

    // 수집 아이템 생성 타이머
    const collectibleInterval = setInterval(() => {
        if (!gameState.isRunning) {
            clearInterval(collectibleInterval);
            return;
        }
        gameState.collectibles.push(createCollectible());
    }, config.collectibleSpawnRate);

    // 게임 루프 시작
    gameLoop();
}

// 일시정지 토글
function togglePause() {
    gameState.isPaused = !gameState.isPaused;
    elements.pauseBtn.textContent = gameState.isPaused ? '계속하기' : '일시정지';

    if (!gameState.isPaused) {
        gameLoop();
    }
}

// 게임 오버
function gameOver() {
    gameState.isRunning = false;

    // 최고 점수 업데이트
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('highScore', gameState.highScore);
        elements.highScoreDisplay.textContent = gameState.highScore;
    }

    elements.finalScoreDisplay.textContent = gameState.score;
    elements.gameOverScreen.classList.remove('hidden');
    elements.pauseBtn.classList.add('hidden');
}

// 게임 재시작
function restartGame() {
    startGame();
}

// 페이지 로드 시 초기화
window.addEventListener('load', init);
