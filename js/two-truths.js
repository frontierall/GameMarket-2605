// ─── 둘은 진실 ───────────────────────────────────────────────────
// 발표자가 문장 3개(진실 2·거짓 1)를 쓰고, 청중이 손을 들어 거짓을 고른다.
// 점수: 거짓을 맞힌 사람 수 → 청중 팀, 진실에 손 든(속은) 사람 수 → 발표자 '속이기 점수'.
// 명단 입력은 js/roster.js (window.Roster).

// ─── Constants ───────────────────────────────────────────────────
const STATE_KEY  = 'gm_two-truths_state';  // sessionStorage: 진행 상태
const NAMES_KEY  = 'gm_two-truths_names';  // localStorage: 명단
const THEME_KEY  = 'gm_two-truths_theme';
const MIN_COUNT  = 2;
const MAX_COUNT  = 40;  // 붙여넣기·추가로 넣을 수 있는 최대 인원
const PICKER_MAX = 12;  // 인원수 칩은 2~12
const STATEMENT_MAX = 120;
const DEFAULT_NAMES = ['김민준', '이서연', '박지호', '최예은'];
const COLORS = [
  '#00ff87','#ff006e','#0099ff','#ffbe0b',
  '#fb5607','#a855f7','#3a86ff','#ff99c8',
  '#06d6a0','#f72585'
];
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── State ───────────────────────────────────────────────────────
let names = loadNames();
// game: null이면 준비 화면
// { order: [이름], turn, phase: 'cover'|'write'|'hidden'|'vote'|'reveal'|'done',
//   statements: [s,s,s], lie: 0~2 (-1 = 미선택), votes: [n,n,n], masked: bool,
//   history: [{ idx, statements, lie, votes, correct, fooled } | { idx, skipped: true }] }
let game = loadGame();
let revealTimers = [];

const $ = id => document.getElementById(id);
const stage = $('stage');

// ─── Storage ─────────────────────────────────────────────────────
function loadNames() {
  const list = Roster.load(NAMES_KEY);
  if (list && list.length >= MIN_COUNT && list.length <= MAX_COUNT) return list;
  return DEFAULT_NAMES.slice();
}

function saveNames() { Roster.save(NAMES_KEY, names); }

function blankRound() {
  return { statements: ['', '', ''], lie: -1, votes: [0, 0, 0] };
}

