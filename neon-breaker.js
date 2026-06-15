// NEON BREAKER - Game Code

// --- Audio Synthesizer (Web Audio API) ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    }

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // Oscillator utility
    playTone(freqStart, freqEnd, type, duration, volumeStart = 0.1, volumeEnd = 0) {
        if (!this.ctx || this.muted) return;
        this.resume();

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
        if (freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
        }

        gainNode.gain.setValueAtTime(volumeStart, this.ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(volumeEnd, this.ctx.currentTime + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playPaddleBounce() {
        // High pitch short blip
        this.playTone(300, 450, 'triangle', 0.12, 0.25, 0.01);
    }

    playWallBounce() {
        // Mid pitch short blip
        this.playTone(250, 250, 'triangle', 0.08, 0.2, 0.01);
    }

    playBrickDestroy(brickType) {
        // Different sounds based on brick type
        switch (brickType) {
            case 4: // Explosive
                this.playTone(180, 40, 'sawtooth', 0.4, 0.4, 0.01);
                this.playTone(100, 30, 'triangle', 0.5, 0.5, 0.01);
                break;
            case 3: // Tough Purple
                this.playTone(400, 200, 'square', 0.15, 0.2, 0.01);
                break;
            case 2: // Medium Magenta
                this.playTone(480, 280, 'square', 0.12, 0.18, 0.01);
                break;
            default: // Basic / Gold / Shield
                this.playTone(550, 350, 'sine', 0.1, 0.15, 0.01);
                break;
        }
    }

    playPowerUpCollect() {
        // Rising synth chime
        const now = this.ctx ? this.ctx.currentTime : 0;
        this.playTone(330, 660, 'sine', 0.3, 0.25, 0.01);
        setTimeout(() => {
            this.playTone(440, 880, 'sine', 0.3, 0.25, 0.01);
        }, 80);
    }

    playLaserFire() {
        // Downward zap sound
        this.playTone(800, 200, 'sawtooth', 0.15, 0.12, 0.01);
    }

    playLoseLife() {
        // Descending sad tone
        this.playTone(300, 100, 'sawtooth', 0.4, 0.3, 0.01);
    }

    playLevelStart() {
        // Futuristic start melody
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, freq * 1.05, 'sine', 0.25, 0.2, 0.02);
            }, idx * 100);
        });
    }

    playGameOver() {
        // Dramatic low falling note
        this.playTone(150, 40, 'sawtooth', 0.8, 0.4, 0.01);
        setTimeout(() => {
            this.playTone(110, 30, 'square', 1.0, 0.4, 0.01);
        }, 200);
    }

    playGameWin() {
        // Retro win fanfare
        const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, freq, 'sine', 0.15, 0.25, 0.02);
            }, idx * 120);
        });
    }
}

const sounds = new SoundManager();

// --- Game Engine Setup ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game states
const STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    LEVEL_INTRO: 'level_intro',
    GAMEOVER: 'gameover',
    GAMEWIN: 'gamewin'
};
let gameState = STATES.MENU;

// High Score List (localStorage key)
const STORAGE_KEY = 'neon_breaker_high_scores';

// HUD references
const scoreValEl = document.getElementById('score-val');
const levelValEl = document.getElementById('level-val');
const livesContainer = document.getElementById('lives-container');
const activePowerupsEl = document.getElementById('active-powerups');
const levelAnnouncer = document.getElementById('level-announcer');
const levelAnnouncerText = document.getElementById('level-announcer-text');

// Menu Overlay elements
const menus = {
    start: document.getElementById('start-menu'),
    how: document.getElementById('how-to-play-menu'),
    scores: document.getElementById('leaderboard-menu'),
    gameover: document.getElementById('game-over-menu'),
    gamewin: document.getElementById('game-win-menu'),
    pause: document.getElementById('pause-menu')
};

// --- Game Variables ---
let score = 0;
let level = 1;
let lives = 3;
let baseSpeed = 4.5;
let isBallAttached = true;
let isSpacePressed = false;
let screenShake = { duration: 0, intensity: 0 };

// Controls Input mapping
const keys = {
    ArrowLeft: false,
    ArrowRight: false,
    KeyA: false,
    KeyD: false
};

// Powerups Config
const POWERUPS = {
    MULTIBALL: { code: 'M', color: '#39ff14', name: 'MULTIBALL' },
    LASER: { code: 'L', color: '#ff007f', name: 'LASER' },
    WIDE: { code: 'W', color: '#00f0ff', name: 'WIDE PADDLE' },
    SHIELD: { code: 'S', color: '#fff000', name: 'SHIELD' },
    SLOW: { code: 'SL', color: '#9d00ff', name: 'SLOW BALL' }
};

