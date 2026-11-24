/**
 * ruma 🌟 — INTERFAZ 2: El Grupo (Recuerdos en Google Drive, Cine, Series, Música, Metas/Notas y Chat con Citas)
 * Acoplado con todas las funciones principales de LUMA para:
 * 1. Recuerdos (Calendario interactivo con festivos, planes a futuro, búsqueda/filtros, aura, nota de voz, canción vinculada, galería, comentarios).
 * 2. Películas (Métricas, filtros rápidos, ruleta aleatoria, prioridad 1-5★, estados Por ver/Vista/Favorita, ficha con tráiler, plataformas de streaming, fotogramas, recuerdos vinculados, hilo de comentarios con reacciones).
 * 3. Series (Métricas, filtros, plataforma, vista completa de maratón por temporadas, capítulos con miniatura/duración/sinopsis, "Visto" y "Visto hasta aquí" con confeti, bloqueo de nota hasta completar, comentarios con etiqueta T# · Cap #).
 * 4. Música (Métricas de duración/integrantes, filtros incluyendo por integrante y con recuerdos, reproductor flotante global con controles, letras completas LRCLIB, calificación 1-5★, recuerdos vinculados, hilo de comentarios).
 */

import confetti from 'canvas-confetti';
import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { MediaService } from '../services/media-api.js';
import { MusicService } from '../services/music-service.js';
import { MediaStorage } from '../services/media-storage.js';
import { UI } from '../components/ui.js';

let pendingChatQuote = null;

// Estado local de filtros y vistas acopladas desde LUMA
let memFilterState = {
  search: '',
  category: 'recent', // 'recent' | 'oldest' | 'featured' | 'photos' | 'videos' | 'songs' | 'audios'
  showCalendar: false,
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calSelectedDay: new Date().getDate()
};

let movieFilterState = 'all'; // 'all' | 'Por ver' | 'Vista' | 'Favorita' | 'my-proposals'
let seriesFilterState = 'all'; // 'all' | 'Viendo' | 'Por ver' | 'Completada' | 'my-proposals'
let activeSeriesDetailId = null;
let activeSeriesSeasonNum = 1;

let musicFilterState = {
  type: 'all', // 'all' | 'top-rated' | 'with-memories' | 'my-songs' | 'by-member'
  memberName: ''
};

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

  // Sincronizar playlist global con las canciones del grupo activo
  MusicService.setPlaylist(group.songs || []);

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
      const nextTab = btn.getAttribute('data-group-tab');
      if (nextTab !== 'series') activeSeriesDetailId = null;
      store.navigate('group', { groupTab: nextTab });
    });
  });

  const viewport = document.getElementById('group-tab-viewport');
  if (!viewport) return;

  if (tab === 'memories') renderMemoriesTab(viewport, group, user, isAdmin);
  else if (tab === 'movies') renderMoviesTab(viewport, group, user);
  else if (tab === 'series') renderSeriesTab(viewport, group, user);
  else if (tab === 'music') renderMusicTab(viewport, group, user);
  else if (tab === 'goals_notes') renderGoalsAndNotesTab(viewport, group);
  else if (tab === 'chat') renderChatTab(viewport, group, user);
}

// ============================================================================
// 1. PESTAÑA RECUERDOS (Puente Google Drive + Calendario LUMA + Álbumes + Voz + Música)
// ============================================================================
function getHolidaysForYear(year) {
  const y = parseInt(year, 10);
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easterDate = new Date(Date.UTC(y, month, day));

  const addDays = (dt, days) => {
    const res = new Date(dt.getTime());
    res.setUTCDate(res.getUTCDate() + days);
    return res;
  };
  const getNextMonday = (dt) => {
    const res = new Date(dt.getTime());
    const dow = res.getUTCDay();
    if (dow === 1) return res;
    const add = (8 - dow) % 7;
    res.setUTCDate(res.getUTCDate() + (add === 0 ? 7 : add));
    return res;
  };

  const raw = [
    { date: new Date(Date.UTC(y, 0, 1)), name: 'Año Nuevo' },
    { date: getNextMonday(new Date(Date.UTC(y, 0, 6))), name: 'Reyes Magos' },
    { date: getNextMonday(new Date(Date.UTC(y, 2, 19))), name: 'San José' },
    { date: addDays(easterDate, -3), name: 'Jueves Santo' },
    { date: addDays(easterDate, -2), name: 'Viernes Santo' },
    { date: new Date(Date.UTC(y, 4, 1)), name: 'Día del Trabajo' },
    { date: getNextMonday(addDays(easterDate, 39)), name: 'Ascensión' },
    { date: getNextMonday(addDays(easterDate, 60)), name: 'Corpus Christi' },
    { date: getNextMonday(addDays(easterDate, 68)), name: 'Sagrado Corazón' },
    { date: getNextMonday(new Date(Date.UTC(y, 5, 29))), name: 'San Pedro y San Pablo' },
    { date: new Date(Date.UTC(y, 6, 20)), name: 'Día de la Independencia' },
    { date: new Date(Date.UTC(y, 7, 7)), name: 'Batalla de Boyacá' },
    { date: getNextMonday(new Date(Date.UTC(y, 7, 15))), name: 'Asunción' },
    { date: getNextMonday(new Date(Date.UTC(y, 9, 12))), name: 'Día de la Raza' },
    { date: getNextMonday(new Date(Date.UTC(y, 10, 1))), name: 'Todos los Santos' },
    { date: getNextMonday(new Date(Date.UTC(y, 10, 11))), name: 'Independencia de Cartagena' },
    { date: new Date(Date.UTC(y, 11, 8)), name: 'Inmaculada Concepción' },
    { date: new Date(Date.UTC(y, 11, 25)), name: 'Navidad' }
  ];

  return raw.map(item => ({
    year: y,
    month: item.date.getUTCMonth(),
    day: item.date.getUTCDate(),
    name: item.name
  }));
}

