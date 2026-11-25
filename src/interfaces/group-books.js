// Vista modular de Libros del Grupo (Banner, 3 métricas por usuario, Chips, Buscador + Orden, Google Books / Open Library + Manual, progreso de páginas y menú "⋯")
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { getAverage, renderGroupReviews } from '../components/media-widgets.js';

const svg = (inner, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  book: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H12v17H4.5A2.5 2.5 0 0 0 2 22V5.5Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H12v17h7.5a2.5 2.5 0 0 1 2.5 2V5.5Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="#1b1136"/><circle cx="15" cy="12" r="2" fill="#1b1136"/><circle cx="8" cy="18" r="2" fill="#1b1136"/>'
};

const booksUiState = { search: '', sort: 'recent' };

function badgeMeta(st) {
  if (st === 'Leído') return { icon: '🏆', label: 'Leído', cls: 'ss-done' };
  if (st === 'Leyendo') return { icon: '📖', label: 'Leyendo', cls: 'ss-watching' };
  return { icon: '🌱', label: 'Por leer', cls: 'ss-pending' };
}

async function searchBooksApi(query) {
  const q = encodeURIComponent(query.trim());
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=10`);
    if (res.ok) {
      const data = await res.json();
      const items = (data.items || []).map(v => {
        const info = v.volumeInfo || {};
        const rawImg = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
        return {
          title: info.title || 'Sin título',
          author: (info.authors || []).join(', ') || 'Autor desconocido',
          year: (info.publishedDate || '').slice(0, 4),
          pages: Number(info.pageCount || 0),
          genres: (info.categories || []).join(', '),
          synopsis: info.description || '',
          poster: rawImg ? rawImg.replace(/^http:/, 'https:') : 'assets/ruma_icon_512.png'
        };
      });
      if (items.length > 0) return items;
    }
  } catch (_) {}

  try {
    const res2 = await fetch(`https://openlibrary.org/search.json?q=${q}&limit=10`);
    if (res2.ok) {
      const data2 = await res2.json();
      return (data2.docs || []).map(d => ({
        title: d.title || 'Sin título',
        author: (d.author_name || []).join(', ') || 'Autor desconocido',
        year: d.first_publish_year ? String(d.first_publish_year) : '',
        pages: Number(d.number_of_pages_median || 0),
        genres: (d.subject || []).slice(0, 2).join(', '),
        synopsis: '',
        poster: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : 'assets/ruma_icon_512.png'
      }));
    }
  } catch (_) {}
  return [];
}

