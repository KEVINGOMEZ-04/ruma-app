/**
 * ruma 🌟 — Modales de Recuerdos y Planes del Grupo
 */
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { MusicService } from '../services/music-service.js';
import { MediaStorage } from '../services/media-storage.js';
import { GoogleAuth } from '../services/google-auth.js';
import { DriveBridge } from '../services/drive-bridge.js';
import { NativeDriveUploader } from '../services/native-drive-uploader.js';
import { UI } from '../components/ui.js';

export function openAddPlanModal(dateStr, onSaved) {
  const nowLocal = new Date();
  const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
  const safeInitialDate = (!dateStr || dateStr < localToday) ? localToday : dateStr;

  UI.openModal({
    title: '🗓️ Agendar Plan o Cita a Futuro',
    contentHtml: `
      <form id="form-add-plan">
        <div class="form-group">
          <label class="form-label">Título del Plan</label>
          <input type="text" id="plan-title" class="form-input" placeholder="Ej: Noche de cine, Viaje, Aniversario..." required>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
          <div class="form-group">
            <label class="form-label">Fecha (hoy o a futuro)</label>
            <input type="date" id="plan-date" class="form-input" value="${Utils.sanitize(safeInitialDate)}" min="${Utils.sanitize(localToday)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Hora</label>
            <input type="time" id="plan-time" class="form-input" value="19:30">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notas / Detalles</label>
          <textarea id="plan-note" class="form-textarea" rows="2" placeholder="¿Qué tenemos que preparar?"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.65rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-plan">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Plan 🗓️</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('btn-cancel-plan')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-add-plan')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const chosenDate = document.getElementById('plan-date')?.value || '';
        if (chosenDate < localToday) {
          UI.showToast('Los planes solo se pueden agendar para el día de hoy o fechas futuras 🗓️', 'error');
          return;
        }
        const plan = store.addPlanToActiveGroup({
          title: document.getElementById('plan-title')?.value,
          date: chosenDate,
          time: document.getElementById('plan-time')?.value,
          note: document.getElementById('plan-note')?.value
        });
        if (!plan) {
          UI.showToast('No se pudo agendar el plan. Verifica que la fecha sea hoy o a futuro.', 'error');
          return;
        }
        UI.closeModal();
        UI.showToast('¡Plan agendado en el calendario del grupo! 🗓️✨', 'success');
        if (typeof onSaved === 'function') onSaved();
      });
    }
  });
}

export function openUploadMemoryModal(group, editingMemory = null, prefillDate = null, isCreatorParam = undefined) {
  const user = store.getCurrentUser();
  const isCreator = isCreatorParam !== undefined
    ? Boolean(isCreatorParam && Entitlements.isGroupCreator(group, user?.id))
    : Entitlements.isGroupCreator(group, user?.id);
  const limits = Entitlements.getGroupLimits(group);
  const maxLinkedFiles = limits.maxFilesPerMemoryUpload || 30;
  const nowLocal = new Date();
  const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
  const rawDate = prefillDate || editingMemory?.date || localToday;
  const today = rawDate > localToday ? localToday : rawDate;
  const sampleFolder = Utils.buildDriveSubfolderName(editingMemory?.title || 'Mi Recuerdo', today);
  const googleSession = isCreator ? GoogleAuth.getSession() : null;
  let hasDriveAccess = isCreator && GoogleAuth.hasDriveAccess();
  const effectiveFolderUrl = group?.driveFolderUrl || user?.googleDriveFolderUrl || '';
  const hasRealFolder = DriveBridge.isRealFolderConfigured(effectiveFolderUrl);
  let selectedSong = editingMemory?.song || null;
  let recordedVoiceDataUrl = editingMemory?.voiceNote || null;
  let selectedCoverFile = null;
  let coverPreviewObjectUrl = '';
  let selectedLinkedFiles = [];
  let linkedPreviewObjectUrls = [];
  let mediaRecorder = null;
  let activeVoiceStream = null;
  let audioChunks = [];
  let isRecording = false;

  const revokePreviewUrls = () => {
    if (coverPreviewObjectUrl) {
      try { URL.revokeObjectURL(coverPreviewObjectUrl); } catch (_) {}
      coverPreviewObjectUrl = '';
    }
    linkedPreviewObjectUrls.forEach(u => {
      try { URL.revokeObjectURL(u); } catch (_) {}
    });
    linkedPreviewObjectUrls = [];
  };

  const stopVoiceCapture = () => {
    isRecording = false;
    try { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (_) {}
    try { activeVoiceStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    activeVoiceStream = null;
    revokePreviewUrls();
  };

  const formatBytes = (bytes = 0) => {
    const n = Number(bytes) || 0;
    if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  };

  const auraColors = [
    { hex: '#A855F7', label: 'Violeta' },
    { hex: '#EC4899', label: 'Rosa' },
    { hex: '#F59E0B', label: 'Dorado' },
    { hex: '#22D3EE', label: 'Celeste' },
    { hex: '#10B981', label: 'Esmeralda' }
  ];
  let selectedAura = editingMemory?.auraColor || '#A855F7';

  const renderSelectedSongBoxHtml = (song) => {
    if (!song || !song.title) return '';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.5rem 0.65rem;border-radius:var(--radius-sm);background:var(--bg-elevated);border:1px solid var(--border-strong);margin-top:0.45rem;">
        <div style="display:flex;align-items:center;gap:0.55rem;min-width:0;flex:1;">
          <img src="${Utils.sanitize(Utils.safeUrl(song.artwork, 'assets/ruma_icon_512.png'))}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;">
          <div style="min-width:0;">
            <div style="font-size:0.82rem;font-weight:800;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🎵 ${Utils.sanitize(song.title)}</div>
            <div style="font-size:0.74rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(song.artist || '')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.35rem;flex-shrink:0;">
          ${song.previewUrl ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-mem-preview-selected-song" title="Escuchar canción">▶</button>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-clear-selected-song" title="Quitar canción">✕</button>
        </div>
      </div>
    `;
  };

  UI.openModal({
    title: editingMemory ? '✏️ Editar Recuerdo' : '📸 Inmortalizar Recuerdo en Google Drive',
    size: 'lg',
    contentHtml: `
      <form id="form-upload-memory" style="max-width:100%;overflow-x:hidden;">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;">
          <div class="form-group" style="min-width:0;">
            <label class="form-label">Nombre del Recuerdo</label>
            <input type="text" id="mem-title" class="form-input" placeholder="Ej: Paseo de Domingo" value="${Utils.sanitize(editingMemory?.title || '')}" required>
          </div>
          <div class="form-group" style="min-width:0;">
            <label class="form-label">Ubicación / Lugar (Opcional)</label>
            <input type="text" id="mem-location" class="form-input" placeholder="Ej: Mirador, Playa, Casa..." value="${Utils.sanitize(editingMemory?.location || '')}">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;">
          <div class="form-group" style="min-width:0;">
            <label class="form-label">Fecha del Recuerdo (hoy o días pasados)</label>
            <input type="date" id="mem-date" class="form-input" value="${Utils.sanitize(today)}" max="${Utils.sanitize(localToday)}" required>
          </div>
          <div class="form-group" style="min-width:0;">
            <label class="form-label">Estado & Aura Luminosa</label>
            <div style="display:flex;align-items:center;gap:0.5rem;padding-top:0.35rem;flex-wrap:wrap;">
              ${auraColors.map(c => `
                <button type="button" class="aura-pick-btn" data-aura="${c.hex}" title="${c.label}" style="width:26px;height:26px;border-radius:50%;background:${c.hex};border:${selectedAura === c.hex ? '3px solid #fff' : '1px solid transparent'};cursor:pointer;"></button>
              `).join('')}
              <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.82rem;margin-left:0.35rem;cursor:pointer;">
                <input type="checkbox" id="mem-featured" ${editingMemory?.isFeatured ? 'checked' : ''}> ⭐ Destacado
              </label>
            </div>
          </div>
        </div>

        <div style="background:var(--bg-elevated);padding:0.8rem 0.95rem;border-radius:var(--radius-sm);margin-bottom:0.85rem;font-size:0.8rem;border:1px solid ${hasDriveAccess ? 'rgba(16,185,129,0.4)' : 'var(--border-subtle)'};display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;" id="mem-drive-status-box">
          <div style="min-width:0;flex:1;">
            <div style="color:var(--brand-lilac-soft);">
              📁 Subcarpeta dentro de <strong>Ruma 🌷</strong>:
            </div>
            <strong id="mem-folder-preview" style="color:var(--text-primary);display:block;word-break:break-word;">${Utils.sanitize(sampleFolder)}</strong>
            <div id="mem-drive-status-line" style="font-size:0.74rem;color:${hasDriveAccess ? '#34D399' : '#FBBF24'};margin-top:0.2rem;">
              ${hasDriveAccess
                ? `🟢 Google Drive sincronizado (${Utils.sanitize(googleSession?.email || googleSession?.name || 'Drive')}) · Subirá a tu carpeta Ruma 🌷`
                : (isCreator
                    ? '⚠️ Tu sesión de Google Drive expiró o no está activa. Al pulsar Guardar se conectará con Google o puedes ir a ⚙️ Ajustes.'
                    : (hasRealFolder
                        ? '👑 Carpeta Ruma 🌷 activa del creador del grupo. Tu recuerdo quedará guardado en el grupo.'
                        : '👑 Solo el creador del grupo activa la carpeta Ruma 🌷 desde sus Ajustes.'))}
            </div>
          </div>
          ${isCreator && !hasDriveAccess ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-modal-config-drive">
              ⚙️ Ajustes
            </button>
          ` : ''}
        </div>

        <!-- Capacidad y límites de carga -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.4rem;padding:0.6rem 0.85rem;border-radius:var(--radius-sm);background:rgba(168,85,247,0.1);border:1px solid var(--border-subtle);margin-bottom:0.85rem;font-size:0.76rem;">
          <span>📦 <strong>Capacidad de carga:</strong> 1 Portada + hasta <strong>${maxLinkedFiles} fotos/videos enlazados</strong></span>
          <span style="color:var(--brand-lilac-soft);font-weight:700;" id="mem-upload-limit-counter">0 / ${maxLinkedFiles} enlazados · Sin límite de MB/GB en Drive</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.85rem;margin-bottom:0.85rem;">
          <!-- Opción 1: Portada del Recuerdo + Previsualización -->
          <div class="form-group" style="margin:0;min-width:0;padding:0.75rem;border-radius:var(--radius-sm);background:var(--bg-elevated);border:1px solid var(--border-subtle);">
            <label class="form-label" style="margin-bottom:0.45rem;">🖼️ 1. Portada del Recuerdo</label>
            <input type="file" id="mem-cover-file" accept="image/*,.heic,.heif" style="display:none;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-trigger-cover-file" style="width:100%;justify-content:center;">
              📷 Elegir imagen de portada
            </button>
            <small id="mem-cover-file-hint" style="display:block;font-size:0.74rem;color:var(--text-muted);margin-top:0.35rem;line-height:1.35;">
              ${editingMemory?.coverPreview ? '✅ Portada actual guardada (elige otra si deseas cambiarla)' : 'Imagen principal que representará este recuerdo.'}
            </small>
            <div id="mem-cover-preview-box" style="margin-top:0.55rem;${editingMemory?.coverPreview ? '' : 'display:none;'}">
              ${editingMemory?.coverPreview ? `
                <div style="position:relative;width:100%;height:125px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border-strong);background:#090414;">
                  <img src="${Utils.sanitize(Utils.safeUrl(editingMemory.coverPreview, 'assets/ruma_icon_512.png'))}" alt="Portada" style="width:100%;height:100%;object-fit:cover;">
                  <span class="badge badge-premium" style="position:absolute;bottom:6px;left:6px;font-size:0.68rem;">🖼️ Portada actual</span>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Opción 2: Fotos y Videos enlazados + Previsualización -->
          <div class="form-group" style="margin:0;min-width:0;padding:0.75rem;border-radius:var(--radius-sm);background:var(--bg-elevated);border:1px solid var(--border-subtle);">
            <label class="form-label" style="margin-bottom:0.45rem;">📸 2. Fotos y Videos enlazados</label>
            <input type="file" id="mem-files" accept="image/*,video/*,.heic,.heif,.mov,.m4v,.mp4" multiple style="display:none;">
            ${NativeDriveUploader.isAvailable() ? `
              <div style="display:flex;flex-direction:column;gap:0.45rem;">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-android-picker" style="width:100%;justify-content:center;">
                  🖼️ Elegir fotos o videos (Subida en 2.º plano sin cortes)
                </button>
                <div id="mem-android-picked-summary" style="font-size:0.78rem;color:var(--text-secondary);"></div>
              </div>
            ` : `
              <button type="button" class="btn btn-secondary btn-sm" id="btn-trigger-linked-files" style="width:100%;justify-content:center;">
                ➕ Agregar fotos o videos al álbum
              </button>
            `}
            <small id="mem-linked-files-hint" style="display:block;font-size:0.74rem;color:var(--text-muted);margin-top:0.35rem;line-height:1.35;">
              Puedes elegir varios archivos a la vez o ir agregando más (máx. ${maxLinkedFiles}).
            </small>
            <div id="mem-linked-preview-grid" style="display:none;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:0.45rem;margin-top:0.55rem;max-height:175px;overflow-y:auto;padding:0.35rem;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);"></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Historia / Descripción del Momento</label>
          <textarea id="mem-desc" class="form-textarea" rows="3" placeholder="¿Qué hizo especial este momento?">${Utils.sanitize(editingMemory?.description || '')}</textarea>
        </div>

        <!-- Selector de Banda Sonora (Acoplado de LUMA) -->
        <div class="form-group">
          <label class="form-label">🎵 Banda Sonora del Recuerdo (Opcional)</label>
          <div style="display:flex;gap:0.45rem;align-items:center;">
            <input type="search" id="mem-song-query" class="form-input" style="flex:1;min-width:0;" placeholder="Buscar canción o artista en iTunes..." enterkeyhint="search" autocomplete="off">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-search-song" style="flex-shrink:0;">Buscar</button>
          </div>
          <div id="mem-song-selected">
            ${renderSelectedSongBoxHtml(selectedSong)}
          </div>
          <div id="mem-song-results" style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.45rem;max-height:180px;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>
        </div>

        <!-- Grabadora de Nota de Voz (Acoplada de LUMA) -->
        <div class="form-group">
          <label class="form-label">🎙️ Nota de Voz del Momento (Opcional)</label>
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-record-voice">
              🎙️ Grabar Nota de Voz
            </button>
            <span id="mem-voice-status" style="font-size:0.8rem;color:var(--text-secondary);">
              ${recordedVoiceDataUrl ? '✅ Nota de voz adjunta' : 'Sin nota de voz'}
            </span>
          </div>
        </div>

        <!-- Barra de progreso de subida a Google Drive / IndexedDB -->
        <div id="mem-upload-progress-wrap" style="display:none;margin-top:0.85rem;padding:0.75rem 0.9rem;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:0.35rem;">
            <span id="mem-upload-progress-text">Preparando archivos...</span>
            <strong id="mem-upload-progress-pct" style="color:var(--brand-lilac);">0%</strong>
          </div>
          <div class="ruma-progress-track">
            <div class="ruma-progress-fill" id="mem-upload-progress-bar" style="width:0%;"></div>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:0.55rem;flex-wrap:wrap;margin-top:1.15rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-mem" style="flex:1 1 110px;justify-content:center;">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-mem" style="flex:2 1 200px;justify-content:center;">${editingMemory ? 'Guardar Cambios' : (isCreator ? '☁️ Subir a Google Drive y Guardar' : '💾 Guardar Recuerdo')}</button>
        </div>
      </form>
    `,
    onClose: stopVoiceCapture,
    onMount: (modalEl) => {
      const titleInp = document.getElementById('mem-title');
      const dateInp = document.getElementById('mem-date');
      const previewEl = document.getElementById('mem-folder-preview');

      document.getElementById('btn-mem-modal-config-drive')?.addEventListener('click', () => {
        UI.closeModal();
        store.navigate('settings');
      });

      const updateFolderPreview = () => {
        if (previewEl) {
          previewEl.textContent = Utils.buildDriveSubfolderName(titleInp?.value || 'Mi Recuerdo', dateInp?.value || today);
        }
      };
      titleInp?.addEventListener('input', updateFolderPreview);
      dateInp?.addEventListener('change', updateFolderPreview);

      modalEl.querySelectorAll('.aura-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedAura = btn.getAttribute('data-aura');
          modalEl.querySelectorAll('.aura-pick-btn').forEach(b => {
            b.style.border = b === btn ? '3px solid #fff' : '1px solid transparent';
          });
        });
      });

      // Buscar canción para el recuerdo
      const memSongInput = document.getElementById('mem-song-query');
      const bindSelectedSongActions = () => {
        document.getElementById('btn-mem-preview-selected-song')?.addEventListener('click', () => {
          if (selectedSong?.previewUrl) MusicService.toggleTrack(selectedSong);
        });
        document.getElementById('btn-mem-clear-selected-song')?.addEventListener('click', () => {
          selectedSong = null;
          const selEl = document.getElementById('mem-song-selected');
          if (selEl) selEl.innerHTML = '';
        });
      };
      bindSelectedSongActions();

      const runMemSongSearch = async () => {
        const q = memSongInput?.value.trim();
        const resBox = document.getElementById('mem-song-results');
        if (!q || !resBox) return;
        memSongInput?.blur();
        resBox.innerHTML = `<div style="font-size:0.78rem;color:var(--brand-lilac);">Buscando canciones...</div>`;
        const tracks = await MusicService.searchSongs(q, 5);
        if (!tracks.length) {
          resBox.innerHTML = `<div style="font-size:0.78rem;color:var(--text-muted);padding:0.35rem 0;">Sin coincidencias para esa búsqueda.</div>`;
          return;
        }
        resBox.innerHTML = tracks.map((t, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.45rem 0.6rem;background:var(--bg-elevated);border-radius:var(--radius-xs);">
            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
              <img src="${Utils.sanitize(t.artwork)}" alt="art" style="width:32px;height:32px;border-radius:4px;flex-shrink:0;">
              <span style="font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>${Utils.sanitize(t.title)}</strong> · ${Utils.sanitize(t.artist)}</span>
            </div>
            <div style="display:flex;gap:0.3rem;flex-shrink:0;">
              ${t.previewUrl ? `<button type="button" class="btn btn-secondary btn-sm" data-preview-mem-track="${idx}" title="Escuchar 30s">▶</button>` : ''}
              <button type="button" class="btn btn-primary btn-sm" data-pick-mem-track="${idx}">Elegir</button>
            </div>
          </div>
        `).join('');

        resBox.querySelectorAll('[data-preview-mem-track]').forEach(b => {
          b.addEventListener('click', () => {
            const tr = tracks[Number(b.getAttribute('data-preview-mem-track'))];
            if (tr?.previewUrl) MusicService.toggleTrack(tr);
          });
        });

        resBox.querySelectorAll('[data-pick-mem-track]').forEach(b => {
          b.addEventListener('click', () => {
            selectedSong = tracks[Number(b.getAttribute('data-pick-mem-track'))];
            const selEl = document.getElementById('mem-song-selected');
            if (selEl) {
              selEl.innerHTML = renderSelectedSongBoxHtml(selectedSong);
              bindSelectedSongActions();
            }
            resBox.innerHTML = '';
          });
        });
      };

      document.getElementById('btn-mem-search-song')?.addEventListener('click', runMemSongSearch);
      memSongInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runMemSongSearch();
        }
      });

      // Grabadora de voz real con MediaRecorder (compatible con iPhone/iOS Safari)
      const recordBtn = document.getElementById('btn-mem-record-voice');
      const voiceStatus = document.getElementById('mem-voice-status');
      recordBtn?.addEventListener('click', async () => {
        if (!isRecording) {
          try {
            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
              UI.showToast('Tu navegador no soporta grabación de audio.', 'error');
              return;
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            activeVoiceStream = stream;
            const preferredMime = (typeof MediaRecorder.isTypeSupported === 'function')
              ? ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
                .find(t => MediaRecorder.isTypeSupported(t)) || ''
              : '';
            mediaRecorder = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) audioChunks.push(e.data); };
            mediaRecorder.onstop = () => {
              const outMime = mediaRecorder?.mimeType || preferredMime || 'audio/mp4';
              const blob = new Blob(audioChunks, { type: outMime });
              if (blob.size > 0) {
                const reader = new FileReader();
                reader.onloadend = () => {
                  recordedVoiceDataUrl = reader.result;
                  if (voiceStatus) voiceStatus.textContent = '✅ Nota de voz grabada con éxito';
                };
                reader.readAsDataURL(blob);
              }
              stream.getTracks().forEach(t => t.stop());
              if (activeVoiceStream === stream) activeVoiceStream = null;
            };
            mediaRecorder.start();
            isRecording = true;
            recordBtn.textContent = '⏹ Detener Grabación';
            if (voiceStatus) voiceStatus.textContent = '🔴 Grabando audio...';
          } catch (_) {
            UI.showToast('No se pudo acceder al micrófono en este navegador.', 'error');
          }
        } else {
          isRecording = false;
          recordBtn.textContent = '🎙️ Grabar de nuevo';
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        }
      });

      let pickedNativeFiles = [];
      document.getElementById('btn-mem-android-picker')?.addEventListener('click', async () => {
        try {
          const limits = Entitlements.getGroupLimits(group);
          const maxItems = Number.isFinite(limits.maxFilesPerMemoryUpload) ? limits.maxFilesPerMemoryUpload : 20;
          const items = await NativeDriveUploader.pickMedia({ maxItems });
          pickedNativeFiles = items.map(item => ({
            nativeUri: item.uri,
            name: item.name,
            mimeType: item.mimeType,
            type: item.mimeType,
            size: item.size,
            thumbnailDataUrl: item.thumbnailDataUrl || ''
          }));
          const summary = document.getElementById('mem-android-picked-summary');
          if (summary) {
            summary.textContent = pickedNativeFiles.length > 0
              ? `✅ ${pickedNativeFiles.length} archivo(s) listos para subida en 2.º plano`
              : '';
          }
        } catch (err) {
          if (err?.message && !/cancel/i.test(err.message)) {
            UI.showToast(err.message, 'error');
          }
        }
      });

      const coverFileInp = document.getElementById('mem-cover-file');
      const linkedFilesInp = document.getElementById('mem-files');
      const coverHintEl = document.getElementById('mem-cover-file-hint');
      const linkedHintEl = document.getElementById('mem-linked-files-hint');
      const coverPreviewBox = document.getElementById('mem-cover-preview-box');
      const linkedPreviewGrid = document.getElementById('mem-linked-preview-grid');
      const limitCounterEl = document.getElementById('mem-upload-limit-counter');

      document.getElementById('btn-trigger-cover-file')?.addEventListener('click', () => {
        coverFileInp?.click();
      });
      document.getElementById('btn-trigger-linked-files')?.addEventListener('click', () => {
        linkedFilesInp?.click();
      });

      const updateLimitCounter = () => {
        if (!limitCounterEl) return;
        const totalLinkedBytes = selectedLinkedFiles.reduce((acc, f) => acc + (f.size || 0), 0) + (selectedCoverFile?.size || 0);
        limitCounterEl.textContent = `${selectedLinkedFiles.length} / ${maxLinkedFiles} enlazados · ${formatBytes(totalLinkedBytes)} totales`;
      };

      const getCleanMemTitle = () =>
        String(titleInp?.value || editingMemory?.title || 'Recuerdo')
          .replace(/[\\/:*?"<>|]/g, '')
          .trim() || 'Recuerdo';

      const renderCoverPreview = () => {
        if (!coverPreviewBox) return;
        if (coverPreviewObjectUrl) {
          try { URL.revokeObjectURL(coverPreviewObjectUrl); } catch (_) {}
          coverPreviewObjectUrl = '';
        }
        if (!selectedCoverFile) {
          if (editingMemory?.coverPreview) {
            coverPreviewBox.style.display = 'block';
            coverPreviewBox.innerHTML = `
              <div style="position:relative;width:100%;height:125px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border-strong);background:#090414;">
                <img src="${Utils.sanitize(Utils.safeUrl(editingMemory.coverPreview, 'assets/ruma_icon_512.png'))}" alt="Portada" style="width:100%;height:100%;object-fit:cover;">
                <span class="badge badge-premium" style="position:absolute;bottom:6px;left:6px;font-size:0.68rem;">🖼️ Portada</span>
              </div>`;
          } else {
            coverPreviewBox.style.display = 'none';
            coverPreviewBox.innerHTML = '';
          }
          return;
        }
        coverPreviewObjectUrl = URL.createObjectURL(selectedCoverFile);
        coverPreviewBox.style.display = 'block';
        coverPreviewBox.innerHTML = `
          <div style="position:relative;width:100%;height:125px;border-radius:var(--radius-sm);overflow:hidden;border:2px solid var(--brand-lilac);background:#090414;">
            <img src="${Utils.sanitize(coverPreviewObjectUrl)}" alt="Portada" style="width:100%;height:100%;object-fit:cover;">
            <span class="badge badge-premium" style="position:absolute;bottom:6px;left:6px;font-size:0.68rem;">🖼️ Portada · ${Utils.sanitize(formatBytes(selectedCoverFile.size))}</span>
            <button type="button" id="btn-remove-cover-preview" aria-label="Quitar portada" style="position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(0,0,0,0.72);color:#fff;font-size:0.78rem;cursor:pointer;">✕</button>
          </div>
        `;
        document.getElementById('btn-remove-cover-preview')?.addEventListener('click', () => {
          selectedCoverFile = null;
          if (coverFileInp) coverFileInp.value = '';
          if (coverHintEl) {
            coverHintEl.style.color = 'var(--text-muted)';
            coverHintEl.textContent = 'Imagen principal que representará este recuerdo.';
          }
          renderCoverPreview();
          updateLimitCounter();
        });
      };

      const renderLinkedPreviews = () => {
        if (!linkedPreviewGrid) return;
        linkedPreviewObjectUrls.forEach(u => {
          try { URL.revokeObjectURL(u); } catch (_) {}
        });
        linkedPreviewObjectUrls = [];

        if (selectedLinkedFiles.length === 0) {
          linkedPreviewGrid.style.display = 'none';
          linkedPreviewGrid.innerHTML = '';
          if (linkedHintEl) {
            linkedHintEl.style.color = 'var(--text-muted)';
            linkedHintEl.textContent = `Puedes elegir varios archivos a la vez o ir agregando más (máx. ${maxLinkedFiles}).`;
          }
          updateLimitCounter();
          return;
        }

        const baseTitle = getCleanMemTitle();
        if (linkedHintEl) {
          linkedHintEl.style.color = '#34D399';
          linkedHintEl.textContent = `✅ Se guardarán como "${baseTitle} 1" hasta "${baseTitle} ${selectedLinkedFiles.length}"`;
        }

        linkedPreviewGrid.style.display = 'grid';
        linkedPreviewGrid.innerHTML = selectedLinkedFiles.map((file, idx) => {
          const objUrl = URL.createObjectURL(file);
          linkedPreviewObjectUrls.push(objUrl);
          const isVid = Boolean((file.type && file.type.startsWith('video/')) || /\.(mp4|mov|m4v|webm)$/i.test(file.name || ''));
          const displayLabel = `${baseTitle} ${idx + 1}`;
          return `
            <div style="position:relative;height:78px;border-radius:var(--radius-xs);overflow:hidden;border:1px solid var(--border-subtle);background:#090414;" title="${Utils.sanitize(displayLabel)} (${Utils.sanitize(formatBytes(file.size))})">
              ${isVid
                ? `<video src="${Utils.sanitize(objUrl)}#t=0.001" muted playsinline webkit-playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`
                : `<img src="${Utils.sanitize(objUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;">`
              }
              <span class="badge ${isVid ? 'badge-admin' : 'badge-free'}" data-linked-preview-lbl="${idx}" style="position:absolute;bottom:3px;left:3px;right:3px;font-size:0.6rem;padding:1px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;">
                ${isVid ? '🎬 ' : ''}${Utils.sanitize(displayLabel)}
              </span>
              <button type="button" data-remove-linked-idx="${idx}" aria-label="Quitar archivo" style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,0.75);color:#fff;font-size:0.7rem;cursor:pointer;line-height:1;">✕</button>
            </div>
          `;
        }).join('');

        linkedPreviewGrid.querySelectorAll('[data-remove-linked-idx]').forEach(btn => {
          btn.addEventListener('click', () => {
            const rmIdx = Number(btn.getAttribute('data-remove-linked-idx'));
            if (Number.isInteger(rmIdx) && rmIdx >= 0 && rmIdx < selectedLinkedFiles.length) {
              selectedLinkedFiles.splice(rmIdx, 1);
              if (linkedFilesInp) linkedFilesInp.value = '';
              renderLinkedPreviews();
            }
          });
        });

        updateLimitCounter();
      };

      titleInp?.addEventListener('input', () => {
        if (selectedLinkedFiles.length === 0) return;
        const baseTitle = getCleanMemTitle();
        if (linkedHintEl) {
          linkedHintEl.textContent = `✅ Se guardarán como "${baseTitle} 1" hasta "${baseTitle} ${selectedLinkedFiles.length}"`;
        }
        linkedPreviewGrid?.querySelectorAll('[data-linked-preview-lbl]').forEach(el => {
          const i = Number(el.getAttribute('data-linked-preview-lbl'));
          const f = selectedLinkedFiles[i];
          const isVid = Boolean(f && ((f.type && f.type.startsWith('video/')) || /\.(mp4|mov|m4v|webm)$/i.test(f.name || '')));
          el.textContent = `${isVid ? '🎬 ' : ''}${baseTitle} ${i + 1}`;
        });
      });

      coverFileInp?.addEventListener('change', () => {
        const f = coverFileInp.files?.[0] || null;
        selectedCoverFile = f;
        if (coverHintEl) {
          coverHintEl.style.color = f ? '#34D399' : 'var(--text-muted)';
          coverHintEl.textContent = f
            ? `✅ Se guardará como: Portada (${formatBytes(f.size)})`
            : 'Imagen principal que representará este recuerdo.';
        }
        renderCoverPreview();
        updateLimitCounter();
      });

      linkedFilesInp?.addEventListener('change', () => {
        const incoming = Array.from(linkedFilesInp.files || []);
        if (!incoming.length) return;
        const combined = [...selectedLinkedFiles];
        incoming.forEach(f => {
          const dup = combined.some(x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified);
          if (!dup) combined.push(f);
        });
        if (combined.length > maxLinkedFiles) {
          UI.showToast(`Se alcanzó el límite de ${maxLinkedFiles} archivos enlazados por carga.`, 'info');
        }
        selectedLinkedFiles = combined.slice(0, maxLinkedFiles);
        renderLinkedPreviews();
      });

      document.getElementById('btn-cancel-mem')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-upload-memory')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const chosenMemDate = dateInp?.value || today;
        if (chosenMemDate > localToday) {
          UI.showToast('Los recuerdos solo se pueden registrar para el día de hoy o fechas pasadas 📅', 'error');
          return;
        }
        const coverFile = selectedCoverFile || document.getElementById('mem-cover-file')?.files?.[0] || null;
        const files = pickedNativeFiles.length > 0
          ? pickedNativeFiles
          : (selectedLinkedFiles.length > 0
              ? [...selectedLinkedFiles]
              : Array.from(document.getElementById('mem-files')?.files || []));
        const submitBtn = document.getElementById('btn-submit-mem');
        const progWrap = document.getElementById('mem-upload-progress-wrap');
        const progText = document.getElementById('mem-upload-progress-text');
        const progPct = document.getElementById('mem-upload-progress-pct');
        const progBar = document.getElementById('mem-upload-progress-bar');

        const runUploadFlow = async () => {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Guardando y enviando a la nube...';
          }
          if (progWrap) progWrap.style.display = 'block';

          const res = await store.addMemoryToActiveGroup({
            id: editingMemory?.id,
            title: titleInp?.value || 'Recuerdo',
            date: dateInp?.value || today,
            location: document.getElementById('mem-location')?.value || '',
            description: document.getElementById('mem-desc')?.value || '',
            auraColor: selectedAura,
            isFeatured: document.getElementById('mem-featured')?.checked,
            song: selectedSong,
            voiceNote: recordedVoiceDataUrl,
            coverFile,
            files,
            existingPhotos: editingMemory?.photos || (editingMemory?.coverPreview ? [editingMemory.coverPreview] : []),
            backgroundDrive: true,
            onProgress: (p) => {
              if (!progWrap) return;
              const pct = Math.min(100, Math.max(5, Number(p.percent) || 15));
              if (progBar) progBar.style.width = `${pct}%`;
              if (progPct) progPct.textContent = `${pct}%`;
              if (progText) {
                const fname = p.fileName || '';
                if (p.stage === 'drive_folder') {
                  progText.textContent = `📁 Creando carpeta en Drive: ${fname}`;
                } else if (p.stage === 'drive_upload') {
                  progText.textContent = `☁️ Subiendo a Drive (${p.fileIndex}/${p.totalFiles}): ${fname}`;
                } else {
                  progText.textContent = `💾 Preparando archivos (${p.fileIndex}/${p.totalFiles}): ${fname}`;
                }
              }
            }
          });

          if (!res.ok) {
            UI.closeModal();
            if (res.needsUpgrade) {
              UI.showUpgradeModal(res.error, () => store.upgradeGroupToPremium(group.id));
            } else {
              UI.showToast(res.error, 'error');
            }
            return;
          }

          UI.closeModal();
          if (res.driveSyncStatus === 'uploading') {
            UI.showToast(`☁️ Subiendo "${res.memory.title}" en segundo plano · Puedes seguir navegando`, 'info');
          } else if (res.driveSyncStatus === 'paused') {
            UI.showToast('⏸ Carga en pausa · Se reanudará sola en cuanto vuelva internet', 'info');
          } else if (res.driveSyncStatus === 'synced') {
            UI.showToast(`☁️ ¡Recuerdo "${res.memory.subfolderName}" subido a tu carpeta Ruma 🌷 en Google Drive!`, 'success');
          } else if (res.driveSyncStatus === 'error') {
            UI.showToast(`Guardado en dispositivo. No se subió a Drive: ${res.driveSyncError}`, 'error');
          } else {
            UI.showToast(
              isCreator
                ? '💾 Recuerdo guardado en el dispositivo. Pulsa "☁️ Subir a Drive" tras conectar tu cuenta de Google.'
                : '💾 Recuerdo guardado en el grupo ✨',
              'success'
            );
          }
        };

        // Si es el creador del grupo y aún no tiene un token OAuth activo de `drive.file`,
        // pedirlo síncronamente en el mismo clic del botón Guardar antes de cualquier `await`
        if (isCreator && !GoogleAuth.hasDriveAccess() && GoogleAuth.hasValidClientId(group)) {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Autorizando Google Drive...';
          }
          GoogleAuth.requestDriveAccess('', group)
            .then((session) => {
              hasDriveAccess = true;
              store.updateCurrentUser({
                googleDriveSynced: true,
                googleEmail: session.email || user?.email || ''
              });
              return runUploadFlow();
            })
            .catch((err) => {
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = editingMemory ? 'Guardar Cambios' : '☁️ Subir a Google Drive y Guardar';
              }
              UI.showToast(`No se pudo conectar Google Drive: ${err?.message || 'Autoriza tu cuenta de Google para subir a Ruma 🌷.'}`, 'error');
            });
          return;
        }

        runUploadFlow();
      });
    }
  });
}

export async function openMemoryDetailModal(group, mem, user) {
  const isCreator = Entitlements.isGroupCreator(group, user?.id);
  const photos = [...(mem.photos || [])];
  if (photos.length === 0 && mem.coverPreview) photos.push(mem.coverPreview);

  // Resolver archivos binarios desde IndexedDB local o descargarlos/cachearlos desde Google Drive (`driveFileId`)
  const resolvedMedia = [];
  for (const fileMeta of (mem.files || [])) {
    const resolved = await DriveBridge.resolveMemoryFileMedia(fileMeta, group);
    if (resolved) {
      resolvedMedia.push(resolved);
    }
  }
  if (resolvedMedia.length === 0) {
    photos.forEach((p, idx) => resolvedMedia.push({ url: p, isVideo: false, name: `Foto ${idx + 1}`, source: 'thumbnail', needsDriveConnect: false }));
  }

  const hasCloudOnlyMedia = resolvedMedia.some(item => item.needsDriveConnect);
  const comments = mem.comments || [];

  UI.openModal({
    title: `📸 ${mem.title}`,
    size: 'lg',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:1.15rem;">
        <!-- Portada principal -->
        <div style="position:relative;height:260px;border-radius:var(--radius-lg);overflow:hidden;background:#070312;">
          <img src="${Utils.sanitize(Utils.safeUrl(mem.coverPreview || photos[0] || 'assets/ruma_icon_512.png', 'assets/ruma_icon_512.png'))}" alt="${Utils.sanitize(mem.title)}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" id="mem-detail-hero-img">
          <div class="mem-hero-overlay">
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.3rem;">
              ${mem.isFeatured ? `<span class="badge badge-premium">⭐ Destacado</span>` : ''}
              <span class="badge badge-admin">📅 ${Utils.sanitize(Utils.formatFullSpanishDate(mem.date))}</span>
              ${mem.location ? `<span class="badge badge-free">📍 ${Utils.sanitize(mem.location)}</span>` : ''}
            </div>
            <h2 style="font-family:var(--font-display);font-size:1.5rem;">${Utils.sanitize(mem.title)}</h2>
          </div>
        </div>

        <!-- Acciones rápidas -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
          <span style="font-size:0.84rem;color:var(--text-secondary);">
            Inmortalizado por <strong>${Utils.sanitize(mem.authorName || 'Miembro')}</strong>
          </span>
          <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-detail-feature">
              ${mem.isFeatured ? '★ Quitar Destacado' : '☆ Marcar Destacado'}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-detail-edit">✏️ Editar</button>
            ${(mem.driveSyncStatus === 'synced' || (mem.driveUrl && DriveBridge.isRealFolderConfigured(mem.driveUrl))) && Utils.safeUrl(mem.driveUrl, '')
              ? `<a href="${Utils.sanitize(Utils.safeUrl(mem.driveUrl, '#'))}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">📁 Carpeta Drive ↗</a>`
              : (isCreator ? `<button type="button" class="btn btn-primary btn-sm" id="btn-mem-detail-sync-drive">☁️ Subir a Google Drive</button>` : '')
            }
            ${mem.authorId && mem.authorId !== user.id ? `<button type="button" class="btn btn-secondary btn-sm" id="btn-mem-detail-report" aria-label="Reportar recuerdo">🚩</button>` : ''}
            ${store.canDeleteMemory(group, mem, user) ? `<button type="button" class="btn btn-danger btn-sm" id="btn-mem-detail-delete" aria-label="Eliminar recuerdo">🗑️</button>` : ''}
          </div>
        </div>

        ${hasCloudOnlyMedia && isCreator ? `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.6rem;padding:0.75rem 0.9rem;border-radius:var(--radius-md);background:rgba(192,132,252,0.12);border:1px solid var(--border-strong);font-size:0.8rem;">
            <span style="color:var(--text-secondary);">
              ☁️ Este recuerdo tiene fotos HD o vídeos guardados en tu carpeta Ruma 🌷 de Google Drive.
            </span>
            <button type="button" class="btn btn-primary btn-sm" id="btn-mem-connect-drive-hd">
              🔑 Conectar Drive para ver en HD
            </button>
          </div>
        ` : ''}

        <!-- Banda Sonora y Nota de Voz del Recuerdo -->
        ${(mem.song && mem.song.title) || mem.voiceNote ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.75rem;">
            ${mem.song && mem.song.title ? `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:0.7rem;padding:0.75rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:var(--radius-md);">
                <div style="display:flex;align-items:center;gap:0.65rem;min-width:0;flex:1;">
                  <img src="${Utils.sanitize(Utils.safeUrl(mem.song.artwork, 'assets/ruma_icon_512.png'))}" alt="${Utils.sanitize(mem.song.title)}" style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0;">
                  <div style="min-width:0;">
                    <div style="font-size:0.7rem;font-weight:800;color:var(--brand-lilac-soft);text-transform:uppercase;letter-spacing:0.04em;">🎵 Banda Sonora del Recuerdo</div>
                    <div style="font-weight:800;font-size:0.9rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(mem.song.title)}</div>
                    <div style="font-size:0.76rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(mem.song.artist || '')}</div>
                  </div>
                </div>
                <button type="button" class="btn btn-primary btn-sm" id="btn-mem-detail-play-song" style="flex-shrink:0;">
                  ▶ Escuchar
                </button>
              </div>
            ` : ''}

            ${mem.voiceNote ? `
              <div style="display:flex;flex-direction:column;justify-content:center;gap:0.4rem;padding:0.75rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
                <div style="font-size:0.72rem;font-weight:800;color:var(--brand-lilac-soft);text-transform:uppercase;letter-spacing:0.04em;">🎙️ Nota de Voz del Momento</div>
                <audio controls preload="metadata" src="${Utils.sanitize(mem.voiceNote)}" style="width:100%;height:34px;"></audio>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Galería deslizable con Lightbox -->
        ${resolvedMedia.length > 0 ? `
          <div>
            <div style="font-size:0.82rem;font-weight:800;color:var(--brand-lilac-soft);margin-bottom:0.5rem;">
              🖼️ Galería del Álbum (${resolvedMedia.length}) — Toca para ampliar
            </div>
            <div style="display:flex;gap:0.65rem;overflow-x:auto;padding-bottom:0.4rem;">
              ${resolvedMedia.map((item, idx) => `
                <div style="width:120px;height:95px;border-radius:var(--radius-sm);overflow:hidden;flex-shrink:0;cursor:pointer;border:1px solid var(--border-subtle);position:relative;" data-lightbox-idx="${idx}">
                  ${item.isVideo
                    ? `<video src="${Utils.sanitize(Utils.safeUrl(item.url, ''))}#t=0.001" muted playsinline webkit-playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video><span class="badge badge-admin" style="position:absolute;bottom:4px;right:4px;">▶</span>`
                    : `<img src="${Utils.sanitize(Utils.safeUrl(item.url, 'assets/ruma_icon_512.png'))}" alt="media" style="width:100%;height:100%;object-fit:cover;">${item.originalIsVideo ? `<span class="badge badge-admin" style="position:absolute;bottom:4px;right:4px;">▶ Drive</span>` : ''}`
                  }
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Historia completa -->
        <div style="padding:1rem;background:var(--bg-elevated);border-radius:var(--radius-md);font-size:0.92rem;line-height:1.6;color:var(--text-secondary);">
          ${Utils.sanitize(mem.description || 'Sin historia escrita.')}
        </div>

        <!-- Hilo de Comentarios del Recuerdo -->
        <div>
          <h4 style="font-size:0.92rem;font-weight:800;margin-bottom:0.65rem;">💬 Conversaciones en este Recuerdo (${comments.length})</h4>
          <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:220px;overflow-y:auto;margin-bottom:0.75rem;">
            ${comments.length === 0 ? `
              <div style="font-size:0.82rem;color:var(--text-muted);">Sé el primero en comentar este recuerdo ❤️</div>
            ` : comments.map(c => `
              <div style="padding:0.6rem 0.85rem;background:var(--bg-elevated);border-radius:var(--radius-sm);">
                <div style="display:flex;justify-content:space-between;font-size:0.76rem;margin-bottom:0.2rem;">
                  <strong style="color:var(--brand-lilac-soft);">${Utils.sanitize(c.authorName)}</strong>
                  <span style="color:var(--text-muted);">${Utils.formatShortDate(c.createdAt)}</span>
                </div>
                <div style="font-size:0.86rem;">${Utils.sanitize(c.text)}</div>
              </div>
            `).join('')}
          </div>
          <form id="form-mem-detail-comment" style="display:flex;gap:0.5rem;">
            <input type="text" id="inp-mem-detail-comment" class="form-input" placeholder="Escribe un comentario o recuerdo sobre este día..." required>
            <button type="submit" class="btn btn-primary btn-sm">Comentar ❤️</button>
          </form>
        </div>
      </div>
    `,
    onClose: () => {
      resolvedMedia.forEach(m => MediaStorage.revokeMediaStreamUrl(m.url));
    },
    onMount: (modalEl) => {
      document.getElementById('mem-detail-hero-img')?.addEventListener('click', () => {
        const first = resolvedMedia[0];
        if (first) UI.openLightbox(first.url, first.isVideo, mem.title);
        else UI.openLightbox(mem.coverPreview || photos[0], false, mem.title);
      });

      document.getElementById('btn-mem-detail-play-song')?.addEventListener('click', async (e) => {
        if (!mem.song) return;
        const btn = e.currentTarget;
        if (mem.song.previewUrl) {
          MusicService.toggleTrack(mem.song);
          return;
        }
        btn.disabled = true;
        const res = await MusicService.searchSongs(`${mem.song.title} ${mem.song.artist || ''}`, 2);
        btn.disabled = false;
        if (res[0]?.previewUrl) {
          mem.song.previewUrl = res[0].previewUrl;
          MusicService.playTrack(res[0]);
        } else {
          UI.showToast('No hay fragmento de audio disponible para esta canción.', 'info');
        }
      });

      document.getElementById('btn-mem-connect-drive-hd')?.addEventListener('click', () => {
        if (!isCreator) return;
        UI.closeModal();
        store.navigate('settings');
        UI.showToast('Sincroniza tu cuenta con Google en ⚙️ Ajustes para ver tus recuerdos en HD ☁️', 'info');
      });

      modalEl.querySelectorAll('[data-lightbox-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const item = resolvedMedia[Number(el.getAttribute('data-lightbox-idx'))];
          if (!item) return;
          if (item.originalIsVideo && !item.isVideo && item.driveViewLink) {
            const safeLink = Utils.safeUrl(item.driveViewLink, '');
            if (safeLink) {
              window.open(safeLink, '_blank', 'noopener,noreferrer');
              return;
            }
          }
          UI.openLightbox(item.url, item.isVideo, item.name);
        });
      });

      document.getElementById('btn-mem-detail-sync-drive')?.addEventListener('click', () => {
        if (!isCreator) {
          UI.showToast('Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar y sincronizar con Google Drive 👑', 'info');
          return;
        }
        if (!GoogleAuth.hasDriveAccess()) {
          if (GoogleAuth.hasValidClientId(group)) {
            GoogleAuth.requestDriveAccess('', group)
              .then((session) => {
                store.updateCurrentUser({
                  googleDriveSynced: true,
                  googleEmail: session.email || user?.email || ''
                });
                UI.closeModal();
                store.enqueueMemoryDriveUpload(mem.id, group.id);
                UI.showToast(`☁️ Subiendo "${mem.title}" en segundo plano · Puedes seguir navegando`, 'info');
              })
              .catch(() => {
                UI.closeModal();
                store.navigate('settings');
                UI.showToast('Sincroniza tu cuenta con Google en ⚙️ Ajustes para subir el recuerdo a Ruma 🌷', 'info');
              });
            return;
          }
          UI.closeModal();
          store.navigate('settings');
          UI.showToast('Sincroniza tu cuenta con Google en ⚙️ Ajustes para subir el recuerdo a Ruma 🌷', 'info');
          return;
        }
        UI.closeModal();
        store.enqueueMemoryDriveUpload(mem.id, group.id);
        UI.showToast(`☁️ Subiendo "${mem.title}" en segundo plano · Puedes seguir navegando`, 'info');
      });

      document.getElementById('btn-mem-detail-feature')?.addEventListener('click', () => {
        store.toggleMemoryFeatured(mem.id);
        UI.closeModal();
        const updated = (store.getActiveGroup()?.memories || []).find(m => m.id === mem.id);
        if (updated) openMemoryDetailModal(store.getActiveGroup(), updated, user);
      });

      document.getElementById('btn-mem-detail-edit')?.addEventListener('click', () => {
        UI.closeModal();
        openUploadMemoryModal(group, mem, null, Entitlements.isGroupAdmin(group, user.id));
      });

      document.getElementById('btn-mem-detail-report')?.addEventListener('click', () => {
        UI.openReportModal({
          targetLabel: `el recuerdo "${mem.title || 'Sin título'}"`,
          onSubmit: ({ reason, details }) => store.reportContentAsync({
            groupId: group.id,
            targetType: 'memory',
            targetId: mem.id,
            targetUserId: mem.authorId || '',
            reason,
            details
          })
        });
      });

      document.getElementById('btn-mem-detail-delete')?.addEventListener('click', () => {
        const res = store.deleteMemoryFromActiveGroup(mem.id);
        if (!res?.ok) {
          UI.showToast(res?.error || 'No tienes permiso para eliminar este recuerdo.', 'error');
          return;
        }
        UI.closeModal();
        UI.showToast('Recuerdo eliminado.', 'info');
      });

      document.getElementById('form-mem-detail-comment')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = document.getElementById('inp-mem-detail-comment')?.value.trim();
        if (!text) return;
        store.addMemoryComment(mem.id, text);
        const updated = (store.getActiveGroup()?.memories || []).find(m => m.id === mem.id);
        if (updated) openMemoryDetailModal(store.getActiveGroup(), updated, user);
      });
    }
  });
}