function renderMemoriesTab(viewport, group, user, isAdmin) {
  const allMemories = group.memories || [];
  const plans = group.plans || [];
  let memories = [...allMemories];

  // Si venimos desde una canción o película que filtró recuerdos vinculados
  if (Array.isArray(store.memoryFilterIds) && store.memoryFilterIds.length > 0) {
    memories = memories.filter(m => store.memoryFilterIds.includes(m.id));
  }

  // Búsqueda en tiempo real
  const q = (memFilterState.search || '').trim().toLowerCase();
  if (q) {
    memories = memories.filter(m => {
      const inTitle = (m.title || '').toLowerCase().includes(q);
      const inDesc = (m.description || '').toLowerCase().includes(q);
      const inLoc = (m.location || '').toLowerCase().includes(q);
      const inAuthor = (m.authorName || '').toLowerCase().includes(q);
      const inSong = m.song ? `${m.song.title || ''} ${m.song.artist || ''}`.toLowerCase().includes(q) : false;
      const inComments = (m.comments || []).some(c => (c.text || '').toLowerCase().includes(q));
      return inTitle || inDesc || inLoc || inAuthor || inSong || inComments;
    });
  }

  // Filtro por categoría (heredado de LUMA)
  const cat = memFilterState.category;
  if (cat === 'featured') memories = memories.filter(m => m.isFeatured);
  else if (cat === 'photos') memories = memories.filter(m => (m.photos && m.photos.length > 0) || m.coverPreview);
  else if (cat === 'videos') memories = memories.filter(m => m.isVideo || (m.files || []).some(f => f.isVideo));
  else if (cat === 'songs') memories = memories.filter(m => m.song && m.song.title);
  else if (cat === 'audios') memories = memories.filter(m => Boolean(m.voiceNote));

  // Orden cronológico
  memories.sort((a, b) => {
    const tA = new Date(a.date || a.createdAt || 0).getTime();
    const tB = new Date(b.date || b.createdAt || 0).getTime();
    return cat === 'oldest' ? tA - tB : tB - tA;
  });

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <!-- Estado del Puente Google Drive -->
      <div class="ruma-card" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;background:var(--bg-elevated);">
        <div>
          <div style="font-weight:800;font-size:0.95rem;color:var(--brand-lilac-soft);">
            📂 Puente Google Drive del Grupo + Diario Emocional
          </div>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.2rem;">
            ${group.driveFolderUrl
              ? `Conectado a carpeta Drive. Cada carga crea la subcarpeta <code>[Nombre del Recuerdo - Fecha]</code> sin límite de peso.`
              : '⚠️ Aún no se ha vinculado una carpeta de Google Drive.'}
          </p>
        </div>
        <div style="display:flex;gap:0.55rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-mem-calendar">
            📅 ${memFilterState.showCalendar ? 'Ocultar Calendario' : 'Calendario & Planes'}
          </button>
          ${group.driveFolderUrl ? `
            <a href="${Utils.sanitize(group.driveFolderUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">↗ Abrir Drive</a>
          ` : ''}
          ${isAdmin ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-config-drive">⚙️ Configurar Drive</button>
          ` : ''}
          <button type="button" class="btn btn-primary btn-sm" id="btn-mem-upload">+ Inmortalizar Recuerdo</button>
        </div>
      </div>

      <!-- Calendario Mensual Interactivo de Recuerdos, Festivos y Planes (Acoplado de LUMA) -->
      ${memFilterState.showCalendar ? renderMemoriesCalendarHtml(allMemories, plans) : ''}

      <!-- Barra de Búsqueda en Tiempo Real y Filtros de Recuerdos -->
      <div class="ruma-card" style="padding:1rem 1.25rem;display:flex;flex-direction:column;gap:0.85rem;">
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
          <div style="flex:1;min-width:220px;position:relative;">
            <input type="text" id="mem-search-input" class="form-input" placeholder="🔍 Buscar recuerdo por título, historia, ubicación, canción o autor..." value="${Utils.sanitize(memFilterState.search)}">
          </div>
          <select id="mem-filter-select" class="form-select" style="width:auto;min-width:190px;">
            <option value="recent" ${cat === 'recent' ? 'selected' : ''}>🕒 Más recientes primero</option>
            <option value="oldest" ${cat === 'oldest' ? 'selected' : ''}>⏳ Más antiguos primero</option>
            <option value="featured" ${cat === 'featured' ? 'selected' : ''}>⭐ Solo Destacados</option>
            <option value="photos" ${cat === 'photos' ? 'selected' : ''}>📷 Con Fotos / Álbum</option>
            <option value="videos" ${cat === 'videos' ? 'selected' : ''}>🎬 Con Videos</option>
            <option value="songs" ${cat === 'songs' ? 'selected' : ''}>🎵 Con Banda Sonora</option>
            <option value="audios" ${cat === 'audios' ? 'selected' : ''}>🎙️ Con Nota de Voz</option>
          </select>
          ${store.memoryFilterIds ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-linked-mem-filter">✕ Quitar filtro vinculado</button>
          ` : ''}
        </div>
      </div>

      ${memories.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;">
          <div style="font-size:2.4rem;margin-bottom:0.5rem;">📸</div>
          <h3 style="font-family:var(--font-display);font-size:1.15rem;margin-bottom:0.35rem;">Ningún recuerdo encontrado</h3>
          <p style="color:var(--text-secondary);font-size:0.86rem;margin-bottom:1.1rem;">
            ${q ? 'Prueba con otra palabra clave en el buscador.' : '¡Inmortaliza el primer momento del grupo con fotos, videos, música y nota de voz!'}
          </p>
          <button type="button" class="btn btn-primary btn-sm" id="btn-empty-mem-upload">+ Inmortalizar Recuerdo</button>
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${memories.map(mem => {
            const aura = mem.auraColor || (mem.isFeatured ? '#F59E0B' : '#A855F7');
            const photosCount = (mem.photos && mem.photos.length) || mem.filesCount || 1;
            const commentsCount = (mem.comments && mem.comments.length) || 0;

            return `
              <div class="ruma-card" id="memory-card-${Utils.sanitize(mem.id)}" style="padding:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;border-color:${Utils.sanitize(aura)}55;box-shadow:0 8px 28px ${Utils.sanitize(aura)}18;">
                <div>
                  <div style="height:220px;background:#090414;position:relative;cursor:pointer;" data-open-memory="${Utils.sanitize(mem.id)}">
                    <img src="${Utils.sanitize(mem.coverPreview || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(mem.title)}" style="width:100%;height:100%;object-fit:cover;">
                    <span class="badge badge-admin" style="position:absolute;top:0.75rem;left:0.75rem;background:rgba(14,7,29,0.86);max-width:75%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      📁 ${Utils.sanitize(mem.subfolderName || Utils.buildDriveSubfolderName(mem.title, mem.date))}
                    </span>
                    <div style="position:absolute;top:0.75rem;right:0.75rem;display:flex;gap:0.35rem;">
                      ${mem.isFeatured ? `<span class="badge badge-premium">⭐ Destacado</span>` : ''}
                      <span class="badge" style="background:rgba(14,7,29,0.85);color:#fff;">
                        ${mem.isVideo ? '▶ Video' : `📷 ${photosCount}`}
                      </span>
                    </div>
                  </div>

                  <div style="padding:1.25rem;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.3rem;">
                      <span style="font-size:0.76rem;color:var(--brand-lilac);font-weight:700;">
                        📅 ${Utils.sanitize(Utils.formatFullSpanishDate(mem.date))}
                      </span>
                      ${mem.location ? `<span style="font-size:0.76rem;color:var(--text-muted);">📍 ${Utils.sanitize(mem.location)}</span>` : ''}
                    </div>
                    <h3 style="font-family:var(--font-display);font-size:1.22rem;margin-bottom:0.35rem;cursor:pointer;" data-open-memory="${Utils.sanitize(mem.id)}">
                      ${Utils.sanitize(mem.title)}
                    </h3>
                    <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.5;">
                      ${Utils.sanitize(mem.description || '')}
                    </p>

                    <!-- Banda Sonora del Recuerdo -->
                    ${mem.song && mem.song.title ? `
                      <div style="margin-top:0.75rem;padding:0.55rem 0.75rem;border-radius:var(--radius-sm);background:rgba(124,58,237,0.16);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
                        <div style="display:flex;align-items:center;gap:0.55rem;min-width:0;">
                          ${mem.song.artwork ? `<img src="${Utils.sanitize(mem.song.artwork)}" alt="art" style="width:32px;height:32px;border-radius:6px;object-fit:cover;">` : '<span>🎵</span>'}
                          <div style="min-width:0;">
                            <div style="font-weight:700;font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">🎵 ${Utils.sanitize(mem.song.title)}</div>
                            <div style="font-size:0.72rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(mem.song.artist || '')}</div>
                          </div>
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" data-play-mem-song="${Utils.sanitize(mem.id)}">▶</button>
                      </div>
                    ` : ''}

                    <!-- Nota de Voz del Recuerdo -->
                    ${mem.voiceNote ? `
                      <div style="margin-top:0.55rem;padding:0.5rem 0.75rem;border-radius:var(--radius-sm);background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.3);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
                        <span style="font-size:0.78rem;color:var(--brand-cyan);font-weight:700;">🎙️ Nota de voz del recuerdo</span>
                        <audio src="${Utils.sanitize(mem.voiceNote)}" controls style="height:28px;max-width:170px;"></audio>
                      </div>
                    ` : ''}
                  </div>
                </div>

                <div style="padding:0.85rem 1.25rem;border-top:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
                  <span style="font-size:0.76rem;color:var(--text-muted);">
                    Por <strong>${Utils.sanitize(mem.authorName || 'Miembro')}</strong>
                  </span>
                  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary btn-sm" data-open-memory="${Utils.sanitize(mem.id)}">
                      👁️ Ver Álbum & 💬 ${commentsCount}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-quote-memory="${Utils.sanitize(mem.id)}">💬 Citar</button>
                    ${mem.driveUrl ? `
                      <a href="${Utils.sanitize(mem.driveUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Drive ↗</a>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  // Eventos de cabecera y filtros
  document.getElementById('btn-mem-config-drive')?.addEventListener('click', () => store.navigate('settings'));
  document.getElementById('btn-mem-upload')?.addEventListener('click', () => openUploadMemoryModal(group));
  document.getElementById('btn-empty-mem-upload')?.addEventListener('click', () => openUploadMemoryModal(group));

  document.getElementById('btn-toggle-mem-calendar')?.addEventListener('click', () => {
    memFilterState.showCalendar = !memFilterState.showCalendar;
    renderMemoriesTab(viewport, group, user, isAdmin);
  });

  document.getElementById('btn-clear-linked-mem-filter')?.addEventListener('click', () => {
    store.memoryFilterIds = null;
    renderMemoriesTab(viewport, group, user, isAdmin);
  });

  const searchInp = document.getElementById('mem-search-input');
  searchInp?.addEventListener('input', (e) => {
    memFilterState.search = e.target.value;
    const pos = e.target.selectionStart;
    renderMemoriesTab(viewport, group, user, isAdmin);
    const newInp = document.getElementById('mem-search-input');
    if (newInp) {
      newInp.focus();
      try { newInp.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  document.getElementById('mem-filter-select')?.addEventListener('change', (e) => {
    memFilterState.category = e.target.value;
    renderMemoriesTab(viewport, group, user, isAdmin);
  });

  // Eventos del calendario interactivo
  if (memFilterState.showCalendar) {
    bindMemoriesCalendarEvents(viewport, group, user, isAdmin);
  }

  // Reproducir canción asociada al recuerdo
  viewport.querySelectorAll('[data-play-mem-song]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const mem = allMemories.find(m => m.id === btn.getAttribute('data-play-mem-song'));
      if (!mem || !mem.song) return;
      if (mem.song.previewUrl) {
        MusicService.playTrack(mem.song);
      } else {
        UI.showToast('Buscando preview oficial de 30s...', 'info');
        const results = await MusicService.searchSongs(`${mem.song.title} ${mem.song.artist || ''}`, 3);
        if (results.length > 0 && results[0].previewUrl) {
          mem.song.previewUrl = results[0].previewUrl;
          MusicService.playTrack(results[0]);
        } else {
          UI.showToast('Preview no disponible para esta canción.', 'info');
        }
      }
    });
  });

  // Abrir vista completa del recuerdo (Galería, Historia, Nota de voz, Comentarios)
  viewport.querySelectorAll('[data-open-memory]').forEach(el => {
    el.addEventListener('click', () => {
      const mem = allMemories.find(m => m.id === el.getAttribute('data-open-memory'));
      if (mem) openMemoryDetailModal(group, mem, user);
    });
  });

  // Citar en el chat
  viewport.querySelectorAll('[data-quote-memory]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mem = allMemories.find(m => m.id === btn.getAttribute('data-quote-memory'));
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

function renderMemoriesCalendarHtml(memories, plans) {
  const year = memFilterState.calYear;
  const month = memFilterState.calMonth;
  const selectedDay = memFilterState.calSelectedDay;
  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthFullNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const holidays = getHolidaysForYear(year);
  const firstDay = new Date(year, month, 1);
  const startDayIdx = (firstDay.getDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  let cellsHtml = '';
  for (let i = 0; i < startDayIdx; i++) {
    cellsHtml += `<div class="ruma-cal-day empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isSelected = d === selectedDay;
    const holiday = holidays.find(h => h.month === month && h.day === d);
    const dayMems = memories.filter(m => m.date === dateStr);
    const dayPlans = plans.filter(p => p.date === dateStr);

    cellsHtml += `
      <div class="ruma-cal-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-cal-day="${d}" title="${holiday ? '🎉 ' + Utils.sanitize(holiday.name) : ''}">
        <span>${d}</span>
        <div class="ruma-cal-dots">
          ${dayMems.length > 0 ? `<span class="ruma-cal-dot memory" title="${dayMems.length} recuerdo(s)"></span>` : ''}
          ${dayPlans.length > 0 ? `<span class="ruma-cal-dot plan" title="Plan agendado"></span>` : ''}
          ${holiday ? `<span class="ruma-cal-dot holiday" title="${Utils.sanitize(holiday.name)}"></span>` : ''}
        </div>
      </div>
    `;
  }

  const activeDay = Math.min(selectedDay, daysInMonth);
  const selectedDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(activeDay).padStart(2, '0')}`;
  const isFuture = selectedDateStr > todayStr;
  const activeHoliday = holidays.find(h => h.month === month && h.day === activeDay);
  const activeDayMems = memories.filter(m => m.date === selectedDateStr);
  const activeDayPlans = plans.filter(p => p.date === selectedDateStr);
  const monthHolidays = holidays.filter(h => h.month === month);

  return `
    <div class="ruma-card" style="display:flex;flex-direction:column;gap:1rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cal-prev">◀</button>
          <strong style="font-family:var(--font-display);font-size:1.15rem;">${monthFullNames[month]} ${year}</strong>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cal-next">▶</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cal-today">Hoy</button>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;font-size:0.75rem;color:var(--text-secondary);">
          <span>🟣 Recuerdo</span>
          <span>🔵 Plan futuro</span>
          <span>🟢 Festivo</span>
        </div>
      </div>

      <!-- Barra de 12 meses -->
      <div class="ruma-cal-months">
        ${monthNames.map((mName, idx) => {
          const hasMemInMonth = memories.some(m => {
            const dt = new Date(m.date || m.createdAt);
            return dt.getFullYear() === year && dt.getMonth() === idx;
          });
          return `
            <button type="button" class="ruma-cal-month-btn ${idx === month ? 'active' : ''}" data-cal-month="${idx}">
              <span>${mName}</span>
              ${hasMemInMonth ? `<span class="ruma-cal-dot memory"></span>` : ''}
            </button>
          `;
        }).join('')}
      </div>

      <div>
        <div class="ruma-cal-weekdays">
          <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
        </div>
        <div class="ruma-cal-grid">${cellsHtml}</div>
      </div>

      <!-- Barra de acción del día seleccionado -->
      <div style="padding:0.9rem 1.1rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
        <div>
          <div style="font-weight:800;font-size:0.92rem;">
            📅 ${Utils.sanitize(Utils.formatFullSpanishDate(selectedDateStr))}
            ${activeHoliday ? `<span class="badge" style="background:rgba(16,185,129,0.2);color:#34D399;margin-left:0.4rem;">🎉 ${Utils.sanitize(activeHoliday.name)}</span>` : ''}
          </div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;">
            ${activeDayMems.length > 0 ? `📸 ${activeDayMems.length} recuerdo(s) guardado(s). ` : ''}
            ${activeDayPlans.length > 0 ? `🗓️ Plan: ${activeDayPlans.map(p => `${Utils.sanitize(p.title)} (${Utils.sanitize(p.time || '')})`).join(', ')}` : (activeDayMems.length === 0 ? 'Sin eventos registrados en esta fecha.' : '')}
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          ${isFuture ? `
            <button type="button" class="btn btn-primary btn-sm" id="btn-cal-add-plan" data-date="${selectedDateStr}">+ Agendar Plan Futuro 🗓️</button>
          ` : `
            <button type="button" class="btn btn-primary btn-sm" id="btn-cal-add-mem" data-date="${selectedDateStr}">+ Añadir Recuerdo en esta Fecha 📸</button>
          `}
        </div>
      </div>

      ${monthHolidays.length > 0 ? `
        <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;font-size:0.75rem;color:var(--text-muted);">
          <strong>Festivos del mes:</strong>
          ${monthHolidays.map(h => `
            <span class="badge badge-free" style="cursor:pointer;" data-cal-day="${h.day}">🎉 ${h.day} ${monthNames[h.month]}: ${Utils.sanitize(h.name)}</span>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function bindMemoriesCalendarEvents(viewport, group, user, isAdmin) {
  document.getElementById('btn-cal-prev')?.addEventListener('click', () => {
    if (memFilterState.calMonth === 0) {
      memFilterState.calMonth = 11;
      memFilterState.calYear -= 1;
    } else {
      memFilterState.calMonth -= 1;
    }
    memFilterState.calSelectedDay = 1;
    renderMemoriesTab(viewport, group, user, isAdmin);
  });

  document.getElementById('btn-cal-next')?.addEventListener('click', () => {
    if (memFilterState.calMonth === 11) {
      memFilterState.calMonth = 0;
      memFilterState.calYear += 1;
    } else {
      memFilterState.calMonth += 1;
    }
    memFilterState.calSelectedDay = 1;
    renderMemoriesTab(viewport, group, user, isAdmin);
  });

  document.getElementById('btn-cal-today')?.addEventListener('click', () => {
    const now = new Date();
    memFilterState.calYear = now.getFullYear();
    memFilterState.calMonth = now.getMonth();
    memFilterState.calSelectedDay = now.getDate();
    renderMemoriesTab(viewport, group, user, isAdmin);
  });

  viewport.querySelectorAll('[data-cal-month]').forEach(btn => {
    btn.addEventListener('click', () => {
      memFilterState.calMonth = parseInt(btn.getAttribute('data-cal-month'), 10);
      memFilterState.calSelectedDay = 1;
      renderMemoriesTab(viewport, group, user, isAdmin);
    });
  });

  viewport.querySelectorAll('[data-cal-day]').forEach(el => {
    el.addEventListener('click', () => {
      const day = parseInt(el.getAttribute('data-cal-day'), 10);
      memFilterState.calSelectedDay = day;
      renderMemoriesTab(viewport, group, user, isAdmin);

      // Si hay un recuerdo ese día, desplazar suavemente hacia él
      const targetStr = `${memFilterState.calYear}-${String(memFilterState.calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const match = (group.memories || []).find(m => m.date === targetStr);
      if (match) {
        setTimeout(() => {
          document.getElementById(`memory-card-${match.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
      }
    });
  });

  document.getElementById('btn-cal-add-mem')?.addEventListener('click', (e) => {
    const dt = e.currentTarget.getAttribute('data-date');
    openUploadMemoryModal(group, null, dt);
  });

  document.getElementById('btn-cal-add-plan')?.addEventListener('click', (e) => {
    const dt = e.currentTarget.getAttribute('data-date');
    openAddPlanModal(dt, () => renderMemoriesTab(viewport, group, user, isAdmin));
  });
}

function openAddPlanModal(dateStr, onSaved) {
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

function openUploadMemoryModal(group, editingMemory = null, prefillDate = null) {
  const today = prefillDate || editingMemory?.date || new Date().toISOString().split('T')[0];
  const sampleFolder = Utils.buildDriveSubfolderName(editingMemory?.title || 'Mi Recuerdo', today);
  let selectedSong = editingMemory?.song || null;
  let recordedVoiceDataUrl = editingMemory?.voiceNote || null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;

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

        <div style="background:var(--bg-elevated);padding:0.75rem 0.9rem;border-radius:var(--radius-sm);margin-bottom:1rem;font-size:0.8rem;color:var(--brand-lilac-soft);">
          📁 Subcarpeta que se creará en Google Drive:<br>
          <strong id="mem-folder-preview">${Utils.sanitize(sampleFolder)}</strong>
        </div>

        <div class="form-group">
          <label class="form-label">Fotos o Videos del Álbum (Sin límite de peso en MB/GB)</label>
          <input type="file" id="mem-files" class="form-input" accept="image/*,video/*" multiple>
        </div>

        <div class="form-group">
          <label class="form-label">Historia / Descripción del Momento</label>
          <textarea id="mem-desc" class="form-textarea" rows="3" placeholder="¿Qué hizo especial este momento?">${Utils.sanitize(editingMemory?.description || '')}</textarea>
        </div>

        <!-- Selector de Banda Sonora (Acoplado de LUMA) -->
        <div class="form-group">
          <label class="form-label">🎵 Banda Sonora del Recuerdo (Opcional)</label>
          <div style="display:flex;gap:0.5rem;">
            <input type="text" id="mem-song-query" class="form-input" placeholder="Buscar canción en iTunes para este recuerdo...">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-mem-search-song">Buscar</button>
          </div>
          <div id="mem-song-selected" style="margin-top:0.45rem;font-size:0.82rem;color:var(--brand-lilac-soft);">
            ${selectedSong ? `🎵 Seleccionada: <strong>${Utils.sanitize(selectedSong.title)}</strong> - ${Utils.sanitize(selectedSong.artist)}` : ''}
          </div>
          <div id="mem-song-results" style="display:flex;flex-direction:column;gap:0.35rem;margin-top:0.45rem;max-height:150px;overflow-y:auto;"></div>
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

        <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-mem">Cancelar</button>
          <button type="submit" class="btn btn-primary">${editingMemory ? 'Guardar Cambios' : 'Subir y Guardar en Caché'}</button>
        </div>
      </form>
    `,
    onMount: (modalEl) => {
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

      modalEl.querySelectorAll('.aura-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedAura = btn.getAttribute('data-aura');
          modalEl.querySelectorAll('.aura-pick-btn').forEach(b => {
            b.style.border = b === btn ? '3px solid #fff' : '1px solid transparent';
          });
        });
      });

      // Buscar canción para el recuerdo
      document.getElementById('btn-mem-search-song')?.addEventListener('click', async () => {
        const q = document.getElementById('mem-song-query')?.value.trim();
        const resBox = document.getElementById('mem-song-results');
        if (!q || !resBox) return;
        resBox.innerHTML = `<div style="font-size:0.78rem;color:var(--brand-lilac);">Buscando canciones...</div>`;
        const tracks = await MusicService.searchSongs(q, 5);
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
      });

      // Grabadora de voz real con MediaRecorder
      const recordBtn = document.getElementById('btn-mem-record-voice');
      const voiceStatus = document.getElementById('mem-voice-status');
      recordBtn?.addEventListener('click', async () => {
        if (!isRecording) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
              const blob = new Blob(audioChunks, { type: 'audio/webm' });
              const reader = new FileReader();
              reader.onloadend = () => {
                recordedVoiceDataUrl = reader.result;
                if (voiceStatus) voiceStatus.textContent = '✅ Nota de voz grabada con éxito';
              };
              reader.readAsDataURL(blob);
              stream.getTracks().forEach(t => t.stop());
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
          existingPhotos: editingMemory?.photos || (editingMemory?.coverPreview ? [editingMemory.coverPreview] : [])
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
        UI.showToast(`Recuerdo "${res.memory.subfolderName}" guardado 📂✨`, 'success');
      });
    }
  });
}

async function openMemoryDetailModal(group, mem, user) {
  const photos = [...(mem.photos || [])];
  if (photos.length === 0 && mem.coverPreview) photos.push(mem.coverPreview);

  // Resolver archivos binarios guardados en IndexedDB si los hay
  const resolvedMedia = [];
  for (const fileMeta of (mem.files || [])) {
    const objUrl = await MediaStorage.getObjectUrl(fileMeta.id);
    if (objUrl) {
      resolvedMedia.push({ url: objUrl, isVideo: Boolean(fileMeta.isVideo), name: fileMeta.name });
    } else if (fileMeta.thumbnail) {
      resolvedMedia.push({ url: fileMeta.thumbnail, isVideo: false, name: fileMeta.name });
    }
  }
  if (resolvedMedia.length === 0) {
    photos.forEach((p, idx) => resolvedMedia.push({ url: p, isVideo: false, name: `Foto ${idx + 1}` }));
  }

  const comments = mem.comments || [];

  UI.openModal({
    title: `📸 ${mem.title}`,
    size: 'lg',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:1.15rem;">
        <!-- Portada principal -->
        <div style="position:relative;height:260px;border-radius:var(--radius-lg);overflow:hidden;background:#070312;">
          <img src="${Utils.sanitize(mem.coverPreview || photos[0] || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(mem.title)}" style="width:100%;height:100%;object-fit:cover;cursor:pointer;" id="mem-detail-hero-img">
          <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(9,3,20,0.92), transparent 60%);display:flex;flex-direction:column;justify-content:flex-end;padding:1.25rem;">
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
            ${mem.driveUrl ? `<a href="${Utils.sanitize(mem.driveUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">📁 Carpeta Drive ↗</a>` : ''}
            <button type="button" class="btn btn-danger btn-sm" id="btn-mem-detail-delete">🗑️</button>
          </div>
        </div>

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
                    ? `<video src="${Utils.sanitize(item.url)}" style="width:100%;height:100%;object-fit:cover;"></video><span class="badge badge-admin" style="position:absolute;bottom:4px;right:4px;">▶</span>`
                    : `<img src="${Utils.sanitize(item.url)}" alt="media" style="width:100%;height:100%;object-fit:cover;">`
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
    onMount: (modalEl) => {
      document.getElementById('mem-detail-hero-img')?.addEventListener('click', () => {
        UI.openLightbox(mem.coverPreview || photos[0], false, mem.title);
      });

      modalEl.querySelectorAll('[data-lightbox-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const item = resolvedMedia[Number(el.getAttribute('data-lightbox-idx'))];
          if (item) UI.openLightbox(item.url, item.isVideo, item.name);
        });
      });

      document.getElementById('btn-mem-detail-feature')?.addEventListener('click', () => {
        store.toggleMemoryFeatured(mem.id);
        UI.closeModal();
        const updated = (store.getActiveGroup()?.memories || []).find(m => m.id === mem.id);
        if (updated) openMemoryDetailModal(store.getActiveGroup(), updated, user);
      });

      document.getElementById('btn-mem-detail-edit')?.addEventListener('click', () => {
        UI.closeModal();
        openUploadMemoryModal(group, mem);
      });

      document.getElementById('btn-mem-detail-delete')?.addEventListener('click', () => {
        store.deleteMemoryFromActiveGroup(mem.id);
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

// ============================================================================
// 2. PESTAÑA PELÍCULAS (Cartelera Colaborativa LUMA + Ruleta + Ficha + Dónde Ver + Comentarios)
// ============================================================================
function renderMoviesTab(viewport, group, user) {
  const allMovies = group.movies || [];
  const allMemories = group.memories || [];
  const check = Entitlements.canAddMediaItem(group, 'movies');
  const maxStr = check.max === Infinity ? 'Ilimitadas ✨' : `${allMovies.length} / ${check.max}`;

  const watchedCount = allMovies.filter(m => m.status === 'Vista' || m.status === 'Favorita').length;
  const pendingCount = allMovies.filter(m => (m.status || 'Por ver') === 'Por ver').length;

  let movies = [...allMovies];
  if (movieFilterState === 'Por ver' || movieFilterState === 'Vista' || movieFilterState === 'Favorita') {
    movies = movies.filter(m => (m.status || 'Por ver') === movieFilterState);
  } else if (movieFilterState === 'my-proposals') {
    movies = movies.filter(m => m.proposedBy?.id === user.id || m.addedBy === user.name);
  }

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <!-- Cabecera y Métricas de Cartelera -->
      <div class="ruma-card" style="display:flex;flex-direction:column;gap:1rem;background:var(--bg-elevated);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:1.35rem;">🎬 Cartelera Colaborativa de Películas</h2>
            <p style="font-size:0.84rem;color:var(--text-secondary);">
              Descubre en TMDb, consulta en qué plataforma verlas, califica de 1 a 10 y muéstralas en tu <strong>Perfil estilo Discord</strong>.
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;">
            <span class="badge ${check.allowed ? 'badge-limit' : 'badge-premium'}">Cupo: ${maxStr}</span>
            ${pendingCount > 0 ? `
              <button type="button" class="btn btn-secondary btn-sm" id="btn-movie-roulette">🎲 Ruleta ¿Qué vemos hoy?</button>
            ` : ''}
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-movie">+ Añadir Película (TMDb)</button>
          </div>
        </div>

        <!-- Métricas del Hero (Estilo LUMA) -->
        <div class="ruma-stats-bar">
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${allMovies.length}</span>
            <span class="ruma-stat-label">En Cartelera</span>
          </div>
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${watchedCount}</span>
            <span class="ruma-stat-label">🍿 Vistas / Favoritas</span>
          </div>
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${pendingCount}</span>
            <span class="ruma-stat-label">🌱 Por Ver</span>
          </div>
        </div>

        <!-- Chips de Filtrado Rápido -->
        <div class="ruma-filter-chips">
          ${[
            { id: 'all', label: 'Todas' },
            { id: 'Por ver', label: '🌱 Por ver' },
            { id: 'Vista', label: '🍿 Vistas' },
            { id: 'Favorita', label: '❤️ Favoritas' },
            { id: 'my-proposals', label: '👤 Mis propuestas' }
          ].map(f => `
            <button type="button" class="ruma-chip ${movieFilterState === f.id ? 'active' : ''}" data-movie-filter="${f.id}">
              ${f.label}
            </button>
          `).join('')}
        </div>
      </div>

      ${movies.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
          No hay películas en este filtro todavía. ¡Busca una en TMDb para armar el plan de cine!
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${movies.map(movie => {
            const ratingsObj = movie.ratings || {};
            const ratingEntries = Object.entries(ratingsObj);
            const avg = ratingEntries.length > 0
              ? (ratingEntries.reduce((acc, [, r]) => acc + Number(r.score || 0), 0) / ratingEntries.length).toFixed(1)
              : (movie.tmdbRating || 'Sin nota');
            const myRating = ratingsObj[user.id];
            const status = movie.status || 'Por ver';
            const statusIcon = status === 'Favorita' ? '❤️ Favorita' : (status === 'Vista' ? '🍿 Vista' : '🌱 Por ver');
            const prio = Math.min(5, Math.max(1, Number(movie.priority) || 5));
            const prioStars = '★'.repeat(prio) + '☆'.repeat(5 - prio);
            const commentsCount = (movie.comments && movie.comments.length) || 0;
            const linkedMems = (movie.linkedMemories || []).map(id => allMemories.find(m => m.id === id)).filter(Boolean);

            return `
              <div class="ruma-card" style="display:flex;gap:1.15rem;flex-wrap:wrap;">
                <div style="position:relative;width:118px;height:176px;flex-shrink:0;cursor:pointer;" data-open-movie="${Utils.sanitize(movie.id)}">
                  <img src="${Utils.sanitize(movie.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:100%;height:100%;border-radius:var(--radius-md);object-fit:cover;">
                  ${movie.tmdbRating ? `
                    <span class="badge" style="position:absolute;bottom:6px;left:6px;background:rgba(14,7,29,0.88);color:var(--brand-gold);font-size:0.7rem;">
                      ⭐ TMDb ${Utils.sanitize(movie.tmdbRating)}
                    </span>
                  ` : ''}
                </div>

                <div style="flex:1;min-width:210px;display:flex;flex-direction:column;justify-content:space-between;gap:0.75rem;">
                  <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.4rem;flex-wrap:wrap;">
                      <button type="button" class="badge badge-admin" style="cursor:pointer;" data-cycle-movie-status="${Utils.sanitize(movie.id)}" title="Toca para alternar Por ver / Vista / Favorita">
                        ${statusIcon} ↻
                      </button>
                      <span class="badge badge-premium">⭐ Grupo: ${avg}</span>
                    </div>

                    <h3 style="font-family:var(--font-display);font-size:1.22rem;margin-top:0.45rem;cursor:pointer;" data-open-movie="${Utils.sanitize(movie.id)}">
                      ${Utils.sanitize(movie.title)}
                    </h3>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.15rem;">
                      ${Utils.sanitize(movie.year || '')} ${movie.duration ? `• ${Utils.sanitize(movie.duration)}` : ''} • ${Utils.sanitize(movie.genres || 'Cine')}
                    </div>
                    <div style="font-size:0.75rem;color:var(--brand-gold);margin-top:0.2rem;" title="Prioridad para ver">
                      Prioridad: ${prioStars} · Propuesta por <strong>${Utils.sanitize(movie.proposedBy?.name || movie.addedBy || 'Miembro')}</strong>
                    </div>

                    <!-- Desglose de calificaciones y reseñas por integrante -->
                    <div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.35rem;">
                      ${ratingEntries.length === 0 ? `
                        <div style="font-size:0.78rem;color:var(--text-muted);">Sin calificaciones del grupo aún.</div>
                      ` : ratingEntries.map(([uid, r]) => {
                        const member = (group.members || []).find(m => m.id === uid);
                        return `
                          <div style="background:var(--bg-elevated);padding:0.4rem 0.65rem;border-radius:var(--radius-xs);font-size:0.78rem;">
                            <strong>${Utils.sanitize(member?.name || 'Miembro')}:</strong>
                            <span style="color:var(--brand-gold);font-weight:700;"> ⭐ ${Number(r.score).toFixed(1)}</span>
                            ${r.review ? `<div style="color:var(--text-secondary);margin-top:0.1rem;">“${Utils.sanitize(r.review)}”</div>` : ''}
                          </div>
                        `;
                      }).join('')}
                    </div>

                    ${linkedMems.length > 0 ? `
                      <div style="margin-top:0.5rem;">
                        <button type="button" class="badge badge-free" style="cursor:pointer;" data-jump-linked-mems="${Utils.sanitize(movie.linkedMemories.join(','))}">
                          📸 Vinculada a ${linkedMems.length} recuerdo(s) ›
                        </button>
                      </div>
                    ` : ''}
                  </div>

                  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary btn-sm" data-open-movie="${Utils.sanitize(movie.id)}">
                      🎬 Ficha & Dónde Ver
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" data-rate-movie="${Utils.sanitize(movie.id)}">
                      ⭐ ${myRating ? `${myRating.score}` : 'Calificar'}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-comments-movie="${Utils.sanitize(movie.id)}">
                      💬 ${commentsCount}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-quote-movie="${Utils.sanitize(movie.id)}">↩</button>
                    <button type="button" class="btn btn-danger btn-sm" data-delete-movie="${Utils.sanitize(movie.id)}">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  // Filtros
  viewport.querySelectorAll('[data-movie-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      movieFilterState = btn.getAttribute('data-movie-filter');
      renderMoviesTab(viewport, group, user);
    });
  });

  // Ruleta aleatoria para decidir qué película "Por ver" elegir
  document.getElementById('btn-movie-roulette')?.addEventListener('click', () => {
    const candidates = allMovies.filter(m => (m.status || 'Por ver') === 'Por ver');
    if (candidates.length === 0) return;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    try { confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } }); } catch (_) {}
    UI.showToast(`🎲 ¡La ruleta eligió "${picked.title}" para ver hoy! 🍿`, 'success');
    openMovieDetailModal(group, picked, user);
  });

  // Añadir película
  document.getElementById('btn-add-movie')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openSearchTmdbModal(group, 'movies');
  });

  // Alternar estado Por ver / Vista / Favorita
  viewport.querySelectorAll('[data-cycle-movie-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const newSt = store.cycleMovieStatus(btn.getAttribute('data-cycle-movie-status'));
      UI.showToast(`Estado actualizado a: ${newSt} 🍿`, 'info');
    });
  });

  // Abrir ficha completa de la película (Tráiler, Dónde ver, Fotogramas, Sinopsis)
  viewport.querySelectorAll('[data-open-movie]').forEach(el => {
    el.addEventListener('click', () => {
      const movie = allMovies.find(m => m.id === el.getAttribute('data-open-movie'));
      if (movie) openMovieDetailModal(group, movie, user);
    });
  });

  // Calificar
  viewport.querySelectorAll('[data-rate-movie]').forEach(btn => {
    btn.addEventListener('click', () => {
      const movie = allMovies.find(m => m.id === btn.getAttribute('data-rate-movie'));
      if (movie) openRateModal('movies', movie, user);
    });
  });

  // Hilo de comentarios y reacciones
  viewport.querySelectorAll('[data-comments-movie]').forEach(btn => {
    btn.addEventListener('click', () => {
      const movie = allMovies.find(m => m.id === btn.getAttribute('data-comments-movie'));
      if (movie) openMediaCommentsModal('movies', movie);
    });
  });

  // Saltar a recuerdos vinculados
  viewport.querySelectorAll('[data-jump-linked-mems]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ids = btn.getAttribute('data-jump-linked-mems').split(',').filter(Boolean);
      store.navigate('group', { groupTab: 'memories', memoryFilterIds: ids });
    });
  });

  // Citar en chat
  viewport.querySelectorAll('[data-quote-movie]').forEach(btn => {
    btn.addEventListener('click', () => {
      const movie = allMovies.find(m => m.id === btn.getAttribute('data-quote-movie'));
      if (!movie) return;
      pendingChatQuote = {
        type: 'movie',
        itemId: movie.id,
        label: '🎬 Película',
        title: `${movie.title} (${movie.year || ''})`,
        subtitle: `Estado: ${movie.status || 'Por ver'}`,
        thumb: movie.poster || 'assets/ruma_icon_512.png'
      };
      store.navigate('group', { groupTab: 'chat' });
    });
  });

  // Eliminar
  viewport.querySelectorAll('[data-delete-movie]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.deleteMediaItem('movies', btn.getAttribute('data-delete-movie'));
      UI.showToast('Película eliminada de la cartelera.', 'info');
    });
  });
}

async function openMovieDetailModal(group, movie, user) {
  // Enriquecer detalles y plataformas en vivo desde TMDb si tiene tmdbId
  if (movie.tmdbId && (!movie.gallery || !movie.trailerUrl || !movie.synopsis)) {
    const details = await MediaService.getMovieDetails(movie.tmdbId);
    if (details) {
      store.updateMediaItem('movies', movie.id, {
        duration: movie.duration || details.duration,
        genres: movie.genres || details.genres,
        synopsis: movie.synopsis || details.overview,
        backdrop: movie.backdrop || details.backdrop,
        gallery: details.gallery || [],
        trailerUrl: details.trailerUrl || movie.trailerUrl || ''
      });
      Object.assign(movie, {
        duration: movie.duration || details.duration,
        genres: movie.genres || details.genres,
        synopsis: movie.synopsis || details.overview,
        backdrop: movie.backdrop || details.backdrop,
        gallery: details.gallery || [],
        trailerUrl: details.trailerUrl || movie.trailerUrl || ''
      });
    }
  }

  const providersData = movie.tmdbId ? await MediaService.getMovieWatchProviders(movie.tmdbId) : null;
  const trailerLink = movie.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' trailer oficial')}`;
  const q = encodeURIComponent(movie.title);

  UI.openModal({
    title: `🎬 ${movie.title} (${movie.year || ''})`,
    size: 'lg',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:1.15rem;">
        <!-- Cabecera con Backdrop y Póster -->
        <div style="display:flex;gap:1.15rem;flex-wrap:wrap;padding:1.1rem;border-radius:var(--radius-lg);background:linear-gradient(135deg, rgba(18,7,38,0.92), rgba(35,17,71,0.85));border:1px solid var(--border-subtle);">
          <img src="${Utils.sanitize(movie.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:120px;height:180px;border-radius:var(--radius-md);object-fit:cover;flex-shrink:0;">
          <div style="flex:1;min-width:200px;display:flex;flex-direction:column;justify-content:space-between;gap:0.65rem;">
            <div>
              <div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.4rem;">
                <span class="badge badge-admin">${Utils.sanitize(movie.status || 'Por ver')}</span>
                <span class="badge badge-premium">⭐ TMDb ${Utils.sanitize(movie.tmdbRating || '8.5')}</span>
                ${movie.duration ? `<span class="badge badge-free">⏱ ${Utils.sanitize(movie.duration)}</span>` : ''}
              </div>
              <h2 style="font-family:var(--font-display);font-size:1.4rem;">${Utils.sanitize(movie.title)}</h2>
              <div style="font-size:0.82rem;color:var(--brand-lilac);margin-top:0.2rem;">${Utils.sanitize(movie.genres || 'Cine')}</div>
              <p style="font-size:0.86rem;color:var(--text-secondary);margin-top:0.55rem;line-height:1.5;">
                ${Utils.sanitize(movie.synopsis || 'Sin sinopsis disponible.')}
              </p>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <a href="${Utils.sanitize(trailerLink)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">▶ Ver Tráiler en YouTube</a>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-rate-movie">⭐ Calificar / Reseñar</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-comments-movie">💬 Comentarios (${(movie.comments || []).length})</button>
            </div>
          </div>
        </div>

        <!-- Plataformas de Streaming: ¿Dónde Ver? (Acoplado de LUMA) -->
        <div style="padding:1rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.65rem;">
            <strong style="font-size:0.88rem;color:var(--brand-lilac-soft);">📺 ¿Dónde ver "${Utils.sanitize(movie.title)}"?</strong>
            ${providersData?.country ? `<span class="badge badge-free">Región: ${Utils.sanitize(providersData.country)}</span>` : ''}
          </div>
          ${providersData && providersData.providers && providersData.providers.length > 0 ? `
            <div style="display:flex;gap:0.6rem;flex-wrap:wrap;margin-bottom:0.75rem;">
              ${providersData.providers.map(p => `
                <a href="${Utils.sanitize(providersData.link || `https://www.google.com/search?q=donde+ver+${q}`)}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:0.45rem;padding:0.4rem 0.7rem;background:rgba(18,7,38,0.85);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);text-decoration:none;color:var(--text-main);font-size:0.78rem;">
                  ${p.logo ? `<img src="${Utils.sanitize(p.logo)}" alt="${Utils.sanitize(p.name)}" style="width:24px;height:24px;border-radius:6px;">` : ''}
                  <div>
                    <div style="font-weight:700;">${Utils.sanitize(p.name)}</div>
                    <div style="font-size:0.68rem;color:var(--text-muted);">${Utils.sanitize(p.type)}</div>
                  </div>
                </a>
              `).join('')}
            </div>
          ` : ''}
          <!-- Accesos directos a plataformas principales -->
          <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
            <a href="https://www.netflix.com/search?q=${q}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🍿 Netflix</a>
            <a href="https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">📦 Prime Video</a>
            <a href="https://www.disneyplus.com/search?q=${q}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🏰 Disney+</a>
            <a href="https://www.max.com/search?q=${q}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">⚡ Max</a>
            <a href="https://tv.apple.com/search?term=${q}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">🍏 Apple TV</a>
          </div>
        </div>

        <!-- Galería de Fotogramas Oficiales TMDb -->
        ${movie.gallery && movie.gallery.length > 0 ? `
          <div>
            <div style="font-size:0.84rem;font-weight:800;margin-bottom:0.5rem;color:var(--brand-lilac-soft);">🖼️ Fotogramas Oficiales</div>
            <div style="display:flex;gap:0.6rem;overflow-x:auto;padding-bottom:0.35rem;">
              ${movie.gallery.map(img => `
                <img src="${Utils.sanitize(img)}" alt="Fotograma" style="height:105px;border-radius:var(--radius-sm);object-fit:cover;cursor:pointer;" data-movie-still="${Utils.sanitize(img)}">
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `,
    onMount: (modalEl) => {
      document.getElementById('btn-modal-rate-movie')?.addEventListener('click', () => {
        UI.closeModal();
        openRateModal('movies', movie, user);
      });
      document.getElementById('btn-modal-comments-movie')?.addEventListener('click', () => {
        UI.closeModal();
        openMediaCommentsModal('movies', movie);
      });
      modalEl.querySelectorAll('[data-movie-still]').forEach(img => {
        img.addEventListener('click', () => {
          UI.openLightbox(img.getAttribute('data-movie-still'), false, movie.title);
        });
      });
    }
  });
}

// ============================================================================
// 3. PESTAÑA SERIES (Centro de Maratones LUMA + Temporadas + Capítulos + Visto hasta aquí)
// ============================================================================
function renderSeriesTab(viewport, group, user) {
  const allSeries = group.series || [];

  // Si el usuario abrió una serie para ver sus temporadas y episodios
  if (activeSeriesDetailId) {
    const activeSeries = allSeries.find(s => s.id === activeSeriesDetailId);
    if (activeSeries) {
      renderSeriesDetailView(viewport, group, activeSeries, user);
      return;
    }
    activeSeriesDetailId = null;
  }

  const check = Entitlements.canAddMediaItem(group, 'series');
  const maxStr = check.max === Infinity ? 'Ilimitadas ✨' : `${allSeries.length} / ${check.max}`;

  const watchingCount = allSeries.filter(s => s.status === 'Viendo').length;
  const completedCount = allSeries.filter(s => s.status === 'Completada' || store.isSeriesCompletedByUser(s, user.id)).length;

  let seriesList = [...allSeries];
  if (seriesFilterState === 'Viendo' || seriesFilterState === 'Por ver' || seriesFilterState === 'Completada') {
    seriesList = seriesList.filter(s => {
      if (seriesFilterState === 'Completada') return s.status === 'Completada' || store.isSeriesCompletedByUser(s, user.id);
      return (s.status || 'Por ver') === seriesFilterState;
    });
  } else if (seriesFilterState === 'my-proposals') {
    seriesList = seriesList.filter(s => s.proposedBy?.id === user.id || s.addedBy === user.name);
  }

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <!-- Cabecera y Métricas de Maratones -->
      <div class="ruma-card" style="display:flex;flex-direction:column;gap:1rem;background:var(--bg-elevated);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:1.35rem;">📺 Centro de Maratones de Series</h2>
            <p style="font-size:0.84rem;color:var(--text-secondary);">
              Lleva el progreso capítulo a capítulo por temporada con tu grupo. La calificación final se desbloquea al completar la serie.
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:0.65rem;">
            <span class="badge ${check.allowed ? 'badge-limit' : 'badge-premium'}">Cupo: ${maxStr}</span>
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-series">+ Añadir Serie (TMDb)</button>
          </div>
        </div>

        <div class="ruma-stats-bar">
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${allSeries.length}</span>
            <span class="ruma-stat-label">Total Series</span>
          </div>
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${watchingCount}</span>
            <span class="ruma-stat-label">📺 Viendo Ahora</span>
          </div>
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${completedCount}</span>
            <span class="ruma-stat-label">🏆 Completadas</span>
          </div>
        </div>

        <div class="ruma-filter-chips">
          ${[
            { id: 'all', label: 'Todas' },
            { id: 'Viendo', label: '📺 Viendo' },
            { id: 'Por ver', label: '🌱 Por ver' },
            { id: 'Completada', label: '🏆 Completadas' },
            { id: 'my-proposals', label: '👤 Mis propuestas' }
          ].map(f => `
            <button type="button" class="ruma-chip ${seriesFilterState === f.id ? 'active' : ''}" data-series-filter="${f.id}">
              ${f.label}
            </button>
          `).join('')}
        </div>
      </div>

      ${seriesList.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
          No hay series en esta categoría. ¡Busca una en TMDb para empezar una maratón grupal!
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${seriesList.map(ser => {
            const seasons = ser.seasons || [{ seasonNumber: 1, episodeCount: 10 }];
            const totalEps = seasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0) || 10;
            const myProg = ser.userProgress?.[user.id] || {};
            const curSeason = myProg.currentSeason || ser.currentSeason || 1;
            const curEp = myProg.currentEpisode || ser.currentEpisode || 1;
            const watchedCountUser = Object.keys(myProg.watchedEpisodes || {}).length;
            const pct = Math.min(100, Math.round((watchedCountUser / totalEps) * 100));
            const isCompleted = store.isSeriesCompletedByUser(ser, user.id);

            const ratingsObj = ser.ratings || {};
            const ratingEntries = Object.entries(ratingsObj);
            const avg = ratingEntries.length > 0
              ? (ratingEntries.reduce((acc, [, r]) => acc + Number(r.score || 0), 0) / ratingEntries.length).toFixed(1)
              : '9.2';
            const myRating = ratingsObj[user.id];
            const watchers = Object.values(ser.userProgress || {});
            const commentsCount = (ser.comments && ser.comments.length) || 0;

            return `
              <div class="ruma-card" style="display:flex;gap:1.15rem;flex-wrap:wrap;">
                <div style="position:relative;width:118px;height:176px;flex-shrink:0;cursor:pointer;" data-open-series="${Utils.sanitize(ser.id)}">
                  <img src="${Utils.sanitize(ser.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:100%;height:100%;border-radius:var(--radius-md);object-fit:cover;">
                  <span class="badge badge-admin" style="position:absolute;top:6px;left:6px;background:rgba(14,7,29,0.9);">
                    ${Utils.sanitize(ser.platform || 'Streaming')}
                  </span>
                </div>

                <div style="flex:1;min-width:210px;display:flex;flex-direction:column;justify-content:space-between;gap:0.75rem;">
                  <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.4rem;">
                      <span class="badge ${isCompleted ? 'badge-premium' : 'badge-admin'}">
                        ${isCompleted ? '🏆 Completada' : Utils.sanitize(ser.status || 'Viendo')}
                      </span>
                      <span class="badge badge-premium">⭐ Grupo: ${avg}</span>
                    </div>

                    <h3 style="font-family:var(--font-display);font-size:1.22rem;margin-top:0.4rem;cursor:pointer;" data-open-series="${Utils.sanitize(ser.id)}">
                      ${Utils.sanitize(ser.title)}
                    </h3>
                    <div style="font-size:0.78rem;color:var(--text-muted);">
                      ${Utils.sanitize(ser.years || ser.year || '')} • ${seasons.length} temp. • ${totalEps} capítulos
                    </div>

                    <!-- Barra de Progreso del Maratón -->
                    <div style="margin-top:0.65rem;background:var(--bg-elevated);padding:0.55rem 0.75rem;border-radius:var(--radius-sm);">
                      <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:0.35rem;">
                        <span>Tu avance: <strong>T${curSeason} · Cap ${curEp}</strong></span>
                        <span style="color:var(--brand-lilac);font-weight:800;">${pct}% visto</span>
                      </div>
                      <div class="ruma-progress-track">
                        <div class="ruma-progress-fill" style="width:${pct}%;"></div>
                      </div>
                    </div>

                    <!-- Integrantes viendo la serie -->
                    ${watchers.length > 0 ? `
                      <div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.55rem;flex-wrap:wrap;">
                        <span style="font-size:0.74rem;color:var(--text-muted);">Viendo:</span>
                        ${watchers.map(w => `
                          <span class="badge badge-free" style="font-size:0.7rem;">
                            ${Utils.sanitize(w.userName)}: T${w.currentSeason || 1}·C${w.currentEpisode || 1}
                          </span>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>

                  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <button type="button" class="btn btn-primary btn-sm" data-open-series="${Utils.sanitize(ser.id)}">
                      ▶ Capítulos & Maratón
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-rate-series="${Utils.sanitize(ser.id)}">
                      ${isCompleted ? `⭐ ${myRating ? myRating.score : 'Calificar'}` : '🔒 Calificar'}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-open-series="${Utils.sanitize(ser.id)}">
                      💬 ${commentsCount}
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" data-quote-series="${Utils.sanitize(ser.id)}">↩</button>
                    <button type="button" class="btn btn-danger btn-sm" data-delete-series="${Utils.sanitize(ser.id)}">🗑️</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  viewport.querySelectorAll('[data-series-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      seriesFilterState = btn.getAttribute('data-series-filter');
      renderSeriesTab(viewport, group, user);
    });
  });

  document.getElementById('btn-add-series')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openSearchTmdbModal(group, 'series');
  });

  viewport.querySelectorAll('[data-open-series]').forEach(el => {
    el.addEventListener('click', () => {
      const ser = allSeries.find(s => s.id === el.getAttribute('data-open-series'));
      if (!ser) return;
      activeSeriesDetailId = ser.id;
      const myProg = ser.userProgress?.[user.id];
      activeSeriesSeasonNum = myProg?.currentSeason || 1;
      renderSeriesTab(viewport, group, user);
    });
  });

  viewport.querySelectorAll('[data-rate-series]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ser = allSeries.find(s => s.id === btn.getAttribute('data-rate-series'));
      if (!ser) return;
      if (!store.isSeriesCompletedByUser(ser, user.id)) {
        UI.showToast('🔒 Completa todos los capítulos de la serie para desbloquear su calificación final 🍿', 'info');
        return;
      }
      openRateModal('series', ser, user);
    });
  });

  viewport.querySelectorAll('[data-quote-series]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ser = allSeries.find(s => s.id === btn.getAttribute('data-quote-series'));
      if (!ser) return;
      pendingChatQuote = {
        type: 'series',
        itemId: ser.id,
        label: '📺 Serie',
        title: `${ser.title} (${ser.year || ''})`,
        subtitle: `Maratón en ${ser.platform || 'Streaming'}`,
        thumb: ser.poster || 'assets/ruma_icon_512.png'
      };
      store.navigate('group', { groupTab: 'chat' });
    });
  });

  viewport.querySelectorAll('[data-delete-series]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.deleteMediaItem('series', btn.getAttribute('data-delete-series'));
      UI.showToast('Serie eliminada de las maratones.', 'info');
    });
  });
}

async function renderSeriesDetailView(viewport, group, series, user) {
  const seasons = series.seasons || [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: 10 }];
  if (!seasons.some(s => s.seasonNumber === activeSeriesSeasonNum)) {
    activeSeriesSeasonNum = seasons[0].seasonNumber;
  }

  let episodes = series.seasonEpisodes?.[activeSeriesSeasonNum];
  if (!episodes && series.tmdbId) {
    episodes = await MediaService.getSeasonEpisodes(series.tmdbId, activeSeriesSeasonNum);
    if (episodes && episodes.length > 0) {
      store.cacheSeriesSeasonEpisodes(series.id, activeSeriesSeasonNum, episodes);
    }
  }
  if (!episodes || episodes.length === 0) {
    const seasonObj = seasons.find(s => s.seasonNumber === activeSeriesSeasonNum) || { episodeCount: 9 };
    episodes = Array.from({ length: seasonObj.episodeCount || 9 }, (_, i) => ({
      seasonNumber: activeSeriesSeasonNum,
      episodeNumber: i + 1,
      name: `Capítulo ${i + 1}`,
      overview: `Capítulo ${i + 1} de la Temporada ${activeSeriesSeasonNum} de ${series.title}.`,
      duration: '42 min',
      still: series.backdrop || series.poster || 'assets/ruma_icon_512.png'
    }));
  }

  const myProg = series.userProgress?.[user.id] || {};
  const watchedMap = myProg.watchedEpisodes || {};
  const watchedThisSeason = episodes.filter(ep => watchedMap[`${activeSeriesSeasonNum}_${ep.episodeNumber}`]).length;
  const seasonPct = Math.min(100, Math.round((watchedThisSeason / (episodes.length || 1)) * 100));
  const isCompleted = store.isSeriesCompletedByUser(series, user.id);
  const myRating = series.ratings?.[user.id];
  const comments = series.comments || [];

  // Determinar cuál es el siguiente capítulo sugerido para el usuario
  const nextEpObj = episodes.find(ep => !watchedMap[`${activeSeriesSeasonNum}_${ep.episodeNumber}`]);
  const targetEpNum = nextEpObj ? nextEpObj.episodeNumber : null;

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <!-- Cabecera de la Serie -->
      <div class="ruma-card" style="display:flex;flex-direction:column;gap:1rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-back-series-list">← Volver a Series</button>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="button" class="btn ${isCompleted ? 'btn-premium' : 'btn-secondary'} btn-sm" id="btn-detail-rate-series">
              ${isCompleted ? `⭐ ${myRating ? `Tu nota: ${myRating.score}/10` : 'Calificar Serie (¡Completada!)'}` : '🔒 Calificar al completar todos los capítulos'}
            </button>
          </div>
        </div>

        <div style="display:flex;gap:1.25rem;flex-wrap:wrap;">
          <img src="${Utils.sanitize(series.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:130px;height:190px;border-radius:var(--radius-md);object-fit:cover;flex-shrink:0;">
          <div style="flex:1;min-width:220px;display:flex;flex-direction:column;justify-content:space-between;gap:0.75rem;">
            <div>
              <div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.35rem;">
                <span class="badge badge-admin">${Utils.sanitize(series.platform || 'Streaming')}</span>
                <span class="badge badge-free">${Utils.sanitize(series.years || series.year || '')}</span>
                <span class="badge badge-free">${seasons.length} Temporadas</span>
              </div>
              <h2 style="font-family:var(--font-display);font-size:1.55rem;">${Utils.sanitize(series.title)}</h2>
              <div style="font-size:0.82rem;color:var(--brand-lilac);margin-top:0.2rem;">${Utils.sanitize(series.genres || 'Drama, Serie')}</div>
              <p style="font-size:0.88rem;color:var(--text-secondary);margin-top:0.55rem;line-height:1.55;">
                ${Utils.sanitize(series.synopsis || series.overview || '')}
              </p>
            </div>
          </div>
        </div>

        <!-- Pestañas de Temporadas -->
        <div class="ruma-season-tabs">
          ${seasons.map(s => `
            <button type="button" class="ruma-season-tab ${s.seasonNumber === activeSeriesSeasonNum ? 'active' : ''}" data-pick-season="${s.seasonNumber}">
              <strong style="font-size:0.88rem;">Temporada ${s.seasonNumber}</strong>
              <span style="font-size:0.74rem;opacity:0.85;">${s.episodeCount || 9} capítulos</span>
            </button>
          `).join('')}
        </div>

        <!-- Barra de progreso de la temporada actual -->
        <div style="background:var(--bg-elevated);padding:0.75rem 1rem;border-radius:var(--radius-md);">
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:0.4rem;">
            <strong>Progreso Temporada ${activeSeriesSeasonNum}: ${watchedThisSeason} / ${episodes.length} vistos</strong>
            <span style="color:var(--brand-lilac);font-weight:800;">${seasonPct}%</span>
          </div>
          <div class="ruma-progress-track">
            <div class="ruma-progress-fill" style="width:${seasonPct}%;"></div>
          </div>
        </div>
      </div>

      <!-- Lista de Capítulos con Miniatura, Duración, Sinopsis y Botón "Visto hasta aquí" -->
      <div style="display:flex;flex-direction:column;gap:0.85rem;">
        ${episodes.map(ep => {
          const epKey = `${activeSeriesSeasonNum}_${ep.episodeNumber}`;
          const isWatched = Boolean(watchedMap[epKey]);
          const isTarget = targetEpNum === ep.episodeNumber;
          const epNumStr = String(ep.episodeNumber).padStart(2, '0');

          // Miembros del grupo que ya vieron este capítulo
          const membersWhoWatched = Object.values(series.userProgress || {}).filter(u => u.watchedEpisodes && u.watchedEpisodes[epKey]);

          return `
            <div class="ruma-episode-card ${isWatched ? 'watched' : ''} ${isTarget ? 'target' : ''}">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;">
                <div style="display:flex;align-items:center;gap:0.85rem;min-width:0;flex:1;">
                  <div style="font-family:var(--font-mono);font-size:1.25rem;font-weight:800;color:var(--brand-lilac);width:34px;text-align:center;">
                    ${epNumStr}
                  </div>
                  <div style="position:relative;width:125px;height:72px;border-radius:var(--radius-sm);overflow:hidden;flex-shrink:0;background:#080312;">
                    <img src="${Utils.sanitize(ep.still || series.poster || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(ep.name)}" style="width:100%;height:100%;object-fit:cover;">
                    <span style="position:absolute;bottom:4px;right:4px;background:rgba(9,3,20,0.86);color:#fff;font-size:0.68rem;padding:2px 6px;border-radius:6px;">
                      ⏱ ${Utils.sanitize(ep.duration || '42 min')}
                    </span>
                  </div>
                  <div style="min-width:0;flex:1;">
                    <div style="display:flex;align-items:center;gap:0.45rem;flex-wrap:wrap;">
                      <h4 style="font-family:var(--font-display);font-size:1.05rem;">${Utils.sanitize(ep.name)}</h4>
                      ${isTarget ? `<span class="badge badge-limit">▶ Siguiente por ver</span>` : ''}
                    </div>
                    <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.25rem;line-height:1.45;">
                      ${Utils.sanitize(ep.overview)}
                    </p>
                  </div>
                </div>

                <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
                  <button type="button" class="btn ${isWatched ? 'btn-primary' : 'btn-secondary'} btn-sm" data-toggle-ep="${ep.episodeNumber}">
                    ${isWatched ? '✓ Visto' : 'Marcar Visto'}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" data-upto-ep="${ep.episodeNumber}" title="Marca todos los capítulos anteriores y este como vistos">
                    ⏭ Visto hasta aquí
                  </button>
                </div>
              </div>

              ${membersWhoWatched.length > 0 ? `
                <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;color:var(--text-muted);padding-top:0.35rem;border-top:1px solid var(--border-subtle);">
                  <span>🍿 Ya lo vieron:</span>
                  ${membersWhoWatched.map(m => `<strong style="color:var(--brand-lilac-soft);">${Utils.sanitize(m.userName)}</strong>`).join(', ')}
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Foro de Comentarios de la Serie con Etiqueta automática de Progreso (T# · Cap #) -->
      <div class="ruma-card">
        <h3 style="font-family:var(--font-display);font-size:1.15rem;margin-bottom:0.75rem;">
          💬 Foro del Maratón (${comments.length})
        </h3>
        <form id="form-series-comment" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
          <input type="text" id="inp-series-comment" class="form-input" placeholder="Comenta sobre la temporada o capítulo (se etiquetará tu progreso actual)..." required>
          <button type="submit" class="btn btn-primary btn-sm">Publicar</button>
        </form>
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          ${comments.length === 0 ? `
            <div style="font-size:0.84rem;color:var(--text-muted);">Aún no hay comentarios en esta serie.</div>
          ` : comments.map(c => {
            const rx = c.reactions || { '❤️': 0, '🔥': 0, '😂': 0 };
            return `
              <div style="padding:0.75rem 1rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.3rem;">
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <strong>${Utils.sanitize(c.userName || c.authorName)}</strong>
                    ${c.userProgressLabel ? `<span class="badge badge-admin">${Utils.sanitize(c.userProgressLabel)}</span>` : ''}
                  </div>
                  <span style="font-size:0.72rem;color:var(--text-muted);">${Utils.sanitize(c.date || c.time || 'Reciente')}</span>
                </div>
                <p style="font-size:0.88rem;color:var(--text-secondary);">${Utils.sanitize(c.text)}</p>
                <div style="display:flex;gap:0.4rem;margin-top:0.45rem;">
                  ${['❤️', '🔥', '😂'].map(em => `
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:0.2rem 0.55rem;font-size:0.74rem;" data-series-react="${Utils.sanitize(c.id)}" data-emoji="${em}">
                      ${em} ${rx[em] || 0}
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back-series-list')?.addEventListener('click', () => {
    activeSeriesDetailId = null;
    renderSeriesTab(viewport, group, user);
  });

  document.getElementById('btn-detail-rate-series')?.addEventListener('click', () => {
    if (!isCompleted) {
      UI.showToast('🔒 Solo puedes calificar la serie cuando hayas visto todos los episodios 🍿', 'info');
      return;
    }
    openRateModal('series', series, user);
  });

  viewport.querySelectorAll('[data-pick-season]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSeriesSeasonNum = parseInt(btn.getAttribute('data-pick-season'), 10);
      renderSeriesDetailView(viewport, store.getActiveGroup(), series, user);
    });
  });

  viewport.querySelectorAll('[data-toggle-ep]').forEach(btn => {
    btn.addEventListener('click', () => {
      const epNum = parseInt(btn.getAttribute('data-toggle-ep'), 10);
      const res = store.toggleEpisodeWatched(series.id, activeSeriesSeasonNum, epNum);
      if (res?.isFullyCompleted) {
        try { confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } }); } catch (_) {}
        UI.showToast(`🏆 ¡Completaste toda la serie "${series.title}"! Ya puedes calificarla ⭐`, 'success');
      }
    });
  });

  viewport.querySelectorAll('[data-upto-ep]').forEach(btn => {
    btn.addEventListener('click', () => {
      const epNum = parseInt(btn.getAttribute('data-upto-ep'), 10);
      const res = store.markEpisodesUpTo(series.id, activeSeriesSeasonNum, epNum);
      if (res?.isFullyCompleted) {
        try { confetti({ particleCount: 130, spread: 85, origin: { y: 0.6 } }); } catch (_) {}
        UI.showToast(`🎉 ¡Maratón completada! Terminaste "${series.title}". Calificación desbloqueada ⭐`, 'success');
      } else {
        UI.showToast(`Avance actualizado hasta Temporada ${activeSeriesSeasonNum} · Cap. ${epNum} 🍿`, 'success');
      }
    });
  });

  document.getElementById('form-series-comment')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = document.getElementById('inp-series-comment');
    if (inp?.value.trim()) {
      store.addMediaComment('series', series.id, inp.value.trim());
    }
  });

  viewport.querySelectorAll('[data-series-react]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.reactMediaComment('series', series.id, btn.getAttribute('data-series-react'), btn.getAttribute('data-emoji'));
    });
  });
}

// ============================================================================
// BUSCADOR Y CONFIGURACIÓN DE PELÍCULAS / SERIES DESDE TMDB
// ============================================================================
function openSearchTmdbModal(group, category) {
  const isMovies = category === 'movies';
  let debounceTimer = null;

  UI.openModal({
    title: isMovies ? '🎬 Buscar Película en TMDb' : '📺 Buscar Serie en TMDb',
    size: 'lg',
    contentHtml: `
      <div>
        <div style="margin-bottom:0.85rem;">
          <input type="text" id="tmdb-search-input" class="form-input" placeholder="Escribe el título de la ${isMovies ? 'película' : 'serie'}..." autofocus>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.35rem;">
            ⚡ Búsqueda en vivo conectada con el catálogo oficial de TMDb (importa sinopsis, temporadas, tráiler y plataformas).
          </div>
        </div>
        ${isMovies ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:0.85rem;">
            <div>
              <label class="form-label">Estado inicial</label>
              <select id="tmdb-pick-status" class="form-select">
                <option value="Por ver">🌱 Por ver</option>
                <option value="Vista">🍿 Vista</option>
                <option value="Favorita">❤️ Favorita</option>
              </select>
            </div>
            <div>
              <label class="form-label">Prioridad de visionado</label>
              <select id="tmdb-pick-priority" class="form-select">
                <option value="5">★★★★★ (5/5 Urgente)</option>
                <option value="4">★★★★☆ (4/5 Alta)</option>
                <option value="3">★★★☆☆ (3/5 Media)</option>
              </select>
            </div>
          </div>
        ` : ''}
        <div id="tmdb-search-results" style="display:flex;flex-direction:column;gap:0.55rem;max-height:340px;overflow-y:auto;padding-right:0.25rem;">
          <div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;">
            Empieza a escribir para buscar títulos en TMDb...
          </div>
        </div>
      </div>
    `,
    onMount: () => {
      const input = document.getElementById('tmdb-search-input');
      const resultsEl = document.getElementById('tmdb-search-results');

      const doSearch = async () => {
        const q = input?.value.trim();
        if (!q || !resultsEl) {
          if (resultsEl) resultsEl.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;">Empieza a escribir para buscar títulos...</div>`;
          return;
        }

        resultsEl.innerHTML = `<div style="color:var(--brand-lilac);font-size:0.85rem;padding:0.75rem;">Consultando catálogo oficial de TMDb...</div>`;
        const results = isMovies ? await MediaService.searchMovies(q) : await MediaService.searchSeries(q);

        if (results.length === 0) {
          resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;text-align:center;">Sin resultados para esa búsqueda.</div>`;
          return;
        }

        resultsEl.innerHTML = results.map((r, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.65rem;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;flex:1;">
              <img src="${Utils.sanitize(r.poster)}" alt="poster" style="width:46px;height:66px;border-radius:6px;object-fit:cover;flex-shrink:0;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:0.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${Utils.sanitize(r.title)} (${Utils.sanitize(r.year || 'N/A')})
                </div>
                <div style="font-size:0.76rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${Utils.sanitize(r.genres || '')} · <span style="color:var(--brand-gold);">⭐ TMDb ${Utils.sanitize(r.voteAverage)}</span>
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-pick-tmdb="${i}">+ Añadir</button>
          </div>
        `).join('');

        resultsEl.querySelectorAll('[data-pick-tmdb]').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Importando...';
            const picked = results[Number(btn.getAttribute('data-pick-tmdb'))];

            let payload = {
              tmdbId: picked.tmdbId,
              title: picked.title,
              year: picked.year,
              poster: picked.poster,
              backdrop: picked.backdrop || '',
              genres: picked.genres || '',
              tmdbRating: picked.voteAverage,
              synopsis: picked.overview || '',
              status: isMovies ? (document.getElementById('tmdb-pick-status')?.value || 'Por ver') : 'Viendo',
              priority: isMovies ? Number(document.getElementById('tmdb-pick-priority')?.value || 5) : 5,
              ratings: {}
            };

            if (isMovies && picked.tmdbId) {
              const details = await MediaService.getMovieDetails(picked.tmdbId);
              if (details) {
                payload = {
                  ...payload,
                  duration: details.duration,
                  genres: details.genres || payload.genres,
                  synopsis: details.overview || payload.synopsis,
                  gallery: details.gallery || [],
                  trailerUrl: details.trailerUrl || ''
                };
              }
            } else if (!isMovies && picked.tmdbId) {
              const details = await MediaService.getSeriesDetails(picked.tmdbId);
              if (details) {
                payload = {
                  ...payload,
                  years: details.years,
                  genres: details.genres,
                  platform: details.platform,
                  synopsis: details.overview,
                  numberOfSeasons: details.numberOfSeasons,
                  totalEpisodes: details.totalEpisodes,
                  seasons: details.seasons,
                  seasonEpisodes: {},
                  userProgress: {}
                };
              }
            }

            const res = store.addMediaToActiveGroup(category, payload);
            UI.closeModal();
            if (!res.ok) {
              if (res.needsUpgrade) UI.showUpgradeModal(res.error, () => store.upgradeGroupToPremium(group.id));
              else UI.showToast(res.error, 'error');
              return;
            }
            UI.showToast(`"${picked.title}" añadida con ficha oficial de TMDb ✨`, 'success');
          });
        });
      };

      input?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doSearch, 280);
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
        const res = store.rateMovieOrSeries(category, item.id, score, review);
        UI.closeModal();
        if (!res.ok && res.error) {
          UI.showToast(res.error, 'error');
          return;
        }
        UI.showToast('¡Calificación guardada! Ya puedes mostrarla en tu Perfil estilo Discord 🎮', 'success');
      });
    }
  });
}

function openMediaCommentsModal(category, item) {
  const comments = item.comments || [];
  UI.openModal({
    title: `💬 Conversaciones sobre "${item.title}"`,
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:0.85rem;">
        <div style="display:flex;flex-direction:column;gap:0.55rem;max-height:300px;overflow-y:auto;">
          ${comments.length === 0 ? `
            <div style="text-align:center;padding:1.5rem;color:var(--text-muted);font-size:0.85rem;">
              Sé el primero en iniciar la conversación sobre "${Utils.sanitize(item.title)}" 🍿
            </div>
          ` : comments.map(c => {
            const rx = c.reactions || { '❤️': 0, '🔥': 0, '😂': 0 };
            return `
              <div style="padding:0.7rem 0.9rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
                <div style="display:flex;justify-content:space-between;font-size:0.76rem;margin-bottom:0.25rem;">
                  <strong style="color:var(--brand-lilac-soft);">${Utils.sanitize(c.authorName || c.userName)}</strong>
                  <span style="color:var(--text-muted);">${Utils.sanitize(c.time || 'Reciente')}</span>
                </div>
                <p style="font-size:0.86rem;color:var(--text-main);">${Utils.sanitize(c.text)}</p>
                <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
                  ${['❤️', '🔥', '😂'].map(em => `
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:0.15rem 0.5rem;font-size:0.72rem;" data-react-comment="${Utils.sanitize(c.id)}" data-emoji="${em}">
                      ${em} ${rx[em] || 0}
                    </button>
                  `).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <form id="form-add-media-comment" style="display:flex;gap:0.5rem;">
          <input type="text" id="inp-media-comment" class="form-input" placeholder="Escribe tu comentario..." required>
          <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
        </form>
      </div>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-react-comment]').forEach(btn => {
        btn.addEventListener('click', () => {
          store.reactMediaComment(category, item.id, btn.getAttribute('data-react-comment'), btn.getAttribute('data-emoji'));
          const refreshed = (store.getActiveGroup()?.[category] || []).find(x => x.id === item.id);
          if (refreshed) openMediaCommentsModal(category, refreshed);
        });
      });

      document.getElementById('form-add-media-comment')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = document.getElementById('inp-media-comment')?.value.trim();
        if (!text) return;
        store.addMediaComment(category, item.id, text);
        const refreshed = (store.getActiveGroup()?.[category] || []).find(x => x.id === item.id);
        if (refreshed) openMediaCommentsModal(category, refreshed);
      });
    }
  });
}

