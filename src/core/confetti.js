/**
 * ruma — Helper ligero para cargar canvas-confetti bajo demanda (code-splitting)
 */
let confettiPromise = null;

export function fireConfetti(options = { particleCount: 60, spread: 65, origin: { y: 0.7 } }) {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  if (!confettiPromise) {
    confettiPromise = import('canvas-confetti').then(m => m.default || m).catch(() => null);
  }
  confettiPromise.then(fn => {
    if (typeof fn === 'function') {
      try { fn(options); } catch (_) {}
    }
  });
}
