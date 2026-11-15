/**
 * ruma 🌟 — INTERFAZ 2: El Grupo (Recuerdos en Google Drive, Cine, Series, Música, Metas/Notas y Chat con Citas)
 */

import confetti from 'canvas-confetti';
import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { MediaService } from '../services/media-api.js';
import { MusicService } from '../services/music-service.js';
import { UI } from '../components/ui.js';

let pendingChatQuote = null;

export function renderGroupInterface(container) {
  const user = store.getCurrentUser();
  const group = store.getActiveGroup();

  if (!user || !group) {
    store.navigate('hub');
    return;
  }

  const isPrem = Entitlements.isGroupPremium(group);
  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const tab = store.currentGroupTab || 'memories';

  const maxMovies = isPrem ? '∞' : PLAN_LIMITS.free.maxMoviesPerGroup;
  const maxSeries = isPrem ? '∞' : PLAN_LIMITS.free.maxSeriesPerGroup;
  const maxSongs = isPrem ? '∞' : PLAN_LIMITS.free.maxSongsPerGroup;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <!-- Cabecera del Grupo -->
      <div class="ruma-card" style="background:var(--grad-surface);padding:1.25rem 1.5rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.35rem;">
              <button type="button" class="btn btn-secondary btn-sm" id="btn-group-back-hub">← Mis Grupos</button>
              <span class="badge ${isPrem ? 'badge-premium' : 'badge-free'}">${isPrem ? '✨ Grupo Premium' : '🌱 Grupo Gratis'}</span>
              <span class="badge badge-admin">${isAdmin ? '🛡️ Administrador' : '👤 Miembro'}</span>
              <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--brand-lilac);">Código: ${Utils.sanitize(group.code)}</span>
            </div>
            <h1 style="font-family:var(--font-display);font-size:1.6rem;font-weight:800;">${Utils.sanitize(group.name)}</h1>
            <p style="color:var(--text-secondary);font-size:0.86rem;">${Utils.sanitize(group.description || '')}</p>
          </div>

          <!-- Avatares de Integrantes (Clic para abrir tarjeta estilo Discord) -->
          <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
            ${(group.members || []).map(m => `
              <div
                class="avatar-wrap ${Utils.sanitize(m.frameId || 'frame-none')}"
                style="width:40px;height:40px;cursor:pointer;"
                title="Ver perfil estilo Discord de ${Utils.sanitize(m.name)}"
                data-member-profile="${Utils.sanitize(m.id)}"
              >
                <img src="${Utils.sanitize(m.avatar || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(m.name)}" class="avatar-img">
              </div>
            `).join('')}
            ${!isPrem ? `
              <button type="button" class="btn btn-premium btn-sm" id="btn-group-header-upgrade">✨ Mejorar Grupo</button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Barra de Sub-Navegación del Grupo -->
      <nav class="group-subnav" aria-label="Secciones del grupo">
        <button type="button" class="group-tab-btn ${tab === 'memories' ? 'active' : ''}" data-group-tab="memories">
          📸 Recuerdos Drive (${(group.memories || []).length})
        </button>
        <button type="button" class="group-tab-btn ${tab === 'movies' ? 'active' : ''}" data-group-tab="movies">
          🎬 Películas (${(group.movies || []).length}/${maxMovies})
        </button>
        <button type="button" class="group-tab-btn ${tab === 'series' ? 'active' : ''}" data-group-tab="series">
          📺 Series (${(group.series || []).length}/${maxSeries})
        </button>
        <button type="button" class="group-tab-btn ${tab === 'music' ? 'active' : ''}" data-group-tab="music">
          🎵 Música (${(group.songs || []).length}/${maxSongs})
        </button>
        <button type="button" class="group-tab-btn ${tab === 'goals_notes' ? 'active' : ''}" data-group-tab="goals_notes">
          🎯 Metas & Notas
        </button>
        <button type="button" class="group-tab-btn ${tab === 'chat' ? 'active' : ''}" data-group-tab="chat">
          💬 Chat Interno (${(group.messages || []).length})
        </button>
      </nav>

      <!-- Contenedor Dinámico de la Pestaña Activa -->
      <div id="group-tab-viewport"></div>
    </div>
  `;

  document.getElementById('btn-group-back-hub')?.addEventListener('click', () => store.navigate('hub'));
  document.getElementById('btn-group-header-upgrade')?.addEventListener('click', () => {
    UI.showUpgradeModal(`Mejora "${group.name}" a Grupo Premium ruma Plus para tener películas, series y canciones ilimitadas.`, () => {
      store.upgradeGroupToPremium(group.id);
      UI.showToast('¡Grupo mejorado a ruma Plus! ✨🎉', 'success');
    });
  });

  container.querySelectorAll('[data-member-profile]').forEach(el => {
    el.addEventListener('click', () => {
      store.navigate('profile', { inspectUserId: el.getAttribute('data-member-profile') });
    });
  });

  container.querySelectorAll('[data-group-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.navigate('group', { groupTab: btn.getAttribute('data-group-tab') });
    });
  });

  const viewport = document.getElementById('group-tab-viewport');
  if (!viewport) return;

  if (tab === 'memories') renderMemoriesTab(viewport, group, user, isAdmin);
  else if (tab === 'movies') renderMoviesOrSeriesTab(viewport, group, user, 'movies');
  else if (tab === 'series') renderMoviesOrSeriesTab(viewport, group, user, 'series');
  else if (tab === 'music') renderMusicTab(viewport, group);
  else if (tab === 'goals_notes') renderGoalsAndNotesTab(viewport, group);
  else if (tab === 'chat') renderChatTab(viewport, group, user);
}

