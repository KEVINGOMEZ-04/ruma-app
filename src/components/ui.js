/**
 * ruma 🌟 — Componentes Globales de UI (Toasts, Modales con Escape/onClose y Lightbox iOS-safe)
 */

import { Utils } from '../core/utils.js';
import { CryptoAuth } from '../core/crypto.js';
import { CONFIG } from '../core/config.js';
import { BillingService } from '../services/billing-service.js';
import { FirebaseAuth } from '../services/firebase-auth.js';

let activeModalCleanup = null;
let activeEscHandler = null;

export const UI = {
  showToast(message, type = 'info') {
    let stack = document.querySelector('.ruma-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'ruma-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      stack.style.pointerEvents = 'none';
      document.body.appendChild(stack);
    }

    // Evitar apilamiento excesivo en móvil (al marcar varios capítulos rápido)
    while (stack.children.length >= 1) {
      stack.firstElementChild.remove();
    }

    const toast = document.createElement('div');
    toast.className = `ruma-toast toast-${type}`;
    toast.style.pointerEvents = 'none';
    toast.textContent = message;
    stack.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 2400);
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
   * Muestra el modal oficial de suscripción a ruma Plus (Google Play Billing v8+ vía RevenueCat)
   */
  showUpgradeModal(reasonText, onUpgradeConfirm, { userId = '' } = {}) {
    const allowSelfUpgrade = CryptoAuth.isBetaSelfUpgradeAllowed();
    const nativeBilling = BillingService.isNativeBillingReady();
    let effectiveUserId = userId || FirebaseAuth.getSession()?.uid || '';
    if (!effectiveUserId) {
      try { effectiveUserId = localStorage.getItem(CONFIG.storageKeys.currentUserId) || ''; } catch (_) {}
    }

    this.openModal({
      title: '✨ Desbloquea ruma Plus (Grupo Premium)',
      contentHtml: `
        <div style="text-align:center;padding:0.5rem 0;">
          <img src="assets/ruma_home_axolotl.png" alt="ruma" style="width:88px;height:88px;object-fit:contain;margin-bottom:0.75rem;border-radius:20px;">
          <p style="color:var(--text-secondary);font-size:0.95rem;line-height:1.5;margin-bottom:1.1rem;">
            ${Utils.sanitize(reasonText)}
          </p>
          <div class="ruma-card" style="text-align:left;background:var(--surface-secondary);margin-bottom:1.1rem;padding:1.1rem;">
            <div style="font-weight:800;color:var(--primary);margin-bottom:0.6rem;">🌟 Beneficios de ruma Plus:</div>
            <ul style="list-style:none;display:flex;flex-direction:column;gap:0.45rem;font-size:0.86rem;color:var(--text-secondary);">
              <li>✅ <strong>Películas, Series, Libros y Música ilimitados</strong> (sin el tope de 5).</li>
              <li>✅ <strong>Pertenece a todos los grupos que quieras</strong> (supera el límite de 2 grupos).</li>
              <li>✅ <strong>Cargas ilimitadas a Google Drive</strong> y más capacidad de miembros.</li>
              <li>✅ <strong>Marcos de perfil exclusivos</strong> y funciones avanzadas.</li>
            </ul>
          </div>
          <div id="ruma-billing-price" style="font-size:0.82rem;color:var(--text-muted);margin-bottom:0.95rem;">
            ${nativeBilling ? 'Consultando precio oficial en Google Play…' : 'Suscripción gestionada de forma segura con Google Play Billing en Android.'}
          </div>
          <div style="display:flex;gap:0.65rem;justify-content:center;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary" id="btn-upgrade-cancel">Ahora no</button>
            <button type="button" class="btn btn-premium" id="btn-upgrade-activate">
              ${nativeBilling ? '✨ Suscribirme con Google Play' : (allowSelfUpgrade ? '✨ Mejorar Grupo (Dev)' : '✨ ruma Plus en Google Play')}
            </button>
          </div>
          ${nativeBilling ? `
            <div style="margin-top:0.75rem;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-upgrade-restore">🔄 Restaurar compras</button>
            </div>` : ''}
          <p style="font-size:0.72rem;color:var(--text-muted);margin-top:0.85rem;line-height:1.4;">
            Renovación automática cancelable en cualquier momento desde Google Play.
            <a href="${CONFIG.webUrls.terms}" target="_blank" rel="noopener">Términos</a> ·
            <a href="${CONFIG.webUrls.privacy}" target="_blank" rel="noopener">Privacidad</a>
          </p>
        </div>
      `,
      onMount: () => {
        const priceEl = document.getElementById('ruma-billing-price');
        const buyBtn = document.getElementById('btn-upgrade-activate');
        const restoreBtn = document.getElementById('btn-upgrade-restore');

        if (nativeBilling) {
          BillingService.getPlusOfferSummary().then(offer => {
            if (priceEl && offer?.available && offer.priceString) {
              priceEl.textContent = `Plan ${offer.periodLabel}: ${offer.priceString} vía Google Play Billing.`;
            }
          }).catch(() => {});
        }

        document.getElementById('btn-upgrade-cancel')?.addEventListener('click', () => this.closeModal());

        restoreBtn?.addEventListener('click', async () => {
          restoreBtn.disabled = true;
          const res = await BillingService.restorePurchases(effectiveUserId);
          restoreBtn.disabled = false;
          this.showToast(res.message || res.error || 'Proceso finalizado.', res.isPremium ? 'success' : 'info');
          if (res.isPremium) {
            this.closeModal();
            if (typeof onUpgradeConfirm === 'function') onUpgradeConfirm();
          }
        });

        buyBtn?.addEventListener('click', async () => {
          if (nativeBilling) {
            buyBtn.disabled = true;
            buyBtn.textContent = 'Conectando con Google Play…';
            const res = await BillingService.purchasePlus(effectiveUserId);
            buyBtn.disabled = false;
            buyBtn.textContent = '✨ Suscribirme con Google Play';
            if (res.ok && res.isPremium) {
              this.closeModal();
              this.showToast('¡Bienvenido a ruma Plus! ✨👑', 'success');
              if (typeof onUpgradeConfirm === 'function') onUpgradeConfirm();
            } else if (!res.cancelled) {
              this.showToast(res.error || 'No se pudo completar la suscripción.', 'error');
            }
            return;
          }

          this.closeModal();
          if (allowSelfUpgrade) {
            if (typeof onUpgradeConfirm === 'function') onUpgradeConfirm();
          } else {
            this.showToast('Descarga la app Android en Google Play para suscribirte a ruma Plus 💜', 'info');
          }
        });
      }
    });
  },

  /**
   * Modal unificado de reporte UGC (obligatorio en Google Play para chat, perfiles y recuerdos).
   */
  openReportModal({ targetLabel = 'este contenido', onSubmit }) {
    this.openModal({
      title: '🚩 Reportar contenido o abuso',
      contentHtml: `
        <form id="ruma-ugc-report-form" style="display:flex;flex-direction:column;gap:0.85rem;">
          <p style="font-size:0.86rem;color:var(--text-secondary);margin:0;line-height:1.45;">
            Estás reportando <strong>${Utils.sanitize(targetLabel)}</strong>. Nuestro equipo revisará el reporte para mantener ruma seguro.
          </p>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="ugc-rep-reason">Motivo del reporte</label>
            <select id="ugc-rep-reason" class="form-input" required>
              <option value="inappropriate">Contenido inapropiado u ofensivo</option>
              <option value="harassment">Acoso o intimidación</option>
              <option value="spam">Spam o enlaces sospechosos</option>
              <option value="impersonation">Suplantación de identidad</option>
              <option value="illegal">Contenido ilegal o peligroso</option>
              <option value="other">Otro motivo</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="ugc-rep-details">Detalles adicionales (opcional)</label>
            <textarea id="ugc-rep-details" class="form-textarea" rows="3" maxlength="500" placeholder="Cuéntanos brevemente qué ocurrió..."></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
            <button type="button" class="btn btn-secondary" id="ugc-rep-cancel">Cancelar</button>
            <button type="submit" class="btn btn-danger" id="ugc-rep-send">Enviar reporte</button>
          </div>
        </form>
      `,
      onMount: () => {
        document.getElementById('ugc-rep-cancel')?.addEventListener('click', () => this.closeModal());
        document.getElementById('ruma-ugc-report-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('ugc-rep-send');
          const reason = document.getElementById('ugc-rep-reason')?.value || 'other';
          const details = document.getElementById('ugc-rep-details')?.value || '';
          if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
          try {
            const res = await onSubmit?.({ reason, details });
            this.closeModal();
            if (res?.ok) {
              this.showToast('Reporte enviado. Gracias por ayudarnos a cuidar la comunidad 🛡️', 'success');
            } else {
              this.showToast(res?.error || 'No se pudo enviar el reporte.', 'error');
            }
          } catch (_) {
            if (btn) { btn.disabled = false; btn.textContent = 'Enviar reporte'; }
            this.showToast('No se pudo enviar el reporte.', 'error');
          }
        });
      }
    });
  }
};
