/**
 * 낙하 블록 듀얼 - 한 화면 2인 대결
 * js/tetris.js의 TetrisGame을 두 개 만들어(키 매핑·DOM 대상·콜백만 다르게) 대결을 진행한다.
 */

const DUEL_CONFIG = {
    WINS_TO_MATCH: 2, // 3판 2선승
    // 지운 줄 수 → 상대에게 보내는 방해 줄 수
    GARBAGE_TABLE: [0, 0, 1, 2, 4],
    // 플레이어별 키 매핑 (KeyboardEvent.code 기준, 서로 겹치지 않음)
    KEYS: {
        p1: {
            KeyA: 'left',
            KeyD: 'right',
            KeyS: 'down',
            KeyW: 'rotate',
            ShiftLeft: 'hardDrop'
        },
        p2: {
            ArrowLeft: 'left',
            ArrowRight: 'right',
            ArrowDown: 'down',
            ArrowUp: 'rotate',
            Enter: 'hardDrop',
            NumpadEnter: 'hardDrop'
        }
    },
    // 대결 전체에 쓰는 키
    PAUSE_KEYS: ['KeyP', 'Escape'],
    ADVANCE_KEY: 'Space'
};

class BlockDuel {
    constructor() {
        this.wins = { p1: 0, p2: 0 };
        this.round = 1;
        this.phase = 'ready'; // ready | playing | paused | roundOver | matchOver
        this.sent = { p1: 0, p2: 0 };

        this.el = {
            p1Wins: document.getElementById('p1Wins'),
            p2Wins: document.getElementById('p2Wins'),
            roundNum: document.getElementById('roundNum'),
            startBtn: document.getElementById('startBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            resultScreen: document.getElementById('resultScreen'),
            resultTitle: document.getElementById('resultTitle'),
            resultDetail: document.getElementById('resultDetail'),
            resultBtn: document.getElementById('resultBtn'),
            narrowNotice: document.getElementById('narrowNotice'),
            narrowDismissBtn: document.getElementById('narrowDismissBtn')
        };

        this.players = {
            p1: this.createPlayer('p1'),
            p2: this.createPlayer('p2')
        };

        this.setupEventListeners();
        this.setupNarrowNotice();
        this.updateDisplay();
    }

    // 플레이어 하나 = TetrisGame 인스턴스 하나
    createPlayer(id) {
        return new TetrisGame({
            ids: {
                board: `${id}Board`,
                next: `${id}Next`,
                lines: `${id}Lines`
            },
            keyMap: DUEL_CONFIG.KEYS[id],
            noRepeatActions: ['hardDrop', 'rotate'], // 길게 눌러도 한 번만
            bestKey: null,
            touch: false,
            autoPauseOnBlur: false, // 대결 컨트롤러가 두 보드를 함께 멈춘다
            onLinesCleared: (game, count) => this.handleLinesCleared(id, count),
            onGameOver: () => this.handleTopOut(id)
        });
    }

    opponentOf(id) {
        return id === 'p1' ? 'p2' : 'p1';
    }

    setupEventListeners() {
        this.el.startBtn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            this.startMatch();
        });
        this.el.pauseBtn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            this.togglePause();
        });
        this.el.resultBtn.addEventListener('click', (e) => {
            e.currentTarget.blur();
            this.advance();
        });

        document.addEventListener('keydown', (e) => {
            // 게임 키·Space가 포커스된 버튼을 누르거나 화면을 스크롤하지 않도록 항상 막는다
            // (라운드 사이처럼 보드가 멈춰 있을 때도)
            if (e.code in DUEL_CONFIG.KEYS.p1 || e.code in DUEL_CONFIG.KEYS.p2 ||
                e.code === DUEL_CONFIG.ADVANCE_KEY) {
                e.preventDefault();
            }

            if (DUEL_CONFIG.PAUSE_KEYS.includes(e.code)) {
                e.preventDefault();
                if (!e.repeat) this.togglePause();
                return;
            }

            if (e.code === DUEL_CONFIG.ADVANCE_KEY && !e.repeat) {
                this.advance();
            }
        });

        // 창이 포커스를 잃으면 두 보드 함께 일시정지
        window.addEventListener('blur', () => {
            if (this.phase === 'playing') this.togglePause();
        });

        // 방해 줄 대기량 표시를 계속 갱신
        const tick = () => {
            this.updatePending();
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    // 좁은 화면/터치 기기면 키보드 안내 표시
    setupNarrowNotice() {
        const query = window.matchMedia('(max-width: 900px), (pointer: coarse) and (hover: none)');
        let dismissed = false;
        const update = () => {
            this.el.narrowNotice.classList.toggle('hidden', dismissed || !query.matches);
        };
        this.el.narrowDismissBtn.addEventListener('click', () => {
            dismissed = true;
            update();
        });
        if (query.addEventListener) {
            query.addEventListener('change', update);
        } else if (query.addListener) {
            query.addListener(update);
        }
        update();
    }

    // Space 키 / 결과 버튼: 현재 단계에 맞게 진행
    advance() {
        switch (this.phase) {
            case 'ready':
                this.startMatch();
                break;
            case 'paused':
                this.togglePause();
                break;
            case 'roundOver':
                this.round++;
                this.startRound();
                break;
            case 'matchOver':
                this.startMatch();
                break;
        }
    }

    startMatch() {
        this.wins = { p1: 0, p2: 0 };
        this.round = 1;
        this.startRound();
    }

    startRound() {
        this.sent = { p1: 0, p2: 0 };
        this.phase = 'playing';
        ['p1', 'p2'].forEach((id) => {
            document.getElementById(`${id}Flag`).classList.add('hidden');
            document.getElementById(`${id}Panel`).classList.remove('lost', 'won');
            this.players[id].restartGame();
        });
        this.el.resultScreen.classList.add('hidden');
        this.el.startBtn.classList.add('hidden');
        this.el.pauseBtn.classList.remove('hidden');
        this.el.pauseBtn.textContent = '일시정지';
        this.updateDisplay();
    }

    togglePause() {
        if (this.phase === 'playing') {
            this.phase = 'paused';
            this.players.p1.togglePause();
            this.players.p2.togglePause();
            this.el.pauseBtn.textContent = '계속하기';
            this.showResult('일시정지', 'P / Esc 또는 Space로 계속하기', '계속하기');
        } else if (this.phase === 'paused') {
            this.phase = 'playing';
            this.el.resultScreen.classList.add('hidden');
            this.el.pauseBtn.textContent = '일시정지';
            this.players.p1.togglePause();
            this.players.p2.togglePause();
        }
    }

    // 줄을 지웠을 때: 내 대기 방해 줄을 먼저 상쇄하고 남은 만큼 상대에게 보낸다
    handleLinesCleared(id, count) {
        if (this.phase !== 'playing') return;
        const attack = DUEL_CONFIG.GARBAGE_TABLE[count] || 0;
        if (attack <= 0) return;

        const me = this.players[id];
        const remain = me.cancelGarbage(attack);
        if (remain > 0) {
            this.players[this.opponentOf(id)].receiveGarbage(remain);
        }
        this.sent[id] += attack;
        this.updateDisplay();
    }

    // 블록이 꼭대기에 닿았을 때: 그 플레이어의 패배
    handleTopOut(loserId) {
        if (this.phase !== 'playing') return; // 같은 라운드에서 두 번 처리하지 않음
        const winnerId = this.opponentOf(loserId);

        this.players[winnerId].stop();
        this.wins[winnerId]++;

        const loserFlag = document.getElementById(`${loserId}Flag`);
        const winnerFlag = document.getElementById(`${winnerId}Flag`);
        loserFlag.textContent = '패배';
        loserFlag.className = 'board-flag lose';
        winnerFlag.textContent = '승리';
        winnerFlag.className = 'board-flag win';
        document.getElementById(`${loserId}Panel`).classList.add('lost');
        document.getElementById(`${winnerId}Panel`).classList.add('won');

        const score = `${this.wins.p1} : ${this.wins.p2}`;
        const winnerName = winnerId.toUpperCase();

        if (this.wins[winnerId] >= DUEL_CONFIG.WINS_TO_MATCH) {
            this.phase = 'matchOver';
            this.showResult(`${winnerName} 최종 승리!`, `최종 스코어 P1 ${score} P2`, '다시 대결');
        } else {
            this.phase = 'roundOver';
            this.showResult(`${winnerName} 라운드 ${this.round} 승리`, `현재 스코어 P1 ${score} P2`, '다음 라운드');
        }

        this.el.pauseBtn.classList.add('hidden');
        this.updateDisplay();
    }

    showResult(title, detail, buttonText) {
        this.el.resultTitle.textContent = title;
        this.el.resultDetail.textContent = detail;
        this.el.resultBtn.textContent = buttonText;
        this.el.resultScreen.classList.remove('hidden');
    }

    updatePending() {
        ['p1', 'p2'].forEach((id) => {
            const el = document.getElementById(`${id}Pending`);
            const pending = this.players[id].state.pendingGarbage;
            if (el.textContent !== String(pending)) el.textContent = pending;
            el.classList.toggle('active', pending > 0);
        });
    }

    updateDisplay() {
        this.el.p1Wins.textContent = this.wins.p1;
        this.el.p2Wins.textContent = this.wins.p2;
        this.el.roundNum.textContent = this.round;
        document.getElementById('p1Sent').textContent = this.sent.p1;
        document.getElementById('p2Sent').textContent = this.sent.p2;
        this.updatePending();
    }
}

let duel;

document.addEventListener('DOMContentLoaded', () => {
    duel = new BlockDuel();
});
