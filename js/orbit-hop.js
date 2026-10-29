/**
 * 궤도 점프 (Orbit Hop) - 원버튼 우주 아케이드
 * 행성 주위를 자동 공전하는 위성을 접선 방향으로 발사해 다음 행성 궤도에 붙인다.
 * 진행할수록 행성이 작아지고 공전이 빨라지며 소행성이 등장한다.
 */

// --- 효과음 (Web Audio API, neon-breaker의 SoundManager 패턴) ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.unsupported = false;
    }

    init() {
        if (this.ctx || this.unsupported) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
        } catch (e) {
            this.unsupported = true;   // 재시도해도 실패하므로 한 번만 경고
            console.warn('Web Audio API를 지원하지 않습니다', e);
        }
    }

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    // 오실레이터 한 음 재생
    playTone(freqStart, freqEnd, type, duration, volumeStart = 0.1, volumeEnd = 0) {
        if (!this.ctx || this.muted) return;

        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        const now = this.ctx.currentTime;

        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        if (freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
        }

        gainNode.gain.setValueAtTime(volumeStart, now);
        gainNode.gain.linearRampToValueAtTime(volumeEnd, now + duration);

        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + duration);
    }

    playLaunch() {
        // 위로 솟는 짧은 슝
        this.playTone(260, 620, 'triangle', 0.14, 0.18, 0.01);
    }

    playAttach() {
        // 궤도 부착 블립
        this.playTone(520, 780, 'sine', 0.12, 0.2, 0.01);
    }

    playPerfect() {
        // 상승 차임 2음
        this.playTone(660, 990, 'sine', 0.18, 0.2, 0.01);
        setTimeout(() => this.playTone(880, 1320, 'sine', 0.2, 0.18, 0.01), 70);
    }

    playStart() {
        // C 장조 아르페지오
        const notes = [261.63, 329.63, 392.0, 523.25];
        notes.forEach((freq, idx) => {
            setTimeout(() => this.playTone(freq, freq * 1.05, 'sine', 0.2, 0.18, 0.02), idx * 90);
        });
    }

    playCrash() {
        // 낮게 떨어지는 폭발음
        this.playTone(180, 40, 'sawtooth', 0.5, 0.35, 0.01);
        setTimeout(() => this.playTone(110, 30, 'square', 0.7, 0.3, 0.01), 150);
    }
}

const sounds = new SoundManager();

// --- 게임 설정 ---
const CONFIG = {
    WORLD_WIDTH: 400,        // 논리 좌표계 가로 폭 (화면 크기와 무관)
    MIN_VIEW_HEIGHT: 520,    // 가로로 넓은 화면에서도 최소한 보장할 세로 시야
    SAT_RADIUS: 6,           // 위성 반지름
    CAMERA_ANCHOR: 0.7,      // 현재 행성을 화면 위에서부터 70% 지점에 둔다
    MAX_FLIGHT_TIME: 2.5,    // 이 시간 동안 아무 궤도에도 못 붙으면 이탈 처리
    PERFECT_RATIO: 0.35,     // 비행 직선과 행성 중심의 거리가 궤도 반지름의 35% 이하면 퍼펙트
    POINTS_PER_PLANET: 100,
    PERFECT_BONUS: 50,
    BEST_KEY: 'gm_orbit-hop_best'
};

const COLORS = {
    pink: '#ff007f',
    blue: '#00f0ff',
    purple: '#9d00ff',
    yellow: '#fff000',
    green: '#39ff14',
    orange: '#ff7a00'
};

// 행성 색상 팔레트 [본체, 글로우]
const PLANET_PALETTE = [
    ['#ff007f', 'rgba(255, 0, 127, 0.55)'],
    ['#00f0ff', 'rgba(0, 240, 255, 0.55)'],
    ['#c800ff', 'rgba(200, 0, 255, 0.55)'],
    ['#39ff14', 'rgba(57, 255, 20, 0.5)'],
    ['#ff7a00', 'rgba(255, 122, 0, 0.55)']
];

// --- 상태 상수 ---
const STATES = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAMEOVER: 'gameover'
};

// --- DOM 참조 ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const scoreValEl = document.getElementById('score-val');
const bestValEl = document.getElementById('best-val');
const pauseBtn = document.getElementById('btn-pause');

const menus = {
    start: document.getElementById('start-menu'),
    pause: document.getElementById('pause-menu'),
    gameover: document.getElementById('game-over-menu')
};