let activePowerupTimers = {
    LASER: 0,
    WIDE: 0,
    SLOW: 0
};
const POWERUP_DURATION = 8000; // 8 seconds

let paddleShieldActive = false;

// Entities lists
let paddle = {
    x: 340,
    y: 550,
    width: 120,
    height: 16,
    speed: 8,
    targetWidth: 120,
    glow: 15
};

let balls = []; // Can contain multiple ball objects
let bricks = [];
let particles = [];
let powerups = [];
let projectiles = [];

// Level Data Map definitions
// Bricks: 0 = empty, 1 = Cyan (1 hit), 2 = Magenta (2 hits), 3 = Purple (3 hits), 4 = Red Explosive, 5 = Gold (Power-up guarantee), 9 = Armored Gray (Unbreakable)
const LEVELS = [
    // Level 1: Simple Neon rows
    [
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
        [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0],
        [0, 1, 1, 1, 1, 5, 1, 1, 5, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    ],
    // Level 2: Pyramid with explosives
    [
        [0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 3, 3, 2, 2, 3, 3, 0, 0, 0, 0],
        [0, 0, 1, 1, 2, 5, 4, 4, 5, 2, 1, 1, 0, 0],
        [0, 1, 2, 3, 4, 2, 1, 1, 2, 4, 3, 2, 1, 0],
        [0, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0]
    ],
    // Level 3: Space Shield (V-Shape armored and explosive)
    [
        [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9],
        [0, 4, 3, 3, 2, 2, 1, 1, 2, 2, 3, 3, 4, 0],
        [0, 9, 4, 5, 3, 3, 2, 2, 3, 3, 5, 4, 9, 0],
        [0, 0, 9, 4, 5, 2, 1, 1, 2, 5, 4, 9, 0, 0],
        [0, 0, 0, 9, 9, 4, 5, 5, 4, 9, 9, 0, 0, 0]
    ],
    // Level 4: The Neon Fortress (Hard)
    [
        [9, 9, 9, 9, 9, 0, 0, 0, 0, 9, 9, 9, 9, 9],
        [4, 3, 3, 3, 4, 0, 5, 5, 0, 4, 3, 3, 3, 4],
        [2, 2, 4, 2, 2, 9, 9, 9, 9, 2, 2, 4, 2, 2],
        [1, 1, 1, 1, 1, 4, 2, 2, 4, 1, 1, 1, 1, 1],
        [5, 4, 5, 4, 5, 0, 4, 4, 0, 5, 4, 5, 4, 5]
    ]
];

// Brick Grid Parameters
const BRICK_COLS = 14;
const BRICK_HEIGHT = 22;
const BRICK_PADDING = 5;
const BRICK_OFFSET_TOP = 65;
const BRICK_OFFSET_LEFT = 25;
const BRICK_WIDTH = 51; // (800 - 50left/right - 13*5padding) / 14 cols = approx 51.5px

// --- Initialize Game Objects ---
function initPaddle() {
    paddle.width = 120;
    paddle.targetWidth = 120;
    paddle.x = (canvas.width - paddle.width) / 2;
    activePowerupTimers.LASER = 0;
    activePowerupTimers.WIDE = 0;
    activePowerupTimers.SLOW = 0;
    paddleShieldActive = false;
}

function initBall() {
    balls = [{
        x: paddle.x + paddle.width / 2,
        y: paddle.y - 10,
        radius: 8,
        dx: 0,
        dy: 0,
        speed: baseSpeed,
        color: '#00f0ff',
        glow: '#00f0ff'
    }];
    isBallAttached = true;
}

function initLevel(levelNum) {
    bricks = [];
    powerups = [];
    projectiles = [];
    activePowerupTimers.LASER = 0;
    activePowerupTimers.WIDE = 0;
    activePowerupTimers.SLOW = 0;
    paddleShieldActive = false;
    paddle.targetWidth = 120;
    
    const layout = LEVELS[(levelNum - 1) % LEVELS.length];
    for (let r = 0; r < layout.length; r++) {
        for (let c = 0; c < layout[r].length; c++) {
            const val = layout[r][c];
            if (val > 0) {
                let hits = 1;
                let points = 100;
                let color = '#00f0ff'; // Cyan
                
                if (val === 2) {
                    hits = 2;
                    points = 200;
                    color = '#ff007f'; // Magenta
                } else if (val === 3) {
                    hits = 3;
                    points = 300;
                    color = '#9d00ff'; // Purple
                } else if (val === 4) {
                    hits = 1;
                    points = 400;
                    color = '#ff3333'; // Bright Red Explosive
                } else if (val === 5) {
                    hits = 1;
                    points = 150;
                    color = '#fff000'; // Golden yellow (contains item)
                } else if (val === 9) {
                    hits = Infinity;
                    points = 0;
                    color = '#6b7280'; // Gray Armored
                }

                bricks.push({
                    x: c * (BRICK_WIDTH + BRICK_PADDING) + BRICK_OFFSET_LEFT,
                    y: r * (BRICK_HEIGHT + BRICK_PADDING) + BRICK_OFFSET_TOP,
                    width: BRICK_WIDTH,
                    height: BRICK_HEIGHT,
                    type: val,
                    hits: hits,
                    maxHits: hits,
                    points: points,
                    color: color,
                    destroyed: false
                });
            }
        }
    }
}

// Start level transition animation
function startLevelIntro(levelNum) {
    gameState = STATES.LEVEL_INTRO;
    levelAnnouncerText.innerText = `LEVEL ${levelNum}`;
    levelAnnouncer.classList.remove('hidden');
    levelAnnouncer.classList.add('active');
    sounds.playLevelStart();

    setTimeout(() => {
        levelAnnouncer.classList.remove('active');
        levelAnnouncer.classList.add('hidden');
        gameState = STATES.PLAYING;
    }, 1500);
}

// Check if all breakable bricks are destroyed
function checkLevelComplete() {
    const breakableLeft = bricks.filter(b => b.hits !== Infinity && !b.destroyed).length;
    if (breakableLeft === 0) {
        if (level < LEVELS.length) {
            level++;
            updateHUD();
            initPaddle();
            initLevel(level);
            initBall();
            startLevelIntro(level);
        } else {
            // All levels cleared!
            winGame();
        }
    }
}

// --- High Score Logic ---
function getHighScores() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch(e) {
            return [];
        }
    }
    // Default high scores if empty
    return [
        { name: 'NEO', score: 10000 },
        { name: 'SYN', score: 7500 },
        { name: 'RET', score: 5000 },
        { name: 'BRK', score: 3000 },
        { name: 'ARC', score: 1000 }
    ];
}

