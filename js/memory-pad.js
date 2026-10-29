// 기억 패드 - 켜지는 순서를 외워 따라 누르는 기억력 게임

// ─── 사운드 (Web Audio, neon-breaker의 SoundManager.playTone 패턴) ───
class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
    }

    init() {
        if (this.ctx || this.unsupported) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
        } catch (e) {
            this.unsupported = true; // 한 번만 경고하고 소리 없이 진행
            console.warn('Web Audio API not supported', e);
        }
    }

    resume() {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

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

    playPad(freq, duration) {
        this.playTone(freq, freq, 'triangle', duration, 0.28, 0.01);
        this.playTone(freq * 2, freq * 2, 'sine', duration * 0.6, 0.05, 0.001);
    }

    playError() {
        this.playTone(300, 90, 'sawtooth', 0.45, 0.22, 0.01);
        setTimeout(() => this.playTone(200, 70, 'square', 0.4, 0.12, 0.01), 120);
    }

    playSuccess() {
        [523.25, 659.25, 783.99].forEach((f, i) => {
            setTimeout(() => this.playTone(f, f, 'sine', 0.16, 0.18, 0.01), i * 70);
        });
    }

    playFanfare() {
        [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => {
            setTimeout(() => this.playTone(f, f * 1.01, 'triangle', 0.22, 0.22, 0.01), i * 110);
        });
    }
}

const sounds = new SoundManager();

// ─── 설정값 ──────────────────────────────────────────────────────
const BEST_KEY = 'gm_memory-pad_best';                 // 전체 최고 기록 (숫자)
const BEST_BY_LEVEL_KEY = 'gm_memory-pad_best_by_level'; // 패드 수별 최고 기록 (JSON)
const THEME_KEY = 'gm_memory-pad_theme';

// 패드 색상과 음계 (C 장조 펜타토닉 위주로 어떤 순서든 듣기 좋게)
const PAD_COLORS = ['#ff006e', '#00e5ff', '#00ff87', '#ffd60a', '#9d4dff', '#ff7a00', '#ff4dd2', '#3a86ff', '#b8ff3a'];
const PAD_NOTES = {
    4: [261.63, 329.63, 392.00, 523.25],                                          // 도 미 솔 도
    6: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25],                          // 도 레 미 솔 라 도
    9: [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99]   // 2옥타브 펜타토닉
};

const SPEEDS = {
    slow:   { on: 700, gap: 300 },
    normal: { on: 480, gap: 200 },
    fast:   { on: 320, gap: 130 }
};

const PARTY_START_LENGTH = 2;
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;
const PARTICLE_CHARS = ['🎉', '✨', '⭐', '🎊', '💫', '🌟', '🎈'];

// ─── 상태 ────────────────────────────────────────────────────────
const settings = {
    mode: 'solo',      // 'solo' | 'party'
    pads: 4,
    speed: 'normal',
    count: 2
};

const state = {
    phase: 'setup',    // 'setup' | 'ready' | 'showing' | 'input' | 'between' | 'result'
    runId: 0,          // 그만하기 / 재시작 시 대기 중인 타이머를 무효화
    sequence: [],
    inputPos: 0,
    round: 1,
    // 파티 모드
    players: [],       // { name, alive, failedRound, bestLength }
    roundLength: PARTY_START_LENGTH,
    turnOrder: [],     // 이번 라운드에 차례가 오는 플레이어 인덱스
    turnPos: 0,
    failedThisRound: []
};

