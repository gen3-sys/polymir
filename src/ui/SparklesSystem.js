const CONFIG = {
    particles: {
        max: 150,
        spawnRate: 40,
        connectionDistance: 120,
        maxConnections: 4,
        colors: [
            '#4a90e2', '#357abd', '#64b5f6', '#42a5f5',
            '#29b6f6', '#26c6da', '#26a69a', '#66bb6a',
            '#9ccc65', '#d4e157', '#ffee58', '#ffca28',
            '#ffa726', '#ff7043', '#ec407a', '#ab47bc'
        ]
    }
};

export class SparklesSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.particles = [];
        this.connections = [];
        this.lastSpawnTime = 0;
        this.isRunning = true;
        this.isPaused = false;
        this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        this.resize();
        this.init();
        this.startAnimation();

        window.addEventListener('resize', this.handleResize.bind(this));
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
        window.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
    }

    handleResize() {
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => this.resize(), 150);
    }

    handleVisibilityChange() {
        this.isRunning = !document.hidden;
        if (this.isRunning && !this.animationId && !this.isPaused) {
            this.startAnimation();
        }
    }

    handleWheel(e) {
        if (e.ctrlKey) {
            e.preventDefault();
        }
    }

    resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.canvas.width = width * this.pixelRatio;
        this.canvas.height = height * this.pixelRatio;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.scale(this.pixelRatio, this.pixelRatio);

        this.logicalWidth = width;
        this.logicalHeight = height;
    }

    init() {
        for (let i = 0; i < 37; i++) {
            this.particles.push(this.createParticle(true));
        }
    }

    createParticle(isInitial = false) {
        const colors = CONFIG.particles.colors;
        const particle = {
            x: Math.random() * this.logicalWidth,
            y: Math.random() * this.logicalHeight,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            size: Math.random() * 1.85 + 2.25,
            opacity: 0,
            maxOpacity: Math.random() * 0.6 + 0.4,
            color: colors[Math.floor(Math.random() * colors.length)],
            phase: 'fadein',
            fadeSpeed: (Math.random() * 0.008 + 0.003) / 2,
            birthTime: Date.now()
        };

        if (isInitial) {
            particle.opacity = Math.random() * particle.maxOpacity;
            particle.phase = Math.random() > 0.5 ? 'fadein' : 'fadeout';
        }

        return particle;
    }

    updateParticle(particle) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0) particle.x = this.logicalWidth;
        if (particle.x > this.logicalWidth) particle.x = 0;
        if (particle.y < 0) particle.y = this.logicalHeight;
        if (particle.y > this.logicalHeight) particle.y = 0;

        if (particle.phase === 'fadein') {
            particle.opacity += particle.fadeSpeed;
            if (particle.opacity >= particle.maxOpacity) {
                particle.opacity = particle.maxOpacity;
                particle.phase = 'fadeout';
            }
        } else if (particle.phase === 'fadeout') {
            particle.opacity -= particle.fadeSpeed;
            if (particle.opacity <= 0) {
                particle.opacity = 0;
                particle.phase = 'dead';
                return false;
            }
        }

        return true;
    }

    spawnParticles(currentTime) {
        const spawnCount = Math.random() > 0.6 ? 3 : Math.random() > 0.8 ? 2 : 1;

        if (currentTime - this.lastSpawnTime > 1000 / CONFIG.particles.spawnRate) {
            for (let i = 0; i < spawnCount; i++) {
                if (this.particles.length < CONFIG.particles.max) {
                    this.particles.push(this.createParticle());
                }
            }
            this.lastSpawnTime = currentTime;
        }
    }

    updateConnections() {
        this.connections = [];

        for (let i = 0; i < this.particles.length; i++) {
            const particle = this.particles[i];
            const particleConnections = [];

            for (let j = i + 1; j < this.particles.length; j++) {
                const other = this.particles[j];
                const distance = Math.sqrt(
                    Math.pow(particle.x - other.x, 2) +
                    Math.pow(particle.y - other.y, 2)
                );

                if (distance < CONFIG.particles.connectionDistance &&
                    particleConnections.length < CONFIG.particles.maxConnections) {

                    const particleOpacity = Math.min(particle.opacity, other.opacity);
                    const distanceFade = (1 - distance / CONFIG.particles.connectionDistance) * 0.3;

                    particleConnections.push({
                        from: particle,
                        to: other,
                        distance: distance,
                        opacity: distanceFade,
                        particleOpacity: particleOpacity
                    });
                }
            }

            this.connections.push(...particleConnections);
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

        const theme = document.documentElement.getAttribute('data-theme');
        const connectionColor = theme === 'light' ? '#000000' : '#ffffff';

        this.connections.forEach(connection => {
            this.ctx.beginPath();
            this.ctx.moveTo(connection.from.x, connection.from.y);
            this.ctx.lineTo(connection.to.x, connection.to.y);
            this.ctx.strokeStyle = connectionColor;

            this.ctx.globalAlpha = connection.opacity * Math.pow(connection.particleOpacity, 2);
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });

        this.particles.forEach(particle => {
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            this.ctx.fillStyle = particle.color;
            this.ctx.globalAlpha = particle.opacity;
            this.ctx.fill();
        });
    }

    startAnimation() {
        if (!this.animationId && !this.isPaused) {
            this.animate();
        }
    }

    animate() {
        if (!this.isRunning || this.isPaused) {
            this.animationId = null;
            return;
        }

        const currentTime = performance.now();

        this.particles = this.particles.filter(particle => this.updateParticle(particle));

        this.spawnParticles(currentTime);

        this.updateConnections();

        this.render();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    pause() {
        this.isPaused = true;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    resume() {
        this.isPaused = false;
        if (this.isRunning) {
            this.startAnimation();
        }
    }

    updateTheme() {
    }

    destroy() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('wheel', this.handleWheel);
    }
}
