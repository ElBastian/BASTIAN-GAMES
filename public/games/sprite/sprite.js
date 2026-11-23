(() => {
    'use strict';

    const { FLOOR, CEILING } = GravityCore;
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlayTitle');
    const overlayText = document.getElementById('overlayText');
    const overlayPrompt = document.getElementById('overlayPrompt');
    const renderer = GravityRender.create(document.getElementById('gameCanvas'));

    const TICK = 1 / 120;
    const COUNTDOWN = 2.4;
    const RESTART_LOCK = 0.6;
    const AGAIN = 'Presiona ↑ o ↓ para correr otra vez';

    let game;
    let phase = 'menu';
    let countdown = 0;
    let overTime = 0;

    function resetGame() {
        game = GravityCore.createGame((Math.random() * 0xffffffff) >>> 0);
        renderer.reset();
    }

    function showOverlay(title, text, prompt) {
        overlayTitle.textContent = title;
        overlayText.textContent = text;
        overlayPrompt.textContent = prompt;
        overlay.hidden = false;
    }

    function startCountdown() {
        resetGame();
        overlay.hidden = true;
        countdown = COUNTDOWN;
        phase = 'countdown';
    }

    function finish() {
        phase = 'over';
        overTime = 0;
        const meters = Math.floor(game.scroll / 10);
        if (game.result === 'player') {
            const text = game.cpu.cause === 'dragged'
                ? `Una pared arrastró a la máquina al vacío a los ${meters} m.`
                : `La máquina cayó al vacío a los ${meters} m.`;
            showOverlay('¡GANASTE!', text, AGAIN);
        } else if (game.result === 'cpu') {
            const text = game.player.cause === 'dragged'
                ? `Una pared te arrastró al vacío a los ${meters} m.`
                : `Caíste al vacío a los ${meters} m.`;
            showOverlay('PERDISTE', text, AGAIN);
        } else {
            showOverlay('EMPATE', `Los dos cayeron al vacío a los ${meters} m.`, AGAIN);
        }
    }

    const KEY_TRACK = { ArrowUp: CEILING, KeyW: CEILING, ArrowDown: FLOOR, KeyS: FLOOR };

    addEventListener('keydown', (e) => {
        const track = KEY_TRACK[e.code];
        if (track === undefined) return;
        e.preventDefault();
        if (e.repeat) return;
        if (phase === 'menu') startCountdown();
        else if (phase === 'paused') { overlay.hidden = true; phase = 'playing'; }
        else if (phase === 'over' && overTime >= RESTART_LOCK) startCountdown();
        else if (phase === 'playing') GravityCore.press(game, game.player, track);
    });

    function pause() {
        if (phase !== 'playing') return;
        phase = 'paused';
        showOverlay('PAUSA', 'La carrera está detenida.', 'Presiona ↑ o ↓ para continuar');
    }
    addEventListener('blur', pause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    let last = performance.now();
    let acc = 0;
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        if (phase === 'countdown') {
            countdown -= dt;
            if (countdown <= 0) phase = 'playing';
        } else if (phase === 'playing') {
            acc += dt;
            while (acc >= TICK) {
                GravityCore.step(game, TICK);
                acc -= TICK;
            }
            if (game.finished) finish();
        } else if (phase === 'over') {
            overTime += dt;
        }

        const step = COUNTDOWN / 3;
        renderer.frame({
            world: game,
            runners: [
                { runner: game.cpu, skin: 'cpu', label: 'CPU' },
                { runner: game.player, skin: 'player', label: 'TÚ' }
            ],
            idle: phase === 'menu' || phase === 'countdown',
            animate: phase === 'playing',
            drift: phase === 'menu',
            hud: { left: 'TÚ', right: 'MÁQUINA' },
            countdown: phase === 'countdown'
                ? { value: Math.max(1, Math.ceil(countdown / step)), progress: (countdown / step) % 1 }
                : null
        }, phase === 'paused' ? 0 : dt);
        requestAnimationFrame(loop);
    }

    resetGame();
    showOverlay(
        'GRAVITY RUN',
        'Cambia de pista invirtiendo la gravedad. Esquiva las paredes y los huecos: el primero que caiga al vacío pierde.',
        'Presiona ↑ o ↓ para empezar'
    );
    requestAnimationFrame(loop);
})();
