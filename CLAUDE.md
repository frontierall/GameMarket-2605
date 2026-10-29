# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collection of vanilla HTML/CSS/JavaScript browser games and classroom tools, with no build step. `index.html` is the hub page that links to every game via a card. UI text is Korean.

## Project Structure

```
/
├── index.html              # Hub: one .game-card per game
├── css/hub.css             # Hub styles, incl. per-game .game-icon.<name>-game backgrounds
├── js/roster.js            # Shared roster module (window.Roster), used by party/classroom tools
│
├── ball-game.html          # 공 피하기 — js/game.js, css/ball-game.css (DOM entities + AABB)
├── tetris.html             # 테트리스 — js/tetris.js (TetrisGame class), css/tetris.css
├── block-duel.html         # 낙하 블록 듀얼 — js/block-duel.js, reuses TetrisGame from js/tetris.js
├── neon-breaker.html       # 네온 벽돌깨기 — neon-breaker.js / neon-breaker.css (at repo root)
├── orbit-hop.html          # 궤도 점프 — js/orbit-hop.js, css/orbit-hop.css (canvas)
├── memory-pad.html         # 기억 패드 — js/memory-pad.js, css/memory-pad.css
├── ladder.html             # 사다리 게임 — single file with inline CSS/JS, uses js/roster.js
├── praiseplay.html         # 칭찬 주고받기 — single file with inline CSS/JS
├── two-truths.html         # 둘은 진실 — js/two-truths.js, css/two-truths.css, uses js/roster.js
├── picker.html             # 발표자 뽑기 룰렛 — js/picker.js, css/picker.css, uses js/roster.js
├── team-shuffle.html       # 팀 셔플러 — js/team-shuffle.js, css/team-shuffle.css, uses js/roster.js
│
├── README.md               # Game list (keep in sync when adding a game)
├── release_note.md/.html   # Change log; md is the source, html is regenerated from it
└── 작업기록.md/.html        # Auto-written by a commit hook — do not edit by hand
```

## Conventions

- **New game files**: `<name>.html` at the root, script in `js/<name>.js`, styles in `css/<name>.css`. Older games (neon-breaker, ladder, praiseplay) predate this and keep their own layout.
- **Adding a game**: create the files, then add a `.game-card` to `index.html` and a `.game-icon.<name>-game` rule to `css/hub.css`, and add a row to the README game list.
- **Back link**: every game page has a link back to `index.html`.
- **localStorage keys**: prefix with `gm_<name>_` — e.g. `gm_<name>_best` for the high score, `gm_<name>_names` for a saved roster, `gm_<name>_theme`. In-progress state for classroom tools goes in `sessionStorage` (`gm_<name>_state`). Exceptions kept for compatibility: ladder (`ladderNamesPersist`) and neon-breaker (its own high-score list key).
- **Input**: use pointer events (`pointerdown`/`pointermove`) so mouse and touch both work, and set `touch-action: none` on play areas. Keyboard shortcuts stay as an addition. block-duel is keyboard-only by design (two players on one keyboard).
- **User-entered names**: insert with `textContent` (or escape) — never raw `innerHTML`.
- **No ES modules**: scripts are loaded with plain `<script src>` so pages work from `file://`. Shared code exposes a global (e.g. `window.Roster`).

## Shared Roster Module (js/roster.js)

`window.Roster` provides roster parsing and UI wiring for party/classroom tools:
- `parse(text)` / `extractName(raw)` — parse pasted lists (comma, newline, tab/Excel, space-separated Korean names, numbered lists)
- `clamp`, `resize(arr, n, fill)` — helpers
- `load(key)` / `save(key, names)` — localStorage, fail-safe
- `countPicker(container, { min, max, onPick, unit })` — headcount chips, returns `{ update(n) }`
- `pasteBox({ input, hint, applyBtn, clearBtn, toggleBtn, box, max, onApply, defaultHint })` — wires an existing paste box

Changes here affect ladder, two-truths, picker and team-shuffle; re-check all four.

## Game Notes

- **공 피하기 (js/game.js)**: `gameState` holds entities `{ element, x, y, width, height }`; `requestAnimationFrame` loop; AABB `checkCollision()`. Difficulty lives in the `config` object (`playerSpeed`, `enemySpeed`, `enemySpawnRate`, `collectibleSpawnRate`). High score key `gm_ball-game_best` (migrated once from the old `highScore` key).
- **테트리스 (js/tetris.js)**: `TetrisGame` takes constructor options (DOM `ids`, `keyMap`, `bestKey`, `touch`, callbacks `onLinesCleared`/`onGameOver`, garbage-line methods). With no options it behaves as the standalone page; block-duel creates two instances. Keep the standalone page working when changing it.
- **팀 셔플러**: placement logic is DOM-free (`TeamShuffleLogic`) and can be `require()`d in node for testing.

## Development

Open `index.html` in a browser — no build or server required. For a local server:

```bash
python3 -m http.server 8000
```

Check script syntax with `node --check js/<name>.js`.
