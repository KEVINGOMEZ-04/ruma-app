/**
 * ruma 🌟 — INTERFAZ 2: El Grupo (Recuerdos en Google Drive, Cine, Series, Música, Metas/Notas y Chat con Citas)
 * Acoplado con todas las funciones principales de LUMA para:
 * 1. Recuerdos (Calendario interactivo con festivos, planes a futuro, búsqueda/filtros, aura, nota de voz, canción vinculada, galería, comentarios).
 * 2. Películas (Métricas, filtros rápidos, ruleta aleatoria, prioridad 1-5★, estados Por ver/Vista/Favorita, ficha con tráiler, plataformas de streaming, fotogramas, recuerdos vinculados, hilo de comentarios con reacciones).
 * 3. Series (Métricas, filtros, plataforma, vista completa de maratón por temporadas, capítulos con miniatura/duración/sinopsis, "Visto" y "Visto hasta aquí" con confeti, bloqueo de nota hasta completar, comentarios con etiqueta T# · Cap #).
 * 4. Música (Métricas de duración/integrantes, filtros incluyendo por integrante y con recuerdos, reproductor flotante global con controles, letras completas LRCLIB, calificación 1-5★, recuerdos vinculados, hilo de comentarios).
 */

import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { MusicService } from '../services/music-service.js';
import { UI } from '../components/ui.js';
import { openReviewModal } from '../components/media-widgets.js';
import { openAddPlanModal, openUploadMemoryModal, openMemoryDetailModal } from './group-memory-modals.js';
import { renderSeriesDetailView, resetSeriesDetailTabState } from './group-series-detail.js';
import {
  openMovieDetailModal,
  openSearchTmdbModal,
  openMediaCommentsModal,
  openLyricsModal,
  openEditSongModal,
  openAddSongModal,
  openPickGroupItemToQuoteModal
} from './group-media-modals.js';

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

let musicFilterState = {
  type: 'all', // 'all' | 'top-rated' | 'with-memories' | 'my-songs' | 'by-member'
  memberName: ''
};
let booksFilterState = 'all';

import { groupHeaderHtml, bindGroupHeader } from './group-header.js';
import { groupHomeHtml, bindGroupHome } from './group-home.js';

const groupTabCache = new Map();
const groupTabLoaders = {
  memories: () => import('./group-memories.js'),
  movies: () => import('./group-movies.js'),
  series: () => import('./group-series.js'),
  music: () => import('./group-music.js'),
  books: () => import('./group-books.js'),
  goals_notes: () => import('./group-goals.js'),
  chat: () => import('./group-chat.js')
};
let tabRenderSeq = 0;

function resetGoalsIfLoaded() {
  groupTabCache.get('goals_notes')?.resetGoalsDetailState?.();
}

function withGroupTab(tabKey, viewport, onReady) {
  if (!viewport) return;
  const cached = groupTabCache.get(tabKey);
  if (cached) {
    onReady(cached, viewport);
    return;
  }

  const seq = tabRenderSeq;
  viewport.innerHTML = `<div class="ruma-view-loading" role="status" aria-live="polite"><span class="ruma-spinner" aria-hidden="true"></span><span>Cargando sección...</span></div>`;

  const loader = groupTabLoaders[tabKey];
  if (!loader) return;
  loader()
    .then((mod) => {
      groupTabCache.set(tabKey, mod);
      if (seq !== tabRenderSeq) return;
      const liveViewport = document.getElementById('group-tab-viewport') || viewport;
      if (liveViewport && document.body.contains(liveViewport)) {
        onReady(mod, liveViewport);
      }
    })
    .catch((err) => {
      console.error(`Error cargando pestaña ${tabKey}:`, err);
      if (Utils.tryAutoReloadForStaleChunk(err)) return;
      if (seq !== tabRenderSeq) return;
      const liveViewport = document.getElementById('group-tab-viewport') || viewport;
      if (liveViewport) {
        Utils.renderChunkLoadFallback(liveViewport, () => store.notify());
      }
    });
}

