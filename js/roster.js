// ─── Roster: 명단 입력 공통 모듈 ─────────────────────────────────
// 빌드 없이 <script src="js/roster.js">로 불러 쓴다 (file://에서도 동작).
// window.Roster 로 노출되며, node에서는 require()로도 불러올 수 있다.
(function (global) {
  'use strict';

  const DEFAULT_HINT = '번호·부서·직급·연락처는 걸러내고 이름만 뽑습니다';

  // ─── Parsing ───────────────────────────────────────────────────
  const DEPT_RE = /(팀|부서|본부|센터|그룹|지점|파트|실|과|국|처)$/;
  const TITLES = new Set([
    '사원','주임','대리','과장','차장','부장','이사','상무','전무','대표',
    '팀장','실장','본부장','파트장','선임','책임','수석','인턴','신입',
    '학생','교수','선생','강사','매니저','리더','참가자','이름','성명','번호',
    '순번','연번','직급','직책','소속','구분','비고','합계','총원','명단'
  ]);
  // 스프레드시트 헤더가 이름으로 잡히는 걸 막는다
  const EN_STOP = new Set([
    'no','num','id','name','names','dept','team','order','rank','seq','index',
    'member','members','participant','email','mail','phone','tel','total','list'
  ]);

  // 한 줄에서 이름만 뽑아낸다. 못 찾으면 빈 문자열.
  function extractName(raw) {
    let t = String(raw);
    t = t.replace(/\S+@\S+/g, ' ');                                 // 이메일
    t = t.replace(/\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/g, ' ');       // 전화번호
    t = t.replace(/[（(\[{<][^）)\]}>]*[）)\]}>]/g, ' ');             // 괄호 안 내용
    t = t.replace(/^\s*(?:\d+\s*[.)\]:\-]?\s*|[-–—•*·▪◦]\s*)+/, '');  // 앞 번호·불릿
    t = t.replace(/\s+/g, ' ').trim();
    if (!t) return '';

    const chunks = t.match(/[가-힣]{2,6}/g);
    if (chunks) {
      const hit = chunks.find(c => !DEPT_RE.test(c) && !TITLES.has(c));
      if (hit) {
        const stripped = hit.replace(/(님|씨|군|양)$/, '');
        return stripped.length >= 2 ? stripped : hit;
      }
      return '';
    }
    const en = t.match(/[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?/);
    if (!en) return '';
    const name = en[0].replace(/[.'-]+$/, '').trim();
    if (name.length < 2) return '';
    return EN_STOP.has(name.toLowerCase().replace(/\s+/g, '')) ? '' : name;
  }

  // 여러 줄이면 한 줄 = 한 사람(쉼표·탭은 부서/연락처 같은 다음 칸)으로 보고,
  // 한 줄뿐이면 쉼표로 이어 쓴 명단으로 본다.
  function parse(text) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim());
    const multiLine = lines.length > 1;
    const names = [];

    // "김민준 이서연 박지호"처럼 한 줄에 이름만 띄어 쓴 경우
    if (lines.length === 1 && !/[,;|\t]/.test(lines[0])) {
      const tokens = lines[0].trim().split(/\s+/);
      if (tokens.length >= 2 && tokens.every(t => /^[가-힣]{2,4}$/.test(t))) return tokens;
    }

    lines.forEach(line => {
      const parts = line.split(/[,;|\t]/);
      for (const part of parts) {
        const name = extractName(part);
        if (!name) continue;
        names.push(name);
        if (multiLine) break; // 한 줄에서 이름은 하나만
      }
    });
    return names;
  }

  // ─── Helpers ───────────────────────────────────────────────────
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // 배열 길이를 n에 맞춘다 — 남는 건 자르고 모자라면 fill(i)로 채운다 (제자리 변경)
  function resize(arr, n, fill) {
    while (arr.length > n) arr.pop();
    for (let i = arr.length; i < n; i++) arr.push(fill(i));
    return arr;
  }

  // localStorage의 이름 배열. 형식이 맞지 않거나 저장 불가 환경이면 null
  function load(key) {
    try {
      const list = JSON.parse(localStorage.getItem(key));
      return Array.isArray(list) && list.every(s => typeof s === 'string') ? list : null;
    } catch (e) { return null; }
  }

  function save(key, names) {
    try { localStorage.setItem(key, JSON.stringify(names)); } catch (e) { /* 저장 불가 환경은 무시 */ }
  }

  // ─── UI: 인원수 빠른 선택 ──────────────────────────────────────
  // container 안에 min~max 숫자 칩을 붙인다 (container의 기존 내용 — 라벨 등 — 은 둔다).
  // 칩을 누르면 onPick(n). 반환값의 update(n)으로 현재 인원 칩을 강조한다.
  function countPicker(container, { min = 2, max = 10, onPick, unit = '명' } = {}) {
    const chips = [];
    for (let n = min; n <= max; n++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'count-chip';
      chip.dataset.n = n;
      chip.textContent = n;
      chip.title = `${n}${unit}으로 맞추기`;
      chip.addEventListener('click', () => { if (onPick) onPick(n); });
      container.appendChild(chip);
      chips.push(chip);
    }
    return {
      update(current) {
        chips.forEach(chip => chip.classList.toggle('active', Number(chip.dataset.n) === current));
      }
    };
  }

  // ─── UI: 명단 붙여넣기 상자 ────────────────────────────────────
  // 이미 있는 요소들에 동작만 연결한다. 모양(HTML·CSS)은 각 게임이 정한다.
  //   input    : textarea (필수)
  //   hint     : 인식 개수를 보여 줄 요소
  //   applyBtn : 누르면 onApply(인식된 이름 배열 전체) — 개수 검사·적용은 게임이 한다
  //   clearBtn : 입력 지우기
  //   toggleBtn, box : 누르면 box를 열고 닫는다 (toggleBtn에 'active' 클래스)
  //   max      : 이보다 많으면 힌트에 "앞에서 max명만" 경고
  function pasteBox({ input, hint, applyBtn, clearBtn, toggleBtn, box, max = Infinity, onApply, defaultHint = DEFAULT_HINT }) {
    function updateHint() {
      if (!hint) return;
      const found = parse(input.value).length;
      if (!found) {
        hint.textContent = defaultHint;
        hint.style.color = '';
      } else {
        hint.textContent = found > max
          ? `이름 ${found}개 인식 — 앞에서 ${max}명만 적용됩니다`
          : `이름 ${found}개 인식됨`;
        hint.style.color = found > max ? 'var(--neon-pink)' : 'var(--neon-green)';
      }
    }

    input.addEventListener('input', updateHint);

    if (toggleBtn && box) {
      toggleBtn.addEventListener('click', () => {
        box.hidden = !box.hidden;
        toggleBtn.classList.toggle('active', !box.hidden);
        if (!box.hidden) input.focus();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        updateHint();
        input.focus();
      });
    }

    if (applyBtn) {
      applyBtn.addEventListener('click', () => { if (onApply) onApply(parse(input.value)); });
    }

    return { updateHint };
  }

  const Roster = { parse, extractName, clamp, resize, load, save, countPicker, pasteBox, DEFAULT_HINT };
  global.Roster = Roster;
  if (typeof module !== 'undefined' && module.exports) module.exports = Roster;
})(typeof window !== 'undefined' ? window : globalThis);
