# GameMarket-2605

빌드 없이 바닐라 HTML/CSS/JS로 만든 브라우저 게임 모음입니다. `index.html`(게임 허브)을 브라우저로 열면 바로 플레이할 수 있습니다.

## 게임 목록

| 게임 | 파일 | 분류 | 모바일 |
|---|---|---|---|
| 공 피하기 | `ball-game.html` | 액션 | 터치 드래그 |
| 테트리스 | `tetris.html` | 퍼즐 | 제스처·하단 버튼 |
| 네온 벽돌깨기 | `neon-breaker.html` | 아케이드 | 터치 드래그 |
| 궤도 점프 | `orbit-hop.html` | 원버튼 아케이드 | 탭 |
| 낙하 블록 듀얼 | `block-duel.html` | 2인 대결 | 키보드 전용 |
| 기억 패드 | `memory-pad.html` | 기억력·파티 | 탭 |
| 사다리 게임 | `ladder.html` | 모임용 추첨 | 탭 |
| 칭찬 주고받기 | `praiseplay.html` | 소셜 카드 | 탭 |
| 둘은 진실 | `two-truths.html` | 수업·모임용 투표 | 탭 |
| 발표자 뽑기 룰렛 | `picker.html` | 수업용 추첨 | 탭 |
| 팀 셔플러 | `team-shuffle.html` | 수업용 조 편성 | 탭 |

## 공통 규칙

- 최고점수는 `localStorage`의 `gm_<게임명>_best` 키에 저장합니다.
- 명단 입력(붙여넣기·인원수 선택)은 `js/roster.js`(`window.Roster`)를 함께 씁니다.
- 변경 기록은 `release_note.md` / `release_note.html`에 있습니다.