// ============================================================================
// 4. PESTAÑA MÚSICA (Playlist Colaborativa LUMA + Estadísticas + Filtros + Letras + Reproductor Global)
// ============================================================================
function renderMusicTab(viewport, group, user) {
  const allSongs = group.songs || [];
  const allMemories = group.memories || [];
  const check = Entitlements.canAddMediaItem(group, 'songs');
  const maxStr = check.max === Infinity ? 'Ilimitadas ✨' : `${allSongs.length} / ${check.max}`;

  // Métricas estilo LUMA: Canciones, Integrantes que han aportado, Duración total
  const uniqueAuthors = new Set();
  allSongs.forEach(s => { if (s.addedBy) uniqueAuthors.add(s.addedBy); });
  const totalSec = allSongs.reduce((acc, s) => acc + Math.round((s.trackTimeMillis || 210000) / 1000), 0);
  const mins = Math.floor(totalSec / 60);

  let songs = [...allSongs];
  if (musicFilterState.type === 'top-rated') {
    songs.sort((a, b) => (b.rating || 5) - (a.rating || 5));
  } else if (musicFilterState.type === 'with-memories') {
    songs = songs.filter(s => s.linkedMemories && s.linkedMemories.length > 0);
  } else if (musicFilterState.type === 'my-songs') {
    songs = songs.filter(s => s.addedBy === user.name || s.authorId === user.id);
  } else if (musicFilterState.type === 'by-member' && musicFilterState.memberName) {
    songs = songs.filter(s => s.addedBy === musicFilterState.memberName);
  }

  viewport.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.25rem;">
      <div class="ruma-card" style="display:flex;flex-direction:column;gap:1rem;background:var(--bg-elevated);">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:1.35rem;">🎵 Playlist Colaborativa del Grupo</h2>
            <p style="font-size:0.84rem;color:var(--text-secondary);">
              Escucha fragmentos de 30s en el reproductor global, lee la letra completa, vincula canciones a recuerdos y ábrelas en <strong>Spotify</strong>, <strong>YouTube</strong> o <strong>Apple Music</strong>.
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:0.65rem;">
            <span class="badge ${check.allowed ? 'badge-limit' : 'badge-premium'}">Cupo: ${maxStr}</span>
            <button type="button" class="btn btn-primary btn-sm" id="btn-add-song">+ Añadir Canción</button>
          </div>
        </div>

        <!-- Estadísticas Rápidas de la Playlist (Estilo LUMA) -->
        <div class="ruma-stats-bar">
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${allSongs.length}</span>
            <span class="ruma-stat-label">🎵 Canciones</span>
          </div>
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${Math.max(uniqueAuthors.size, allSongs.length > 0 ? 1 : 0)}</span>
            <span class="ruma-stat-label">👥 Integrantes DJ</span>
          </div>
          <div class="ruma-stat-box">
            <span class="ruma-stat-value">${mins} min</span>
            <span class="ruma-stat-label">⏱ Duración Total</span>
          </div>
        </div>

        <!-- Filtros de Música -->
        <div class="ruma-filter-chips">
          ${[
            { id: 'all', label: 'Todas' },
            { id: 'top-rated', label: '⭐ Mejor valoradas' },
            { id: 'with-memories', label: '📸 Con recuerdos' },
            { id: 'my-songs', label: '👤 Mis canciones' }
          ].map(f => `
            <button type="button" class="ruma-chip ${musicFilterState.type === f.id ? 'active' : ''}" data-music-filter="${f.id}">
              ${f.label}
            </button>
          `).join('')}

          <select id="music-member-select" class="form-select" style="width:auto;padding:0.35rem 0.75rem;font-size:0.8rem;border-radius:var(--radius-full);">
            <option value="">👥 Filtrar por integrante...</option>
            ${Array.from(uniqueAuthors).map(name => `
              <option value="${Utils.sanitize(name)}" ${musicFilterState.type === 'by-member' && musicFilterState.memberName === name ? 'selected' : ''}>
                👤 ${Utils.sanitize(name)}
              </option>
            `).join('')}
          </select>
        </div>
      </div>

      ${songs.length === 0 ? `
        <div class="ruma-card" style="text-align:center;padding:2.5rem;color:var(--text-secondary);">
          No hay canciones en este filtro todavía.
        </div>
      ` : `
        <div class="ruma-grid-2">
          ${songs.map(song => {
            const ratingScore = Number(song.rating || 5).toFixed(1);
            const ratingCount = song.ratingCount || 1;
            const commentsCount = (song.comments && song.comments.length) || 0;
            const linkedMems = (song.linkedMemories || []).map(id => allMemories.find(m => m.id === id)).filter(Boolean);
            const isPlaying = MusicService.getCurrentPlayingId() === song.id;

            return `
              <div class="ruma-card" style="display:flex;gap:1rem;align-items:flex-start;">
                <div style="position:relative;width:88px;height:88px;flex-shrink:0;">
                  <img src="${Utils.sanitize(song.artwork || 'assets/ruma_icon_512.png')}" alt="Artwork" style="width:100%;height:100%;border-radius:var(--radius-md);object-fit:cover;">
                  <button type="button" class="btn btn-primary btn-sm" style="position:absolute;bottom:6px;right:6px;width:32px;height:32px;border-radius:50%;padding:0;" data-play-song="${Utils.sanitize(song.id)}" title="Reproducir fragmento 30s">
                    ${isPlaying ? '⏸' : '▶'}
                  </button>
                </div>

                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;">
                    <div style="min-width:0;">
                      <h3 style="font-family:var(--font-display);font-size:1.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${Utils.sanitize(song.title)}
                      </h3>
                      <div style="color:var(--brand-lilac);font-size:0.84rem;font-weight:600;">
                        ${Utils.sanitize(song.artist)} ${song.album ? `<span style="color:var(--text-muted);font-weight:400;">· ${Utils.sanitize(song.album)}</span>` : ''}
                      </div>
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" data-delete-song="${Utils.sanitize(song.id)}">✕</button>
                  </div>

                  <!-- Calificación 1-5 Estrellas Interactiva -->
                  <div style="display:flex;align-items:center;gap:0.35rem;margin-top:0.35rem;font-size:0.8rem;">
                    ${[1, 2, 3, 4, 5].map(st => `
                      <span style="cursor:pointer;color:${st <= Math.round(song.rating || 5) ? 'var(--brand-gold)' : 'var(--text-muted)'};" data-rate-song="${Utils.sanitize(song.id)}" data-star="${st}" title="Calificar con ${st} estrellas">★</span>
                    `).join('')}
                    <span style="color:var(--text-secondary);font-weight:700;margin-left:0.25rem;">${ratingScore} (${ratingCount})</span>
                    <span style="color:var(--text-muted);font-size:0.74rem;">· Por ${Utils.sanitize(song.addedBy || 'Miembro')}</span>
                  </div>

                  ${song.note ? `<p style="font-size:0.82rem;color:var(--text-secondary);margin-top:0.4rem;font-style:italic;">“${Utils.sanitize(song.note)}”</p>` : ''}

                  ${linkedMems.length > 0 ? `
                    <div style="margin-top:0.45rem;">
                      <button type="button" class="badge badge-free" style="cursor:pointer;" data-song-linked-mems="${Utils.sanitize(song.linkedMemories.join(','))}">
                        🎴 Usada en ${linkedMems.length} recuerdo(s) ›
                      </button>
                    </div>
                  ` : ''}

                  <!-- Plataformas + Letra + Comentarios + Citar -->
                  <div class="platform-links" style="margin-top:0.7rem;">
                    <a href="${Utils.sanitize(song.spotifyUrl || MusicService.buildSpotifyUrl(song.title, song.artist))}" target="_blank" rel="noopener" class="btn-platform btn-spotify">
                      🟢 Spotify
                    </a>
                    <a href="${Utils.sanitize(song.youtubeUrl || MusicService.buildYoutubeUrl(song.title, song.artist))}" target="_blank" rel="noopener" class="btn-platform btn-youtube">
                      🔴 YouTube
                    </a>
                    <a href="${Utils.sanitize(song.appleMusicUrl || MusicService.buildAppleMusicUrl(song.title, song.artist))}" target="_blank" rel="noopener" class="btn-platform btn-apple">
                      🍎 Apple
                    </a>
                    <button type="button" class="btn btn-secondary btn-sm" data-lyrics-song="${Utils.sanitize(song.id)}">🎤 Letra</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-comments-song="${Utils.sanitize(song.id)}">💬 ${commentsCount}</button>
                    <button type="button" class="btn btn-secondary btn-sm" data-quote-song="${Utils.sanitize(song.id)}">↩</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;

  viewport.querySelectorAll('[data-music-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      musicFilterState.type = btn.getAttribute('data-music-filter');
      musicFilterState.memberName = '';
      renderMusicTab(viewport, group, user);
    });
  });

  document.getElementById('music-member-select')?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      musicFilterState.type = 'by-member';
      musicFilterState.memberName = val;
    } else {
      musicFilterState.type = 'all';
      musicFilterState.memberName = '';
    }
    renderMusicTab(viewport, group, user);
  });

  document.getElementById('btn-add-song')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openAddSongModal(group);
  });

  // Reproducir canción (si no tiene previewUrl cargado, lo busca en vivo en iTunes)
  viewport.querySelectorAll('[data-play-song]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const song = allSongs.find(s => s.id === btn.getAttribute('data-play-song'));
      if (!song) return;

      if (song.previewUrl) {
        const res = MusicService.toggleTrack(song);
        btn.textContent = res.isPlaying ? '⏸' : '▶';
      } else {
        btn.textContent = '⏳';
        const results = await MusicService.searchSongs(`${song.title} ${song.artist}`, 3);
        if (results.length > 0 && results[0].previewUrl) {
          store.updateMediaItem('songs', song.id, { previewUrl: results[0].previewUrl });
          song.previewUrl = results[0].previewUrl;
          MusicService.playTrack(song);
          btn.textContent = '⏸';
        } else {
          btn.textContent = '▶';
          UI.showToast('Preview de 30s no disponible en iTunes para esta canción.', 'info');
        }
      }
    });
  });

  // Calificar canción 1-5 estrellas
  viewport.querySelectorAll('[data-rate-song]').forEach(el => {
    el.addEventListener('click', () => {
      const songId = el.getAttribute('data-rate-song');
      const star = Number(el.getAttribute('data-star'));
      store.rateSong(songId, star);
      UI.showToast(`¡Calificaste con ${star}★!`, 'success');
    });
  });

  // Ver letra completa (LRCLIB API de LUMA)
  viewport.querySelectorAll('[data-lyrics-song]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const song = allSongs.find(s => s.id === btn.getAttribute('data-lyrics-song'));
      if (!song) return;
      UI.openModal({
        title: `🎤 Letra: ${song.title} — ${song.artist}`,
        contentHtml: `<div id="lyrics-modal-box" style="padding:1rem;color:var(--brand-lilac);">Buscando letra oficial...</div>`,
        onMount: async () => {
          const box = document.getElementById('lyrics-modal-box');
          const lyrics = await MediaService.fetchLyrics(song.artist, song.title);
          if (!box) return;
          if (lyrics) {
            box.innerHTML = `<pre style="white-space:pre-wrap;font-family:var(--font-sans);font-size:0.88rem;line-height:1.65;color:var(--text-secondary);max-height:55dvh;overflow-y:auto;">${Utils.sanitize(lyrics)}</pre>`;
          } else {
            box.innerHTML = `
              <div style="text-align:center;padding:1rem;">
                <p style="color:var(--text-secondary);margin-bottom:0.85rem;">No se encontró la letra sincronizada en LRCLIB para este tema.</p>
                <a href="https://genius.com/search?q=${encodeURIComponent(song.title + ' ' + song.artist)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Buscar Letra en Genius ↗</a>
              </div>
            `;
          }
        }
      });
    });
  });

  // Comentarios de la canción
  viewport.querySelectorAll('[data-comments-song]').forEach(btn => {
    btn.addEventListener('click', () => {
      const song = allSongs.find(s => s.id === btn.getAttribute('data-comments-song'));
      if (song) openMediaCommentsModal('songs', song);
    });
  });

  // Recuerdos vinculados
  viewport.querySelectorAll('[data-song-linked-mems]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ids = btn.getAttribute('data-song-linked-mems').split(',').filter(Boolean);
      store.navigate('group', { groupTab: 'memories', memoryFilterIds: ids });
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
      const song = allSongs.find(s => s.id === btn.getAttribute('data-quote-song'));
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
  const memories = group.memories || [];

  UI.openModal({
    title: '🎵 Buscar Canción o Letra (Playlist Colaborativa)',
    size: 'lg',
    contentHtml: `
      <div>
        <div style="margin-bottom:0.85rem;">
          <input type="text" id="song-search-inp" class="form-input" placeholder="Escribe el nombre de la canción, artista o parte de la letra..." autofocus>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.35rem;">
            ⚡ Búsqueda en vivo en iTunes con preview oficial de 30s.
          </div>
        </div>

        <div style="display:grid;grid-template-columns:2fr 1fr;gap:0.75rem;margin-bottom:0.85rem;">
          <div>
            <label class="form-label">Dedicatoria o Reseña para el Grupo</label>
            <input type="text" id="song-note-inp" class="form-input" placeholder="Ej: La canción de nuestro viaje a la montaña 💫">
          </div>
          <div>
            <label class="form-label">Calificación (1-5★)</label>
            <select id="song-rating-inp" class="form-select">
              <option value="5">★★★★★ (5.0)</option>
              <option value="4">★★★★☆ (4.0)</option>
              <option value="3">★★★☆☆ (3.0)</option>
            </select>
          </div>
        </div>

        ${memories.length > 0 ? `
          <div class="form-group">
            <label class="form-label">🎴 Vincular a Recuerdos del Grupo (Opcional)</label>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;max-height:85px;overflow-y:auto;padding:0.4rem;background:var(--bg-elevated);border-radius:var(--radius-sm);">
              ${memories.map(m => `
                <label style="display:inline-flex;align-items:center;gap:0.35rem;font-size:0.78rem;cursor:pointer;background:rgba(18,7,38,0.8);padding:0.25rem 0.55rem;border-radius:var(--radius-xs);">
                  <input type="checkbox" name="song_linked_memory" value="${Utils.sanitize(m.id)}">
                  <span>📸 ${Utils.sanitize(m.title)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div id="song-search-results" style="display:flex;flex-direction:column;gap:0.55rem;max-height:280px;overflow-y:auto;padding-right:0.25rem;">
          <div style="text-align:center;padding:1.5rem;color:var(--text-secondary);font-size:0.85rem;">
            Empieza a escribir para buscar en vivo...
          </div>
        </div>
      </div>
    `,
    onMount: (modalEl) => {
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
          resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;text-align:center;">No encontramos canciones con esa letra o nombre.</div>`;
          return;
        }

        resultsEl.innerHTML = list.map((s, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.65rem;padding:0.65rem;background:var(--bg-elevated);border-radius:var(--radius-sm);border:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;flex:1;">
              <img src="${Utils.sanitize(s.artwork)}" alt="art" style="width:46px;height:46px;border-radius:8px;object-fit:cover;flex-shrink:0;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(s.title)}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(s.artist)} · ${Utils.sanitize(s.album || '')}</div>
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

        resultsEl.querySelectorAll('[data-modal-preview]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-modal-preview'));
            const item = list[idx];
            if (!item?.previewUrl) return;
            const res = MusicService.toggleTrack(item);
            btn.innerHTML = res.isPlaying ? '⏸ ...' : '▶ 30s';
          });
        });

        resultsEl.querySelectorAll('[data-pick-song]').forEach(btn => {
          btn.addEventListener('click', () => {
            const picked = list[Number(btn.getAttribute('data-pick-song'))];
            const note = document.getElementById('song-note-inp')?.value.trim() || '';
            const starRating = Number(document.getElementById('song-rating-inp')?.value || 5);
            const checkedMems = Array.from(modalEl.querySelectorAll('input[name="song_linked_memory"]:checked')).map(cb => cb.value);

            const res = store.addMediaToActiveGroup('songs', {
              ...picked,
              note,
              rating: starRating,
              ratingCount: 1,
              linkedMemories: checkedMems
            });
            UI.closeModal();
            if (!res.ok) {
              if (res.needsUpgrade) UI.showUpgradeModal(res.error, () => store.upgradeGroupToPremium(group.id));
              else UI.showToast(res.error, 'error');
              return;
            }
            UI.showToast(`"${picked.title}" añadida a la playlist colaborativa 🎵`, 'success');
          });
        });
      };

      inp?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(executeSearch, 280);
      });
    }
  });
}

// ============================================================================
// 5. PESTAÑA METAS Y TABLERO DE NOTAS
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
// 6. PESTAÑA CHAT INTERNO ESTILO WHATSAPP (Con citas a Recuerdos, Películas, Series, Canciones o Mensajes)
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
            Desliza o pulsa "Responder" en cualquier mensaje, o enlaza un recuerdo, película, serie o canción guardada.
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

  viewport.querySelectorAll('[data-jump-quote-type]').forEach(box => {
    box.addEventListener('click', () => {
      const t = box.getAttribute('data-jump-quote-type');
      if (t === 'memory') store.navigate('group', { groupTab: 'memories' });
      else if (t === 'movie') store.navigate('group', { groupTab: 'movies' });
      else if (t === 'series') store.navigate('group', { groupTab: 'series' });
      else if (t === 'song') store.navigate('group', { groupTab: 'music' });
    });
  });

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
