/**
 * ruma 🌟 — Componentes Globales de UI (Toasts, Modales con Escape/onClose y Lightbox iOS-safe)
 */

import { Utils } from '../core/utils.js';
import { CryptoAuth } from '../core/crypto.js';

let activeModalCleanup = null;
let activeEscHandler = null;

export const UI = {
  showToast(message, type = 'info') {
    let stack = document.querySelector('.ruma-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'ruma-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }

    const toast = document.createElement('div');
    toast.className = `ruma-toast toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 3200);
  },

  openModal({ title, contentHtml, onMount, onClose, size = 'md' }) {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'ruma-modal-backdrop';
    backdrop.id = 'ruma-active-modal';

    const maxWidth = size === 'xl' ? '920px' : (size === 'lg' ? '740px' : '560px');

    backdrop.innerHTML = `
      <div class="ruma-modal" role="dialog" aria-modal="true" style="max-width:${maxWidth};">
        <div class="ruma-modal-head">
          <h3>${Utils.sanitize(title)}</h3>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-active-modal" aria-label="Cerrar">✕</button>
        </div>
        <div class="ruma-modal-body">${contentHtml}</div>
      </div>
    `;

    activeModalCleanup = typeof onClose === 'function' ? onClose : null;
    activeEscHandler = (e) => {
      if (e.key === 'Escape') this.closeModal();
    };
    document.addEventListener('keydown', activeEscHandler);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeModal();
    });
    document.body.appendChild(backdrop);

    document.getElementById('btn-close-active-modal')?.addEventListener('click', () => this.closeModal());
    if (typeof onMount === 'function') onMount(backdrop);
  },

  closeModal() {
    if (activeEscHandler) {
      document.removeEventListener('keydown', activeEscHandler);
      activeEscHandler = null;
    }
    const cleanup = activeModalCleanup;
    activeModalCleanup = null;
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (_) {}
    }
    const existing = document.getElementById('ruma-active-modal');
    if (existing) existing.remove();
  },

  openLightbox(url, isVideo = false, caption = '') {
    const existing = document.getElementById('ruma-active-lightbox');
    if (existing) existing.remove();

    const safeSrc = Utils.sanitize(Utils.safeUrl(url, ''));
    if (!safeSrc) return;

    const overlay = document.createElement('div');
    overlay.id = 'ruma-active-lightbox';
    overlay.className = 'ruma-modal-backdrop';
    overlay.style.zIndex = '700';
    overlay.innerHTML = `
      <div style="position:relative;max-width:92vw;max-height:90dvh;display:flex;flex-direction:column;align-items:center;gap:0.75rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-close-lightbox" style="align-self:flex-end;">✕ Cerrar</button>
        ${isVideo
          ? `<video src="${safeSrc}" controls playsinline webkit-playsinline preload="metadata" style="max-width:90vw;max-height:78dvh;border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);background:#000;"></video>`
          : `<img src="${safeSrc}" alt="Vista completa" style="max-width:90vw;max-height:78dvh;border-radius:var(--radius-lg);object-fit:contain;box-shadow:var(--shadow-lg);">`
        }
        ${caption ? `<div style="color:var(--text-secondary);font-size:0.88rem;font-weight:600;text-align:center;">${Utils.sanitize(caption)}</div>` : ''}
      </div>
    `;
    const closeLb = () => {
      document.removeEventListener('keydown', onEsc);
      overlay.remove();
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') closeLb();
    };
    document.addEventListener('keydown', onEsc);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLb();
    });
    document.body.appendChild(overlay);
    document.getElementById('btn-close-lightbox')?.addEventListener('click', closeLb);
  },

  /**
   * Muestra el modal elegante de mejora a ruma Plus cuando se alcanza un límite del Plan Gratis
   */
  showUpgradeModal(reasonText, onUpgradeConfirm) {
    const allowSelfUpgrade = CryptoAuth.isBetaSelfUpgradeAllowed();
    this.openModal({
      title: '✨ Desbloquea ruma Plus (Grupo Premium)',
      contentHtml: `
        <div style="text-align:center;padding:0.5rem 0;">
          <img src="assets/ruma_home_axolotl.png" alt="ruma" style="width:88px;height:88px;object-fit:contain;margin-bottom:0.75rem;border-radius:20px;">
          <p style="color:var(--text-secondary);font-size:0.95rem;line-height:1.5;margin-bottom:1.25rem;">
            ${Utils.sanitize(reasonText)}
          </p>
          <div class="ruma-card" style="text-align:left;background:var(--surface-secondary);margin-bottom:1.25rem;padding:1.1rem;">
            <div style="font-weight:800;color:var(--primary);margin-bottom:0.6rem;">🌟 Beneficios de crear/mejorar un Grupo Premium:</div>
            <ul style="list-style:none;display:flex;flex-direction:column;gap:0.45rem;font-size:0.86rem;color:var(--text-secondary);">
              <li>✅ <strong>Películas, Series, Libros y Música ilimitados</strong> (sin el tope de 5).</li>
              <li>✅ <strong>Pertenece a todos los grupos que quieras</strong> (supera el límite de 2 grupos).</li>
              <li>✅ <strong>Cargas ilimitadas a Google Drive</strong> y más capacidad de miembros.</li>
              <li>✅ <strong>Marcos de perfil exclusivos</strong> y funciones avanzadas.</li>
            </ul>
          </div>
          <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" id="btn-upgrade-cancel">Ahora no</button>
            <button type="button" class="btn btn-premium" id="btn-upgrade-activate">
              ${allowSelfUpgrade ? '✨ Mejorar Grupo a Premium (Dev)' : '✨ ruma Plus · Próximamente'}
            </button>
          </div>
        </div>
      `,
      onMount: () => {
        document.getElementById('btn-upgrade-cancel')?.addEventListener('click', () => this.closeModal());
        document.getElementById('btn-upgrade-activate')?.addEventListener('click', () => {
          this.closeModal();
          if (allowSelfUpgrade) {
            if (typeof onUpgradeConfirm === 'function') onUpgradeConfirm();
          } else {
            this.showToast('ruma Plus estará disponible próximamente en el lanzamiento oficial 💜', 'info');
          }
        });
      }
    });
  }
};