function saveHighScore(name, scoreVal) {
    let scores = getHighScores();
    scores.push({ name: name.toUpperCase() || 'PLAYER', score: scoreVal });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 5); // Keep top 5
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

function checkIsHighScore(scoreVal) {
    const scores = getHighScores();
    if (scores.length < 5) return true;
    return scoreVal > scores[scores.length - 1].score;
}

function populateLeaderboard() {
    const listEl = document.getElementById('scores-list');
    listEl.innerHTML = '';
    const scores = getHighScores();
    scores.forEach((entry, idx) => {
        const row = document.createElement('div');
        row.className = 'score-entry';
        row.innerHTML = `
            <span class="score-rank">0${idx + 1}</span>
            <span class="score-name">${entry.name}</span>
            <span class="score-val">${entry.score.toLocaleString()}</span>
        `;
        listEl.appendChild(row);
    });
}

// --- Menu Handling ---
function showMenu(menuKey) {
    // Hide all menus
    Object.values(menus).forEach(m => m.classList.add('hidden'));
    
    if (menuKey && menus[menuKey]) {
        menus[menuKey].classList.remove('hidden');
    }
}

function startGame() {
    sounds.resume();
    score = 0;
    level = 1;
    lives = 3;
    baseSpeed = 4.5;
    
    updateHUD();
    initPaddle();
    initLevel(level);
    initBall();
    
    showMenu(null); // Hide overlays
    startLevelIntro(level);
}

function winGame() {
    gameState = STATES.GAMEWIN;
    sounds.playGameWin();
    document.getElementById('win-score').innerText = score.toLocaleString();
    
    const isHigh = checkIsHighScore(score);
    const inputContainer = document.getElementById('win-high-score-input-container');
    if (isHigh) {
        inputContainer.classList.remove('hidden');
    } else {
        inputContainer.classList.add('hidden');
    }
    showMenu('gamewin');
}

function gameOver() {
    gameState = STATES.GAMEOVER;
    sounds.playGameOver();
    document.getElementById('final-score').innerText = score.toLocaleString();
    
    const isHigh = checkIsHighScore(score);
    const inputContainer = document.getElementById('high-score-input-container');
    if (isHigh) {
        inputContainer.classList.remove('hidden');
    } else {
        inputContainer.classList.add('hidden');
    }
    showMenu('gameover');
}

function pauseGame() {
    if (gameState === STATES.PLAYING) {
        gameState = STATES.PAUSED;
        showMenu('pause');
    }
}

