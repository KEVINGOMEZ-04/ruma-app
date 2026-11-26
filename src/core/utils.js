/**
 * ruma 🌟 — Utilidades de Formato, Seguridad, Portapapeles iOS, Compresión y Fechas
 */

const ESC_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export const Utils = {
  generateId(prefix = 'ruma') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },

  generateGroupCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  sanitize(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, ch => ESC_MAP[ch]);
  },

  safeUrl(url, fallback = '') {
    if (!url || typeof url !== 'string') return fallback;
    const trimmed = url.trim();
    if (/^(https?:\/\/|mailto:|data:image\/|data:audio\/|data:video\/|blob:|assets\/|\.\/|\/)/i.test(trimmed)) {
      return trimmed;
    }
    return fallback;
  },

  /**
   * Copia texto al portapapeles con respaldo compatible con iPhone / Safari iOS.
   */
  async copyText(text) {
    const val = String(text ?? '');
    if (!val) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(val);
        return true;
      }
    } catch (_) {
      // Fallback para Safari iOS cuando se llama tras un await o sin HTTPS
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = val;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;font-size:16px;opacity:0;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, val.length);
      const ok = document.execCommand('copy');
      ta.remove();
      return Boolean(ok);
    } catch (_) {
      return false;
    }
  },

  /**
   * Genera el formato exacto de fecha en español para la carpeta de Google Drive:
   * Ej: "Domingo 15 de noviembre de 2026"
   */
  formatFullSpanishDate(dateInput) {
    const raw = String(dateInput || '');
    const d = raw ? new Date(raw.includes('T') ? raw : `${raw}T12:00:00`) : new Date();
    if (isNaN(d.getTime())) return raw;
    const formatted = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1).replace(',', '');
  },

  /**
   * Construye el nombre oficial de la subcarpeta en Google Drive:
   * "[Nombre del Recuerdo] - [Día DD de mes de YYYY]"
   */
  buildDriveSubfolderName(memoryTitle, dateInput) {
    const cleanTitle = (memoryTitle || 'Recuerdo').trim();
    const fullDate = this.formatFullSpanishDate(dateInput);
    return `${cleanTitle} - ${fullDate}`;
  },

  formatShortDate(dateInput) {
    if (!dateInput) return '';
    const raw = String(dateInput);
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
    if (isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  },

  formatTime(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  },

  async fileToPreviewDataUrl(file, maxDimension = 900, quality = 0.72) {
    if (!file) return '';
    const looksLikeImage = Boolean(
      (file.type && file.type.startsWith('image/')) ||
      (!file.type && /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name || ''))
    );
    if (!looksLikeImage) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve) => {
      const objUrl = URL.createObjectURL(file);
      const img = new Image();
      const cleanup = () => URL.revokeObjectURL(objUrl);

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const out = canvas.toDataURL('image/jpeg', quality);
          cleanup();
          resolve(out);
        } catch (_) {
          cleanup();
          resolve('');
        }
      };

      img.onerror = () => {
        cleanup();
        resolve('');
      };
      img.src = objUrl;
    });
  },

  isDynamicImportError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('failed to fetch dynamically imported module') ||
      msg.includes('importing a module script failed') ||
      msg.includes('error loading dynamically imported module') ||
      msg.includes('unable to preload css')
    );
  },

  tryAutoReloadForStaleChunk(err) {
    if (typeof window === 'undefined' || !this.isDynamicImportError(err)) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    try {
      const guardKey = 'ruma_chunk_reload_ts';
      const last = Number(sessionStorage.getItem(guardKey) || 0);
      if (Date.now() - last < 20000) return false;
      sessionStorage.setItem(guardKey, String(Date.now()));
      const url = new URL(window.location.href);
      url.searchParams.set('_rv', Date.now().toString(36));
      window.location.replace(url.toString());
      return true;
    } catch (_) {
      return false;
    }
  },

  renderChunkLoadFallback(container, onRetry = null) {
    if (!container) return;
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    container.innerHTML = `
      <div class="ruma-view-loading" style="flex-direction:column;gap:0.75rem;padding:2rem 1rem;text-align:center;">
        <div style="font-size:0.9rem;color:var(--text-secondary);max-width:320px;">
          ${isOffline
            ? '📴 Sin conexión a internet. Verifica tu red para cargar esta sección.'
            : '✨ Hay una versión actualizada de Ruma o se interrumpió la carga de esta sección.'}
        </div>
        <div style="display:flex;gap:0.55rem;justify-content:center;flex-wrap:wrap;">
          ${onRetry ? `<button type="button" class="btn btn-secondary btn-sm" data-chunk-retry>Reintentar</button>` : ''}
          <button type="button" class="btn btn-primary btn-sm" data-chunk-reload>🔄 Actualizar app</button>
        </div>
      </div>
    `;
    container.querySelector('[data-chunk-retry]')?.addEventListener('click', () => {
      onRetry?.();
    });
    container.querySelector('[data-chunk-reload]')?.addEventListener('click', () => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('_rv', Date.now().toString(36));
        window.location.replace(url.toString());
      } catch (_) {
        window.location.reload();
      }
    });
  }
};
