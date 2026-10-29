// ─── 팀 셔플러 ───────────────────────────────────────────────────
// 강사가 프로젝터에 띄워 조를 편성한다. 이름 카드가 한 장씩 날아가 조 칸에 꽂힌다.
// 제약: 같은 팀 금지 짝, 조장 후보(조마다 고르게). 명단 입력은 js/roster.js (window.Roster).
// 배치 로직(TeamShuffleLogic)은 DOM 없이 동작해 node에서 require()로 시험할 수 있다.
(function (global) {
  'use strict';

  // ═══ 배치 로직 (순수 함수) ═════════════════════════════════════
  const Logic = (function () {
    // Fisher–Yates — 모든 순열이 같은 확률 (Math.random 정렬은 치우친다)
    function shuffle(arr, rng = Math.random) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    function range(n) { return Array.from({ length: n }, (_, i) => i); }

    // n명을 k개 조로 — 남는 인원은 앞 조부터 1명씩 (차이 최대 1)
    function teamSizes(n, k) {
      const base = Math.floor(n / k), extra = n % k;
      return range(k).map(j => base + (j < extra ? 1 : 0));
    }

    // 'teams' → value개 조, 'size' → 한 조 value명 기준 (남는 인원은 앞 조에 더함)
    function teamCountFor(n, mode, value) {
      return mode === 'size' ? Math.max(1, Math.floor(n / value)) : value;
    }

    // 조장 후보 L명을 조마다 floor/ceil로 — 1명 더 받는 조는 무작위
    function leaderQuotas(sizes, L, rng) {
      const k = sizes.length, base = Math.floor(L / k), extra = L % k;
      const q = sizes.map(() => base);
      const eligible = shuffle(range(k).filter(j => sizes[j] >= base + 1), rng);
      for (let t = 0; t < extra; t++) q[eligible[t]]++;
      return q;
    }

    function buildAdj(n, pairs) {
      const adj = range(n).map(() => new Set());
      pairs.forEach(([a, b]) => {
        if (a === b || a < 0 || b < 0 || a >= n || b >= n) return;
        adj[a].add(b); adj[b].add(a);
      });
      return adj;
    }

    function pairKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

    // 서로 모두 금지로 이어진 가장 큰 무리 (Bron–Kerbosch, 피벗) — 이게 조 수보다 크면 불가능
    function maxClique(adj) {
      let best = [];
      function bk(R, P, X) {
        if (!P.length && !X.length) { if (R.length > best.length) best = R.slice(); return; }
        if (R.length + P.length <= best.length) return;
        const pivot = P.concat(X).reduce((a, b) => (adj[b].size > adj[a].size ? b : a));
        for (const v of P.filter(u => !adj[pivot].has(u))) {
          bk(R.concat(v), P.filter(u => adj[v].has(u)), X.filter(u => adj[v].has(u)));
          P = P.filter(u => u !== v);
          X = X.concat(v);
        }
      }
      bk([], range(adj.length).filter(i => adj[i].size), []);
      return best;
    }

    // 2개 조일 때: 금지 짝이 홀수 고리를 이루면 불가능. 고리를 돌려준다 (없으면 null)
    function oddCycle(adj) {
      const n = adj.length, color = new Array(n).fill(-1), parent = new Array(n).fill(-1);
      for (let s = 0; s < n; s++) {
        if (color[s] !== -1 || !adj[s].size) continue;
        color[s] = 0;
        const queue = [s];
        while (queue.length) {
          const u = queue.shift();
          for (const v of adj[u]) {
            if (color[v] === -1) { color[v] = 1 - color[u]; parent[v] = u; queue.push(v); }
            else if (color[v] === color[u]) {
              const up = [];
              for (let x = u; x !== -1; x = parent[x]) up.push(x);
              const onUp = new Set(up), down = [];
              let x = v;
              while (!onUp.has(x)) { down.push(x); x = parent[x]; }
              return up.slice(0, up.indexOf(x) + 1).concat(down.reverse());
            }
          }
        }
      }
      return null;
    }

    function pairsWithin(group, adj) {
      const out = [];
      group.forEach((a, i) => group.slice(i + 1).forEach(b => { if (adj[a].has(b)) out.push([a, b]); }));
      return out;
    }

    // 시도하기 전에 확실히 불가능한 경우를 골라 이유를 알려 준다
    function diagnose(names, sizes, adj) {
      const n = names.length, k = sizes.length, minSize = Math.min(...sizes);
      for (let p = 0; p < n; p++) {
        const allowed = n - 1 - adj[p].size;
        if (allowed < minSize - 1) {
          return {
            message: `${names[p]}님은 같은 팀 금지 상대가 ${adj[p].size}명이라, 한 조(최소 ${minSize}명)를 함께 채울 사람이 ${allowed}명뿐입니다.`,
            pairs: [...adj[p]].map(q => [p, q])
          };
        }
      }
      const clique = maxClique(adj);
      if (clique.length > k) {
        return {
          message: `${clique.map(i => names[i]).join(', ')} — 서로 모두 다른 조여야 하는 ${clique.length}명이 조 수(${k}개)보다 많습니다.`,
          pairs: pairsWithin(clique, adj)
        };
      }
      if (k === 2) {
        const cyc = oddCycle(adj);
        if (cyc) {
          const ring = cyc.concat(cyc[0]);
          return {
            message: `금지 짝이 ${ring.map(i => names[i]).join(' – ')} 로 ${cyc.length}명짜리 고리를 이뤄 2개 조로는 나눌 수 없습니다.`,
            pairs: cyc.map((a, i) => [a, cyc[(i + 1) % cyc.length]])
          };
        }
      }
      return null;
    }

    // 남은 자리 수에 비례해 조를 고른다 (제약이 없으면 균등 배치와 같다)
    function pickWeighted(cands, weight, rng) {
      let total = 0;
      cands.forEach(j => { total += weight(j); });
      let r = rng() * total;
      for (const j of cands) { r -= weight(j); if (r < 0) return j; }
      return cands[cands.length - 1];
    }

    // 무작위 순서로 한 명씩, 금지 상대가 없는 조에 넣는다. 막히면 null
    function greedyAttempt(n, sizes, quotas, isLeader, adj, rng, blame) {
      const k = sizes.length;
      const members = sizes.map(() => []);
      const leadCnt = sizes.map(() => 0);
      const byDegree = list => shuffle(list, rng).sort((a, b) => adj[b].size - adj[a].size); // 까다로운 사람 먼저
      const order = byDegree(range(n).filter(p => isLeader[p])).concat(byDegree(range(n).filter(p => !isLeader[p])));
      for (const p of order) {
        const room = j => (isLeader[p] ? quotas[j] - leadCnt[j] : sizes[j] - quotas[j] - (members[j].length - leadCnt[j]));
        const open = range(k).filter(j => room(j) > 0);
        const cands = open.filter(j => members[j].every(q => !adj[p].has(q)));
        if (!cands.length) {
          open.forEach(j => members[j].forEach(q => {
            if (adj[p].has(q)) { const key = pairKey(p, q); blame.set(key, (blame.get(key) || 0) + 1); }
          }));
          return null;
        }
        const j = pickWeighted(cands, room, rng);
        members[j].push(p);
        if (isLeader[p]) leadCnt[j]++;
      }
      return members;
    }

    // 무작위 배치에서 시작해 같은 종류(조장 후보끼리/그 외끼리)를 맞바꾸며 충돌을 줄인다
    function repairAttempt(n, sizes, quotas, isLeader, adj, rng, steps, blame) {
      const team = new Array(n);
      const members = sizes.map(() => []);
      const leadSlots = [], otherSlots = [];
      quotas.forEach((q, j) => {
        for (let t = 0; t < sizes[j]; t++) (t < q ? leadSlots : otherSlots).push(j);
      });
      const place = (list, slots) => shuffle(list, rng).forEach((p, t) => { team[p] = slots[t]; members[slots[t]].push(p); });
      place(range(n).filter(p => isLeader[p]), leadSlots);
      place(range(n).filter(p => !isLeader[p]), otherSlots);

      const conf = (p, j, skip) => {
        let c = 0;
        for (const q of members[j]) if (q !== p && q !== skip && adj[p].has(q)) c++;
        return c;
      };
      const swap = (p, q) => {
        const A = team[p], B = team[q];
        members[A][members[A].indexOf(p)] = q;
        members[B][members[B].indexOf(q)] = p;
        team[p] = B; team[q] = A;
      };

      for (let step = 0; step < steps; step++) {
        const bad = range(n).filter(p => conf(p, team[p]) > 0);
        if (!bad.length) return members;
        const p = bad[Math.floor(rng() * bad.length)];
        const others = range(n).filter(q => team[q] !== team[p] && isLeader[q] === isLeader[p]);
        if (!others.length) continue;
        let best = [], bestD = Infinity;
        for (const q of others) {
          const A = team[p], B = team[q];
          const d = conf(p, B, q) - conf(p, A) + conf(q, A, p) - conf(q, B);
          if (d < bestD) { bestD = d; best = [q]; } else if (d === bestD) best.push(q);
        }
        if (bestD <= 0 && rng() > 0.05) swap(p, best[Math.floor(rng() * best.length)]);
        else if (rng() < 0.3) swap(p, others[Math.floor(rng() * others.length)]); // 막힌 곳 탈출
      }
      range(n).forEach(p => members[team[p]].forEach(q => {
        if (p < q && adj[p].has(q)) { const key = pairKey(p, q); blame.set(key, (blame.get(key) || 0) + 1); }
      }));
      return null;
    }

    // names: 이름 배열, pairs: [[i, j]] 같은 팀 금지, leaders: 조장 후보 인덱스 배열
    // → { ok: true, teams: [[인덱스]] } | { ok: false, message, pairs: [[i, j]] }
    function assign({ names, teamCount, pairs = [], leaders = [], rng = Math.random, attempts = 400, restarts = 8, steps = 1500 }) {
      const n = names.length, k = teamCount;
      if (!Number.isInteger(k) || k < 2) return { ok: false, message: '조는 2개 이상이어야 합니다.', pairs: [] };
      if (k > n) return { ok: false, message: `${n}명으로는 ${k}개 조를 만들 수 없습니다.`, pairs: [] };
      const sizes = teamSizes(n, k);
      const adj = buildAdj(n, pairs);
      const isLeader = new Array(n).fill(false);
      leaders.forEach(i => { if (i >= 0 && i < n) isLeader[i] = true; });
      const L = isLeader.filter(Boolean).length;
      const hasPairs = adj.some(s => s.size);
      const finish = members => ({
        ok: true,
        teams: members.map(m => m.filter(p => isLeader[p]).concat(m.filter(p => !isLeader[p])))
      });

      // 제약이 없으면: 한 번 섞어 앞에서부터 자른다 — 완전 균등 무작위
      if (!hasPairs && !L) {
        const order = shuffle(range(n), rng);
        let at = 0;
        return finish(sizes.map(s => order.slice(at, at += s)));
      }

      const diag = diagnose(names, sizes, adj);
      if (diag) return { ok: false, message: diag.message, pairs: diag.pairs };

      const blame = new Map();
      for (let a = 0; a < (hasPairs ? attempts : 1); a++) {
        const m = greedyAttempt(n, sizes, leaderQuotas(sizes, L, rng), isLeader, adj, rng, blame);
        if (m) return finish(m);
      }
      for (let r = 0; r < restarts; r++) {
        const m = repairAttempt(n, sizes, leaderQuotas(sizes, L, rng), isLeader, adj, rng, steps, blame);
        if (m) return finish(m);
      }
      const top = [...blame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([key]) => key.split('-').map(Number));
      const list = top.map(([a, b]) => `${names[a]}–${names[b]}`).join(', ');
      return {
        ok: false,
        message: `여러 번 시도했지만 모든 제약을 만족하는 배치를 찾지 못했습니다. 금지 짝을 줄이거나 조 수를 바꿔 보세요.${list ? ` 자주 걸린 짝: ${list}` : ''}`,
        pairs: top
      };
    }

    // "1조: 김OO, 이OO" 줄들
    function formatResult(teamNames, teams) {
      return teams.map((members, j) => `${(teamNames[j] || '').trim() || `${j + 1}조`}: ${members.join(', ')}`).join('\n');
    }

    // 1조 첫 카드, 2조 첫 카드 … 순서로 번갈아 날린다
    function revealOrder(teams) {
      const order = [];
      const max = Math.max(0, ...teams.map(t => t.length));
      for (let r = 0; r < max; r++) teams.forEach((t, j) => { if (r < t.length) order.push([j, r]); });
      return order;
    }

    return { shuffle, teamSizes, teamCountFor, leaderQuotas, maxClique, oddCycle, diagnose, assign, formatResult, revealOrder };
  })();

  global.TeamShuffleLogic = Logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
  if (typeof document === 'undefined') return; // node: 로직만

  // ═══ 화면 ═════════════════════════════════════════════════════
  const Roster = global.Roster;

  // ─── Constants ─────────────────────────────────────────────────
  const STATE_KEY  = 'gm_team-shuffle_state';  // sessionStorage: 설정·결과
  const NAMES_KEY  = 'gm_team-shuffle_names';  // localStorage: 명단
  const THEME_KEY  = 'gm_team-shuffle_theme';
  const MIN_COUNT  = 4;
  const MAX_COUNT  = 60;
  const PICKER_MIN = 4;
  const PICKER_MAX = 30;
  const MAX_TEAMS  = 12;
  const MAX_PAIRS  = 60;
  const NAME_MAX   = 20;
  const DEFAULT_NAMES = [
    '김민준', '이서연', '박지호', '최예은', '정도윤', '강하은',
    '조시우', '윤지아', '장준서', '임수아', '한유준', '오채원'
  ];
  const SPEEDS = { slow: 1100, normal: 600, fast: 260 }; // 카드 한 장 간격(ms)
  const COLORS = [
    '#00ff87', '#ff006e', '#0099ff', '#ffbe0b',
    '#fb5607', '#a855f7', '#3a86ff', '#ff99c8',
    '#06d6a0', '#f72585', '#8ecae6', '#e9c46a'
  ];
  const REDUCED_MOTION = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const $ = id => document.getElementById(id);

  // ─── State ─────────────────────────────────────────────────────
  let names = loadNames();
  // state.leaders: names와 같은 길이의 bool 배열, state.pairs: [[i, j]] (names 인덱스)
  // state.result: null이면 설정 화면, 아니면 { roster, leaders: [i], pairs, k, teams: [[i]] }
  let state = loadState();
  let reveal = null; // 진행 중인 카드 날리기 { timer, order, next }
  let slotEls = [];
  let gridGen = 0;   // 조 칸을 새로 그릴 때마다 증가 — 이전 카드의 늦은 도착을 무시한다

  // ─── Storage ───────────────────────────────────────────────────
  function loadNames() {
    const list = Roster.load(NAMES_KEY);
    if (list && list.length >= 1 && list.length <= MAX_COUNT) return list;
    return DEFAULT_NAMES.slice();
  }

  function saveNames() { Roster.save(NAMES_KEY, names); }

  function defaultState() {
    return {
      mode: 'teams', teamCount: 3, perTeam: 4, speed: 'normal',
      leaders: names.map(() => false), pairs: [], teamNames: [], result: null
    };
  }

  function isInt(x, min, max) { return Number.isInteger(x) && x >= min && x <= max; }

  function validPairs(pairs, n) {
    if (!Array.isArray(pairs)) return [];
    return pairs.filter(p => Array.isArray(p) && p.length === 2 && isInt(p[0], 0, n - 1) && isInt(p[1], 0, n - 1) && p[0] !== p[1]);
  }

  function validResult(r) {
    if (!r || !Array.isArray(r.roster) || !r.roster.every(s => typeof s === 'string')) return null;
    const n = r.roster.length;
    if (n < MIN_COUNT || n > MAX_COUNT || !isInt(r.k, 2, n) || !Array.isArray(r.teams) || r.teams.length !== r.k) return null;
    const seen = new Array(n).fill(false);
    for (const t of r.teams) {
      if (!Array.isArray(t)) return null;
      for (const p of t) { if (!isInt(p, 0, n - 1) || seen[p]) return null; seen[p] = true; }
    }
    if (!seen.every(Boolean)) return null;
    const leaders = Array.isArray(r.leaders) ? r.leaders.filter(i => isInt(i, 0, n - 1)) : [];
    return { roster: r.roster, leaders, pairs: validPairs(r.pairs, n), k: r.k, teams: r.teams };
  }

  function loadState() {
    const s = defaultState();
    try {
      const g = JSON.parse(sessionStorage.getItem(STATE_KEY));
      if (!g || typeof g !== 'object') return s;
      if (g.mode === 'teams' || g.mode === 'size') s.mode = g.mode;
      if (isInt(g.teamCount, 2, MAX_TEAMS)) s.teamCount = g.teamCount;
      if (isInt(g.perTeam, 2, MAX_COUNT)) s.perTeam = g.perTeam;
      if (SPEEDS[g.speed]) s.speed = g.speed;
      if (Array.isArray(g.teamNames)) s.teamNames = g.teamNames.filter(x => typeof x === 'string').map(x => x.slice(0, NAME_MAX));
      // 제약은 같은 명단일 때만 되살린다 (다른 탭에서 명단이 바뀌었을 수 있다)
      if (JSON.stringify(g.namesSnap) === JSON.stringify(names)) {
        if (Array.isArray(g.leaders) && g.leaders.length === names.length) s.leaders = g.leaders.map(Boolean);
        s.pairs = validPairs(g.pairs, names.length);
      }
      s.result = validResult(g.result);
    } catch (e) { /* 손상된 상태는 버린다 */ }
    return s;
  }

  function saveState() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(Object.assign({}, state, { namesSnap: names })));
    } catch (e) { /* 저장 불가 환경은 무시 */ }
  }

  // ─── Helpers ───────────────────────────────────────────────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text; // 이름은 항상 텍스트로 — HTML로 해석되지 않는다
    return e;
  }

  function showToast(msg, type = 'error') {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function colorOf(i) { return COLORS[i % COLORS.length]; }

  function displayName(i) { return names[i].trim() || `(이름 없음 ${i + 1})`; }

  function teamName(j) { return (state.teamNames[j] || '').trim() || `${j + 1}조`; }

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

  function hideConstraintMsg() {
    $('constraintMsg').hidden = true;
    $('pairList').querySelectorAll('.pair-chip.bad').forEach(c => c.classList.remove('bad'));
  }

  // ─── 명단 편집 (제약 인덱스를 함께 맞춘다) ─────────────────────
  function resizeTo(n) {
    Roster.resize(names, n, i => `참가자 ${i + 1}`);
    Roster.resize(state.leaders, n, () => false);
    state.pairs = state.pairs.filter(([a, b]) => a < n && b < n);
  }

  function removePerson(i) {
    names.splice(i, 1);
    state.leaders.splice(i, 1);
    state.pairs = state.pairs.filter(p => !p.includes(i)).map(p => p.map(x => (x > i ? x - 1 : x)));
  }

  // 새 명단을 넣을 때: 같은 이름이면 조장 표시·금지 짝을 이어 간다
  function replaceNames(list) {
    const oldIdx = new Map();
    names.forEach((nm, i) => { const t = nm.trim(); if (t && !oldIdx.has(t)) oldIdx.set(t, i); });
    const newIdx = new Map();
    list.forEach((nm, i) => { if (!newIdx.has(nm)) newIdx.set(nm, i); });
    const mapIdx = i => { const t = names[i].trim(); return newIdx.has(t) ? newIdx.get(t) : -1; };
    const pairs = state.pairs.map(([a, b]) => [mapIdx(a), mapIdx(b)]).filter(([a, b]) => a >= 0 && b >= 0 && a !== b);
    state.leaders = list.map(nm => oldIdx.has(nm) && !!state.leaders[oldIdx.get(nm)]);
    names = list;
    state.pairs = pairs;
  }

  // ─── Setup: 명단 ───────────────────────────────────────────────
  const countPicker = Roster.countPicker($('countPicker'), {
    min: PICKER_MIN, max: PICKER_MAX,
    onPick: n => {
      resizeTo(n);
      renderSetup();
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
      if (found.length < MIN_COUNT) { showToast(`이름을 ${MIN_COUNT}개 이상 찾지 못했습니다`); return; }
      const over = Math.max(0, found.length - MAX_COUNT);
      replaceNames(found.slice(0, MAX_COUNT).map(s => s.slice(0, NAME_MAX)));
      renderSetup();
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
      const li = el('li', 'player-item' + (state.leaders[i] ? ' is-leader' : ''));
      const num = el('span', 'player-num', String(i + 1));
      num.style.color = colorOf(i);
      const input = el('input', 'player-input');
      input.type = 'text';
      input.value = name;
      input.maxLength = NAME_MAX;
      input.placeholder = '참가자 이름';
      input.dataset.idx = i;
      input.setAttribute('aria-label', `${i + 1}번 참가자 이름`);
      const lead = el('button', 'leader-btn', '👑');
      lead.type = 'button';
      lead.dataset.idx = i;
      lead.title = '조장 후보로 표시';
      lead.setAttribute('aria-pressed', String(!!state.leaders[i]));
      const rm = el('button', 'player-remove', '✕');
      rm.type = 'button';
      rm.dataset.idx = i;
      rm.title = '제거';
      li.append(num, input, lead, rm);
      grid.appendChild(li);
    });
    $('playerBadge').textContent = names.length;
    $('addPlayerBtn').disabled = names.length >= MAX_COUNT;
    countPicker.update(names.length);
  }

  $('playerGrid').addEventListener('input', e => {
    if (!e.target.classList.contains('player-input')) return;
    names[Number(e.target.dataset.idx)] = e.target.value;
    saveNames();
    hideConstraintMsg();
    renderConstraints(); // 선택 목록·짝 이름만 다시 (입력 칸은 그대로 — 포커스 유지)
    saveState();
  });

  $('playerGrid').addEventListener('click', e => {
    const lead = e.target.closest('.leader-btn');
    if (lead) {
      const i = Number(lead.dataset.idx);
      state.leaders[i] = !state.leaders[i];
      lead.setAttribute('aria-pressed', String(state.leaders[i]));
      lead.closest('.player-item').classList.toggle('is-leader', state.leaders[i]);
      hideConstraintMsg();
      renderSplit();
      renderConstraints();
      saveState();
      return;
    }
    const rm = e.target.closest('.player-remove');
    if (!rm) return;
    if (names.length <= MIN_COUNT) { showToast(`최소 ${MIN_COUNT}명 필요합니다`); return; }
    removePerson(Number(rm.dataset.idx));
    renderSetup();
  });

  $('addPlayerBtn').addEventListener('click', () => {
    if (names.length >= MAX_COUNT) { showToast(`최대 ${MAX_COUNT}명`); return; }
    resizeTo(names.length + 1);
    renderSetup();
    const inputs = $('playerGrid').querySelectorAll('.player-input');
    const last = inputs[inputs.length - 1];
    last.focus(); last.select();
  });

  // ─── Setup: 나누기 기준 ────────────────────────────────────────
  function splitBounds() {
    const half = Math.max(2, Math.floor(names.length / 2)); // 한 조 최소 2명
    return state.mode === 'teams' ? { min: 2, max: Math.min(MAX_TEAMS, half) } : { min: 2, max: half };
  }

  function currentValue() {
    const { min, max } = splitBounds();
    const key = state.mode === 'teams' ? 'teamCount' : 'perTeam';
    state[key] = Roster.clamp(state[key], min, max);
    return state[key];
  }

  function summarizeSizes(sizes) {
    const big = sizes[0], small = sizes[sizes.length - 1];
    if (big === small) return `조마다 ${big}명`;
    const nBig = sizes.filter(s => s === big).length;
    return `${big}명 ${nBig}개 조 · ${small}명 ${sizes.length - nBig}개 조`;
  }

  function renderSplit() {
    document.querySelectorAll('.seg-btn[data-mode]').forEach(b => {
      const on = b.dataset.mode === state.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const { min, max } = splitBounds();
    const v = currentValue();
    $('stepValue').textContent = v;
    $('stepUnit').textContent = state.mode === 'teams' ? '개 조' : '명씩';
    $('stepDown').disabled = v <= min;
    $('stepUp').disabled = v >= max;

    const n = names.length;
    const preview = $('splitPreview');
    preview.textContent = '';
    if (n < MIN_COUNT) {
      preview.textContent = `최소 ${MIN_COUNT}명이 필요합니다`;
      $('startBtn').disabled = true;
      return;
    }
    $('startBtn').disabled = false;
    const k = Logic.teamCountFor(n, state.mode, v);
    const sizes = Logic.teamSizes(n, k);
    preview.append(`${n}명 → `, el('b', null, `${k}개 조`), ` (${summarizeSizes(sizes)})`);
    const L = state.leaders.filter(Boolean).length;
    if (L) {
      const lo = Math.floor(L / k), hi = Math.ceil(L / k);
      preview.append(el('br'), `👑 조장 후보 ${L}명 → 조마다 ${lo === hi ? lo : `${lo}~${hi}`}명`);
      if (L < k) preview.append(' (후보가 조 수보다 적어 없는 조도 있어요)');
    }
  }

  document.querySelectorAll('.seg-btn[data-mode]').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    hideConstraintMsg();
    renderSplit();
    saveState();
  }));

  function step(d) {
    const key = state.mode === 'teams' ? 'teamCount' : 'perTeam';
    const { min, max } = splitBounds();
    state[key] = Roster.clamp(currentValue() + d, min, max);
    hideConstraintMsg();
    renderSplit();
    saveState();
  }
  $('stepDown').addEventListener('click', () => step(-1));
  $('stepUp').addEventListener('click', () => step(1));

  // ─── Setup: 제약 ───────────────────────────────────────────────
  function fillSelect(sel) {
    const keep = sel.value;
    sel.textContent = '';
    sel.appendChild(new Option('이름 선택', ''));
    names.forEach((_, i) => sel.appendChild(new Option(displayName(i), String(i))));
    sel.value = keep !== '' && Number(keep) < names.length ? keep : '';
  }

  function renderConstraints() {
    fillSelect($('pairA'));
    fillSelect($('pairB'));
    const list = $('pairList');
    list.textContent = '';
    state.pairs.forEach(([a, b], k) => {
      const li = el('li', 'pair-chip');
      li.dataset.a = a; li.dataset.b = b;
      li.append(el('span', 'pair-name', displayName(a)), el('span', 'pair-sep', '↔'), el('span', 'pair-name', displayName(b)));
      const rm = el('button', 'pair-remove', '✕');
      rm.type = 'button';
      rm.dataset.k = k;
      rm.title = '이 짝 지우기';
      li.appendChild(rm);
      list.appendChild(li);
    });
    if (!state.pairs.length) list.appendChild(el('li', 'pair-empty', '없음 — 같은 조가 되면 안 되는 두 사람을 골라 추가하세요'));
    $('pairAddBtn').disabled = state.pairs.length >= MAX_PAIRS;

    const L = state.leaders.filter(Boolean).length;
    const info = $('leaderInfo');
    info.textContent = '';
    if (L) {
      info.append(`${L}명 표시됨 — `);
      info.appendChild(el('span', 'leader-names', state.leaders.map((on, i) => (on ? displayName(i) : null)).filter(Boolean).join(', ')));
    } else {
      info.textContent = '참가자 목록의 👑을 누르면 조장 후보가 됩니다. 조마다 고르게 나눠 넣어요.';
    }
    $('constraintBadge').textContent = state.pairs.length + L;
  }

  $('pairAddBtn').addEventListener('click', () => {
    const a = $('pairA').value, b = $('pairB').value;
    if (a === '' || b === '') { showToast('두 사람을 모두 골라 주세요'); return; }
    const i = Number(a), j = Number(b);
    if (i === j) { showToast('서로 다른 두 사람을 골라 주세요'); return; }
    if (state.pairs.some(([x, y]) => (x === i && y === j) || (x === j && y === i))) { showToast('이미 있는 짝입니다'); return; }
    if (state.pairs.length >= MAX_PAIRS) { showToast(`금지 짝은 최대 ${MAX_PAIRS}개`); return; }
    state.pairs.push([i, j]);
    $('pairB').value = '';
    hideConstraintMsg();
    renderConstraints();
    saveState();
  });

  $('pairList').addEventListener('click', e => {
    const rm = e.target.closest('.pair-remove');
    if (!rm) return;
    state.pairs.splice(Number(rm.dataset.k), 1);
    hideConstraintMsg();
    renderConstraints();
    saveState();
  });

  function showConstraintMsg(res) {
    const box = $('constraintMsg');
    box.textContent = '';
    box.append(el('b', null, '⚠️ 이 조건으로는 조를 나눌 수 없어요'), el('p', null, res.message));
    box.hidden = false;
    const bad = new Set((res.pairs || []).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
    $('pairList').querySelectorAll('.pair-chip').forEach(c => {
      const a = Number(c.dataset.a), b = Number(c.dataset.b);
      c.classList.toggle('bad', bad.has(a < b ? `${a}-${b}` : `${b}-${a}`));
    });
    box.scrollIntoView && box.scrollIntoView({ block: 'nearest', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  }

  function renderSetup() {
    renderPlayers();
    renderSplit();
    renderConstraints();
    hideConstraintMsg();
    saveNames();
    saveState();
  }

  // ─── 시작 ──────────────────────────────────────────────────────
  $('startBtn').addEventListener('click', () => {
    const list = names.map(n => n.trim());
    if (list.length < MIN_COUNT) { showToast(`최소 ${MIN_COUNT}명 필요합니다`); return; }
    const empty = list.findIndex(n => !n);
    if (empty >= 0) {
      showToast(`${empty + 1}번 참가자 이름을 입력해주세요`);
      $('playerGrid').querySelectorAll('.player-input')[empty].focus();
      return;
    }
    const seen = new Set();
    const dup = list.find(n => (seen.has(n) ? true : (seen.add(n), false)));
    if (dup) { showToast(`같은 이름이 두 번 있습니다: ${dup} — 구분되게 고쳐 주세요`); return; }

    const k = Logic.teamCountFor(list.length, state.mode, currentValue());
    const leaders = state.leaders.map((on, i) => (on ? i : -1)).filter(i => i >= 0);
    const pairs = state.pairs.map(p => p.slice());
    const res = Logic.assign({ names: list, teamCount: k, pairs, leaders });
    if (!res.ok) { showConstraintMsg(res); showToast('제약을 만족하는 배치가 없습니다'); return; }

    hideConstraintMsg();
    Roster.resize(state.teamNames, k, j => `${j + 1}조`);
    state.result = { roster: list, leaders, pairs, k, teams: res.teams };
    saveState();
    render(true);
    global.scrollTo && global.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
  });

  // ─── 결과: 조 칸과 카드 날리기 ─────────────────────────────────
  function isLeaderInResult(p) { return state.result.leaders.includes(p); }

  function buildTeamGrid() {
    const r = state.result;
    const grid = $('teamGrid');
    grid.textContent = '';
    gridGen++;
    grid.classList.toggle('many', r.k > 8);
    slotEls = r.teams.map((members, j) => {
      const box = el('section', 'team-box');
      box.style.setProperty('--team-color', colorOf(j));
      const head = el('div', 'team-head');
      const input = el('input', 'team-name');
      input.type = 'text';
      input.maxLength = NAME_MAX;
      input.value = teamName(j);
      input.dataset.idx = j;
      input.setAttribute('aria-label', `${j + 1}번째 조 이름`);
      head.append(input, el('span', 'team-count', `${members.length}명`));
      const list = el('ol', 'team-slots');
      const slots = members.map(() => list.appendChild(el('li', 'slot')));
      box.append(head, list);
      grid.appendChild(box);
      return slots;
    });
    const L = r.leaders.length, P = r.pairs.length;
    const extras = [L ? `👑 조장 후보 ${L}명 분산` : '', P ? `🚫 금지 짝 ${P}개 지킴` : ''].filter(Boolean).join(' · ');
    $('resultInfo').textContent = `${r.roster.length}명 → ${r.k}개 조${extras ? ` · ${extras}` : ''}`;
  }

  function fillSlot(j, row) {
    const li = slotEls[j][row];
    if (li.classList.contains('filled')) return;
    const p = state.result.teams[j][row];
    li.textContent = '';
    if (isLeaderInResult(p)) li.appendChild(el('span', 'slot-crown', '👑'));
    li.appendChild(el('span', 'slot-name', state.result.roster[p]));
    li.classList.add('filled');
  }

  function updateDeck(left) {
    $('deckCount').textContent = left;
    $('deck').classList.toggle('empty', left === 0);
    $('deck').disabled = left === 0;
    $('skipBtn').disabled = left === 0;
  }

  function flyCard(j, row, duration) {
    const slot = slotEls[j][row];
    const deck = $('deck');
    if (typeof slot.animate !== 'function') { fillSlot(j, row); return; }
    const from = deck.getBoundingClientRect(), to = slot.getBoundingClientRect();
    const p = state.result.teams[j][row];
    const card = el('div', 'fly-card');
    card.style.setProperty('--team-color', colorOf(j));
    if (isLeaderInResult(p)) card.appendChild(el('span', 'slot-crown', '👑'));
    card.appendChild(el('span', 'slot-name', state.result.roster[p]));
    Object.assign(card.style, {
      left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`
    });
    document.body.appendChild(card);
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const rot = (Math.random() * 2 - 1) * 16;
    const gen = gridGen;
    const anim = card.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(1.5) rotate(${rot}deg)`, opacity: 0.3 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(1.3) rotate(${-rot / 2}deg)`, opacity: 1, offset: 0.5 },
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 }
    ], { duration, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
    const done = () => {
      card.remove();
      if (gen !== gridGen) return;
      fillSlot(j, row);
      slot.classList.remove('pop'); void slot.offsetWidth; slot.classList.add('pop');
    };
    anim.onfinish = done;
    anim.oncancel = done;
  }

  function sendNext() {
    if (!reveal) return;
    clearTimeout(reveal.timer);
    if (reveal.next >= reveal.order.length) { endReveal(); return; }
    const [j, row] = reveal.order[reveal.next++];
    const gap = SPEEDS[state.speed];
    flyCard(j, row, Math.round(gap * 1.25));
    updateDeck(reveal.order.length - reveal.next);
    reveal.timer = setTimeout(sendNext, gap);
  }

  // buildTeamGrid() 직후(빈 칸)에 부른다
  function playReveal() {
    endReveal();
    reveal = { timer: null, order: Logic.revealOrder(state.result.teams), next: 0 };
    $('resultSection').classList.add('revealing');
    updateDeck(reveal.order.length);
    reveal.timer = setTimeout(sendNext, 350);
  }

  function endReveal() {
    if (reveal) clearTimeout(reveal.timer);
    reveal = null;
    $('resultSection').classList.remove('revealing');
  }

  // 날던 카드까지 모두 멈추고 전부 채운다
  function stopReveal() {
    endReveal();
    document.querySelectorAll('.fly-card').forEach(c => c.remove());
    if (state.result && slotEls.length) state.result.teams.forEach((t, j) => t.forEach((_, row) => fillSlot(j, row)));
    updateDeck(0);
  }

  function renderResult(animate) {
    endReveal();
    document.querySelectorAll('.fly-card').forEach(c => c.remove());
    buildTeamGrid();
    renderSpeed();
    if (animate && !REDUCED_MOTION) playReveal();
    else stopReveal();
  }

  function renderSpeed() {
    document.querySelectorAll('.seg-btn[data-speed]').forEach(b => {
      const on = b.dataset.speed === state.speed;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  document.querySelectorAll('.seg-btn[data-speed]').forEach(b => b.addEventListener('click', () => {
    state.speed = b.dataset.speed;
    renderSpeed();
    saveState();
  }));

  $('deck').addEventListener('click', () => { if (reveal) sendNext(); });
  $('skipBtn').addEventListener('click', () => stopReveal());

  $('reshuffleBtn').addEventListener('click', () => {
    const r = state.result;
    const res = Logic.assign({ names: r.roster, teamCount: r.k, pairs: r.pairs, leaders: r.leaders });
    if (!res.ok) { showToast('다시 섞기에 실패했습니다 — 한 번 더 눌러 보세요'); return; }
    r.teams = res.teams;
    saveState();
    renderResult(true);
    showToast('다시 섞었습니다', 'success');
  });

  $('copyBtn').addEventListener('click', () => {
    const r = state.result;
    const teams = r.teams.map(t => t.map(p => r.roster[p]));
    copyText(Logic.formatResult(r.teams.map((_, j) => teamName(j)), teams));
  });

  $('backBtn').addEventListener('click', () => {
    stopReveal();
    state.result = null;
    saveState();
    render(false);
  });

  $('teamGrid').addEventListener('input', e => {
    if (!e.target.classList.contains('team-name')) return;
    state.teamNames[Number(e.target.dataset.idx)] = e.target.value;
    saveState();
  });
  $('teamGrid').addEventListener('change', e => {
    if (!e.target.classList.contains('team-name')) return;
    if (!e.target.value.trim()) e.target.value = teamName(Number(e.target.dataset.idx));
  });

  // ─── Render ────────────────────────────────────────────────────
  function render(animate) {
    const inResult = !!state.result;
    $('setupSection').hidden = inResult;
    $('resultSection').hidden = !inResult;
    if (inResult) renderResult(animate);
    else { endReveal(); renderSetup(); }
  }

  // ─── Theme Toggle ──────────────────────────────────────────────
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

  // ─── Init ──────────────────────────────────────────────────────
  if (state.leaders.length !== names.length) Roster.resize(state.leaders, names.length, () => false);
  applyTheme();
  render(false); // 새로고침 복원 시에는 결과를 바로 보여 준다
})(typeof window !== 'undefined' ? window : globalThis);
