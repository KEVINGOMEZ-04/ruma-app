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
import { UI } from '../components/ui.js';

export function openAddPlanModal(dateStr, onSaved) {
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
            <label class="form-label">Fecha</label>
            <input type="date" id="plan-date" class="form-input" value="${Utils.sanitize(dateStr)}" required>
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
        store.addPlanToActiveGroup({
          title: document.getElementById('plan-title')?.value,
          date: document.getElementById('plan-date')?.value,
          time: document.getElementById('plan-time')?.value,
          note: document.getElementById('plan-note')?.value
        });
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
  const nowLocal = new Date();
  const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
  const today = prefillDate || editingMemory?.date || localToday;
  const sampleFolder = Utils.buildDriveSubfolderName(editingMemory?.title || 'Mi Recuerdo', today);
  const googleSession = isCreator ? GoogleAuth.getSession() : null;
  const hasDriveAccess = isCreator && GoogleAuth.hasDriveAccess();
  const hasRealFolder = DriveBridge.isRealFolderConfigured(group?.driveFolderUrl);
  let selectedSong = editingMemory?.song || null;
  let recordedVoiceDataUrl = editingMemory?.voiceNote || null;
  let mediaRecorder = null;
  let activeVoiceStream = null;
  let audioChunks = [];
  let isRecording = false;
  const stopVoiceCapture = () => {
    isRecording = false;
    try { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (_) {}
    try { activeVoiceStream?.getTracks().forEach(t => t.stop()); } catch (_) {}
    activeVoiceStream = null;
  };

  const auraColors = [
    { hex: '#A855F7', label: 'Violeta' },
    { hex: '#EC4899', label: 'Rosa' },
    { hex: '#F59E0B', label: 'Dorado' },
    { hex: '#22D3EE', label: 'Celeste' },
    { hex: '#10B981', label: 'Esmeralda' }
  ];
  let selectedAura = editingMemory?.auraColor || '#A855F7';

  UI.openModal({
    title: editingMemory ? '✏️ Editar Recuerdo' : '📸 Inmortalizar Recuerdo en Google Drive',
    size: 'lg',
    contentHtml: `
      <form id="form-upload-memory">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;">
          <div class="form-group">
            <label class="form-label">Nombre del Recuerdo</label>
            <input type="text" id="mem-title" class="form-input" placeholder="Ej: Paseo de Domingo" value="${Utils.sanitize(editingMemory?.title || '')}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Ubicación / Lugar (Opcional)</label>
            <input type="text" id="mem-location" class="form-input" placeholder="Ej: Mirador, Playa, Casa..." value="${Utils.sanitize(editingMemory?.location || '')}">
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.85rem;">
          <div class="form-group">
            <label class="form-label">Fecha del Recuerdo</label>
            <input type="date" id="mem-date" class="form-input" value="${Utils.sanitize(today)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Estado & Aura Luminosa</label>
            <div style="display:flex;align-items:center;gap:0.5rem;padding-top:0.35rem;flex-wrap:wrap;">
              ${auraColors.map(c => `
                <button type="button" class="aura-pick-btn" data-aura="${c.hex}" title="${c.label}" style="width:26px;height:26px;border-radius:50%;background:${c.hex};border:${selectedAura === c.hex ? '3px solid #fff' : '1px solid transparent'};cursor:pointer;"></button>
              `).join('')}
              <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.82rem;margin-left:0.5rem;cursor:pointer;">
                <input type="checkbox" id="mem-featured" ${editingMemory?.isFeatured ? 'checked' : ''}> ⭐ Destacado
              </label>
            </div>
          </div>
        </div>

        <div style="background:var(--bg-elevated);padding:0.8rem 0.95rem;border-radius:var(--radius-sm);margin-bottom:1rem;font-size:0.8rem;border:1px solid ${hasDriveAccess ? 'rgba(16,185,129,0.4)' : 'var(--border-subtle)'};display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;" id="mem-drive-status-box">
          <div>
            <div style="color:var(--brand-lilac-soft);">
              📁 Subcarpeta dentro de <strong>Ruma 🌷</strong>:
            </div>
            <strong id="mem-folder-preview" style="color:var(--text-primary);">${Utils.sanitize(sampleFolder)}</strong>
            <div id="mem-drive-status-line" style="font-size:0.74rem;color:${hasDriveAccess ? '#34D399' : '#FBBF24'};margin-top:0.2rem;">
              ${hasDriveAccess
                ? `🟢 Google Drive sincronizado (${Utils.sanitize(googleSession?.email || googleSession?.name || 'Drive')}) · Subirá a tu carpeta Ruma 🌷`
                : (isCreator
                    ? '⚠️ Ve a ⚙️ Ajustes para sincronizar tu cuenta con Google y activar tu carpeta Ruma 🌷.'
                    : (hasRealFolder
                        ? '👑 Carpeta Ruma 🌷 activa del creador del grupo. Tu recuerdo quedará guardado en el grupo.'
                        : '👑 Solo el creador del grupo activa la carpeta Ruma 🌷 desde sus Ajustes.'))}
            </div>
          </div>
          ${isCreator && !hasDriveAccess ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-modal-config-drive">
              ⚙️ Ir a Ajustes
            </button>
          ` : ''}
        </div>

        <div class="form-group">
          <label class="form-label">Fotos o Videos del Álbum (Sin límite de peso en MB/GB)</label>
          <input type="file" id="mem-files" class="form-input" accept="image/*,video/*,.heic,.heif,.mov,.m4v,.mp4" multiple>
        </div>

        <div class="form-group">
          <label class="form-label">Historia / Descripción del Momento</label>
          <textarea id="mem-desc" class="form-textarea" rows="3" placeholder="¿Qué hizo especial este momento?">${Utils.sanitize(editingMemory?.description || '')}</textarea>
        </div>

        <!-- Selector de Banda Sonora (Acoplado de LUMA) -->
        <div class="form-group">
          <label class="form-label">🎵 Banda Sonora del Recuerdo (Opcional)</label>
          <div style="display:flex;gap:0.5rem;">
            <input type="search" id="mem-song-query" class="form-input" placeholder="Buscar canción en iTunes para este recuerdo..." enterkeyhint="search" autocomplete="off">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-search-song">Buscar</button>
          </div>
          <div id="mem-song-selected" style="margin-top:0.45rem;font-size:0.82rem;color:var(--brand-lilac-soft);">
            ${selectedSong ? `🎵 Seleccionada: <strong>${Utils.sanitize(selectedSong.title)}</strong> - ${Utils.sanitize(selectedSong.artist)}` : ''}
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

        <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-mem">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-mem">${editingMemory ? 'Guardar Cambios' : (hasDriveAccess ? '☁️ Subir a Google Drive y Guardar' : '💾 Guardar Recuerdo')}</button>
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
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0.6rem;background:var(--bg-elevated);border-radius:var(--radius-xs);">
            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
              <img src="${Utils.sanitize(t.artwork)}" alt="art" style="width:28px;height:28px;border-radius:4px;">
              <span style="font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"><strong>${Utils.sanitize(t.title)}</strong> · ${Utils.sanitize(t.artist)}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-pick-mem-track="${idx}">Elegir</button>
          </div>
        `).join('');

        resBox.querySelectorAll('[data-pick-mem-track]').forEach(b => {
          b.addEventListener('click', () => {
            selectedSong = tracks[Number(b.getAttribute('data-pick-mem-track'))];
            const selEl = document.getElementById('mem-song-selected');
            if (selEl) selEl.innerHTML = `🎵 Seleccionada: <strong>${Utils.sanitize(selectedSong.title)}</strong> - ${Utils.sanitize(selectedSong.artist)}`;
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

      document.getElementById('btn-cancel-mem')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-upload-memory')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = Array.from(document.getElementById('mem-files')?.files || []);
        const submitBtn = document.getElementById('btn-submit-mem');
        const progWrap = document.getElementById('mem-upload-progress-wrap');
        const progText = document.getElementById('mem-upload-progress-text');
        const progPct = document.getElementById('mem-upload-progress-pct');
        const progBar = document.getElementById('mem-upload-progress-bar');

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ Procesando y subiendo...';
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
          files,
          existingPhotos: editingMemory?.photos || (editingMemory?.coverPreview ? [editingMemory.coverPreview] : []),
          onProgress: (p) => {
            if (!progWrap) return;
            const pct = Math.min(100, Math.max(5, Number(p.percent) || 15));
            if (progBar) progBar.style.width = `${pct}%`;
            if (progPct) progPct.textContent = `${pct}%`;
            if (progText) {
              if (p.stage === 'drive_folder') {
                progText.textContent = `📁 Creando subcarpeta "${p.fileName}" en Google Drive...`;
              } else if (p.stage === 'drive_upload') {
                progText.textContent = `☁️ Subiendo a Google Drive (${p.fileIndex}/${p.totalFiles}): ${p.fileName || ''}`;
              } else {
                progText.textContent = `💾 Guardando en caché (${p.fileIndex}/${p.totalFiles}): ${p.fileName || ''}`;
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
        if (res.driveSyncStatus === 'synced') {
          UI.showToast(`☁️ ¡Recuerdo "${res.memory.subfolderName}" subido a tu Google Drive!`, 'success');
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

      document.getElementById('btn-mem-detail-sync-drive')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        if (!isCreator) {
          UI.showToast('Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar y sincronizar con Google Drive 👑', 'info');
          return;
        }
        if (!GoogleAuth.hasDriveAccess()) {
          UI.closeModal();
          store.navigate('settings');
          UI.showToast('Sincroniza tu cuenta con Google en ⚙️ Ajustes para subir el recuerdo a Ruma 🌷', 'info');
          return;
        }
        btn.disabled = true;
        btn.textContent = '⏳ Subiendo a Drive...';
        const res = await store.syncExistingMemoryToDrive(mem.id);
        if (!res.ok) {
          btn.disabled = false;
          btn.textContent = '☁️ Subir a Google Drive';
          UI.showToast(res.error || 'No se pudo subir a Google Drive.', 'error');
          return;
        }
        UI.showToast(`¡Recuerdo "${res.memory.subfolderName}" subido a tu Google Drive! ☁️✨`, 'success');
        const updated = (store.getActiveGroup()?.memories || []).find(m => m.id === mem.id);
        if (updated) openMemoryDetailModal(store.getActiveGroup(), updated, user);
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

