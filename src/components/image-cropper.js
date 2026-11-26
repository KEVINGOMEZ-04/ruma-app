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
    onClose: revoke,
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.85rem;align-items:center;">
        <div style="font-size:.8rem;color:var(--text-secondary);text-align:center;">
          Arrastra para encuadrar · pellizca o desliza para hacer zoom
        </div>
        <div id="ruma-crop-box" style="position:relative;width:100%;max-width:300px;aspect-ratio:${aspectW}/${aspectH};overflow:hidden;border-radius:${borderRadius};border:2px solid var(--primary);background:var(--surface-secondary);touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;cursor:grab;">
          <img id="ruma-crop-img" src="${objUrl}" alt="" draggable="false" style="position:absolute;left:50%;top:50%;transform-origin:center;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;pointer-events:none;max-width:none;">
        </div>
        <div style="width:100%;max-width:300px;display:flex;align-items:center;gap:.65rem;">
          <span style="font-size:.78rem;color:var(--text-secondary);font-weight:600;">Zoom</span>
          <input type="range" id="ruma-crop-zoom" min="1" max="3" step="0.02" value="1" style="flex:1;accent-color:var(--primary-solid);">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.55rem;width:100%;">
          <button type="button" class="btn btn-secondary btn-sm" id="ruma-crop-cancel" style="width:100%;min-height:40px;">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="ruma-crop-save" style="width:100%;min-height:40px;" disabled>Guardar recorte</button>
        </div>
      </div>`,
    onMount: () => {
      const box = document.getElementById('ruma-crop-box');
      const img = document.getElementById('ruma-crop-img');
      const zoomInp = document.getElementById('ruma-crop-zoom');
      const saveBtn = document.getElementById('ruma-crop-save');
      let scale = 1, baseScale = 1, dx = 0, dy = 0, loaded = false;
      const pointers = new Map();
      let lastPinchDist = 0;

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
        UI.closeModal();
        UI.showToast('No se pudo cargar la imagen seleccionada.', 'error');
      };
      if (img.complete && img.naturalWidth) onReady();

      const pinchDist = () => {
        const pts = Array.from(pointers.values());
        if (pts.length < 2) return 0;
        return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      };

      box?.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        box.style.cursor = 'grabbing';
        box.setPointerCapture?.(e.pointerId);
        if (pointers.size === 2) lastPinchDist = pinchDist();
      });
      box?.addEventListener('pointermove', (e) => {
        const prev = pointers.get(e.pointerId);
        if (!prev) return;
        const nx = e.clientX, ny = e.clientY;
        if (pointers.size === 1) {
          dx += nx - prev.x;
          dy += ny - prev.y;
          pointers.set(e.pointerId, { x: nx, y: ny });
          apply();
        } else if (pointers.size >= 2) {
          pointers.set(e.pointerId, { x: nx, y: ny });
          const dist = pinchDist();
          if (lastPinchDist > 0 && dist > 0) {
            scale = Math.max(1, Math.min(3, scale * (dist / lastPinchDist)));
            if (zoomInp) zoomInp.value = String(scale.toFixed(2));
            apply();
          }
          lastPinchDist = dist;
        }
      });
      const stopDrag = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) lastPinchDist = 0;
        if (pointers.size === 0 && box) box.style.cursor = 'grab';
      };
      box?.addEventListener('pointerup', stopDrag);
      box?.addEventListener('pointercancel', stopDrag);

      zoomInp?.addEventListener('input', () => {
        scale = Number(zoomInp.value);
        apply();
      });

      const close = () => UI.closeModal();
      document.getElementById('ruma-crop-cancel')?.addEventListener('click', close);

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
  input.accept = 'image/*,.heic,.heif';
  input.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(input);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    input.remove();
  };

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    cleanup();
    if (!file) return;
    const isImageMime = file.type && file.type.startsWith('image/');
    const isImageExt = /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name || '');
    if (!isImageMime && !isImageExt) {
      UI.showToast('Selecciona un archivo de imagen válido.', 'error');
      return;
    }
    openImageCropperModal(file, options);
  });

  input.addEventListener('cancel', cleanup);
  window.addEventListener('focus', () => setTimeout(cleanup, 1500), { once: true });
  input.click();
}