function resumeGame() {
    if (gameState === STATES.PAUSED) {
        gameState = STATES.PLAYING;
        showMenu(null);
    }
}

// --- HUD Updates ---
function updateHUD() {
    scoreValEl.innerText = String(score).padStart(5, '0');
    levelValEl.innerText = level;
    
    // Lives UI
    livesContainer.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const heart = document.createElement('div');
        heart.className = `live-heart ${i >= lives ? 'lost' : ''}`;
        livesContainer.appendChild(heart);
    }

    // Powerup Active UI Timer representation
    activePowerupsEl.innerHTML = '';
    
    if (activePowerupTimers.LASER > 0) {
        createPowerupTimerHUD(POWERUPS.LASER, activePowerupTimers.LASER);
    }
    if (activePowerupTimers.WIDE > 0) {
        createPowerupTimerHUD(POWERUPS.WIDE, activePowerupTimers.WIDE);
    }
    if (activePowerupTimers.SLOW > 0) {
        createPowerupTimerHUD(POWERUPS.SLOW, activePowerupTimers.SLOW);
    }
    if (paddleShieldActive) {
        // Shield doesn't have time decay, just stays active
        createPowerupTimerHUD(POWERUPS.SHIELD, 1);
    }
}

function createPowerupTimerHUD(pInfo, ratio) {
    const item = document.createElement('div');
    item.className = 'active-p-item';
    item.style.color = pInfo.color;
    
    const label = pInfo.name;
    const barWidth = ratio * 100;
    
    item.innerHTML = `
        <div class="active-p-header">
            <span>${pInfo.code}</span>
            <span>${label}</span>
        </div>
        <div class="active-p-bar-bg">
            <div class="active-p-bar-fill" style="width: ${barWidth}%"></div>
        </div>
    `;
    activePowerupsEl.appendChild(item);
}

// --- Particles & FX ---
function spawnParticles(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3.5 + 1.5;
        particles.push({
            x: x,
            y: y,
            radius: Math.random() * 3.5 + 1.5,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            color: color,
            alpha: 1,
            decay: Math.random() * 0.03 + 0.015
        });
    }
}

function triggerScreenShake(duration, intensity) {
    screenShake.duration = duration;
    screenShake.intensity = intensity;
}

// --- Power-up Actions ---
function spawnPowerup(x, y, force = false) {
    // 15% chance to drop, or 100% if forced (Gold Brick Type 5)
    if (!force && Math.random() > 0.15) return;
    
    const keys = Object.keys(POWERUPS);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const pType = POWERUPS[randomKey];
    
    powerups.push({
        x: x,
        y: y,
        width: 20,
        height: 20,
        dy: 2,
        type: randomKey,
        color: pType.color,
        code: pType.code
    });
}

function activatePowerup(type) {
    sounds.playPowerUpCollect();
    spawnParticles(paddle.x + paddle.width/2, paddle.y, POWERUPS[type].color, 25);
    
    switch (type) {
        case 'MULTIBALL':
            // Spawn 2 extra balls at paddle
            if (balls.length > 0) {
                const baseBall = balls[0];
                for (let i = 0; i < 2; i++) {
                    const angle = -Math.PI / 4 - (Math.random() * Math.PI / 2); // random up angle
                    balls.push({
                        x: baseBall.x,
                        y: baseBall.y,
                        radius: baseBall.radius,
                        dx: Math.cos(angle) * baseBall.speed,
                        dy: Math.sin(angle) * baseBall.speed,
                        speed: baseBall.speed,
                        color: '#39ff14',
                        glow: '#39ff14'
                    });
                }
            }
            break;
            
        case 'LASER':
            activePowerupTimers.LASER = POWERUP_DURATION;
            break;
            
        case 'WIDE':
            activePowerupTimers.WIDE = POWERUP_DURATION;
            paddle.targetWidth = 180; // Larger width
            break;
            
        case 'SHIELD':
            paddleShieldActive = true;
            break;
            
        case 'SLOW':
            activePowerupTimers.SLOW = POWERUP_DURATION;
            balls.forEach(b => {
                b.speed = baseSpeed * 0.6;
                // recalculate dx, dy ratios
                const len = Math.sqrt(b.dx*b.dx + b.dy*b.dy);
                if (len > 0) {
                    b.dx = (b.dx / len) * b.speed;
                    b.dy = (b.dy / len) * b.speed;
                }
            });
            break;
    }
    updateHUD();
}