// ─── DOM ─────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = {
    setupScreen: $('setupScreen'),
    gameScreen: $('gameScreen'),
    modeSeg: $('modeSeg'),
    levelSeg: $('levelSeg'),
    speedSeg: $('speedSeg'),
    countSeg: $('countSeg'),
    partySetup: $('partySetup'),
    namesInput: $('namesInput'),
    namesPreview: $('namesPreview'),
    namesNote: $('namesNote'),
    soloBest: $('soloBest'),
    bestValue: $('bestValue'),
    startBtn: $('startBtn'),
    roundValue: $('roundValue'),
    lengthValue: $('lengthValue'),
    bestBox: $('bestBox'),
    bestInGame: $('bestInGame'),
    playersBar: $('playersBar'),
    message: $('message'),
    progress: $('progress'),
    padGrid: $('padGrid'),
    readyBtn: $('readyBtn'),
    quitBtn: $('quitBtn'),
    resultOverlay: $('resultOverlay'),
    resultEmoji: $('resultEmoji'),
    resultTitle: $('resultTitle'),
    resultSub: $('resultSub'),
    rankingList: $('rankingList'),
    againBtn: $('againBtn'),
    setupBtn: $('setupBtn'),
    themeToggle: $('themeToggle')
};

let padEls = [];

// ─── 저장소 ──────────────────────────────────────────────────────
function loadBestByLevel() {
    try {
        const data = JSON.parse(localStorage.getItem(BEST_BY_LEVEL_KEY));
        return data && typeof data === 'object' ? data : {};
    } catch (e) {
        return {};
    }
}

function getBest(pads) {
    const byLevel = loadBestByLevel();
    return parseInt(byLevel[pads], 10) || 0;
}

function saveBest(pads, value) {
    try {
        const byLevel = loadBestByLevel();
        byLevel[pads] = value;
        localStorage.setItem(BEST_BY_LEVEL_KEY, JSON.stringify(byLevel));
        const overall = parseInt(localStorage.getItem(BEST_KEY), 10) || 0;
        if (value > overall) localStorage.setItem(BEST_KEY, String(value));
    } catch (e) {
        // 저장 불가 환경은 무시
    }
}

// ─── 유틸 ────────────────────────────────────────────────────────
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomPad() {
    return Math.floor(Math.random() * settings.pads);
}

function setMessage(text, tone) {
    el.message.textContent = text;
    el.message.classList.remove('good', 'bad');
    if (tone) el.message.classList.add(tone);
}

function setActive(seg, attr, value) {
    seg.querySelectorAll('.seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset[attr] === String(value));
    });
}

function escapeText(text) {
    const span = document.createElement('span');
    span.textContent = text;
    return span.innerHTML;
}

// ─── 이름 입력 (파티 모드) ───────────────────────────────────────
function parseNames() {
    const raw = el.namesInput.value
        .split(/[\n,，、]+/)
        .map(s => s.replace(/^\s*\d+\s*[.)]\s*/, '').trim())
        .filter(Boolean)
        .map(s => s.slice(0, 12));
    return raw;
}

function getPlayerNames() {
    const names = parseNames();
    if (names.length === 0) {
        return Array.from({ length: settings.count }, (_, i) => `참가자 ${i + 1}`);
    }
    const list = names.slice(0, MAX_PLAYERS);
    while (list.length < MIN_PLAYERS) list.push(`참가자 ${list.length + 1}`);
    // 같은 이름은 번호를 붙여 구분
    const seen = {};
    return list.map(name => {
        seen[name] = (seen[name] || 0) + 1;
        return seen[name] > 1 ? `${name} ${seen[name]}` : name;
    });
}

function renderNamesPreview() {
    const names = parseNames();
    const players = getPlayerNames();
    el.namesPreview.innerHTML = players.map(n => `<span class="chip">${escapeText(n)}</span>`).join('');

    if (names.length > MAX_PLAYERS) {
        el.namesNote.textContent = `최대 ${MAX_PLAYERS}명까지만 참가해요. 앞의 ${MAX_PLAYERS}명으로 시작합니다.`;
    } else if (names.length === 1) {
        el.namesNote.textContent = '파티 모드는 2명 이상이 필요해요. 한 명을 더 채워서 시작합니다.';
    } else {
        el.namesNote.textContent = '';
    }

    // 이름을 입력했으면 인원수 버튼도 그 숫자로 맞춘다
    if (names.length >= MIN_PLAYERS) {
        settings.count = Math.min(names.length, MAX_PLAYERS);
    }
    setActive(el.countSeg, 'count', settings.count);
}

