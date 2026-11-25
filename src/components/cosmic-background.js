/**
 * ruma — Fondo Ambiental Sutil (Armonía Violeta · Lavanda · Rosa)
 * Se adapta automáticamente al tema claro y oscuro sin saturar la interfaz.
 */

export class CosmicBackground {
  constructor(canvasId = 'ruma-cosmic-canvas') {
    this.canvasId = canvasId;
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = canvasId;
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.cssText = `
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 0;
      `;
      document.body.prepend(this.canvas);
    }

    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.stars = [];
    this.nebulae = [];
    this.isRunning = false;
    this.animFrame = null;

    this.handleResize = this.handleResize.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.handleResize, { passive: true });
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.handleResize();
    this.initElements();
    this.start();
  }

  isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  handleVisibility() {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  handleResize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.initElements();
  }

  initElements() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const isMobile = w < 768;

    this.stars = [];
    const count = isMobile ? 20 : 38;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.3 + 0.4,
        alpha: Math.random() * 0.35 + 0.08,
        twinkleSpeed: Math.random() * 0.008 + 0.003,
        twinkleDir: Math.random() > 0.5 ? 1 : -1,
        speedY: -Math.random() * 0.08 - 0.02,
        isPink: Math.random() > 0.65
      });
    }

    this.nebulae = [
      {
        x: w * 0.16,
        y: h * 0.18,
        r: Math.min(w, h) * 0.48,
        darkColor: 'rgba(124, 58, 237, 0.08)',
        lightColor: 'rgba(196, 181, 253, 0.18)',
        vx: 0.04,
        vy: 0.03
      },
      {
        x: w * 0.84,
        y: h * 0.42,
        r: Math.min(w, h) * 0.44,
        darkColor: 'rgba(240, 171, 252, 0.055)',
        lightColor: 'rgba(249, 168, 212, 0.14)',
        vx: -0.035,
        vy: 0.035
      },
      {
        x: w * 0.48,
        y: h * 0.86,
        r: Math.min(w, h) * 0.5,
        darkColor: 'rgba(139, 92, 246, 0.06)',
        lightColor: 'rgba(233, 213, 255, 0.2)',
        vx: 0.03,
        vy: -0.03
      }
    ];
  }

  start() {
    if (!this.isRunning) {
      this.isRunning = true;
      this.animate();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
  }

  animate() {
    if (!this.isRunning || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const light = this.isLight();
    this.ctx.clearRect(0, 0, w, h);

    for (const neb of this.nebulae) {
      neb.x += neb.vx;
      neb.y += neb.vy;
      if (neb.x < 0 || neb.x > w) neb.vx *= -1;
      if (neb.y < 0 || neb.y > h) neb.vy *= -1;

      const grad = this.ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
      grad.addColorStop(0, light ? neb.lightColor : neb.darkColor);
      grad.addColorStop(1, 'transparent');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    if (!light) {
      for (const s of this.stars) {
        s.y += s.speedY;
        if (s.y < -5) {
          s.y = h + 5;
          s.x = Math.random() * w;
        }

        s.alpha += s.twinkleSpeed * s.twinkleDir;
        if (s.alpha > 0.45) {
          s.alpha = 0.45;
          s.twinkleDir = -1;
        } else if (s.alpha < 0.08) {
          s.alpha = 0.08;
          s.twinkleDir = 1;
        }

        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        this.ctx.fillStyle = s.isPink
          ? `rgba(240, 171, 252, ${s.alpha})`
          : `rgba(233, 213, 255, ${s.alpha})`;
        this.ctx.fill();
      }
    }

    this.animFrame = requestAnimationFrame(this.animate);
  }
}
