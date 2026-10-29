// ─── 발표자 뽑기 룰렛 ────────────────────────────────────────────
// 강사가 프로젝터에 띄워 쓰는 발표자 뽑기. 룰렛이 감속하며 한 명(또는 여러 명)을 고른다.
// 당첨자는 회전 전에 균등 확률로 먼저 정하고, 룰렛은 그 칸에 멈추도록 각도를 맞춘다.
// 명단 입력은 js/roster.js (window.Roster). 이름은 항상 textContent / canvas fillText로만 그린다.

// ─── Constants ───────────────────────────────────────────────────
const NAMES_KEY  = 'gm_picker_names';  // localStorage: 명단
const STATE_KEY  = 'gm_picker_state';  // sessionStorage: 진행 상태
const THEME_KEY  = 'gm_picker_theme';
const SOUND_KEY  = 'gm_picker_sound';
const MIN_COUNT  = 2;
const MAX_COUNT  = 60;  // 한 반 + 여유
const PICKER_MAX = 12;  // 인원수 칩은 2~12
const MULTI_MAX  = 5;   // 한 번에 1~5명
const NAME_MAX   = 20;
const DEFAULT_NAMES = ['김민준', '이서연', '박지호', '최예은', '정하준', '강서윤'];
const COLORS = [
  '#00ff87','#ff006e','#0099ff','#ffbe0b',
  '#fb5607','#a855f7','#3a86ff','#ff99c8',
  '#06d6a0','#f72585'
];
const TAU = Math.PI * 2;
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPIN_MS_FIRST = REDUCED_MOTION ? 600 : 4600;  // 여러 명일 때 첫 회전
const SPIN_MS_NEXT  = REDUCED_MOTION ? 400 : 2600;  // 이어지는 회전

// ─── State ───────────────────────────────────────────────────────
let names = loadNames();
// game: null이면 준비 화면
// { pool: [이름], history: [[idx,...], ...] (한 회차 = 한 배열), absent: [idx],
//   cycles: [0, ...] (한 바퀴가 시작된 history 위치), removePicked, multi: 1~5, angle, phase: 'setup'|'play' }
let game = loadGame();
let spinning = false;
let roundPicks = [];  // 지금 돌리고 있는 회차에서 이미 뽑힌 idx
let roundWant = 0;    // 이번 회차에 뽑을 인원
let wheelIdx = [];    // 지금 룰렛에 그려진 idx 목록 (칸 순서)
let soundOn = loadSound();

const $ = id => document.getElementById(id);

// ─── Storage ─────────────────────────────────────────────────────
function loadNames() {
  const list = Roster.load(NAMES_KEY);
  if (list && list.length >= MIN_COUNT && list.length <= MAX_COUNT) return list;
  return DEFAULT_NAMES.slice();
}

function saveNames() { Roster.save(NAMES_KEY, names); }

function loadSound() {
  try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; }
}

function loadGame() {
  try {
    const g = JSON.parse(sessionStorage.getItem(STATE_KEY));
    if (!g || !Array.isArray(g.pool) || g.pool.length < MIN_COUNT || g.pool.length > MAX_COUNT) return null;
    if (!g.pool.every(s => typeof s === 'string' && s.trim())) return null;
    const n = g.pool.length;
    const isIdx = i => Number.isInteger(i) && i >= 0 && i < n;
    if (!Array.isArray(g.history) || !g.history.every(r =>
      Array.isArray(r) && r.length >= 1 && r.length <= MULTI_MAX && r.every(isIdx) && new Set(r).size === r.length)) return null;
    if (!Array.isArray(g.absent) || !g.absent.every(isIdx)) return null;
    if (!Array.isArray(g.cycles) || g.cycles[0] !== 0 ||
        !g.cycles.every((c, k) => Number.isInteger(c) && c <= g.history.length && (k === 0 || c > g.cycles[k - 1]))) {
      g.cycles = [0];
    }
    g.absent = [...new Set(g.absent)];
    g.removePicked = g.removePicked !== false;
    g.multi = Number.isInteger(g.multi) ? Roster.clamp(g.multi, 1, MULTI_MAX) : 1;
    g.angle = Number.isFinite(g.angle) ? g.angle % TAU : 0;
    g.phase = g.phase === 'setup' ? 'setup' : 'play';
    return g;
  } catch (e) { return null; }
}

