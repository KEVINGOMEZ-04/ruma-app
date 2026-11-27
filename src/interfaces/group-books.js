// Vista integral de Libros del Grupo (v2 — Club de Lectura, BooksApi multi-fuente, listo para app móvil)
// Mobile-first · Identidad cromática Ruma (Tema Oscuro y Claro)
import '../styles/books.css';
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { getAverage } from '../components/media-widgets.js';
import { fireConfetti } from '../core/confetti.js';
import { openImageCropperModal } from '../components/image-cropper.js';
import { BooksApi } from '../services/books-api.js';

const esc = v => Utils.sanitize(v);
const DEFAULT_COVER = 'assets/ruma_icon_512.png';

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  book: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H12v17H4.5A2.5 2.5 0 0 0 2 22V5.5Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H12v17h7.5a2.5 2.5 0 0 1 2.5 2V5.5Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chart: '<path d="M4 19h16"/><rect x="6" y="11" width="3" height="8" rx="1"/><rect x="11" y="7" width="3" height="12" rx="1"/><rect x="16" y="4" width="3" height="15" rx="1"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
  star: '<path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9L12 2.8z"/>',
  bookmark: '<path d="M6 4h12a1 1 0 0 1 1 1v16l-7-4-7 4V5a1 1 0 0 1 1-1z"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  quote: '<path d="M9 17H5a2 2 0 0 1-2-2V9a4 4 0 0 1 4-4h2v6H7v2h2v4Zm12 0h-4a2 2 0 0 1-2-2V9a4 4 0 0 1 4-4h2v6h-2v2h2v4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5"/><path d="M9 2h6"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>'
};

const STATUSES = [
  { id: 'Por leer', label: 'Por leer', cls: 'st-pending' },
  { id: 'Leyendo', label: 'Leyendo', cls: 'st-reading' },
  { id: 'Leído', label: 'Leído', cls: 'st-done' },
  { id: 'Abandonado', label: 'Abandonado', cls: 'st-dropped' }
];

const FORMATS = [
  { id: 'physical', icon: '📖', label: 'Físico' },
  { id: 'ebook', icon: '📱', label: 'Ebook' },
  { id: 'audiobook', icon: '🎧', label: 'Audio' }
];

const booksUiState = {
  search: '',
  sort: 'recent',
  genre: 'all',
  author: 'all',
  rating: 'all',
  format: 'all',
  onlyMine: false
};

const bookHydrateInFlight = new Set();
const bookHydrateDone = new Set();

function statusMeta(st) {
  return STATUSES.find(s => s.id === st) || STATUSES[0];
}

function formatMeta(fmt) {
  return FORMATS.find(f => f.id === fmt) || FORMATS[0];
}

function scoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 8.5) return 'var(--success)';
  if (s >= 7) return 'var(--warning)';
  if (s >= 5) return 'var(--primary)';
  return 'var(--error)';
}

function splitGenres(str) {
  if (!str) return [];
  return String(str)
    .split(/[,;/|]+/)
    .map(g => g.trim())
    .filter(Boolean);
}

function getBookPct(book, prog) {
  if (!prog) return 0;
  if (prog.status === 'Leído') return 100;
  if (prog.format === 'audiobook' || !Number(book?.pages || 0)) {
    return Math.min(100, Math.max(0, Math.round(Number(prog.percent || 0))));
  }
  const total = Number(book.pages || 0);
  if (total <= 0) return Math.min(100, Math.max(0, Math.round(Number(prog.percent || 0))));
  return Math.min(100, Math.max(0, Math.round((Number(prog.currentPage || 0) / total) * 100)));
}

function countActiveAdvancedFilters() {
  let n = 0;
  if (booksUiState.genre !== 'all') n++;
  if (booksUiState.author !== 'all') n++;
  if (booksUiState.rating !== 'all') n++;
  if (booksUiState.format !== 'all') n++;
  if (booksUiState.onlyMine) n++;
  if (booksUiState.sort !== 'recent') n++;
  return n;
}

function formatFinishDate(iso) {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) return iso;
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return iso;
  }
}

function formatDurationHuman(totalMinutes) {
  const m = Math.max(0, Math.round(Number(totalMinutes) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Actualiza un modal abierto sin destruir ni re-animar el contenedor, conservando la posición del scroll.
 */
function renderModalInPlace({ modalKey, title, size = 'md', contentHtml, onMount, onClose }) {
  const existing = document.getElementById('ruma-active-modal');
  if (existing && existing.getAttribute('data-modal-key') === modalKey) {
    const scrollBox = existing.querySelector('.ruma-modal');
    const body = existing.querySelector('.ruma-modal-body');
    const heading = existing.querySelector('.ruma-modal-head h3');
    const prevScroll = scrollBox ? scrollBox.scrollTop : 0;
    if (heading && title) heading.textContent = title;
    if (body) body.innerHTML = contentHtml;
    if (typeof onMount === 'function') onMount(existing);
    if (scrollBox) scrollBox.scrollTop = prevScroll;
    return;
  }

  UI.openModal({
    title,
    size,
    contentHtml,
    onClose,
    onMount: (backdrop) => {
      backdrop.setAttribute('data-modal-key', modalKey);
      if (typeof onMount === 'function') onMount(backdrop);
    }
  });
}

/** Hidrata en segundo plano metadatos faltantes de libros existentes (máx. 4 a la vez). */
async function hydrateBooksMetadata(group) {
  if (!group || !Array.isArray(group.books)) return;
  const candidates = group.books.filter(b => {
    if (!b?.id || !b?.title) return false;
    if (bookHydrateInFlight.has(b.id) || bookHydrateDone.has(b.id)) return false;
    return !Number(b.pages || 0) || !b.genres || !b.year || !b.synopsis || !b.isbn13 || b.poster === DEFAULT_COVER;
  }).slice(0, 4);

  if (candidates.length === 0) return;

  candidates.forEach(b => bookHydrateInFlight.add(b.id));
  const patches = [];

  await Promise.all(candidates.map(async book => {
    try {
      const patch = await BooksApi.hydrateBookPatch(book);
      if (patch && Object.keys(patch).length > 0) {
        patches.push({ category: 'books', itemId: book.id, patch });
      }
    } catch (_) {
      // Silencioso si está sin conexión
    } finally {
      bookHydrateInFlight.delete(book.id);
      bookHydrateDone.add(book.id);
    }
  }));

  if (patches.length > 0) {
    store.applyMediaPatches(group.id, patches);
  }
}

export function renderGroupBooksView(viewport, group, user, ctx) {
  const { getFilterState, setFilterState, openReviewModal, openMediaCommentsModal, onQuoteBook, rerender } = ctx;
  const rawFilter = getFilterState();
  const validFilters = ['all', 'Leyendo', 'Por leer', 'Leído', 'Abandonado'];
  const filterState = validFilters.includes(rawFilter) ? rawFilter : 'all';

  const allBooks = group.books || [];
  const check = Entitlements.canAddMediaItem(group, 'books');
  const lockedIds = Entitlements.getLockedMediaIds(group, 'books');
  const readingStats = store.getUserReadingStats(group, user.id);

  hydrateBooksMetadata(group);

  const progMap = new Map(allBooks.map(b => [b.id, store.getUserBookProgress(b, user.id)]));

  const counts = {
    all: allBooks.length,
    Leyendo: allBooks.filter(b => progMap.get(b.id)?.status === 'Leyendo').length,
    'Por leer': allBooks.filter(b => progMap.get(b.id)?.status === 'Por leer').length,
    Leído: allBooks.filter(b => progMap.get(b.id)?.status === 'Leído').length,
    Abandonado: allBooks.filter(b => progMap.get(b.id)?.status === 'Abandonado').length
  };

  // Libro destacado del club (si existe y no está bloqueado)
  const clubBook = group.clubBookId
    ? allBooks.find(b => b.id === group.clubBookId && !lockedIds.has(b.id))
    : null;

  const advCount = countActiveAdvancedFilters();
  const sortLabels = {
    recent: 'Recientes',
    rating: 'Mejor calificados',
    title: 'A–Z',
    pages: 'Más páginas',
    progress: 'Mayor progreso'
  };

  const filterChips = [
    { id: 'all', label: 'Todos', count: counts.all },
    { id: 'Leyendo', label: 'Leyendo', count: counts.Leyendo },
    { id: 'Por leer', label: 'Por leer', count: counts['Por leer'] },
    { id: 'Leído', label: 'Leídos', count: counts.Leído },
    { id: 'Abandonado', label: 'Abandonados', count: counts.Abandonado }
  ];

  const activeTags = [];
  if (booksUiState.genre !== 'all') activeTags.push({ key: 'genre', label: `Género: ${booksUiState.genre}` });
  if (booksUiState.author !== 'all') activeTags.push({ key: 'author', label: `Autor: ${booksUiState.author}` });
  if (booksUiState.format !== 'all') activeTags.push({ key: 'format', label: `Formato: ${formatMeta(booksUiState.format).label}` });
  if (booksUiState.rating !== 'all') {
    const rLabel = booksUiState.rating === 'rated' ? 'Con calificación' : booksUiState.rating === 'unrated' ? 'Sin calificar' : `Nota ${booksUiState.rating}+`;
    activeTags.push({ key: 'rating', label: rLabel });
  }
  if (booksUiState.onlyMine) activeTags.push({ key: 'onlyMine', label: 'Mis propuestas' });
  if (booksUiState.sort !== 'recent') activeTags.push({ key: 'sort', label: `Orden: ${sortLabels[booksUiState.sort] || booksUiState.sort}` });

  const pendingUnlocked = allBooks.filter(b => !lockedIds.has(b.id) && progMap.get(b.id)?.status === 'Por leer');

  const buildBooksSlotHtml = () => {
    let list = [...allBooks];
    if (filterState !== 'all') {
      list = list.filter(b => progMap.get(b.id)?.status === filterState);
    }
    if (booksUiState.onlyMine || rawFilter === 'my-proposals') {
      list = list.filter(b => b.proposedBy?.id === user.id || b.addedBy === user.name);
    }
    if (booksUiState.genre !== 'all') {
      const targetG = booksUiState.genre.toLowerCase();
      list = list.filter(b => splitGenres(b.genres).some(g => g.toLowerCase() === targetG));
    }
    if (booksUiState.author !== 'all') {
      const targetA = booksUiState.author.toLowerCase();
      list = list.filter(b => String(b.author || '').toLowerCase() === targetA);
    }
    if (booksUiState.format !== 'all') {
      list = list.filter(b => (progMap.get(b.id)?.format || 'physical') === booksUiState.format);
    }
    if (booksUiState.rating !== 'all') {
      list = list.filter(b => {
        const avg = getAverage(b);
        if (booksUiState.rating === 'rated') return avg !== null;
        if (booksUiState.rating === 'unrated') return avg === null;
        const minScore = Number(booksUiState.rating);
        return avg !== null && avg >= minScore;
      });
    }

    const q = (booksUiState.search || '').trim().toLowerCase();
    if (q) {
      list = list.filter(b =>
        [b.title, b.author, b.genres, b.year, b.publisher, b.isbn13, b.isbn10].some(v => String(v || '').toLowerCase().includes(q))
      );
    }

    const rate = b => Number(getAverage(b) ?? -1);
    if (booksUiState.sort === 'rating') {
      list.sort((a, b) => rate(b) - rate(a));
    } else if (booksUiState.sort === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (booksUiState.sort === 'pages') {
      list.sort((a, b) => (Number(b.pages) || 0) - (Number(a.pages) || 0));
    } else if (booksUiState.sort === 'progress') {
      list.sort((a, b) => getBookPct(b, progMap.get(b.id)) - getBookPct(a, progMap.get(a.id)));
    }

    const clubHeroHtml = (clubBook && !q && filterState === 'all' && advCount === 0)
      ? renderClubBookHero(clubBook, group, user)
      : '';

    const listHtml = list.length === 0 ? `
      <div class="rbk-empty">
        <div class="rbk-empty-ico">${svg(ICO.book, 24)}</div>
        <b>${q || filterState !== 'all' || advCount > 0 ? 'Sin resultados con estos filtros' : 'Tu biblioteca está vacía'}</b>
        <span>${q || filterState !== 'all' || advCount > 0
          ? 'Prueba ajustando el estado, la búsqueda o los filtros avanzados.'
          : 'Busca por título, autor o ISBN para añadir el primer libro del grupo.'}</span>
        ${q || filterState !== 'all' || advCount > 0
          ? `<button type="button" class="btn btn-secondary btn-sm" id="rbk-reset-empty">Ver todos los libros</button>`
          : `<button type="button" class="btn btn-primary btn-sm" id="rbk-add-empty">+ Añadir primer libro</button>`}
      </div>
    ` : `
      <div class="rbk-list">
        ${list.map(b => renderBookCard(b, progMap.get(b.id), user, lockedIds.has(b.id), b.id === group.clubBookId, readingStats.avgPagesPerHour)).join('')}
      </div>
    `;

    return `${clubHeroHtml}${listHtml}`;
  };

  viewport.innerHTML = `
    <div class="rbk-wrap">
      <!-- Encabezado compacto -->
      <header class="rbk-header">
        <div class="rbk-header-top">
          <div class="rbk-title-group">
            <div class="rbk-header-ico">${svg(ICO.book, 22)}</div>
            <div class="rbk-title-text">
              <h1>Libros</h1>
              <p>Club de lectura del grupo</p>
            </div>
          </div>
          <div class="rbk-header-actions">
            ${pendingUnlocked.length >= 2 ? `
              <button type="button" class="rbk-roulette-btn" id="rbk-roulette-btn" title="¿Qué leemos siguiente? (Ruleta aleatoria)" aria-label="Ruleta aleatoria de libros">🎲</button>
            ` : ''}
            <button type="button" class="rbk-add-btn" id="rbk-add-btn">
              ${svg(ICO.plus, 16)}<span>Añadir</span>
            </button>
          </div>
        </div>

        <button type="button" class="rbk-stats-strip" id="rbk-open-stats" aria-label="Ver estadísticas de lectura">
          <div class="rbk-stats-inline">
            <span class="rbk-stat-mini"><b>${counts.all}</b><span>${counts.all === 1 ? 'libro' : 'libros'}</span></span>
            <span class="rbk-stat-dot" aria-hidden="true"></span>
            <span class="rbk-stat-mini"><b>${counts.Leyendo}</b><span>leyendo</span></span>
            <span class="rbk-stat-dot" aria-hidden="true"></span>
            <span class="rbk-stat-mini"><b>${counts.Leído}</b><span>leídos</span></span>
            ${readingStats.streakDays > 0 ? `<span class="rbk-streak-pill" title="Racha de días leyendo">🔥 ${readingStats.streakDays}d</span>` : ''}
          </div>
          <span class="rbk-stats-cta">${svg(ICO.chart, 14)}<span>Estadísticas</span>${svg(ICO.chevronRight, 14)}</span>
        </button>
      </header>

      <!-- Buscador + Filtros avanzados -->
      <div class="rbk-search-row">
        <div class="rbk-search-box">
          ${svg(ICO.search, 17)}
          <input type="text" id="rbk-search-inp" placeholder="Título, autor, género o ISBN…" value="${esc(booksUiState.search)}" enterkeyhint="search" autocomplete="off">
          <button type="button" class="rbk-search-clear" id="rbk-search-clear" aria-label="Limpiar búsqueda" ${booksUiState.search ? '' : 'hidden'}>✕</button>
        </div>
        <button type="button" class="rbk-filter-btn ${advCount > 0 ? 'has-active' : ''}" id="rbk-adv-btn" aria-label="Filtros avanzados y orden">
          ${svg(ICO.sliders, 18)}
          ${advCount > 0 ? `<span class="rbk-filter-badge">${advCount}</span>` : ''}
        </button>
      </div>

      <!-- Filtros horizontales de estado -->
      <div class="rbk-filters" role="tablist" aria-label="Filtrar libros por estado">
        ${filterChips.map(c => `
          <button type="button" role="tab" aria-selected="${filterState === c.id}" class="rbk-pill ${filterState === c.id ? 'active' : ''}" data-rbk-filter="${c.id}">
            <span>${c.label}</span>
            <span class="rbk-pill-count">${c.count}</span>
          </button>
        `).join('')}
      </div>

      ${activeTags.length > 0 ? `
        <div class="rbk-active-bar">
          ${activeTags.map(t => `
            <span class="rbk-active-tag">
              ${esc(t.label)}
              <button type="button" data-rbk-rm-filter="${t.key}" aria-label="Quitar filtro">✕</button>
            </span>
          `).join('')}
          <button type="button" class="rbk-clear-all" id="rbk-clear-all">Limpiar todo</button>
        </div>
      ` : ''}

      <div id="rbk-results-slot" style="display:flex;flex-direction:column;gap:0.75rem;">
        ${buildBooksSlotHtml()}
      </div>
    </div>
  `;

  const find = id => allBooks.find(b => b.id === id);

  // Header, Stats & Ruleta aleatoria
  viewport.querySelector('#rbk-open-stats')?.addEventListener('click', () => {
    openReadingStatsModal(group, user, progMap);
  });

  viewport.querySelector('#rbk-roulette-btn')?.addEventListener('click', () => {
    if (!pendingUnlocked.length) return;
    const picked = pendingUnlocked[Math.floor(Math.random() * pendingUnlocked.length)];
    fireConfetti({ particleCount: 75, spread: 68, origin: { y: 0.6 } });
    UI.showToast(`🎲 ¡La ruleta eligió "${picked.title}"! 📚`, 'success');
    openBookDetailModal(picked.id, user, { openReviewModal, openMediaCommentsModal, onQuoteBook });
  });

  const handleAddClick = () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openAddBookModal(group);
  };
  viewport.querySelector('#rbk-add-btn')?.addEventListener('click', handleAddClick);

  const resetAllFilters = () => {
    booksUiState.search = '';
    booksUiState.genre = 'all';
    booksUiState.author = 'all';
    booksUiState.rating = 'all';
    booksUiState.format = 'all';
    booksUiState.onlyMine = false;
    booksUiState.sort = 'recent';
    setFilterState('all');
    rerender();
  };

  const bindBooksSlotEvents = (slotEl) => {
    if (!slotEl) return;

    slotEl.querySelector('#rbk-add-empty')?.addEventListener('click', handleAddClick);
    slotEl.querySelector('#rbk-reset-empty')?.addEventListener('click', resetAllFilters);

    slotEl.querySelector('[data-club-open]')?.addEventListener('click', () => {
      if (clubBook) openBookDetailModal(clubBook.id, user, { openReviewModal, openMediaCommentsModal, onQuoteBook });
    });
    slotEl.querySelector('[data-club-timer]')?.addEventListener('click', e => {
      e.stopPropagation();
      if (clubBook) openReadingSessionModal(clubBook.id, user, () => rerender());
    });

    slotEl.querySelectorAll('[data-rbk-card]').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-rbk-card');
        if (lockedIds.has(id)) {
          UI.showUpgradeModal(
            'En el Plan Free el límite es de 5 libros por grupo. Los más recientes quedaron bloqueados; activa ruma Plus para desbloquearlos.',
            () => store.upgradeGroupToPremium(group.id)
          );
          return;
        }
        const b = find(id);
        if (b) openBookDetailModal(b.id, user, { openReviewModal, openMediaCommentsModal, onQuoteBook });
      });
    });

    slotEl.querySelectorAll('[data-rbk-status]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const b = find(btn.getAttribute('data-rbk-status'));
        if (b) openBookProgressModal(b, user, openReviewModal);
      });
    });

    slotEl.querySelectorAll('[data-rbk-timer]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const b = find(btn.getAttribute('data-rbk-timer'));
        if (b) openReadingSessionModal(b.id, user);
      });
    });

    slotEl.querySelectorAll('[data-rbk-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-rbk-act');
        const mode = btn.getAttribute('data-rbk-act-mode');
        const b = find(id);
        if (!b) return;
        if (mode === 'progress') {
          openBookProgressModal(b, user, openReviewModal);
        } else if (mode === 'start' || mode === 'resume') {
          store.setUserBookProgress(b.id, { status: 'Leyendo' });
          UI.showToast(`Empezaste a leer "${b.title}"`, 'success');
        } else if (mode === 'rate') {
          openReviewModal('books', b, user);
        }
      });
    });

    slotEl.querySelectorAll('[data-rbk-social]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const b = find(btn.getAttribute('data-rbk-social'));
        if (b) openBookDetailModal(b.id, user, { openReviewModal, openMediaCommentsModal, onQuoteBook, initialTab: 'comments' });
      });
    });

    slotEl.querySelectorAll('[data-rbk-more]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const b = find(btn.getAttribute('data-rbk-more'));
        if (!b) return;
        openBookOptionsMenu(group, b, user, { openReviewModal, openMediaCommentsModal, onQuoteBook });
      });
    });
  };

  // Filtros de estado
  viewport.querySelectorAll('[data-rbk-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilterState(btn.getAttribute('data-rbk-filter'));
      rerender();
    });
  });

  // Búsqueda local en vivo sin destruir el input (estable en iPhone / Safari iOS)
  const searchInp = viewport.querySelector('#rbk-search-inp');
  const clearBtn = viewport.querySelector('#rbk-search-clear');
  const resultsSlot = viewport.querySelector('#rbk-results-slot');

  searchInp?.addEventListener('input', e => {
    booksUiState.search = e.target.value;
    if (clearBtn) clearBtn.hidden = !booksUiState.search;
    if (resultsSlot) {
      resultsSlot.innerHTML = buildBooksSlotHtml();
      bindBooksSlotEvents(resultsSlot);
    }
  });
  searchInp?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchInp.blur();
    }
  });

  clearBtn?.addEventListener('click', () => {
    booksUiState.search = '';
    if (searchInp) {
      searchInp.value = '';
      searchInp.focus();
    }
    clearBtn.hidden = true;
    if (resultsSlot) {
      resultsSlot.innerHTML = buildBooksSlotHtml();
      bindBooksSlotEvents(resultsSlot);
    }
  });

  // Filtros avanzados
  viewport.querySelector('#rbk-adv-btn')?.addEventListener('click', () => {
    openAdvancedFiltersModal(allBooks, filterState, setFilterState, rerender);
  });

  viewport.querySelectorAll('[data-rbk-rm-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.getAttribute('data-rbk-rm-filter');
      if (k === 'genre') booksUiState.genre = 'all';
      else if (k === 'author') booksUiState.author = 'all';
      else if (k === 'rating') booksUiState.rating = 'all';
      else if (k === 'format') booksUiState.format = 'all';
      else if (k === 'onlyMine') booksUiState.onlyMine = false;
      else if (k === 'sort') booksUiState.sort = 'recent';
      rerender();
    });
  });

  viewport.querySelector('#rbk-clear-all')?.addEventListener('click', resetAllFilters);

  bindBooksSlotEvents(resultsSlot);
}