// Fire Laser projectiles from paddle sides
function fireLasers() {
    if (activePowerupTimers.LASER <= 0 || gameState !== STATES.PLAYING) return;
    
    sounds.playLaserFire();
    
    // Left nozzle
    projectiles.push({
        x: paddle.x + 8,
        y: paddle.y - 6,
        radius: 4,
        dy: -8,
        color: '#ff007f'
    });
    // Right nozzle
    projectiles.push({
        x: paddle.x + paddle.width - 8,
        y: paddle.y - 6,
        radius: 4,
        dy: -8,
        color: '#ff007f'
    });
}

// Explosive brick chain blast
function triggerBrickExplosion(ex, ey) {
    sounds.playBrickDestroy(4);
    spawnParticles(ex, ey, '#ff3333', 35);
    triggerScreenShake(15, 6);
    
    // Blast radius: approx 90px
    const radius = 90;
    bricks.forEach(b => {
        if (!b.destroyed && b.hits !== Infinity) {
            // Brick center
            const bx = b.x + b.width / 2;
            const by = b.y + b.height / 2;
            const dist = Math.hypot(bx - ex, by - ey);
            if (dist <= radius) {
                b.hits = 0; // Destroyed
                b.destroyed = true;
                score += b.points;
                spawnParticles(bx, by, b.color, 12);
                
                // Chain reaction check
                if (b.type === 4) {
                    triggerBrickExplosion(bx, by);
                } else if (b.type === 5) {
                    spawnPowerup(bx, by, true);
                } else {
                    spawnPowerup(bx, by);
                }
            }
        }
    });
}

// Lose a life
function handleBallLost() {
    lives--;
    updateHUD();
    sounds.playLoseLife();
    
    if (lives <= 0) {
        gameOver();
    } else {
        initBall();
    }
}

