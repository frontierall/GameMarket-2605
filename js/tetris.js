/**
 * 테트리스 게임 - 모듈화된 고성능 구현
 * 주요 기능: 7가지 테트로미노, 라인 클리어, 레벨 시스템, 유령 블록
 */

// 게임 설정
const CONFIG = {
    BOARD_WIDTH: 10,
    BOARD_HEIGHT: 20,
    BLOCK_SIZE: 30,
    INITIAL_FALL_SPEED: 800, // milliseconds
    SPEED_INCREASE: 50, // 레벨당 속도 증가
    LINES_PER_LEVEL: 10,
    COLORS: {
        I: '#00f5ff', // cyan
        O: '#ffff00', // yellow
        T: '#8a2be2', // purple
        S: '#00ff00', // green
        Z: '#ff0000', // red
        J: '#0000ff', // blue
        L: '#ffa500', // orange
        GHOST: 'rgba(255, 255, 255, 0.3)',
        GARBAGE: '#6b6b6b', // 방해 줄 (듀얼 모드)
        EMPTY: '#000000'
    }
};

// 테트로미노 정의 (SRS 표준 회전 시스템)
const TETROMINOS = {
    I: {
        shape: [
            [0, 0, 0, 0],
            [1, 1, 1, 1],
            [0, 0, 0, 0],
            [0, 0, 0, 0]
        ],
        color: CONFIG.COLORS.I
    },
    O: {
        shape: [
            [1, 1],
            [1, 1]
        ],
        color: CONFIG.COLORS.O
    },
    T: {
        shape: [
            [0, 1, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: CONFIG.COLORS.T
    },
    S: {
        shape: [
            [0, 1, 1],
            [1, 1, 0],
            [0, 0, 0]
        ],
        color: CONFIG.COLORS.S
    },
    Z: {
        shape: [
            [1, 1, 0],
            [0, 1, 1],
            [0, 0, 0]
        ],
        color: CONFIG.COLORS.Z
    },
    J: {
        shape: [
            [1, 0, 0],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: CONFIG.COLORS.J
    },
    L: {
        shape: [
            [0, 0, 1],
            [1, 1, 1],
            [0, 0, 0]
        ],
        color: CONFIG.COLORS.L
    }
};

// 게임 상태 관리
class GameState {
    constructor() {
        this.board = this.createEmptyBoard();
        this.currentPiece = null;
        this.nextPiece = null;
        this.ghostPiece = null;
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.isRunning = false;
        this.fallTimer = 0;
        this.lastTime = 0;
        this.pendingGarbage = 0; // 받을 방해 줄 수 (듀얼 모드)
    }

    createEmptyBoard() {
        return Array(CONFIG.BOARD_HEIGHT).fill().map(() =>
            Array(CONFIG.BOARD_WIDTH).fill(CONFIG.COLORS.EMPTY)
        );
    }

    reset() {
        this.board = this.createEmptyBoard();
        this.currentPiece = null;
        this.nextPiece = null;
        this.ghostPiece = null;
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.isGameOver = false;
        this.isPaused = false;
        this.isRunning = false;
        this.fallTimer = 0;
        this.lastTime = 0;
        this.pendingGarbage = 0; // 받을 방해 줄 수 (듀얼 모드)
    }
}

// 테트로미노 클래스
class Tetromino {
    constructor(type, x = 0, y = 0) {
        this.type = type;
        this.shape = TETROMINOS[type].shape;
        this.color = TETROMINOS[type].color;
        this.x = x;
        this.y = y;
        this.rotation = 0;
    }

    // 깊은 복사
    clone() {
        const clone = new Tetromino(this.type, this.x, this.y);
        clone.rotation = this.rotation;
        clone.shape = this.getCurrentShape();
        return clone;
    }

    // 현재 회전 상태의 모양 반환
    getCurrentShape() {
        let shape = TETROMINOS[this.type].shape;
        for (let i = 0; i < this.rotation; i++) {
            shape = this.rotateMatrix(shape);
        }
        return shape;
    }

    // 90도 시계방향 회전
    rotateMatrix(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = Array(cols).fill().map(() => Array(rows).fill(0));

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                rotated[j][rows - 1 - i] = matrix[i][j];
            }
        }
        return rotated;
    }

    // 회전 시도
    rotate() {
        this.rotation = (this.rotation + 1) % 4;
    }

    // 이동
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }
}

