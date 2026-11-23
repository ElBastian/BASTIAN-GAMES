const GravityCore = (() => {
    'use strict';

    const W = 960;
    const H = 540;
    const FLOOR_Y = 456;
    const CEIL_Y = 84;
    const FLOOR = 0;
    const CEILING = 1;

    const BASE_SPEED = 390;
    const MAX_SPEED = 760;
    const SPEED_GAIN = 0.008;
    const GRAVITY = 4300;
    const FLIP_KICK = 300;
    const FLIGHT_TIME = 0.36;
    const COYOTE = 0.08;
    const INPUT_BUFFER = 0.14;
    const RECOVER_SPEED = 70;
    const HALF_BODY = 15;
    const HALF_FEET = 9;
    const SAFE_START = 1500;
    const OFFSCREEN = 130;

    const gravityDir = (track) => (track === FLOOR ? 1 : -1);
    const trackY = (track) => (track === FLOOR ? FLOOR_Y : CEIL_Y);
    const speedAt = (scroll) => Math.min(MAX_SPEED, BASE_SPEED + scroll * SPEED_GAIN);

    function createRng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function extendCourse(game, untilX) {
        const c = game.course;
        while (c.cursor < untilX) {
            const v = speedAt(c.cursor) * 1.08;
            const track = c.list.length === 0 || c.rng() < 0.68 ? 1 - c.lastTrack : c.lastTrack;
            const isGap = c.rng() < 0.6;
            const progress = Math.min(1, c.cursor / 30000);
            const reaction = 0.62 - 0.22 * progress;
            const lead = track !== c.lastTrack ? v * (FLIGHT_TIME + reaction) : v * 0.45;
            const x = c.list.length === 0 ? SAFE_START : c.cursor + lead;
            const w = isGap ? v * (0.3 + c.rng() * 0.25) : 30 + c.rng() * 14;
            c.list.push({
                id: c.list.length,
                track,
                kind: isGap ? 'gap' : 'block',
                x,
                w,
                h: isGap ? 0 : 100 + c.rng() * 40
            });
            c.lastTrack = track;
            c.cursor = x + w;
        }
    }

    function createRunner(name, track, homeX) {
        return {
            name, track, homeX,
            x: homeX,
            y: trackY(track),
            vy: 0,
            grounded: true,
            falling: false,
            gone: false,
            immune: false,
            blocked: false,
            blockedTime: 0,
            coyote: 0,
            want: null,
            wantTime: 0,
            cause: null,
            landed: 0
        };
    }

    function createGame(seed, options = {}) {
        const rng = createRng(seed);
        const versus = options.versus === true;
        const game = {
            versus,
            scroll: 0,
            speed: BASE_SPEED,
            result: null,
            finished: false,
            missScale: options.missScale ?? 1,
            aiRng: createRng(seed ^ 0x5bd1e995),
            aiPlans: new Map(),
            course: { rng, list: [], cursor: SAFE_START, lastTrack: CEILING },
            player: createRunner('player', FLOOR, versus ? 250 : 280),
            cpu: createRunner('cpu', CEILING, versus ? 250 : 220)
        };
        extendCourse(game, W * 3);
        return game;
    }

    function hazardsNear(game, from, to) {
        return game.course.list.filter((h) => h.x < to && h.x + h.w > from);
    }

    function surfaceAt(game, track, worldX) {
        const left = worldX - HALF_FEET;
        const right = worldX + HALF_FEET;
        const base = trackY(track);
        let surface = base;
        for (const h of hazardsNear(game, left, right)) {
            if (h.track !== track) continue;
            if (h.kind === 'gap') {
                if (left >= h.x && right <= h.x + h.w) return null;
            } else {
                surface = base - gravityDir(track) * h.h;
            }
        }
        return surface;
    }

    function press(game, runner, track) {
        if (runner.falling || runner.gone) return;
        runner.want = track;
        runner.wantTime = INPUT_BUFFER;
    }

    function startFall(game, runner, cause) {
        if (runner.falling || runner.immune) return;
        runner.falling = true;
        runner.grounded = false;
        runner.cause = cause;
    }

    function updateRunner(game, r, dt) {
        if (r.gone) return;

        if (r.falling) {
            r.vy += GRAVITY * gravityDir(r.track) * dt;
            r.y += r.vy * dt;
            if (r.cause === 'dragged') r.x -= game.speed * dt;
            if (r.y > H + OFFSCREEN || r.y < -OFFSCREEN || r.x < -OFFSCREEN) r.gone = true;
            return;
        }

        if (r.wantTime > 0) {
            r.wantTime -= dt;
            if (r.wantTime <= 0) r.want = null;
        }
        if (r.want !== null && (r.grounded || r.coyote > 0)) {
            if (r.want !== r.track) {
                r.track = r.want;
                r.grounded = false;
                r.coyote = 0;
                r.vy = FLIP_KICK * gravityDir(r.track);
            }
            r.want = null;
            r.wantTime = 0;
        }

        r.blocked = false;
        if (r.x < r.homeX) r.x = Math.min(r.homeX, r.x + RECOVER_SPEED * dt);
        if (!r.immune) {
            const dir = gravityDir(r.track);
            const base = trackY(r.track);
            const worldX = game.scroll + r.x;
            for (const h of hazardsNear(game, worldX - HALF_BODY, worldX + HALF_BODY)) {
                if (h.kind !== 'block' || h.track !== r.track) continue;
                const top = base - dir * h.h;
                if ((r.y - top) * dir > 1) {
                    r.x = h.x - game.scroll - HALF_BODY;
                    r.blocked = true;
                }
            }
            if (r.x < -40) {
                startFall(game, r, 'dragged');
                return;
            }
        }
        r.blockedTime = r.blocked ? r.blockedTime + dt : 0;

        const dir = gravityDir(r.track);
        const worldX = game.scroll + r.x;
        const surface = r.immune ? trackY(r.track) : surfaceAt(game, r.track, worldX);

        if (r.grounded) {
            if (surface === null) {
                r.grounded = false;
                r.coyote = COYOTE;
            } else if ((surface - r.y) * dir > 0.5) {
                r.grounded = false;
            } else {
                r.y = surface;
                return;
            }
        }

        if (r.coyote > 0) {
            r.coyote -= dt;
            if (r.coyote <= 0) {
                r.coyote = 0;
                startFall(game, r, 'void');
            }
            return;
        }

        const prevY = r.y;
        r.vy += GRAVITY * dir * dt;
        r.y += r.vy * dt;

        if (surface !== null && (r.y - surface) * dir >= 0 && (prevY - surface) * dir <= 1) {
            r.y = surface;
            r.vy = 0;
            r.grounded = true;
            r.landed += 1;
        } else if (surface === null && (r.y - trackY(r.track)) * dir > 0) {
            startFall(game, r, 'void');
        }
    }

    function missChance(scroll) {
        return Math.min(0.2, 0.015 + scroll / 380000);
    }

    function planFor(game, hazard) {
        let plan = game.aiPlans.get(hazard.id);
        if (!plan) {
            plan = {
                miss: game.aiRng() < missChance(hazard.x) * game.missScale,
                lead: 0.1 + game.aiRng() * 0.18
            };
            game.aiPlans.set(hazard.id, plan);
        }
        return plan;
    }

    function think(game, r) {
        if (!r.grounded || r.falling) return;
        if (r.blockedTime > 0.22) {
            press(game, r, 1 - r.track);
            return;
        }
        const front = game.scroll + r.x + HALF_BODY;
        const next = game.course.list.find((h) => h.track === r.track && h.x + h.w > front - HALF_BODY * 2);
        if (!next) return;
        const plan = planFor(game, next);
        if (!plan.miss && next.x - front <= game.speed * plan.lead) press(game, r, 1 - r.track);
    }

    function decide(game) {
        if (game.result) return;
        const p = game.player.falling;
        const c = game.cpu.falling;
        if (!p && !c) return;
        game.result = p && c ? 'draw' : p ? 'cpu' : 'player';
        if (!p) game.player.immune = true;
        if (!c) game.cpu.immune = true;
    }

    function step(game, dt) {
        if (game.finished) return;
        if (game.result) {
            game.speed = Math.max(0, game.speed - 900 * dt);
        } else {
            game.speed = speedAt(game.scroll);
            if (!game.versus) think(game, game.cpu);
        }
        game.scroll += game.speed * dt;
        extendCourse(game, game.scroll + W * 2);
        updateRunner(game, game.player, dt);
        updateRunner(game, game.cpu, dt);
        decide(game);

        const loserGone = (!game.player.falling || game.player.gone) && (!game.cpu.falling || game.cpu.gone);
        if (game.result && loserGone) game.finished = true;
    }

    return {
        W, H, FLOOR_Y, CEIL_Y, FLOOR, CEILING,
        createGame, step, press, extendCourse, hazardsNear, gravityDir, trackY
    };
})();

if (typeof module !== 'undefined') module.exports = GravityCore;