function loadGame() {
  try {
    const g = JSON.parse(sessionStorage.getItem(STATE_KEY));
    const isStr3 = a => Array.isArray(a) && a.length === 3 && a.every(s => typeof s === 'string');
    const isNum3 = a => Array.isArray(a) && a.length === 3 && a.every(n => Number.isInteger(n) && n >= 0);
    const phases = ['cover', 'write', 'hidden', 'vote', 'reveal', 'done'];
    if (!g || !Array.isArray(g.order) || g.order.length < MIN_COUNT || !g.order.every(s => typeof s === 'string')) return null;
    if (!Number.isInteger(g.turn) || g.turn < 0 || g.turn > g.order.length) return null;
    if (!phases.includes(g.phase) || !isStr3(g.statements) || !isNum3(g.votes)) return null;
    if (![-1, 0, 1, 2].includes(g.lie) || !Array.isArray(g.history)) return null;
    if (g.turn === g.order.length) g.phase = 'done';
    const last = g.history[g.history.length - 1];
    if (g.phase === 'reveal' && !(last && last.idx === g.turn && !last.skipped)) g.phase = 'vote';
    if (['hidden', 'vote', 'reveal'].includes(g.phase) && (g.lie < 0 || g.statements.some(s => !s.trim()))) g.phase = 'cover';
    g.masked = g.masked !== false;
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
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function showToast(msg, type = 'error') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function colorOf(i) { return COLORS[i % COLORS.length]; }

function presenter() { return game.order[game.turn]; }

// 점수는 기록에서 매번 다시 계산한다 (되돌리기·새로고침에도 어긋나지 않게)
function getScores() {
  const fool = game.order.map(() => 0);
  const played = game.order.map(() => false);
  let audience = 0;
  game.history.forEach(h => {
    played[h.idx] = true;
    if (h.skipped) return;
    fool[h.idx] += h.fooled;
    audience += h.correct;
  });
  return { fool, played, audience };
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

function copyText(text) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    return ok ? Promise.resolve() : Promise.reject();
  };
  const p = navigator.clipboard && navigator.clipboard.writeText
    ? navigator.clipboard.writeText(text).catch(fallback)
    : fallback();
  p.then(() => showToast('결과가 복사됐습니다!', 'success'))
   .catch(() => showToast('복사에 실패했습니다'));
}

function buildResultText() {
  const { fool, audience } = getScores();
  const lines = ['[둘은 진실] 결과', '', `👥 청중 팀: ${audience}점 (거짓을 맞힌 사람 수 합계)`, '', '🎭 속이기 점수'];
  rankEntries(fool).forEach(r => lines.push(`${r.rank}. ${r.name} — ${r.score}점`));
  const rounds = game.history.filter(h => !h.skipped);
  if (rounds.length) {
    lines.push('', '📜 라운드 기록');
    rounds.forEach((h, n) => {
      lines.push(`${n + 1}. ${game.order[h.idx]} — 맞힘 ${h.correct}명 / 속음 ${h.fooled}명`);
      h.statements.forEach((s, i) => {
        lines.push(`   ${i === h.lie ? '✗ 거짓' : '○ 진실'} ${s} (${h.votes[i]}표)`);
      });
    });
  }
  return lines.join('\n');
}

// 속이기 점수 순위 (동점은 같은 순위)
function rankEntries(fool) {
  const entries = game.order.map((name, i) => ({ name, i, score: fool[i] }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  entries.forEach((e, k) => {
    e.rank = k > 0 && entries[k - 1].score === e.score ? entries[k - 1].rank : k + 1;
  });
  return entries;
}

// ─── Setup: 명단 ─────────────────────────────────────────────────
const countPicker = Roster.countPicker($('countPicker'), {
  min: MIN_COUNT, max: PICKER_MAX,
  onPick: n => {
    Roster.resize(names, n, i => `참가자 ${i + 1}`);
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
    names = found.slice(0, MAX_COUNT);
    renderPlayers();
    showToast(
      over ? `${names.length}명 적용 (최대 ${MAX_COUNT}명, ${over}명 제외)` : `${names.length}명 적용됐습니다`,
      over ? 'error' : 'success'
    );
  }
});

function renderPlayers(animate) {
  const grid = $('playerGrid');
  grid.innerHTML = names.map((name, i) => `
    <li class="player-item${animate ? ' shuffled' : ''}" style="animation-delay:${i * 25}ms">
      <span class="player-num" style="color:${colorOf(i)}">${i + 1}</span>
      <input class="player-input" type="text" value="${escHtml(name)}" data-idx="${i}" placeholder="참가자 이름" maxlength="20">
      <button class="player-remove" type="button" data-idx="${i}" title="제거">✕</button>
    </li>`).join('');
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
  names.push(`참가자 ${names.length + 1}`);
  renderPlayers();
  const inputs = $('playerGrid').querySelectorAll('.player-input');
  const last = inputs[inputs.length - 1];
  last.focus(); last.select();
});

$('shuffleBtn').addEventListener('click', () => {
  shuffle(names);
  renderPlayers(true);
  showToast('발표 순서를 섞었습니다', 'success');
});

$('startBtn').addEventListener('click', () => {
  const list = names.map(n => n.trim());
  if (list.some(n => !n)) { showToast('모든 참가자 이름을 입력해주세요'); return; }
  startGame(list);
});

function startGame(order) {
  game = { order, turn: 0, phase: 'cover', masked: true, history: [], ...blankRound() };
  saveGame();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── Game Flow ───────────────────────────────────────────────────
function goNext() {
  game.turn++;
  Object.assign(game, blankRound());
  game.phase = game.turn >= game.order.length ? 'done' : 'cover';
}

const actions = {
  startWrite() { game.phase = 'write'; },
  cancelWrite() { game.phase = 'cover'; },
  skip() {
    if (!confirm(`${presenter()}님 차례를 건너뛸까요?`)) return false;
    game.history.push({ idx: game.turn, skipped: true });
    goNext();
  },
  pickLie(btn) {
    game.lie = Number(btn.dataset.idx);
    stage.querySelectorAll('.write-row').forEach((row, i) => {
      row.classList.toggle('is-lie', i === game.lie);
      row.querySelector('.lie-pick').setAttribute('aria-pressed', i === game.lie);
    });
    saveGame();
    return false; // 쓰던 글자가 날아가지 않게 다시 그리지 않는다
  },
  doneWrite() {
    const empty = game.statements.findIndex(s => !s.trim());
    if (empty >= 0) {
      showToast(`${empty + 1}번 문장을 써 주세요`);
      stage.querySelectorAll('.write-input')[empty].focus();
      return false;
    }
    if (game.lie < 0) { showToast('거짓인 문장에 "거짓" 표시를 해주세요'); return false; }
    game.statements = game.statements.map(s => s.trim());
    if (document.activeElement) document.activeElement.blur();
    game.phase = 'hidden';
  },
  editAgain() { game.phase = 'cover'; },
  open() { game.phase = 'vote'; },
  vote(btn) {
    const i = Number(btn.dataset.idx);
    game.votes[i] = Math.max(0, Math.min(999, game.votes[i] + Number(btn.dataset.d)));
    // 숫자만 바꾼다 (전체를 다시 그리면 연타가 끊긴다)
    const card = stage.querySelector(`.s-card[data-idx="${i}"]`);
    const count = card.querySelector('.vote-count');
    count.textContent = game.votes[i];
    count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
    card.querySelector('[data-d="-1"]').disabled = game.votes[i] === 0;
    $('voteTotal').textContent = sum(game.votes);
    saveGame();
    return false;
  },
  reveal() {
    const correct = game.votes[game.lie];
    const fooled = sum(game.votes) - correct;
    game.history.push({
      idx: game.turn, statements: game.statements.slice(), lie: game.lie,
      votes: game.votes.slice(), correct, fooled
    });
    game.phase = 'reveal';
    saveGame();
    render({ animate: true });
    return false;
  },
  undoVote() {
    const last = game.history[game.history.length - 1];
    if (last && last.idx === game.turn && !last.skipped) game.history.pop();
    game.phase = 'vote';
  },
  next() { goNext(); },
  finish() {
    if (!confirm('지금까지의 점수로 최종 결과를 볼까요?')) return false;
    // 진행 중이던 라운드는 버리고 끝낸다 (이미 공개한 라운드는 기록에 있다)
    game.turn = game.order.length;
    Object.assign(game, blankRound());
    game.phase = 'done';
  },
  copy() { copyText(buildResultText()); return false; },
  replay() {
    startGame(shuffle(game.order.slice()));
    showToast('순서를 섞어 새 게임을 시작합니다', 'success');
    return false;
  },
  quit() {
    if (game.phase !== 'done' && !confirm('게임을 끝내고 명단 화면으로 갈까요? 점수는 사라집니다.')) return false;
    names = game.order.slice();
    game = null;
  }
};

$('playSection').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled || !game || !actions[btn.dataset.action]) return;
  const changed = actions[btn.dataset.action](btn);
  if (changed === false) return;
  saveGame();
  render();
});

