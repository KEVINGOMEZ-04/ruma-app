// Vista modular de Películas del Grupo (Banner, 4 Métricas por usuario, Chips, Buscador + Orden, CTA TMDb, Tarjetas con estado individual y menú "⋯")
import { fireConfetti } from '../core/confetti.js';
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { providerLink, hydrateMediaFromTmdb, getAverage } from '../components/media-widgets.js';

const svg = (inner, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  clapper: '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4m3 0 3-4"/><polygon points="10,11 10,16 15,13.5" fill="currentColor" stroke="none"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="18" r="2" fill="var(--surface)"/>'
};

// Estado local de búsqueda y orden
const movieUiState = {
  search: '',
  sort: 'recent' // 'recent' | 'rating' | 'year' | 'title'
};

function statusBadgeMeta(status) {
  if (status === 'Favorita') return { icon: '❤️', label: 'Favorita', cls: 'st-fav' };
  if (status === 'Vista') return { icon: '🍿', label: 'Vistas', cls: 'st-watched' };
  return { icon: '🌱', label: 'Por ver', cls: 'st-pending' };
}

function renderCompactProviders(movie) {
  const wp = movie.watchProviders;
  if (!wp || !Array.isArray(wp.providers) || wp.providers.length === 0) {
    return `<div class="rmv-prov-empty">Sin plataformas registradas</div>`;
  }
  const main = wp.providers.filter(p => p.type === 'Suscripción' || p.type.startsWith('Gratis') || p.type === 'Cadena original');
  const list = (main.length ? main : wp.providers).slice(0, 2);
  const extra = Math.max(0, wp.providers.length - list.length);
  return `
    <div class="rmv-provs">
      ${list.map(p => `
        <a class="rmv-prov-logo" href="${Utils.sanitize(providerLink(p, wp, movie.title))}" target="_blank" rel="noopener" title="${Utils.sanitize(p.name)}" data-stop-card>
          ${p.logo ? `<img src="${Utils.sanitize(p.logo)}" alt="${Utils.sanitize(p.name)}">` : `<span>${Utils.sanitize((p.name || '?').slice(0, 2))}</span>`}
        </a>
      `).join('')}
      ${extra > 0 ? `<span class="rmv-prov-more">+${extra}</span>` : ''}
    </div>`;
}

function renderGroupWatchedLine(movie, group) {
  const members = group.members || [];
  if (members.length === 0) return '';
  const watchedMembers = members.filter(m => {
    const st = store.getUserMovieStatus(movie, m.id);
    return st === 'Vista' || st === 'Favorita';
  });
  if (watchedMembers.length === members.length && members.length >= 1) {
    return `<div class="rmv-watched-all">✅ Todos los usuarios ya la vieron (${members.length}/${members.length})</div>`;
  }
  if (watchedMembers.length > 0) {
    const names = watchedMembers.map(m => (m.name || '').split(' ')[0]).join(', ');
    return `<div class="rmv-watched-some">👁️ Vista por ${watchedMembers.length} de ${members.length} (${Utils.sanitize(names)})</div>`;
  }
  return '';
}