// --- Physics & Game Logic Updates ---
function update(dt) {
    // Screen Shake decay
    if (screenShake.duration > 0) {
        screenShake.duration--;
    }

    if (gameState !== STATES.PLAYING) return;

    // Power-up timers decay
    if (activePowerupTimers.WIDE > 0) {
        activePowerupTimers.WIDE -= dt;
        if (activePowerupTimers.WIDE <= 0) {
            paddle.targetWidth = 120; // reset size
            updateHUD();
        }
    }
    if (activePowerupTimers.LASER > 0) {
        activePowerupTimers.LASER -= dt;
        if (activePowerupTimers.LASER <= 0) {
            updateHUD();
        }
    }
    if (activePowerupTimers.SLOW > 0) {
        activePowerupTimers.SLOW -= dt;
        if (activePowerupTimers.SLOW <= 0) {
            // Speed up balls back to normal
            balls.forEach(b => {
                b.speed = baseSpeed;
                const len = Math.sqrt(b.dx*b.dx + b.dy*b.dy);
                if (len > 0) {
                    b.dx = (b.dx / len) * b.speed;
                    b.dy = (b.dy / len) * b.speed;
                }
            });
            updateHUD();
        }
    }

    // Smooth Paddle width resize transition
    if (paddle.width !== paddle.targetWidth) {
        const diff = paddle.targetWidth - paddle.width;
        paddle.width += diff * 0.1;
    }

    // Move Paddle
    let moveDir = 0;
    if (keys.ArrowLeft || keys.KeyA) moveDir = -1;
    if (keys.ArrowRight || keys.KeyD) moveDir = 1;
    
    paddle.x += moveDir * paddle.speed;
    
    // Constrain Paddle inside canvas borders
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;

    // Handle Attached Ball
    if (isBallAttached && balls.length > 0) {
        balls[0].x = paddle.x + paddle.width / 2;
        balls[0].y = paddle.y - balls[0].radius - 1;
    }

    // Move Balls and Collisions
    for (let i = balls.length - 1; i >= 0; i--) {
        const ball = balls[i];
        if (isBallAttached) continue;

        // Move
        ball.x += ball.dx;
        ball.y += ball.dy;

        // Wall collisions
        if (ball.x - ball.radius <= 0) {
            ball.x = ball.radius;
            ball.dx = -ball.dx;
            sounds.playWallBounce();
        } else if (ball.x + ball.radius >= canvas.width) {
            ball.x = canvas.width - ball.radius;
            ball.dx = -ball.dx;
            sounds.playWallBounce();
        }

        // Top wall
        if (ball.y - ball.radius <= 0) {
            ball.y = ball.radius;
            ball.dy = -ball.dy;
            sounds.playWallBounce();
        }

        // Bottom wall (Lose condition or Shield)
        if (ball.y + ball.radius >= canvas.height) {
            if (paddleShieldActive) {
                // Bounce ball back
                ball.y = canvas.height - ball.radius - 8;
                ball.dy = -Math.abs(ball.dy);
                paddleShieldActive = false; // consume shield
                sounds.playPaddleBounce();
                spawnParticles(ball.x, canvas.height, '#fff000', 20);
                updateHUD();
            } else {
                // Remove ball
                balls.splice(i, 1);
                if (balls.length === 0) {
                    handleBallLost();
                }
                continue;
            }
        }

        // Paddle collision
        if (ball.y + ball.radius >= paddle.y && 
            ball.y - ball.radius <= paddle.y + paddle.height &&
            ball.x + ball.radius >= paddle.x && 
            ball.x - ball.radius <= paddle.x + paddle.width) {
            
            // Check if ball is actually descending
            if (ball.dy > 0) {
                ball.y = paddle.y - ball.radius;
                
                // Paddle reflection angle calculation: ball bounce direction depends on hit point on paddle
                const relativeHit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2); // Range: -1 to 1
                const maxAngle = Math.PI / 3; // 60 degrees max bounce angle
                const angle = relativeHit * maxAngle;
                
                ball.dx = ball.speed * Math.sin(angle);
                ball.dy = -ball.speed * Math.cos(angle);
                
                sounds.playPaddleBounce();
                spawnParticles(ball.x, ball.y, ball.color, 8);
            }
        }

        // Brick collisions
        for (let j = 0; j < bricks.length; j++) {
            const brick = bricks[j];
            if (brick.destroyed) continue;

            // Simple box-circle collision
            // Find closest point on brick to ball
            const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
            const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
            
            const distanceX = ball.x - closestX;
            const distanceY = ball.y - closestY;
            const distanceSq = (distanceX * distanceX) + (distanceY * distanceY);

            if (distanceSq < ball.radius * ball.radius) {
                // Collision detected!
                if (brick.hits !== Infinity) {
                    brick.hits--;
                    
                    // Reduce brick opacity/visual state
                    if (brick.hits <= 0) {
                        brick.destroyed = true;
                        score += brick.points;
                        updateHUD();
                        
                        // Particle burst
                        spawnParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color, 15);
                        sounds.playBrickDestroy(brick.type);
                        
                        // Explosive brick trigger
                        if (brick.type === 4) {
                            triggerBrickExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2);
                        } else if (brick.type === 5) {
                            // Gold brick drops powerup
                            spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2, true);
                        } else {
                            spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
                        }
                    } else {
                        // Just hit
                        sounds.playBrickDestroy(0); // Standard hit sound
                        spawnParticles(closestX, closestY, brick.color, 5);
                        
                        // Darken color slightly to show damage
                        if (brick.type === 2) brick.color = '#aa0055';
                        if (brick.type === 3) brick.color = '#5a0099';
                    }
                } else {
                    // Armored hit (Gray unbreakable)
                    sounds.playWallBounce();
                    spawnParticles(closestX, closestY, '#6b7280', 5);
                }

                // Bounce logic: Determine which edge of brick was hit
                // We compare relative penetration from each side
                const overlapX = ball.radius - Math.abs(distanceX);
                const overlapY = ball.radius - Math.abs(distanceY);

                if (overlapX < overlapY) {
                    // Left/Right side hit
                    ball.dx = distanceX > 0 ? Math.abs(ball.dx) : -Math.abs(ball.dx);
                    ball.x += (distanceX > 0 ? overlapX : -overlapX);
                } else {
                    // Top/Bottom side hit
                    ball.dy = distanceY > 0 ? Math.abs(ball.dy) : -Math.abs(ball.dy);
                    ball.y += (distanceY > 0 ? overlapY : -overlapY);
                }

                checkLevelComplete();
                break; // Handle one brick collision per ball update
            }
        }
    }

    // Move and Collide Projectiles (Lasers)
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        proj.y += proj.dy;
        
        // Remove laser if out of screen
        if (proj.y < 0) {
            projectiles.splice(i, 1);
            continue;
        }

        // Collision with bricks
        let laserHit = false;
        for (let j = 0; j < bricks.length; j++) {
            const brick = bricks[j];
            if (brick.destroyed) continue;

            if (proj.x >= brick.x && proj.x <= brick.x + brick.width &&
                proj.y >= brick.y && proj.y <= brick.y + brick.height) {
                
                laserHit = true;
                if (brick.hits !== Infinity) {
                    brick.hits--;
                    spawnParticles(proj.x, proj.y, brick.color, 6);
                    sounds.playBrickDestroy(0);

                    if (brick.hits <= 0) {
                        brick.destroyed = true;
                        score += brick.points;
                        updateHUD();
                        
                        spawnParticles(brick.x + brick.width/2, brick.y + brick.height/2, brick.color, 15);
                        sounds.playBrickDestroy(brick.type);
                        
                        if (brick.type === 4) {
                            triggerBrickExplosion(brick.x + brick.width / 2, brick.y + brick.height / 2);
                        } else if (brick.type === 5) {
                            spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2, true);
                        } else {
                            spawnPowerup(brick.x + brick.width / 2, brick.y + brick.height / 2);
                        }
                    }
                } else {
                    // Armored hit
                    spawnParticles(proj.x, proj.y, '#6b7280', 3);
                }
                
                checkLevelComplete();
                break;
            }
        }

        if (laserHit) {
            projectiles.splice(i, 1);
        }
    }

    // Move and Collect Powerups
    for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        p.y += p.dy;

        // Paddle collection
        if (p.y + p.height >= paddle.y && 
            p.y <= paddle.y + paddle.height &&
            p.x + p.width >= paddle.x && 
            p.x <= paddle.x + paddle.width) {
            
            activatePowerup(p.type);
            powerups.splice(i, 1);
            continue;
        }

        // Out of bounds
        if (p.y > canvas.height) {
            powerups.splice(i, 1);
        }
    }

    // Move Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.dx;
        p.y += p.dy;
        p.alpha -= p.decay;
        
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        }
    }
}