stage.addEventListener('input', e => {
  if (!e.target.classList.contains('write-input')) return;
  game.statements[Number(e.target.dataset.idx)] = e.target.value;
  saveGame();
});

stage.addEventListener('change', e => {
  if (e.target.id !== 'maskCheck') return;
  game.masked = e.target.checked;
  stage.querySelector('.write').classList.toggle('masked', game.masked);
  saveGame();
});

// ─── Render ──────────────────────────────────────────────────────
function render(opts = {}) {
  revealTimers.forEach(clearTimeout);
  revealTimers = [];
  $('countdown').className = 'countdown';

  $('setupSection').hidden = !!game;
  $('playSection').hidden = !game;
  const pill = $('progressPill');
  if (!game) {
    pill.hidden = true;
    renderPlayers();
    return;
  }
  pill.hidden = false;
  pill.textContent = game.phase === 'done'
    ? '🏆 최종 결과'
    : `${game.turn + 1} / ${game.order.length}번째 · 발표자 ${presenter()}`;

  const view = {
    cover: renderCover, write: renderWrite, hidden: renderHidden,
    vote: renderVote, reveal: renderReveal, done: renderDone
  }[game.phase];
  stage.className = `stage phase-${game.phase}`;
  stage.innerHTML = view(opts);
  renderScoreboard();

  if (game.phase === 'write') {
    const first = [...stage.querySelectorAll('.write-input')].find(t => !t.value) || stage.querySelector('.write-input');
    first.focus();
  }
  if (game.phase === 'reveal' && opts.animate) playReveal();
}

