(() => {
    'use strict';

    const { W, FLOOR, CEILING } = GravityCore;
    const INTERP_DELAY = 50;

    const overlay = document.getElementById('overlay');
    const elTitle = document.getElementById('overlay-title');
    const elSub = document.getElementById('overlay-sub');
    const btnReady = document.getElementById('btn-ready');
    const btnRematch = document.getElementById('btn-rematch');
    const elRole = document.getElementById('role');
    const elPing = document.getElementById('ping');
    const renderer = GravityRender.create(document.getElementById('game'), { assetBase: '../sprite/' });

    let storedId = null;
    try { storedId = sessionStorage.getItem('gravityPlayerId'); } catch (_) {}

    const socket = io('/gravity', { auth: { playerId: storedId } });

    let mySide = null;
    let phase = null;
    let phaseAt = 0;
    let full = false;
    let kicked = false;
    let abandoned = false;
    let opponentGrace = null;
    let snaps = [];
    let seed = null;
    let world = GravityCore.createGame(1, { versus: true });

    const rivalOf = (side) => (side === 'p1' ? 'p2' : 'p1');
    const runnerOf = (side) => (side === 'p1' ? world.player : world.cpu);

    socket.on('joined', ({ side, playerId }) => {
        mySide = side;
        try { sessionStorage.setItem('gravityPlayerId', playerId); } catch (_) {}
        elRole.textContent = `Tú eres el jugador de ${side === 'p1' ? 'abajo (azul)' : 'arriba (rojo)'}`;
    });

    socket.on('connect_error', (err) => {
        if (err && err.message === 'duel_full') {
            full = true;
            elRole.textContent = 'Sin cupo: no se admiten espectadores';
            socket.disconnect();
        } else {
            elRole.textContent = mySide ? 'Reconectando…' : 'Esperando rival…';
        }
        updateOverlay();
    });
    socket.on('kicked', () => {
        kicked = true;
        mySide = null;
        elRole.textContent = 'Expulsado por inactividad';
        updateOverlay();
    });
    socket.on('disconnect', () => { if (!full && !kicked) elRole.textContent = 'Reconectando…'; });

    socket.on('phase', (p) => {
        if (p.seed !== seed) {
            seed = p.seed;
            world = GravityCore.createGame(seed ?? 1, { versus: true });
            snaps = [];
            renderer.reset();
        }
        if (p.phase === 'WAITING') opponentGrace = null;
        else abandoned = false;
        phase = p;
        phaseAt = performance.now();
        btnReady.disabled = false;
        btnRematch.disabled = false;
        updateOverlay();
    });

    socket.on('state', (s) => {
        if (s.seed !== seed) return;
        snaps.push({ at: performance.now(), s });
        if (snaps.length > 30) snaps.shift();
    });

    socket.on('abandon', () => { abandoned = true; updateOverlay(); });
    socket.on('opponent_left', ({ graceMs }) => {
        opponentGrace = { until: performance.now() + graceMs };
        updateOverlay();
    });
    socket.on('opponent_back', () => { opponentGrace = null; updateOverlay(); });

    btnReady.addEventListener('click', () => { socket.emit('ready'); btnReady.disabled = true; });
    btnRematch.addEventListener('click', () => { socket.emit('rematch'); btnRematch.disabled = true; });

    setInterval(() => {
        if (!socket.connected) return;
        const t0 = performance.now();
        socket.timeout(2000).emit('latency', (err) => {
            elPing.textContent = err ? '— ms' : `${Math.round(performance.now() - t0)} ms`;
        });
    }, 2000);

    const KEY_TRACK = { ArrowUp: CEILING, KeyW: CEILING, ArrowDown: FLOOR, KeyS: FLOOR };

    addEventListener('keydown', (e) => {
        const track = KEY_TRACK[e.code];
        if (track === undefined) return;
        e.preventDefault();
        if (e.repeat || !phase || !mySide || !socket.connected) return;
        if (phase.phase === 'PLAYING') socket.emit('flip', { track });
    });

    function show(title, sub, { clear = false, ready = false, rematch = false } = {}) {
        overlay.classList.remove('hidden');
        overlay.classList.toggle('clear', clear);
        elTitle.textContent = title;
        elSub.textContent = sub || '';
        btnReady.hidden = !ready;
        btnRematch.hidden = !rematch;
    }
    function hideOverlay() { overlay.classList.add('hidden'); }

    function resultText(o) {
        if (!o.winner) return ['Empate', `Los dos cayeron al vacío a los ${o.meters} m`];
        const dragged = o.cause === 'dragged';
        if (o.winner === mySide) {
            return ['¡Ganaste!', dragged
                ? `Una pared arrastró a tu rival al vacío a los ${o.meters} m`
                : `Tu rival cayó al vacío a los ${o.meters} m`];
        }
        return ['Perdiste', dragged
            ? `Una pared te arrastró al vacío a los ${o.meters} m`
            : `Caíste al vacío a los ${o.meters} m`];
    }

    function updateOverlay() {
        if (full) {
            return show('Duelo lleno', 'El duelo ya tiene 2 jugadores. Intenta más tarde.');
        }
        if (kicked) return show('Sin actividad', 'Recarga la página para volver al duelo.');
        if (!phase) return show('Esperando rival…', 'Comparte esta página con otra persona.');
        if (opponentGrace) {
            const s = Math.max(0, Math.ceil((opponentGrace.until - performance.now()) / 1000));
            const running = phase.phase === 'COUNTDOWN' || phase.phase === 'PLAYING';
            return show('Rival desconectado', running
                ? `Pausa. Si no vuelve en ${s} s ganas por abandono.`
                : `Esperando reconexión (${s} s)…`);
        }
        switch (phase.phase) {
            case 'WAITING':
                return show('Esperando rival…', abandoned
                    ? 'Tu rival abandonó: ganaste la carrera.'
                    : 'Comparte esta página con otra persona.');
            case 'READY': {
                const iAmReady = mySide && phase.ready[mySide];
                return show(
                    iAmReady ? 'Esperando al rival…' : 'Rival encontrado',
                    iAmReady ? 'Ya confirmaste.' : 'Pulsa "Listo" cuando quieras empezar.',
                    { ready: !iAmReady }
                );
            }
            case 'COUNTDOWN': {
                const left = Math.max(0, phase.endsInMs - (performance.now() - phaseAt));
                return show(String(Math.max(1, Math.ceil(left / 1000))), '', { clear: true });
            }
            case 'GAME_OVER': {
                const [title, text] = resultText(phase.outcome);
                const iWant = mySide && phase.rematch[mySide];
                const score = `${phase.wins[mySide]} – ${phase.wins[rivalOf(mySide)]}`;
                return show(
                    title,
                    `${text} · ${score}` + (iWant ? ' · esperando al rival para la revancha' : ''),
                    { rematch: !iWant }
                );
            }
            default:
                return hideOverlay();
        }
    }

    let lastOverlayKey = '';
    function updateOverlayTick(now) {
        if (!phase) return;
        if (phase.phase === 'COUNTDOWN' || opponentGrace) {
            const ms = opponentGrace ? opponentGrace.until - now : phase.endsInMs - (now - phaseAt);
            const key = `${phase.phase}|${!!opponentGrace}|${Math.ceil(ms / 1000)}`;
            if (key !== lastOverlayKey) { lastOverlayKey = key; updateOverlay(); }
        }
    }

    const lerp = (a, b, t) => a + (b - a) * t;

    function applyRunner(target, a, b, t) {
        Object.assign(target, b);
        target.x = lerp(a.x, b.x, t);
        target.y = lerp(a.y, b.y, t);
    }

    function applySnapshots() {
        if (!snaps.length) return;
        const target = performance.now() - INTERP_DELAY;
        let i = snaps.length - 1;
        while (i > 0 && snaps[i].at > target) i--;
        const a = snaps[i];
        const b = snaps[i + 1] || a;
        const t = b === a ? 0 : Math.min(1, Math.max(0, (target - a.at) / (b.at - a.at || 1)));
        world.scroll = lerp(a.s.scroll, b.s.scroll, t);
        world.speed = b.s.speed;
        applyRunner(world.player, a.s.p1, b.s.p1, t);
        applyRunner(world.cpu, a.s.p2, b.s.p2, t);
        GravityCore.extendCourse(world, world.scroll + W * 2);
    }

    function labelFor(side) {
        if (!mySide) return side === 'p1' ? 'J1' : 'J2';
        return side === mySide ? 'TÚ' : 'RIVAL';
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        applySnapshots();
        updateOverlayTick(now);

        const name = phase ? phase.phase : 'WAITING';
        const wins = phase ? phase.wins : { p1: 0, p2: 0 };
        const me = mySide || 'p1';
        const rival = rivalOf(me);
        const skin = (side) => (side === 'p1' ? 'player' : 'cpu');
        const rivalRunner = runnerOf(rival);
        const myRunner = runnerOf(me);
        const together = Math.abs(rivalRunner.x - myRunner.x) < 60 && Math.abs(rivalRunner.y - myRunner.y) < 40;

        renderer.frame({
            world,
            runners: [
                {
                    runner: rivalRunner,
                    skin: skin(rival),
                    label: labelFor(rival),
                    ghost: together,
                    labelLift: together ? 18 : 0
                },
                { runner: myRunner, skin: skin(me), label: labelFor(me) }
            ],
            idle: name !== 'PLAYING' && name !== 'GAME_OVER',
            animate: name === 'PLAYING',
            drift: name === 'WAITING' || name === 'READY',
            hud: { left: `${labelFor('p1')}  ${wins.p1}`, right: `${wins.p2}  ${labelFor('p2')}` },
            countdown: null
        }, dt);
        requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
    updateOverlay();
})();
