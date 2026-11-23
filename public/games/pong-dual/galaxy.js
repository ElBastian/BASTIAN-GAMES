(() => {
    const starCanvas = document.getElementById('starfield');
    const starCtx = starCanvas.getContext('2d');
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars = [];

    function createStars() {
        starCanvas.width = window.innerWidth;
        starCanvas.height = window.innerHeight;
        const count = Math.floor((starCanvas.width * starCanvas.height) / 3000);
        stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x: Math.random() * starCanvas.width,
                y: Math.random() * starCanvas.height,
                r: Math.random() * 1.5 + 0.2,
                phase: Math.random() * Math.PI * 2,
                speed: Math.random() * 0.03 + 0.005
            });
        }
    }

    function drawStars() {
        starCtx.clearRect(0, 0, starCanvas.width, starCanvas.height);
        for (const s of stars) {
            if (!calm) s.phase += s.speed;
            const alpha = 0.4 + Math.sin(s.phase) * 0.4 + 0.2;
            starCtx.beginPath();
            starCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            starCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            starCtx.fill();
        }
    }

    function loop() {
        drawStars();
        requestAnimationFrame(loop);
    }

    window.addEventListener('resize', () => {
        createStars();
        if (calm) drawStars();
    });
    createStars();
    if (calm) drawStars();
    else loop();
})();