// --- 뷰포트 (리사이즈 시 갱신) ---
const view = {
    cssW: 0,
    cssH: 0,
    dpr: 1,
    scale: 1,     // 월드 1단위 = CSS 픽셀 몇 개
    offsetX: 0,   // 월드가 화면보다 좁을 때 가운데 정렬용 여백 (월드 단위)
    viewW: 0,     // 보이는 월드 폭
    viewH: 0      // 보이는 월드 높이
};

// --- 게임 상태 ---
let gameState = STATES.MENU;
let score = 0;
let bestScore = loadBest();
let planetsReached = 0;   // 출발 행성을 제외하고 새로 도착한 행성 수
let highestIdx = 0;       // 지금까지 도착한 가장 높은 행성 번호
let nextPlanetIdx = 0;    // 다음에 생성할 행성 번호
let cameraY = 0;          // 화면 맨 위가 가리키는 월드 y
let gameOverAt = 0;       // 게임오버 직후 실수 입력 방지용 시각
let lastTime = 0;
let elapsed = 0;          // 연출용 누적 시간

let planets = [];
let asteroids = [];
let particles = [];
let floatTexts = [];
let stars = [];

const satellite = {
    mode: 'orbit',   // 'orbit' | 'flying' | 'dead'
    planet: null,    // 공전 중인 행성
    from: null,      // 마지막으로 출발한 행성 (비행 중 재부착 금지)
    angle: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    flightTime: 0,
    trail: []
};

// --- 유틸 ---
function rand(min, max) {
    return min + Math.random() * (max - min);
}

function loadBest() {
    try {
        return parseInt(localStorage.getItem(CONFIG.BEST_KEY), 10) || 0;
    } catch (e) {
        return 0;
    }
}

function saveBest(value) {
    try {
        localStorage.setItem(CONFIG.BEST_KEY, String(value));
    } catch (e) {
        // 사생활 보호 모드 등에서 저장 실패해도 게임은 계속
    }
}

// --- 캔버스 크기 / 고해상도 대응 ---
function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    view.cssW = Math.max(1, rect.width);
    view.cssH = Math.max(1, rect.height);
    view.dpr = Math.min(window.devicePixelRatio || 1, 3);

    canvas.width = Math.round(view.cssW * view.dpr);
    canvas.height = Math.round(view.cssH * view.dpr);

    // 가로 폭을 월드 폭에 맞추되, 세로 시야가 너무 짧아지면 축소해서 좌우 여백을 둔다
    view.scale = Math.min(view.cssW / CONFIG.WORLD_WIDTH, view.cssH / CONFIG.MIN_VIEW_HEIGHT);
    view.viewW = view.cssW / view.scale;
    view.viewH = view.cssH / view.scale;
    view.offsetX = (view.viewW - CONFIG.WORLD_WIDTH) / 2;

    if (gameState !== STATES.PLAYING) render();
}

// --- 난이도 곡선 ---
// idx(행성 번호)가 커질수록 행성·궤도가 작아지고 공전이 빨라진다. 일정 수준에서 상한.
function difficultyFor(idx) {
    const d = Math.min(idx, 60);
    return {
        radius: Math.max(11, 30 - d * 0.35),
        orbitGap: Math.max(16, 34 - d * 0.3),            // 행성 표면 ~ 궤도 사이 간격
        angSpeed: Math.min(4.2, 1.5 + d * 0.055),        // rad/s
        verticalGap: Math.min(250, 170 + d * 1.4),       // 이전 행성과의 세로 거리
        asteroidChance: idx < 4 ? 0 : Math.min(0.9, 0.3 + (idx - 4) * 0.03),
        asteroidSpeed: Math.min(210, 60 + d * 3.5),
        flightSpeed: Math.min(640, 470 + d * 3)
    };
}

