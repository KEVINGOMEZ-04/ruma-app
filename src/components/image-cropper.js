/**
 * ruma — Recortador Interactivo de Imágenes (Arrastrar + Zoom)
 * Reutilizado para Avatar/Portada de Perfil y Foto/Portada de Grupo.
 */
import { UI } from './ui.js';

export function openImageCropperModal(file, {
  title = 'Ajustar imagen',
  aspectW = 1,
  aspectH = 1,
  round = false,
  radius = '',
  outW = 320,
  outH = 320,
  onCropped
}) {
  const objUrl = URL.createObjectURL(file);
  const borderRadius = radius || (round ? '50%' : '14px');
  let revoked = false;
  const revoke = () => {
    if (!revoked) {
      revoked = true;
      URL.revokeObjectURL(objUrl);
    }
  };

  UI.openModal({
    title,
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.85rem;align-items:center;">
        <div style="font-size:.8rem;color:var(--text-secondary);text-align:center;">
          Arrastra la imagen para encuadrar y usa el zoom
        </div>
        <div id="ruma-crop-box" style="position:relative;width:100%;max-width:320px;aspect-ratio:${aspectW}/${aspectH};overflow:hidden;border-radius:${borderRadius};border:2px solid var(--primary);background:var(--surface-secondary);touch-action:none;cursor:grab;">
          <img id="ruma-crop-img" src="${objUrl}" alt="" draggable="false" style="position:absolute;left:50%;top:50%;transform-origin:center;user-select:none;pointer-events:none;max-width:none;">
        </div>
        <div style="width:100%;max-width:320px;display:flex;align-items:center;gap:.65rem;">
          <span style="font-size:.78rem;color:var(--text-secondary);font-weight:600;">Zoom</span>
          <input type="range" id="ruma-crop-zoom" min="1" max="3" step="0.02" value="1" style="flex:1;accent-color:var(--primary-solid);">
        </div>
        <div style="display:flex;gap:.6rem;width:100%;justify-content:flex-end;">
          <button type="button" class="btn btn-secondary" id="ruma-crop-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="ruma-crop-save" disabled>Guardar recorte</button>
        </div>
      </div>`,
    onMount: () => {
      const box = document.getElementById('ruma-crop-box');
      const img = document.getElementById('ruma-crop-img');
      const zoomInp = document.getElementById('ruma-crop-zoom');
      const saveBtn = document.getElementById('ruma-crop-save');
      let scale = 1, baseScale = 1, dx = 0, dy = 0, loaded = false;
      let dragging = false, sx = 0, sy = 0;

      const apply = () => {
        if (!img || !box || !loaded) return;
        const s = baseScale * scale;
        const bw = box.clientWidth, bh = box.clientHeight;
        const iw = img.naturalWidth * s, ih = img.naturalHeight * s;
        const maxX = Math.max(0, (iw - bw) / 2);
        const maxY = Math.max(0, (ih - bh) / 2);
        dx = Math.max(-maxX, Math.min(maxX, dx));
        dy = Math.max(-maxY, Math.min(maxY, dy));
        img.style.width = `${img.naturalWidth}px`;
        img.style.height = `${img.naturalHeight}px`;
        img.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`;
      };

      const onReady = () => {
        if (!img.naturalWidth || !box) return;
        loaded = true;
        const bw = box.clientWidth || 260, bh = box.clientHeight || 260;
        baseScale = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
        if (saveBtn) saveBtn.disabled = false;
        apply();
      };

      img.onload = onReady;
      img.onerror = () => {
        revoke();
        UI.closeModal();
        UI.showToast('No se pudo cargar la imagen seleccionada.', 'error');
      };
      if (img.complete && img.naturalWidth) onReady();

      box?.addEventListener('pointerdown', (e) => {
        dragging = true;
        sx = e.clientX;
        sy = e.clientY;
        box.style.cursor = 'grabbing';
        box.setPointerCapture?.(e.pointerId);
      });
      box?.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        dx += e.clientX - sx;
        dy += e.clientY - sy;
        sx = e.clientX;
        sy = e.clientY;
        apply();
      });
      const stopDrag = () => {
        dragging = false;
        if (box) box.style.cursor = 'grab';
      };
      box?.addEventListener('pointerup', stopDrag);
      box?.addEventListener('pointercancel', stopDrag);

      zoomInp?.addEventListener('input', () => {
        scale = Number(zoomInp.value);
        apply();
      });

      const close = () => {
        revoke();
        UI.closeModal();
      };
      document.getElementById('ruma-crop-cancel')?.addEventListener('click', close);
      document.getElementById('ruma-modal-close-btn')?.addEventListener('click', revoke, { once: true });

      saveBtn?.addEventListener('click', () => {
        if (!loaded || !img.naturalWidth) return;
        const bw = box.clientWidth, bh = box.clientHeight;
        const s = baseScale * scale;
        const c = document.createElement('canvas');
        c.width = outW;
        c.height = outH;
        const ctx = c.getContext('2d');
        const ratioX = outW / bw, ratioY = outH / bh;
        const drawW = img.naturalWidth * s * ratioX;
        const drawH = img.naturalHeight * s * ratioY;
        const drawX = (outW - drawW) / 2 + dx * ratioX;
        const drawY = (outH - drawH) / 2 + dy * ratioY;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        const dataUrl = c.toDataURL('image/jpeg', 0.82);
        close();
        onCropped?.(dataUrl);
      });
    }
  });
}

export function pickAndCropImage(options) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      UI.showToast('Selecciona un archivo de imagen válido.', 'error');
      return;
    }
    openImageCropperModal(file, options);
  };
  input.click();
}
