const GravityRender = (() => {
    'use strict';

    const { W, H, FLOOR_Y, CEIL_Y, FLOOR, CEILING, gravityDir, hazardsNear } = GravityCore;
    const PLATE = 34;
    const COLORS = { player: '#4cc9ff', cpu: '#ffb627', edge: '#9d6bff', danger: '#ff3d81' };

    const CELL = 200;
    const FOOT = 190;
    const SCALE = 0.52;
    const BODY = 88;
    const ROW = { idle: 0, run: 2, air: 3 };

    function seeded(i) {
        const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
        return v - Math.floor(v);
    }

    function paintBackdrop() {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const b = canvas.getContext('2d');
        const base = b.createLinearGradient(0, 0, W, H);
        base.addColorStop(0, '#070318');
        base.addColorStop(0.55, '#120a35');
        base.addColorStop(1, '#05030f');
        b.fillStyle = base;
        b.fillRect(0, 0, W, H);
        const clouds = [
            [210, 170, 300, '157,107,255', 0.3],
            [720, 350, 340, '255,61,129', 0.2],
            [520, 120, 240, '76,201,255', 0.16],
            [90, 430, 240, '76,201,255', 0.12]
        ];
        for (const [x, y, r, rgb, a] of clouds) {
            const g = b.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${rgb},${a})`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            b.fillStyle = g;
            b.fillRect(0, 0, W, H);
        }
        return canvas;
    }

    function create(canvas, { assetBase = '' } = {}) {
        const ctx = canvas.getContext('2d');
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const backdrop = paintBackdrop();
        const sheets = { player: new Image(), cpu: new Image() };
        sheets.player.src = `${assetBase}corredor1-juego.png`;
        sheets.cpu.src = `${assetBase}corredor2-juego.png`;

        const starLayers = [0.05, 0.12, 0.26].map((speed, l) => ({
            speed,
            stars: Array.from({ length: 70 - l * 15 }, (_, i) => ({
                x: seeded(i + l * 100) * W,
                y: seeded(i + l * 200 + 7) * H,
                r: 0.6 + l * 0.5 + seeded(i + l * 300) * 0.5,
                phase: seeded(i + l * 400) * Math.PI * 2
            }))
        }));

        let clock = 0;
        let shake = 0;
        let particles = [];
        let looks = {};

        function reset() {
            shake = 0;
            particles = [];
            looks = {};
        }

        function lookFor(entry) {
            if (!looks[entry.skin]) {
                looks[entry.skin] = {
                    orient: gravityDir(entry.runner.track),
                    anim: 0,
                    landed: entry.runner.landed,
                    wasFalling: entry.runner.falling
                };
            }
            return looks[entry.skin];
        }

        function drawStars(scroll) {
            ctx.fillStyle = '#fff';
            for (const layer of starLayers) {
                for (const s of layer.stars) {
                    const x = (((s.x - scroll * layer.speed) % W) + W) % W;
                    ctx.globalAlpha = calm ? 0.75 : 0.55 + Math.sin(clock * 2 + s.phase) * 0.35;
                    ctx.beginPath();
                    ctx.arc(x, s.y, s.r, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }

        function drawPlanet(scroll) {
            const span = W + 420;
            const x = W + 210 - ((scroll * 0.025 + 330) % span);
            const r = 74;
            ctx.save();
            ctx.translate(x, 200);
            ctx.rotate(-0.32);
            ctx.strokeStyle = 'rgba(255,190,140,0.32)';
            ctx.lineWidth = 9;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.75, r * 0.42, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
            const g = ctx.createRadialGradient(-26, -30, 8, 0, 0, r);
            g.addColorStop(0, '#ff9e7a');
            g.addColorStop(0.55, '#a23b8f');
            g.addColorStop(1, '#2a1250');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.75, r * 0.42, 0, 0, Math.PI);
            ctx.stroke();
            ctx.restore();
        }

        function withTrack(track, fn) {
            ctx.save();
            if (track === FLOOR) {
                ctx.translate(0, FLOOR_Y);
            } else {
                ctx.translate(0, CEIL_Y);
                ctx.scale(1, -1);
            }
            fn();
            ctx.restore();
        }

        function drawPlate(x0, x1, scroll) {
            const g = ctx.createLinearGradient(0, 0, 0, PLATE);
            g.addColorStop(0, '#31246e');
            g.addColorStop(1, '#120b33');
            ctx.fillStyle = g;
            ctx.fillRect(x0, 0, x1 - x0, PLATE);

            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, 0, x1 - x0, PLATE);
            ctx.clip();
            ctx.strokeStyle = 'rgba(157,107,255,0.34)';
            ctx.lineWidth = 2;
            const step = 72;
            for (let px = -((scroll % step) + step); px < W + step; px += step) {
                ctx.beginPath();
                ctx.moveTo(px, 5);
                ctx.lineTo(px + 16, PLATE);
                ctx.stroke();
            }
            ctx.restore();

            ctx.fillStyle = 'rgba(76,201,255,0.2)';
            ctx.fillRect(x0, -3, x1 - x0, 8);
            ctx.fillStyle = '#7fe3ff';
            ctx.fillRect(x0, 0, x1 - x0, 2.5);
        }

        function drawGapEdge(x, side) {
            const g = ctx.createLinearGradient(x, 0, x + side * 26, 0);
            g.addColorStop(0, 'rgba(255,61,129,0.75)');
            g.addColorStop(1, 'rgba(255,61,129,0)');
            ctx.fillStyle = g;
            ctx.fillRect(side > 0 ? x : x - 26, 0, 26, PLATE);
            ctx.fillStyle = COLORS.danger;
            ctx.fillRect(side > 0 ? x : x - 3, -2, 3, PLATE + 2);
        }

        function drawWall(h, scroll) {
            const x = h.x - scroll;
            const top = -h.h;

            ctx.save();
            ctx.shadowColor = COLORS.danger;
            ctx.shadowBlur = 16;
            const g = ctx.createLinearGradient(x, 0, x + h.w, 0);
            g.addColorStop(0, '#7a1c6e');
            g.addColorStop(0.5, '#4a1760');
            g.addColorStop(1, '#260c47');
            ctx.fillStyle = g;
            ctx.fillRect(x, top, h.w, h.h);
            ctx.restore();

            const course = 18;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, top, h.w, h.h);
            ctx.clip();
            ctx.strokeStyle = 'rgba(255,170,215,0.42)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let row = 0, y = 0; y > top; row++, y -= course) {
                ctx.moveTo(x, y - course);
                ctx.lineTo(x + h.w, y - course);
                const joint = x + h.w * (row % 2 ? 0.28 : 0.72);
                ctx.moveTo(joint, y);
                ctx.lineTo(joint, y - course);
            }
            ctx.stroke();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255,214,235,0.85)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x, top, h.w, h.h);
            ctx.fillStyle = COLORS.danger;
            ctx.fillRect(x - 3, top - 2, h.w + 6, 6);
        }

        function drawTrack(world, track) {
            const scroll = world.scroll;
            const near = hazardsNear(world, scroll - 40, scroll + W + 40).filter((h) => h.track === track);
            withTrack(track, () => {
                let cursor = -10;
                for (const h of near) {
                    if (h.kind !== 'gap') continue;
                    const a = h.x - scroll;
                    const b = a + h.w;
                    if (a > cursor) drawPlate(cursor, a, scroll);
                    drawGapEdge(a, -1);
                    drawGapEdge(b, 1);
                    cursor = b;
                }
                if (cursor < W + 10) drawPlate(cursor, W + 10, scroll);
                for (const h of near) if (h.kind === 'block') drawWall(h, scroll);
            });
        }

        function frameFor(r, look, idle) {
            if (idle) return [ROW.idle, Math.floor(clock * 6) % 3];
            if (r.falling) return [ROW.air, 2];
            if (!r.grounded) {
                const toward = r.vy * gravityDir(r.track);
                return [ROW.air, toward < 700 ? 1 : toward < 1200 ? 2 : 3];
            }
            return [ROW.run, Math.floor(look.anim) % 5];
        }

        function burst(x, y, color, count) {
            if (calm) return;
            for (let i = 0; i < count; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = 40 + Math.random() * 190;
                particles.push({ x, y, vx: Math.cos(a) * s - 120, vy: Math.sin(a) * s, life: 0.5, max: 0.5, color });
            }
        }

        function updateLook(entry, world, dt) {
            const r = entry.runner;
            const look = lookFor(entry);
            const target = gravityDir(r.track);
            const delta = target - look.orient;
            look.orient += Math.sign(delta) * Math.min(Math.abs(delta), dt * 8);
            look.anim += dt * (9 + world.speed / 55);

            if (r.landed !== look.landed) {
                look.landed = r.landed;
                burst(r.x, r.y, COLORS[entry.skin], 9);
            }
            if (r.falling && !look.wasFalling) {
                look.wasFalling = true;
                burst(r.x, r.y, COLORS.danger, 22);
                if (!calm) shake = 0.3;
            }
        }

        function drawRunner(entry, idle) {
            const r = entry.runner;
            if (r.gone) return;
            const look = lookFor(entry);
            const sign = look.orient >= 0 ? 1 : -1;
            const squash = sign * Math.max(0.28, Math.abs(look.orient));
            const cy = r.y - look.orient * (BODY / 2);
            const [row, col] = frameFor(r, look, idle);
            const sheet = sheets[entry.skin];

            ctx.save();
            if (entry.ghost) ctx.globalAlpha = 0.55;
            ctx.translate(r.x, cy);
            ctx.scale(SCALE, SCALE * squash);
            ctx.shadowColor = COLORS[entry.skin];
            ctx.shadowBlur = 16;
            if (sheet.complete && sheet.naturalWidth) {
                const footOffset = (BODY / 2) / SCALE;
                ctx.drawImage(sheet, col * CELL, row * CELL, CELL, CELL, -CELL / 2, footOffset - FOOT, CELL, CELL);
            }
            ctx.restore();

            ctx.font = '700 14px "Atkinson Hyperlegible", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = COLORS[entry.skin];
            ctx.fillText(entry.label, r.x, r.y - look.orient * (BODY + 16 + (entry.labelLift || 0)));
        }

        function drawParticles(dt) {
            for (const p of particles) {
                p.life -= dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                ctx.globalAlpha = Math.max(0, p.life / p.max);
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
            }
            ctx.globalAlpha = 1;
            particles = particles.filter((p) => p.life > 0);
        }

        function drawHUD(world, hud) {
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.font = '26px "Tilt Neon", sans-serif';
            ctx.fillText(`${Math.floor(world.scroll / 10)} m`, W / 2, 25);

            ctx.font = '700 15px "Atkinson Hyperlegible", sans-serif';
            ctx.textAlign = 'left';
            ctx.fillStyle = COLORS.player;
            ctx.fillText(`● ${hud.left}`, 18, 25);
            ctx.textAlign = 'right';
            ctx.fillStyle = COLORS.cpu;
            ctx.fillText(`${hud.right} ●`, W - 18, 25);
        }

        function drawCountdown({ value, progress }) {
            ctx.save();
            ctx.translate(W / 2, H / 2);
            const s = calm ? 1 : 1 + progress * 0.35;
            ctx.scale(s, s);
            ctx.globalAlpha = calm ? 1 : Math.min(1, 0.25 + progress * 1.2);
            ctx.font = '96px "Tilt Neon", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = COLORS.edge;
            ctx.shadowBlur = 26;
            ctx.fillStyle = '#fff';
            ctx.fillText(String(value), 0, 0);
            ctx.restore();
        }

        function frame(view, dt) {
            clock += dt;
            if (shake > 0) shake = Math.max(0, shake - dt);
            if (view.animate) for (const e of view.runners) updateLook(e, view.world, dt);

            const bgScroll = view.world.scroll + (view.drift ? clock * 26 : 0);
            ctx.drawImage(backdrop, 0, 0);
            drawStars(bgScroll);
            drawPlanet(bgScroll);

            ctx.save();
            if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
            for (const e of view.runners) if (e.runner.falling) drawRunner(e, view.idle);
            drawTrack(view.world, CEILING);
            drawTrack(view.world, FLOOR);
            for (const e of view.runners) if (!e.runner.falling) drawRunner(e, view.idle);
            drawParticles(dt);
            ctx.restore();

            drawHUD(view.world, view.hud);
            if (view.countdown) drawCountdown(view.countdown);
        }

        if (document.fonts) {
            document.fonts.load('26px "Tilt Neon"');
            document.fonts.load('700 15px "Atkinson Hyperlegible"');
        }
        return { frame, reset };
    }

    return { create };
})();
