// Vista integral rediseñada de Libros del Grupo
// Mobile-first · Identidad Ruma · Inspirada en Goodreads / StoryGraph
import '../styles/books.css';
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { getAverage } from '../components/media-widgets.js';

const esc = v => Utils.sanitize(v);

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
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'
};

const STATUSES = [
  { id: 'Por leer', label: 'Por leer', cls: 'st-pending' },
  { id: 'Leyendo', label: 'Leyendo', cls: 'st-reading' },
  { id: 'Leído', label: 'Leído', cls: 'st-done' },
  { id: 'Abandonado', label: 'Abandonado', cls: 'st-dropped' }
];

const booksUiState = {
  search: '',
  sort: 'recent',
  genre: 'all',
  author: 'all',
  rating: 'all',
  onlyMine: false
};

const bookHydrateInFlight = new Set();
const bookHydrateDone = new Set();

function normalizeBookKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function statusMeta(st) {
  return STATUSES.find(s => s.id === st) || STATUSES[0];
}

function scoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 8.5) return '#34d399';
  if (s >= 7) return '#facc15';
  if (s >= 5) return '#fb923c';
  return '#f87171';
}

function splitGenres(str) {
  if (!str) return [];
  return String(str)
    .split(/[,;/|]+/)
    .map(g => g.trim())
    .filter(Boolean);
}

function getBookPct(book, prog) {
  const total = Number(book.pages || 0);
  if (prog.status === 'Leído') return 100;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((Number(prog.currentPage || 0) / total) * 100)));
}

function countActiveAdvancedFilters() {
  let n = 0;
  if (booksUiState.genre !== 'all') n++;
  if (booksUiState.author !== 'all') n++;
  if (booksUiState.rating !== 'all') n++;
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

async function fetchGoogleBooks(q, max = 10) {
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=${max}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(v => {
      const info = v.volumeInfo || {};
      const rawImg = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
      return {
        title: info.title || 'Sin título',
        author: (info.authors || []).join(', ') || 'Autor desconocido',
        year: (info.publishedDate || '').slice(0, 4),
        pages: Number(info.pageCount || info.printedPageCount || 0),
        genres: (info.categories || []).join(', '),
        synopsis: info.description || '',
        poster: rawImg ? rawImg.replace(/^http:/, 'https:') : 'assets/ruma_icon_512.png'
      };
    });
  } catch (_) {
    return [];
  }
}