// --- 월드 생성 ---
function createPlanet(prev) {
    const idx = nextPlanetIdx++;
    const diff = difficultyFor(idx);
    const radius = idx === 0 ? 30 : diff.radius * rand(0.9, 1.1);
    const orbitR = radius + (idx === 0 ? 36 : diff.orbitGap * rand(0.9, 1.15));
    const margin = orbitR + 10;

    let x;
    let y;
    if (!prev) {
        x = CONFIG.WORLD_WIDTH / 2;
        y = 0;
    } else {
        y = prev.y - diff.verticalGap * rand(0.92, 1.08);
        // 바로 위에만 계속 생기지 않도록 이전 행성과 어느 정도 가로로 떨어뜨린다
        let tries = 0;
        do {
            x = rand(margin, CONFIG.WORLD_WIDTH - margin);
            tries++;
        } while (Math.abs(x - prev.x) < 50 && tries < 8);
    }

    const palette = PLANET_PALETTE[idx % PLANET_PALETTE.length];
    const planet = {
        idx,
        x,
        y,
        radius,
        orbitR,
        angSpeed: (idx === 0 ? 1.5 : diff.angSpeed * rand(0.9, 1.1)) * (idx === 0 || Math.random() < 0.5 ? 1 : -1),
        color: palette[0],
        glow: palette[1],
        ringPhase: Math.random() * Math.PI * 2,
        visited: idx === 0,
        pulse: 0            // 부착 시 반짝이는 연출 타이머
    };
    planets.push(planet);

    if (prev) spawnAsteroidsBetween(prev, planet, diff);
    return planet;
}

// 두 행성 사이 빈 공간에 좌우로 왕복하는 소행성을 배치
function spawnAsteroidsBetween(lower, upper, diff) {
    if (Math.random() >= diff.asteroidChance) return;

    const count = upper.idx > 18 && Math.random() < 0.45 ? 2 : 1;
    for (let i = 0; i < count; i++) {
        const r = rand(8, 12);
        // 공전 중인 위성과 겹치지 않도록 두 궤도 원 사이에서만 y를 고른다
        const clearance = r + CONFIG.SAT_RADIUS + 6;
        const minY = upper.y + upper.orbitR + clearance;
        const maxY = lower.y - lower.orbitR - clearance;
        if (minY > maxY) return;

        const y = count === 1 ? (minY + maxY) / 2 : rand(minY, maxY);
        const speed = diff.asteroidSpeed * rand(0.8, 1.2);
        asteroids.push({
            x: rand(r, CONFIG.WORLD_WIDTH - r),
            y,
            r,
            vx: Math.random() < 0.5 ? speed : -speed,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: rand(-3, 3),
            // 울퉁불퉁한 다각형 모양
            shape: Array.from({ length: 8 }, () => rand(0.75, 1.15))
        });
    }
}

function createStars() {
    stars = [];
    for (let i = 0; i < 90; i++) {
        stars.push({
            x: Math.random(),
            y: Math.random(),
            depth: rand(0.08, 0.45),   // 패럴랙스 계수 (작을수록 멀리)
            size: rand(0.6, 1.8),
            twinkle: Math.random() * Math.PI * 2
        });
    }
}

// 화면 위쪽으로 행성을 미리 만들고, 한참 아래로 지나간 것은 정리
function maintainWorld() {
    let top = planets[planets.length - 1];
    while (top.y > cameraY - view.viewH * 0.6) {
        top = createPlanet(top);
    }

    const cutoff = cameraY + view.viewH + 300;
    planets = planets.filter(p => p.y < cutoff || p === satellite.planet || p === satellite.from);
    asteroids = asteroids.filter(a => a.y < cutoff);
}

// --- 게임 흐름 ---
function showMenu(key) {
    Object.entries(menus).forEach(([name, el]) => {
        el.classList.toggle('hidden', name !== key);
    });
}

function resetWorld() {
    planets = [];
    asteroids = [];
    particles = [];
    floatTexts = [];
    nextPlanetIdx = 0;
    score = 0;
    planetsReached = 0;
    highestIdx = 0;

    const first = createPlanet(null);
    satellite.mode = 'orbit';
    satellite.planet = first;
    satellite.from = null;
    satellite.angle = Math.PI / 2;  // 행성 바로 아래에서 시작 (화면 기준 시계 방향 공전)
    satellite.flightTime = 0;
    satellite.trail = [];
    placeOnOrbit();

    cameraY = first.y - view.viewH * CONFIG.CAMERA_ANCHOR;
    maintainWorld();
    updateHUD();
}

function startGame() {
    sounds.resume();
    resetWorld();
    gameState = STATES.PLAYING;
    showMenu(null);
    pauseBtn.textContent = 'II';
    sounds.playStart();
}

function pauseGame() {
    if (gameState !== STATES.PLAYING) return;
    gameState = STATES.PAUSED;
    pauseBtn.textContent = '▶';
    showMenu('pause');
}