export function renderGroupInterface(container) {
  tabRenderSeq += 1;
  const user = store.getCurrentUser();
  const group = store.getActiveGroup();

  if (!user || !group) {
    store.navigate('hub');
    return;
  }

  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const tab = store.currentGroupTab || 'home';

  // Sincronizar playlist global solo con canciones desbloqueadas del grupo activo
  const lockedSongIds = Entitlements.getLockedMediaIds(group, 'songs');
  MusicService.setPlaylist((group.songs || []).filter(s => !lockedSongIds.has(s.id)));
  MusicService.setOnLyricsRequest((track) => openLyricsModal(track));
  MusicService.setOnPreviewRefresh((songId, freshUrl) => {
    store.updateMediaItem('songs', songId, { previewUrl: freshUrl }, { silent: true });
  });

  const SECTION_TITLES = { memories: 'Recuerdos', movies: 'Películas', series: 'Series', music: 'Música', books: 'Libros', goals_notes: 'Objetivos', chat: 'Chat del grupo' };
  const isHome = tab === 'home';
  if (tab === 'chat') store.markChatSeen(group);
  if (tab !== 'goals_notes') resetGoalsIfLoaded();

  container.innerHTML = `
    <div class="rg-wrap">
      ${isHome ? groupHeaderHtml(group, user, tab) + groupHomeHtml(group) : ((tab === 'memories' || tab === 'movies' || tab === 'series' || tab === 'music' || tab === 'books' || tab === 'goals_notes' || tab === 'chat') ? `<div id="group-tab-viewport"></div>` : `
        <div class="rg-sectionbar">
          <button type="button" class="rg-back" id="rg-back-home">‹ Grupo</button>
          <h2>${SECTION_TITLES[tab] || ''}</h2>
        </div>
        <div id="group-tab-viewport"></div>`)}
    </div>
  `;

  if (isHome) {
    bindGroupHeader(container, group, user, {
      onTab: (nextTab) => {
        if (nextTab !== 'series') activeSeriesDetailId = null;
        if (nextTab !== 'goals_notes') resetGoalsIfLoaded();
        store.navigate('group', { groupTab: nextTab });
      }
    });
    bindGroupHome(container, group);
    return;
  }
  document.getElementById('rg-back-home')?.addEventListener('click', () => {
    activeSeriesDetailId = null;
    resetGoalsIfLoaded();
    store.navigate('group', { groupTab: 'home' });
  });

  const viewport = document.getElementById('group-tab-viewport');
  if (!viewport) return;

  if (tab === 'memories') renderMemoriesTab(viewport, group, user, isAdmin);
  else if (tab === 'movies') renderMoviesTab(viewport, group, user);
  else if (tab === 'series') renderSeriesTab(viewport, group, user);
  else if (tab === 'music') renderMusicTab(viewport, group, user);
  else if (tab === 'books') renderBooksTab(viewport, group, user);
  else if (tab === 'goals_notes') renderGoalsAndNotesTab(viewport, group, user);
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
  withGroupTab('memories', viewport, (mod, liveViewport) => {
    mod.renderGroupMemoriesView(liveViewport, group, user, isAdmin, {
      memFilterState,
      getHolidaysForYear,
      openUploadMemoryModal,
      openMemoryDetailModal,
      openAddPlanModal,
      onQuoteMemory: (mem) => {
        pendingChatQuote = {
          type: 'memory',
          itemId: mem.id,
          label: '📸 Recuerdo',
          title: mem.title,
          subtitle: mem.subfolderName || Utils.formatFullSpanishDate(mem.date),
          thumb: mem.coverPreview || 'assets/ruma_default_avatar.png'
        };
        store.navigate('group', { groupTab: 'chat' });
      },
      rerender: () => renderMemoriesTab(liveViewport, group, user, isAdmin)
    });
  });
}