// --- Rendering Logic ---
function draw() {
    // Canvas clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply Screen Shake
    ctx.save();
    if (screenShake.duration > 0) {
        const dx = (Math.random() - 0.5) * screenShake.intensity;
        const dy = (Math.random() - 0.5) * screenShake.intensity;
        ctx.translate(dx, dy);
    }

    // Draw bottom Shield (if active)
    if (paddleShieldActive) {
        ctx.strokeStyle = '#fff000';
        ctx.lineWidth = 5;
        ctx.shadowColor = '#fff000';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - 4);
        ctx.lineTo(canvas.width, canvas.height - 4);
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }

    // Draw Bricks
    bricks.forEach(b => {
        if (b.destroyed) return;

        // Glowing border effect
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 10;

        ctx.fillStyle = b.color;
        
        // Bricks have glassmorphism styled borders
        ctx.fillRect(b.x, b.y, b.width, b.height);
        
        ctx.shadowBlur = 0;
        
        // Inner bevel highlight
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);

        // Bricks with multiple hits remaining show grid overlays
        if (b.hits > 1 && b.hits !== Infinity) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.lineWidth = 2;
            ctx.strokeRect(b.x + 3, b.y + 3, b.width - 6, b.height - 6);
        }
    });

    // Draw Powerups
    powerups.forEach(p => {
        ctx.save();
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        
        // Draw pill-shaped container
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x + p.width/2, p.y + p.height/2, p.width/2, 0, Math.PI*2);
        ctx.fill();
        
        // Inner symbol
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 11px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.code, p.x + p.width/2, p.y + p.height/2);
        
        ctx.restore();
    });

    // Draw Lasers
    projectiles.forEach(proj => {
        ctx.save();
        ctx.fillStyle = proj.color;
        ctx.shadowColor = proj.color;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    });

    // Draw Particles
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Draw Paddle
    ctx.save();
    ctx.shadowColor = activePowerupTimers.LASER > 0 ? '#ff007f' : '#00f0ff';
    ctx.shadowBlur = paddle.glow;
    
    // Gradient fill for paddle
    const padGrad = ctx.createLinearGradient(paddle.x, 0, paddle.x + paddle.width, 0);
    if (activePowerupTimers.LASER > 0) {
        padGrad.addColorStop(0, '#7000ff');
        padGrad.addColorStop(0.5, '#ff007f');
        padGrad.addColorStop(1, '#7000ff');
    } else {
        padGrad.addColorStop(0, '#00f0ff');
        padGrad.addColorStop(0.5, '#9d00ff');
        padGrad.addColorStop(1, '#00f0ff');
    }
    
    ctx.fillStyle = padGrad;
    
    // Rounded paddle
    const rx = paddle.x;
    const ry = paddle.y;
    const rw = paddle.width;
    const rh = paddle.height;
    const radius = 6;
    
    ctx.beginPath();
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + rw - radius, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
    ctx.lineTo(rx + rw, ry + rh - radius);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
    ctx.lineTo(rx + radius, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw laser turrets on sides if laser is active
    if (activePowerupTimers.LASER > 0) {
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 8;
        // Left turret
        ctx.fillRect(paddle.x + 5, paddle.y - 6, 6, 6);
        // Right turret
        ctx.fillRect(paddle.x + paddle.width - 11, paddle.y - 6, 6, 6);
        ctx.shadowBlur = 0;
    }

    // Draw Balls
    balls.forEach(ball => {
        ctx.save();
        ctx.fillStyle = ball.color;
        ctx.shadowColor = ball.glow;
        ctx.shadowBlur = 12;
        
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    });

    // Draw helper line if ball is attached to the paddle
    if (isBallAttached && balls.length > 0) {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(paddle.x + paddle.width/2, paddle.y - 12);
        ctx.lineTo(paddle.x + paddle.width/2, paddle.y - 60);
        ctx.stroke();
        ctx.setLineDash([]); // reset
    }

    ctx.restore(); // end screen shake save
}