export function renderGroupMoviesView(viewport, group, user, ctx) {
  const {
    getFilterState,
    setFilterState,
    openSearchTmdbModal,
    openMovieDetailModal,
    openReviewModal,
    openMediaCommentsModal,
    onQuoteMovie,
    rerender
  } = ctx;

  const filterState = getFilterState();
  const allMovies = group.movies || [];
  const check = Entitlements.canAddMediaItem(group, 'movies');

  // Contadores de las 4 cajas (basados en el estado personal del usuario actual)
  const totalCount = allMovies.length;
  let pendingCount = 0;
  let watchedCount = 0;
  let favCount = 0;

  allMovies.forEach(m => {
    const st = store.getUserMovieStatus(m, user.id);
    if (st === 'Favorita') {
      favCount += 1;
      watchedCount += 1; // una favorita también cuenta como vista por el usuario
    } else if (st === 'Vista') {
      watchedCount += 1;
    } else {
      pendingCount += 1;
    }
  });

  // Filtrado por chip activo (usando el estado individual del usuario)
  let movies = [...allMovies];
  if (filterState === 'Por ver') {
    movies = movies.filter(m => store.getUserMovieStatus(m, user.id) === 'Por ver');
  } else if (filterState === 'Vista') {
    movies = movies.filter(m => {
      const st = store.getUserMovieStatus(m, user.id);
      return st === 'Vista' || st === 'Favorita';
    });
  } else if (filterState === 'Favorita') {
    movies = movies.filter(m => store.getUserMovieStatus(m, user.id) === 'Favorita');
  } else if (filterState === 'my-proposals') {
    movies = movies.filter(m => m.proposedBy?.id === user.id || m.addedBy === user.name);
  }

  // Búsqueda por título, actor o género
  const q = (movieUiState.search || '').trim().toLowerCase();
  if (q) {
    movies = movies.filter(m => {
      const inTitle = (m.title || '').toLowerCase().includes(q);
      const inGenres = (m.genres || '').toLowerCase().includes(q);
      const inSyn = (m.synopsis || '').toLowerCase().includes(q);
      const inYear = String(m.year || '').includes(q);
      const inCast = (m.cast || '').toLowerCase().includes(q);
      return inTitle || inGenres || inSyn || inYear || inCast;
    });
  }

  // Ordenamiento
  if (movieUiState.sort === 'rating') {
    movies.sort((a, b) => (Number(getAverage(b) ?? b.tmdbRating ?? 0)) - (Number(getAverage(a) ?? a.tmdbRating ?? 0)));
  } else if (movieUiState.sort === 'year') {
    movies.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  } else if (movieUiState.sort === 'title') {
    movies.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }

  const chips = [
    { id: 'all', label: 'Todas' },
    { id: 'Por ver', label: '🌱 Por ver' },
    { id: 'Vista', label: '🍿 Vistas' },
    { id: 'Favorita', label: '❤️ Favoritas' },
    { id: 'my-proposals', label: '👤 Mis propuestas' }
  ];

  viewport.innerHTML = `
    <div class="rmv-wrap">
      <!-- Banner Películas -->
      <section class="rg-card rmv-banner">
        <div class="rm-banner-left">
          <div class="rm-banner-ico">${svg(ICO.clapper, 26)}</div>
          <div class="rm-banner-txt">
            <h1>Películas</h1>
            <p>${Utils.sanitize(group.name)}</p>
          </div>
        </div>
        <div class="rmv-banner-art" aria-hidden="true">
          <span class="rmv-pop">🍿</span>
          <span class="rmv-reel">🎞️</span>
        </div>
      </section>

      <!-- 4 Tarjetas de Métricas -->
      <section class="rmv-stats">
        <div class="rmv-stat-card">
          <span class="rmv-stat-ico">${svg(ICO.film, 20)}</span>
          <b>${totalCount}</b>
          <small>En cartelera</small>
        </div>
        <div class="rmv-stat-card">
          <span class="rmv-stat-ico">🌱</span>
          <b>${pendingCount}</b>
          <small>Por ver</small>
        </div>
        <div class="rmv-stat-card">
          <span class="rmv-stat-ico">🍿</span>
          <b>${watchedCount}</b>
          <small>Vistas</small>
        </div>
        <div class="rmv-stat-card">
          <span class="rmv-stat-ico">❤️</span>
          <b>${favCount}</b>
          <small>Favoritas</small>
        </div>
      </section>

      <!-- Chips de Filtro -->
      <div class="rmv-chips" role="tablist">
        ${chips.map(c => `
          <button type="button" class="rmv-chip ${filterState === c.id ? 'active' : ''}" data-mv-filter="${c.id}">
            ${c.label}
          </button>
        `).join('')}
      </div>

      <!-- Barra de Búsqueda + Botón de Opciones/Orden -->
      <div class="rmv-search-row">
        <div class="rmv-search-box">
          ${svg(ICO.search, 18)}
          <input type="text" id="rmv-search-inp" placeholder="Buscar película por título, actor o género..." value="${Utils.sanitize(movieUiState.search)}">
        </div>
        <button type="button" class="rmv-sort-btn ${movieUiState.sort !== 'recent' ? 'active' : ''}" id="rmv-sort-btn" aria-label="Ordenar o girar ruleta">
          ${svg(ICO.sliders, 18)}
        </button>
      </div>

      <!-- Botón + Añadir Película (TMDb) -->
      <button type="button" class="rm-add-cta" id="rmv-add-movie">
        <span class="rm-plus">+</span>
        ${svg(ICO.clapper, 22)}
        <span>Añadir Película (TMDb)</span>
      </button>

      <!-- Lista de Películas -->
      ${movies.length === 0 ? `
        <div class="rg-card rm-empty">
          <b>${q || filterState !== 'all' ? 'No hay películas en este filtro' : 'Aún no hay películas en la cartelera'}</b>
          <span>${q || filterState !== 'all' ? 'Prueba cambiando el filtro o buscando otro título.' : 'Añade la primera película desde TMDb para armar el plan del grupo.'}</span>
        </div>
      ` : `
        <div class="rmv-list">
          ${(() => {
            const lockedIds = Entitlements.getLockedMediaIds(group, 'movies');
            return movies.map(movie => {
            const isLocked = lockedIds.has(movie.id);
            const myStatus = store.getUserMovieStatus(movie, user.id);
            const stMeta = statusBadgeMeta(myStatus);
            const avg = getAverage(movie);
            const ratingNum = avg !== null ? avg.toFixed(1) : (movie.tmdbRating ? Number(movie.tmdbRating).toFixed(1) : '—');
            const metaParts = [movie.year, movie.duration, movie.genres || 'Cine'].filter(Boolean);
            const watchedLine = renderGroupWatchedLine(movie, group);

            return `
              <article class="rg-card rmv-card ${isLocked ? 'is-locked' : ''}">
                <img class="rmv-poster" src="${Utils.sanitize(movie.poster || 'assets/ruma_default_avatar.png')}" alt="${Utils.sanitize(movie.title)}" ${isLocked ? 'data-locked-movie' : `data-open-ficha="${Utils.sanitize(movie.id)}"`}>
                <div class="rmv-body">
                  <div class="rmv-top">
                    <h3 class="rmv-title" ${isLocked ? 'data-locked-movie' : `data-open-ficha="${Utils.sanitize(movie.id)}"`}>${Utils.sanitize(movie.title)}</h3>
                    <div class="rmv-actions-top">
                      ${isLocked ? `
                        <button type="button" class="rmv-status-pill is-locked" data-locked-movie>
                          <span>🔒</span><span>Plan Free</span>
                        </button>
                      ` : `
                        <button type="button" class="rmv-status-pill ${stMeta.cls}" data-pick-status="${Utils.sanitize(movie.id)}" title="Cambiar tu estado personal (Por ver / Vistas / Favorita)">
                          <span>${stMeta.icon}</span>
                          <span>${stMeta.label}</span>
                        </button>
                      `}
                      <button type="button" class="rmv-more-btn" data-more-movie="${Utils.sanitize(movie.id)}" aria-label="Más opciones">⋯</button>
                    </div>
                  </div>

                  <div class="rmv-meta">${Utils.sanitize(metaParts.join(' • '))}</div>

                  <div>
                    <span class="rmv-rating-pill">⭐ <b>${Utils.sanitize(String(ratingNum))}</b></span>
                  </div>

                  ${isLocked ? `<div class="rmv-watched-some" style="color:#fca5a5;">🔒 Excede el límite de 5 películas del Plan Free</div>` : watchedLine}

                  <div class="rmv-bottom">
                    ${renderCompactProviders(movie)}
                    <button type="button" class="rmv-ficha-btn ${isLocked ? 'is-locked' : ''}" ${isLocked ? 'data-locked-movie' : `data-open-ficha="${Utils.sanitize(movie.id)}"`}>
                      ${isLocked ? '🔒 Bloqueada' : `${svg(ICO.clapper, 15)}<span>Ver ficha</span>`}
                    </button>
                  </div>
                </div>
              </article>`;
          }).join('');
          })()}
        </div>
      `}
    </div>
  `;

  // Eventos de chips
  viewport.querySelectorAll('[data-mv-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      setFilterState(btn.getAttribute('data-mv-filter'));
      rerender();
    });
  });

  // Búsqueda en vivo conservando el foco
  const searchInp = viewport.querySelector('#rmv-search-inp');
  searchInp?.addEventListener('input', (e) => {
    movieUiState.search = e.target.value;
    const pos = e.target.selectionStart;
    rerender();
    const nextInp = viewport.querySelector('#rmv-search-inp');
    if (nextInp) {
      nextInp.focus();
      try { nextInp.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  // Botón de orden y ruleta
  viewport.querySelector('#rmv-sort-btn')?.addEventListener('click', () => {
    const sorts = [
      ['recent', '🕒 Más recientes primero'],
      ['rating', '⭐ Mejor calificadas'],
      ['year', '📅 Año de estreno (nuevas primero)'],
      ['title', '🔤 Orden alfabético (A-Z)']
    ];
    UI.openModal({
      title: 'Ordenar y herramientas',
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.55rem;">
          ${sorts.map(([id, label]) => `
            <button type="button" class="btn ${movieUiState.sort === id ? 'btn-primary' : 'btn-secondary'} btn-sm" style="justify-content:flex-start;" data-mv-sort="${id}">${label}</button>
          `).join('')}
          ${pendingCount > 0 ? `
            <div style="margin-top:.4rem;padding-top:.6rem;border-top:1px solid var(--border-subtle);">
              <button type="button" class="btn btn-secondary btn-sm" style="width:100%;" id="rmv-roulette-btn">🎲 Ruleta: ¿Qué película por ver elegimos hoy?</button>
            </div>` : ''}
        </div>`,
      onMount: () => {
        document.querySelectorAll('[data-mv-sort]').forEach(b => b.addEventListener('click', () => {
          movieUiState.sort = b.getAttribute('data-mv-sort');
          UI.closeModal();
          rerender();
        }));
        document.getElementById('rmv-roulette-btn')?.addEventListener('click', () => {
          UI.closeModal();
          const candidates = allMovies.filter(m => store.getUserMovieStatus(m, user.id) === 'Por ver');
          if (!candidates.length) return;
          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          fireConfetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
          UI.showToast(`🎲 ¡La ruleta eligió "${picked.title}"! 🍿`, 'success');
          openMovieDetailModal(group, picked, user);
        });
      }
    });
  });

  // Añadir Película (TMDb)
  viewport.querySelector('#rmv-add-movie')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openSearchTmdbModal(group, 'movies');
  });

  // Botón de estado personal: permite elegir o ciclar entre las 3 opciones ("Por ver", "Vista", "Favorita")
  viewport.querySelectorAll('[data-pick-status]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const movieId = btn.getAttribute('data-pick-status');
      const movie = allMovies.find(m => m.id === movieId);
      if (!movie) return;
      const current = store.getUserMovieStatus(movie, user.id);
      const next = store.cycleMovieStatus(movieId);
      const label = next === 'Vista' ? 'Vistas 🍿' : (next === 'Favorita' ? 'Favorita ❤️' : 'Por ver 🌱');
      UI.showToast(`Tu estado en "${movie.title}": ${label}`, 'info');
    });
  });

  // Abrir ficha completa (sinopsis, calificación general y plataformas)
  viewport.querySelectorAll('[data-open-ficha]').forEach(el => {
    el.addEventListener('click', () => {
      const movie = allMovies.find(m => m.id === el.getAttribute('data-open-ficha'));
      if (movie) openMovieDetailModal(group, movie, user);
    });
  });

  viewport.querySelectorAll('[data-locked-movie]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.showUpgradeModal('En el Plan Free el límite es de 5 películas por grupo. Las más recientes quedaron bloqueadas; activa ruma Plus para desbloquearlas.', () => store.upgradeGroupToPremium(group.id));
    });
  });

  // Menú "⋯" al lado del botón de estado: cambiar a cualquiera de las 3 opciones, reseñar, comentar, citar y eliminar (solo quien la añadió o el líder)
  viewport.querySelectorAll('[data-more-movie]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const movie = allMovies.find(m => m.id === btn.getAttribute('data-more-movie'));
      if (!movie) return;
      const myStatus = store.getUserMovieStatus(movie, user.id);
      const canDelete = store.canDeleteMediaItem(group, movie, user);
      const proposerName = movie.proposedBy?.name || movie.addedBy || 'Miembro';

      UI.openModal({
        title: Utils.sanitize(movie.title),
        contentHtml: `
          <div style="display:flex;flex-direction:column;gap:.6rem;">
            <div style="font-size:.78rem;color:var(--text-muted);">Tu estado personal (no modifica el de los demás):</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">
              ${[
                ['Por ver', '🌱 Por ver'],
                ['Vista', '🍿 Vistas'],
                ['Favorita', '❤️ Favorita']
              ].map(([st, lbl]) => `
                <button type="button" class="btn ${myStatus === st ? 'btn-primary' : 'btn-secondary'} btn-sm" data-set-mv-st="${st}">${lbl}</button>
              `).join('')}
            </div>

            <button type="button" class="btn btn-secondary" id="mv-m-ficha">🎬 Ver ficha (sinopsis, nota y plataformas)</button>
            <button type="button" class="btn btn-secondary" id="mv-m-rate">⭐ Calificar / Escribir reseña</button>
            <button type="button" class="btn btn-secondary" id="mv-m-comm">💬 Comentarios (${(movie.comments || []).length})</button>
            <button type="button" class="btn btn-secondary" id="mv-m-quote">↩ Citar en el chat</button>

            <div style="font-size:.75rem;color:var(--text-muted);padding-top:.2rem;">
              Añadida por <b>${Utils.sanitize(proposerName)}</b>
            </div>

            ${canDelete ? `
              <button type="button" class="btn" id="mv-m-del" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:#fca5a5;">
                🗑️ Eliminar película
              </button>
            ` : `
              <div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.35rem;border-radius:.6rem;background:rgba(255,255,255,.03);">
                🔒 Solo quien la añadió (${Utils.sanitize(proposerName)}) o el líder del grupo pueden eliminarla.
              </div>
            `}
          </div>`,
        onMount: () => {
          document.querySelectorAll('[data-set-mv-st]').forEach(b => b.addEventListener('click', () => {
            const st = b.getAttribute('data-set-mv-st');
            store.setUserMovieStatus(movie.id, st);
            UI.closeModal();
            UI.showToast(`Tu estado: ${st}`, 'info');
          }));
          document.getElementById('mv-m-ficha')?.addEventListener('click', () => { UI.closeModal(); openMovieDetailModal(group, movie, user); });
          document.getElementById('mv-m-rate')?.addEventListener('click', () => { UI.closeModal(); openReviewModal('movies', movie, user); });
          document.getElementById('mv-m-comm')?.addEventListener('click', () => { UI.closeModal(); openMediaCommentsModal('movies', movie); });
          document.getElementById('mv-m-quote')?.addEventListener('click', () => { UI.closeModal(); onQuoteMovie(movie); });
          document.getElementById('mv-m-del')?.addEventListener('click', () => {
            const res = store.deleteMediaItem('movies', movie.id);
            UI.closeModal();
            UI.showToast(res.ok ? 'Película eliminada de la cartelera 🗑️' : res.error, res.ok ? 'info' : 'error');
          });
        }
      });
    });
  });

  // Hidratar datos y plataformas reales desde TMDb en segundo plano
  hydrateMediaFromTmdb(group, 'movies');
}