function renderClubBookHero(book, group, user) {
  const members = (group.members || []).map(m => {
    const p = store.getUserBookProgress(book, m.id);
    const pct = getBookPct(book, p);
    return {
      id: m.id,
      name: m.id === user.id ? `${m.name.split(' ')[0]} (tú)` : m.name.split(' ')[0],
      avatar: m.avatar || 'assets/ruma_default_avatar.png',
      status: p.status,
      pct,
      currentPage: p.currentPage,
      format: p.format
    };
  }).sort((a, b) => b.pct - a.pct);

  const activeReaders = members.filter(m => m.status === 'Leyendo' || m.status === 'Leído' || m.id === user.id).slice(0, 5);
  const total = Number(book.pages || 0);

  return `
    <section class="rbk-club-card" data-club-open="${esc(book.id)}">
      <div class="rbk-club-head">
        <span class="rbk-club-badge">${svg(ICO.pin, 12)} Lectura actual del club</span>
        <button type="button" class="rbk-timer-mini-btn" data-club-timer="${esc(book.id)}">${svg(ICO.timer, 13)} Leer ahora</button>
      </div>
      <div class="rbk-club-body">
        <img class="rbk-club-cover" src="${esc(book.poster || DEFAULT_COVER)}" alt="${esc(book.title)}">
        <div class="rbk-club-info">
          <h3>${esc(book.title)}</h3>
          <p>${esc([book.author || 'Autor desconocido', total > 0 ? `${total} pág.` : ''].filter(Boolean).join(' · '))}</p>
        </div>
      </div>
      ${activeReaders.length > 0 ? `
        <div class="rbk-club-race">
          ${activeReaders.map(r => `
            <div class="rbk-race-row">
              <img src="${esc(r.avatar)}" alt="${esc(r.name)}">
              <div class="rbk-race-meta">
                <div class="rbk-race-top">
                  <b>${esc(r.name)} <small style="color:var(--text-muted);font-weight:600;">· ${esc(r.status)}</small></b>
                  <span>${r.pct}%</span>
                </div>
                <div class="rbk-prog-track"><i class="rbk-prog-fill" style="width:${r.pct}%"></i></div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

function renderBookCard(book, prog, user, isLocked, isClubBook, userPace) {
  const id = esc(book.id);
  const st = statusMeta(prog?.status || 'Por leer');
  const fmt = formatMeta(prog?.format || 'physical');
  const total = Number(book.pages || 0);
  const pct = getBookPct(book, prog || { status: 'Por leer', currentPage: 0, percent: 0 });
  const myRating = book.ratings?.[user.id];
  const groupAvg = getAverage(book);
  const commentsCount = (book.comments || []).length;
  const reviewsCount = Object.keys(book.ratings || {}).length;
  const quotesCount = (book.quotes || []).length;
  const authorYear = [book.author || 'Autor desconocido', book.year, total > 0 ? `${total} pág.` : ''].filter(Boolean).join(' · ');

  const remainingPages = total > 0 ? Math.max(0, total - Number(prog?.currentPage || 0)) : 0;
  const remainingTime = (st.id === 'Leyendo' && fmt.id !== 'audiobook' && remainingPages > 0)
    ? BooksApi.estimateReadingTime(remainingPages, userPace)
    : '';

  let primaryActHtml = '';
  if (!isLocked) {
    if (st.id === 'Leyendo') {
      primaryActHtml = `
        <div class="rbk-card-actions">
          <button type="button" class="rbk-primary-act accent" data-rbk-act="${id}" data-rbk-act-mode="progress">Progreso</button>
          <button type="button" class="rbk-timer-mini-btn" data-rbk-timer="${id}" title="Iniciar sesión cronometrada">${svg(ICO.timer, 12)} Leer</button>
        </div>
      `;
    } else if (st.id === 'Por leer') {
      primaryActHtml = `<button type="button" class="rbk-primary-act" data-rbk-act="${id}" data-rbk-act-mode="start">Empezar a leer</button>`;
    } else if (st.id === 'Leído') {
      primaryActHtml = `<button type="button" class="rbk-primary-act" data-rbk-act="${id}" data-rbk-act-mode="rate">${myRating ? 'Editar reseña' : 'Calificar'}</button>`;
    } else {
      primaryActHtml = `<button type="button" class="rbk-primary-act" data-rbk-act="${id}" data-rbk-act-mode="resume">Retomar</button>`;
    }
  }

  let ratingHtml = '';
  if (myRating) {
    ratingHtml = `<span class="rbk-rating-tag">★ ${Number(myRating.score).toFixed(1)} <small>tú</small></span>`;
  } else if (groupAvg !== null) {
    ratingHtml = `<span class="rbk-rating-tag">★ ${Number(groupAvg).toFixed(1)}</span>`;
  } else if (book.externalRating?.score) {
    ratingHtml = `<span class="rbk-ext-rating" title="Referencia ${esc(book.externalRating.source || '')}">★ ${Number(book.externalRating.score).toFixed(1)} <small>ref.</small></span>`;
  }

  const progLeftLabel = fmt.id === 'audiobook'
    ? `🎧 Audiolibro · ${pct}%`
    : (total > 0
        ? `Pág. ${prog.currentPage} de ${total}${remainingTime ? ` · ${remainingTime}` : ''}`
        : (prog.currentPage > 0 ? `Página ${prog.currentPage}` : (pct > 0 ? `${pct}% avanzado` : 'Añade total de páginas')));

  return `
    <article class="rbk-card ${isLocked ? 'is-locked' : ''}" data-rbk-card="${id}">
      <div class="rbk-cover-wrap">
        <img class="rbk-cover" src="${esc(book.poster || DEFAULT_COVER)}" alt="${esc(book.title)}" loading="lazy">
        ${isLocked ? `<div class="rbk-cover-lock" aria-hidden="true">🔒</div>` : ''}
      </div>

      <div class="rbk-info">
        <div class="rbk-card-head">
          <div class="rbk-card-titles">
            <h3 class="rbk-title">${esc(book.title)}</h3>
            <div class="rbk-author">${esc(authorYear)}</div>
          </div>
          ${!isLocked ? `<button type="button" class="rbk-more-btn" data-rbk-more="${id}" aria-label="Opciones de ${esc(book.title)}">⋯</button>` : ''}
        </div>

        <div class="rbk-meta-row">
          ${isLocked
            ? `<span class="rbk-status-pill st-dropped">🔒 Plan Free</span>`
            : `<button type="button" class="rbk-status-pill ${st.cls}" data-rbk-status="${id}" title="Cambiar estado de lectura">
                <span class="rbk-status-dot"></span>${st.label}
              </button>`}
          ${isClubBook ? `<span class="rbk-club-mini">📌 Club</span>` : ''}
          ${!isLocked && prog?.format && prog.format !== 'physical' ? `<span class="rbk-format-chip">${fmt.icon} ${fmt.label}</span>` : ''}
          ${ratingHtml}
        </div>

        ${isLocked ? `
          <div class="rbk-locked-note">Excede el límite de 5 libros del Plan Free · Toca para desbloquear</div>
        ` : st.id === 'Leyendo' ? `
          <div class="rbk-prog-box">
            <div class="rbk-prog-head">
              <span>${esc(progLeftLabel)}</span>
              ${(total > 0 || pct > 0) ? `<b>${pct}%</b>` : ''}
            </div>
            <div class="rbk-prog-track"><i class="rbk-prog-fill" style="width:${(total > 0 || pct > 0) ? pct : (prog.currentPage > 0 ? 15 : 4)}%"></i></div>
          </div>
        ` : ''}

        ${!isLocked ? `
          <div class="rbk-card-footer">
            ${primaryActHtml}
            <div class="rbk-social-mini">
              ${(commentsCount + reviewsCount + quotesCount) > 0 ? `
                <button type="button" class="rbk-ghost-act" data-rbk-social="${id}" title="Reseñas, citas y comentarios">
                  ${svg(ICO.comment, 13)}<span>${commentsCount + reviewsCount + quotesCount}</span>
                </button>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    </article>
  `;
}

// ============================================================================
// MENÚ DE OPCIONES SECUNDARIAS (⋯) — ACTION SHEET MÓVIL
// ============================================================================
function openBookOptionsMenu(group, book, user, ctx) {
  const { openReviewModal, onQuoteBook } = ctx;
  const canDelete = store.canDeleteMediaItem(group, book, user);
  const proposer = book.proposedBy?.name || book.addedBy || 'Miembro';
  const prog = store.getUserBookProgress(book, user.id);
  const total = Number(book.pages || 0);
  const isClub = group.clubBookId === book.id;
  const subtitle = [book.author || 'Autor desconocido', total > 0 ? `${total} pág.` : 'Sin páginas'].join(' · ');

  UI.openModal({
    title: 'Opciones del libro',
    contentHtml: `
      <div class="rbk-sheet">
        <div class="rbk-sheet-head">
          <img src="${esc(book.poster || DEFAULT_COVER)}" alt="">
          <div class="rbk-sheet-head-txt">
            <b>${esc(book.title)}</b>
            <small>${esc(subtitle)}</small>
          </div>
        </div>

        <div>
          <div class="rbk-seg-label">Estado de lectura</div>
          <div class="rbk-status-grid">
            ${STATUSES.map(s => `
              <button type="button" class="rbk-st-opt ${prog.status === s.id ? 'active' : ''}" data-opt-st="${s.id}">
                ${s.label}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="rbk-sheet-list">
          <button type="button" class="rbk-sheet-row" id="rbk-opt-club">
            <span class="rbk-sheet-ico">${svg(ICO.pin, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>${isClub ? 'Quitar de lectura del club' : 'Fijar como lectura del club'}</span><small>Destaca este libro arriba con el avance de todos</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-timer">
            <span class="rbk-sheet-ico">${svg(ICO.timer, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Iniciar sesión de lectura</span><small>Cronómetro con cálculo de ritmo y racha</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-detail">
            <span class="rbk-sheet-ico">${svg(ICO.book, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Ver ficha completa</span><small>Sinopsis, citas, reseñas y más del autor</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-prog">
            <span class="rbk-sheet-ico">${svg(ICO.bookmark, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Actualizar progreso y formato</span><small>${total > 0 ? `Página ${prog.currentPage} de ${total}` : `${prog.percent}% · ${formatMeta(prog.format).label}`}</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-edit">
            <span class="rbk-sheet-ico">${svg(ICO.edit, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Editar ficha y portada</span><small>Título, autor, páginas, editorial, sinopsis o portada</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-rate">
            <span class="rbk-sheet-ico">${svg(ICO.star, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Calificar / Escribir reseña</span><small>Comparte tu puntuación con el club</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-quotes">
            <span class="rbk-sheet-ico">${svg(ICO.quote, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Citas favoritas</span><small>${(book.quotes || []).length} frase${(book.quotes || []).length === 1 ? '' : 's'} guardada${(book.quotes || []).length === 1 ? '' : 's'}</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-quote-chat">
            <span class="rbk-sheet-ico">${svg(ICO.comment, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Compartir libro en el chat</span><small>Envía este libro a la conversación del grupo</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          ${canDelete ? `
            <button type="button" class="rbk-sheet-row danger" id="rbk-opt-del">
              <span class="rbk-sheet-ico">${svg(ICO.trash, 17)}</span>
              <span class="rbk-sheet-row-txt"><span>Eliminar libro</span><small>Añadido por ${esc(proposer)}</small></span>
            </button>
          ` : `
            <div style="font-size:0.74rem;color:var(--text-muted);text-align:center;padding:0.45rem;border-radius:0.8rem;background:var(--surface-secondary);">
              Añadido por <b>${esc(proposer)}</b> · Solo quien lo añadió o el líder pueden eliminarlo.
            </div>
          `}
        </div>
      </div>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-opt-st]').forEach(btn => {
        btn.addEventListener('click', () => {
          const st = btn.getAttribute('data-opt-st');
          store.setUserBookProgress(book.id, { status: st });
          UI.closeModal();
          if (st === 'Leído') fireConfetti({ particleCount: 80, spread: 70, origin: { y: 0.65 } });
          UI.showToast(`Estado actualizado a "${st}"`, 'success');
        });
      });

      const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { UI.closeModal(); fn(); });
      bind('rbk-opt-club', () => {
        const res = store.setGroupClubBook(book.id);
        UI.showToast(res ? `📌 "${book.title}" fijado como lectura del club` : 'Lectura del club removida', 'success');
      });
      bind('rbk-opt-timer', () => openReadingSessionModal(book.id, user));
      bind('rbk-opt-detail', () => openBookDetailModal(book.id, user, ctx));
      bind('rbk-opt-prog', () => openBookProgressModal(book, user, openReviewModal));
      bind('rbk-opt-edit', () => openEditBookMetaModal(book));
      bind('rbk-opt-rate', () => openReviewModal('books', book, user));
      bind('rbk-opt-quotes', () => openBookDetailModal(book.id, user, { ...ctx, initialTab: 'quotes' }));
      bind('rbk-opt-quote-chat', () => onQuoteBook(book));
      bind('rbk-opt-del', () => {
        const res = store.deleteMediaItem('books', book.id);
        UI.showToast(res.ok ? 'Libro eliminado' : res.error, res.ok ? 'info' : 'error');
      });
    }
  });
}

// ============================================================================
// EDITAR FICHA COMPLETA Y PORTADA PERSONALIZADA
// ============================================================================
function openEditBookMetaModal(book, onSaved) {
  let pendingPoster = book.poster || DEFAULT_COVER;

  const openForm = () => {
    UI.openModal({
      title: 'Editar ficha del libro',
      size: 'md',
      contentHtml: `
        <form id="rbk-edit-meta-form" style="display:flex;flex-direction:column;gap:0.8rem;">
          <div class="rbk-cover-picker">
            <img id="rbk-em-cover-img" src="${esc(pendingPoster)}" alt="Portada">
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0.3rem;">
              <b style="font-size:0.82rem;color:var(--text-primary);">Portada del libro</b>
              <span class="rbk-sub-note">Sube una imagen y recórtala en formato libro (2:3)</span>
              <div>
                <button type="button" class="btn btn-secondary btn-sm" id="rbk-em-pick-cover">📷 Cambiar portada</button>
                <input type="file" id="rbk-em-cover-file" accept="image/*" hidden>
              </div>
            </div>
          </div>

          <div class="rbk-mini-field">
            <label for="rbk-em-title">Título *</label>
            <input type="text" id="rbk-em-title" value="${esc(book.title || '')}" required>
          </div>
          <div class="rbk-mini-field">
            <label for="rbk-em-author">Autor *</label>
            <input type="text" id="rbk-em-author" value="${esc(book.author || '')}" required>
          </div>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
            <div class="rbk-mini-field">
              <label for="rbk-em-pages">Total de páginas</label>
              <input type="number" id="rbk-em-pages" min="0" value="${Number(book.pages || 0) || ''}" placeholder="Ej. 352">
            </div>
            <div class="rbk-mini-field">
              <label for="rbk-em-year">Año</label>
              <input type="text" id="rbk-em-year" maxlength="4" value="${esc(book.year || '')}" placeholder="Ej. 2021">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
            <div class="rbk-mini-field">
              <label for="rbk-em-pub">Editorial</label>
              <input type="text" id="rbk-em-pub" value="${esc(book.publisher || '')}" placeholder="Ej. Minotauro">
            </div>
            <div class="rbk-mini-field">
              <label for="rbk-em-isbn">ISBN-13</label>
              <input type="text" id="rbk-em-isbn" value="${esc(book.isbn13 || book.isbn10 || '')}" placeholder="978...">
            </div>
          </div>
          <div class="rbk-mini-field">
            <label for="rbk-em-genre">Géneros</label>
            <input type="text" id="rbk-em-genre" value="${esc(book.genres || '')}" placeholder="Ficción, Fantasía, Ensayo…">
          </div>
          <div class="rbk-mini-field">
            <label for="rbk-em-syn">Sinopsis</label>
            <textarea id="rbk-em-syn" class="form-textarea" rows="3" placeholder="Sinopsis del libro…">${esc(book.synopsis || '')}</textarea>
          </div>
          <div class="rbk-modal-foot">
            <button type="button" class="btn btn-secondary btn-sm" id="rbk-em-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar cambios</button>
          </div>
        </form>
      `,
      onMount: () => {
        const fileInp = document.getElementById('rbk-em-cover-file');
        document.getElementById('rbk-em-pick-cover')?.addEventListener('click', () => fileInp?.click());
        fileInp?.addEventListener('change', () => {
          const f = fileInp.files?.[0];
          if (!f) return;
          openImageCropperModal(f, {
            title: 'Encuadrar portada',
            aspectW: 2,
            aspectH: 3,
            radius: '12px',
            outW: 360,
            outH: 540,
            onCropped: (dataUrl) => {
              pendingPoster = dataUrl;
              openForm();
            }
          });
        });

        document.getElementById('rbk-em-cancel')?.addEventListener('click', () => {
          UI.closeModal();
          if (typeof onSaved === 'function') onSaved();
        });

        document.getElementById('rbk-edit-meta-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const title = document.getElementById('rbk-em-title').value.trim();
          const author = document.getElementById('rbk-em-author').value.trim();
          if (!title || !author) return;
          const pages = Math.max(0, Math.round(Number(document.getElementById('rbk-em-pages').value || 0)));
          const year = document.getElementById('rbk-em-year').value.trim();
          const publisher = document.getElementById('rbk-em-pub').value.trim();
          const rawIsbn = BooksApi.cleanIsbn(document.getElementById('rbk-em-isbn').value);
          const genres = document.getElementById('rbk-em-genre').value.trim();
          const synopsis = document.getElementById('rbk-em-syn').value.trim();

          const patch = {
            title,
            author,
            pages,
            year,
            publisher,
            genres,
            synopsis,
            poster: pendingPoster
          };
          if (rawIsbn.length === 13) patch.isbn13 = rawIsbn;
          else if (rawIsbn.length === 10) patch.isbn10 = rawIsbn;

          store.updateMediaItem('books', book.id, patch);
          UI.closeModal();
          UI.showToast('Ficha del libro actualizada', 'success');
          if (typeof onSaved === 'function') onSaved();
        });
      }
    });
  };

  openForm();
}

// ============================================================================
// TEMPORIZADOR DE SESIÓN DE LECTURA ("LEER AHORA")
// ============================================================================
function openReadingSessionModal(bookId, user, onFinished) {
  const group = store.getActiveGroup();
  const book = (group?.books || []).find(b => b.id === bookId);
  if (!book) return;

  const storageKey = `ruma_reading_timer_${book.id}`;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) {}

  let startedAt = saved?.startedAt || Date.now();
  let accumulatedMs = Number(saved?.accumulatedMs || 0);
  let running = saved ? Boolean(saved.running) : true;
  let tickTimer = null;
  let savingStep = false;

  const persistTimer = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ startedAt, accumulatedMs, running }));
    } catch (_) {}
  };
  const clearPersistedTimer = () => {
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
  };
  const getElapsedSec = () => {
    const ms = accumulatedMs + (running ? Math.max(0, Date.now() - startedAt) : 0);
    return Math.floor(ms / 1000);
  };
  const fmtClock = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  persistTimer();

  const stopInterval = () => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };

  const renderTimer = () => {
    const liveGroup = store.getActiveGroup();
    const liveBook = (liveGroup?.books || []).find(b => b.id === bookId) || book;
    const liveProg = store.getUserBookProgress(liveBook, user.id);
    const total = Number(liveBook.pages || 0);
    const isAudio = liveProg.format === 'audiobook' || total <= 0;
    const elapsedSec = getElapsedSec();
    const elapsedMin = Math.max(1, Math.round(elapsedSec / 60));

    renderModalInPlace({
      modalKey: `book-timer-${book.id}`,
      title: '⏱ Sesión de lectura',
      size: 'md',
      onClose: stopInterval,
      contentHtml: `
        <div class="rbk-timer-wrap">
          <div class="rbk-timer-book">
            <img src="${esc(liveBook.poster || DEFAULT_COVER)}" alt="">
            <div style="flex:1;min-width:0;">
              <b style="display:block;font-size:0.88rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(liveBook.title)}</b>
              <small class="rbk-sub-note">${isAudio ? `${formatMeta(liveProg.format).icon} Vas en ${liveProg.percent}%` : `Página actual: ${liveProg.currentPage} de ${total}`}</small>
            </div>
          </div>

          ${!savingStep ? `
            <div class="rbk-timer-clock" id="rbk-live-clock">${fmtClock(elapsedSec)}</div>
            <p class="rbk-sub-note">${running ? 'Lectura en curso… concéntrate en tu libro ✨' : 'Sesión en pausa'}</p>
            <div class="rbk-timer-controls">
              <button type="button" class="btn btn-secondary" id="rbk-tm-toggle">${running ? '⏸ Pausar' : '▶ Reanudar'}</button>
              <button type="button" class="btn btn-primary" id="rbk-tm-finish">✓ Terminar y registrar</button>
            </div>
            <button type="button" class="rbk-link-btn" id="rbk-tm-discard" style="color:var(--text-muted);font-size:0.76rem;">Descartar sesión</button>
          ` : `
            <form id="rbk-tm-save-form" style="width:100%;display:flex;flex-direction:column;gap:0.85rem;text-align:left;">
              <div class="rbk-prog-panel">
                <div style="font-size:0.84rem;font-weight:800;color:var(--primary);">Tiempo leído: ${formatDurationHuman(elapsedMin)}</div>
                <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
                  <div class="rbk-mini-field">
                    <label for="rbk-tm-min">Minutos</label>
                    <input type="number" id="rbk-tm-min" min="1" value="${elapsedMin}" required>
                  </div>
                  ${isAudio ? `
                    <div class="rbk-mini-field">
                      <label for="rbk-tm-end-pct">¿En qué % quedaste?</label>
                      <input type="number" id="rbk-tm-end-pct" min="0" max="100" value="${liveProg.percent}" required>
                    </div>
                  ` : `
                    <div class="rbk-mini-field">
                      <label for="rbk-tm-end-pg">¿En qué página quedaste?</label>
                      <input type="number" id="rbk-tm-end-pg" min="0" max="${total}" value="${liveProg.currentPage}" required>
                    </div>
                  `}
                </div>
              </div>
              <div class="rbk-modal-foot">
                <button type="button" class="btn btn-secondary btn-sm" id="rbk-tm-back">← Volver al reloj</button>
                <button type="submit" class="btn btn-primary btn-sm">Guardar sesión</button>
              </div>
            </form>
          `}
        </div>
      `,
      onMount: () => {
        stopInterval();
        if (!savingStep && running) {
          tickTimer = setInterval(() => {
            const el = document.getElementById('rbk-live-clock');
            if (el) el.textContent = fmtClock(getElapsedSec());
            else stopInterval();
          }, 1000);
        }

        document.getElementById('rbk-tm-toggle')?.addEventListener('click', () => {
          if (running) {
            accumulatedMs += Math.max(0, Date.now() - startedAt);
            running = false;
          } else {
            startedAt = Date.now();
            running = true;
          }
          persistTimer();
          renderTimer();
        });

        document.getElementById('rbk-tm-finish')?.addEventListener('click', () => {
          if (running) {
            accumulatedMs += Math.max(0, Date.now() - startedAt);
            running = false;
            persistTimer();
          }
          savingStep = true;
          renderTimer();
        });

        document.getElementById('rbk-tm-discard')?.addEventListener('click', () => {
          clearPersistedTimer();
          UI.closeModal();
          UI.showToast('Sesión descartada', 'info');
        });

        document.getElementById('rbk-tm-back')?.addEventListener('click', () => {
          savingStep = false;
          renderTimer();
        });

        document.getElementById('rbk-tm-save-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const mins = Math.max(1, Number(document.getElementById('rbk-tm-min')?.value || elapsedMin));
          const payload = { minutes: mins, format: liveProg.format };
          if (isAudio) payload.endPercent = Number(document.getElementById('rbk-tm-end-pct')?.value || 0);
          else payload.endPage = Number(document.getElementById('rbk-tm-end-pg')?.value || 0);

          const res = store.logBookReadingSession(liveBook.id, payload);
          clearPersistedTimer();
          UI.closeModal();
          if (res?.completed) {
            fireConfetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
            UI.showToast(`🎉 ¡Completaste "${liveBook.title}"! Sesión de ${formatDurationHuman(mins)} guardada`, 'success');
          } else if (res) {
            const extra = res.session.pagesRead > 0 ? ` · +${res.session.pagesRead} pág.` : '';
            UI.showToast(`Sesión guardada: ${formatDurationHuman(mins)}${extra} 🔥`, 'success');
          }
          if (typeof onFinished === 'function') onFinished();
        });
      }
    });
  };

  renderTimer();
}

// ============================================================================
// VISTA DETALLADA DEL LIBRO (FICHA RICA + 4 PESTAÑAS + SIN PARPADEO)
// ============================================================================
function openBookDetailModal(bookId, user, ctx) {
  const { openReviewModal, onQuoteBook, initialTab = 'reviews' } = ctx;
  let activeTab = initialTab; // 'reviews' | 'comments' | 'quotes' | 'author'
  let synopsisExpanded = false;
  let replyTarget = null; // { userId, authorName }
  let enrichment = null;
  let enrichmentLoading = false;
  let enrichmentTried = false;
  const revealedSpoilers = new Set();

  const ensureEnrichment = async (book) => {
    if (enrichmentTried || enrichmentLoading || !book) return;
    enrichmentLoading = true;
    enrichmentTried = true;
    renderModal();
    try {
      const data = await BooksApi.getBookEnrichment(book);
      enrichment = data;
      // Si el libro no tenía sinopsis o rating externo, guardarlo para futuras aperturas
      const patch = {};
      if (!book.synopsis && data?.workDescription) patch.synopsis = data.workDescription;
      if (!book.externalRating && data?.communityRating) patch.externalRating = data.communityRating;
      if (!book.openLibraryWorkKey && data?.workKey) patch.openLibraryWorkKey = data.workKey;
      if (!book.openLibraryAuthorKey && data?.authorKey) patch.openLibraryAuthorKey = data.authorKey;
      if (Object.keys(patch).length > 0) {
        store.applyMediaPatches(store.getActiveGroup()?.id, [{ category: 'books', itemId: book.id, patch }], true);
      }
    } catch (_) {
      enrichment = null;
    } finally {
      enrichmentLoading = false;
      const liveModal = document.getElementById('ruma-active-modal');
      if (liveModal && liveModal.getAttribute('data-modal-key') === `book-detail-${bookId}`) {
        renderModal();
      }
    }
  };

  const renderModal = () => {
    const group = store.getActiveGroup();
    const book = (group?.books || []).find(b => b.id === bookId);
    if (!book) { UI.closeModal(); return; }

    const prog = store.getUserBookProgress(book, user.id);
    const total = Number(book.pages || 0);
    const pct = getBookPct(book, prog);
    const avg = getAverage(book);
    const myRating = book.ratings?.[user.id];
    const genres = splitGenres(book.genres);
    const canDelete = store.canDeleteMediaItem(group, book, user);
    const isClub = group.clubBookId === book.id;
    const userStats = store.getUserReadingStats(group, user.id);
    const isAudioOrPct = prog.format === 'audiobook' || total <= 0;
    const totalEst = total > 0 ? BooksApi.estimateReadingTime(total, userStats.avgPagesPerHour) : '';
    const remEst = total > 0 && prog.status === 'Leyendo' && prog.currentPage < total
      ? BooksApi.estimateReadingTime(total - prog.currentPage, userStats.avgPagesPerHour)
      : '';
    const langLabel = BooksApi.formatLanguageLabel(book.language);
    const safePreview = Utils.safeUrl(book.previewUrl, '');
    const extRating = book.externalRating || enrichment?.communityRating || null;
    const displaySynopsis = book.synopsis || enrichment?.workDescription || '';

    // Lectores del grupo
    const readers = Object.entries(book.userProgress || {}).map(([uid, rp]) => {
      const m = (group.members || []).find(x => x.id === uid);
      const up = store.getUserBookProgress(book, uid);
      return {
        uid,
        name: m?.name || rp.userName || 'Miembro',
        avatar: m?.avatar || rp.userAvatar || 'assets/ruma_default_avatar.png',
        status: up.status,
        format: up.format,
        pct: getBookPct(book, up)
      };
    });

    const reviews = Object.entries(book.ratings || {}).sort(([a], [b]) => (a === user.id ? -1 : b === user.id ? 1 : 0));
    const comments = book.comments || [];
    const quotes = book.quotes || [];

    if (activeTab === 'author' && !enrichmentTried) {
      setTimeout(() => ensureEnrichment(book), 0);
    }

    renderModalInPlace({
      modalKey: `book-detail-${bookId}`,
      title: book.title,
      size: 'lg',
      contentHtml: `
        <div class="rbk-det">
          <!-- Hero editorial -->
          <div class="rbk-det-hero">
            <img class="rbk-det-cover" src="${esc(book.poster || DEFAULT_COVER)}" alt="${esc(book.title)}">
            <div class="rbk-det-meta">
              <h2 class="rbk-det-title">${esc(book.title)}</h2>
              ${book.subtitle ? `<div class="rbk-sub-note">${esc(book.subtitle)}</div>` : ''}
              <div class="rbk-det-author">${esc(book.author || 'Autor desconocido')}</div>
              <div class="rbk-det-facts">
                ${book.year ? `<span class="rbk-fact-chip">${esc(book.year)}</span>` : ''}
                ${total > 0
                  ? `<button type="button" class="rbk-fact-chip" id="rbk-det-edit-pages" style="cursor:pointer;font-family:inherit;" title="Editar ficha y portada">${total} pág. ✎</button>`
                  : `<button type="button" class="rbk-fact-btn" id="rbk-det-edit-pages">+ Añadir páginas</button>`}
                ${totalEst ? `<span class="rbk-fact-chip" title="Tiempo estimado de lectura">⏱ ${esc(totalEst)}</span>` : ''}
                ${book.publisher ? `<span class="rbk-fact-chip">${esc(book.publisher)}</span>` : ''}
                ${langLabel ? `<span class="rbk-fact-chip">🌐 ${esc(langLabel)}</span>` : ''}
                ${book.isbn13 ? `<span class="rbk-fact-chip rbk-isbn-chip">ISBN ${esc(book.isbn13)}</span>` : ''}
                ${genres.slice(0, 3).map(g => `<span class="rbk-fact-chip">${esc(g)}</span>`).join('')}
              </div>
              <div class="rbk-det-ratings">
                <span class="rbk-rating-tag">★ ${avg !== null ? Number(avg).toFixed(1) : '—'} <small>grupo${reviews.length ? ` (${reviews.length})` : ''}</small></span>
                ${myRating ? `<span class="rbk-rating-tag">★ ${Number(myRating.score).toFixed(1)} <small>tu nota</small></span>` : ''}
                ${extRating?.score ? `<span class="rbk-ext-rating">★ ${Number(extRating.score).toFixed(1)} <small>${esc(extRating.source || 'global')}${extRating.count ? ` · ${extRating.count}` : ''}</small></span>` : ''}
              </div>
            </div>
          </div>

          <!-- Acciones rápidas de club y lectura -->
          <div class="rbk-quick-bar">
            <button type="button" class="rbk-quick-pill is-primary" id="rbk-det-start-timer">${svg(ICO.timer, 14)} Leer ahora</button>
            <button type="button" class="rbk-quick-pill ${isClub ? 'is-active' : ''}" id="rbk-det-toggle-club">
              ${svg(ICO.pin, 14)} ${isClub ? 'Lectura del club ✓' : 'Fijar lectura del club'}
            </button>
            ${safePreview ? `
              <a class="rbk-quick-pill" href="${esc(safePreview)}" target="_blank" rel="noopener noreferrer">📖 Vista previa ↗</a>
            ` : ''}
            <button type="button" class="rbk-quick-pill" id="rbk-det-edit-full">${svg(ICO.edit, 13)} Editar</button>
          </div>

          <!-- Estado y Formato de lectura -->
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <div>
              <div class="rbk-seg-label">Tu estado de lectura</div>
              <div class="rbk-status-grid">
                ${STATUSES.map(s => `
                  <button type="button" class="rbk-st-opt ${prog.status === s.id ? 'active' : ''}" data-det-st="${s.id}">
                    ${s.label}
                  </button>
                `).join('')}
              </div>
            </div>

            <div>
              <div class="rbk-seg-label">Formato</div>
              <div class="rbk-format-row">
                ${FORMATS.map(f => `
                  <button type="button" class="rbk-format-opt ${prog.format === f.id ? 'active' : ''}" data-det-fmt="${f.id}">
                    ${f.icon} ${f.label}
                  </button>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Progreso de lectura integrado (Páginas o Porcentaje para audiolibro) -->
          ${prog.status === 'Leyendo' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-prog-panel-top">
                <div>
                  <div class="rbk-seg-label" style="margin:0;">Progreso de lectura</div>
                  <div class="rbk-sub-note" style="margin-top:0.15rem;">
                    ${isAudioOrPct
                      ? `${formatMeta(prog.format).icon} Avance al ${pct}%${total > 0 ? ` (~pág. ${prog.currentPage})` : ''}`
                      : `Página ${prog.currentPage} de ${total}${remEst ? ` · Restan ${remEst}` : ''}`}
                  </div>
                </div>
                <div class="rbk-prog-pct">${pct}%</div>
              </div>
              <div class="rbk-prog-track"><i class="rbk-prog-fill" style="width:${pct}%"></i></div>

              ${isAudioOrPct ? `
                <div>
                  <div class="rbk-seg-label" style="margin-bottom:0.35rem;">Avance rápido (%)</div>
                  <div class="rbk-quick-steps">
                    ${[5, 10, 15, 25].map(step => `<button type="button" class="rbk-step-btn" data-det-pct-step="${step}">+${step}%</button>`).join('')}
                  </div>
                </div>
                <form id="rbk-det-pct-form" style="display:flex;align-items:center;gap:0.55rem;flex-wrap:wrap;">
                  <input type="range" id="rbk-det-pct-range" min="0" max="100" value="${pct}" style="flex:1;min-width:140px;accent-color:var(--primary-solid);">
                  <input type="number" id="rbk-det-pct-num" class="form-input" min="0" max="100" value="${pct}" style="width:78px;padding:0.45rem 0.6rem;">
                  <button type="submit" class="btn btn-primary btn-sm">Guardar %</button>
                </form>
              ` : `
                <div>
                  <div class="rbk-seg-label" style="margin-bottom:0.35rem;">Avance rápido (páginas)</div>
                  <div class="rbk-quick-steps">
                    ${[5, 10, 25, 50].map(step => `<button type="button" class="rbk-step-btn" data-det-step="${step}">+${step}</button>`).join('')}
                  </div>
                </div>
                <form id="rbk-det-prog-form" class="rbk-prog-inputs">
                  <div class="rbk-mini-field">
                    <label for="rbk-det-cur">Página actual</label>
                    <input type="number" id="rbk-det-cur" min="0" max="${total}" value="${prog.currentPage}">
                  </div>
                  <div class="rbk-mini-field">
                    <label for="rbk-det-tot">Total páginas</label>
                    <input type="number" id="rbk-det-tot" min="0" value="${total}">
                  </div>
                  <button type="submit" class="btn btn-primary btn-sm rbk-prog-save">Guardar progreso</button>
                </form>
              `}
            </div>
          ` : prog.status === 'Leído' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-prog-panel-top">
                <div>
                  <div class="rbk-done-title">Lectura completada</div>
                  <div class="rbk-sub-note" style="margin-top:0.12rem;">
                    ${prog.finishedAt ? `Finalizado el ${esc(formatFinishDate(prog.finishedAt))}` : 'Puedes añadir tu fecha de finalización o calificación.'}
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="rbk-det-edit-done">Editar fecha</button>
              </div>
            </div>
          ` : ''}

          <!-- Sinopsis -->
          ${displaySynopsis ? `
            <div style="display:flex;flex-direction:column;gap:0.2rem;">
              <div class="rbk-seg-label" style="margin-bottom:0.15rem;">Sinopsis</div>
              <p class="rbk-synopsis ${synopsisExpanded ? '' : 'clamped'}" id="rbk-det-syn">${esc(displaySynopsis)}</p>
              ${displaySynopsis.length > 220 ? `<button type="button" class="rbk-link-btn" id="rbk-det-syn-toggle">${synopsisExpanded ? 'Ver menos' : 'Leer sinopsis completa'}</button>` : ''}
            </div>
          ` : ''}

          <!-- Lectores del grupo -->
          ${readers.length > 0 ? `
            <div>
              <div class="rbk-seg-label">En el grupo</div>
              <div class="rbk-readers-list">
                ${readers.map(r => `
                  <span class="rbk-reader-pill">
                    <img src="${esc(r.avatar)}" alt="${esc(r.name)}">
                    <span><b>${esc(r.name)}</b> <small>· ${formatMeta(r.format).icon} ${esc(r.status)}${r.status === 'Leyendo' && r.pct > 0 ? ` (${r.pct}%)` : ''}</small></span>
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Sección social y descubrimiento (4 pestañas) -->
          <div style="display:flex;flex-direction:column;gap:0.7rem;">
            <div class="rbk-social-tabs is-quad" role="tablist">
              <button type="button" class="rbk-social-tab ${activeTab === 'reviews' ? 'active' : ''}" data-det-tab="reviews">Reseñas (${reviews.length})</button>
              <button type="button" class="rbk-social-tab ${activeTab === 'comments' ? 'active' : ''}" data-det-tab="comments">Comentarios (${comments.length})</button>
              <button type="button" class="rbk-social-tab ${activeTab === 'quotes' ? 'active' : ''}" data-det-tab="quotes">Citas (${quotes.length})</button>
              <button type="button" class="rbk-social-tab ${activeTab === 'author' ? 'active' : ''}" data-det-tab="author">Autor y más</button>
            </div>

            ${activeTab === 'reviews' ? `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                <span style="font-size:0.8rem;color:var(--text-muted);">${reviews.length ? `${reviews.length} opinión${reviews.length === 1 ? '' : 'es'} del grupo` : 'Sé el primero en calificar este libro'}</span>
                <button type="button" class="btn btn-primary btn-sm" id="rbk-det-write-rev">${myRating ? 'Editar mi reseña' : '+ Escribir reseña'}</button>
              </div>
              ${reviews.length === 0 ? `
                <div class="rbk-empty" style="padding:1.2rem 1rem;">
                  <span>Nadie del grupo ha compartido una reseña todavía.</span>
                </div>
              ` : `
                <div style="display:flex;flex-direction:column;gap:0.55rem;">
                  ${reviews.map(([uid, r]) => {
                    const member = (group.members || []).find(m => m.id === uid) || {};
                    const name = member.name || r.userName || 'Miembro';
                    const avatar = member.avatar || r.userAvatar || 'assets/ruma_default_avatar.png';
                    const reviewReplies = comments.filter(c => c.replyToReviewUserId === uid);
                    return `
                      <div class="rbk-review-card ${uid === user.id ? 'mine' : ''}">
                        <div class="rbk-review-head">
                          <img src="${esc(avatar)}" alt="${esc(name)}">
                          <div class="rbk-review-author">
                            <b>${esc(name)}${uid === user.id ? ' (tú)' : ''}</b>
                            <small>${esc(r.progressLabel || 'Reseña del grupo')}</small>
                          </div>
                          <span class="rbk-review-score" style="background:${scoreColor(r.score)};color:#fff;">★ ${Number(r.score).toFixed(1)}</span>
                        </div>
                        ${r.tags?.length ? `<div class="rv-item-tags">${r.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
                        ${r.review ? `<p class="rbk-review-text">“${esc(r.review)}”</p>` : ''}
                        ${reviewReplies.length > 0 ? `
                          <div class="rbk-review-replies">
                            ${reviewReplies.map(rep => `<div class="rbk-reply-line"><b>${esc(rep.authorName || rep.userName)}:</b> ${esc(rep.text)}</div>`).join('')}
                          </div>
                        ` : ''}
                        <div style="display:flex;justify-content:flex-end;">
                          <button type="button" class="rbk-link-btn" data-reply-rev="${esc(uid)}" data-reply-name="${esc(name)}" style="font-size:0.74rem;">Comentar reseña</button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `}
            ` : activeTab === 'comments' ? `
              <div style="display:flex;flex-direction:column;gap:0.55rem;">
                ${comments.length === 0 ? `
                  <div class="rbk-empty" style="padding:1.2rem 1rem;">
                    <span>Aún no hay comentarios. Puedes activar el escudo anti-spoilers para comentar capítulos avanzados.</span>
                  </div>
                ` : comments.map(c => {
                  const rx = c.reactions || { '❤️': 0, '🔥': 0, '😂': 0 };
                  const isSpoiler = Boolean(c.isSpoiler);
                  const isRevealed = revealedSpoilers.has(c.id);
                  return `
                    <div class="rbk-comment-card">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;font-size:0.76rem;">
                        <strong style="color:var(--text-primary);">${esc(c.authorName || c.userName)}${c.userProgressLabel ? ` <span style="font-weight:600;color:var(--text-secondary);">· ${esc(c.userProgressLabel)}</span>` : ''}</strong>
                        <span style="color:var(--text-muted);">${esc(c.time || 'Reciente')}</span>
                      </div>
                      ${c.replyToReviewAuthor ? `<div class="rbk-comment-quote">En respuesta a la reseña de ${esc(c.replyToReviewAuthor)}</div>` : ''}
                      ${isSpoiler ? `
                        <div class="rbk-spoiler-box ${isRevealed ? 'revealed' : ''}" data-toggle-spoiler="${esc(c.id)}">
                          <div class="rbk-spoiler-head">
                            <span>⚠️ Spoiler${c.spoilerLabel ? ` · ${esc(c.spoilerLabel)}` : ''}</span>
                            <span style="color:var(--primary);">${isRevealed ? 'Ocultar' : 'Toca para revelar'}</span>
                          </div>
                          <p class="rbk-spoiler-blur" style="margin:0;font-size:0.84rem;color:var(--text-primary);line-height:1.45;">${esc(c.text)}</p>
                        </div>
                      ` : `
                        <p style="margin:0;font-size:0.84rem;color:var(--text-primary);line-height:1.45;">${esc(c.text)}</p>
                      `}
                      <div style="display:flex;gap:0.35rem;margin-top:0.15rem;">
                        ${['❤️', '🔥', '😂'].map(em => `
                          <button type="button" class="rbk-ghost-act" style="min-height:26px;padding:0.1rem 0.45rem;font-size:0.72rem;" data-det-react="${esc(c.id)}" data-det-em="${em}">${em} ${rx[em] || 0}</button>
                        `).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}

                ${replyTarget ? `
                  <div class="rbk-reply-banner">
                    <span>Respondiendo a la reseña de <b>${esc(replyTarget.authorName)}</b></span>
                    <button type="button" id="rbk-cancel-reply" aria-label="Cancelar respuesta">✕</button>
                  </div>
                ` : ''}

                <form id="rbk-det-comm-form" style="display:flex;flex-direction:column;gap:0.4rem;">
                  <div class="rbk-comment-form" style="margin:0;">
                    <input type="text" id="rbk-det-comm-inp" class="form-input" placeholder="${replyTarget ? `Responder a ${esc(replyTarget.authorName)}…` : 'Escribe un comentario para el grupo…'}" required>
                    <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
                  </div>
                  <div class="rbk-spoiler-bar">
                    <label class="rbk-spoiler-check">
                      <input type="checkbox" id="rbk-det-spoiler-chk">
                      <span>⚠️ Marcar como spoiler</span>
                    </label>
                    <input type="text" id="rbk-det-spoiler-lbl" class="rbk-spoiler-page-inp" placeholder="${prog.currentPage > 0 ? `Ej. Pág. ${prog.currentPage}` : 'Ej. Cap. 5 / Pág. 120'}" style="display:none;">
                  </div>
                </form>
              </div>
            ` : activeTab === 'quotes' ? `
              <div style="display:flex;flex-direction:column;gap:0.65rem;">
                <form id="rbk-quote-form" class="rbk-quote-form">
                  <textarea id="rbk-qt-text" class="form-textarea" rows="2" placeholder="Guarda una frase o pasaje memorable de este libro…" required></textarea>
                  <div style="display:flex;gap:0.45rem;align-items:center;flex-wrap:wrap;">
                    <input type="text" id="rbk-qt-page" class="form-input" placeholder="Página (opcional)" value="${prog.currentPage > 0 ? esc(String(prog.currentPage)) : ''}" style="flex:0 0 120px;padding:0.5rem 0.7rem;">
                    <input type="text" id="rbk-qt-note" class="form-input" placeholder="¿Por qué te gustó? (opcional)" style="flex:1;min-width:140px;padding:0.5rem 0.7rem;">
                    <button type="submit" class="btn btn-primary btn-sm">+ Guardar cita</button>
                  </div>
                </form>

                ${quotes.length === 0 ? `
                  <div class="rbk-empty" style="padding:1.2rem 1rem;">
                    <span>Aún no hay frases guardadas. Guarda tus pasajes favoritos y compártelos en el chat del grupo.</span>
                  </div>
                ` : quotes.map(qItem => {
                  const canDelQuote = qItem.authorId === user.id || Entitlements.isGroupAdmin(group, user.id);
                  return `
                    <article class="rbk-quote-card">
                      <p class="rbk-quote-text">“${esc(qItem.text)}”</p>
                      ${qItem.note ? `<p class="rbk-quote-note">${esc(qItem.note)}</p>` : ''}
                      <div class="rbk-quote-foot">
                        <span><b>${esc(qItem.authorName || 'Miembro')}</b>${qItem.page ? ` · Pág. ${esc(qItem.page)}` : ''}</span>
                        <div class="rbk-quote-acts">
                          <button type="button" class="rbk-ghost-act" data-share-quote="${esc(qItem.id)}" style="padding:0.15rem 0.55rem;min-height:26px;">💬 Enviar al chat</button>
                          ${canDelQuote ? `<button type="button" class="rbk-ghost-act" data-del-quote="${esc(qItem.id)}" style="color:var(--error);min-height:26px;" aria-label="Eliminar cita">✕</button>` : ''}
                        </div>
                      </div>
                    </article>
                  `;
                }).join('')}
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:0.75rem;">
                ${enrichmentLoading ? `
                  <div class="ruma-view-loading" style="min-height:140px;"><span class="ruma-spinner"></span><span>Consultando ficha del autor y obras relacionadas…</span></div>
                ` : `
                  ${enrichment?.author ? `
                    <div class="rbk-author-box">
                      ${enrichment.author.photo ? `<img class="rbk-author-photo" src="${esc(Utils.safeUrl(enrichment.author.photo, ''))}" alt="${esc(enrichment.author.name)}" data-hide-on-error="1">` : ''}
                      <div class="rbk-author-txt">
                        <b>${esc(enrichment.author.name)}</b>
                        <p>${esc(enrichment.author.bio || 'Sin biografía ampliada disponible todavía.')}</p>
                      </div>
                    </div>
                  ` : ''}

                  ${(enrichment?.subjects?.length || enrichment?.subjectPlaces?.length || enrichment?.subjectPeople?.length) ? `
                    <div>
                      <div class="rbk-seg-label">Temas, lugares y personajes</div>
                      <div class="rbk-tags-wrap">
                        ${[...(enrichment.subjectPlaces || []).map(x => `📍 ${x}`), ...(enrichment.subjectPeople || []).map(x => `👤 ${x}`), ...(enrichment.subjects || [])]
                          .slice(0, 12)
                          .map(tag => `<span class="rbk-fact-chip">${esc(tag)}</span>`).join('')}
                      </div>
                    </div>
                  ` : ''}

                  ${enrichment?.moreBooks?.length ? `
                    <div>
                      <div class="rbk-seg-label">Más libros de ${esc(enrichment.author?.name || book.author)}</div>
                      <div class="rbk-more-scroll">
                        ${enrichment.moreBooks.map((mb, idx) => `
                          <div class="rbk-more-card">
                            <img src="${esc(mb.poster)}" alt="${esc(mb.title)}" loading="lazy">
                            <b>${esc(mb.title)}</b>
                            <small>${esc([mb.year, mb.pages ? `${mb.pages} pág.` : ''].filter(Boolean).join(' · '))}</small>
                            <button type="button" class="btn btn-secondary btn-sm" style="width:100%;padding:0.28rem 0.4rem;font-size:0.72rem;margin-top:auto;" data-add-more-book="${idx}">+ Añadir</button>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : (!enrichment?.author ? `
                    <div class="rbk-empty" style="padding:1.2rem 1rem;">
                      <span>No encontramos datos ampliados del autor para este libro todavía.</span>
                    </div>
                  ` : '')}
                `}
              </div>
            `}
          </div>

          <!-- Pie -->
          <div class="${canDelete ? 'rbk-modal-foot' : 'rbk-det-footer'}" style="border-top:1px solid var(--border);padding-top:0.75rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="rbk-det-quote" style="${canDelete ? '' : 'width:100%;'}">↩ Compartir en chat</button>
            ${canDelete ? `<button type="button" class="btn btn-danger btn-sm" id="rbk-det-del">Eliminar</button>` : ''}
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.querySelectorAll('img[data-hide-on-error="1"]').forEach(img => {
          img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
        });
        const openEdit = () => openEditBookMetaModal(book, () => openBookDetailModal(book.id, user, { ...ctx, initialTab: activeTab }));
        modalEl.querySelector('#rbk-det-edit-pages')?.addEventListener('click', openEdit);
        modalEl.querySelector('#rbk-det-edit-full')?.addEventListener('click', openEdit);

        modalEl.querySelector('#rbk-det-start-timer')?.addEventListener('click', () => {
          openReadingSessionModal(book.id, user, () => openBookDetailModal(book.id, user, { ...ctx, initialTab: activeTab }));
        });

        modalEl.querySelector('#rbk-det-toggle-club')?.addEventListener('click', () => {
          const res = store.setGroupClubBook(book.id);
          UI.showToast(res ? `📌 "${book.title}" fijado como lectura del club` : 'Lectura del club removida', 'success');
          renderModal();
        });

        // Cambio de estado
        modalEl.querySelectorAll('[data-det-st]').forEach(btn => {
          btn.addEventListener('click', () => {
            const nextSt = btn.getAttribute('data-det-st');
            store.setUserBookProgress(book.id, { status: nextSt });
            if (nextSt === 'Leído') fireConfetti({ particleCount: 90, spread: 75, origin: { y: 0.65 } });
            UI.showToast(`Estado actualizado a "${nextSt}"`, 'success');
            renderModal();
          });
        });

        // Cambio de formato
        modalEl.querySelectorAll('[data-det-fmt]').forEach(btn => {
          btn.addEventListener('click', () => {
            const fmt = btn.getAttribute('data-det-fmt');
            store.setUserBookProgress(book.id, { format: fmt });
            renderModal();
          });
        });

        // Avance rápido páginas
        modalEl.querySelectorAll('[data-det-step]').forEach(btn => {
          btn.addEventListener('click', () => {
            const delta = Number(btn.getAttribute('data-det-step'));
            const cur = Number(document.getElementById('rbk-det-cur')?.value || prog.currentPage || 0);
            const totVal = Number(document.getElementById('rbk-det-tot')?.value || total || 0);
            const next = totVal > 0 ? Math.min(totVal, cur + delta) : cur + delta;
            const completed = totVal > 0 && next >= totVal;
            store.setUserBookProgress(book.id, {
              currentPage: next,
              totalPages: totVal > 0 ? totVal : undefined,
              status: completed ? 'Leído' : 'Leyendo'
            });
            if (completed) fireConfetti({ particleCount: 100, spread: 80, origin: { y: 0.65 } });
            UI.showToast(completed ? '🎉 ¡Terminaste el libro!' : `Avance actualizado a pág. ${next}`, 'success');
            renderModal();
          });
        });

        // Avance rápido porcentaje (audiolibro / sin páginas)
        modalEl.querySelectorAll('[data-det-pct-step]').forEach(btn => {
          btn.addEventListener('click', () => {
            const delta = Number(btn.getAttribute('data-det-pct-step'));
            const nextPct = Math.min(100, pct + delta);
            store.setUserBookProgress(book.id, { percent: nextPct, status: nextPct >= 100 ? 'Leído' : 'Leyendo' });
            if (nextPct >= 100) fireConfetti({ particleCount: 100, spread: 80, origin: { y: 0.65 } });
            UI.showToast(nextPct >= 100 ? '🎉 ¡Terminaste el libro!' : `Avance al ${nextPct}%`, 'success');
            renderModal();
          });
        });

        const pctRange = modalEl.querySelector('#rbk-det-pct-range');
        const pctNum = modalEl.querySelector('#rbk-det-pct-num');
        pctRange?.addEventListener('input', () => { if (pctNum) pctNum.value = pctRange.value; });
        pctNum?.addEventListener('input', () => { if (pctRange) pctRange.value = pctNum.value; });
        modalEl.querySelector('#rbk-det-pct-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const val = Math.min(100, Math.max(0, Number(pctNum?.value || 0)));
          store.setUserBookProgress(book.id, { percent: val, status: val >= 100 ? 'Leído' : 'Leyendo' });
          if (val >= 100) fireConfetti({ particleCount: 100, spread: 80, origin: { y: 0.65 } });
          UI.showToast('Progreso guardado', 'success');
          renderModal();
        });

        // Guardar progreso páginas manual
        modalEl.querySelector('#rbk-det-prog-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const cur = Number(document.getElementById('rbk-det-cur')?.value || 0);
          const totVal = Number(document.getElementById('rbk-det-tot')?.value || 0);
          const completed = totVal > 0 && cur >= totVal;
          store.setUserBookProgress(book.id, {
            currentPage: cur,
            totalPages: totVal > 0 ? totVal : undefined,
            status: completed ? 'Leído' : 'Leyendo'
          });
          if (completed) fireConfetti({ particleCount: 100, spread: 80, origin: { y: 0.65 } });
          UI.showToast('Progreso guardado', 'success');
          renderModal();
        });

        modalEl.querySelector('#rbk-det-edit-done')?.addEventListener('click', () => {
          openBookProgressModal(book, user, openReviewModal);
        });

        modalEl.querySelector('#rbk-det-syn-toggle')?.addEventListener('click', () => {
          synopsisExpanded = !synopsisExpanded;
          renderModal();
        });

        // Tabs sociales
        modalEl.querySelectorAll('[data-det-tab]').forEach(btn => {
          btn.addEventListener('click', () => {
            activeTab = btn.getAttribute('data-det-tab');
            renderModal();
          });
        });

        // Escribir reseña
        modalEl.querySelector('#rbk-det-write-rev')?.addEventListener('click', () => {
          openReviewModal('books', book, user, () => openBookDetailModal(book.id, user, { ...ctx, initialTab: 'reviews' }));
        });

        // Comentar reseña
        modalEl.querySelectorAll('[data-reply-rev]').forEach(btn => {
          btn.addEventListener('click', () => {
            replyTarget = {
              userId: btn.getAttribute('data-reply-rev'),
              authorName: btn.getAttribute('data-reply-name')
            };
            activeTab = 'comments';
            renderModal();
            setTimeout(() => document.getElementById('rbk-det-comm-inp')?.focus(), 40);
          });
        });

        modalEl.querySelector('#rbk-cancel-reply')?.addEventListener('click', () => {
          replyTarget = null;
          renderModal();
        });

        // Spoilers toggle & checkbox
        modalEl.querySelectorAll('[data-toggle-spoiler]').forEach(box => {
          box.addEventListener('click', () => {
            const cid = box.getAttribute('data-toggle-spoiler');
            if (revealedSpoilers.has(cid)) revealedSpoilers.delete(cid);
            else revealedSpoilers.add(cid);
            box.classList.toggle('revealed', revealedSpoilers.has(cid));
            const lbl = box.querySelector('.rbk-spoiler-head span:last-child');
            if (lbl) lbl.textContent = revealedSpoilers.has(cid) ? 'Ocultar' : 'Toca para revelar';
          });
        });

        const spChk = modalEl.querySelector('#rbk-det-spoiler-chk');
        const spLbl = modalEl.querySelector('#rbk-det-spoiler-lbl');
        spChk?.addEventListener('change', () => {
          if (spLbl) spLbl.style.display = spChk.checked ? 'block' : 'none';
        });

        // Enviar comentario (con soporte de spoiler)
        modalEl.querySelector('#rbk-det-comm-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const text = document.getElementById('rbk-det-comm-inp')?.value.trim();
          if (!text) return;
          const meta = {};
          if (replyTarget) {
            meta.replyToReviewUserId = replyTarget.userId;
            meta.replyToReviewAuthor = replyTarget.authorName;
          }
          if (spChk?.checked) {
            meta.isSpoiler = true;
            meta.spoilerLabel = (spLbl?.value || '').trim() || (prog.currentPage > 0 ? `Pág. ${prog.currentPage}` : '');
          }
          store.addMediaComment('books', book.id, text, Object.keys(meta).length ? meta : null);
          replyTarget = null;
          renderModal();
        });

        modalEl.querySelectorAll('[data-det-react]').forEach(btn => {
          btn.addEventListener('click', () => {
            store.reactMediaComment('books', book.id, btn.getAttribute('data-det-react'), btn.getAttribute('data-det-em'));
            renderModal();
          });
        });

        // Guardar cita favorita
        modalEl.querySelector('#rbk-quote-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const text = document.getElementById('rbk-qt-text')?.value.trim();
          const page = document.getElementById('rbk-qt-page')?.value.trim();
          const note = document.getElementById('rbk-qt-note')?.value.trim();
          if (!text) return;
          store.addBookQuote(book.id, { text, page, note });
          UI.showToast('Cita guardada en el libro 🔖', 'success');
          renderModal();
        });

        modalEl.querySelectorAll('[data-share-quote]').forEach(btn => {
          btn.addEventListener('click', () => {
            const qObj = quotes.find(x => x.id === btn.getAttribute('data-share-quote'));
            if (!qObj) return;
            UI.closeModal();
            onQuoteBook(book, qObj);
          });
        });

        modalEl.querySelectorAll('[data-del-quote]').forEach(btn => {
          btn.addEventListener('click', () => {
            store.deleteBookQuote(book.id, btn.getAttribute('data-del-quote'));
            UI.showToast('Cita eliminada', 'info');
            renderModal();
          });
        });

        // Añadir libro relacionado del mismo autor
        modalEl.querySelectorAll('[data-add-more-book]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pick = enrichment?.moreBooks?.[Number(btn.getAttribute('data-add-more-book'))];
            if (!pick) return;
            const limitCheck = Entitlements.canAddMediaItem(group, 'books');
            if (!limitCheck.allowed) {
              UI.showUpgradeModal(limitCheck.reason, () => store.upgradeGroupToPremium(group.id));
              return;
            }
            const res = store.addMediaToActiveGroup('books', pick);
            if (!res.ok) return UI.showToast(res.error, 'error');
            btn.disabled = true;
            btn.textContent = '✓ Añadido';
            UI.showToast(`"${pick.title}" añadido a la biblioteca 📚`, 'success');
          });
        });

        // Citar y eliminar
        modalEl.querySelector('#rbk-det-quote')?.addEventListener('click', () => {
          UI.closeModal();
          onQuoteBook(book);
        });

        modalEl.querySelector('#rbk-det-del')?.addEventListener('click', () => {
          const res = store.deleteMediaItem('books', book.id);
          UI.closeModal();
          UI.showToast(res.ok ? 'Libro eliminado' : res.error, res.ok ? 'info' : 'error');
        });
      }
    });
  };

  renderModal();
}

// ============================================================================
// MODAL RÁPIDO DE ESTADO, FORMATO Y PROGRESO DE LECTURA
// ============================================================================
function openBookProgressModal(book, user, openReviewModal) {
  const prog = store.getUserBookProgress(book, user.id);
  let selectedStatus = prog.status || 'Por leer';
  let selectedFormat = prog.format || 'physical';
  let currentPage = Number(prog.currentPage || 0);
  let totalPages = Number(book.pages || 0);
  let currentPercent = Number(prog.percent || getBookPct(book, prog));
  let finishedAt = prog.finishedAt || new Date().toISOString().slice(0, 10);

  const render = () => {
    const isAudio = selectedFormat === 'audiobook';
    const pct = selectedStatus === 'Leído'
      ? 100
      : (isAudio || totalPages <= 0 ? currentPercent : Math.min(100, Math.round((currentPage / totalPages) * 100)));

    renderModalInPlace({
      modalKey: `book-progress-${book.id}`,
      title: `Progreso · ${book.title}`,
      contentHtml: `
        <form id="rbk-prog-form" style="display:flex;flex-direction:column;gap:0.9rem;">
          <div>
            <div class="rbk-seg-label">Estado de lectura</div>
            <div class="rbk-status-grid">
              ${STATUSES.map(s => `
                <button type="button" class="rbk-st-opt ${selectedStatus === s.id ? 'active' : ''}" data-pg-st="${s.id}">
                  ${s.label}
                </button>
              `).join('')}
            </div>
          </div>

          <div>
            <div class="rbk-seg-label">Formato</div>
            <div class="rbk-format-row">
              ${FORMATS.map(f => `
                <button type="button" class="rbk-format-opt ${selectedFormat === f.id ? 'active' : ''}" data-pg-fmt="${f.id}">
                  ${f.icon} ${f.label}
                </button>
              `).join('')}
            </div>
          </div>

          ${selectedStatus === 'Leyendo' || selectedStatus === 'Abandonado' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-prog-panel-top">
                <span class="rbk-sub-note" style="font-weight:700;">Avance actual</span>
                <span class="rbk-prog-pct" id="rbk-pg-pct">${pct}%</span>
              </div>
              <div class="rbk-prog-track"><i class="rbk-prog-fill" id="rbk-pg-bar" style="width:${pct}%"></i></div>

              ${isAudio ? `
                <div>
                  <div class="rbk-seg-label" style="margin-bottom:0.35rem;">Avance rápido (%)</div>
                  <div class="rbk-quick-steps">
                    ${[5, 10, 15, 25].map(step => `<button type="button" class="rbk-step-btn" data-pg-add-pct="${step}">+${step}%</button>`).join('')}
                  </div>
                </div>
                <div class="rbk-mini-field">
                  <label for="rbk-pg-pct-inp">Porcentaje escuchado (0–100%)</label>
                  <input type="number" id="rbk-pg-pct-inp" min="0" max="100" value="${currentPercent}">
                </div>
              ` : `
                <div>
                  <div class="rbk-seg-label" style="margin-bottom:0.35rem;">Avance rápido</div>
                  <div class="rbk-quick-steps">
                    ${[5, 10, 25, 50].map(step => `<button type="button" class="rbk-step-btn" data-pg-add="${step}">+${step}</button>`).join('')}
                  </div>
                </div>
                <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
                  <div class="rbk-mini-field">
                    <label for="rbk-pg-cur">Página actual</label>
                    <input type="number" id="rbk-pg-cur" min="0" ${totalPages > 0 ? `max="${totalPages}"` : ''} value="${currentPage}">
                  </div>
                  <div class="rbk-mini-field">
                    <label for="rbk-pg-tot">Total de páginas</label>
                    <input type="number" id="rbk-pg-tot" min="0" value="${totalPages || ''}" placeholder="Ej. 320">
                  </div>
                </div>
              `}
            </div>
          ` : ''}

          ${selectedStatus === 'Leído' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-mini-field">
                <label for="rbk-pg-date">Fecha de finalización (opcional)</label>
                <input type="date" id="rbk-pg-date" value="${esc(finishedAt)}">
              </div>
              <label class="rbk-check-row" style="margin-top:0.2rem;">
                <input type="checkbox" id="rbk-pg-open-rev">
                <span>Calificar y escribir una reseña opcional al guardar</span>
              </label>
            </div>
          ` : ''}

          <div class="rbk-modal-foot">
            <button type="button" class="btn btn-secondary btn-sm" id="rbk-pg-cancel">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar cambios</button>
          </div>
        </form>
      `,
      onMount: (modalEl) => {
        const updateLivePct = () => {
          if (selectedFormat === 'audiobook') {
            currentPercent = Math.min(100, Math.max(0, Number(document.getElementById('rbk-pg-pct-inp')?.value || 0)));
            const pctEl = document.getElementById('rbk-pg-pct');
            const barEl = document.getElementById('rbk-pg-bar');
            if (pctEl) pctEl.textContent = `${currentPercent}%`;
            if (barEl) barEl.style.width = `${currentPercent}%`;
            return;
          }
          const c = Math.max(0, Number(document.getElementById('rbk-pg-cur')?.value || 0));
          const t = Math.max(0, Number(document.getElementById('rbk-pg-tot')?.value || 0));
          currentPage = t > 0 ? Math.min(t, c) : c;
          totalPages = t;
          const p = t > 0 ? Math.min(100, Math.round((currentPage / t) * 100)) : 0;
          currentPercent = p;
          const pctEl = document.getElementById('rbk-pg-pct');
          const barEl = document.getElementById('rbk-pg-bar');
          if (pctEl) pctEl.textContent = t > 0 ? `${p}%` : `${currentPage} pág.`;
          if (barEl) barEl.style.width = `${p}%`;
        };

        modalEl.querySelectorAll('[data-pg-st]').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedStatus = btn.getAttribute('data-pg-st');
            render();
          });
        });

        modalEl.querySelectorAll('[data-pg-fmt]').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedFormat = btn.getAttribute('data-pg-fmt');
            render();
          });
        });

        modalEl.querySelectorAll('[data-pg-add]').forEach(btn => {
          btn.addEventListener('click', () => {
            const delta = Number(btn.getAttribute('data-pg-add'));
            const curInp = document.getElementById('rbk-pg-cur');
            const totInp = document.getElementById('rbk-pg-tot');
            const t = Math.max(0, Number(totInp?.value || totalPages || 0));
            const next = Math.max(0, Number(curInp?.value || 0) + delta);
            if (curInp) curInp.value = String(t > 0 ? Math.min(t, next) : next);
            updateLivePct();
          });
        });

        modalEl.querySelectorAll('[data-pg-add-pct]').forEach(btn => {
          btn.addEventListener('click', () => {
            const delta = Number(btn.getAttribute('data-pg-add-pct'));
            const inp = document.getElementById('rbk-pg-pct-inp');
            if (inp) inp.value = String(Math.min(100, Number(inp.value || 0) + delta));
            updateLivePct();
          });
        });

        document.getElementById('rbk-pg-cur')?.addEventListener('input', updateLivePct);
        document.getElementById('rbk-pg-tot')?.addEventListener('input', updateLivePct);
        document.getElementById('rbk-pg-pct-inp')?.addEventListener('input', updateLivePct);
        document.getElementById('rbk-pg-date')?.addEventListener('change', e => { finishedAt = e.target.value; });
        document.getElementById('rbk-pg-cancel')?.addEventListener('click', () => UI.closeModal());

        document.getElementById('rbk-prog-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const wantReview = Boolean(document.getElementById('rbk-pg-open-rev')?.checked);
          const dateVal = document.getElementById('rbk-pg-date')?.value;
          const payload = {
            status: selectedStatus,
            format: selectedFormat,
            finishedAt: selectedStatus === 'Leído' ? (dateVal || '') : ''
          };

          if (selectedFormat === 'audiobook') {
            payload.percent = selectedStatus === 'Leído'
              ? 100
              : Math.min(100, Math.max(0, Number(document.getElementById('rbk-pg-pct-inp')?.value ?? currentPercent)));
          } else {
            const finalTot = Number(document.getElementById('rbk-pg-tot')?.value || totalPages || 0);
            const finalCur = selectedStatus === 'Leído'
              ? (finalTot > 0 ? finalTot : currentPage)
              : Number(document.getElementById('rbk-pg-cur')?.value ?? currentPage);
            payload.currentPage = finalCur;
            if (finalTot > 0) payload.totalPages = finalTot;
          }

          store.setUserBookProgress(book.id, payload);
          UI.closeModal();
          if (selectedStatus === 'Leído') fireConfetti({ particleCount: 95, spread: 75, origin: { y: 0.65 } });
          UI.showToast('Progreso de lectura actualizado', 'success');
          if (wantReview && typeof openReviewModal === 'function') {
            const fresh = (store.getActiveGroup()?.books || []).find(x => x.id === book.id) || book;
            openReviewModal('books', fresh, user);
          }
        });
      }
    });
  };

  render();
}