function saveGame() {
  try {
    if (game) sessionStorage.setItem(STATE_KEY, JSON.stringify(game));
    else sessionStorage.removeItem(STATE_KEY);
  } catch (e) { /* 저장 불가 환경은 무시 */ }
}

// ─── Helpers ─────────────────────────────────────────────────────
function showToast(msg, type = 'error') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function colorOf(i) { return COLORS[i % COLORS.length]; }

// 0 이상 n 미만 정수 — 가능하면 crypto로 (편향 없이)
function randInt(n) {
  const c = window.crypto;
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do { c.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

function norm(a) { return ((a % TAU) + TAU) % TAU; }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function sameList(a, b) { return a.length === b.length && a.every((s, i) => s === b[i]); }

// 이번 바퀴(cycle)에서 뽑힌 idx
function pickedInCycle() {
  const start = game.cycles[game.cycles.length - 1];
  return new Set(game.history.slice(start).flat());
}

// 지금 룰렛에 올라갈 사람 (결석 제외, 옵션에 따라 이미 뽑힌 사람 제외)
function candidates() {
  const absent = new Set(game.absent);
  const picked = game.removePicked ? pickedInCycle() : new Set();
  return game.pool.map((_, i) => i).filter(i => !absent.has(i) && !picked.has(i));
}

// 모두 뽑혀서 더 돌릴 사람이 없는 상태 (출석자는 있음)
function isAllPicked() {
  const present = game.pool.length - game.absent.length;
  return game.removePicked && present > 0 && candidates().length === 0;
}

// ─── Sound (WebAudio, 지원 안 되면 조용히 생략) ──────────────────
let audioCtx = null;
let lastTick = 0;

function audio() {
  if (!soundOn) return null;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

function tone(freq, start, dur, type = 'triangle', vol = 0.15) {
  const ctx = audio();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  } catch (e) { /* 무시 */ }
}

function playTick() {
  const now = performance.now();
  if (now - lastTick < 35) return; // 너무 빠를 땐 건너뛴다
  lastTick = now;
  tone(1400, 0, 0.035, 'square', 0.05);
}

function playFanfare() {
  [523, 659, 784].forEach((f, i) => tone(f, i * 0.11, 0.16));
  tone(1047, 0.33, 0.55, 'triangle', 0.18);
  tone(784, 0.33, 0.55, 'sine', 0.08);
}

// ─── Setup: 명단 ─────────────────────────────────────────────────
const countPicker = Roster.countPicker($('countPicker'), {
  min: MIN_COUNT, max: PICKER_MAX,
  onPick: n => {
    Roster.resize(names, n, i => `학생 ${i + 1}`);
    renderPlayers();
    showToast(`${names.length}명으로 맞췄습니다`, 'success');
  }
});

Roster.pasteBox({
  input:     $('rosterInput'),
  hint:      $('rosterHint'),
  applyBtn:  $('rosterApplyBtn'),
  clearBtn:  $('rosterClearBtn'),
  toggleBtn: $('rosterToggle'),
  box:       $('rosterBox'),
  max: MAX_COUNT,
  onApply: found => {
    if (found.length < MIN_COUNT) {
      showToast(`이름을 ${MIN_COUNT}개 이상 찾지 못했습니다`); return;
    }
    const over = Math.max(0, found.length - MAX_COUNT);
    names = found.slice(0, MAX_COUNT).map(s => s.slice(0, NAME_MAX));
    renderPlayers();
    showToast(
      over ? `${names.length}명 적용 (최대 ${MAX_COUNT}명, ${over}명 제외)` : `${names.length}명 적용됐습니다`,
      over ? 'error' : 'success'
    );
  }
});

function renderPlayers() {
  const grid = $('playerGrid');
  grid.textContent = '';
  names.forEach((name, i) => {
    const li = el('li', 'player-item');
    const num = el('span', 'player-num', String(i + 1));
    num.style.color = colorOf(i);
    const input = el('input', 'player-input');
    input.type = 'text';
    input.value = name;
    input.dataset.idx = i;
    input.placeholder = '이름';
    input.maxLength = NAME_MAX;
    const rm = el('button', 'player-remove', '✕');
    rm.type = 'button';
    rm.dataset.idx = i;
    rm.title = '제거';
    li.append(num, input, rm);
    grid.appendChild(li);
  });
  $('playerBadge').textContent = names.length;
  $('addPlayerBtn').disabled = names.length >= MAX_COUNT;
  countPicker.update(names.length);
  saveNames();
}

$('playerGrid').addEventListener('input', e => {
  if (!e.target.classList.contains('player-input')) return;
  names[Number(e.target.dataset.idx)] = e.target.value;
  saveNames();
});

$('playerGrid').addEventListener('click', e => {
  const btn = e.target.closest('.player-remove');
  if (!btn) return;
  if (names.length <= MIN_COUNT) { showToast(`최소 ${MIN_COUNT}명 필요합니다`); return; }
  names.splice(Number(btn.dataset.idx), 1);
  renderPlayers();
});

$('addPlayerBtn').addEventListener('click', () => {
  if (names.length >= MAX_COUNT) { showToast(`최대 ${MAX_COUNT}명`); return; }
  names.push(`학생 ${names.length + 1}`);
  renderPlayers();
  const inputs = $('playerGrid').querySelectorAll('.player-input');
  const last = inputs[inputs.length - 1];
  last.focus(); last.select();
});

$('startBtn').addEventListener('click', () => {
  const list = names.map(n => n.trim());
  if (list.some(n => !n)) { showToast('모든 이름을 입력해주세요'); return; }
  if (game && sameList(game.pool, list)) {
    // 같은 명단이면 기록을 이어간다
    game.phase = 'play';
  } else {
    if (game && game.history.length && !confirm('명단이 바뀌었습니다. 지금까지의 뽑기 기록을 지우고 새로 시작할까요?')) return;
    const prev = game;
    game = {
      pool: list, history: [], absent: [], cycles: [0],
      removePicked: prev ? prev.removePicked : true,
      multi: prev ? prev.multi : 1,
      angle: 0, phase: 'play'
    };
  }
  if (new Set(list).size !== list.length) showToast('같은 이름이 있어요 — 기록에서 구분이 어려울 수 있습니다');
  saveGame();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ─── Wheel (canvas) ──────────────────────────────────────────────
const canvas = $('wheel');
const ctx = canvas.getContext ? canvas.getContext('2d') : null; // jsdom 등 canvas 미지원이면 null

function sizeCanvas() {
  if (!ctx) return;
  const box = canvas.getBoundingClientRect();
  const css = Math.max(200, Math.round(box.width || 520));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== css * dpr) {
    canvas.width = css * dpr;
    canvas.height = css * dpr;
  }
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// 칸 너비에 맞게 이름을 자른다
function fitText(text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function drawWheel() {
  if (!ctx || !game) return;
  const W = canvas.width;
  const r = W / 2;
  const n = wheelIdx.length;
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  ctx.translate(r, r);

  if (!n) {
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.96, 0, TAU);
    ctx.fillStyle = cssVar('--surface-hover', 'rgba(255,255,255,0.09)');
    ctx.fill();
    ctx.fillStyle = cssVar('--text-muted', '#999');
    ctx.font = `700 ${Math.round(W * 0.05)}px 'Noto Sans KR', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isAllPicked() ? '모두 뽑혔어요' : '돌릴 사람이 없어요', 0, -W * 0.16);
    ctx.restore();
    return;
  }

  const seg = TAU / n;
  const fontPx = Math.round(Roster.clamp(W * 0.5 / Math.max(n, 4), W * 0.022, W * 0.06));
  ctx.font = `900 ${fontPx}px 'Noto Sans KR', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  wheelIdx.forEach((idx, k) => {
    const a0 = game.angle + k * seg - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r * 0.96, a0, a0 + seg);
    ctx.closePath();
    ctx.fillStyle = colorOf(idx);
    ctx.fill();
    if (n > 1) {
      ctx.strokeStyle = 'rgba(5,5,26,0.35)';
      ctx.lineWidth = Math.max(1, W * 0.003);
      ctx.stroke();
    }
    // 이름: 칸 가운데를 따라 바깥쪽에 오른쪽 정렬
    ctx.save();
    ctx.rotate(a0 + seg / 2);
    ctx.fillStyle = '#05051a';
    const maxW = r * 0.62;
    ctx.fillText(fitText(game.pool[idx], maxW), r * 0.88, 0);
    ctx.restore();
  });
  // 테두리
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, 0, TAU);
  ctx.lineWidth = Math.max(2, W * 0.012);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  ctx.restore();
}

// 바늘(위쪽)이 가리키는 칸 번호
function pointerSlot(angle, n) {
  const seg = TAU / n;
  return Math.floor(norm(-angle) / seg) % n;
}

// 회차 시작: 뽑을 수 있는 만큼 순서대로 돌린다
function spin() {
  if (!game || game.phase !== 'play' || spinning) return;
  if (!$('resultOverlay').hidden) { closeResult(); return; }
  const pool = candidates();
  if (!pool.length) {
    if (isAllPicked()) { renderStage(); showToast('모두 뽑혔어요 — 아래에서 다시 시작을 골라주세요'); }
    else showToast('돌릴 사람이 없어요 — 결석 표시를 확인해주세요');
    return;
  }
  const want = Math.min(game.multi, pool.length);
  if (want < game.multi) showToast(`남은 사람이 ${pool.length}명이라 ${want}명만 뽑습니다`);
  audio(); // 사용자 제스처 안에서 오디오를 깨운다
  spinning = true;
  roundPicks = [];
  roundWant = want;
  renderSide();
  renderStage();
  spinOnce(want, 0);
}

function spinOnce(want, k) {
  const used = new Set(roundPicks);
  wheelIdx = candidates().filter(i => !used.has(i));
  const n = wheelIdx.length;
  const slot = randInt(n);          // 당첨 칸을 먼저 정한다 (균등 확률)
  const seg = TAU / n;
  const f = 0.15 + Math.random() * 0.7; // 칸 경계에 걸리지 않게
  const from = game.angle;
  const targetMod = norm(-(slot + f) * seg);
  const turns = (REDUCED_MOTION ? 1 : (k === 0 ? 6 : 4)) + randInt(2);
  const delta = norm(targetMod - norm(from)) + turns * TAU;
  const dur = k === 0 && want === 1 ? SPIN_MS_FIRST : (k === 0 ? SPIN_MS_FIRST * 0.8 : SPIN_MS_NEXT);
  const t0 = performance.now();
  let lastSlot = pointerSlot(from, n);
  canvas.classList.add('spinning');

  function frame(now) {
    const t = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart: 빠르게 시작해 천천히 멈춘다
    game.angle = from + delta * eased;
    drawWheel();
    const s = pointerSlot(game.angle, n);
    if (s !== lastSlot) { lastSlot = s; playTick(); }
    if (t < 1) { requestAnimationFrame(frame); return; }
    game.angle = norm(game.angle);
    roundPicks.push(wheelIdx[slot]);
    canvas.classList.remove('spinning');
    if (roundPicks.length < want) {
      tone(880, 0, 0.12, 'triangle', 0.12);
      renderStage();
      setTimeout(() => spinOnce(want, k + 1), REDUCED_MOTION ? 150 : 700);
    } else {
      finishRound();
    }
  }
  requestAnimationFrame(frame);
}

function finishRound() {
  game.history.push(roundPicks.slice());
  spinning = false;
  saveGame();
  const winners = roundPicks.slice();
  roundPicks = [];
  render();
  showResult(winners);
  playFanfare();
}

// ─── Result overlay ──────────────────────────────────────────────
function showResult(idxs) {
  const ov = $('resultOverlay');
  const list = $('resultNames');
  list.textContent = '';
  list.classList.toggle('many', idxs.length > 1);
  idxs.forEach((idx, k) => {
    const li = el('li', 'result-name', game.pool[idx]);
    li.style.setProperty('--c', colorOf(idx));
    li.style.animationDelay = `${k * 120}ms`;
    list.appendChild(li);
  });
  $('resultLabel').textContent = idxs.length > 1 ? `🎉 발표자 ${idxs.length}명` : '🎉 발표자';
  ov.hidden = false;
  confetti();
}

function closeResult() {
  $('resultOverlay').hidden = true;
  $('confetti').textContent = '';
}

function confetti() {
  const box = $('confetti');
  box.textContent = '';
  if (REDUCED_MOTION) return;
  for (let k = 0; k < 80; k++) {
    const p = el('span', 'confetti-piece');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = COLORS[k % COLORS.length];
    p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.animationDuration = `${2.2 + Math.random() * 1.6}s`;
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
    p.style.setProperty('--rot', `${360 + Math.random() * 720}deg`);
    box.appendChild(p);
  }
}

$('resultOverlay').addEventListener('click', closeResult);

// ─── Play: 조작 ──────────────────────────────────────────────────
$('spinBtn').addEventListener('click', spin);
$('hubBtn').addEventListener('click', spin);

// 룰렛 자체를 탭/클릭해도 돌린다 (마우스·터치·펜 공통)
let downOnWheel = false;
canvas.addEventListener('pointerdown', () => { downOnWheel = true; });
canvas.addEventListener('pointerleave', () => { downOnWheel = false; });
canvas.addEventListener('pointerup', () => {
  if (!downOnWheel) return;
  downOnWheel = false;
  spin();
});

document.addEventListener('keydown', e => {
  if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return;
  if (e.repeat) { if (e.key === ' ') e.preventDefault(); return; }
  const overlayOpen = !$('resultOverlay').hidden;
  if (overlayOpen) { e.preventDefault(); closeResult(); return; }
  if (e.key === 'Escape') return;
  if (!game || game.phase !== 'play') return;
  // 입력칸·버튼에 포커스가 있으면 그 요소의 기본 동작에 맡긴다
  const tag = e.target && e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag)) return;
  e.preventDefault();
  spin();
});

$('removePickedChk').addEventListener('change', e => {
  game.removePicked = e.target.checked;
  saveGame();
  render();
});

$('soundChk').addEventListener('change', e => {
  soundOn = e.target.checked;
  try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (err) {}
});

// 한 번에 뽑을 인원 칩 (1~5)
const multiChips = [];
for (let n = 1; n <= MULTI_MAX; n++) {
  const chip = el('button', 'count-chip', String(n));
  chip.type = 'button';
  chip.dataset.n = n;
  chip.title = `한 번에 ${n}명 뽑기`;
  chip.addEventListener('click', () => {
    if (spinning) return;
    game.multi = n;
    saveGame();
    renderSide();
  });
  $('multiChips').appendChild(chip);
  multiChips.push(chip);
}

$('attList').addEventListener('click', e => {
  const btn = e.target.closest('.att-item');
  if (!btn || spinning) return;
  const idx = Number(btn.dataset.idx);
  const pos = game.absent.indexOf(idx);
  if (pos >= 0) game.absent.splice(pos, 1);
  else game.absent.push(idx);
  saveGame();
  render();
});

$('undoBtn').addEventListener('click', () => {
  if (spinning || !game.history.length) return;
  const last = game.history.pop();
  while (game.cycles.length > 1 && game.cycles[game.cycles.length - 1] > game.history.length) game.cycles.pop();
  saveGame();
  render();
  showToast(`되돌렸습니다: ${last.map(i => game.pool[i]).join(', ')}`, 'success');
});

function resetHistory() {
  game.history = [];
  game.cycles = [0];
  saveGame();
  render();
}

$('clearHistoryBtn').addEventListener('click', () => {
  if (spinning || !game.history.length) return;
  if (!confirm('뽑기 기록을 모두 지울까요? 모든 사람이 다시 룰렛에 올라갑니다.')) return;
  resetHistory();
  showToast('기록을 지웠습니다', 'success');
});

$('newCycleBtn').addEventListener('click', () => {
  if (spinning) return;
  if (game.cycles[game.cycles.length - 1] < game.history.length) game.cycles.push(game.history.length);
  saveGame();
  render();
  showToast('모두 다시 룰렛에 올렸습니다 (기록은 유지)', 'success');
});

$('resetAllBtn').addEventListener('click', () => {
  if (spinning) return;
  resetHistory();
  showToast('기록을 지우고 처음부터 시작합니다', 'success');
});

$('editRosterBtn').addEventListener('click', () => {
  if (spinning) return;
  names = game.pool.slice();
  game.phase = 'setup';
  saveGame();
  render();
});

// ─── Render ──────────────────────────────────────────────────────
function render() {
  const playing = !!game && game.phase === 'play';
  $('setupSection').hidden = playing;
  $('playSection').hidden = !playing;
  if (!playing) {
    renderPlayers();
    $('setupTip').textContent = game && game.history.length
      ? `명단을 그대로 두고 "룰렛 준비"를 누르면 뽑기 기록(${game.history.length}회)이 이어집니다.`
      : '명단은 이 기기에 저장돼요. 프로젝터에 띄워 함께 보세요.';
    return;
  }
  if (!spinning) wheelIdx = candidates();
  renderSide();
  renderStage();
  sizeCanvas();
  drawWheel();
}

function renderStage() {
  const allPicked = !spinning && isAllPicked();
  $('allDone').hidden = !allPicked;
  $('spinActions').hidden = allPicked;
  $('spinBtn').disabled = spinning;
  $('hubBtn').disabled = spinning;
  const status = $('stageStatus');
  status.textContent = '';
  if (spinning) {
    status.textContent = roundWant > 1 ? `돌리는 중… (${roundPicks.length + 1} / ${roundWant})` : '돌리는 중…';
    if (roundPicks.length) {
      status.appendChild(document.createTextNode(' — '));
      status.appendChild(el('b', null, roundPicks.map(i => game.pool[i]).join(', ')));
    }
    return;
  }
  const last = game.history[game.history.length - 1];
  if (last) {
    status.appendChild(document.createTextNode('방금 뽑힌 사람: '));
    status.appendChild(el('b', null, last.map(i => game.pool[i]).join(', ')));
  } else {
    status.textContent = `룰렛에 ${wheelIdx.length}명 · 스페이스·Enter·룰렛 터치로 돌리기`;
  }
}

function renderSide() {
  $('removePickedChk').checked = game.removePicked;
  $('soundChk').checked = soundOn;
  multiChips.forEach(c => {
    c.classList.toggle('active', Number(c.dataset.n) === game.multi);
    c.disabled = spinning;
  });

  // 출석 목록
  const absent = new Set(game.absent);
  const picked = pickedInCycle();
  const order = new Map();
  game.history.flat().forEach((idx, k) => { if (!order.has(idx)) order.set(idx, k + 1); });
  const att = $('attList');
  att.textContent = '';
  game.pool.forEach((name, i) => {
    const li = el('li');
    const btn = el('button', 'att-item');
    btn.type = 'button';
    btn.dataset.idx = i;
    btn.disabled = spinning;
    btn.classList.toggle('absent', absent.has(i));
    btn.classList.toggle('picked', game.removePicked && picked.has(i));
    btn.setAttribute('aria-pressed', String(absent.has(i)));
    btn.title = absent.has(i) ? '결석 — 눌러서 출석으로' : '눌러서 결석(제외)으로';
    const dot = el('span', 'att-dot');
    dot.style.background = colorOf(i);
    btn.append(dot, el('span', 'att-name', name));
    if (absent.has(i)) btn.appendChild(el('span', 'att-tag', '결석'));
    else if (game.removePicked && picked.has(i)) btn.appendChild(el('span', 'att-tag', '✓'));
    li.appendChild(btn);
    att.appendChild(li);
  });
  $('remainBadge').textContent = `남은 ${candidates().length} / ${game.pool.length - game.absent.length}`;

  // 뽑힌 순서
  const hist = $('historyList');
  hist.textContent = '';
  let num = 0;
  game.history.forEach((round, r) => {
    if (r > 0 && game.cycles.includes(r)) hist.appendChild(el('li', 'history-sep', '— 한 바퀴 더 —'));
    const li = el('li', 'history-item');
    const from = num + 1;
    num += round.length;
    li.appendChild(el('span', 'history-num', round.length > 1 ? `${from}–${num}` : String(from)));
    const who = el('span', 'history-names');
    round.forEach((idx, k) => {
      if (k) who.appendChild(document.createTextNode(', '));
      const b = el('b', null, game.pool[idx]);
      b.style.color = colorOf(idx);
      who.appendChild(b);
    });
    li.appendChild(who);
    hist.appendChild(li);
  });
  $('historyBadge').textContent = num;
  $('historyEmpty').hidden = game.history.length > 0;
  $('undoBtn').disabled = spinning || !game.history.length;
  $('clearHistoryBtn').disabled = spinning || !game.history.length;
  $('editRosterBtn').disabled = spinning;
  hist.scrollTop = hist.scrollHeight;
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (game && game.phase === 'play') { sizeCanvas(); drawWheel(); } }, 120);
});

// ─── Theme Toggle ────────────────────────────────────────────────
const themeToggle = $('themeToggle');
const toggleIcon  = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');
let isLight = false;
try { isLight = localStorage.getItem(THEME_KEY) === 'light'; } catch (e) {}

function applyTheme() {
  document.documentElement.classList.toggle('light', isLight);
  toggleIcon.textContent  = isLight ? '☀️' : '🌙';
  toggleLabel.textContent = isLight ? '다크 모드' : '라이트 모드';
}

themeToggle.addEventListener('click', () => {
  isLight = !isLight;
  try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) {}
  applyTheme();
  if (game && game.phase === 'play') drawWheel();
});

// ─── Init ────────────────────────────────────────────────────────
applyTheme();
render();
// 웹폰트가 늦게 오면 룰렛 글씨를 다시 그린다
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (game && game.phase === 'play') drawWheel(); });