function resumeGame() {
    if (gameState !== STATES.PAUSED) return;
    gameState = STATES.PLAYING;
    pauseBtn.textContent = 'II';
    showMenu(null);
    lastTime = performance.now();  // 정지 시간 동안의 dt가 한 번에 들어오지 않게
}

function togglePause() {
    if (gameState === STATES.PLAYING) pauseGame();
    else if (gameState === STATES.PAUSED) resumeGame();
}

function gameOver(reason) {
    if (gameState !== STATES.PLAYING) return;
    gameState = STATES.GAMEOVER;
    gameOverAt = performance.now();
    satellite.mode = 'dead';
    sounds.playCrash();
    spawnParticles(satellite.x, satellite.y, COLORS.pink, 30);
    spawnParticles(satellite.x, satellite.y, COLORS.yellow, 15);

    const isRecord = score > bestScore;
    if (isRecord) {
        bestScore = score;
        saveBest(bestScore);
    }
    updateHUD();

    document.getElementById('over-reason').textContent = reason;
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-planets').textContent = planetsReached;
    document.getElementById('final-best').textContent = bestScore;
    document.getElementById('new-record').classList.toggle('hidden', !isRecord);

    // 폭발 연출을 잠깐 보여준 뒤 오버레이 표시
    setTimeout(() => {
        if (gameState === STATES.GAMEOVER) showMenu('gameover');
    }, 650);
}

function updateHUD() {
    scoreValEl.textContent = score;
    bestValEl.textContent = Math.max(bestScore, score);
}

// --- 입력: 발사 ---
function launch() {
    if (gameState !== STATES.PLAYING || satellite.mode !== 'orbit') return;

    const p = satellite.planet;
    const dir = Math.sign(p.angSpeed);
    const speed = difficultyFor(highestIdx).flightSpeed;
    // 공전 방향의 접선 벡터: d/dθ (cosθ, sinθ) = (-sinθ, cosθ), 방향 부호를 곱한다
    satellite.vx = -Math.sin(satellite.angle) * dir * speed;
    satellite.vy = Math.cos(satellite.angle) * dir * speed;
    satellite.mode = 'flying';
    satellite.from = p;
    satellite.planet = null;
    satellite.flightTime = 0;
    sounds.playLaunch();
    spawnParticles(satellite.x, satellite.y, COLORS.blue, 8);
}

// --- 업데이트 ---
function placeOnOrbit() {
    const p = satellite.planet;
    satellite.x = p.x + Math.cos(satellite.angle) * p.orbitR;
    satellite.y = p.y + Math.sin(satellite.angle) * p.orbitR;
}

function update(dt) {
    elapsed += dt;

    planets.forEach(p => {
        p.ringPhase += dt * 0.6;
        if (p.pulse > 0) p.pulse = Math.max(0, p.pulse - dt * 2.5);
    });

    asteroids.forEach(a => {
        a.x += a.vx * dt;
        a.rot += a.rotSpeed * dt;
        // 좌우 벽에서 튕김
        if (a.x < a.r) {
            a.x = a.r;
            a.vx = Math.abs(a.vx);
        } else if (a.x > CONFIG.WORLD_WIDTH - a.r) {
            a.x = CONFIG.WORLD_WIDTH - a.r;
            a.vx = -Math.abs(a.vx);
        }
    });

    if (gameState === STATES.MENU && satellite.mode === 'orbit') {
        // 시작 화면 뒤에서도 위성이 공전하는 모습을 보여준다
        satellite.angle += satellite.planet.angSpeed * dt;
        placeOnOrbit();
    } else if (gameState === STATES.PLAYING) {
        updateSatellite(dt);
        updateCamera(dt);
        maintainWorld();
    }

    updateParticles(dt);
}

function updateSatellite(dt) {
    if (satellite.mode === 'orbit') {
        satellite.angle += satellite.planet.angSpeed * dt;
        placeOnOrbit();
        if (hitsAsteroid(satellite.x, satellite.y)) {
            gameOver('소행성과 충돌했습니다');
        }
    } else if (satellite.mode === 'flying') {
        satellite.flightTime += dt;
        // 빠른 비행 중 소행성을 건너뛰지 않도록 서브스텝으로 나눠 판정
        const steps = Math.max(1, Math.ceil(Math.hypot(satellite.vx, satellite.vy) * dt / 4));
        const sdt = dt / steps;
        for (let i = 0; i < steps; i++) {
            satellite.x += satellite.vx * sdt;
            satellite.y += satellite.vy * sdt;
            if (hitsAsteroid(satellite.x, satellite.y)) {
                gameOver('소행성과 충돌했습니다');
                return;
            }
            const target = findOrbitToAttach();
            if (target) {
                attachTo(target);
                return;
            }
        }
        checkOutOfBounds();
    }

    // 궤적 기록 (최근 일정 개수만 유지)
    satellite.trail.push({ x: satellite.x, y: satellite.y });
    if (satellite.trail.length > 18) satellite.trail.shift();
}

