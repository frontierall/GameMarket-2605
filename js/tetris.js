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

// 메인 게임 클래스
class TetrisGame {
    constructor() {
        this.state = new GameState();
        this.canvas = null;
        this.ctx = null;
        this.nextCanvas = null;
        this.nextCtx = null;
        this.animationId = null;

        // UI 요소들
        this.elements = {};

        this.init();
    }

    init() {
        // Canvas 초기화
        this.canvas = document.getElementById('gameBoard');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('nextPieceCanvas');
        this.nextCtx = this.nextCanvas.getContext('2d');

        // UI 요소 참조 저장
        this.elements = {
            score: document.getElementById('score'),
            level: document.getElementById('level'),
            lines: document.getElementById('lines'),
            finalScore: document.getElementById('finalScore'),
            finalLines: document.getElementById('finalLines'),
            startBtn: document.getElementById('startBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            restartBtn: document.getElementById('restartBtn'),
            gameOverScreen: document.getElementById('gameOverScreen'),
            pauseScreen: document.getElementById('pauseScreen')
        };

        // 이벤트 리스너 등록
        this.setupEventListeners();

        // 첫 게임 준비
        this.prepareNewGame();
        this.updateDisplay();
    }

    setupEventListeners() {
        // 키보드 이벤트
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));

        // 버튼 이벤트
        this.elements.startBtn.addEventListener('click', () => this.startGame());
        this.elements.pauseBtn.addEventListener('click', () => this.togglePause());
        this.elements.restartBtn.addEventListener('click', () => this.restartGame());

        // 포커스 이벤트 (게임이 백그라운드로 갈 때 자동 일시정지)
        window.addEventListener('blur', () => {
            if (this.state.isRunning && !this.state.isPaused) {
                this.togglePause();
            }
        });
    }

    // 키보드 입력 처리
    handleKeyPress(e) {
        if (!this.state.isRunning || this.state.isGameOver) return;

        switch (e.code) {
            case 'ArrowLeft':
                e.preventDefault();
                this.movePiece(-1, 0);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.movePiece(1, 0);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.movePiece(0, 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.rotatePiece();
                break;
            case 'Space':
                e.preventDefault();
                this.hardDrop();
                break;
            case 'KeyP':
                e.preventDefault();
                this.togglePause();
                break;
        }
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

        this.state.isRunning = true;
        this.state.isPaused = false;
        this.state.lastTime = performance.now();

        // UI 업데이트
        this.elements.startBtn.classList.add('hidden');
        this.elements.pauseBtn.classList.remove('hidden');
        this.elements.gameOverScreen.classList.add('hidden');
        this.elements.pauseScreen.classList.add('hidden');

        this.gameLoop();
    }

    // 게임 재시작
    restartGame() {
        this.prepareNewGame();
        this.startGame();
    }

    // 일시정지 토글
    togglePause() {
        if (!this.state.isRunning || this.state.isGameOver) return;

        this.state.isPaused = !this.state.isPaused;

        if (this.state.isPaused) {
            this.elements.pauseScreen.classList.remove('hidden');
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        } else {
            this.elements.pauseScreen.classList.add('hidden');
            this.state.lastTime = performance.now();
            this.gameLoop();
        }
    }

    // 메인 게임 루프
    gameLoop(currentTime = performance.now()) {
        if (this.state.isPaused || this.state.isGameOver) return;

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

        // 새 블록 생성
        this.spawnNewPiece();
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
    }

    // 점수 계산 (테트리스 표준 점수 시스템)
    updateScore(linesCleared) {
        const basePoints = [0, 40, 100, 300, 1200]; // 0, 1, 2, 3, 4라인
        this.state.score += basePoints[linesCleared] * this.state.level;
    }

    // 게임 오버
    gameOver() {
        this.state.isGameOver = true;
        this.state.isRunning = false;

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // 최종 점수 표시
        this.elements.finalScore.textContent = this.state.score;
        this.elements.finalLines.textContent = this.state.lines;
        this.elements.gameOverScreen.classList.remove('hidden');
        this.elements.pauseBtn.classList.add('hidden');
        this.elements.startBtn.classList.remove('hidden');
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
        this.elements.score.textContent = this.state.score;
        this.elements.level.textContent = this.state.level;
        this.elements.lines.textContent = this.state.lines;
    }
}

// 게임 초기화
let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new TetrisGame();
});