function renderCover() {
  const name = escHtml(presenter());
  const written = game.statements.some(s => s.trim());
  return `
    <div class="cover">
      <div class="cover-emoji">🙈</div>
      <div class="cover-title"><b style="color:${colorOf(game.turn)}">${name}</b>님 차례</div>
      <p class="cover-text">발표자만 화면을 봐 주세요.<br>다른 분들은 잠시 눈을 돌려 주세요!</p>
      <div class="stage-actions">
        <button class="btn btn-primary" type="button" data-action="startWrite">✍️ ${written ? '이어서 쓰기' : '문장 쓰기'}</button>
        <button class="btn btn-secondary" type="button" data-action="skip">건너뛰기</button>
      </div>
    </div>`;
}

function renderWrite() {
  const rows = game.statements.map((s, i) => `
    <div class="write-row${game.lie === i ? ' is-lie' : ''}">
      <span class="write-num">${i + 1}</span>
      <textarea class="write-input" data-idx="${i}" rows="2" maxlength="${STATEMENT_MAX}" placeholder="나에 대한 문장 ${i + 1}">${escHtml(s)}</textarea>
      <button class="lie-pick" type="button" data-action="pickLie" data-idx="${i}" aria-pressed="${game.lie === i}">거짓</button>
    </div>`).join('');
  return `
    <div class="write${game.masked ? ' masked' : ''}">
      <div class="stage-title">${escHtml(presenter())}님, 나에 대한 문장 3개를 써 주세요</div>
      <p class="stage-sub">둘은 진실, 하나는 거짓 — 거짓인 문장에 <b>거짓</b> 표시를 하세요</p>
      <label class="mask-toggle"><input type="checkbox" id="maskCheck"${game.masked ? ' checked' : ''}> 쓰고 있는 칸 말고는 흐리게</label>
      <div class="write-rows">${rows}</div>
      <div class="stage-actions">
        <button class="btn btn-primary" type="button" data-action="doneWrite">🙈 가리고 준비 완료</button>
        <button class="btn btn-secondary" type="button" data-action="cancelWrite">가리기</button>
      </div>
    </div>`;
}

function renderHidden() {
  return `
    <div class="cover">
      <div class="cover-emoji">🤫</div>
      <div class="cover-title"><b style="color:${colorOf(game.turn)}">${escHtml(presenter())}</b>님 준비 완료!</div>
      <p class="cover-text">문장 3개가 가려져 있어요.<br>이제 모두 화면을 봐 주세요.</p>
      <div class="stage-actions">
        <button class="btn btn-primary btn-big" type="button" data-action="open">👀 공개</button>
        <button class="btn btn-secondary" type="button" data-action="editAgain">✏️ 다시 고치기</button>
      </div>
    </div>`;
}