function hitsAsteroid(x, y) {
    for (const a of asteroids) {
        const rr = a.r * 0.9 + CONFIG.SAT_RADIUS;   // 모양이 울퉁불퉁해서 살짝 관대하게
        const dx = x - a.x;
        const dy = y - a.y;
        if (dx * dx + dy * dy < rr * rr) return true;
    }
    return false;
}

// 위성이 궤도 원 안쪽으로 들어온 행성을 찾는다 (출발 행성 제외)
function findOrbitToAttach() {
    for (const p of planets) {
        if (p === satellite.from) continue;
        const dx = satellite.x - p.x;
        const dy = satellite.y - p.y;
        if (dx * dx + dy * dy <= p.orbitR * p.orbitR) return p;
    }
    return null;
}

function attachTo(planet) {
    // 비행 직선과 행성 중심 사이 거리 = |v̂ × (c - s)| → 중심을 얼마나 정확히 노렸는지
    const speed = Math.hypot(satellite.vx, satellite.vy) || 1;
    const cx = planet.x - satellite.x;
    const cy = planet.y - satellite.y;
    const missDist = Math.abs(satellite.vx * cy - satellite.vy * cx) / speed;
    const perfect = missDist <= planet.orbitR * CONFIG.PERFECT_RATIO;

    satellite.mode = 'orbit';
    satellite.planet = planet;
    satellite.from = null;
    satellite.angle = Math.atan2(satellite.y - planet.y, satellite.x - planet.x);
    placeOnOrbit();
    planet.pulse = 1;

    if (planet.idx > highestIdx) {
        // 중간 행성을 건너뛰었으면 그만큼 모두 점수 인정
        const gained = planet.idx - highestIdx;
        let points = gained * CONFIG.POINTS_PER_PLANET;
        if (perfect) points += CONFIG.PERFECT_BONUS;
        score += points;
        planetsReached += gained;
        highestIdx = planet.idx;
        planet.visited = true;
        updateHUD();

        addFloatText(planet.x, planet.y - planet.orbitR - 14, `+${points}`, COLORS.yellow);
        if (perfect) {
            addFloatText(planet.x, planet.y - planet.orbitR - 34, '퍼펙트!', COLORS.pink);
            sounds.playPerfect();
        } else {
            sounds.playAttach();
        }
        if (gained > 1) {
            addFloatText(planet.x, planet.y + planet.orbitR + 18, `${gained}칸 점프!`, COLORS.blue);
        }
        spawnParticles(satellite.x, satellite.y, planet.color, perfect ? 24 : 14);
    } else {
        // 이미 지나온 행성에 다시 붙으면 점수 없음
        sounds.playTone(300, 300, 'triangle', 0.08, 0.12, 0.01);
        spawnParticles(satellite.x, satellite.y, planet.color, 6);
    }
}

function checkOutOfBounds() {
    const s = satellite;
    const r = CONFIG.SAT_RADIUS;
    if (s.x < -r || s.x > CONFIG.WORLD_WIDTH + r) {
        gameOver('화면 밖으로 날아갔습니다');
    } else if (s.y > cameraY + view.viewH + r * 4 || s.y < cameraY - r * 4) {
        gameOver('우주 저편으로 사라졌습니다');
    } else if (s.flightTime > CONFIG.MAX_FLIGHT_TIME) {
        gameOver('궤도를 찾지 못했습니다');
    }
}

