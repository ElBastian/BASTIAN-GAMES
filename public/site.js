(() => {
    'use strict';

    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const starCanvas = document.getElementById('starfield');
    const starCtx = starCanvas.getContext('2d');
    let stars = [];

    function createStars() {
        starCanvas.width = innerWidth;
        starCanvas.height = innerHeight;
        const count = Math.floor((starCanvas.width * starCanvas.height) / 3000);
        stars = Array.from({ length: count }, () => ({
            x: Math.random() * starCanvas.width,
            y: Math.random() * starCanvas.height,
            r: Math.random() * 1.5 + 0.2,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.03 + 0.005
        }));
    }

    function drawStars() {
        starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
        for (const s of stars) {
            if (!calm) s.phase += s.speed;
            starCtx.beginPath();
            starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            starCtx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(s.phase) * 0.4})`;
            starCtx.fill();
        }
    }

    function field(ctx) {
        ctx.clearRect(0, 0, 640, 360);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 14;
    }

    const previews = {
        wall(ctx) {
            field(ctx);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#555';
            ctx.fillRect(628, 0, 12, 360);
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00f5ff';
            ctx.fillStyle = '#00f5ff';
            ctx.fillRect(28, 112, 13, 88);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(392, 212, 10, 0, Math.PI * 2); ctx.fill();
            ctx.font = '26px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Puntos: 12', 320, 40);
        },
        dual(ctx) {
            field(ctx);
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 3;
            ctx.setLineDash([12, 12]);
            ctx.beginPath(); ctx.moveTo(320, 0); ctx.lineTo(320, 360); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = '26px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText('4', 270, 40);
            ctx.fillText('5', 370, 40);
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#c77dff';
            ctx.fillStyle = '#c77dff';
            ctx.fillRect(28, 72, 13, 88);
            ctx.shadowColor = '#fff';
            ctx.fillStyle = '#fff';
            ctx.fillRect(599, 196, 13, 88);
            ctx.beginPath(); ctx.arc(226, 150, 10, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        },
        sprite(ctx) {
            const space = ctx.createLinearGradient(0, 0, 640, 360);
            space.addColorStop(0, '#070318');
            space.addColorStop(0.55, '#21104f');
            space.addColorStop(1, '#05030f');
            ctx.fillStyle = space;
            ctx.fillRect(0, 0, 640, 360);
            ctx.fillStyle = '#fff';
            for (let i = 1; i <= 46; i++) {
                ctx.fillRect((i * 149) % 640, (i * 83) % 360, 1 + (i % 3 === 0), 1 + (i % 3 === 0));
            }
            const planet = ctx.createRadialGradient(462, 150, 6, 480, 170, 52);
            planet.addColorStop(0, '#ff9e7a');
            planet.addColorStop(0.6, '#a23b8f');
            planet.addColorStop(1, '#2a1250');
            ctx.fillStyle = planet;
            ctx.beginPath(); ctx.arc(480, 170, 52, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = '#31246e';
            ctx.fillRect(0, 26, 380, 24);
            ctx.fillRect(490, 26, 150, 24);
            ctx.fillRect(0, 310, 130, 24);
            ctx.fillRect(250, 310, 390, 24);
            ctx.fillStyle = '#7fe3ff';
            ctx.fillRect(0, 48, 380, 2);
            ctx.fillRect(490, 48, 150, 2);
            ctx.fillRect(0, 310, 130, 2);
            ctx.fillRect(250, 310, 390, 2);

            const drawRunner = (src, x, feetY, flipped) => {
                const sheet = new Image();
                sheet.onload = () => {
                    ctx.save();
                    ctx.translate(x, feetY);
                    ctx.scale(0.6, flipped ? -0.6 : 0.6);
                    ctx.drawImage(sheet, 400, 400, 200, 200, -100, -190, 200, 200);
                    ctx.restore();
                };
                sheet.src = src;
            };
            drawRunner('games/sprite/corredor1-juego.png', 340, 310, false);
            drawRunner('games/sprite/corredor2-juego.png', 220, 50, true);
        },
        gravityDual(ctx) {
            previews.sprite(ctx);
            ctx.save();
            ctx.font = '48px "Tilt Neon", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#9d6bff';
            ctx.shadowBlur = 18;
            ctx.fillStyle = '#fff';
            ctx.fillText('VS', 320, 180);
            ctx.restore();
        }
    };

    document.querySelectorAll('[data-preview]').forEach((c) => {
        previews[c.dataset.preview](c.getContext('2d'));
    });

    function loop() {
        drawStars();
        requestAnimationFrame(loop);
    }

    addEventListener('resize', () => {
        createStars();
        if (calm) drawStars();
    });

    createStars();
    if (calm) drawStars();
    else requestAnimationFrame(loop);
})();