// ─── 설정 화면 ───────────────────────────────────────────────────
function updateSetupView() {
    const isParty = settings.mode === 'party';
    el.partySetup.classList.toggle('hidden', !isParty);
    el.soloBest.classList.toggle('hidden', isParty);
    el.bestValue.textContent = getBest(settings.pads);
    if (isParty) renderNamesPreview();
}

function showSetup() {
    state.runId++;
    state.phase = 'setup';
    el.resultOverlay.classList.add('hidden');
    el.gameScreen.classList.add('hidden');
    el.setupScreen.classList.remove('hidden');
    updateSetupView();
}

// ─── 패드 ────────────────────────────────────────────────────────
function buildPads() {
    el.padGrid.innerHTML = '';
    el.padGrid.className = `pad-grid pads-${settings.pads}`;
    padEls = [];
    for (let i = 0; i < settings.pads; i++) {
        const pad = document.createElement('button');
        pad.type = 'button';
        pad.className = 'pad';
        pad.style.setProperty('--c', PAD_COLORS[i]);
        pad.textContent = i + 1;
        pad.setAttribute('aria-label', `${i + 1}번 패드`);

        pad.addEventListener('pointerdown', (e) => {
            e.preventDefault(); // 포커스 이동·더블탭 확대 방지
            handlePress(i);
        });
        // 키보드(Tab + Enter/Space)로 버튼을 누른 경우만 click으로 처리
        pad.addEventListener('click', (e) => {
            if (e.detail === 0) handlePress(i);
        });

        el.padGrid.appendChild(pad);
        padEls.push(pad);
    }
}

function lightPad(index, duration) {
    const pad = padEls[index];
    if (!pad) return;
    pad.classList.add('lit');
    sounds.playPad(PAD_NOTES[settings.pads][index], Math.max(duration, 150) / 1000);
    setTimeout(() => pad.classList.remove('lit'), duration);
}

function setLocked(locked) {
    el.padGrid.classList.toggle('locked', locked);
}

function renderProgress() {
    const total = state.sequence.length;
    // 너무 길면 점 대신 숫자로 표시
    if (total > 24) {
        el.progress.textContent = `${state.inputPos} / ${total}`;
        return;
    }
    let html = '';
    for (let i = 0; i < total; i++) {
        html += `<span class="dot${i < state.inputPos ? ' done' : ''}"></span>`;
    }
    el.progress.innerHTML = html;
}

async function playSequence() {
    const runId = state.runId;
    const speed = SPEEDS[settings.speed];
    // 길어질수록 조금씩 빨라진다 (최대 30%)
    const factor = Math.max(0.7, 1 - (state.sequence.length - 1) * 0.02);
    const on = Math.round(speed.on * factor);
    const gap = Math.round(speed.gap * factor);

    state.phase = 'showing';
    setLocked(true);
    state.inputPos = 0;
    renderProgress();
    await wait(600);

    for (const index of state.sequence) {
        if (runId !== state.runId) return false;
        lightPad(index, on);
        await wait(on + gap);
    }
    if (runId !== state.runId) return false;

    state.phase = 'input';
    setLocked(false);
    return true;
}

// ─── 입력 처리 ───────────────────────────────────────────────────
function handlePress(index) {
    if (index >= settings.pads) return;
    sounds.resume();
    if (state.phase !== 'input') return;

    const expected = state.sequence[state.inputPos];
    if (index === expected) {
        lightPad(index, 180);
        state.inputPos++;
        renderProgress();
        if (state.inputPos >= state.sequence.length) {
            onSequenceCleared();
        }
    } else {
        onMistake(index, expected);
    }
}

function showMistake(expected) {
    setLocked(true);
    sounds.playError();
    el.padGrid.classList.remove('shake');
    void el.padGrid.offsetWidth; // 애니메이션 재시작
    el.padGrid.classList.add('shake');
    const pad = padEls[expected];
    if (pad) {
        pad.classList.add('hint');
        setTimeout(() => pad.classList.remove('hint'), 1100);
    }
}