async function fetchOpenLibrary(q, limit = 10) {
  try {
    const res = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=title,author_name,first_publish_year,number_of_pages_median,subject,cover_i`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.docs || []).map(d => ({
      title: d.title || 'Sin título',
      author: (d.author_name || []).join(', ') || 'Autor desconocido',
      year: d.first_publish_year ? String(d.first_publish_year) : '',
      pages: Number(d.number_of_pages_median || 0),
      genres: (d.subject || []).slice(0, 2).join(', '),
      synopsis: '',
      poster: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : 'assets/ruma_icon_512.png'
    }));
  } catch (_) {
    return [];
  }
}

async function searchBooksApi(query) {
  const clean = query.trim();
  if (!clean) return [];
  const [gbItems, olItems] = await Promise.all([
    fetchGoogleBooks(clean, 10),
    fetchOpenLibrary(clean, 10)
  ]);

  if (gbItems.length > 0) {
    // Si algún resultado de Google Books viene sin páginas, intentar completar con Open Library
    return gbItems.map(item => {
      if (item.pages > 0) return item;
      const key = normalizeBookKey(item.title);
      const match = olItems.find(o => o.pages > 0 && (normalizeBookKey(o.title) === key || normalizeBookKey(o.title).includes(key) || key.includes(normalizeBookKey(o.title))));
      return match ? { ...item, pages: match.pages, year: item.year || match.year, genres: item.genres || match.genres } : item;
    });
  }
  return olItems;
}

/** Hidrata en segundo plano el total de páginas (y metadatos faltantes) de libros existentes. */
async function hydrateBooksMetadata(group) {
  if (!group || !Array.isArray(group.books)) return;
  const candidates = group.books.filter(b => {
    if (!b?.id || !b?.title) return false;
    if (bookHydrateInFlight.has(b.id) || bookHydrateDone.has(b.id)) return false;
    return !Number(b.pages || 0) || !b.genres || !b.year;
  });
  if (candidates.length === 0) return;

  candidates.forEach(b => bookHydrateInFlight.add(b.id));
  const patches = [];

  await Promise.all(candidates.map(async book => {
    try {
      const authorPart = book.author && book.author !== 'Autor desconocido' ? ` ${book.author.split(',')[0]}` : '';
      const q = `${book.title}${authorPart}`.trim();
      const [gb, ol] = await Promise.all([
        fetchGoogleBooks(q, 5),
        fetchOpenLibrary(q, 5)
      ]);
      const targetKey = normalizeBookKey(book.title);
      const allMatches = [...gb, ...ol];
      const byTitle = allMatches.filter(m => {
        const k = normalizeBookKey(m.title);
        return k === targetKey || k.includes(targetKey) || targetKey.includes(k);
      });
      const pool = byTitle.length > 0 ? byTitle : allMatches;

      const withPages = pool.find(m => Number(m.pages) > 0);
      const withGenres = pool.find(m => m.genres);
      const withYear = pool.find(m => m.year);
      const withSyn = pool.find(m => m.synopsis);

      const patch = {};
      if (!Number(book.pages || 0) && withPages) patch.pages = Number(withPages.pages);
      if (!book.genres && withGenres) patch.genres = withGenres.genres;
      if (!book.year && withYear) patch.year = withYear.year;
      if (!book.synopsis && withSyn) patch.synopsis = withSyn.synopsis;

      if (Object.keys(patch).length > 0) {
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

  // Completar en segundo plano el total de páginas de libros que aún no lo tengan
  hydrateBooksMetadata(group);

  const progMap = new Map(allBooks.map(b => [b.id, store.getUserBookProgress(b, user.id)]));

  const counts = {
    all: allBooks.length,
    Leyendo: allBooks.filter(b => progMap.get(b.id)?.status === 'Leyendo').length,
    'Por leer': allBooks.filter(b => progMap.get(b.id)?.status === 'Por leer').length,
    Leído: allBooks.filter(b => progMap.get(b.id)?.status === 'Leído').length,
    Abandonado: allBooks.filter(b => progMap.get(b.id)?.status === 'Abandonado').length
  };

  // Filtrado
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
      [b.title, b.author, b.genres, b.year].some(v => String(v || '').toLowerCase().includes(q))
    );
  }

  // Ordenamiento
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
  if (booksUiState.rating !== 'all') {
    const rLabel = booksUiState.rating === 'rated' ? 'Con calificación' : booksUiState.rating === 'unrated' ? 'Sin calificar' : `Nota ${booksUiState.rating}+`;
    activeTags.push({ key: 'rating', label: rLabel });
  }
  if (booksUiState.onlyMine) activeTags.push({ key: 'onlyMine', label: 'Mis propuestas' });
  if (booksUiState.sort !== 'recent') activeTags.push({ key: 'sort', label: `Orden: ${sortLabels[booksUiState.sort] || booksUiState.sort}` });

  viewport.innerHTML = `
    <div class="rbk-wrap">
      <!-- Encabezado compacto -->
      <header class="rbk-header">
        <div class="rbk-header-top">
          <div class="rbk-title-group">
            <div class="rbk-header-ico">${svg(ICO.book, 22)}</div>
            <div class="rbk-title-text">
              <h1>Libros</h1>
              <p>Biblioteca del grupo</p>
            </div>
          </div>
          <button type="button" class="rbk-add-btn" id="rbk-add-btn">
            ${svg(ICO.plus, 16)}<span>Añadir</span>
          </button>
        </div>

        <button type="button" class="rbk-stats-strip" id="rbk-open-stats" aria-label="Ver estadísticas de lectura">
          <div class="rbk-stats-inline">
            <span class="rbk-stat-mini"><b>${counts.all}</b><span>libros</span></span>
            <span class="rbk-stat-dot" aria-hidden="true"></span>
            <span class="rbk-stat-mini"><b>${counts.Leyendo}</b><span>leyendo</span></span>
            <span class="rbk-stat-dot" aria-hidden="true"></span>
            <span class="rbk-stat-mini"><b>${counts.Leído}</b><span>leídos</span></span>
          </div>
          <span class="rbk-stats-cta">${svg(ICO.chart, 14)}<span>Estadísticas</span>${svg(ICO.chevronRight, 14)}</span>
        </button>
      </header>

      <!-- Buscador + Filtros avanzados -->
      <div class="rbk-search-row">
        <div class="rbk-search-box">
          ${svg(ICO.search, 17)}
          <input type="text" id="rbk-search-inp" placeholder="Buscar por título, autor o género…" value="${esc(booksUiState.search)}" autocomplete="off">
          ${booksUiState.search ? `<button type="button" class="rbk-search-clear" id="rbk-search-clear" aria-label="Limpiar búsqueda">✕</button>` : ''}
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

      <!-- Lista de libros -->
      ${list.length === 0 ? `
        <div class="rbk-empty">
          <div class="rbk-empty-ico">${svg(ICO.book, 24)}</div>
          <b>${q || filterState !== 'all' || advCount > 0 ? 'Sin resultados con estos filtros' : 'Tu biblioteca está vacía'}</b>
          <span>${q || filterState !== 'all' || advCount > 0
            ? 'Prueba ajustando el estado, la búsqueda o los filtros avanzados.'
            : 'Añade el primer libro buscando en Google Books o regístralo manualmente.'}</span>
          ${q || filterState !== 'all' || advCount > 0
            ? `<button type="button" class="btn btn-secondary btn-sm" id="rbk-reset-empty">Ver todos los libros</button>`
            : `<button type="button" class="btn btn-primary btn-sm" id="rbk-add-empty">+ Añadir primer libro</button>`}
        </div>
      ` : `
        <div class="rbk-list">
          ${list.map(b => renderBookCard(b, progMap.get(b.id), user, lockedIds.has(b.id))).join('')}
        </div>
      `}
    </div>
  `;

  const find = id => allBooks.find(b => b.id === id);

  // Header & Stats
  viewport.querySelector('#rbk-open-stats')?.addEventListener('click', () => {
    openReadingStatsModal(group, user, progMap);
  });

  const handleAddClick = () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openAddBookModal(user);
  };
  viewport.querySelector('#rbk-add-btn')?.addEventListener('click', handleAddClick);
  viewport.querySelector('#rbk-add-empty')?.addEventListener('click', handleAddClick);

  // Filtros de estado
  viewport.querySelectorAll('[data-rbk-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilterState(btn.getAttribute('data-rbk-filter'));
      rerender();
    });
  });

  // Búsqueda
  viewport.querySelector('#rbk-search-inp')?.addEventListener('input', e => {
    booksUiState.search = e.target.value;
    const pos = e.target.selectionStart;
    rerender();
    const inp = viewport.querySelector('#rbk-search-inp');
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  viewport.querySelector('#rbk-search-clear')?.addEventListener('click', () => {
    booksUiState.search = '';
    rerender();
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
      else if (k === 'onlyMine') booksUiState.onlyMine = false;
      else if (k === 'sort') booksUiState.sort = 'recent';
      rerender();
    });
  });

  const resetAllFilters = () => {
    booksUiState.search = '';
    booksUiState.genre = 'all';
    booksUiState.author = 'all';
    booksUiState.rating = 'all';
    booksUiState.onlyMine = false;
    booksUiState.sort = 'recent';
    setFilterState('all');
    rerender();
  };
  viewport.querySelector('#rbk-clear-all')?.addEventListener('click', resetAllFilters);
  viewport.querySelector('#rbk-reset-empty')?.addEventListener('click', resetAllFilters);

  // Interacciones de tarjetas
  viewport.querySelectorAll('[data-rbk-card]').forEach(card => {
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

  viewport.querySelectorAll('[data-rbk-status]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const b = find(btn.getAttribute('data-rbk-status'));
      if (b) openBookProgressModal(b, user, openReviewModal);
    });
  });

  viewport.querySelectorAll('[data-rbk-act]').forEach(btn => {
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

  viewport.querySelectorAll('[data-rbk-social]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const b = find(btn.getAttribute('data-rbk-social'));
      if (b) openBookDetailModal(b.id, user, { openReviewModal, openMediaCommentsModal, onQuoteBook, initialTab: 'comments' });
    });
  });

  viewport.querySelectorAll('[data-rbk-more]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const b = find(btn.getAttribute('data-rbk-more'));
      if (!b) return;
      openBookOptionsMenu(group, b, user, { openReviewModal, openMediaCommentsModal, onQuoteBook });
    });
  });
}

function renderBookCard(book, prog, user, isLocked) {
  const id = esc(book.id);
  const st = statusMeta(prog?.status || 'Por leer');
  const total = Number(book.pages || 0);
  const pct = getBookPct(book, prog || { status: 'Por leer', currentPage: 0 });
  const myRating = book.ratings?.[user.id];
  const groupAvg = getAverage(book);
  const commentsCount = (book.comments || []).length;
  const reviewsCount = Object.keys(book.ratings || {}).length;
  const authorYear = [book.author || 'Autor desconocido', book.year, total > 0 ? `${total} pág.` : ''].filter(Boolean).join(' · ');

  let primaryActHtml = '';
  if (!isLocked) {
    if (st.id === 'Leyendo') {
      primaryActHtml = `<button type="button" class="rbk-primary-act accent" data-rbk-act="${id}" data-rbk-act-mode="progress">Actualizar progreso</button>`;
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
  }

  return `
    <article class="rbk-card ${isLocked ? 'is-locked' : ''}" data-rbk-card="${id}">
      <div class="rbk-cover-wrap">
        <img class="rbk-cover" src="${esc(book.poster || 'assets/ruma_icon_512.png')}" alt="${esc(book.title)}" loading="lazy">
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
          ${ratingHtml}
        </div>

        ${isLocked ? `
          <div class="rbk-locked-note">Excede el límite de 5 libros del Plan Free · Toca para desbloquear</div>
        ` : st.id === 'Leyendo' ? `
          <div class="rbk-prog-box">
            <div class="rbk-prog-head">
              <span>${total > 0 ? `Pág. ${prog.currentPage} de ${total}` : (prog.currentPage > 0 ? `Página ${prog.currentPage}` : 'Añade el total de páginas')}</span>
              ${total > 0 ? `<b>${pct}%</b>` : ''}
            </div>
            <div class="rbk-prog-track"><i class="rbk-prog-fill" style="width:${total > 0 ? pct : (prog.currentPage > 0 ? 15 : 4)}%"></i></div>
          </div>
        ` : ''}

        ${!isLocked ? `
          <div class="rbk-card-footer">
            ${primaryActHtml}
            <div class="rbk-social-mini">
              ${(commentsCount > 0 || reviewsCount > 0) ? `
                <button type="button" class="rbk-ghost-act" data-rbk-social="${id}" title="Reseñas y comentarios">
                  ${svg(ICO.comment, 13)}<span>${commentsCount + reviewsCount}</span>
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
// MENÚ DE OPCIONES SECUNDARIAS (⋯) — ACTION SHEET MÓVIL LIMPIO
// ============================================================================
function openBookOptionsMenu(group, book, user, ctx) {
  const { openReviewModal, openMediaCommentsModal, onQuoteBook } = ctx;
  const canDelete = store.canDeleteMediaItem(group, book, user);
  const proposer = book.proposedBy?.name || book.addedBy || 'Miembro';
  const prog = store.getUserBookProgress(book, user.id);
  const total = Number(book.pages || 0);
  const subtitle = [book.author || 'Autor desconocido', total > 0 ? `${total} pág.` : 'Sin páginas'].join(' · ');

  UI.openModal({
    title: 'Opciones del libro',
    contentHtml: `
      <div class="rbk-sheet">
        <div class="rbk-sheet-head">
          <img src="${esc(book.poster || 'assets/ruma_icon_512.png')}" alt="">
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
          <button type="button" class="rbk-sheet-row" id="rbk-opt-detail">
            <span class="rbk-sheet-ico">${svg(ICO.book, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Ver ficha completa</span><small>Sinopsis, reseñas y lectores del grupo</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-prog">
            <span class="rbk-sheet-ico">${svg(ICO.bookmark, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Actualizar progreso</span><small>${total > 0 ? `Página ${prog.currentPage} de ${total}` : 'Registrar página actual y total'}</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-edit">
            <span class="rbk-sheet-ico">${svg(ICO.edit, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Editar páginas y datos</span><small>${total > 0 ? `${total} páginas · ${book.year || 'Sin año'}` : 'Falta el total de páginas'}</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-rate">
            <span class="rbk-sheet-ico">${svg(ICO.star, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Calificar / Escribir reseña</span><small>Comparte tu puntuación con el club</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-comm">
            <span class="rbk-sheet-ico">${svg(ICO.comment, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Comentarios del grupo</span><small>${(book.comments || []).length} comentario${(book.comments || []).length === 1 ? '' : 's'}</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          <button type="button" class="rbk-sheet-row" id="rbk-opt-quote">
            <span class="rbk-sheet-ico">${svg(ICO.quote, 17)}</span>
            <span class="rbk-sheet-row-txt"><span>Citar en el chat</span><small>Envía este libro a la conversación</small></span>
            <span class="rbk-sheet-chev">${svg(ICO.chevronRight, 16)}</span>
          </button>

          ${canDelete ? `
            <button type="button" class="rbk-sheet-row danger" id="rbk-opt-del">
              <span class="rbk-sheet-ico">${svg(ICO.trash, 17)}</span>
              <span class="rbk-sheet-row-txt"><span>Eliminar libro</span><small>Añadido por ${esc(proposer)}</small></span>
            </button>
          ` : `
            <div style="font-size:0.74rem;color:var(--text-muted);text-align:center;padding:0.45rem;border-radius:0.8rem;background:rgba(255,255,255,0.03);">
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
          UI.showToast(`Estado actualizado a "${st}"`, 'success');
        });
      });

      const bind = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { UI.closeModal(); fn(); });
      bind('rbk-opt-detail', () => openBookDetailModal(book.id, user, ctx));
      bind('rbk-opt-prog', () => openBookProgressModal(book, user, openReviewModal));
      bind('rbk-opt-edit', () => openEditBookMetaModal(book));
      bind('rbk-opt-rate', () => openReviewModal('books', book, user));
      bind('rbk-opt-comm', () => openMediaCommentsModal('books', book));
      bind('rbk-opt-quote', () => onQuoteBook(book));
      bind('rbk-opt-del', () => {
        const res = store.deleteMediaItem('books', book.id);
        UI.showToast(res.ok ? 'Libro eliminado' : res.error, res.ok ? 'info' : 'error');
      });
    }
  });
}