// 2. PESTAÑA PELÍCULAS (Cartelera Colaborativa LUMA + Ruleta + Ficha + Dónde Ver + Comentarios)
// ============================================================================
function renderMoviesTab(viewport, group, user) {
  withGroupTab('movies', viewport, (mod, liveViewport) => {
    mod.renderGroupMoviesView(liveViewport, group, user, {
      getFilterState: () => movieFilterState,
      setFilterState: (v) => { movieFilterState = v; },
      openSearchTmdbModal,
      openMovieDetailModal: (grp, mv, usr) => openMovieDetailModal(grp, mv, usr, (q) => { pendingChatQuote = q; }),
      openReviewModal,
      openMediaCommentsModal,
      onQuoteMovie: (movie) => {
        pendingChatQuote = {
          type: 'movie',
          itemId: movie.id,
          label: '🎬 Película',
          title: `${movie.title} (${movie.year || ''})`,
          subtitle: `Estado: ${store.getUserMovieStatus(movie, user.id)}`,
          thumb: movie.poster || 'assets/ruma_default_avatar.png'
        };
        store.navigate('group', { groupTab: 'chat' });
      },
      rerender: () => renderMoviesTab(liveViewport, group, user)
    });
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
    if (activeSeries && !Entitlements.isMediaItemLocked(group, 'series', activeSeries.id)) {
      renderSeriesDetailView(viewport, group, activeSeries, user, () => { activeSeriesDetailId = null; renderSeriesTab(viewport, group, user); });
      return;
    }
    activeSeriesDetailId = null;
  }

  withGroupTab('series', viewport, (mod, liveViewport) => {
    mod.renderGroupSeriesView(liveViewport, group, user, {
      getFilterState: () => seriesFilterState,
      setFilterState: (v) => { seriesFilterState = v; },
      openSearchTmdbModal,
      openSeriesDetail: (ser) => {
        if (Entitlements.isMediaItemLocked(group, 'series', ser?.id)) {
          UI.showUpgradeModal('En el Plan Free el límite es de 5 series por grupo. Activa ruma Plus para desbloquearla.', () => store.upgradeGroupToPremium(group.id));
          return;
        }
        activeSeriesDetailId = ser.id;
        resetSeriesDetailTabState(ser.userProgress?.[user.id]?.currentSeason || (ser.seasons?.[0]?.seasonNumber ?? 1));
        renderSeriesTab(liveViewport, group, user);
      },
      openReviewModal,
      openMediaCommentsModal,
      onQuoteSeries: (ser) => {
        pendingChatQuote = {
          type: 'series',
          itemId: ser.id,
          label: '📺 Serie',
          title: `${ser.title} (${ser.year || ser.years || ''})`,
          subtitle: `Maratón en ${ser.platform || 'Streaming'}`,
          thumb: ser.poster || 'assets/ruma_icon_512.png'
        };
        store.navigate('group', { groupTab: 'chat' });
      },
      rerender: () => renderSeriesTab(liveViewport, group, user)
    });
  });
}

function renderMusicTab(viewport, group, user) {
  withGroupTab('music', viewport, (mod, liveViewport) => {
    mod.renderGroupMusicView(liveViewport, group, user, {
      getFilterState: () => musicFilterState,
      setFilterState: (v) => { musicFilterState = v; },
      openAddSongModal,
      openEditSongModal,
      openMediaCommentsModal,
      openLyricsModal,
      onQuoteSong: (song) => {
        pendingChatQuote = {
          type: 'song',
          itemId: song.id,
          label: '🎵 Canción',
          title: song.title,
          subtitle: song.artist,
          thumb: song.artwork || 'assets/ruma_icon_512.png'
        };
        store.navigate('group', { groupTab: 'chat' });
      },
      rerender: () => renderMusicTab(liveViewport, group, user)
    });
  });
}

// 5. PESTAÑA OBJETIVOS (Actividades Grupales, Responsabilidades, Metas y Notas)
// ============================================================================
function renderGoalsAndNotesTab(viewport, group, user) {
  withGroupTab('goals_notes', viewport, (mod, liveViewport) => {
    mod.renderGroupGoalsView(liveViewport, group, user, {
      onQuoteActivity: (activity, progress) => {
        const progText = progress && progress.total > 0
          ? `${progress.done}/${progress.total} responsabilidades · ${progress.pct}%`
          : (activity.status || 'Planeando');
        pendingChatQuote = {
          type: 'activity',
          itemId: activity.id,
          label: `${activity.icon || '🎉'} Actividad`,
          title: activity.title,
          subtitle: [activity.date, progText].filter(Boolean).join(' · '),
          thumb: group.avatar || 'assets/ruma_icon_512.png'
        };
        store.navigate('group', { groupTab: 'chat' });
      },
      rerender: () => {
        const freshGroup = store.getActiveGroup();
        const freshUser = store.getCurrentUser();
        const currentVp = document.getElementById('group-tab-viewport') || liveViewport;
        if (freshGroup && freshUser && currentVp) {
          renderGoalsAndNotesTab(currentVp, freshGroup, freshUser);
        }
      }
    });
  });
}

// ============================================================================
// 6. PESTAÑA CHAT INTERNO ESTILO WHATSAPP (Con citas a Recuerdos, Películas, Series, Canciones o Mensajes)
// ============================================================================
function renderBooksTab(viewport, group, user) {
  withGroupTab('books', viewport, (mod, liveViewport) => {
    mod.renderGroupBooksView(liveViewport, group, user, {
      getFilterState: () => booksFilterState,
      setFilterState: (v) => { booksFilterState = v; },
      openReviewModal,
      openMediaCommentsModal,
      onQuoteBook: (book, passage = null) => {
        if (passage && passage.text) {
          const snippet = passage.text.length > 96 ? `${passage.text.slice(0, 95)}…` : passage.text;
          pendingChatQuote = {
            type: 'book',
            itemId: book.id,
            label: passage.page ? `🔖 Cita · Pág. ${passage.page}` : '🔖 Cita de libro',
            title: book.title,
            subtitle: `“${snippet}”`,
            thumb: book.poster || 'assets/ruma_icon_512.png'
          };
        } else {
          pendingChatQuote = {
            type: 'book',
            itemId: book.id,
            label: '📚 Libro',
            title: book.title,
            subtitle: book.author || 'Libro',
            thumb: book.poster || 'assets/ruma_icon_512.png'
          };
        }
        store.navigate('group', { groupTab: 'chat' });
      },
      rerender: () => renderBooksTab(liveViewport, group, user)
    });
  });
}

function renderChatTab(viewport, group, user) {
  withGroupTab('chat', viewport, (mod, liveViewport) => {
    mod.renderGroupChatView(liveViewport, group, user, {
      getPendingQuote: () => pendingChatQuote,
      setPendingQuote: (q) => { pendingChatQuote = q; },
      openPickItemModal: (grp, onPicked) => openPickGroupItemToQuoteModal(grp, onPicked, (q) => { pendingChatQuote = q; }),
      rerender: () => renderChatTab(liveViewport, group, user)
    });
  });
}