function statementCards(mode) {
  return game.statements.map((s, i) => {
    const v = game.votes[i];
    const ctrl = mode === 'vote'
      ? `<div class="vote-ctrl">
           <button class="vote-btn" type="button" data-action="vote" data-idx="${i}" data-d="-1" aria-label="${i + 1}번 한 표 빼기"${v === 0 ? ' disabled' : ''}>−</button>
           <span class="vote-count">${v}</span>
           <button class="vote-btn plus" type="button" data-action="vote" data-idx="${i}" data-d="1" aria-label="${i + 1}번 한 표 더하기">＋</button>
         </div>`
      : `<div class="vote-ctrl static">🙋 <span class="vote-count">${v}</span>명</div>`;
    const cls = mode === 'reveal' ? (i === game.lie ? ' is-lie' : ' is-truth') : '';
    return `
      <div class="s-card${cls}" data-idx="${i}">
        <div class="s-num">${i + 1}</div>
        <div class="s-text">${escHtml(s)}</div>
        ${mode === 'reveal' ? `<div class="s-stamp">${i === game.lie ? '거짓!' : '진실'}</div>` : ''}
        ${ctrl}
      </div>`;
  }).join('');
}

function renderVote() {
  return `
    <div class="vote">
      <div class="stage-title">${escHtml(presenter())}님의 문장 — 어느 것이 거짓일까요?</div>
      <p class="stage-sub">거짓이라고 생각하는 문장에 손을 들어 주세요. 진행자가 손 든 사람 수를 입력합니다.</p>
      <div class="cards">${statementCards('vote')}</div>
      <div class="vote-total">손 든 사람 합계 <b id="voteTotal">${sum(game.votes)}</b>명</div>
      <div class="stage-actions">
        <button class="btn btn-primary btn-big" type="button" data-action="reveal">🥁 거짓 공개!</button>
      </div>
    </div>`;
}

function renderReveal(opts) {
  const h = game.history[game.history.length - 1];
  const total = h.correct + h.fooled;
  let verdict;
  if (!total) verdict = '🤔 아무도 손을 들지 않았어요';
  else if (h.correct === total) verdict = '🎯 청중 완승! 모두 맞혔어요';
  else if (!h.correct) verdict = '🎭 완벽한 연기! 아무도 못 맞혔어요';
  else if (h.fooled > h.correct) verdict = '🎭 연기 성공! 절반 넘게 속았어요';
  else verdict = '🤝 접전! 청중이 조금 더 날카로웠어요';
  const isLast = game.turn >= game.order.length - 1;
  const nextName = isLast ? '' : escHtml(game.order[game.turn + 1]);
  return `
    <div class="vote">
      <div class="stage-title">${escHtml(presenter())}님의 거짓은…</div>
      <div class="cards${opts.animate ? ' suspense' : ' revealed no-anim'}">${statementCards('reveal')}</div>
      <div class="round-result${opts.animate ? ' pending' : ''}">
        <div class="rr-verdict">${verdict}</div>
        <div class="rr-row">
          <div class="rr-item audience">🎯 맞힌 사람 <b>${h.correct}</b>명<small>청중 팀 +${h.correct}</small></div>
          <div class="rr-item presenter">🎭 속은 사람 <b>${h.fooled}</b>명<small>${escHtml(presenter())} 속이기 +${h.fooled}</small></div>
        </div>
        <div class="stage-actions">
          <button class="btn btn-primary" type="button" data-action="next">${isLast ? '🏆 최종 결과 보기' : `다음 발표자 ▶ ${nextName}`}</button>
          <button class="btn btn-secondary" type="button" data-action="undoVote">↩ 투표 고치기</button>
        </div>
      </div>
    </div>`;
}

// 극적 공개: 카드가 떨다가 3·2·1 → 진실이 먼저 물러나고 거짓이 뒤집힌다
function playReveal() {
  const cards = stage.querySelector('.cards');
  const result = stage.querySelector('.round-result');
  const cd = $('countdown');
  const step = REDUCED_MOTION ? 0 : 650;
  const at = (ms, fn) => revealTimers.push(setTimeout(fn, ms));
  ['3', '2', '1'].forEach((n, k) => at(k * step, () => {
    if (!step) return;
    cd.textContent = n;
    cd.className = 'countdown';
    void cd.offsetWidth;
    cd.className = 'countdown show';
  }));
  at(3 * step, () => {
    cd.className = 'countdown';
    cards.classList.remove('suspense');
    cards.classList.add('revealed');
  });
  at(3 * step + (step ? 1500 : 0), () => {
    result.classList.remove('pending');
    if (step) burst(stage.querySelector('.s-card.is-lie'));
  });
}