export function renderGroupBooksView(viewport, group, user, ctx) {
  const { getFilterState, setFilterState, openReviewModal, openMediaCommentsModal, onQuoteBook, rerender } = ctx;
  const filterState = getFilterState();
  const allBooks = group.books || [];
  const check = Entitlements.canAddMediaItem(group, 'books');
  const lockedIds = Entitlements.getLockedMediaIds(group, 'books');

  const progMap = new Map(allBooks.map(b => [b.id, store.getUserBookProgress(b, user.id)]));
  const readingCount = allBooks.filter(b => progMap.get(b.id)?.status === 'Leyendo').length;
  const readCount = allBooks.filter(b => progMap.get(b.id)?.status === 'Leído').length;

  let list = [...allBooks];
  if (['Leyendo', 'Por leer', 'Leído'].includes(filterState)) {
    list = list.filter(b => progMap.get(b.id)?.status === filterState);
  } else if (filterState === 'my-proposals') {
    list = list.filter(b => b.proposedBy?.id === user.id || b.addedBy === user.name);
  }

  const q = (booksUiState.search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(b => [b.title, b.author, b.genres, b.synopsis, b.year].some(v => String(v || '').toLowerCase().includes(q)));
  }

  const rate = b => Number(getAverage(b) ?? 0);
  if (booksUiState.sort === 'rating') list.sort((a, b) => rate(b) - rate(a));
  else if (booksUiState.sort === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  else if (booksUiState.sort === 'pages') list.sort((a, b) => (Number(b.pages) || 0) - (Number(a.pages) || 0));

  const chips = [
    { id: 'all', label: 'Todos' },
    { id: 'Leyendo', label: '📖 Leyendo' },
    { id: 'Por leer', label: '🌱 Por leer' },
    { id: 'Leído', label: '🏆 Leídos' },
    { id: 'my-proposals', label: '👤 Mis propuestas' }
  ];

  viewport.innerHTML = `
    <div class="rmv-wrap">
      <section class="rg-card rmv-banner">
        <div class="rm-banner-left">
          <div class="rm-banner-ico">${svg(ICO.book, 26)}</div>
          <div class="rm-banner-txt">
            <h1>Libros</h1>
            <p>Libros que leemos y recomendamos</p>
          </div>
        </div>
        <div class="rmv-banner-art" aria-hidden="true"><span class="rmv-pop">📚</span><span class="rmv-reel">📖</span></div>
      </section>

      <section class="rms-stats">
        <div class="rmv-stat-card"><span class="rmv-stat-ico">${svg(ICO.book, 20)}</span><b>${allBooks.length}</b><small>Libros</small></div>
        <div class="rmv-stat-card"><span class="rmv-stat-ico">📖</span><b>${readingCount}</b><small>Leyendo</small></div>
        <div class="rmv-stat-card"><span class="rmv-stat-ico">🏆</span><b>${readCount}</b><small>Leídos</small></div>
      </section>

      <div class="rmv-chips" role="tablist">
        ${chips.map(c => `<button type="button" class="rmv-chip ${filterState === c.id ? 'active' : ''}" data-bk-filter="${c.id}">${c.label}</button>`).join('')}
      </div>

      <div class="rmv-search-row">
        <div class="rmv-search-box">
          ${svg(ICO.search, 18)}
          <input type="text" id="rmb-search-inp" placeholder="Buscar libro por título, autor o género..." value="${Utils.sanitize(booksUiState.search)}">
        </div>
        <button type="button" class="rmv-sort-btn ${booksUiState.sort !== 'recent' ? 'active' : ''}" id="rmb-sort-btn" aria-label="Ordenar">${svg(ICO.sliders, 18)}</button>
      </div>

      <button type="button" class="rm-add-cta" id="rmb-add">
        <span class="rm-plus">+</span>${svg(ICO.book, 22)}<span>Añadir Libro</span>
      </button>

      ${list.length === 0 ? `
        <div class="rg-card rm-empty">
          <b>${q || filterState !== 'all' ? 'No hay libros en este filtro' : 'Aún no hay libros en el club'}</b>
          <span>${q || filterState !== 'all' ? 'Prueba cambiando el filtro o buscando otro título.' : 'Añade el primer libro desde Google Books o manualmente.'}</span>
        </div>
      ` : `
        <div class="rmv-list">
          ${list.map(b => {
            const isLocked = lockedIds.has(b.id);
            const prog = progMap.get(b.id) || { status: 'Por leer', currentPage: 0 };
            const bm = badgeMeta(prog.status);
            const total = Number(b.pages || 0);
            const pct = prog.status === 'Leído' ? 100 : (total > 0 ? Math.min(100, Math.round((prog.currentPage / total) * 100)) : 0);
            const avg = getAverage(b);
            const ratingNum = avg !== null && avg !== undefined ? Number(avg).toFixed(1) : '—';
            const meta = [b.author, b.year, total ? `${total} pág.` : ''].filter(Boolean).join(' • ');
            const id = Utils.sanitize(b.id);

            return `
              <article class="rg-card rmv-card rms-card ${isLocked ? 'is-locked' : ''}">
                <img class="rmv-poster" src="${Utils.sanitize(b.poster || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(b.title)}" ${isLocked ? 'data-locked-book' : `data-bk-ficha="${id}"`}>
                <div class="rmv-body">
                  <div class="rmv-top">
                    <h3 class="rmv-title" ${isLocked ? 'data-locked-book' : `data-bk-ficha="${id}"`}>${Utils.sanitize(b.title)}</h3>
                    <button type="button" class="rmv-more-btn" data-bk-more="${id}" aria-label="Más opciones">⋯</button>
                  </div>
                  <div class="rmv-meta">${Utils.sanitize(meta || 'Libro')}</div>
                  <div class="rms-row">
                    <span class="rmv-rating-pill">⭐ <b>${Utils.sanitize(String(ratingNum))}</b></span>
                    ${isLocked
                      ? `<span class="rms-badge is-locked">🔒 Plan Free</span>`
                      : `<button type="button" class="rms-badge ${bm.cls}" style="cursor:pointer;font-family:inherit;" data-bk-cycle="${id}" title="Toca para cambiar tu estado">${bm.icon} ${bm.label}</button>`}
                  </div>
                  ${isLocked ? `
                    <div class="rmv-watched-some" style="color:#fca5a5;">🔒 Excede el límite de 5 libros del Plan Free</div>
                  ` : `
                    <div class="rms-progress">
                      <span class="rms-prog-txt">${total > 0 ? `${prog.status === 'Leído' ? total : prog.currentPage} / ${total} pág. (${pct}%)` : `${pct}%`}</span>
                      <div class="rms-bar"><i style="width:${pct}%"></i></div>
                    </div>
                  `}
                  <div class="rms-actions">
                    ${isLocked ? `
                      <button type="button" class="rms-btn is-locked" data-locked-book>🔒 Bloqueado · Activar ruma Plus</button>
                    ` : `
                      <button type="button" class="rms-btn rms-btn-main" data-bk-page="${id}">📖 Página</button>
                      <button type="button" class="rms-btn" data-bk-rate="${id}">✏ Reseña</button>
                      <button type="button" class="rms-btn" data-bk-comm="${id}">💬 ${(b.comments || []).length}</button>
                    `}
                  </div>
                </div>
              </article>`;
          }).join('')}
        </div>
      `}
    </div>
  `;

  const find = id => allBooks.find(b => b.id === id);

  viewport.querySelectorAll('[data-bk-filter]').forEach(b => b.addEventListener('click', () => {
    setFilterState(b.getAttribute('data-bk-filter'));
    rerender();
  }));

  viewport.querySelector('#rmb-search-inp')?.addEventListener('input', e => {
    booksUiState.search = e.target.value;
    const pos = e.target.selectionStart;
    rerender();
    const n = viewport.querySelector('#rmb-search-inp');
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} }
  });

  viewport.querySelector('#rmb-sort-btn')?.addEventListener('click', () => {
    const sorts = [
      ['recent', '🕒 Más recientes primero'],
      ['rating', '⭐ Mejor calificados'],
      ['title', '🔤 Orden alfabético (A-Z)'],
      ['pages', '📖 Más páginas primero']
    ];
    UI.openModal({
      title: 'Ordenar libros',
      contentHtml: `<div style="display:flex;flex-direction:column;gap:.55rem;">${sorts.map(([id, l]) =>
        `<button type="button" class="btn ${booksUiState.sort === id ? 'btn-primary' : 'btn-secondary'} btn-sm" style="justify-content:flex-start;" data-bk-sort="${id}">${l}</button>`).join('')}</div>`,
      onMount: () => {
        document.querySelectorAll('[data-bk-sort]').forEach(b => b.addEventListener('click', () => {
          booksUiState.sort = b.getAttribute('data-bk-sort');
          UI.closeModal();
          rerender();
        }));
      }
    });
  });

  viewport.querySelector('#rmb-add')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openAddBookModal();
  });

  viewport.querySelectorAll('[data-locked-book]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    UI.showUpgradeModal('En el Plan Free el límite es de 5 libros por grupo. Los más recientes quedaron bloqueados; activa ruma Plus para desbloquearlos.', () => store.upgradeGroupToPremium(group.id));
  }));

  viewport.querySelectorAll('[data-bk-cycle]').forEach(el => el.addEventListener('click', () => {
    const b = find(el.getAttribute('data-bk-cycle'));
    if (!b) return;
    const next = store.cycleBookStatus(b.id);
    if (next) UI.showToast(`Tu estado en "${b.title}": ${next.status}`, 'info');
  }));

  viewport.querySelectorAll('[data-bk-page]').forEach(el => el.addEventListener('click', () => {
    const b = find(el.getAttribute('data-bk-page'));
    if (b) openBookPageModal(b, user);
  }));

  viewport.querySelectorAll('[data-bk-ficha]').forEach(el => el.addEventListener('click', () => {
    const b = find(el.getAttribute('data-bk-ficha'));
    if (b) openBookDetailModal(group, b, user, openReviewModal);
  }));

  viewport.querySelectorAll('[data-bk-rate]').forEach(el => el.addEventListener('click', () => {
    const b = find(el.getAttribute('data-bk-rate'));
    if (b) openReviewModal('books', b, user);
  }));

  viewport.querySelectorAll('[data-bk-comm]').forEach(el => el.addEventListener('click', () => {
    const b = find(el.getAttribute('data-bk-comm'));
    if (b) openMediaCommentsModal('books', b);
  }));

  viewport.querySelectorAll('[data-bk-more]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const b = find(btn.getAttribute('data-bk-more'));
    if (!b) return;
    const canDelete = store.canDeleteMediaItem(group, b, user);
    const proposer = b.proposedBy?.name || b.addedBy || 'Miembro';
    UI.openModal({
      title: Utils.sanitize(b.title),
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="bk-m-ficha">📖 Ver ficha y reseñas</button>
          <button type="button" class="btn btn-secondary" id="bk-m-page">🔖 Actualizar página actual</button>
          <button type="button" class="btn btn-secondary" id="bk-m-rate">⭐ Calificar / Escribir reseña</button>
          <button type="button" class="btn btn-secondary" id="bk-m-comm">💬 Comentarios (${(b.comments || []).length})</button>
          <button type="button" class="btn btn-secondary" id="bk-m-quote">↩ Citar en el chat</button>
          <div style="font-size:.75rem;color:var(--text-muted);">Añadido por <b>${Utils.sanitize(proposer)}</b></div>
          ${canDelete ? `<button type="button" class="btn" id="bk-m-del" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:#fca5a5;">🗑️ Eliminar libro</button>` :
            `<div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.35rem;border-radius:.6rem;background:rgba(255,255,255,.03);">🔒 Solo quien lo añadió (${Utils.sanitize(proposer)}) o el líder del grupo pueden eliminarlo.</div>`}
        </div>`,
      onMount: () => {
        const on = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { UI.closeModal(); fn(); });
        on('bk-m-ficha', () => openBookDetailModal(group, b, user, openReviewModal));
        on('bk-m-page', () => openBookPageModal(b, user));
        on('bk-m-rate', () => openReviewModal('books', b, user));
        on('bk-m-comm', () => openMediaCommentsModal('books', b));
        on('bk-m-quote', () => onQuoteBook(b));
        on('bk-m-del', () => {
          const res = store.deleteMediaItem('books', b.id);
          UI.showToast(res.ok ? 'Libro eliminado 🗑️' : res.error, res.ok ? 'info' : 'error');
        });
      }
    });
  }));
}

function openBookPageModal(book, user) {
  const prog = store.getUserBookProgress(book, user.id);
  const total = Number(book.pages || 0);
  UI.openModal({
    title: `📖 Avance en "${Utils.sanitize(book.title)}"`,
    contentHtml: `
      <form id="bk-page-form" style="display:flex;flex-direction:column;gap:.85rem;">
        <div class="form-group">
          <label class="form-label">Estado</label>
          <select id="bk-st-sel" class="form-select">
            <option value="Por leer" ${prog.status === 'Por leer' ? 'selected' : ''}>🌱 Por leer</option>
            <option value="Leyendo" ${prog.status === 'Leyendo' ? 'selected' : ''}>📖 Leyendo</option>
            <option value="Leído" ${prog.status === 'Leído' ? 'selected' : ''}>🏆 Leído</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Página actual ${total > 0 ? `(de ${total})` : ''}</label>
          <input type="number" id="bk-pg-inp" class="form-input" min="0" ${total > 0 ? `max="${total}"` : ''} value="${prog.currentPage}">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="bk-pg-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar avance</button>
        </div>
      </form>`,
    onMount: () => {
      document.getElementById('bk-pg-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('bk-page-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const status = document.getElementById('bk-st-sel').value;
        const currentPage = Number(document.getElementById('bk-pg-inp').value || 0);
        store.setUserBookProgress(book.id, { status, currentPage });
        UI.closeModal();
        UI.showToast('Avance de lectura actualizado 📖', 'success');
      });
    }
  });
}

function openBookDetailModal(group, book, user, openReviewModal) {
  const avg = getAverage(book);
  const readers = Object.values(book.userProgress || {});
  UI.openModal({
    title: `📚 ${Utils.sanitize(book.title)}`,
    size: 'md',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:1rem;">
        <div style="display:flex;gap:1rem;align-items:flex-start;">
          <img src="${Utils.sanitize(book.poster || 'assets/ruma_icon_512.png')}" alt="" style="width:92px;height:138px;border-radius:10px;object-fit:cover;flex-shrink:0;">
          <div style="min-width:0;">
            <div style="font-weight:800;font-size:1.05rem;">${Utils.sanitize(book.title)}</div>
            <div style="color:var(--brand-lilac);font-size:.86rem;margin-top:.15rem;">${Utils.sanitize(book.author || 'Autor desconocido')}</div>
            <div style="color:var(--text-muted);font-size:.78rem;margin-top:.25rem;">
              ${[book.year, book.pages ? `${book.pages} páginas` : '', book.genres].filter(Boolean).map(x => Utils.sanitize(x)).join(' • ')}
            </div>
            <div style="margin-top:.5rem;">
              <span class="rmv-rating-pill">⭐ Grupo: <b>${avg !== null ? Number(avg).toFixed(1) : '—'}</b></span>
            </div>
          </div>
        </div>
        ${book.synopsis ? `<p style="font-size:.86rem;line-height:1.5;color:var(--text-secondary);margin:0;">${Utils.sanitize(book.synopsis)}</p>` : ''}
        ${readers.length > 0 ? `
          <div style="display:flex;flex-wrap:wrap;gap:.4rem;">
            ${readers.map(r => `<span class="badge badge-free">${Utils.sanitize(r.userName || 'Miembro')}: ${Utils.sanitize(r.status)}${book.pages ? ` (${r.currentPage}/${book.pages})` : ''}</span>`).join('')}
          </div>` : ''}
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
            <strong style="font-size:.9rem;">Reseñas del grupo</strong>
            <button type="button" class="btn btn-primary btn-sm" id="bk-det-rate">✏ Escribir reseña</button>
          </div>
          ${renderGroupReviews(book, group, user, { category: 'books' })}
        </div>
      </div>`,
    onMount: () => {
      document.getElementById('bk-det-rate')?.addEventListener('click', () => {
        UI.closeModal();
        openReviewModal('books', book, user);
      });
    }
  });
}