// 기본 옵션 (테트리스 단독 페이지 기준)
// 다른 페이지(예: 낙하 블록 듀얼)에서는 생성자 옵션으로 DOM 대상·키 매핑·콜백을 바꿔 재사용한다.
const DEFAULT_GAME_OPTIONS = {
    // 사용할 DOM 요소 id (없는 요소는 null로 두면 무시된다)
    ids: {
        board: 'gameBoard',
        next: 'nextPieceCanvas',
        score: 'score',
        level: 'level',
        lines: 'lines',
        best: 'bestScore',
        finalScore: 'finalScore',
        finalLines: 'finalLines',
        newBest: 'newBestMsg',
        startBtn: 'startBtn',
        pauseBtn: 'pauseBtn',
        restartBtn: 'restartBtn',
        gameOverScreen: 'gameOverScreen',
        pauseScreen: 'pauseScreen',
        touchControls: 'touchControls'
    },
    // KeyboardEvent.code → 동작
    keyMap: {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowDown: 'down',
        ArrowUp: 'rotate',
        Space: 'hardDrop',
        KeyP: 'pause'
    },
    // 키를 누르고 있을 때 자동 반복을 무시할 동작
    noRepeatActions: [],
    // 최고 점수 저장 키 (null이면 저장하지 않음)
    bestKey: 'gm_tetris_best',
    // 보드 제스처 + 온스크린 버튼 사용 여부
    touch: true,
    // 창이 포커스를 잃으면 자동 일시정지
    autoPauseOnBlur: true,
    // 콜백
    onLinesCleared: null, // (game, lineCount)
    onGameOver: null      // (game)
};

// 터치 제스처 설정
const TOUCH = {
    TAP_MAX_TIME: 250,        // 탭으로 인정하는 최대 시간(ms)
    TAP_MAX_MOVE: 10,         // 탭으로 인정하는 최대 이동(px)
    AXIS_LOCK: 12,            // 이 거리 이상 움직이면 가로/세로 방향 고정(px)
    SWIPE_MAX_TIME: 220,      // 하드 드롭 스와이프 최대 시간(ms)
    SWIPE_MIN_CELLS: 3,       // 하드 드롭 스와이프 최소 거리(칸)
    REPEAT_DELAY: 170,        // 버튼 길게 누를 때 반복 시작 지연(ms)
    REPEAT_INTERVAL: 50       // 버튼 반복 간격(ms)
};

// 메인 게임 클래스
class TetrisGame {
    constructor(options = {}) {
        this.options = Object.assign({}, DEFAULT_GAME_OPTIONS, options);
        this.state = new GameState();
        this.canvas = null;
        this.ctx = null;
        this.nextCanvas = null;
        this.nextCtx = null;
        this.animationId = null;
        this.bestScore = 0;

        // UI 요소들
        this.elements = {};

        this.init();
    }

    init() {
        const ids = this.options.ids;
        const byId = (id) => (id ? document.getElementById(id) : null);

        // Canvas 초기화
        this.canvas = byId(ids.board);
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = byId(ids.next);
        this.nextCtx = this.nextCanvas ? this.nextCanvas.getContext('2d') : null;

        // UI 요소 참조 저장 (없으면 null)
        this.elements = {};
        Object.keys(ids).forEach((name) => {
            if (name !== 'board' && name !== 'next') {
                this.elements[name] = byId(ids[name]);
            }
        });

        this.bestScore = this.loadBestScore();

        // 이벤트 리스너 등록
        this.setupEventListeners();
        if (this.options.touch) {
            this.setupTouchControls();
        }

        // 첫 게임 준비
        this.prepareNewGame();
        this.updateDisplay();
        this.render();
    }

    // 요소 표시/숨김 (요소가 없으면 무시)
    show(el) { if (el) el.classList.remove('hidden'); }
    hide(el) { if (el) el.classList.add('hidden'); }

