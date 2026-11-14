/**
 * ruma 🌟 — Componentes Globales de UI (Toasts, Modales y Ventana de Upgrade ruma Plus)
 */

import { Utils } from '../core/utils.js';

export const UI = {
  showToast(message, type = 'info') {
    let stack = document.querySelector('.ruma-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'ruma-toast-stack';
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

  openModal({ title, contentHtml, onMount }) {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'ruma-modal-backdrop';
    backdrop.id = 'ruma-active-modal';

    backdrop.innerHTML = `
      <div class="ruma-modal" role="dialog" aria-modal="true">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.15rem;gap:1rem;">
          <h3 style="font-family:var(--font-display);font-size:1.25rem;font-weight:800;">${Utils.sanitize(title)}</h3>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-close-active-modal">✕</button>
        </div>
        <div class="ruma-modal-body">${contentHtml}</div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.closeModal();
    });
    document.body.appendChild(backdrop);

    document.getElementById('btn-close-active-modal')?.addEventListener('click', () => this.closeModal());
    if (typeof onMount === 'function') onMount(backdrop);
  },

  closeModal() {
    const existing = document.getElementById('ruma-active-modal');
    if (existing) existing.remove();
  },

  /**
   * Muestra el modal elegante de mejora a ruma Plus cuando se alcanza un límite del Plan Gratis
   */
  showUpgradeModal(reasonText, onUpgradeConfirm) {
    this.openModal({
      title: '✨ Desbloquea ruma Plus (Grupo Premium)',
      contentHtml: `
        <div style="text-align:center;padding:0.5rem 0;">
          <img src="assets/ruma_mascot.png" alt="ruma" style="width:96px;height:96px;object-fit:contain;margin-bottom:0.75rem;">
          <p style="color:var(--text-secondary);font-size:0.95rem;line-height:1.5;margin-bottom:1.25rem;">
            ${Utils.sanitize(reasonText)}
          </p>
          <div class="ruma-card" style="text-align:left;background:var(--bg-elevated);margin-bottom:1.25rem;padding:1.1rem;">
            <div style="font-weight:800;color:var(--brand-lilac-soft);margin-bottom:0.6rem;">🌟 Beneficios de crear/mejorar un Grupo Premium:</div>
            <ul style="list-style:none;display:flex;flex-direction:column;gap:0.45rem;font-size:0.86rem;color:var(--text-secondary);">
              <li>✅ <strong>Películas, Series y Música ilimitadas</strong> (sin el tope de 5).</li>
              <li>✅ <strong>Pertenece a todos los grupos que quieras</strong> (supera el límite de 2 grupos).</li>
              <li>✅ <strong>Cargas ilimitadas a Google Drive</strong> y más capacidad de miembros.</li>
              <li>✅ <strong>Marcos estilo Discord exclusivos</strong> y personalización de colores.</li>
            </ul>
          </div>
          <div style="display:flex;gap:0.75rem;justify-content:center;">
            <button type="button" class="btn btn-secondary" id="btn-upgrade-cancel">Ahora no</button>
            <button type="button" class="btn btn-premium" id="btn-upgrade-activate">✨ Mejorar Grupo a Premium</button>
          </div>
        </div>
      `,
      onMount: () => {
        document.getElementById('btn-upgrade-cancel')?.addEventListener('click', () => this.closeModal());
        document.getElementById('btn-upgrade-activate')?.addEventListener('click', () => {
          this.closeModal();
          if (typeof onUpgradeConfirm === 'function') onUpgradeConfirm();
        });
      }
    });
  }
};