function onSequenceCleared() {
    state.phase = 'between';
    setLocked(true);
    sounds.playSuccess();
    if (settings.mode === 'solo') {
        soloCleared();
    } else {
        partyTurnDone(true);
    }
}

function onMistake(pressed, expected) {
    state.phase = 'between';
    showMistake(expected);
    if (settings.mode === 'solo') {
        soloFailed();
    } else {
        partyTurnDone(false);
    }
}

// ─── 혼자 하기 ───────────────────────────────────────────────────
function startSolo() {
    state.sequence = [randomPad()];
    state.round = 1;
    el.bestBox.classList.remove('hidden');
    el.playersBar.classList.add('hidden');
    el.bestInGame.textContent = getBest(settings.pads);
    soloNextRound();
}

async function soloNextRound() {
    el.roundValue.textContent = state.round;
    el.lengthValue.textContent = state.sequence.length;
    setMessage('잘 보세요…');
    const ok = await playSequence();
    if (ok) setMessage('이제 따라 누르세요!');
}

async function soloCleared() {
    const runId = state.runId;
    const cleared = state.sequence.length;
    if (cleared > getBest(settings.pads)) {
        el.bestInGame.textContent = cleared;
    }
    setMessage(`성공! ${cleared}개 기억`, 'good');
    await wait(900);
    if (runId !== state.runId) return;
    state.round++;
    state.sequence.push(randomPad());
    soloNextRound();
}

async function soloFailed() {
    const runId = state.runId;
    const score = state.sequence.length - 1;
    const prevBest = getBest(settings.pads);
    const isRecord = score > prevBest;
    if (isRecord) saveBest(settings.pads, score);

    setMessage('아쉬워요! 틀렸어요', 'bad');
    await wait(1300);
    if (runId !== state.runId) return;

    state.phase = 'result';
    el.rankingList.classList.add('hidden');
    if (isRecord) {
        el.resultEmoji.textContent = '🏆';
        el.resultTitle.textContent = '신기록!';
        el.resultSub.textContent = `${score}개까지 기억했어요 (이전 최고 ${prevBest}개)`;
    } else {
        el.resultEmoji.textContent = score >= 5 ? '👏' : '🙂';
        el.resultTitle.textContent = '게임 끝!';
        el.resultSub.textContent = `${score}개까지 기억했어요 · 최고 기록 ${Math.max(prevBest, score)}개`;
    }
    el.resultOverlay.classList.remove('hidden');
    if (isRecord && score > 0) {
        sounds.playFanfare();
        fireParticles(el.resultEmoji, 40);
    }
    el.againBtn.focus();
}

// ─── 파티 모드 ───────────────────────────────────────────────────
function startParty() {
    state.players = getPlayerNames().map(name => ({
        name,
        alive: true,
        failedRound: 0,
        bestLength: 0
    }));
    state.round = 1;
    state.roundLength = PARTY_START_LENGTH;
    el.bestBox.classList.add('hidden');
    el.playersBar.classList.remove('hidden');
    beginPartyRound();
}

function beginPartyRound() {
    state.turnOrder = state.players
        .map((p, i) => (p.alive ? i : -1))
        .filter(i => i >= 0);
    state.turnPos = 0;
    state.failedThisRound = [];
    el.roundValue.textContent = state.round;
    el.lengthValue.textContent = state.roundLength;
    preparePartyTurn();
}

function currentPlayerIndex() {
    return state.turnOrder[state.turnPos];
}

function renderPlayers() {
    const current = state.phase === 'result' ? -1 : currentPlayerIndex();
    el.playersBar.innerHTML = state.players.map((p, i) => {
        const cls = ['chip'];
        if (!p.alive) cls.push('out');
        else if (state.failedThisRound.includes(i)) cls.push('failed');
        if (i === current) cls.push('current');
        return `<span class="${cls.join(' ')}">${escapeText(p.name)}</span>`;
    }).join('');
}