    setupEventListeners() {
        // 키보드 이벤트
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));

        // 버튼 이벤트
        const { startBtn, pauseBtn, restartBtn, pauseScreen } = this.elements;
        if (startBtn) startBtn.addEventListener('click', () => this.startGame());
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());
        if (restartBtn) restartBtn.addEventListener('click', () => this.restartGame());
        // 일시정지 화면을 누르면 계속하기 (터치 기기용)
        if (pauseScreen) pauseScreen.addEventListener('click', () => {
            if (this.state.isPaused) this.togglePause();
        });

        // 포커스 이벤트 (게임이 백그라운드로 갈 때 자동 일시정지)
        if (this.options.autoPauseOnBlur) {
            window.addEventListener('blur', () => {
                if (this.state.isRunning && !this.state.isPaused) {
                    this.togglePause();
                }
            });
        }
    }

    // 키보드 입력 처리
    handleKeyPress(e) {
        if (!this.state.isRunning || this.state.isGameOver) return;

        const action = this.options.keyMap[e.code];
        if (!action) return;

        e.preventDefault();
        if (e.repeat && this.options.noRepeatActions.includes(action)) return;
        this.performAction(action);
    }

    // 동작 실행 (키보드·터치 공통)
    performAction(action) {
        if (action === 'pause') {
            this.togglePause();
            return;
        }
        if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;

        switch (action) {
            case 'left':
                this.movePiece(-1, 0);
                break;
            case 'right':
                this.movePiece(1, 0);
                break;
            case 'down':
                this.movePiece(0, 1);
                break;
            case 'rotate':
                this.rotatePiece();
                break;
            case 'hardDrop':
                this.hardDrop();
                break;
        }
    }

    // 터치 조작: 보드 제스처 + 온스크린 버튼
    setupTouchControls() {
        this.canvas.style.touchAction = 'none';

        let gesture = null;

        const cellSize = () => this.canvas.getBoundingClientRect().width / CONFIG.BOARD_WIDTH;

        this.canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return; // 마우스는 키보드 사용
            e.preventDefault();
            this.canvas.setPointerCapture(e.pointerId);
            gesture = {
                id: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                anchorX: e.clientX,
                anchorY: e.clientY,
                startTime: performance.now(),
                axis: null,
                moved: false
            };
        });

        this.canvas.addEventListener('pointermove', (e) => {
            if (!gesture || e.pointerId !== gesture.id) return;
            if (!this.state.isRunning || this.state.isPaused) return;

            const totalDx = e.clientX - gesture.startX;
            const totalDy = e.clientY - gesture.startY;

            // 방향 고정: 처음 크게 움직인 축으로만 조작
            if (!gesture.axis) {
                if (Math.abs(totalDx) < TOUCH.AXIS_LOCK && Math.abs(totalDy) < TOUCH.AXIS_LOCK) return;
                gesture.axis = Math.abs(totalDx) >= Math.abs(totalDy) ? 'x' : 'y';
            }

            const size = cellSize();
            if (gesture.axis === 'x') {
                // 좌우 드래그: 손가락이 한 칸 움직일 때마다 한 칸 이동
                let steps = Math.trunc((e.clientX - gesture.anchorX) / size);
                while (steps !== 0) {
                    this.performAction(steps > 0 ? 'right' : 'left');
                    gesture.anchorX += (steps > 0 ? 1 : -1) * size;
                    steps += steps > 0 ? -1 : 1;
                    gesture.moved = true;
                }
            } else {
                // 아래로 드래그: 소프트 드롭
                let steps = Math.trunc((e.clientY - gesture.anchorY) / size);
                while (steps > 0) {
                    this.performAction('down');
                    gesture.anchorY += size;
                    steps--;
                    gesture.moved = true;
                }
            }
            this.render();
        });

        const endGesture = (e) => {
            if (!gesture || e.pointerId !== gesture.id) return;
            const g = gesture;
            gesture = null;
            if (e.type === 'pointercancel') return;

            const dt = performance.now() - g.startTime;
            const dx = e.clientX - g.startX;
            const dy = e.clientY - g.startY;

            // 게임 시작 전이면 탭으로 시작
            if (!this.state.isRunning && !this.state.isGameOver) {
                if (dt < TOUCH.TAP_MAX_TIME * 2) this.startGame();
                return;
            }

            if (g.axis === 'y' && dt < TOUCH.SWIPE_MAX_TIME && dy > cellSize() * TOUCH.SWIPE_MIN_CELLS) {
                // 빠른 아래 스와이프: 하드 드롭
                this.performAction('hardDrop');
            } else if (!g.moved && dt < TOUCH.TAP_MAX_TIME &&
                       Math.abs(dx) < TOUCH.TAP_MAX_MOVE && Math.abs(dy) < TOUCH.TAP_MAX_MOVE) {
                // 탭: 회전
                this.performAction('rotate');
            }
            this.render();
        };
        this.canvas.addEventListener('pointerup', endGesture);
        this.canvas.addEventListener('pointercancel', endGesture);

        // 온스크린 버튼
        const pad = this.elements.touchControls;
        if (!pad) return;
        pad.style.touchAction = 'none';

        const repeatable = ['left', 'right', 'down'];
        pad.querySelectorAll('[data-action]').forEach((btn) => {
            const action = btn.dataset.action;
            let delayTimer = null;
            let repeatTimer = null;
            const stop = () => {
                clearTimeout(delayTimer);
                clearInterval(repeatTimer);
                delayTimer = repeatTimer = null;
                btn.classList.remove('pressed');
            };

            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault(); // 포커스·더블탭 확대 방지
                btn.classList.add('pressed');

                if (action === 'pause' && !this.state.isRunning) {
                    this.startGame(); // 게임 전/게임 오버 상태면 시작
                    return;
                }
                this.performAction(action);
                this.render();

                if (repeatable.includes(action)) {
                    delayTimer = setTimeout(() => {
                        repeatTimer = setInterval(() => {
                            this.performAction(action);
                            this.render();
                        }, TOUCH.REPEAT_INTERVAL);
                    }, TOUCH.REPEAT_DELAY);
                }
            });
            btn.addEventListener('pointerup', stop);
            btn.addEventListener('pointercancel', stop);
            btn.addEventListener('pointerleave', stop);
            btn.addEventListener('contextmenu', (e) => e.preventDefault());
        });
    }

    // 새 게임 준비
    prepareNewGame() {
        this.state.reset();
        this.state.nextPiece = this.generateRandomPiece();
        this.spawnNewPiece();
    }

    // 게임 시작
    startGame() {
        if (this.state.isGameOver) {
            this.prepareNewGame();
        }

        // 중복 루프 방지
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        this.state.isRunning = true;
        this.state.isPaused = false;
        this.state.lastTime = performance.now();

        // UI 업데이트
        this.hide(this.elements.startBtn);
        this.show(this.elements.pauseBtn);
        this.hide(this.elements.gameOverScreen);
        this.hide(this.elements.pauseScreen);

        this.gameLoop();
    }

    // 게임 재시작
    restartGame() {
        this.prepareNewGame();
        this.startGame();
    }

    // 게임 정지 (게임 오버 처리 없이 루프만 멈춤 — 듀얼에서 승자 보드 정지용)
    stop() {
        this.state.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.render();
    }

    // 일시정지 토글
    togglePause() {
        if (!this.state.isRunning || this.state.isGameOver) return;

        this.state.isPaused = !this.state.isPaused;

        if (this.state.isPaused) {
            this.show(this.elements.pauseScreen);
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        } else {
            this.hide(this.elements.pauseScreen);
            this.state.lastTime = performance.now();
            this.gameLoop();
        }
    }

    // 메인 게임 루프
    gameLoop(currentTime = performance.now()) {
        if (!this.state.isRunning || this.state.isPaused || this.state.isGameOver) return;

        const deltaTime = currentTime - this.state.lastTime;
        this.state.lastTime = currentTime;

        // 블록 낙하 처리
        this.state.fallTimer += deltaTime;
        const fallSpeed = Math.max(100, CONFIG.INITIAL_FALL_SPEED - (this.state.level - 1) * CONFIG.SPEED_INCREASE);

        if (this.state.fallTimer >= fallSpeed) {
            this.movePieceDown();
            this.state.fallTimer = 0;
        }

        this.render();
        if (!this.state.isRunning || this.state.isGameOver) return;
        this.animationId = requestAnimationFrame((time) => this.gameLoop(time));
    }

    // 랜덤 테트로미노 생성
    generateRandomPiece() {
        const types = Object.keys(TETROMINOS);
        const randomType = types[Math.floor(Math.random() * types.length)];
        const startX = Math.floor(CONFIG.BOARD_WIDTH / 2) - 1;
        return new Tetromino(randomType, startX, 0);
    }

    // 새 블록 생성
    spawnNewPiece() {
        this.state.currentPiece = this.state.nextPiece;
        this.state.nextPiece = this.generateRandomPiece();
        this.updateGhostPiece();

        // 게임 오버 체크
        if (!this.isValidPosition(this.state.currentPiece)) {
            this.gameOver();
        }
    }

    // 유령 블록 업데이트
    updateGhostPiece() {
        if (!this.state.currentPiece) return;

        this.state.ghostPiece = this.state.currentPiece.clone();

        // 가장 아래까지 내리기
        while (this.isValidPosition(this.state.ghostPiece, 0, 1)) {
            this.state.ghostPiece.move(0, 1);
        }
    }

    // 블록 이동
    movePiece(dx, dy) {
        if (!this.state.currentPiece) return;

        if (this.isValidPosition(this.state.currentPiece, dx, dy)) {
            this.state.currentPiece.move(dx, dy);
            this.updateGhostPiece();
            return true;
        }
        return false;
    }

    // 블록 아래로 이동
    movePieceDown() {
        if (!this.movePiece(0, 1)) {
            this.placePiece();
        }
    }

    // 블록 회전
    rotatePiece() {
        if (!this.state.currentPiece) return;

        const originalRotation = this.state.currentPiece.rotation;
        this.state.currentPiece.rotate();

        if (!this.isValidPosition(this.state.currentPiece)) {
            // 회전 실패시 원상복구
            this.state.currentPiece.rotation = originalRotation;
        } else {
            this.updateGhostPiece();
        }
    }

    // 하드 드롭 (즉시 바닥까지 떨어뜨리기)
    hardDrop() {
        if (!this.state.currentPiece) return;

        let dropDistance = 0;

        // 바닥까지 즉시 떨어뜨리기
        while (this.isValidPosition(this.state.currentPiece, 0, 1)) {
            this.state.currentPiece.move(0, 1);
            dropDistance++;
        }

        // 하드 드롭 보너스 점수 (떨어뜨린 거리 * 2)
        this.state.score += dropDistance * 2;
        this.updateDisplay();

        // 즉시 블록 고정
        this.placePiece();
    }

    // 유효한 위치인지 검사
    isValidPosition(piece, dx = 0, dy = 0) {
        const shape = piece.getCurrentShape();
        const newX = piece.x + dx;
        const newY = piece.y + dy;

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const boardX = newX + x;
                    const boardY = newY + y;

                    // 경계 체크
                    if (boardX < 0 || boardX >= CONFIG.BOARD_WIDTH ||
                        boardY >= CONFIG.BOARD_HEIGHT) {
                        return false;
                    }

                    // 기존 블록과 충돌 체크
                    if (boardY >= 0 && this.state.board[boardY][boardX] !== CONFIG.COLORS.EMPTY) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    // 블록을 보드에 고정
    placePiece() {
        const shape = this.state.currentPiece.getCurrentShape();

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const boardX = this.state.currentPiece.x + x;
                    const boardY = this.state.currentPiece.y + y;

                    if (boardY >= 0) {
                        this.state.board[boardY][boardX] = this.state.currentPiece.color;
                    }
                }
            }
        }

        // 라인 클리어 체크
        this.clearLines();

        // 대기 중인 방해 줄 반영 (단독 모드에서는 항상 0)
        this.applyPendingGarbage();
        if (this.state.isGameOver) return;

        // 새 블록 생성
        this.spawnNewPiece();
    }

    // 방해 줄 받기 (다음 블록이 고정될 때 바닥에서 올라온다)
    receiveGarbage(count) {
        if (count > 0) this.state.pendingGarbage += count;
    }

    // 대기 방해 줄 상쇄 (내가 줄을 지웠을 때) — 상쇄하고 남은 공격량 반환
    cancelGarbage(amount) {
        const cancelled = Math.min(amount, this.state.pendingGarbage);
        this.state.pendingGarbage -= cancelled;
        return amount - cancelled;
    }

    // 대기 중인 방해 줄을 보드 바닥에 삽입
    applyPendingGarbage() {
        const count = this.state.pendingGarbage;
        if (count <= 0) return;
        this.state.pendingGarbage = 0;

        // 한 번에 들어오는 방해 줄은 같은 열에 구멍 하나
        const hole = Math.floor(Math.random() * CONFIG.BOARD_WIDTH);
        let toppedOut = false;

        for (let i = 0; i < count; i++) {
            // 맨 윗줄을 밀어내고, 거기에 블록이 있었다면 꼭대기를 넘은 것
            const removed = this.state.board.shift();
            if (removed.some(cell => cell !== CONFIG.COLORS.EMPTY)) {
                toppedOut = true;
            }
            const row = Array(CONFIG.BOARD_WIDTH).fill(CONFIG.COLORS.GARBAGE);
            row[hole] = CONFIG.COLORS.EMPTY;
            this.state.board.push(row);
        }

        if (toppedOut) {
            this.gameOver();
        }
    }

    // 완성된 라인 제거
    clearLines() {
        const linesToClear = [];

        // 완성된 라인 찾기
        for (let y = 0; y < CONFIG.BOARD_HEIGHT; y++) {
            if (this.state.board[y].every(cell => cell !== CONFIG.COLORS.EMPTY)) {
                linesToClear.push(y);
            }
        }

        if (linesToClear.length === 0) return;

        // 라인 제거 및 점수 계산
        linesToClear.forEach(line => {
            this.state.board.splice(line, 1);
            this.state.board.unshift(Array(CONFIG.BOARD_WIDTH).fill(CONFIG.COLORS.EMPTY));
        });

        // 점수 및 레벨 업데이트
        this.updateScore(linesToClear.length);
        this.state.lines += linesToClear.length;

        // 레벨업 체크
        const newLevel = Math.floor(this.state.lines / CONFIG.LINES_PER_LEVEL) + 1;
        if (newLevel > this.state.level) {
            this.state.level = newLevel;
        }

        this.updateDisplay();

        if (typeof this.options.onLinesCleared === 'function') {
            this.options.onLinesCleared(this, linesToClear.length);
        }
    }

    // 점수 계산 (테트리스 표준 점수 시스템)
    updateScore(linesCleared) {
        const basePoints = [0, 40, 100, 300, 1200]; // 0, 1, 2, 3, 4라인
        this.state.score += basePoints[linesCleared] * this.state.level;
    }

    // 최고 점수 불러오기/저장 (localStorage를 못 쓰는 환경이면 0)
    loadBestScore() {
        if (!this.options.bestKey) return 0;
        try {
            return parseInt(localStorage.getItem(this.options.bestKey), 10) || 0;
        } catch (e) {
            return 0;
        }
    }

    saveBestScore() {
        if (!this.options.bestKey || this.state.score <= this.bestScore) return false;
        this.bestScore = this.state.score;
        try {
            localStorage.setItem(this.options.bestKey, String(this.bestScore));
        } catch (e) {
            // 저장 실패는 무시 (이번 세션 동안은 표시됨)
        }
        return true;
    }

    // 게임 오버
    gameOver() {
        if (this.state.isGameOver) return;
        this.state.isGameOver = true;
        this.state.isRunning = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        const isNewBest = this.saveBestScore();
        this.updateDisplay();
        this.render();

        // 최종 점수 표시
        const { finalScore, finalLines, newBest } = this.elements;
        if (finalScore) finalScore.textContent = this.state.score;
        if (finalLines) finalLines.textContent = this.state.lines;
        if (isNewBest) this.show(newBest); else this.hide(newBest);
        this.show(this.elements.gameOverScreen);
        this.hide(this.elements.pauseBtn);
        this.show(this.elements.startBtn);

        if (typeof this.options.onGameOver === 'function') {
            this.options.onGameOver(this);
        }
    }

    // 화면 렌더링
    render() {
        this.renderBoard();
        this.renderNextPiece();
    }

    // 게임 보드 렌더링
    renderBoard() {
        // 배경 클리어
        this.ctx.fillStyle = CONFIG.COLORS.EMPTY;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 보드 블록들 그리기
        for (let y = 0; y < CONFIG.BOARD_HEIGHT; y++) {
            for (let x = 0; x < CONFIG.BOARD_WIDTH; x++) {
                if (this.state.board[y][x] !== CONFIG.COLORS.EMPTY) {
                    this.drawBlock(x, y, this.state.board[y][x]);
                }
            }
        }

        // 유령 블록 그리기
        if (this.state.ghostPiece && this.state.currentPiece) {
            this.drawPiece(this.state.ghostPiece, CONFIG.COLORS.GHOST);
        }

        // 현재 블록 그리기
        if (this.state.currentPiece) {
            this.drawPiece(this.state.currentPiece, this.state.currentPiece.color);
        }
    }

    // 다음 블록 미리보기 렌더링
    renderNextPiece() {
        if (!this.nextCtx) return;

        // 배경 클리어
        this.nextCtx.fillStyle = CONFIG.COLORS.EMPTY;
        this.nextCtx.fillRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);

        if (this.state.nextPiece) {
            const shape = this.state.nextPiece.getCurrentShape();
            const blockSize = 20;
            const offsetX = (this.nextCanvas.width - shape[0].length * blockSize) / 2;
            const offsetY = (this.nextCanvas.height - shape.length * blockSize) / 2;

            for (let y = 0; y < shape.length; y++) {
                for (let x = 0; x < shape[y].length; x++) {
                    if (shape[y][x]) {
                        this.nextCtx.fillStyle = this.state.nextPiece.color;
                        this.nextCtx.fillRect(
                            offsetX + x * blockSize,
                            offsetY + y * blockSize,
                            blockSize - 1,
                            blockSize - 1
                        );
                    }
                }
            }
        }
    }

    // 테트로미노 그리기
    drawPiece(piece, color) {
        const shape = piece.getCurrentShape();

        for (let y = 0; y < shape.length; y++) {
            for (let x = 0; x < shape[y].length; x++) {
                if (shape[y][x]) {
                    const boardX = piece.x + x;
                    const boardY = piece.y + y;

                    if (boardY >= 0) {
                        this.drawBlock(boardX, boardY, color);
                    }
                }
            }
        }
    }

    // 개별 블록 그리기
    drawBlock(x, y, color) {
        const pixelX = x * CONFIG.BLOCK_SIZE;
        const pixelY = y * CONFIG.BLOCK_SIZE;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(pixelX, pixelY, CONFIG.BLOCK_SIZE - 1, CONFIG.BLOCK_SIZE - 1);

        // 블록에 하이라이트 효과 추가
        if (color !== CONFIG.COLORS.GHOST) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            this.ctx.fillRect(pixelX, pixelY, CONFIG.BLOCK_SIZE - 1, 2);
            this.ctx.fillRect(pixelX, pixelY, 2, CONFIG.BLOCK_SIZE - 1);
        }
    }

    // UI 표시 업데이트
    updateDisplay() {
        const { score, level, lines, best } = this.elements;
        if (score) score.textContent = this.state.score;
        if (level) level.textContent = this.state.level;
        if (lines) lines.textContent = this.state.lines;
        if (best) best.textContent = Math.max(this.bestScore, this.state.score);
    }
}

// 게임 초기화 (테트리스 단독 페이지에서만 자동 생성)
let game;

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById(DEFAULT_GAME_OPTIONS.ids.board)) {
        game = new TetrisGame();
    }
});