// 거짓 카드 주변으로 색종이 조각을 흩뿌린다
function burst(card) {
  if (!card) return;
  for (let k = 0; k < 18; k++) {
    const p = document.createElement('span');
    p.className = 'spark';
    const ang = (Math.PI * 2 * k) / 18;
    p.style.setProperty('--dx', `${Math.cos(ang) * (90 + Math.random() * 60)}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * (70 + Math.random() * 50)}px`);
    p.style.background = COLORS[k % COLORS.length];
    card.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}

function renderDone() {
  const { fool, audience } = getScores();
  const rounds = game.history.filter(h => !h.skipped);
  const ranking = rankEntries(fool).map(r => `
    <li class="rank-item${r.rank === 1 && r.score > 0 ? ' top' : ''}">
      <span class="rank-no">${r.rank === 1 && r.score > 0 ? '👑' : r.rank}</span>
      <span class="rank-name">${escHtml(r.name)}</span>
      <span class="rank-score">${r.score}<small>점</small></span>
    </li>`).join('');
  const log = rounds.map(h => `
    <li>
      <b>${escHtml(game.order[h.idx])}</b> — 맞힘 ${h.correct} · 속음 ${h.fooled}
      <ul>${h.statements.map((s, i) => `<li class="${i === h.lie ? 'lie' : ''}">${i === h.lie ? '✗' : '○'} ${escHtml(s)} <small>(${h.votes[i]}표)</small></li>`).join('')}</ul>
    </li>`).join('');
  return `
    <div class="final">
      <div class="stage-title">🏆 최종 결과</div>
      <div class="final-audience">👥 청중 팀 <b>${audience}</b>점<small>거짓을 맞힌 사람 수 합계 · ${rounds.length}라운드</small></div>
      <div class="final-sub">🎭 속이기 점수 순위</div>
      <ol class="ranking">${ranking}</ol>
      <div class="stage-actions">
        <button class="btn btn-primary" type="button" data-action="copy">📋 결과 복사</button>
        <button class="btn btn-secondary" type="button" data-action="replay">🔁 섞어서 다시</button>
        <button class="btn btn-secondary" type="button" data-action="quit">⚙️ 명단 바꾸기</button>
      </div>
      ${rounds.length ? `<details class="round-log"><summary>📜 라운드 기록</summary><ol>${log}</ol></details>` : ''}
    </div>`;
}

function renderScoreboard() {
  const { fool, played, audience } = getScores();
  const done = game.phase === 'done';
  const items = game.order.map((name, i) => {
    const skipped = game.history.some(h => h.idx === i && h.skipped);
    const cls = [i === game.turn && !done ? 'current' : '', played[i] ? 'played' : '', skipped ? 'skipped' : ''].join(' ');
    return `
      <li class="sb-item ${cls}">
        <span class="sb-dot" style="background:${colorOf(i)}"></span>
        <span class="sb-name">${escHtml(name)}</span>
        <span class="sb-score">${skipped ? '–' : fool[i]}</span>
      </li>`;
  }).join('');
  const playedCount = played.filter(Boolean).length;
  $('scoreboard').innerHTML = `
    <div class="panel-header">점수판 <span class="panel-badge">${playedCount} / ${game.order.length}</span></div>
    <div class="sb-audience">👥 청중 팀 <b>${audience}</b><small>점</small></div>
    <div class="sb-sub">🎭 속이기 점수</div>
    <ol class="sb-list">${items}</ol>
    <div class="sb-actions">
      <button class="btn-icon" type="button" data-action="copy">📋 결과 복사</button>
      ${done ? '' : '<button class="btn-icon" type="button" data-action="finish">⏹ 여기서 끝내기</button>'}
      <button class="btn-icon" type="button" data-action="quit">⚙️ 명단 화면</button>
    </div>`;
}

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
});

// ─── Init ────────────────────────────────────────────────────────
applyTheme();
render();