function updateCamera(dt) {
    let target;
    if (satellite.mode === 'orbit') {
        target = satellite.planet.y - view.viewH * CONFIG.CAMERA_ANCHOR;
    } else {
        // 비행 중에는 출발 행성 기준을 유지하되, 위성이 위로 솟으면 따라 올라간다
        const base = satellite.from ? satellite.from.y - view.viewH * CONFIG.CAMERA_ANCHOR : cameraY;
        target = Math.min(base, satellite.y - view.viewH * 0.3);
    }
    cameraY += (target - cameraY) * Math.min(1, dt * 4);
    // 빠르게 솟구칠 때 카메라가 뒤처져 위성이 화면 위로 빠져나가지 않도록 고정
    if (satellite.mode === 'flying') {
        cameraY = Math.min(cameraY, satellite.y - view.viewH * 0.15);
    }
}

// --- 파티클 / 떠오르는 텍스트 ---
function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(40, 180);
        particles.push({
            x,
            y,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            life: rand(0.4, 0.9),
            maxLife: 0.9,
            size: rand(1.5, 3.5),
            color
        });
    }
}

function addFloatText(x, y, text, color) {
    floatTexts.push({ x, y, text, color, life: 1.0 });
}

function updateParticles(dt) {
    particles.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);

    floatTexts.forEach(t => {
        t.y -= 30 * dt;
        t.life -= dt * 0.9;
    });
    floatTexts = floatTexts.filter(t => t.life > 0);
}