// ============================================================================
// EDITAR TOTAL DE PÁGINAS Y METADATOS DEL LIBRO
// ============================================================================
function openEditBookMetaModal(book, onSaved) {
  UI.openModal({
    title: 'Editar datos del libro',
    contentHtml: `
      <form id="rbk-edit-meta-form" style="display:flex;flex-direction:column;gap:0.85rem;">
        <div style="font-size:0.82rem;color:#c4b5fd;"><b>${esc(book.title)}</b> · ${esc(book.author || 'Autor desconocido')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
          <div class="rbk-mini-field">
            <label for="rbk-em-pages">Total de páginas</label>
            <input type="number" id="rbk-em-pages" min="1" value="${Number(book.pages || 0) || ''}" placeholder="Ej. 352" required>
          </div>
          <div class="rbk-mini-field">
            <label for="rbk-em-year">Año</label>
            <input type="text" id="rbk-em-year" maxlength="4" value="${esc(book.year || '')}" placeholder="Ej. 2021">
          </div>
        </div>
        <div class="rbk-mini-field">
          <label for="rbk-em-genre">Género</label>
          <input type="text" id="rbk-em-genre" value="${esc(book.genres || '')}" placeholder="Ficción, Fantasía, Ensayo…">
        </div>
        <div class="rbk-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rbk-em-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm">Guardar datos</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('rbk-em-cancel')?.addEventListener('click', () => {
        UI.closeModal();
        if (typeof onSaved === 'function') onSaved();
      });
      document.getElementById('rbk-edit-meta-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const pages = Math.max(0, Math.round(Number(document.getElementById('rbk-em-pages').value || 0)));
        const year = document.getElementById('rbk-em-year').value.trim();
        const genres = document.getElementById('rbk-em-genre').value.trim();
        store.updateMediaItem('books', book.id, { pages, year, genres });
        UI.closeModal();
        UI.showToast('Datos del libro actualizados', 'success');
        if (typeof onSaved === 'function') onSaved();
      });
    }
  });
}

// ============================================================================
// VISTA DETALLADA DEL LIBRO (FICHA + PROGRESO + RESEÑAS + COMENTARIOS)
// ============================================================================
function openBookDetailModal(bookId, user, ctx) {
  const { openReviewModal, onQuoteBook, initialTab = 'reviews' } = ctx;
  let activeTab = initialTab;
  let synopsisExpanded = false;
  let replyTarget = null; // { userId, authorName }

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

    // Lectores del grupo
    const readers = Object.entries(book.userProgress || {}).map(([uid, rp]) => {
      const m = (group.members || []).find(x => x.id === uid);
      return {
        uid,
        name: m?.name || rp.userName || 'Miembro',
        avatar: m?.avatar || rp.userAvatar || 'assets/ruma_default_avatar.png',
        status: rp.status || 'Por leer',
        currentPage: Number(rp.currentPage || 0)
      };
    });

    const reviews = Object.entries(book.ratings || {}).sort(([a], [b]) => (a === user.id ? -1 : b === user.id ? 1 : 0));
    const comments = book.comments || [];

    UI.openModal({
      title: book.title,
      size: 'lg',
      contentHtml: `
        <div class="rbk-det">
          <!-- Hero -->
          <div class="rbk-det-hero">
            <img class="rbk-det-cover" src="${esc(book.poster || 'assets/ruma_icon_512.png')}" alt="${esc(book.title)}">
            <div class="rbk-det-meta">
              <h2 class="rbk-det-title">${esc(book.title)}</h2>
              <div class="rbk-det-author">${esc(book.author || 'Autor desconocido')}</div>
              <div class="rbk-det-facts">
                ${book.year ? `<span class="rbk-fact-chip">${esc(book.year)}</span>` : ''}
                ${total > 0
                  ? `<button type="button" class="rbk-fact-chip" id="rbk-det-edit-pages" style="cursor:pointer;font-family:inherit;" title="Editar total de páginas">${total} páginas ✎</button>`
                  : `<button type="button" class="rbk-fact-btn" id="rbk-det-edit-pages">+ Añadir páginas</button>`}
                ${genres.slice(0, 3).map(g => `<span class="rbk-fact-chip">${esc(g)}</span>`).join('')}
              </div>
              <div class="rbk-det-ratings">
                <span class="rbk-rating-tag">★ ${avg !== null ? Number(avg).toFixed(1) : '—'} <small>grupo${reviews.length ? ` (${reviews.length})` : ''}</small></span>
                ${myRating ? `<span class="rbk-rating-tag">★ ${Number(myRating.score).toFixed(1)} <small>tu nota</small></span>` : ''}
              </div>
            </div>
          </div>

          <!-- Estado de lectura -->
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

          <!-- Progreso de lectura integrado -->
          ${prog.status === 'Leyendo' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-prog-panel-top">
                <div>
                  <div class="rbk-seg-label" style="margin:0;">Progreso de lectura</div>
                  <div style="font-size:0.78rem;color:#cbbbe6;margin-top:0.15rem;">
                    ${total > 0 ? `Página ${prog.currentPage} de ${total}` : `Página actual: ${prog.currentPage} · falta total`}
                  </div>
                </div>
                <div class="rbk-prog-pct">${total > 0 ? `${pct}%` : `${prog.currentPage} pág.`}</div>
              </div>
              <div class="rbk-prog-track"><i class="rbk-prog-fill" style="width:${total > 0 ? pct : (prog.currentPage > 0 ? 15 : 0)}%"></i></div>
              <div>
                <div class="rbk-seg-label" style="margin-bottom:0.35rem;">Avance rápido</div>
                <div class="rbk-quick-steps">
                  ${[5, 10, 25, 50].map(step => `<button type="button" class="rbk-step-btn" data-det-step="${step}">+${step}</button>`).join('')}
                </div>
              </div>
              <form id="rbk-det-prog-form" class="rbk-prog-inputs">
                <div class="rbk-mini-field">
                  <label for="rbk-det-cur">Página actual</label>
                  <input type="number" id="rbk-det-cur" min="0" ${total > 0 ? `max="${total}"` : ''} value="${prog.currentPage}">
                </div>
                <div class="rbk-mini-field">
                  <label for="rbk-det-tot">Total páginas</label>
                  <input type="number" id="rbk-det-tot" min="0" value="${total || ''}" placeholder="Ej. 320">
                </div>
                <button type="submit" class="btn btn-primary btn-sm rbk-prog-save">Guardar progreso</button>
              </form>
            </div>
          ` : prog.status === 'Leído' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-prog-panel-top">
                <div>
                  <div style="font-size:0.86rem;font-weight:800;color:#6ee7b7;">Lectura completada</div>
                  <div style="font-size:0.76rem;color:#cbbbe6;margin-top:0.12rem;">
                    ${prog.finishedAt ? `Finalizado el ${esc(formatFinishDate(prog.finishedAt))}` : 'Puedes añadir tu fecha de finalización o calificación.'}
                  </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="rbk-det-edit-done">Editar fecha</button>
              </div>
            </div>
          ` : ''}

          <!-- Sinopsis -->
          ${book.synopsis ? `
            <div style="display:flex;flex-direction:column;gap:0.2rem;">
              <div class="rbk-seg-label" style="margin-bottom:0.15rem;">Sinopsis</div>
              <p class="rbk-synopsis ${synopsisExpanded ? '' : 'clamped'}" id="rbk-det-syn">${esc(book.synopsis)}</p>
              ${book.synopsis.length > 220 ? `<button type="button" class="rbk-link-btn" id="rbk-det-syn-toggle">${synopsisExpanded ? 'Ver menos' : 'Leer sinopsis completa'}</button>` : ''}
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
                    <span><b>${esc(r.name)}</b> <small>· ${esc(r.status)}${r.status === 'Leyendo' && total > 0 ? ` (${Math.min(100, Math.round((r.currentPage / total) * 100))}%)` : ''}</small></span>
                  </span>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Sección social: Reseñas y Comentarios -->
          <div style="display:flex;flex-direction:column;gap:0.7rem;">
            <div class="rbk-social-tabs" role="tablist">
              <button type="button" class="rbk-social-tab ${activeTab === 'reviews' ? 'active' : ''}" data-det-tab="reviews">Reseñas (${reviews.length})</button>
              <button type="button" class="rbk-social-tab ${activeTab === 'comments' ? 'active' : ''}" data-det-tab="comments">Comentarios (${comments.length})</button>
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
                          <span class="rbk-review-score" style="background:${scoreColor(r.score)};">★ ${Number(r.score).toFixed(1)}</span>
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
            ` : `
              <div style="display:flex;flex-direction:column;gap:0.55rem;">
                ${comments.length === 0 ? `
                  <div class="rbk-empty" style="padding:1.2rem 1rem;">
                    <span>Aún no hay comentarios. Inicia la conversación sobre este libro.</span>
                  </div>
                ` : comments.map(c => {
                  const rx = c.reactions || { '❤️': 0, '🔥': 0, '😂': 0 };
                  return `
                    <div class="rbk-comment-card">
                      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.4rem;font-size:0.76rem;">
                        <strong style="color:#f3e8ff;">${esc(c.authorName || c.userName)}${c.userProgressLabel ? ` <span style="font-weight:600;color:#b8a3d9;">· ${esc(c.userProgressLabel)}</span>` : ''}</strong>
                        <span style="color:var(--text-muted);">${esc(c.time || 'Reciente')}</span>
                      </div>
                      ${c.replyToReviewAuthor ? `<div class="rbk-comment-quote">En respuesta a la reseña de ${esc(c.replyToReviewAuthor)}</div>` : ''}
                      <p style="margin:0;font-size:0.84rem;color:var(--text-main);line-height:1.45;">${esc(c.text)}</p>
                      <div style="display:flex;gap:0.35rem;margin-top:0.15rem;">
                        ${['❤️', '🔥', '😂'].map(em => `
                          <button type="button" class="rbk-ghost-act" style="min-height:26px;padding:0.1rem 0.45rem;font-size:0.72rem;" data-det-react="${esc(c.id)}" data-det-em="${em}">${em} ${rx[em] || 0}</button>
                        `).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}

                ${replyTarget ? `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:0.38rem 0.65rem;border-radius:0.7rem;background:rgba(236,72,153,0.12);border:1px solid rgba(236,72,153,0.3);font-size:0.75rem;color:#f5d0fe;">
                    <span>Respondiendo a la reseña de <b>${esc(replyTarget.authorName)}</b></span>
                    <button type="button" id="rbk-cancel-reply" style="background:none;border:0;color:#f472b6;cursor:pointer;font-weight:700;">✕</button>
                  </div>
                ` : ''}

                <form id="rbk-det-comm-form" class="rbk-comment-form">
                  <input type="text" id="rbk-det-comm-inp" class="form-input" placeholder="${replyTarget ? `Responder a ${esc(replyTarget.authorName)}…` : 'Escribe un comentario para el grupo…'}" required>
                  <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
                </form>
              </div>
            `}
          </div>

          <!-- Acciones secundarias de pie -->
          <div class="${canDelete ? 'rbk-modal-foot' : 'rbk-det-footer'}" style="border-top:1px solid rgba(192,132,252,0.16);padding-top:0.75rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="rbk-det-quote" style="${canDelete ? '' : 'width:100%;'}">↩ Citar en chat</button>
            ${canDelete ? `<button type="button" class="btn btn-sm" id="rbk-det-del" style="background:rgba(239,68,68,0.14);border:1px solid rgba(239,68,68,0.4);color:#fca5a5;">Eliminar</button>` : ''}
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        // Editar páginas desde la ficha
        modalEl.querySelector('#rbk-det-edit-pages')?.addEventListener('click', () => {
          openEditBookMetaModal(book, () => renderModal());
        });

        // Cambio de estado
        modalEl.querySelectorAll('[data-det-st]').forEach(btn => {
          btn.addEventListener('click', () => {
            const nextSt = btn.getAttribute('data-det-st');
            store.setUserBookProgress(book.id, { status: nextSt });
            UI.showToast(`Estado actualizado a "${nextSt}"`, 'success');
            renderModal();
          });
        });

        // Avance rápido (+5, +10, +25, +50)
        modalEl.querySelectorAll('[data-det-step]').forEach(btn => {
          btn.addEventListener('click', () => {
            const delta = Number(btn.getAttribute('data-det-step'));
            const cur = Number(document.getElementById('rbk-det-cur')?.value || prog.currentPage || 0);
            const totVal = Number(document.getElementById('rbk-det-tot')?.value || total || 0);
            const next = totVal > 0 ? Math.min(totVal, cur + delta) : cur + delta;
            store.setUserBookProgress(book.id, {
              currentPage: next,
              totalPages: totVal > 0 ? totVal : undefined,
              status: totVal > 0 && next >= totVal ? 'Leído' : 'Leyendo'
            });
            UI.showToast(totVal > 0 && next >= totVal ? '¡Terminaste el libro!' : `Avance actualizado a pág. ${next}`, 'success');
            renderModal();
          });
        });

        // Guardar progreso manual en detalle
        modalEl.querySelector('#rbk-det-prog-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const cur = Number(document.getElementById('rbk-det-cur')?.value || 0);
          const totVal = Number(document.getElementById('rbk-det-tot')?.value || 0);
          store.setUserBookProgress(book.id, {
            currentPage: cur,
            totalPages: totVal > 0 ? totVal : undefined,
            status: totVal > 0 && cur >= totVal ? 'Leído' : 'Leyendo'
          });
          UI.showToast('Progreso guardado', 'success');
          renderModal();
        });

        // Editar fecha de finalización
        modalEl.querySelector('#rbk-det-edit-done')?.addEventListener('click', () => {
          openBookProgressModal(book, user, openReviewModal);
        });

        // Sinopsis toggle
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
          openReviewModal('books', book, user, () => renderModal());
        });

        // Comentar reseña de otro integrante
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

        // Enviar comentario
        modalEl.querySelector('#rbk-det-comm-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const text = document.getElementById('rbk-det-comm-inp')?.value.trim();
          if (!text) return;
          const meta = replyTarget
            ? { replyToReviewUserId: replyTarget.userId, replyToReviewAuthor: replyTarget.authorName }
            : null;
          store.addMediaComment('books', book.id, text, meta);
          replyTarget = null;
          renderModal();
        });

        // Reacciones en comentarios
        modalEl.querySelectorAll('[data-det-react]').forEach(btn => {
          btn.addEventListener('click', () => {
            store.reactMediaComment('books', book.id, btn.getAttribute('data-det-react'), btn.getAttribute('data-det-em'));
            renderModal();
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
// MODAL RÁPIDO DE ESTADO Y PROGRESO DE LECTURA
// ============================================================================
function openBookProgressModal(book, user, openReviewModal) {
  const prog = store.getUserBookProgress(book, user.id);
  let selectedStatus = prog.status || 'Por leer';
  let currentPage = Number(prog.currentPage || 0);
  let totalPages = Number(book.pages || 0);
  let finishedAt = prog.finishedAt || new Date().toISOString().slice(0, 10);

  const render = () => {
    const pct = selectedStatus === 'Leído'
      ? 100
      : (totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0);

    UI.openModal({
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

          ${selectedStatus === 'Leyendo' || selectedStatus === 'Abandonado' ? `
            <div class="rbk-prog-panel">
              <div class="rbk-prog-panel-top">
                <span style="font-size:0.8rem;color:#cbbbe6;font-weight:700;">Avance actual</span>
                <span class="rbk-prog-pct" id="rbk-pg-pct">${totalPages > 0 ? `${pct}%` : `${currentPage} pág.`}</span>
              </div>
              <div class="rbk-prog-track"><i class="rbk-prog-fill" id="rbk-pg-bar" style="width:${pct}%"></i></div>
              <div>
                <div class="rbk-seg-label" style="margin-bottom:0.35rem;">Avance rápido</div>
                <div class="rbk-quick-steps">
                  ${[5, 10, 25, 50].map(step => `<button type="button" class="rbk-step-btn" data-pg-add="${step}">+${step}</button>`).join('')}
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
                <div class="rbk-mini-field">
                  <label for="rbk-pg-cur">Página actual</label>
                  <input type="number" id="rbk-pg-cur" min="0" ${totalPages > 0 ? `max="${totalPages}"` : ''} value="${currentPage}">
                </div>
                <div class="rbk-mini-field">
                  <label for="rbk-pg-tot">Total de páginas</label>
                  <input type="number" id="rbk-pg-tot" min="0" value="${totalPages || ''}" placeholder="Ej. 320">
                </div>
              </div>
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
          const c = Math.max(0, Number(document.getElementById('rbk-pg-cur')?.value || 0));
          const t = Math.max(0, Number(document.getElementById('rbk-pg-tot')?.value || 0));
          currentPage = t > 0 ? Math.min(t, c) : c;
          totalPages = t;
          const p = t > 0 ? Math.min(100, Math.round((currentPage / t) * 100)) : 0;
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

        document.getElementById('rbk-pg-cur')?.addEventListener('input', updateLivePct);
        document.getElementById('rbk-pg-tot')?.addEventListener('input', updateLivePct);
        document.getElementById('rbk-pg-date')?.addEventListener('change', e => { finishedAt = e.target.value; });
        document.getElementById('rbk-pg-cancel')?.addEventListener('click', () => UI.closeModal());

        document.getElementById('rbk-prog-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const wantReview = Boolean(document.getElementById('rbk-pg-open-rev')?.checked);
          const dateVal = document.getElementById('rbk-pg-date')?.value;
          const finalCur = selectedStatus === 'Leído'
            ? (totalPages > 0 ? totalPages : currentPage)
            : Number(document.getElementById('rbk-pg-cur')?.value ?? currentPage);
          const finalTot = Number(document.getElementById('rbk-pg-tot')?.value || totalPages || 0);

          store.setUserBookProgress(book.id, {
            status: selectedStatus,
            currentPage: finalCur,
            totalPages: finalTot > 0 ? finalTot : undefined,
            finishedAt: selectedStatus === 'Leído' ? (dateVal || '') : ''
          });
          UI.closeModal();
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

          <div class="form-group" style="grid-column:1 / -1;">
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
        booksUiState.rating = document.getElementById('rbk-f-rating').value;
        booksUiState.onlyMine = Boolean(document.getElementById('rbk-f-mine').checked);
        UI.closeModal();
        rerender();
      });
    }
  });
}

