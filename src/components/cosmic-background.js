/**
 * ruma 🌟 — Motor de Fondo Cósmico (Nebulosa Violeta/Rosa & Polvo Estelar)
 * Renderizado de alto rendimiento en <canvas> con partículas suaves y orbes de luz ambiental
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
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.handleResize, { passive: true });
    this.handleResize();
    this.initElements();
    this.start();
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

    // 1. Polvo estelar (estrellas suaves que titilan)
    this.stars = [];
    const count = isMobile ? 35 : 70;
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        size: Math.random() * 1.6 + 0.4,
        alpha: Math.random() * 0.5 + 0.15,
        twinkleSpeed: Math.random() * 0.012 + 0.004,
        twinkleDir: Math.random() > 0.5 ? 1 : -1,
        speedY: -Math.random() * 0.12 - 0.03,
        color: Math.random() > 0.35 ? 'rgba(233, 213, 255,' : 'rgba(244, 114, 182,'
      });
    }

    // 2. Orbes de nebulosa ambiental suave (Violeta, Lila, Rosa y Cyan)
    this.nebulae = [
      {
        x: w * 0.15,
        y: h * 0.2,
        r: Math.min(w, h) * 0.45,
        color: 'rgba(124, 58, 237, 0.13)',
        vx: 0.06,
        vy: 0.04
      },
      {
        x: w * 0.85,
        y: h * 0.45,
        r: Math.min(w, h) * 0.42,
        color: 'rgba(236, 72, 153, 0.09)',
        vx: -0.05,
        vy: 0.05
      },
      {
        x: w * 0.5,
        y: h * 0.85,
        r: Math.min(w, h) * 0.5,
        color: 'rgba(192, 132, 252, 0.08)',
        vx: 0.04,
        vy: -0.05
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
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  animate() {
    if (!this.isRunning || !this.ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    // Dibujar Nebulosas
    for (const neb of this.nebulae) {
      neb.x += neb.vx;
      neb.y += neb.vy;
      if (neb.x < 0 || neb.x > w) neb.vx *= -1;
      if (neb.y < 0 || neb.y > h) neb.vy *= -1;

      const grad = this.ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.r);
      grad.addColorStop(0, neb.color);
      grad.addColorStop(1, 'transparent');

      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Dibujar Estrellas
    for (const s of this.stars) {
      s.y += s.speedY;
      if (s.y < -5) {
        s.y = h + 5;
        s.x = Math.random() * w;
      }

      s.alpha += s.twinkleSpeed * s.twinkleDir;
      if (s.alpha > 0.75) {
        s.alpha = 0.75;
        s.twinkleDir = -1;
      } else if (s.alpha < 0.12) {
        s.alpha = 0.12;
        s.twinkleDir = 1;
      }

      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `${s.color}${s.alpha})`;
      this.ctx.fill();
    }

    this.animFrame = requestAnimationFrame(this.animate);
  }
}
