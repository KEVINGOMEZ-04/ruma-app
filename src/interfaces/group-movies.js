// Vista modular de Películas del Grupo (Banner, 4 Métricas clicables, Chips, Buscador sin parpadeo, Ruleta visible, Tarjetas con estado individual y menú "⋯")
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
  sort: 'recent' // 'recent' | 'priority' | 'rating' | 'year' | 'title'
};

function statusBadgeMeta(status) {
  if (status === 'Favorita') return { icon: '❤️', label: 'Favorita', cls: 'st-fav' };
  if (status === 'Vista') return { icon: '🍿', label: 'Vista', cls: 'st-watched' };
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
        <a class="rmv-prov-logo" href="${Utils.sanitize(Utils.safeUrl(providerLink(p, wp, movie.title), '#'))}" target="_blank" rel="noopener noreferrer" title="${Utils.sanitize(p.name)}" data-stop-card>
          ${p.logo ? `<img src="${Utils.sanitize(Utils.safeUrl(p.logo, ''))}" alt="${Utils.sanitize(p.name)}" loading="lazy">` : `<span>${Utils.sanitize((p.name || '?').slice(0, 2))}</span>`}
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

function filterAndSortMovies(allMovies, filterState, user) {
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

  const q = (movieUiState.search || '').trim().toLowerCase();
  if (q) {
    movies = movies.filter(m => {
      const inTitle = (m.title || '').toLowerCase().includes(q);
      const inGenres = (m.genres || '').toLowerCase().includes(q);
      const inSyn = (m.synopsis || '').toLowerCase().includes(q);
      const inYear = String(m.year || '').includes(q);
      const inCast = (m.cast || '').toLowerCase().includes(q);
      const inDirector = (m.director || '').toLowerCase().includes(q);
      return inTitle || inGenres || inSyn || inYear || inCast || inDirector;
    });
  }

  if (movieUiState.sort === 'priority') {
    movies.sort((a, b) => (Number(b.priority || 0)) - (Number(a.priority || 0)));
  } else if (movieUiState.sort === 'rating') {
    movies.sort((a, b) => (Number(getAverage(b) ?? b.tmdbRating ?? 0)) - (Number(getAverage(a) ?? a.tmdbRating ?? 0)));
  } else if (movieUiState.sort === 'year') {
    movies.sort((a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0));
  } else if (movieUiState.sort === 'title') {
    movies.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }

  return movies;
}

function renderMoviesListHtml(movies, group, user, filterState, lockedIds) {
  const q = (movieUiState.search || '').trim();
  const countLine = q
    ? `<div class="rmv-results-count">${movies.length} resultado${movies.length === 1 ? '' : 's'} para «${Utils.sanitize(q)}»</div>`
    : '';

  if (movies.length === 0) {
    return `
      ${countLine}
      <div class="rg-card rm-empty">
        <b>${q || filterState !== 'all' ? 'No hay películas en este filtro' : 'Aún no hay películas en la cartelera'}</b>
        <span>${q || filterState !== 'all' ? 'Prueba cambiando el filtro o buscando otro título, director o actor.' : 'Añade la primera película desde TMDb para armar el plan del grupo.'}</span>
      </div>`;
  }

  return `
    ${countLine}
    <div class="rmv-list">
      ${movies.map(movie => {
        const isLocked = lockedIds.has(movie.id);
        const myStatus = store.getUserMovieStatus(movie, user.id);
        const stMeta = statusBadgeMeta(myStatus);
        const avg = getAverage(movie);
        const tmdbNum = movie.tmdbRating ? Number(movie.tmdbRating).toFixed(1) : '';
        const metaParts = [movie.year, movie.duration, movie.genres || 'Cine'].filter(Boolean);
        const watchedLine = renderGroupWatchedLine(movie, group);
        const prio = Number(movie.priority || 0);
        const showPriority = !isLocked && myStatus === 'Por ver' && prio >= 4;

        return `
          <article class="rg-card rmv-card ${isLocked ? 'is-locked' : ''}">
            <img class="rmv-poster" src="${Utils.sanitize(movie.poster || 'assets/ruma_default_avatar.png')}" alt="${Utils.sanitize(movie.title)}" loading="lazy" ${isLocked ? 'data-locked-movie' : `data-open-ficha="${Utils.sanitize(movie.id)}"`}>
            <div class="rmv-body">
              <div class="rmv-top">
                <h3 class="rmv-title" ${isLocked ? 'data-locked-movie' : `data-open-ficha="${Utils.sanitize(movie.id)}"`}>${Utils.sanitize(movie.title)}</h3>
                <div class="rmv-actions-top">
                  ${isLocked ? `
                    <button type="button" class="rmv-status-pill is-locked" data-locked-movie>
                      <span>🔒</span><span>Plan Free</span>
                    </button>
                  ` : `
                    <button type="button" class="rmv-status-pill ${stMeta.cls}" data-pick-status="${Utils.sanitize(movie.id)}" title="Cambiar tu estado personal (Por ver / Vista / Favorita)">
                      <span>${stMeta.icon}</span>
                      <span>${stMeta.label}</span>
                    </button>
                  `}
                  <button type="button" class="rmv-more-btn" data-more-movie="${Utils.sanitize(movie.id)}" aria-label="Más opciones">⋯</button>
                </div>
              </div>

              <div class="rmv-meta">${Utils.sanitize(metaParts.join(' • '))}</div>

              <div class="rmv-badges-row">
                ${avg !== null ? `<span class="rmv-rating-pill rmv-rating-group" title="Promedio de reseñas del grupo">👥 <b>${avg.toFixed(1)}</b></span>` : ''}
                ${tmdbNum ? `<span class="rmv-rating-pill rmv-rating-tmdb" title="Calificación en TMDb">⭐ <b>${Utils.sanitize(tmdbNum)}</b><small>TMDb</small></span>` : (avg === null ? `<span class="rmv-rating-pill">⭐ <b>—</b></span>` : '')}
                ${showPriority ? `<span class="rmv-priority-pill" title="Prioridad de visionado">${prio >= 5 ? '🔥 Urgente' : '⚡ Alta'}</span>` : ''}
              </div>

              ${isLocked ? `<div class="rmv-watched-some" style="color:var(--error);">🔒 Excede el límite de 5 películas del Plan Free</div>` : watchedLine}

              <div class="rmv-bottom">
                ${renderCompactProviders(movie)}
                <button type="button" class="rmv-ficha-btn ${isLocked ? 'is-locked' : ''}" ${isLocked ? 'data-locked-movie' : `data-open-ficha="${Utils.sanitize(movie.id)}"`}>
                  ${isLocked ? '🔒 Bloqueada' : `${svg(ICO.clapper, 15)}<span>Ver ficha</span>`}
                </button>
              </div>
            </div>
          </article>`;
      }).join('')}
    </div>`;
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
  const lockedIds = Entitlements.getLockedMediaIds(group, 'movies');

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

  // Candidatas para la ruleta (excluye películas bloqueadas en Plan Free)
  const unlockedMovies = allMovies.filter(m => !lockedIds.has(m.id));
  const myPendingUnlocked = unlockedMovies.filter(m => store.getUserMovieStatus(m, user.id) === 'Por ver');
  const members = group.members || [];
  const unseenByAllUnlocked = unlockedMovies.filter(m =>
    members.every(mem => store.getUserMovieStatus(m, mem.id) === 'Por ver')
  );
  const canSpinRoulette = myPendingUnlocked.length > 0 || unseenByAllUnlocked.length > 0;

  const movies = filterAndSortMovies(allMovies, filterState, user);

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

      <!-- 4 Tarjetas de Métricas clicables como filtro rápido -->
      <section class="rmv-stats">
        <button type="button" class="rmv-stat-card ${filterState === 'all' ? 'active' : ''}" data-mv-filter="all">
          <span class="rmv-stat-ico">${svg(ICO.film, 20)}</span>
          <b>${totalCount}</b>
          <small>En cartelera</small>
        </button>
        <button type="button" class="rmv-stat-card ${filterState === 'Por ver' ? 'active' : ''}" data-mv-filter="Por ver">
          <span class="rmv-stat-ico">🌱</span>
          <b>${pendingCount}</b>
          <small>Por ver</small>
        </button>
        <button type="button" class="rmv-stat-card ${filterState === 'Vista' ? 'active' : ''}" data-mv-filter="Vista">
          <span class="rmv-stat-ico">🍿</span>
          <b>${watchedCount}</b>
          <small>Vistas</small>
        </button>
        <button type="button" class="rmv-stat-card ${filterState === 'Favorita' ? 'active' : ''}" data-mv-filter="Favorita">
          <span class="rmv-stat-ico">❤️</span>
          <b>${favCount}</b>
          <small>Favoritas</small>
        </button>
      </section>

      <!-- Chips de Filtro -->
      <div class="rmv-chips" role="tablist">
        ${chips.map(c => `
          <button type="button" class="rmv-chip ${filterState === c.id ? 'active' : ''}" data-mv-filter="${c.id}">
            ${c.label}
          </button>
        `).join('')}
      </div>

      <!-- Barra de Búsqueda + Ruleta visible + Orden -->
      <div class="rmv-search-row">
        <div class="rmv-search-box">
          ${svg(ICO.search, 18)}
          <input type="text" id="rmv-search-inp" placeholder="Buscar por título, actor, director o género..." value="${Utils.sanitize(movieUiState.search)}">
          <button type="button" class="rmv-search-clear ${movieUiState.search ? '' : 'hidden'}" id="rmv-search-clear" aria-label="Limpiar búsqueda">✕</button>
        </div>
        ${canSpinRoulette ? `
          <button type="button" class="rmv-roulette-quick" id="rmv-roulette-quick" title="Ruleta: elegir película al azar" aria-label="Ruleta de películas">🎲</button>
        ` : ''}
        <button type="button" class="rmv-sort-btn ${movieUiState.sort !== 'recent' ? 'active' : ''}" id="rmv-sort-btn" aria-label="Ordenar películas" title="Ordenar películas">
          ${svg(ICO.sliders, 18)}
        </button>
      </div>

      <!-- Botón + Añadir Película (TMDb) -->
      <button type="button" class="rm-add-cta" id="rmv-add-movie">
        <span class="rm-plus">+</span>
        ${svg(ICO.clapper, 22)}
        <span>Añadir Película (TMDb)</span>
      </button>

      <!-- Lista de Películas (actualizable sin parpadeo al buscar) -->
      <div id="rmv-results-zone">
        ${renderMoviesListHtml(movies, group, user, filterState, lockedIds)}
      </div>
    </div>
  `;

  function spinRoulette(candidates) {
    if (!candidates.length) {
      UI.showToast('No hay películas disponibles para la ruleta.', 'info');
      return;
    }
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    fireConfetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } });
    UI.showToast(`🎲 ¡La ruleta eligió "${picked.title}"! 🍿`, 'success');
    openMovieDetailModal(group, picked, user);
  }

  function openRouletteChooser() {
    if (unseenByAllUnlocked.length > 0 && myPendingUnlocked.length > 0 && unseenByAllUnlocked.length !== myPendingUnlocked.length) {
      UI.openModal({
        title: '🎲 Ruleta de Películas',
        contentHtml: `
          <div style="display:flex;flex-direction:column;gap:.6rem;">
            <p style="font-size:.84rem;color:var(--text-secondary);margin:0;">Elige qué pool de películas quieres girar:</p>
            <button type="button" class="btn btn-primary" id="rmv-rl-mine">🌱 Por ver por mí (${myPendingUnlocked.length})</button>
            <button type="button" class="btn btn-secondary" id="rmv-rl-all">👥 Que nadie ha visto aún (${unseenByAllUnlocked.length})</button>
          </div>
        `,
        onMount: () => {
          document.getElementById('rmv-rl-mine')?.addEventListener('click', () => {
            UI.closeModal();
            spinRoulette(myPendingUnlocked);
          });
          document.getElementById('rmv-rl-all')?.addEventListener('click', () => {
            UI.closeModal();
            spinRoulette(unseenByAllUnlocked);
          });
        }
      });
      return;
    }
    spinRoulette(myPendingUnlocked.length > 0 ? myPendingUnlocked : unseenByAllUnlocked);
  }

  function bindCardEvents(rootEl) {
    if (!rootEl) return;

    // Botón de estado personal: cicla entre Por ver / Vista / Favorita
    rootEl.querySelectorAll('[data-pick-status]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const movieId = btn.getAttribute('data-pick-status');
        const movie = allMovies.find(m => m.id === movieId);
        if (!movie) return;
        const next = store.cycleMovieStatus(movieId);
        const label = next === 'Vista' ? 'Vista 🍿' : (next === 'Favorita' ? 'Favorita ❤️' : 'Por ver 🌱');
        UI.showToast(`Tu estado en "${movie.title}": ${label}`, 'info');
      });
    });

    // Abrir ficha completa
    rootEl.querySelectorAll('[data-open-ficha]').forEach(el => {
      el.addEventListener('click', () => {
        const movie = allMovies.find(m => m.id === el.getAttribute('data-open-ficha'));
        if (movie) openMovieDetailModal(group, movie, user);
      });
    });

    // Aviso de bloqueo Plan Free
    rootEl.querySelectorAll('[data-locked-movie]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        UI.showUpgradeModal('En el Plan Free el límite es de 5 películas por grupo. Las más recientes quedaron bloqueadas; activa ruma Plus para desbloquearlas.', () => store.upgradeGroupToPremium(group.id));
      });
    });

    // Menú "⋯"
    rootEl.querySelectorAll('[data-more-movie]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const movie = allMovies.find(m => m.id === btn.getAttribute('data-more-movie'));
        if (!movie) return;
        const isLocked = lockedIds.has(movie.id);
        const myStatus = store.getUserMovieStatus(movie, user.id);
        const canDelete = store.canDeleteMediaItem(group, movie, user);
        const proposerName = movie.proposedBy?.name || movie.addedBy || 'Miembro';

        // Si la película está bloqueada en Plan Free, respetar bloqueo (solo upgrade o eliminar para liberar cupo)
        if (isLocked) {
          UI.openModal({
            title: `🔒 ${movie.title}`,
            contentHtml: `
              <div style="display:flex;flex-direction:column;gap:.7rem;">
                <p style="font-size:.84rem;color:var(--text-secondary);margin:0;">
                  Esta película excede el límite de 5 películas del Plan Free. Activa ruma Plus para desbloquearla o libera espacio eliminando una película.
                </p>
                <button type="button" class="btn btn-primary" id="mv-m-unlock">✨ Ver ruma Plus</button>
                ${canDelete ? `
                  <button type="button" class="btn rmv-del-btn" id="mv-m-del">🗑️ Eliminar película</button>
                ` : `
                  <div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.35rem;border-radius:.6rem;background:var(--surface-secondary);">
                    🔒 Solo quien la añadió (${Utils.sanitize(proposerName)}) o el líder del grupo pueden eliminarla.
                  </div>
                `}
              </div>`,
            onMount: () => {
              document.getElementById('mv-m-unlock')?.addEventListener('click', () => {
                UI.closeModal();
                UI.showUpgradeModal('Activa ruma Plus para tener películas ilimitadas en tu grupo.', () => store.upgradeGroupToPremium(group.id));
              });
              let confirmDel = false;
              const delBtn = document.getElementById('mv-m-del');
              delBtn?.addEventListener('click', () => {
                if (!confirmDel) {
                  confirmDel = true;
                  delBtn.textContent = '⚠️ Toca de nuevo para confirmar eliminación';
                  delBtn.classList.add('is-confirm');
                  return;
                }
                const res = store.deleteMediaItem('movies', movie.id);
                UI.closeModal();
                UI.showToast(res.ok ? 'Película eliminada de la cartelera 🗑️' : res.error, res.ok ? 'info' : 'error');
              });
            }
          });
          return;
        }

        UI.openModal({
          title: movie.title,
          contentHtml: `
            <div style="display:flex;flex-direction:column;gap:.6rem;">
              <div style="font-size:.78rem;color:var(--text-muted);">Tu estado personal (no modifica el de los demás):</div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">
                ${[
                  ['Por ver', '🌱 Por ver'],
                  ['Vista', '🍿 Vista'],
                  ['Favorita', '❤️ Favorita']
                ].map(([st, lbl]) => `
                  <button type="button" class="btn ${myStatus === st ? 'btn-primary' : 'btn-secondary'} btn-sm" data-set-mv-st="${st}">${lbl}</button>
                `).join('')}
              </div>

              <button type="button" class="btn btn-secondary" id="mv-m-ficha">🎬 Ver ficha (sinopsis, reparto y plataformas)</button>
              <button type="button" class="btn btn-secondary" id="mv-m-rate">⭐ Calificar / Escribir reseña</button>
              <button type="button" class="btn btn-secondary" id="mv-m-comm">💬 Comentarios (${(movie.comments || []).length})</button>
              <button type="button" class="btn btn-secondary" id="mv-m-quote">↩ Citar en el chat</button>

              <div style="font-size:.75rem;color:var(--text-muted);padding-top:.2rem;">
                Añadida por <b>${Utils.sanitize(proposerName)}</b>
              </div>

              ${canDelete ? `
                <button type="button" class="btn rmv-del-btn" id="mv-m-del">
                  🗑️ Eliminar película
                </button>
              ` : `
                <div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.35rem;border-radius:.6rem;background:var(--surface-secondary);">
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

            let confirmDel = false;
            const delBtn = document.getElementById('mv-m-del');
            delBtn?.addEventListener('click', () => {
              if (!confirmDel) {
                confirmDel = true;
                delBtn.textContent = '⚠️ Confirmar: borrar película, reseñas y comentarios';
                delBtn.classList.add('is-confirm');
                return;
              }
              const res = store.deleteMediaItem('movies', movie.id);
              UI.closeModal();
              UI.showToast(res.ok ? 'Película eliminada de la cartelera 🗑️' : res.error, res.ok ? 'info' : 'error');
            });
          }
        });
      });
    });
  }

  const resultsZone = viewport.querySelector('#rmv-results-zone');
  bindCardEvents(resultsZone);

  // Eventos de chips y cajas de métricas clicables
  viewport.querySelectorAll('[data-mv-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextFilter = btn.getAttribute('data-mv-filter');
      if (nextFilter === filterState) return;
      setFilterState(nextFilter);
      rerender();
    });
  });

  // Búsqueda en vivo sin parpadeo (solo actualiza #rmv-results-zone)
  const searchInp = viewport.querySelector('#rmv-search-inp');
  const clearBtn = viewport.querySelector('#rmv-search-clear');
  const updateSearchResults = () => {
    if (clearBtn) clearBtn.classList.toggle('hidden', !movieUiState.search);
    if (!resultsZone) return;
    const filtered = filterAndSortMovies(allMovies, filterState, user);
    resultsZone.innerHTML = renderMoviesListHtml(filtered, group, user, filterState, lockedIds);
    bindCardEvents(resultsZone);
  };

  searchInp?.addEventListener('input', (e) => {
    movieUiState.search = e.target.value;
    updateSearchResults();
  });

  clearBtn?.addEventListener('click', () => {
    movieUiState.search = '';
    if (searchInp) {
      searchInp.value = '';
      searchInp.focus();
    }
    updateSearchResults();
  });

  // Botón visible de ruleta
  viewport.querySelector('#rmv-roulette-quick')?.addEventListener('click', openRouletteChooser);

  // Botón de orden y herramientas
  viewport.querySelector('#rmv-sort-btn')?.addEventListener('click', () => {
    const sorts = [
      ['recent', '🕒 Más recientes primero'],
      ['priority', '🔥 Prioridad de visionado'],
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
          ${canSpinRoulette ? `
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
          openRouletteChooser();
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

  // Hidratar datos, reparto y plataformas reales desde TMDb en segundo plano
  hydrateMediaFromTmdb(group, 'movies');
}