// ============================================================================
// 1. PESTAÑA RECUERDOS (Puente Google Drive: "[Título - Fecha]" + Caché Local)
// ============================================================================
function renderMemoriesTab(viewport, group, user, isAdmin) {
  const memories = group.memories || [];

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <!-- Estado del Puente Google Drive -->
      <div class="ruma-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;background:var(--bg-elevated);">
        <div>
          <div style="font-weight:800;font-size:0.95rem;color:var(--brand-lilac-soft);">
            📂 Puente Google Drive del Grupo + Caché Local
          </div>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.2rem;">
            ${group.driveFolderUrl
              ? `Conectado a carpeta Drive. Cada carga crea automáticamente la carpeta <code>[Nombre del Recuerdo - Fecha]</code> sin límite de peso.`
              : '⚠️ Aún no se ha vinculado una carpeta de Google Drive.'}
          </p>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
          ${group.driveFolderUrl ? `
            <a href="${Utils.sanitize(group.driveFolderUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">↗ Abrir Carpeta Drive</a>
          ` : ''}
          ${isAdmin ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-config-drive">⚙️ Configurar Carpeta Drive</button>
          ` : ''}
          <button type="button" class="btn btn-primary btn-sm" id="btn-mem-upload">+ Cargar Recuerdo a Drive</button>
        </div>
      </div>

      ${memories.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;">
          <p style="color:var(--text-secondary);">Aún no hay recuerdos cargados. ¡Sube las primeras fotos o videos del grupo!</p>
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${memories.map(mem => `
            <div class="ruma-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div style="height:210px;background:#090414;position:relative;">
                  <img src="${Utils.sanitize(mem.coverPreview || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(mem.title)}" style="width:100%;height:100%;object-fit:cover;">
                  <span class="badge badge-admin" style="position:absolute;top:0.75rem;left:0.75rem;background:rgba(14,7,29,0.82);">
                    📁 ${Utils.sanitize(mem.subfolderName || Utils.buildDriveSubfolderName(mem.title, mem.date))}
                  </span>
                </div>
                <div style="padding:1.25rem;">
                  <h3 style="font-family:var(--font-display);font-size:1.22rem;margin-bottom:0.35rem;">${Utils.sanitize(mem.title)}</h3>
                  <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.5;">${Utils.sanitize(mem.description || '')}</p>
                </div>
              </div>
              <div style="padding:0.85rem 1.25rem;border-top:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
                <span style="font-size:0.76rem;color:var(--text-muted);">
                  Por ${Utils.sanitize(mem.authorName || 'Miembro')} · ${mem.filesCount || 1} archivo(s) en Drive
                </span>
                <div style="display:flex;gap:0.45rem;">
                  <button type="button" class="btn btn-secondary btn-sm" data-quote-memory="${Utils.sanitize(mem.id)}">💬 Citar en Chat</button>
                  ${mem.driveUrl ? `
                    <a href="${Utils.sanitize(mem.driveUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Ver en Drive ↗</a>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-mem-config-drive')?.addEventListener('click', () => store.navigate('settings'));
  document.getElementById('btn-mem-upload')?.addEventListener('click', () => openUploadMemoryModal(group));

  viewport.querySelectorAll('[data-quote-memory]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mem = memories.find(m => m.id === btn.getAttribute('data-quote-memory'));
      if (!mem) return;
      pendingChatQuote = {
        type: 'memory',
        itemId: mem.id,
        label: '📸 Recuerdo',
        title: mem.title,
        subtitle: mem.subfolderName || Utils.formatFullSpanishDate(mem.date),
        thumb: mem.coverPreview || 'assets/ruma_icon_512.png'
      };
      store.navigate('group', { groupTab: 'chat' });
    });
  });
}

function openUploadMemoryModal(group) {
  const today = new Date().toISOString().split('T')[0];
  const sampleFolder = Utils.buildDriveSubfolderName('Mi Recuerdo', today);

  UI.openModal({
    title: '📸 Cargar Recuerdo a Google Drive',
    contentHtml: `
      <form id="form-upload-memory">
        <div class="form-group">
          <label class="form-label">Nombre del Recuerdo</label>
          <input type="text" id="mem-title" class="form-input" placeholder="Ej: Paseo de Domingo" required>
        </div>
        <div class="form-group">
          <label class="form-label">Fecha del Recuerdo</label>
          <input type="date" id="mem-date" class="form-input" value="${today}" required>
        </div>
        <div style="background:var(--bg-elevated);padding:0.75rem 0.9rem;border-radius:var(--radius-sm);margin-bottom:1rem;font-size:0.8rem;color:var(--brand-lilac-soft);">
          📁 Subcarpeta que se creará en Drive:<br>
          <strong id="mem-folder-preview">${Utils.sanitize(sampleFolder)}</strong>
        </div>
        <div class="form-group">
          <label class="form-label">Fotos o Videos (Sin límite de peso en MB/GB)</label>
          <input type="file" id="mem-files" class="form-input" accept="image/*,video/*" multiple>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción / Historia</label>
          <textarea id="mem-desc" class="form-textarea" rows="2" placeholder="¿Qué hizo especial este momento?"></textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-mem">Cancelar</button>
          <button type="submit" class="btn btn-primary">Subir y Guardar en Caché</button>
        </div>
      </form>
    `,
    onMount: () => {
      const titleInp = document.getElementById('mem-title');
      const dateInp = document.getElementById('mem-date');
      const previewEl = document.getElementById('mem-folder-preview');

      const updateFolderPreview = () => {
        if (previewEl) {
          previewEl.textContent = Utils.buildDriveSubfolderName(titleInp?.value || 'Mi Recuerdo', dateInp?.value || today);
        }
      };
      titleInp?.addEventListener('input', updateFolderPreview);
      dateInp?.addEventListener('change', updateFolderPreview);

      document.getElementById('btn-cancel-mem')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-upload-memory')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = Array.from(document.getElementById('mem-files')?.files || []);
        const res = await store.addMemoryToActiveGroup({
          title: titleInp?.value || 'Recuerdo',
          date: dateInp?.value || today,
          description: document.getElementById('mem-desc')?.value || '',
          files
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
        UI.showToast(`Carpeta "${res.memory.subfolderName}" sincronizada 📂✨`, 'success');
      });
    }
  });
}

// ============================================================================
// 2. PESTAÑA CINE Y SERIES (Máximo 5 en Grupos Gratis + Calificaciones + Reseñas)
// ============================================================================
function renderMoviesOrSeriesTab(viewport, group, user, category) {
  const isMovies = category === 'movies';
  const items = group[category] || [];
  const check = Entitlements.canAddMediaItem(group, category);
  const maxStr = check.max === Infinity ? 'Ilimitadas ✨' : `${items.length} / ${check.max}`;

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <div class="ruma-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;background:var(--bg-elevated);">
        <div>
          <h2 style="font-family:var(--font-display);font-size:1.3rem;">
            ${isMovies ? '🎬 Cartelera de Películas' : '📺 Maratón de Series'}
          </h2>
          <p style="font-size:0.84rem;color:var(--text-secondary);">
            Guarda títulos para ver o vistos, califícalos y deja tu reseña. Las que califiques podrás mostrarlas en tu <strong>Perfil estilo Discord</strong>.
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:0.65rem;">
          <span class="badge ${check.allowed ? 'badge-limit' : 'badge-premium'}">Cupo: ${maxStr}</span>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-media-item">
            + Añadir ${isMovies ? 'Película' : 'Serie'}
          </button>
        </div>
      </div>

      ${items.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
          No hay ${isMovies ? 'películas' : 'series'} guardadas todavía.
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${items.map(item => {
            const ratingsObj = item.ratings || {};
            const ratingEntries = Object.entries(ratingsObj);
            const avg = ratingEntries.length > 0
              ? (ratingEntries.reduce((acc, [, r]) => acc + Number(r.score || 0), 0) / ratingEntries.length).toFixed(1)
              : 'Sin nota';
            const myRating = ratingsObj[user.id];

            return `
              <div class="ruma-card" style="display:flex;gap:1.1rem;flex-wrap:wrap;">
                <img src="${Utils.sanitize(item.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:110px;height:162px;border-radius:var(--radius-md);object-fit:cover;flex-shrink:0;">
                <div style="flex:1;min-width:200px;display:flex;flex-direction:column;justify-content:space-between;gap:0.75rem;">
                  <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
                      <span class="badge badge-admin">${Utils.sanitize(item.status || 'Por ver')}</span>
                      <span class="badge badge-premium">⭐ Promedio: ${avg}</span>
                    </div>
                    <h3 style="font-family:var(--font-display);font-size:1.2rem;margin-top:0.45rem;">
                      ${Utils.sanitize(item.title)} <span style="font-weight:400;color:var(--text-muted);font-size:0.9rem;">(${Utils.sanitize(item.year || '')})</span>
                    </h3>

                    <!-- Notas y Reseñas de los miembros -->
                    <div style="margin-top:0.65rem;display:flex;flex-direction:column;gap:0.4rem;">
                      ${ratingEntries.length === 0 ? `
                        <div style="font-size:0.8rem;color:var(--text-muted);">Nadie la ha calificado aún.</div>
                      ` : ratingEntries.map(([uid, r]) => {
                        const member = (group.members || []).find(m => m.id === uid);
                        return `
                          <div style="background:var(--bg-elevated);padding:0.45rem 0.65rem;border-radius:var(--radius-sm);font-size:0.8rem;">
                            <strong>${Utils.sanitize(member?.name || 'Miembro')}:</strong>
                            <span style="color:var(--brand-gold);font-weight:700;"> ⭐ ${Number(r.score).toFixed(1)}</span>
                            ${r.review ? `<div style="color:var(--text-secondary);margin-top:0.15rem;">"${Utils.sanitize(r.review)}"</div>` : ''}
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>

                  <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-primary btn-sm" data-rate-item="${Utils.sanitize(item.id)}">
                      ⭐ ${myRating ? `Mi nota (${myRating.score})` : 'Calificar y Reseñar'}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-quote-media="${Utils.sanitize(item.id)}">
                      💬 Citar en Chat
                    </button>
                    <button type="button" class="btn btn-danger btn-sm" data-delete-media="${Utils.sanitize(item.id)}">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-add-media-item')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openSearchTmdbModal(group, category);
  });

  viewport.querySelectorAll('[data-rate-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(x => x.id === btn.getAttribute('data-rate-item'));
      if (item) openRateModal(category, item, user);
    });
  });

  viewport.querySelectorAll('[data-quote-media]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = items.find(x => x.id === btn.getAttribute('data-quote-media'));
      if (!item) return;
      pendingChatQuote = {
        type: isMovies ? 'movie' : 'series',
        itemId: item.id,
        label: isMovies ? '🎬 Película' : '📺 Serie',
        title: `${item.title} (${item.year || ''})`,
        subtitle: `Estado: ${item.status || 'Guardada'}`,
        thumb: item.poster || 'assets/ruma_icon_512.png'
      };
      store.navigate('group', { groupTab: 'chat' });
    });
  });

  viewport.querySelectorAll('[data-delete-media]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.deleteMediaItem(category, btn.getAttribute('data-delete-media'));
      UI.showToast('Elemento eliminado de la lista.', 'info');
    });
  });
}

function openSearchTmdbModal(group, category) {
  const isMovies = category === 'movies';
  UI.openModal({
    title: isMovies ? '🎬 Buscar y Guardar Película (TMDb)' : '📺 Buscar y Guardar Serie (TMDb)',
    contentHtml: `
      <div>
        <div style="display:flex;gap:0.5rem;margin-bottom:1rem;">
          <input type="text" id="tmdb-search-input" class="form-input" placeholder="Escribe el título para buscar en TMDb...">
          <button type="button" class="btn btn-primary" id="btn-run-tmdb-search">Buscar</button>
        </div>
        <div id="tmdb-search-results" style="display:flex;flex-direction:column;gap:0.55rem;max-height:320px;overflow-y:auto;"></div>
      </div>
    `,
    onMount: () => {
      const input = document.getElementById('tmdb-search-input');
      const resultsEl = document.getElementById('tmdb-search-results');

      const doSearch = async () => {
        const q = input?.value.trim();
        if (!q || !resultsEl) return;
        resultsEl.innerHTML = `<div style="color:var(--text-secondary);font-size:0.85rem;">Buscando en TMDb...</div>`;
        const results = isMovies ? await MediaService.searchMovies(q) : await MediaService.searchSeries(q);
        if (results.length === 0) {
          resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;">Sin resultados encontrados.</div>`;
          return;
        }
        resultsEl.innerHTML = results.map((r, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.55rem;background:var(--bg-elevated);border-radius:var(--radius-sm);">
            <div style="display:flex;align-items:center;gap:0.65rem;min-width:0;">
              <img src="${Utils.sanitize(r.poster)}" alt="poster" style="width:38px;height:54px;border-radius:6px;object-fit:cover;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:0.88rem;">${Utils.sanitize(r.title)} (${Utils.sanitize(r.year)})</div>
                <div style="font-size:0.75rem;color:var(--brand-gold);">⭐ TMDb ${Utils.sanitize(r.voteAverage)}</div>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-pick-tmdb="${i}">+ Guardar</button>
          </div>
        `).join('');

        resultsEl.querySelectorAll('[data-pick-tmdb]').forEach(btn => {
          btn.addEventListener('click', () => {
            const picked = results[Number(btn.getAttribute('data-pick-tmdb'))];
            const res = store.addMediaToActiveGroup(category, {
              title: picked.title,
              year: picked.year,
              poster: picked.poster,
              status: 'Por ver',
              ratings: {}
            });
            UI.closeModal();
            if (!res.ok) {
              if (res.needsUpgrade) UI.showUpgradeModal(res.error, () => store.upgradeGroupToPremium(group.id));
              else UI.showToast(res.error, 'error');
              return;
            }
            UI.showToast(`"${picked.title}" guardada en el grupo ✨`, 'success');
          });
        });
      };

      document.getElementById('btn-run-tmdb-search')?.addEventListener('click', doSearch);
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSearch();
        }
      });
    }
  });
}

function openRateModal(category, item, user) {
  const existing = (item.ratings && item.ratings[user.id]) || { score: 9.0, review: '' };
  UI.openModal({
    title: `⭐ Calificar "${item.title}"`,
    contentHtml: `
      <form id="form-rate-item">
        <div class="form-group">
          <label class="form-label">Tu Calificación (1.0 a 10.0)</label>
          <input type="number" id="rate-score-inp" class="form-input" min="1" max="10" step="0.1" value="${existing.score}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Tu Reseña / Nota para el Grupo</label>
          <textarea id="rate-review-inp" class="form-textarea" rows="3" placeholder="¿Qué te pareció? (En tu perfil estilo Discord solo se mostrará la calificación, no esta reseña)">${Utils.sanitize(existing.review || '')}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-rate">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Calificación</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('btn-cancel-rate')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-rate-item')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const score = document.getElementById('rate-score-inp')?.value;
        const review = document.getElementById('rate-review-inp')?.value;
        store.rateMovieOrSeries(category, item.id, score, review);
        UI.closeModal();
        UI.showToast('¡Calificación guardada! Ya puedes elegir mostrarla en tu Perfil estilo Discord 🎮', 'success');
      });
    }
  });
}

// ============================================================================
// 3. PESTAÑA MÚSICA (Máximo 5 en Gratis + Botones Spotify, YouTube y Apple Music)
// ============================================================================
function renderMusicTab(viewport, group) {
  const songs = group.songs || [];
  const check = Entitlements.canAddMediaItem(group, 'songs');
  const maxStr = check.max === Infinity ? 'Ilimitadas ✨' : `${songs.length} / ${check.max}`;

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <div class="ruma-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;background:var(--bg-elevated);">
        <div>
          <h2 style="font-family:var(--font-display);font-size:1.3rem;">🎵 Playlist del Grupo</h2>
          <p style="font-size:0.84rem;color:var(--text-secondary);">
            Guarda canciones especiales. Escucha fragmentos de 30s oficiales o ábrelas en <strong>Spotify</strong>, <strong>YouTube</strong> o <strong>Apple Music</strong>.
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:0.65rem;">
          <span class="badge ${check.allowed ? 'badge-limit' : 'badge-premium'}">Cupo: ${maxStr}</span>
          <button type="button" class="btn btn-primary btn-sm" id="btn-add-song">+ Añadir Canción</button>
        </div>
      </div>

      ${songs.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
          Aún no hay canciones guardadas en el grupo.
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${songs.map(song => `
            <div class="ruma-card" style="display:flex;gap:1rem;align-items:flex-start;">
              <img src="${Utils.sanitize(song.artwork || 'assets/ruma_icon_512.png')}" alt="Artwork" style="width:86px;height:86px;border-radius:var(--radius-md);object-fit:cover;flex-shrink:0;">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;">
                  <div>
                    <h3 style="font-family:var(--font-display);font-size:1.1rem;">${Utils.sanitize(song.title)}</h3>
                    <div style="color:var(--brand-lilac);font-size:0.84rem;font-weight:600;">${Utils.sanitize(song.artist)}</div>
                  </div>
                  <button type="button" class="btn btn-danger btn-sm" data-delete-song="${Utils.sanitize(song.id)}">✕</button>
                </div>

                ${song.note ? `<p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.4rem;">"${Utils.sanitize(song.note)}"</p>` : ''}

                <!-- Reproductor de Fragmento Oficial 30s + Enlaces a Plataformas -->
                <div class="platform-links" style="margin-top:0.75rem;">
                  ${song.previewUrl ? `
                    <button type="button" class="btn btn-secondary btn-sm" data-preview-song="${Utils.sanitize(song.id)}" data-preview-url="${Utils.sanitize(song.previewUrl)}">
                      ▶ 30s
                    </button>
                  ` : ''}
                  <a href="${Utils.sanitize(song.spotifyUrl || MusicService.buildSpotifyUrl(song.title, song.artist))}" target="_blank" rel="noopener" class="btn-platform btn-spotify">
                    🟢 Spotify
                  </a>
                  <a href="${Utils.sanitize(song.youtubeUrl || MusicService.buildYoutubeUrl(song.title, song.artist))}" target="_blank" rel="noopener" class="btn-platform btn-youtube">
                    🔴 YouTube
                  </a>
                  <a href="${Utils.sanitize(song.appleMusicUrl || MusicService.buildAppleMusicUrl(song.title, song.artist))}" target="_blank" rel="noopener" class="btn-platform btn-apple">
                    🍎 Apple Music
                  </a>
                  <button type="button" class="btn btn-secondary btn-sm" data-quote-song="${Utils.sanitize(song.id)}">💬 Citar en Chat</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-add-song')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openAddSongModal(group);
  });

  // Manejador de reproducción de fragmentos oficiales de 30 segundos
  viewport.querySelectorAll('[data-preview-song]').forEach(btn => {
    btn.addEventListener('click', () => {
      const trackId = btn.getAttribute('data-preview-song');
      const previewUrl = btn.getAttribute('data-preview-url');

      const res = MusicService.togglePreview(trackId, previewUrl, (state) => {
        const activeBtn = viewport.querySelector(`[data-preview-song="${state.trackId}"]`);
        if (activeBtn) {
          activeBtn.innerHTML = state.isPlaying
            ? `⏸ ${Math.round(state.currentTime)}s`
            : '▶ 30s';
        }
      });

      // Actualizar texto del botón al presionar
      btn.innerHTML = res.isPlaying ? '⏸ Reproduciendo...' : '▶ 30s';
    });
  });

  viewport.querySelectorAll('[data-delete-song]').forEach(btn => {
    btn.addEventListener('click', () => {
      MusicService.stopPreview();
      store.deleteMediaItem('songs', btn.getAttribute('data-delete-song'));
      UI.showToast('Canción eliminada.', 'info');
    });
  });

  viewport.querySelectorAll('[data-quote-song]').forEach(btn => {
    btn.addEventListener('click', () => {
      const song = songs.find(s => s.id === btn.getAttribute('data-quote-song'));
      if (!song) return;
      pendingChatQuote = {
        type: 'song',
        itemId: song.id,
        label: '🎵 Canción',
        title: song.title,
        subtitle: song.artist,
        thumb: song.artwork || 'assets/ruma_icon_512.png'
      };
      store.navigate('group', { groupTab: 'chat' });
    });
  });
}

function openAddSongModal(group) {
  let debounceTimer = null;

  UI.openModal({
    title: '🎵 Buscar Canción o Letra',
    contentHtml: `
      <div>
        <div style="margin-bottom:0.85rem;">
          <input type="text" id="song-search-inp" class="form-input" placeholder="Escribe el nombre de la canción, artista o parte de la letra..." autofocus>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.35rem;">
            ⚡ Búsqueda en vivo: detecta títulos, artistas y fragmentos de letras.
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Dedicatoria o nota especial (opcional)</label>
          <input type="text" id="song-note-inp" class="form-input" placeholder="Ej: La canción de nuestra primera cita 💫">
        </div>
        <div id="song-search-results" style="display:flex;flex-direction:column;gap:0.55rem;max-height:300px;overflow-y:auto;padding-right:0.25rem;">
          <div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;">
            Empieza a escribir para buscar en vivo...
          </div>
        </div>
      </div>
    `,
    onMount: () => {
      const inp = document.getElementById('song-search-inp');
      const resultsEl = document.getElementById('song-search-results');

      const executeSearch = async () => {
        const q = inp?.value.trim();
        if (!q || !resultsEl) {
          if (resultsEl) resultsEl.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;">Empieza a escribir para buscar en vivo...</div>`;
          return;
        }

        resultsEl.innerHTML = `<div style="color:var(--brand-lilac);font-size:0.85rem;padding:0.75rem;">Buscando coincidencias en catálogo y letras...</div>`;
        const list = await MusicService.searchSongs(q, 10);

        if (list.length === 0) {
          resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;text-align:center;">No encontramos canciones con esa letra o nombre. Intenta con otras palabras.</div>`;
          return;
        }

        resultsEl.innerHTML = list.map((s, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.65rem;padding:0.65rem;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;flex:1;">
              <img src="${Utils.sanitize(s.artwork)}" alt="art" style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(s.title)}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(s.artist)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:0.45rem;flex-shrink:0;">
              ${s.previewUrl ? `
                <button type="button" class="btn btn-secondary btn-sm" data-modal-preview="${i}" title="Escuchar fragmento oficial de 30 segundos">
                  ▶ 30s
                </button>
              ` : ''}
              <button type="button" class="btn btn-primary btn-sm" data-pick-song="${i}">+ Guardar</button>
            </div>
          </div>
        `).join('');

        // Escuchar fragmento de 30 segundos directamente en el buscador
        resultsEl.querySelectorAll('[data-modal-preview]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-modal-preview'));
            const item = list[idx];
            if (!item?.previewUrl) return;

            const res = MusicService.togglePreview(`modal_${item.id}`, item.previewUrl, (state) => {
              const b = resultsEl.querySelector(`[data-modal-preview="${idx}"]`);
              if (b) {
                b.innerHTML = state.isPlaying ? `⏸ ${Math.round(state.currentTime)}s` : '▶ 30s';
              }
            });
            btn.innerHTML = res.isPlaying ? '⏸ ...' : '▶ 30s';
          });
        });

        // Guardar canción en la playlist del grupo
        resultsEl.querySelectorAll('[data-pick-song]').forEach(btn => {
          btn.addEventListener('click', () => {
            MusicService.stopPreview();
            const picked = list[Number(btn.getAttribute('data-pick-song'))];
            const note = document.getElementById('song-note-inp')?.value.trim() || '';
            const res = store.addMediaToActiveGroup('songs', {
              ...picked,
              note
            });
            UI.closeModal();
            if (!res.ok) {
              if (res.needsUpgrade) UI.showUpgradeModal(res.error, () => store.upgradeGroupToPremium(group.id));
              else UI.showToast(res.error, 'error');
              return;
            }
            UI.showToast(`"${picked.title}" añadida con fragmento oficial y links 🎵`, 'success');
          });
        });
      };

      // Búsqueda en vivo mientras el usuario escribe (con debounce de 280ms)
      inp?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(executeSearch, 280);
      });
    }
  });
}

// ============================================================================
// 4. PESTAÑA METAS Y TABLERO DE NOTAS
// ============================================================================
function renderGoalsAndNotesTab(viewport, group) {
  const goals = group.goals || [];
  const notes = group.notes || [];

  viewport.innerHTML = `
    <div class="ruma-grid-2">
      <!-- Metas Compartidas -->
      <div class="ruma-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h2 style="font-family:var(--font-display);font-size:1.25rem;">🎯 Metas del Grupo</h2>
        </div>
        <form id="form-add-goal" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
          <input type="text" id="goal-title-inp" class="form-input" placeholder="Nueva meta o plan juntos..." required>
          <button type="submit" class="btn btn-primary btn-sm">+ Añadir</button>
        </form>
        <div style="display:flex;flex-direction:column;gap:0.55rem;">
          ${goals.map(g => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.7rem 0.9rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
              <span style="${g.completed ? 'text-decoration:line-through;color:var(--text-muted);' : 'font-weight:600;'}">
                ${Utils.sanitize(g.title)}
              </span>
              <button type="button" class="btn ${g.completed ? 'btn-primary' : 'btn-secondary'} btn-sm" data-toggle-goal="${Utils.sanitize(g.id)}">
                ${g.completed ? '✓ Cumplida' : 'Marcar Cumplida'}
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Tablero de Notas -->
      <div class="ruma-card">
        <h2 style="font-family:var(--font-display);font-size:1.25rem;margin-bottom:1rem;">📝 Tablero de Notas</h2>
        <form id="form-add-note" style="display:flex;flex-direction:column;gap:0.55rem;margin-bottom:1rem;">
          <input type="text" id="note-title-inp" class="form-input" placeholder="Título de la nota..." required>
          <textarea id="note-content-inp" class="form-textarea" rows="2" placeholder="Escribe un recordatorio, idea o mensaje..." required></textarea>
          <button type="submit" class="btn btn-primary btn-sm" style="align-self:flex-end;">Publicar Nota</button>
        </form>
        <div style="display:flex;flex-direction:column;gap:0.55rem;">
          ${notes.map(n => `
            <div style="padding:0.85rem;background:var(--bg-elevated);border-radius:var(--radius-md);border-left:3px solid var(--brand-lilac);">
              <div style="font-weight:700;font-size:0.92rem;">${Utils.sanitize(n.title)}</div>
              <p style="font-size:0.84rem;color:var(--text-secondary);margin-top:0.25rem;">${Utils.sanitize(n.content)}</p>
              <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.35rem;">Por ${Utils.sanitize(n.authorName)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('form-add-goal')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('goal-title-inp')?.value;
    if (title) store.addGoalToActiveGroup({ title, category: 'General' });
  });

  viewport.querySelectorAll('[data-toggle-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const done = store.toggleGoalCompleted(btn.getAttribute('data-toggle-goal'));
      if (done) {
        try { confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } }); } catch (_) {}
        UI.showToast('¡Meta cumplida! 🎉✨', 'success');
      }
    });
  });

  document.getElementById('form-add-note')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('note-title-inp')?.value;
    const content = document.getElementById('note-content-inp')?.value;
    if (title && content) store.addNoteToActiveGroup({ title, content });
  });
}

// ============================================================================
// 5. PESTAÑA CHAT INTERNO ESTILO WHATSAPP (Con citas a Recuerdos, Películas, Series, Canciones o Mensajes; sin reproductor de música)
// ============================================================================
function renderChatTab(viewport, group, user) {
  const messages = group.messages || [];

  viewport.innerHTML = `
    <div class="chat-layout">
      <!-- Cabecera del Chat -->
      <div style="padding:0.85rem 1.25rem;background:var(--bg-card);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <div>
          <strong style="font-size:0.95rem;">💬 Chat Interno de ${Utils.sanitize(group.name)}</strong>
          <div style="font-size:0.76rem;color:var(--text-muted);">
            Desliza o pulsa "Responder" en cualquier mensaje, o enlaza un recuerdo, película o canción guardada.
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-chat-pick-saved-item">
          📎 Enlazar Recuerdo / Película / Canción
        </button>
      </div>

      <!-- Historial de Mensajes -->
      <div class="chat-messages" id="chat-messages-scroll">
        ${messages.map(msg => {
          const isMine = msg.senderId === user.id;
          return `
            <div class="chat-bubble ${isMine ? 'mine' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-bottom:0.3rem;">
                <strong style="font-size:0.78rem;color:var(--brand-lilac-soft);">${Utils.sanitize(msg.senderName)}</strong>
                <button type="button" style="background:none;border:none;color:var(--text-muted);font-size:0.72rem;cursor:pointer;" data-reply-msg="${Utils.sanitize(msg.id)}">
                  ↩ Responder
                </button>
              </div>

              ${msg.quote ? `
                <div class="chat-quote-box" data-jump-quote-type="${Utils.sanitize(msg.quote.type)}">
                  ${msg.quote.thumb ? `<img src="${Utils.sanitize(msg.quote.thumb)}" alt="thumb" class="chat-quote-thumb">` : ''}
                  <div style="min-width:0;">
                    <div style="font-weight:800;color:var(--brand-pink);font-size:0.74rem;">${Utils.sanitize(msg.quote.label)}</div>
                    <div style="font-weight:700;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(msg.quote.title)}</div>
                    <div style="color:var(--text-muted);font-size:0.72rem;">${Utils.sanitize(msg.quote.subtitle || '')}</div>
                  </div>
                </div>
              ` : ''}

              <div style="font-size:0.92rem;line-height:1.45;">${Utils.sanitize(msg.text)}</div>
              <div style="font-size:0.68rem;color:var(--text-muted);text-align:right;margin-top:0.25rem;">
                ${Utils.formatTime(msg.timestamp)}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Vista Previa de Cita Activa (Estilo WhatsApp Reply Bar) -->
      <div id="chat-active-quote-bar" style="display:${pendingChatQuote ? 'flex' : 'none'};align-items:center;justify-content:space-between;padding:0.55rem 1rem;background:var(--bg-card-hover);border-top:1px solid var(--border-strong);">
        <div style="display:flex;align-items:center;gap:0.6rem;min-width:0;">
          <span style="color:var(--brand-pink);font-weight:800;font-size:0.8rem;">${Utils.sanitize(pendingChatQuote?.label || '')}:</span>
          <span style="font-size:0.84rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(pendingChatQuote?.title || '')}</span>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-chat-quote">✕</button>
      </div>

      <!-- Barra de Escritura -->
      <form id="form-chat-send" style="display:flex;gap:0.6rem;padding:0.85rem 1rem;background:var(--bg-card);border-top:1px solid var(--border-subtle);">
        <input type="text" id="chat-text-inp" class="form-input" placeholder="Escribe un mensaje en relación al grupo..." required>
        <button type="submit" class="btn btn-primary">Enviar ➤</button>
      </form>
    </div>
  `;

  const scrollBox = document.getElementById('chat-messages-scroll');
  if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;

  document.getElementById('btn-clear-chat-quote')?.addEventListener('click', () => {
    pendingChatQuote = null;
    renderChatTab(viewport, group, user);
  });

  // Responder a un mensaje del chat (estilo WhatsApp)
  viewport.querySelectorAll('[data-reply-msg]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetMsg = messages.find(m => m.id === btn.getAttribute('data-reply-msg'));
      if (!targetMsg) return;
      pendingChatQuote = {
        type: 'message',
        itemId: targetMsg.id,
        label: `💬 Respuesta a ${targetMsg.senderName}`,
        title: targetMsg.text,
        subtitle: Utils.formatTime(targetMsg.timestamp),
        thumb: ''
      };
      renderChatTab(viewport, group, user);
      document.getElementById('chat-text-inp')?.focus();
    });
  });

  // Al tocar una cita dentro de una burbuja, saltar a la pestaña correspondiente
  viewport.querySelectorAll('[data-jump-quote-type]').forEach(box => {
    box.addEventListener('click', () => {
      const t = box.getAttribute('data-jump-quote-type');
      if (t === 'memory') store.navigate('group', { groupTab: 'memories' });
      else if (t === 'movie') store.navigate('group', { groupTab: 'movies' });
      else if (t === 'series') store.navigate('group', { groupTab: 'series' });
      else if (t === 'song') store.navigate('group', { groupTab: 'music' });
    });
  });

  // Selector para enlazar cualquier Recuerdo, Película, Serie o Canción ya guardada en el grupo
  document.getElementById('btn-chat-pick-saved-item')?.addEventListener('click', () => {
    openPickGroupItemToQuoteModal(group, () => {
      renderChatTab(viewport, group, user);
      document.getElementById('chat-text-inp')?.focus();
    });
  });

  document.getElementById('form-chat-send')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('chat-text-inp');
    const text = inp?.value.trim();
    if (!text) return;
    store.sendChatMessage({ text, quote: pendingChatQuote });
    pendingChatQuote = null;
  });
}

function openPickGroupItemToQuoteModal(group, onPicked) {
  const items = [
    ...(group.memories || []).map(m => ({
      type: 'memory',
      itemId: m.id,
      label: '📸 Recuerdo',
      title: m.title,
      subtitle: m.subfolderName || m.date,
      thumb: m.coverPreview || 'assets/ruma_icon_512.png'
    })),
    ...(group.movies || []).map(m => ({
      type: 'movie',
      itemId: m.id,
      label: '🎬 Película',
      title: `${m.title} (${m.year || ''})`,
      subtitle: m.status || 'Cine',
      thumb: m.poster || 'assets/ruma_icon_512.png'
    })),
    ...(group.series || []).map(s => ({
      type: 'series',
      itemId: s.id,
      label: '📺 Serie',
      title: `${s.title} (${s.year || ''})`,
      subtitle: s.status || 'Serie',
      thumb: s.poster || 'assets/ruma_icon_512.png'
    })),
    ...(group.songs || []).map(s => ({
      type: 'song',
      itemId: s.id,
      label: '🎵 Canción',
      title: s.title,
      subtitle: s.artist,
      thumb: s.artwork || 'assets/ruma_icon_512.png'
    }))
  ];

  UI.openModal({
    title: '📎 Enlazar Elemento Guardado en el Chat',
    contentHtml: items.length === 0 ? `
      <p style="color:var(--text-secondary);">Aún no hay recuerdos, películas o canciones guardadas en este grupo.</p>
    ` : `
      <div style="display:flex;flex-direction:column;gap:0.55rem;max-height:340px;overflow-y:auto;">
        ${items.map((it, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.55rem;background:var(--bg-elevated);border-radius:var(--radius-sm);">
            <div style="display:flex;align-items:center;gap:0.65rem;min-width:0;">
              <img src="${Utils.sanitize(it.thumb)}" alt="thumb" style="width:40px;height:40px;border-radius:6px;object-fit:cover;">
              <div style="min-width:0;">
                <div style="font-size:0.72rem;color:var(--brand-pink);font-weight:800;">${Utils.sanitize(it.label)}</div>
                <div style="font-weight:700;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(it.title)}</div>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-select-quote="${idx}">Citar</button>
          </div>
        `).join('')}
      </div>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-select-quote]').forEach(btn => {
        btn.addEventListener('click', () => {
          pendingChatQuote = items[Number(btn.getAttribute('data-select-quote'))];
          UI.closeModal();
          if (typeof onPicked === 'function') onPicked();
        });
      });
    }
  });
}