function openAddBookModal() {
  let results = [];
  UI.openModal({
    title: '📚 Añadir Libro',
    size: 'md',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.85rem;">
        <div style="display:flex;gap:.45rem;">
          <input type="text" id="bk-api-q" class="form-input" placeholder="Buscar título o autor (ej: Cien años de soledad)..." style="flex:1;">
          <button type="button" class="btn btn-primary btn-sm" id="bk-api-go">Buscar</button>
        </div>
        <div id="bk-api-res" style="display:flex;flex-direction:column;gap:.5rem;max-height:42dvh;overflow-y:auto;">
          <div style="font-size:.82rem;color:var(--text-muted);text-align:center;padding:.8rem;">Busca un libro en Google Books / Open Library o añádelo manualmente.</div>
        </div>
        <div style="border-top:1px solid var(--border-subtle);padding-top:.7rem;text-align:center;">
          <button type="button" class="btn btn-secondary btn-sm" id="bk-manual-btn">✍️ Añadir manualmente</button>
        </div>
      </div>`,
    onMount: () => {
      const doSearch = async () => {
        const q = document.getElementById('bk-api-q')?.value.trim();
        const box = document.getElementById('bk-api-res');
        if (!q || !box) return;
        box.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--brand-lilac);">Buscando libros...</div>`;
        results = await searchBooksApi(q);
        if (results.length === 0) {
          box.innerHTML = `<div style="text-align:center;padding:.8rem;color:var(--text-muted);">No se encontraron resultados. Puedes añadirlo manualmente abajo.</div>`;
          return;
        }
        box.innerHTML = results.map((r, i) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:.65rem;padding:.5rem;border-radius:.8rem;background:rgba(255,255,255,.04);">
            <div style="display:flex;align-items:center;gap:.65rem;min-width:0;">
              <img src="${Utils.sanitize(r.poster)}" alt="" style="width:40px;height:58px;border-radius:6px;object-fit:cover;flex-shrink:0;">
              <div style="min-width:0;">
                <div style="font-weight:700;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(r.title)}</div>
                <div style="font-size:.75rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(r.author)}${r.pages ? ` · ${r.pages} pág.` : ''}</div>
              </div>
            </div>
            <button type="button" class="btn btn-primary btn-sm" data-pick-book="${i}">+ Añadir</button>
          </div>`).join('');

        box.querySelectorAll('[data-pick-book]').forEach(b => b.addEventListener('click', () => {
          const item = results[Number(b.getAttribute('data-pick-book'))];
          const res = store.addMediaToActiveGroup('books', item);
          if (!res.ok) return UI.showToast(res.error, 'error');
          UI.closeModal();
          UI.showToast(`"${item.title}" añadido a Libros 📚`, 'success');
        }));
      };

      document.getElementById('bk-api-go')?.addEventListener('click', doSearch);
      document.getElementById('bk-api-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
      document.getElementById('bk-manual-btn')?.addEventListener('click', () => {
        UI.closeModal();
        openManualBookModal();
      });
    }
  });
}

function openManualBookModal() {
  UI.openModal({
    title: '✍️ Añadir libro manualmente',
    contentHtml: `
      <form id="bk-man-form" style="display:flex;flex-direction:column;gap:.75rem;">
        <div class="form-group"><label class="form-label">Título *</label><input type="text" id="bk-m-title" class="form-input" required></div>
        <div class="form-group"><label class="form-label">Autor *</label><input type="text" id="bk-m-author" class="form-input" required></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem;">
          <div class="form-group"><label class="form-label">Páginas</label><input type="number" id="bk-m-pages" class="form-input" min="1" placeholder="320"></div>
          <div class="form-group"><label class="form-label">Año</label><input type="text" id="bk-m-year" class="form-input" maxlength="4" placeholder="2024"></div>
        </div>
        <div class="form-group"><label class="form-label">Sinopsis breve</label><textarea id="bk-m-syn" class="form-input" rows="2"></textarea></div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="bk-m-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar libro</button>
        </div>
      </form>`,
    onMount: () => {
      document.getElementById('bk-m-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('bk-man-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const title = document.getElementById('bk-m-title').value.trim();
        const author = document.getElementById('bk-m-author').value.trim();
        const pages = Number(document.getElementById('bk-m-pages').value || 0);
        const year = document.getElementById('bk-m-year').value.trim();
        const synopsis = document.getElementById('bk-m-syn').value.trim();
        if (!title || !author) return;
        const res = store.addMediaToActiveGroup('books', { title, author, pages, year, synopsis, poster: 'assets/ruma_icon_512.png' });
        if (!res.ok) return UI.showToast(res.error, 'error');
        UI.closeModal();
        UI.showToast(`"${title}" añadido a Libros 📚`, 'success');
      });
    }
  });
}