// ============================================================================
// PANEL DEDICADO DE ESTADÍSTICAS DE LECTURA
// ============================================================================
function openReadingStatsModal(group, user, progMap) {
  const books = group.books || [];
  const total = books.length;
  const read = books.filter(b => progMap.get(b.id)?.status === 'Leído').length;
  const reading = books.filter(b => progMap.get(b.id)?.status === 'Leyendo').length;
  const pending = books.filter(b => progMap.get(b.id)?.status === 'Por leer').length;
  const dropped = books.filter(b => progMap.get(b.id)?.status === 'Abandonado').length;

  // Páginas leídas por el usuario actual
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
          <div class="rbk-st-tile"><b style="color:#6ee7b7;">${read}</b><small>Leídos</small></div>
          <div class="rbk-st-tile"><b style="color:#d8b4fe;">${reading}</b><small>Leyendo</small></div>
          <div class="rbk-st-tile"><b style="color:#bae6fd;">${pending}</b><small>Por leer</small></div>
        </div>

        ${total > 0 ? `
          <div style="display:flex;flex-direction:column;gap:0.35rem;">
            <div class="rbk-st-bar" aria-label="Distribución de biblioteca">
              ${read ? `<span style="width:${pctOf(read)}%;background:#10b981;" title="Leídos: ${read}"></span>` : ''}
              ${reading ? `<span style="width:${pctOf(reading)}%;background:#a855f7;" title="Leyendo: ${reading}"></span>` : ''}
              ${pending ? `<span style="width:${pctOf(pending)}%;background:#38bdf8;" title="Por leer: ${pending}"></span>` : ''}
              ${dropped ? `<span style="width:${pctOf(dropped)}%;background:#f43f5e;" title="Abandonados: ${dropped}"></span>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:#b8a3d9;">
              <span>${pctOf(read)}% completado</span>
              ${dropped > 0 ? `<span>${dropped} abandonado${dropped === 1 ? '' : 's'}</span>` : `<span>${reading} en progreso</span>`}
            </div>
          </div>
        ` : ''}

        <div class="rbk-st-highlights">
          <div class="rbk-st-hl">
            <span>Promedio de calificación</span>
            <b>★ ${avgMine !== '—' ? avgMine : avgGroup}</b>
            <small style="font-size:0.7rem;color:#b8a3d9;">${avgMine !== '—' ? `Tu promedio · Grupo: ${avgGroup}` : 'Promedio del grupo'}</small>
          </div>
          <div class="rbk-st-hl">
            <span>Páginas leídas</span>
            <b>${pagesRead.toLocaleString('es-ES')}</b>
            <small style="font-size:0.7rem;color:#b8a3d9;">Acumuladas en este grupo</small>
          </div>
        </div>

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
// AÑADIR LIBRO (BÚSQUEDA CON VISTA PREVIA + MANUAL + ESTADO INICIAL)
// ============================================================================
function openAddBookModal() {
  let activeTab = 'search';
  let results = [];
  let expandedIdx = -1;
  let lastQuery = '';
  let searching = false;
  let initialStatus = 'Por leer';

  const render = () => {
    UI.openModal({
      title: 'Añadir libro',
      size: 'md',
      contentHtml: `
        <div>
          <div class="rbk-add-tabs" role="tablist">
            <button type="button" class="rbk-social-tab ${activeTab === 'search' ? 'active' : ''}" data-add-tab="search">Buscar libro</button>
            <button type="button" class="rbk-social-tab ${activeTab === 'manual' ? 'active' : ''}" data-add-tab="manual">Añadir manual</button>
          </div>

          ${activeTab === 'search' ? `
            <div style="display:flex;flex-direction:column;gap:0.8rem;">
              <form id="rbk-api-form" style="display:flex;gap:0.45rem;">
                <input type="text" id="rbk-api-q" class="form-input" placeholder="Título o autor (ej. Dune, Cortázar…)" value="${esc(lastQuery)}" style="flex:1;">
                <button type="submit" class="btn btn-primary btn-sm">Buscar</button>
              </form>

              <div class="form-group" style="margin:0;">
                <label class="form-label" for="rbk-init-st" style="font-size:0.75rem;">Estado inicial al añadir</label>
                <select id="rbk-init-st" class="form-select">
                  ${STATUSES.map(s => `<option value="${s.id}" ${initialStatus === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                </select>
              </div>

              <div id="rbk-api-res" style="display:flex;flex-direction:column;gap:0.55rem;max-height:44dvh;overflow-y:auto;">
                ${searching ? `
                  <div style="text-align:center;padding:1.25rem;color:var(--brand-lilac);font-size:0.86rem;">Buscando en Google Books y Open Library…</div>
                ` : results.length === 0 ? `
                  <div style="text-align:center;padding:1.1rem 0.6rem;color:var(--text-muted);font-size:0.82rem;">
                    ${lastQuery
                      ? 'No encontramos resultados para esa búsqueda. Puedes cambiar a <b>Añadir manual</b> arriba.'
                      : 'Busca un libro para consultar su portada, páginas y sinopsis antes de añadirlo.'}
                  </div>
                ` : results.map((r, i) => `
                  <div class="rbk-res-card">
                    <div class="rbk-res-top">
                      <img class="rbk-res-cover" src="${esc(r.poster)}" alt="">
                      <div class="rbk-res-info">
                        <div class="rbk-res-title">${esc(r.title)}</div>
                        <div class="rbk-res-sub">${esc(r.author)}</div>
                        <div class="rbk-res-sub">${[r.year, r.pages ? `${r.pages} pág.` : '', r.genres].filter(Boolean).map(esc).join(' · ')}</div>
                      </div>
                    </div>
                    ${expandedIdx === i && r.synopsis ? `<p class="rbk-res-syn">${esc(r.synopsis.slice(0, 420))}${r.synopsis.length > 420 ? '…' : ''}</p>` : ''}
                    <div class="rbk-res-actions">
                      ${r.synopsis
                        ? `<button type="button" class="rbk-link-btn" data-toggle-syn="${i}">${expandedIdx === i ? 'Ocultar info' : 'Ver sinopsis'}</button>`
                        : '<span></span>'}
                      <button type="button" class="btn btn-primary btn-sm" data-pick-book="${i}">+ Añadir</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `
            <form id="rbk-man-form" style="display:flex;flex-direction:column;gap:0.75rem;">
              <div class="form-group"><label class="form-label">Título *</label><input type="text" id="rbk-m-title" class="form-input" required placeholder="Ej. Pedro Páramo"></div>
              <div class="form-group"><label class="form-label">Autor *</label><input type="text" id="rbk-m-author" class="form-input" required placeholder="Ej. Juan Rulfo"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
                <div class="form-group"><label class="form-label">Páginas</label><input type="number" id="rbk-m-pages" class="form-input" min="1" placeholder="240"></div>
                <div class="form-group"><label class="form-label">Año</label><input type="text" id="rbk-m-year" class="form-input" maxlength="4" placeholder="1955"></div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
                <div class="form-group"><label class="form-label">Género</label><input type="text" id="rbk-m-genre" class="form-input" placeholder="Ficción, Fantasía…"></div>
                <div class="form-group">
                  <label class="form-label">Estado inicial</label>
                  <select id="rbk-m-status" class="form-select">
                    ${STATUSES.map(s => `<option value="${s.id}" ${initialStatus === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-group"><label class="form-label">Sinopsis breve</label><textarea id="rbk-m-syn" class="form-input" rows="2" placeholder="Opcional…"></textarea></div>
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

        document.getElementById('rbk-init-st')?.addEventListener('change', e => {
          initialStatus = e.target.value;
        });

        document.getElementById('rbk-api-form')?.addEventListener('submit', async e => {
          e.preventDefault();
          const q = document.getElementById('rbk-api-q')?.value.trim();
          if (!q) return;
          lastQuery = q;
          searching = true;
          expandedIdx = -1;
          render();
          results = await searchBooksApi(q);
          searching = false;
          render();
        });

        modalEl.querySelectorAll('[data-toggle-syn]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-toggle-syn'));
            expandedIdx = expandedIdx === idx ? -1 : idx;
            render();
          });
        });

        modalEl.querySelectorAll('[data-pick-book]').forEach(btn => {
          btn.addEventListener('click', () => {
            const item = results[Number(btn.getAttribute('data-pick-book'))];
            if (!item) return;
            const res = store.addMediaToActiveGroup('books', item);
            if (!res.ok) return UI.showToast(res.error, 'error');
            if (res.item && initialStatus !== 'Por leer') {
              store.setUserBookProgress(res.item.id, { status: initialStatus });
            }
            UI.closeModal();
            UI.showToast(`"${item.title}" añadido (${initialStatus})`, 'success');
          });
        });

        document.getElementById('rbk-m-cancel')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('rbk-man-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const title = document.getElementById('rbk-m-title').value.trim();
          const author = document.getElementById('rbk-m-author').value.trim();
          const pages = Number(document.getElementById('rbk-m-pages').value || 0);
          const year = document.getElementById('rbk-m-year').value.trim();
          const genres = document.getElementById('rbk-m-genre').value.trim();
          const status = document.getElementById('rbk-m-status').value;
          const synopsis = document.getElementById('rbk-m-syn').value.trim();
          if (!title || !author) return;
          const res = store.addMediaToActiveGroup('books', {
            title,
            author,
            pages,
            year,
            genres,
            synopsis,
            poster: 'assets/ruma_icon_512.png'
          });
          if (!res.ok) return UI.showToast(res.error, 'error');
          if (res.item && status !== 'Por leer') {
            store.setUserBookProgress(res.item.id, { status });
          }
          UI.closeModal();
          UI.showToast(`"${title}" añadido (${status})`, 'success');
        });
      }
    });
  };

  render();
}