function preparePartyTurn() {
    const player = state.players[currentPlayerIndex()];
    // 차례마다 새 순서 (앞사람 것을 보고 외우는 이득이 없도록)
    state.sequence = Array.from({ length: state.roundLength }, randomPad);
    state.inputPos = 0;
    state.phase = 'ready';
    setLocked(true);
    renderPlayers();
    renderProgress();
    setMessage(`${player.name} 차례!`);
    el.readyBtn.classList.remove('hidden');
    el.readyBtn.focus();
}

async function startPartyTurn() {
    if (state.phase !== 'ready') return;
    sounds.resume();
    el.readyBtn.classList.add('hidden');
    const player = state.players[currentPlayerIndex()];
    setMessage(`${player.name} · 잘 보세요…`);
    const ok = await playSequence();
    if (ok) setMessage(`${player.name} · 따라 누르세요!`);
}

async function partyTurnDone(success) {
    const runId = state.runId;
    const idx = currentPlayerIndex();
    const player = state.players[idx];

    if (success) {
        player.bestLength = Math.max(player.bestLength, state.roundLength);
        setMessage(`${player.name} 통과! 👍`, 'good');
    } else {
        state.failedThisRound.push(idx);
        setMessage(`${player.name} 틀렸어요!`, 'bad');
    }
    renderPlayers();
    await wait(1400);
    if (runId !== state.runId) return;

    state.turnPos++;
    if (state.turnPos < state.turnOrder.length) {
        preparePartyTurn();
        return;
    }
    finishPartyRound();
}

async function finishPartyRound() {
    const runId = state.runId;
    const survivors = state.turnOrder.filter(i => !state.failedThisRound.includes(i));

    if (survivors.length === 0) {
        // 모두 틀렸으면 아무도 탈락하지 않고 같은 길이로 다시
        state.failedThisRound = [];
        renderPlayers();
        setMessage('모두 틀렸어요! 같은 길이로 다시 도전', 'bad');
        await wait(1800);
        if (runId !== state.runId) return;
        state.round++;
        beginPartyRound();
        return;
    }

    state.failedThisRound.forEach(i => {
        state.players[i].alive = false;
        state.players[i].failedRound = state.round;
    });

    if (survivors.length === 1) {
        renderPlayers();
        showPartyResult(survivors[0]);
        return;
    }

    const outNames = state.failedThisRound.map(i => state.players[i].name);
    state.failedThisRound = [];
    renderPlayers();
    setMessage(outNames.length ? `${outNames.join(', ')} 탈락! 다음 라운드` : '모두 통과! 한 칸 더 길어져요', outNames.length ? 'bad' : 'good');
    await wait(1800);
    if (runId !== state.runId) return;
    state.round++;
    state.roundLength++;
    beginPartyRound();
}

function showPartyResult(winnerIndex) {
    state.phase = 'result';
    const winner = state.players[winnerIndex];
    setMessage(`${winner.name} 승리!`, 'good');

    // 순위: 우승자 → 늦게 탈락한 순
    const ranked = state.players
        .map((p, i) => ({ ...p, index: i }))
        .sort((a, b) => {
            if (a.index === winnerIndex) return -1;
            if (b.index === winnerIndex) return 1;
            return b.failedRound - a.failedRound || b.bestLength - a.bestLength;
        });

    el.rankingList.innerHTML = ranked.map((p, rank) => {
        const detail = p.index === winnerIndex
            ? `최고 ${p.bestLength}개 · 우승`
            : `${p.failedRound}라운드 탈락 · 최고 ${p.bestLength}개`;
        return `<li><span>${rank + 1}. ${escapeText(p.name)}</span><span class="rank-detail">${detail}</span></li>`;
    }).join('');
    el.rankingList.classList.remove('hidden');

    el.resultEmoji.textContent = '👑';
    el.resultTitle.textContent = `${winner.name} 승리!`;
    el.resultSub.textContent = `마지막까지 살아남았어요 · ${state.round}라운드`;
    el.resultOverlay.classList.remove('hidden');
    sounds.playFanfare();
    fireParticles(el.resultEmoji, 48);
    el.againBtn.focus();
}