// ============================================================================
// PANEL DE FILTROS AVANZADOS Y ORDEN
// ============================================================================
function openAdvancedFiltersModal(allBooks, currentStatus, setFilterState, rerender) {
  const genreSet = new Set();
  const authorSet = new Set();
  allBooks.forEach(b => {
    splitGenres(b.genres).forEach(g => genreSet.add(g));
    if (b.author) authorSet.add(b.author.trim());
  });
  const genres = Array.from(genreSet).sort((a, b) => a.localeCompare(b));
  const authors = Array.from(authorSet).sort((a, b) => a.localeCompare(b));

  UI.openModal({
    title: 'Filtros y orden',
    contentHtml: `
      <form id="rbk-flt-form" class="rbk-flt-form">
        <div class="rbk-flt-grid">
          <div class="form-group">
            <label class="form-label" for="rbk-f-status">Estado de lectura</label>
            <select id="rbk-f-status" class="form-select">
              <option value="all" ${currentStatus === 'all' ? 'selected' : ''}>Todos los estados</option>
              ${STATUSES.map(s => `<option value="${s.id}" ${currentStatus === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rbk-f-sort">Ordenar por</label>
            <select id="rbk-f-sort" class="form-select">
              <option value="recent" ${booksUiState.sort === 'recent' ? 'selected' : ''}>Más recientes</option>
              <option value="rating" ${booksUiState.sort === 'rating' ? 'selected' : ''}>Mejor calificados</option>
              <option value="title" ${booksUiState.sort === 'title' ? 'selected' : ''}>Título (A–Z)</option>
              <option value="pages" ${booksUiState.sort === 'pages' ? 'selected' : ''}>Más páginas</option>
              <option value="progress" ${booksUiState.sort === 'progress' ? 'selected' : ''}>Mayor progreso</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rbk-f-genre">Género</label>
            <select id="rbk-f-genre" class="form-select">
              <option value="all">Todos los géneros</option>
              ${genres.map(g => `<option value="${esc(g)}" ${booksUiState.genre === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rbk-f-author">Autor</label>
            <select id="rbk-f-author" class="form-select">
              <option value="all">Todos los autores</option>
              ${authors.map(a => `<option value="${esc(a)}" ${booksUiState.author === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rbk-f-format">Tu formato</label>
            <select id="rbk-f-format" class="form-select">
              <option value="all" ${booksUiState.format === 'all' ? 'selected' : ''}>Todos los formatos</option>
              ${FORMATS.map(f => `<option value="${f.id}" ${booksUiState.format === f.id ? 'selected' : ''}>${f.icon} ${f.label}</option>`).join('')}
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rbk-f-rating">Calificación del grupo</label>
            <select id="rbk-f-rating" class="form-select">
              <option value="all" ${booksUiState.rating === 'all' ? 'selected' : ''}>Cualquier calificación</option>
              <option value="9" ${booksUiState.rating === '9' ? 'selected' : ''}>9.0 o más</option>
              <option value="8" ${booksUiState.rating === '8' ? 'selected' : ''}>8.0 o más</option>
              <option value="7" ${booksUiState.rating === '7' ? 'selected' : ''}>7.0 o más</option>
              <option value="rated" ${booksUiState.rating === 'rated' ? 'selected' : ''}>Solo calificados</option>
              <option value="unrated" ${booksUiState.rating === 'unrated' ? 'selected' : ''}>Sin calificar aún</option>
            </select>
          </div>
        </div>

        <label class="rbk-check-row">
          <input type="checkbox" id="rbk-f-mine" ${booksUiState.onlyMine ? 'checked' : ''}>
          <span>Mostrar solo libros que yo propuse</span>
        </label>

        <div class="rbk-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rbk-f-reset">Restablecer</button>
          <button type="submit" class="btn btn-primary btn-sm">Aplicar filtros</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('rbk-f-reset')?.addEventListener('click', () => {
        booksUiState.genre = 'all';
        booksUiState.author = 'all';
        booksUiState.rating = 'all';
        booksUiState.format = 'all';
        booksUiState.onlyMine = false;
        booksUiState.sort = 'recent';
        setFilterState('all');
        UI.closeModal();
        rerender();
      });

      document.getElementById('rbk-flt-form')?.addEventListener('submit', e => {
        e.preventDefault();
        setFilterState(document.getElementById('rbk-f-status').value);
        booksUiState.sort = document.getElementById('rbk-f-sort').value;
        booksUiState.genre = document.getElementById('rbk-f-genre').value;
        booksUiState.author = document.getElementById('rbk-f-author').value;
        booksUiState.format = document.getElementById('rbk-f-format').value;
        booksUiState.rating = document.getElementById('rbk-f-rating').value;
        booksUiState.onlyMine = Boolean(document.getElementById('rbk-f-mine').checked);
        UI.closeModal();
        rerender();
      });
    }
  });
}

// ============================================================================
// PANEL DEDICADO DE ESTADÍSTICAS DE LECTURA (CON TIEMPO, RACHA Y RANKING)
// ============================================================================
function openReadingStatsModal(group, user, progMap) {
  const books = group.books || [];
  const total = books.length;
  const read = books.filter(b => progMap.get(b.id)?.status === 'Leído').length;
  const reading = books.filter(b => progMap.get(b.id)?.status === 'Leyendo').length;
  const pending = books.filter(b => progMap.get(b.id)?.status === 'Por leer').length;
  const dropped = books.filter(b => progMap.get(b.id)?.status === 'Abandonado').length;
  const rStats = store.getUserReadingStats(group, user.id);

  let pagesRead = 0;
  const myScores = [];
  const groupScores = [];
  const genreFreq = new Map();

  books.forEach(b => {
    const p = progMap.get(b.id);
    if (p?.status === 'Leído') pagesRead += Number(b.pages || p.currentPage || 0);
    else if (p?.currentPage) pagesRead += Number(p.currentPage || 0);

    if (b.ratings?.[user.id]?.score) myScores.push(Number(b.ratings[user.id].score));
    const avg = getAverage(b);
    if (avg !== null) groupScores.push(avg);

    splitGenres(b.genres).forEach(g => {
      genreFreq.set(g, (genreFreq.get(g) || 0) + 1);
    });
  });

  // Ranking del club
  const memberRank = (group.members || []).map(m => {
    let mRead = 0;
    let mPages = 0;
    books.forEach(b => {
      const mp = store.getUserBookProgress(b, m.id);
      if (mp.status === 'Leído') {
        mRead += 1;
        mPages += Number(b.pages || mp.currentPage || 0);
      } else if (mp.currentPage) {
        mPages += Number(mp.currentPage || 0);
      }
    });
    return { name: m.name.split(' ')[0], avatar: m.avatar || 'assets/ruma_default_avatar.png', mRead, mPages };
  }).filter(x => x.mRead > 0 || x.mPages > 0).sort((a, b) => (b.mRead - a.mRead) || (b.mPages - a.mPages));

  const avgMine = myScores.length ? (myScores.reduce((a, b) => a + b, 0) / myScores.length).toFixed(1) : '—';
  const avgGroup = groupScores.length ? (groupScores.reduce((a, b) => a + b, 0) / groupScores.length).toFixed(1) : '—';
  const topGenres = Array.from(genreFreq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxGenre = topGenres[0]?.[1] || 1;
  const pctOf = n => total > 0 ? Math.round((n / total) * 100) : 0;

  UI.openModal({
    title: 'Estadísticas de lectura',
    size: 'md',
    contentHtml: `
      <div class="rbk-st-wrap">
        <div class="rbk-st-grid">
          <div class="rbk-st-tile"><b>${total}</b><small>Total</small></div>
          <div class="rbk-st-tile"><b style="color:var(--success);">${read}</b><small>Leídos</small></div>
          <div class="rbk-st-tile"><b style="color:var(--primary);">${reading}</b><small>Leyendo</small></div>
          <div class="rbk-st-tile"><b style="color:var(--info);">${pending}</b><small>Por leer</small></div>
        </div>

        ${total > 0 ? `
          <div style="display:flex;flex-direction:column;gap:0.35rem;">
            <div class="rbk-st-bar" aria-label="Distribución de biblioteca">
              ${read ? `<span style="width:${pctOf(read)}%;background:var(--success);" title="Leídos: ${read}"></span>` : ''}
              ${reading ? `<span style="width:${pctOf(reading)}%;background:var(--primary-solid);" title="Leyendo: ${reading}"></span>` : ''}
              ${pending ? `<span style="width:${pctOf(pending)}%;background:var(--info);" title="Por leer: ${pending}"></span>` : ''}
              ${dropped ? `<span style="width:${pctOf(dropped)}%;background:var(--error);" title="Abandonados: ${dropped}"></span>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-secondary);">
              <span>${pctOf(read)}% completado</span>
              ${dropped > 0 ? `<span>${dropped} abandonado${dropped === 1 ? '' : 's'}</span>` : `<span>${reading} en progreso</span>`}
            </div>
          </div>
        ` : ''}

        <div class="rbk-st-highlights">
          <div class="rbk-st-hl">
            <span>Promedio de calificación</span>
            <b>★ ${avgMine !== '—' ? avgMine : avgGroup}</b>
            <small class="rbk-sub-note">${avgMine !== '—' ? `Tu promedio · Grupo: ${avgGroup}` : 'Promedio del grupo'}</small>
          </div>
          <div class="rbk-st-hl">
            <span>Páginas leídas</span>
            <b>${pagesRead.toLocaleString('es-ES')}</b>
            <small class="rbk-sub-note">Acumuladas en este grupo</small>
          </div>
          <div class="rbk-st-hl">
            <span>Tiempo de sesiones</span>
            <b>${rStats.totalMinutes > 0 ? formatDurationHuman(rStats.totalMinutes) : '0 min'}</b>
            <small class="rbk-sub-note">${rStats.totalSessions} sesión${rStats.totalSessions === 1 ? '' : 'es'} registrada${rStats.totalSessions === 1 ? '' : 's'}</small>
          </div>
          <div class="rbk-st-hl">
            <span>Ritmo y racha</span>
            <b>${rStats.streakDays > 0 ? `🔥 ${rStats.streakDays}d` : `${rStats.avgPagesPerHour} p/h`}</b>
            <small class="rbk-sub-note">${rStats.hasMeasuredPace ? `${rStats.avgPagesPerHour} pág/hora real` : 'Usa "Leer ahora" para medir ritmo'}</small>
          </div>
        </div>

        ${memberRank.length > 1 ? `
          <div>
            <div class="rbk-seg-label">Lectores del club</div>
            <div class="rbk-club-race" style="border-top:0;padding-top:0;">
              ${memberRank.map((m, idx) => `
                <div class="rbk-race-row">
                  <span style="width:18px;font-size:0.75rem;font-weight:800;color:var(--primary);">${idx + 1}.</span>
                  <img src="${esc(m.avatar)}" alt="${esc(m.name)}">
                  <div class="rbk-race-meta">
                    <div class="rbk-race-top">
                      <b>${esc(m.name)}</b>
                      <span>${m.mRead} leído${m.mRead === 1 ? '' : 's'} · ${m.mPages.toLocaleString('es-ES')} pág.</span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div>
          <div class="rbk-seg-label">Géneros favoritos</div>
          ${topGenres.length === 0 ? `
            <div style="font-size:0.8rem;color:var(--text-muted);padding:0.4rem 0;">Añade libros con género para descubrir las preferencias del grupo.</div>
          ` : `
            <div class="rbk-genre-list">
              ${topGenres.map(([g, count]) => `
                <div class="rbk-genre-row">
                  <div class="rbk-genre-head">
                    <strong>${esc(g)}</strong>
                    <small>${count} libro${count === 1 ? '' : 's'}</small>
                  </div>
                  <div class="rbk-prog-track"><i class="rbk-prog-fill" style="width:${Math.round((count / maxGenre) * 100)}%"></i></div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>
    `
  });
}

// ============================================================================
// AÑADIR LIBRO (BÚSQUEDA EN VIVO MULTI-API + ISBN + IDIOMA + MANUAL CON PORTADA)
// ============================================================================
function openAddBookModal(group) {
  let activeTab = 'search';
  let results = [];
  let expandedIdx = -1;
  let lastQuery = '';
  let searchLang = 'es'; // 'es' | 'all'
  let searching = false;
  let initialStatus = 'Por leer';
  let initialFormat = 'physical';
  let manualPoster = DEFAULT_COVER;
  let searchDebounce = null;
  let searchSeq = 0;

  const existingTitleSet = new Set((group?.books || []).map(b => BooksApi.normalizeBookKey(b.title)));
  const existingIsbnSet = new Set((group?.books || []).map(b => b.isbn13).filter(Boolean));

  const renderResultsHtml = () => {
    if (searching) {
      return `<div class="ruma-view-loading" style="min-height:110px;"><span class="ruma-spinner"></span><span>Buscando en Google Books, Apple Books y Open Library…</span></div>`;
    }
    if (results.length === 0) {
      return `
        <div style="text-align:center;padding:1.1rem 0.6rem;color:var(--text-muted);font-size:0.82rem;">
          ${lastQuery
            ? 'No encontramos resultados para esa búsqueda. Prueba cambiando el idioma a <b>Todos</b> o usa <b>Añadir manual</b>.'
            : 'Escribe un título, autor o número ISBN-13 para buscar automáticamente con portada HD y ficha completa.'}
        </div>
      `;
    }

    return results.map((r, i) => {
      const alreadyIn = (r.isbn13 && existingIsbnSet.has(r.isbn13)) || existingTitleSet.has(BooksApi.normalizeBookKey(r.title));
      const metaBits = [
        r.year,
        r.pages ? `${r.pages} pág.` : '',
        r.publisher,
        r.externalRating?.score ? `★ ${Number(r.externalRating.score).toFixed(1)}` : ''
      ].filter(Boolean);

      return `
        <div class="rbk-res-card">
          <div class="rbk-res-top">
            <img class="rbk-res-cover" src="${esc(r.poster)}" alt="">
            <div class="rbk-res-info">
              <div class="rbk-res-title">${esc(r.title)}</div>
              <div class="rbk-res-sub">${esc(r.author)}</div>
              <div class="rbk-res-sub">${metaBits.map(esc).join(' · ')}</div>
              ${r.genres ? `<div class="rbk-res-sub" style="color:var(--primary);">${esc(r.genres)}</div>` : ''}
            </div>
          </div>
          ${expandedIdx === i && r.synopsis ? `<p class="rbk-res-syn">${esc(r.synopsis.slice(0, 440))}${r.synopsis.length > 440 ? '…' : ''}</p>` : ''}
          <div class="rbk-res-actions">
            ${r.synopsis
              ? `<button type="button" class="rbk-link-btn" data-toggle-syn="${i}">${expandedIdx === i ? 'Ocultar sinopsis' : 'Ver sinopsis'}</button>`
              : '<span></span>'}
            <button type="button" class="btn ${alreadyIn ? 'btn-secondary' : 'btn-primary'} btn-sm" data-pick-book="${i}">
              ${alreadyIn ? '+ Añadir copia' : '+ Añadir'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  };

  const bindResultsEvents = (resContainer) => {
    if (!resContainer) return;
    resContainer.querySelectorAll('[data-toggle-syn]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-toggle-syn'));
        expandedIdx = expandedIdx === idx ? -1 : idx;
        resContainer.innerHTML = renderResultsHtml();
        bindResultsEvents(resContainer);
      });
    });

    resContainer.querySelectorAll('[data-pick-book]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = results[Number(btn.getAttribute('data-pick-book'))];
        if (!item) return;
        const res = store.addMediaToActiveGroup('books', item);
        if (!res.ok) return UI.showToast(res.error, 'error');
        if (res.item && (initialStatus !== 'Por leer' || initialFormat !== 'physical')) {
          store.setUserBookProgress(res.item.id, { status: initialStatus, format: initialFormat });
        }
        UI.closeModal();
        UI.showToast(`"${item.title}" añadido (${initialStatus}) 📚`, 'success');
      });
    });
  };

  const runLiveSearch = async (queryText) => {
    const q = String(queryText || '').trim();
    lastQuery = q;
    const resContainer = document.getElementById('rbk-api-res');
    const hintEl = document.getElementById('rbk-isbn-hint');
    if (hintEl) {
      hintEl.textContent = BooksApi.isIsbnQuery(q) ? '✓ ISBN detectado' : 'Soporta título, autor o ISBN-13';
    }
    if (!q || q.length < 2) {
      results = [];
      searching = false;
      if (resContainer) resContainer.innerHTML = renderResultsHtml();
      return;
    }

    const mySeq = ++searchSeq;
    searching = true;
    expandedIdx = -1;
    if (resContainer) resContainer.innerHTML = renderResultsHtml();

    const found = await BooksApi.searchBooks(q, { lang: searchLang, limit: 12 });
    if (mySeq !== searchSeq) return;
    results = found;
    searching = false;
    const liveResContainer = document.getElementById('rbk-api-res');
    if (liveResContainer) {
      liveResContainer.innerHTML = renderResultsHtml();
      bindResultsEvents(liveResContainer);
    }
  };

  const render = () => {
    renderModalInPlace({
      modalKey: 'book-add-modal',
      title: 'Añadir libro',
      size: 'md',
      onClose: () => clearTimeout(searchDebounce),
      contentHtml: `
        <div>
          <div class="rbk-add-tabs" role="tablist">
            <button type="button" class="rbk-social-tab ${activeTab === 'search' ? 'active' : ''}" data-add-tab="search">Buscar libro</button>
            <button type="button" class="rbk-social-tab ${activeTab === 'manual' ? 'active' : ''}" data-add-tab="manual">Añadir manual</button>
          </div>

          ${activeTab === 'search' ? `
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
              <form id="rbk-api-form" style="display:flex;gap:0.45rem;">
                <input type="search" id="rbk-api-q" class="form-input" placeholder="Título, autor o ISBN (ej. Dune, 978...)" value="${esc(lastQuery)}" style="flex:1;min-width:0;" enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false">
                <button type="submit" class="btn btn-primary btn-sm" style="flex-shrink:0;">Buscar</button>
              </form>

              <div class="rbk-lang-row">
                <div class="rbk-lang-group" role="group" aria-label="Idioma de búsqueda">
                  <button type="button" class="rbk-lang-pill ${searchLang === 'es' ? 'active' : ''}" data-search-lang="es">Español</button>
                  <button type="button" class="rbk-lang-pill ${searchLang === 'all' ? 'active' : ''}" data-search-lang="all">Todos</button>
                </div>
                <span class="rbk-isbn-hint" id="rbk-isbn-hint">${BooksApi.isIsbnQuery(lastQuery) ? '✓ ISBN detectado' : 'Soporta título, autor o ISBN-13'}</span>
              </div>

              <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.5rem;">
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="rbk-init-st" style="font-size:0.72rem;">Estado inicial</label>
                  <select id="rbk-init-st" class="form-select">
                    ${STATUSES.map(s => `<option value="${s.id}" ${initialStatus === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label" for="rbk-init-fmt" style="font-size:0.72rem;">Tu formato</label>
                  <select id="rbk-init-fmt" class="form-select">
                    ${FORMATS.map(f => `<option value="${f.id}" ${initialFormat === f.id ? 'selected' : ''}>${f.icon} ${f.label}</option>`).join('')}
                  </select>
                </div>
              </div>

              <div id="rbk-api-res" style="display:flex;flex-direction:column;gap:0.55rem;">
                ${renderResultsHtml()}
              </div>
            </div>
          ` : `
            <form id="rbk-man-form" style="display:flex;flex-direction:column;gap:0.75rem;">
              <div class="rbk-cover-picker">
                <img src="${esc(manualPoster)}" alt="Portada">
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0.25rem;">
                  <b style="font-size:0.8rem;color:var(--text-primary);">Portada personalizada (opcional)</b>
                  <div>
                    <button type="button" class="btn btn-secondary btn-sm" id="rbk-man-pick-cover">📷 Elegir portada</button>
                    <input type="file" id="rbk-man-cover-file" accept="image/*,.heic,.heif" hidden>
                  </div>
                </div>
              </div>

              <div class="form-group" style="margin:0;"><label class="form-label">Título *</label><input type="text" id="rbk-m-title" class="form-input" required placeholder="Ej. Pedro Páramo"></div>
              <div class="form-group" style="margin:0;"><label class="form-label">Autor *</label><input type="text" id="rbk-m-author" class="form-input" required placeholder="Ej. Juan Rulfo"></div>
              <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
                <div class="form-group" style="margin:0;"><label class="form-label">Páginas</label><input type="number" id="rbk-m-pages" class="form-input" min="1" placeholder="240"></div>
                <div class="form-group" style="margin:0;"><label class="form-label">Año</label><input type="text" id="rbk-m-year" class="form-input" maxlength="4" placeholder="1955"></div>
              </div>
              <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
                <div class="form-group" style="margin:0;"><label class="form-label">Editorial</label><input type="text" id="rbk-m-pub" class="form-input" placeholder="Ej. RM / Cátedra"></div>
                <div class="form-group" style="margin:0;"><label class="form-label">ISBN-13</label><input type="text" id="rbk-m-isbn" class="form-input" placeholder="978..."></div>
              </div>
              <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0.55rem;">
                <div class="form-group" style="margin:0;"><label class="form-label">Género</label><input type="text" id="rbk-m-genre" class="form-input" placeholder="Ficción, Fantasía…"></div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Estado inicial</label>
                  <select id="rbk-m-status" class="form-select">
                    ${STATUSES.map(s => `<option value="${s.id}" ${initialStatus === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group" style="margin:0;"><label class="form-label">Sinopsis breve</label><textarea id="rbk-m-syn" class="form-textarea" rows="2" placeholder="Opcional…"></textarea></div>
              <div class="rbk-modal-foot">
                <button type="button" class="btn btn-secondary btn-sm" id="rbk-m-cancel">Cancelar</button>
                <button type="submit" class="btn btn-primary btn-sm">Guardar libro</button>
              </div>
            </form>
          `}
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.querySelectorAll('[data-add-tab]').forEach(btn => {
          btn.addEventListener('click', () => {
            activeTab = btn.getAttribute('data-add-tab');
            render();
          });
        });

        document.getElementById('rbk-init-st')?.addEventListener('change', e => { initialStatus = e.target.value; });
        document.getElementById('rbk-init-fmt')?.addEventListener('change', e => { initialFormat = e.target.value; });

        modalEl.querySelectorAll('[data-search-lang]').forEach(btn => {
          btn.addEventListener('click', () => {
            const nextLang = btn.getAttribute('data-search-lang');
            if (nextLang === searchLang) return;
            searchLang = nextLang;
            modalEl.querySelectorAll('[data-search-lang]').forEach(b => b.classList.toggle('active', b === btn));
            if (lastQuery.trim().length >= 2) runLiveSearch(lastQuery);
          });
        });

        const searchInp = document.getElementById('rbk-api-q');
        const resBox = document.getElementById('rbk-api-res');
        searchInp?.addEventListener('input', () => {
          clearTimeout(searchDebounce);
          const val = searchInp.value;
          searchDebounce = setTimeout(() => runLiveSearch(val), 360);
        });

        document.getElementById('rbk-api-form')?.addEventListener('submit', e => {
          e.preventDefault();
          clearTimeout(searchDebounce);
          searchInp?.blur();
          runLiveSearch(searchInp?.value || '');
        });

        resBox?.addEventListener('touchmove', () => {
          if (document.activeElement === searchInp) searchInp.blur();
        }, { passive: true });

        bindResultsEvents(resBox);

        // Portada manual con recortador
        const manCoverInp = document.getElementById('rbk-man-cover-file');
        document.getElementById('rbk-man-pick-cover')?.addEventListener('click', () => manCoverInp?.click());
        manCoverInp?.addEventListener('change', () => {
          const f = manCoverInp.files?.[0];
          if (!f) return;
          openImageCropperModal(f, {
            title: 'Encuadrar portada',
            aspectW: 2,
            aspectH: 3,
            radius: '12px',
            outW: 360,
            outH: 540,
            onCropped: (dataUrl) => {
              manualPoster = dataUrl;
              render();
            }
          });
        });

        document.getElementById('rbk-m-cancel')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('rbk-man-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const title = document.getElementById('rbk-m-title').value.trim();
          const author = document.getElementById('rbk-m-author').value.trim();
          const pages = Number(document.getElementById('rbk-m-pages').value || 0);
          const year = document.getElementById('rbk-m-year').value.trim();
          const publisher = document.getElementById('rbk-m-pub').value.trim();
          const rawIsbn = BooksApi.cleanIsbn(document.getElementById('rbk-m-isbn').value);
          const genres = document.getElementById('rbk-m-genre').value.trim();
          const status = document.getElementById('rbk-m-status').value;
          const synopsis = document.getElementById('rbk-m-syn').value.trim();
          if (!title || !author) return;

          const payload = {
            title,
            author,
            pages,
            year,
            publisher,
            genres,
            synopsis,
            poster: manualPoster
          };
          if (rawIsbn.length === 13) payload.isbn13 = rawIsbn;
          else if (rawIsbn.length === 10) payload.isbn10 = rawIsbn;

          const res = store.addMediaToActiveGroup('books', payload);
          if (!res.ok) return UI.showToast(res.error, 'error');
          if (res.item && status !== 'Por leer') {
            store.setUserBookProgress(res.item.id, { status });
          }
          UI.closeModal();
          UI.showToast(`"${title}" añadido (${status}) 📚`, 'success');
        });
      }
    });
  };

  render();
}