// --- Main Game Loop ---
let lastTime = 0;
function gameLoop(time) {
    if (!lastTime) lastTime = time;
    const dt = time - lastTime;
    lastTime = time;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

// --- Event Handlers & Bindings ---
window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.ArrowLeft = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.ArrowRight = true;
    
    if (e.code === 'Space') {
        isSpacePressed = true;
        
        // Launch ball
        if (gameState === STATES.PLAYING && isBallAttached && balls.length > 0) {
            isBallAttached = false;
            // Launch angled upwards
            balls[0].dx = (Math.random() - 0.5) * 2; // slight horizontal dev
            balls[0].dy = -balls[0].speed;
            sounds.playPaddleBounce();
        } else if (gameState === STATES.PLAYING && activePowerupTimers.LASER > 0) {
            // Shoot laser
            fireLasers();
        }
    }

    if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState === STATES.PLAYING) {
            pauseGame();
        } else if (gameState === STATES.PAUSED) {
            resumeGame();
        }
    }
});

window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.ArrowLeft = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.ArrowRight = false;
    if (e.code === 'Space') isSpacePressed = false;
});

// Mouse/Touch controls
canvas.addEventListener('mousemove', e => {
    if (gameState !== STATES.PLAYING) return;
    
    // Find canvas relative offset
    const rect = canvas.getBoundingClientRect();
    const root = document.documentElement;
    const mouseX = e.clientX - rect.left - root.scrollLeft;
    
    paddle.x = mouseX - paddle.width / 2;
    
    // Keep paddle inside canvas borders
    if (paddle.x < 0) paddle.x = 0;
    if (paddle.x + paddle.width > canvas.width) paddle.x = canvas.width - paddle.width;
});

canvas.addEventListener('click', () => {
    // Launch ball on canvas click too
    if (gameState === STATES.PLAYING && isBallAttached && balls.length > 0) {
        isBallAttached = false;
        balls[0].dx = (Math.random() - 0.5) * 2;
        balls[0].dy = -balls[0].speed;
        sounds.playPaddleBounce();
    } else if (gameState === STATES.PLAYING && activePowerupTimers.LASER > 0) {
        fireLasers();
    }
});

// Menu Button events
document.getElementById('btn-start').addEventListener('click', () => {
    startGame();
});

document.getElementById('btn-how').addEventListener('click', () => {
    sounds.resume();
    showMenu('how');
});

document.getElementById('btn-how-back').addEventListener('click', () => {
    showMenu('start');
});

document.getElementById('btn-scores').addEventListener('click', () => {
    sounds.resume();
    populateLeaderboard();
    showMenu('scores');
});

document.getElementById('btn-scores-back').addEventListener('click', () => {
    showMenu('start');
});

document.getElementById('btn-resume').addEventListener('click', () => {
    resumeGame();
});

document.getElementById('btn-pause-main').addEventListener('click', () => {
    showMenu('start');
    gameState = STATES.MENU;
});

document.getElementById('btn-restart').addEventListener('click', () => {
    startGame();
});

document.getElementById('btn-gameover-main').addEventListener('click', () => {
    showMenu('start');
    gameState = STATES.MENU;
});

document.getElementById('btn-win-restart').addEventListener('click', () => {
    startGame();
});

document.getElementById('btn-win-main').addEventListener('click', () => {
    showMenu('start');
    gameState = STATES.MENU;
});

// High score submits
document.getElementById('btn-submit-score').addEventListener('click', () => {
    const nameInput = document.getElementById('player-name');
    const name = nameInput.value.trim().substring(0, 5) || 'NEO';
    saveHighScore(name, score);
    populateLeaderboard();
    showMenu('scores');
    nameInput.value = ''; // Reset
});

document.getElementById('btn-win-submit-score').addEventListener('click', () => {
    const nameInput = document.getElementById('win-player-name');
    const name = nameInput.value.trim().substring(0, 5) || 'NEO';
    saveHighScore(name, score);
    populateLeaderboard();
    showMenu('scores');
    nameInput.value = ''; // Reset
});

// Initialize on page load
populateLeaderboard();
requestAnimationFrame(gameLoop);
updateHUD();