// ─── 게임 시작 / 종료 ────────────────────────────────────────────
function startGame() {
    sounds.resume();
    state.runId++;
    el.resultOverlay.classList.add('hidden');
    el.setupScreen.classList.add('hidden');
    el.gameScreen.classList.remove('hidden');
    el.readyBtn.classList.add('hidden');
    el.progress.innerHTML = '';
    buildPads();
    setLocked(true);

    if (settings.mode === 'solo') {
        startSolo();
    } else {
        startParty();
    }
}

// ─── 축하 파티클 (praiseplay 방식) ───────────────────────────────
function fireParticles(origin, count = 30) {
    const r = origin.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.textContent = PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)];
        const a = Math.random() * Math.PI * 2;
        const d = 100 + Math.random() * 180;
        p.style.cssText = [
            `left:${cx}px`, `top:${cy}px`,
            `--dx:${(Math.cos(a) * d).toFixed(1)}px`,
            `--dy:${(Math.sin(a) * d - 70).toFixed(1)}px`,
            `--dur:${(0.8 + Math.random() * 0.6).toFixed(2)}s`,
            `--delay:${(Math.random() * 0.3).toFixed(2)}s`
        ].join(';');
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1900);
    }
}

// ─── 테마 (ladder.html 방식) ─────────────────────────────────────
let isLight = false;
try { isLight = localStorage.getItem(THEME_KEY) === 'light'; } catch (e) { /* 무시 */ }

function applyTheme() {
    const icon = el.themeToggle.querySelector('.toggle-icon');
    const label = el.themeToggle.querySelector('.toggle-label');
    if (isLight) {
        document.documentElement.classList.add('light');
        icon.textContent = '☀️';
        label.textContent = '다크 모드';
    } else {
        document.documentElement.classList.remove('light');
        icon.textContent = '🌙';
        label.textContent = '라이트 모드';
    }
}

// ─── 이벤트 연결 ─────────────────────────────────────────────────
el.themeToggle.addEventListener('click', () => {
    isLight = !isLight;
    try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) { /* 무시 */ }
    applyTheme();
});

el.modeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    settings.mode = btn.dataset.mode;
    setActive(el.modeSeg, 'mode', settings.mode);
    updateSetupView();
});

el.levelSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    settings.pads = parseInt(btn.dataset.pads, 10);
    setActive(el.levelSeg, 'pads', settings.pads);
    updateSetupView();
});

el.speedSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    settings.speed = btn.dataset.speed;
    setActive(el.speedSeg, 'speed', settings.speed);
});

el.countSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const count = parseInt(btn.dataset.count, 10);
    const names = parseNames();
    // 이름이 이미 있으면 인원수에 맞춰 늘리거나 줄인다
    if (names.length > 0) {
        const list = names.slice(0, count);
        while (list.length < count) list.push(`참가자 ${list.length + 1}`);
        el.namesInput.value = list.join('\n');
    }
    settings.count = count;
    renderNamesPreview();
});

el.namesInput.addEventListener('input', renderNamesPreview);

el.startBtn.addEventListener('click', startGame);
el.readyBtn.addEventListener('click', startPartyTurn);
el.quitBtn.addEventListener('click', showSetup);
el.againBtn.addEventListener('click', startGame);
el.setupBtn.addEventListener('click', showSetup);

document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 숫자 1~9 → 패드 (숫자패드 포함)
    const match = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (match && !el.gameScreen.classList.contains('hidden')) {
        e.preventDefault();
        handlePress(parseInt(match[1], 10) - 1);
        return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
        // 포커스된 버튼은 브라우저 기본 동작(click)에 맡긴다
        if (tag === 'button') return;
        if (state.phase === 'setup') {
            e.preventDefault();
            startGame();
        } else if (state.phase === 'ready') {
            e.preventDefault();
            startPartyTurn();
        } else if (state.phase === 'result') {
            e.preventDefault();
            startGame();
        }
    }

    if (e.key === 'Escape' && state.phase !== 'setup') {
        showSetup();
    }
});

// ─── 초기화 ──────────────────────────────────────────────────────
applyTheme();
updateSetupView();