// --- 렌더링 ---
function render() {
    const { dpr, scale } = view;

    // 배경 (화면 좌표)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, view.cssH);
    bg.addColorStop(0, '#030107');
    bg.addColorStop(1, '#14061f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, view.cssW, view.cssH);
    drawStars();

    // 월드 좌표: 화면 = (월드 + offsetX, 월드 - cameraY) * scale
    const k = dpr * scale;
    ctx.setTransform(k, 0, 0, k, view.offsetX * k, -cameraY * k);

    drawBounds();
    planets.forEach(drawPlanet);
    asteroids.forEach(drawAsteroid);
    drawAimGuide();
    drawSatellite();
    drawParticles();
    drawFloatTexts();
}

function drawStars() {
    const h = view.cssH;
    stars.forEach(s => {
        // 카메라가 위로 갈수록(cameraY 감소) 별이 아래로 흐른다
        let sy = (s.y * h - cameraY * view.scale * s.depth) % h;
        if (sy < 0) sy += h;
        const alpha = 0.45 + Math.sin(elapsed * 2 + s.twinkle) * 0.3;
        ctx.fillStyle = `rgba(220, 210, 255, ${alpha})`;
        ctx.fillRect(s.x * view.cssW, sy, s.size, s.size);
    });
}

// 화면이 월드보다 넓을 때 좌우 경계선을 표시 (넘어가면 게임 오버)
function drawBounds() {
    if (view.offsetX <= 1) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 127, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    const top = cameraY;
    const bottom = cameraY + view.viewH;
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.lineTo(0, bottom);
    ctx.moveTo(CONFIG.WORLD_WIDTH, top);
    ctx.lineTo(CONFIG.WORLD_WIDTH, bottom);
    ctx.stroke();
    ctx.restore();
}

function isVisible(y, margin) {
    return y + margin > cameraY && y - margin < cameraY + view.viewH;
}

function drawPlanet(p) {
    if (!isVisible(p.y, p.orbitR + 20)) return;
    const current = satellite.planet === p;

    // 궤도 링 (점선, 천천히 회전)
    ctx.save();
    ctx.strokeStyle = current ? p.color : 'rgba(255, 255, 255, 0.35)';
    ctx.globalAlpha = p.visited && !current ? 0.35 : 0.9;
    ctx.lineWidth = current ? 2 : 1.5;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -p.ringPhase * 10 * Math.sign(p.angSpeed);
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = current ? 10 : 0;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.orbitR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 부착 순간 퍼지는 링
    if (p.pulse > 0) {
        ctx.save();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = p.pulse;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.orbitR + (1 - p.pulse) * 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 행성 본체 (방사형 그라디언트 + 네온 글로우)
    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 20;
    const g = ctx.createRadialGradient(p.x - p.radius * 0.35, p.y - p.radius * 0.35, p.radius * 0.1, p.x, p.y, p.radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, p.color);
    g.addColorStop(1, '#1a0630');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 공전 방향 화살표 (작은 삼각형)
    const dir = Math.sign(p.angSpeed);
    const aa = p.ringPhase * 1.5 * dir;
    const ax = p.x + Math.cos(aa) * p.orbitR;
    const ay = p.y + Math.sin(aa) * p.orbitR;
    const tx = -Math.sin(aa) * dir;
    const ty = Math.cos(aa) * dir;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(ax + tx * 5, ay + ty * 5);
    ctx.lineTo(ax - tx * 3 - ty * 3.5, ay - ty * 3 + tx * 3.5);
    ctx.lineTo(ax - tx * 3 + ty * 3.5, ay - ty * 3 - tx * 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawAsteroid(a) {
    if (!isVisible(a.y, a.r + 10)) return;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.strokeStyle = COLORS.orange;
    ctx.fillStyle = 'rgba(60, 20, 10, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(255, 122, 0, 0.7)';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    a.shape.forEach((m, i) => {
        const ang = (i / a.shape.length) * Math.PI * 2;
        const px = Math.cos(ang) * a.r * m;
        const py = Math.sin(ang) * a.r * m;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// 공전 중 발사하면 날아갈 방향을 짧은 점선으로 안내
function drawAimGuide() {
    if (gameState !== STATES.PLAYING || satellite.mode !== 'orbit') return;
    const p = satellite.planet;
    const dir = Math.sign(p.angSpeed);
    const tx = -Math.sin(satellite.angle) * dir;
    const ty = Math.cos(satellite.angle) * dir;
    // 진행할수록 안내선이 짧아진다
    const len = Math.max(28, 70 - highestIdx * 1.5);
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(satellite.x, satellite.y);
    ctx.lineTo(satellite.x + tx * len, satellite.y + ty * len);
    ctx.stroke();
    ctx.restore();
}

function drawSatellite() {
    if (satellite.mode === 'dead') return;

    // 궤적
    const trail = satellite.trail;
    for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length;
        ctx.strokeStyle = `rgba(0, 240, 255, ${t * 0.6})`;
        ctx.lineWidth = CONFIG.SAT_RADIUS * t * 1.4;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
    }

    ctx.save();
    ctx.shadowColor = COLORS.blue;
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(satellite.x, satellite.y, CONFIG.SAT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.blue;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
}

function drawFloatTexts() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    floatTexts.forEach(t => {
        ctx.globalAlpha = Math.max(0, t.life);
        ctx.font = "900 16px 'Orbitron', 'Apple SD Gothic Neo', sans-serif";
        ctx.fillStyle = t.color;
        ctx.shadowColor = t.color;
        ctx.shadowBlur = 10;
        ctx.fillText(t.text, t.x, t.y);
    });
    ctx.restore();
}

// --- 메인 루프 (델타타임 기반) ---
function gameLoop(now) {
    // 탭 전환 등으로 프레임이 크게 밀려도 한 번에 너무 많이 진행하지 않게 제한
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;

    if (gameState !== STATES.PAUSED) {
        update(dt);
    }
    render();
    requestAnimationFrame(gameLoop);
}

// --- 입력 바인딩 ---
function handleAction() {
    if (gameState === STATES.PLAYING) {
        launch();
    } else if (gameState === STATES.MENU) {
        startGame();
    } else if (gameState === STATES.GAMEOVER && performance.now() - gameOverAt > 700) {
        startGame();
    }
}

// 마우스·터치 공통: 캔버스를 누르는 즉시 발사 (click보다 반응이 빠름)
canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    sounds.resume();
    if (gameState === STATES.PLAYING) launch();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();   // 스크롤 및 포커스된 버튼의 클릭 방지
        if (e.repeat) return;
        sounds.resume();
        if (gameState === STATES.PAUSED) return;
        handleAction();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        togglePause();
    }
});

// 스페이스 keyup으로 버튼이 눌리는 것도 막는다
document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') e.preventDefault();
});

// 버튼은 클릭 후 포커스를 해제해 키보드 입력이 버튼으로 새지 않게
function bindButton(id, handler) {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => {
        e.currentTarget.blur();
        sounds.resume();
        handler();
    });
}

bindButton('btn-start', startGame);
bindButton('btn-restart', startGame);
bindButton('btn-resume', resumeGame);
bindButton('btn-pause-restart', startGame);
bindButton('btn-pause', togglePause);

// 다른 탭으로 가면 자동 일시정지
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
});

// iOS 사파리의 제스처 확대·더블탭 확대 방지
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);

// --- 초기화 ---
function init() {
    createStars();
    resizeCanvas();
    resetWorld();         // 시작 화면 뒤에 첫 행성이 보이도록 월드를 미리 구성
    updateHUD();
    showMenu('start');
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

init();
