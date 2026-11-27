/**
 * ruma 🌟 — Modales de Películas, TMDb, Música, Letras, Comentarios y Citas de Chat
 */
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { MediaService } from '../services/media-api.js';
import { MusicService } from '../services/music-service.js';
import { UI } from '../components/ui.js';
import {
  renderProvidersSection,
  renderGroupReviews,
  reviewFormHtml,
  bindReviewForm,
  getAverage
} from '../components/media-widgets.js';

export async function openMovieDetailModal(group, movie, user, onQuote = null) {
  const refresh = () => (store.getActiveGroup()?.movies || []).find(m => m.id === movie.id) || movie;
  const activeGroup = () => store.getActiveGroup() || group;

  // Datos reales de TMDb (evita re-pedir en cada apertura si ya fue hidratada, aunque no tenga tráiler)
  if (movie.tmdbId && !movie.detailsHydrated && (!movie.watchProviders || !movie.cast || !movie.synopsis)) {
    const details = await MediaService.getMovieDetails(movie.tmdbId);
    if (details) {
      store.applyMediaPatches(group.id, [{
        category: 'movies',
        itemId: movie.id,
        patch: {
          watchProviders: details.watchProviders,
          duration: movie.duration || details.duration,
          genres: movie.genres || details.genres,
          director: details.director || movie.director || '',
          cast: details.cast || movie.cast || '',
          synopsis: movie.synopsis || details.overview,
          tagline: details.tagline,
          backdrop: movie.backdrop || details.backdrop,
          gallery: (movie.gallery && movie.gallery.length) ? movie.gallery : (details.gallery || []),
          trailerUrl: movie.trailerUrl || details.trailerUrl || '',
          tmdbRating: details.voteAverage || movie.tmdbRating,
          detailsHydrated: true
        }
      }], true);
      movie = refresh();
    }
  }

  const grp = activeGroup();
  const trailerLink = movie.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + ' trailer oficial')}`;
  const myRating = movie.ratings?.[user.id];
  const myStatus = store.getUserMovieStatus(movie, user.id);
  const avg = getAverage(movie);
  const proposerName = movie.proposedBy?.name || movie.addedBy || 'Miembro';
  const priorityNum = Number(movie.priority || 0);
  const priorityLabel = priorityNum >= 5 ? '🔥 Urgente (5/5)' : priorityNum === 4 ? '⚡ Alta (4/5)' : priorityNum === 3 ? 'Media (3/5)' : '';

  const members = grp.members || [];
  const seenMembers = members.filter(m => {
    const st = store.getUserMovieStatus(movie, m.id);
    return st === 'Vista' || st === 'Favorita';
  });

  UI.openModal({
    title: `🎬 ${movie.title} (${movie.year || ''})`,
    size: 'lg',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:1.15rem;">
        <!-- Cabecera con Backdrop y Póster -->
        <div class="media-hero ${movie.backdrop ? 'has-backdrop' : ''}" style="${movie.backdrop ? `--hero-bg: url('${Utils.sanitize(movie.backdrop)}');` : ''}">
          <img src="${Utils.sanitize(movie.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:120px;height:180px;border-radius:var(--radius-md);object-fit:cover;flex-shrink:0;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
          <div style="flex:1;min-width:200px;display:flex;flex-direction:column;justify-content:space-between;gap:0.65rem;">
            <div>
              <div style="display:flex;gap:0.45rem;flex-wrap:wrap;margin-bottom:0.4rem;">
                ${movie.tmdbRating ? `<span class="badge badge-premium">⭐ TMDb ${Utils.sanitize(movie.tmdbRating)}</span>` : ''}
                ${avg !== null ? `<span class="badge badge-premium">👥 Grupo ${avg.toFixed(1)}</span>` : ''}
                ${movie.duration ? `<span class="badge badge-free">⏱ ${Utils.sanitize(movie.duration)}</span>` : ''}
                ${priorityLabel ? `<span class="badge badge-admin">${priorityLabel}</span>` : ''}
              </div>
              <h2 style="font-family:var(--font-display);font-size:1.4rem;">${Utils.sanitize(movie.title)}</h2>
              ${movie.tagline ? `<div style="font-size:0.82rem;font-style:italic;color:var(--text-muted);">“${Utils.sanitize(movie.tagline)}”</div>` : ''}
              <div style="font-size:0.82rem;color:var(--brand-lilac);margin-top:0.2rem;">${Utils.sanitize(movie.genres || 'Cine')} · Propuesta por <b>${Utils.sanitize(proposerName)}</b></div>
              <p style="font-size:0.86rem;color:var(--text-secondary);margin-top:0.55rem;line-height:1.5;">
                ${Utils.sanitize(movie.synopsis || 'Sin sinopsis disponible.')}
              </p>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <a href="${Utils.sanitize(Utils.safeUrl(trailerLink, '#'))}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm">▶ Ver Tráiler</a>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-jump-review">${myRating ? `✏️ Editar mi reseña (${Number(myRating.score).toFixed(1)})` : '✍️ Reseñar'}</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-comments-movie">💬 Comentarios (${(movie.comments || []).length})</button>
              <button type="button" class="btn btn-secondary btn-sm" id="btn-modal-quote-movie">↩ Citar en chat</button>
            </div>
          </div>
        </div>

        <!-- Tu estado personal directo en la ficha -->
        <div class="rmv-detail-status-box">
          <div class="rmv-detail-status-head">
            <span>Tu estado personal</span>
            <small>Solo cambia para ti</small>
          </div>
          <div class="rmv-detail-status-row">
            ${[
              ['Por ver', '🌱 Por ver'],
              ['Vista', '🍿 Vista'],
              ['Favorita', '❤️ Favorita']
            ].map(([st, lbl]) => `
              <button type="button" class="btn ${myStatus === st ? 'btn-primary' : 'btn-secondary'} btn-sm" data-detail-mv-st="${st}">${lbl}</button>
            `).join('')}
          </div>
          ${members.length > 0 ? `
            <div class="rmv-seen-row">
              <span class="rmv-seen-lbl">${seenMembers.length === 0 ? 'Nadie del grupo la ha visto aún' : seenMembers.length === members.length ? `✅ Todos la vieron (${seenMembers.length}/${members.length})` : `👁️ Vista por ${seenMembers.length} de ${members.length}:`}</span>
              ${seenMembers.length > 0 ? `
                <div class="rmv-seen-avatars">
                  ${seenMembers.map(m => `
                    <span class="rmv-seen-chip" title="${Utils.sanitize(m.name)} (${Utils.sanitize(store.getUserMovieStatus(movie, m.id))})">
                      <img src="${Utils.sanitize(m.avatar || 'assets/ruma_default_avatar.png')}" alt="${Utils.sanitize(m.name)}">
                      <span>${Utils.sanitize((m.name || '').split(' ')[0])}</span>
                    </span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <!-- Dirección y Reparto principal -->
        ${(movie.director || movie.cast) ? `
          <div class="rmv-credits-box">
            ${movie.director ? `<div><b>🎬 Dirección:</b> ${Utils.sanitize(movie.director)}</div>` : ''}
            ${movie.cast ? `<div><b>🎭 Reparto:</b> ${Utils.sanitize(movie.cast)}</div>` : ''}
          </div>
        ` : ''}

        <!-- Plataformas reales de streaming -->
        ${renderProvidersSection(movie)}

        <!-- Reseña intuitiva + reseñas del grupo -->
        <div class="rv-panel" id="movie-review-panel">
          <div class="rv-panel-col">
            <div class="rv-panel-title">${myRating ? '✏️ Tu reseña' : '✍️ Escribe tu reseña'}</div>
            ${reviewFormHtml('movies', movie, user, 'rvmovie')}
          </div>
          <div class="rv-panel-col">
            <div class="rv-panel-title">👥 Reseñas del grupo</div>
            ${renderGroupReviews(movie, grp, user, { compact: false, category: 'movies' })}
          </div>
        </div>

        <!-- Galería de Fotogramas Oficiales TMDb -->
        ${movie.gallery && movie.gallery.length > 0 ? `
          <div>
            <div style="font-size:0.84rem;font-weight:800;margin-bottom:0.5rem;color:var(--brand-lilac-soft);">🖼️ Fotogramas Oficiales</div>
            <div style="display:flex;gap:0.6rem;overflow-x:auto;padding-bottom:0.35rem;">
              ${movie.gallery.map(img => `
                <img src="${Utils.sanitize(img)}" alt="Fotograma" loading="lazy" style="height:105px;border-radius:var(--radius-sm);object-fit:cover;cursor:pointer;" data-movie-still="${Utils.sanitize(img)}">
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Recuerdos vinculados con esta Película (Buscador con miniatura de portada y fecha) -->
        ${(grp.memories || []).length > 0 ? `
          <div style="padding:0.85rem 1rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);">
            ${renderMemoryLinkerHtml(grp.memories || [], movie.linkedMemories || [], 'movie_detail')}
          </div>
        ` : ''}
      </div>
    `,
    onMount: (modalEl) => {
      bindMemoryLinkerEvents(modalEl, 'movie_detail', (selectedIds) => {
        store.updateMediaItem('movies', movie.id, { linkedMemories: selectedIds }, { silent: true });
      });
      modalEl.querySelectorAll('[data-detail-mv-st]').forEach(btn => {
        btn.addEventListener('click', () => {
          const st = btn.getAttribute('data-detail-mv-st');
          store.setUserMovieStatus(movie.id, st);
          UI.showToast(`Tu estado en "${movie.title}": ${st}`, 'info');
          openMovieDetailModal(activeGroup(), refresh(), user);
        });
      });
      bindReviewForm(modalEl.querySelector('#movie-review-panel'), 'movies', movie, () => {
        // Reabrir con los datos actualizados para ver la reseña publicada
        openMovieDetailModal(activeGroup(), refresh(), user);
      });
      modalEl.querySelector('[data-review-item]')?.addEventListener('click', () => {
        modalEl.querySelector('#movie-review-panel textarea')?.focus();
      });
      document.getElementById('btn-modal-jump-review')?.addEventListener('click', () => {
        const panel = modalEl.querySelector('#movie-review-panel');
        panel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        panel?.classList.add('rv-flash');
        setTimeout(() => panel?.classList.remove('rv-flash'), 1200);
      });
      document.getElementById('btn-modal-comments-movie')?.addEventListener('click', () => {
        UI.closeModal();
        openMediaCommentsModal('movies', movie);
      });
      document.getElementById('btn-modal-quote-movie')?.addEventListener('click', () => {
        UI.closeModal();
        const quote = {
          type: 'movie',
          itemId: movie.id,
          label: '🎬 Película',
          title: `${movie.title} (${movie.year || ''})`,
          subtitle: `Estado: ${store.getUserMovieStatus(movie, user.id)}`,
          thumb: movie.poster || 'assets/ruma_default_avatar.png'
        };
        if (typeof onQuote === 'function') onQuote(quote);
        store.navigate('group', { groupTab: 'chat' });
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
// BUSCADOR Y CONFIGURACIÓN DE PELÍCULAS / SERIES DESDE TMDB
// ============================================================================
export function openSearchTmdbModal(group, category) {
  const isMovies = category === 'movies';
  let debounceTimer = null;
  let searchSeq = 0;

  UI.openModal({
    title: isMovies ? '🎬 Buscar Película en TMDb' : '📺 Buscar Serie en TMDb',
    size: 'lg',
    onClose: () => {
      clearTimeout(debounceTimer);
    },
    contentHtml: `
      <div>
        <form id="tmdb-search-form" style="margin-bottom:0.75rem;">
          <div style="display:flex;gap:0.45rem;align-items:center;">
            <input type="search" id="tmdb-search-input" class="form-input" style="flex:1;min-width:0;" placeholder="Escribe el título de la ${isMovies ? 'película' : 'serie'}..." enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false">
            <button type="submit" class="btn btn-primary btn-sm" style="flex-shrink:0;padding:0.65rem 0.9rem;">Buscar</button>
          </div>
          <div style="font-size:0.74rem;color:var(--text-secondary);margin-top:0.3rem;">
            ⚡ Catálogo oficial de TMDb (importa sinopsis, temporadas, tráiler y plataformas).
          </div>
        </form>
        ${isMovies ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;margin-bottom:0.75rem;">
            <div>
              <label class="form-label" style="margin-bottom:0.2rem;">Estado inicial</label>
              <select id="tmdb-pick-status" class="form-select">
                <option value="Por ver">🌱 Por ver</option>
                <option value="Vista">🍿 Vista</option>
                <option value="Favorita">❤️ Favorita</option>
              </select>
            </div>
            <div>
              <label class="form-label" style="margin-bottom:0.2rem;">Prioridad</label>
              <select id="tmdb-pick-priority" class="form-select">
                <option value="5">★★★★★ (5/5 Urgente)</option>
                <option value="4">★★★★☆ (4/5 Alta)</option>
                <option value="3">★★★☆☆ (3/5 Media)</option>
              </select>
            </div>
          </div>
        ` : ''}
        <div id="tmdb-search-results" class="rmu-search-results">
          <div style="text-align:center;padding:1.35rem 0.75rem;color:var(--text-secondary);font-size:0.85rem;">
            Empieza a escribir para buscar títulos en TMDb...
          </div>
        </div>
      </div>
    `,
    onMount: () => {
      const form = document.getElementById('tmdb-search-form');
      const input = document.getElementById('tmdb-search-input');
      const resultsEl = document.getElementById('tmdb-search-results');

      const doSearch = async () => {
        const mySeq = ++searchSeq;
        const q = input?.value.trim();
        if (!q || !resultsEl) {
          if (resultsEl) resultsEl.innerHTML = `<div style="text-align:center;padding:1.35rem 0.75rem;color:var(--text-secondary);font-size:0.85rem;">Empieza a escribir para buscar títulos...</div>`;
          return;
        }

        resultsEl.innerHTML = `<div style="color:var(--brand-lilac);font-size:0.85rem;padding:0.75rem;">Consultando catálogo oficial de TMDb...</div>`;
        let results = [];
        try {
          results = isMovies ? await MediaService.searchMovies(q) : await MediaService.searchSeries(q);
        } catch (_) {
          results = [];
        }
        if (mySeq !== searchSeq || !document.body.contains(resultsEl)) return;

        if (results.length === 0) {
          const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
          resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;text-align:center;">${
            isOffline
              ? '📴 Sin conexión a internet. Verifica tu red e intenta de nuevo.'
              : 'Sin resultados para esa búsqueda.'
          }</div>`;
          return;
        }

        const existingIds = new Set(
          ((store.getActiveGroup() || group)?.[category] || [])
            .map(item => item.tmdbId ? String(item.tmdbId) : '')
            .filter(Boolean)
        );

        resultsEl.innerHTML = results.map((r, i) => {
          const alreadyAdded = r.tmdbId && existingIds.has(String(r.tmdbId));
          return `
          <div class="rtmdb-search-row ${alreadyAdded ? 'is-added' : ''}">
            <div class="rtmdb-search-main">
              <img class="rtmdb-search-poster" src="${Utils.sanitize(r.poster)}" alt="poster" loading="lazy">
              <div class="rtmdb-search-info">
                <div class="rtmdb-search-title">${Utils.sanitize(r.title)} (${Utils.sanitize(r.year || 'N/A')})</div>
                <div class="rtmdb-search-sub">${Utils.sanitize(r.genres || '')} · <span style="color:var(--brand-gold);">⭐ TMDb ${Utils.sanitize(r.voteAverage)}</span></div>
              </div>
            </div>
            <div class="rtmdb-search-actions">
              ${alreadyAdded
                ? `<span class="badge badge-free">✅ En cartelera</span>`
                : `<button type="button" class="btn btn-primary btn-sm" data-pick-tmdb="${i}">+ Añadir</button>`}
            </div>
          </div>`;
        }).join('');

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
              status: isMovies ? (document.getElementById('tmdb-pick-status')?.value || 'Por ver') : 'Por ver',
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
                  director: details.director || '',
                  cast: details.cast || '',
                  synopsis: details.overview || payload.synopsis,
                  gallery: details.gallery || [],
                  trailerUrl: details.trailerUrl || '',
                  tagline: details.tagline || '',
                  runtimeMinutes: details.runtimeMinutes,
                  watchProviders: details.watchProviders,
                  detailsHydrated: true
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
                  specials: details.specials || [],
                  watchProviders: details.watchProviders,
                  trailerUrl: details.trailerUrl || '',
                  episodeRuntime: details.episodeRuntime,
                  seriesStatus: details.status,
                  inProduction: details.inProduction,
                  nextEpisode: details.nextEpisode,
                  lastEpisode: details.lastEpisode,
                  seasonEpisodes: {},
                  userProgress: {}
                };
              }
            }

            const res = store.addMediaToActiveGroup(category, payload);
            UI.closeModal();
            if (!res.ok) {
              if (res.needsUpgrade) UI.showUpgradeModal(res.error, () => store.upgradeGroupToPremium(group.id));
              else UI.showToast(res.error, res.duplicate ? 'info' : 'error');
              return;
            }
            UI.showToast(`"${picked.title}" añadida con ficha oficial de TMDb ✨`, 'success');
          });
        });
      };

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        clearTimeout(debounceTimer);
        input?.blur();
        doSearch();
      });

      input?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(doSearch, 280);
      });

      resultsEl?.addEventListener('touchmove', () => {
        if (document.activeElement === input) input.blur();
      }, { passive: true });
    }
  });
}

export function openMediaCommentsModal(category, item) {
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
export function openLyricsModal(song) {
  if (!song) return;
  let fontSize = 0.9;
  let loadedText = '';

  UI.openModal({
    title: `🎤 ${song.title || 'Canción'} — ${song.artist || ''}`,
    contentHtml: `
      <div class="rmu-lyrics-wrap">
        <div class="rmu-lyrics-bar" id="lyrics-toolbar" style="display:none;">
          <div style="display:flex;gap:0.35rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="lyrics-font-down" title="Texto más pequeño">A−</button>
            <button type="button" class="btn btn-secondary btn-sm" id="lyrics-font-up" title="Texto más grande">A+</button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="lyrics-copy-btn">📋 Copiar letra</button>
        </div>
        <div id="lyrics-modal-box" style="padding:0.75rem 0.25rem;color:var(--primary);font-weight:600;">
          Buscando letra oficial...
        </div>
      </div>
    `,
    onMount: async () => {
      const box = document.getElementById('lyrics-modal-box');
      const bar = document.getElementById('lyrics-toolbar');
      const lyrics = await MediaService.fetchLyrics(song.artist, song.title);
      if (!box) return;
      if (lyrics) {
        loadedText = lyrics;
        if (bar) bar.style.display = 'flex';
        box.innerHTML = `<pre id="lyrics-pre" style="white-space:pre-wrap;font-family:var(--font-sans);font-size:${fontSize}rem;line-height:1.7;color:var(--text-primary);margin:0;">${Utils.sanitize(lyrics)}</pre>`;
        const pre = document.getElementById('lyrics-pre');
        document.getElementById('lyrics-font-down')?.addEventListener('click', () => {
          fontSize = Math.max(0.76, Number((fontSize - 0.08).toFixed(2)));
          if (pre) pre.style.fontSize = `${fontSize}rem`;
        });
        document.getElementById('lyrics-font-up')?.addEventListener('click', () => {
          fontSize = Math.min(1.22, Number((fontSize + 0.08).toFixed(2)));
          if (pre) pre.style.fontSize = `${fontSize}rem`;
        });
        document.getElementById('lyrics-copy-btn')?.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(loadedText);
            UI.showToast('Letra copiada al portapapeles 📋', 'success');
          } catch (_) {
            UI.showToast('No se pudo copiar automáticamente.', 'info');
          }
        });
      } else {
        box.innerHTML = `
          <div style="text-align:center;padding:1.1rem 0.5rem;">
            <p style="color:var(--text-secondary);margin-bottom:0.85rem;">No encontramos la letra en LRCLIB para este tema.</p>
            <a href="https://genius.com/search?q=${encodeURIComponent(`${song.title || ''} ${song.artist || ''}`)}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Buscar Letra en Genius ↗</a>
          </div>`;
      }
    }
  });
}

function renderMemoryLinkerHtml(memories = [], selectedIds = [], prefix = 'memlink', { collapsible = false, defaultOpen = true } = {}) {
  if (!Array.isArray(memories) || memories.length === 0) return '';
  const selectedSet = new Set(selectedIds || []);
  const countHtml = `<span style="font-size:0.74rem;color:var(--brand-lilac-soft);font-weight:700;" data-mem-linker-count>${selectedSet.size} vinculado${selectedSet.size === 1 ? '' : 's'}</span>`;
  const innerHtml = `
      <input type="search" class="form-input" data-mem-linker-search placeholder="🔍 Buscar recuerdo..." autocomplete="off" style="margin-bottom:0.45rem;font-size:0.8rem;padding:0.45rem 0.7rem;">
      <div data-mem-linker-list style="display:flex;flex-direction:column;gap:0.4rem;max-height:165px;overflow-y:auto;padding:0.4rem;background:var(--surface-secondary);border:1px solid var(--border);border-radius:var(--radius-sm);">
        ${memories.map(m => {
          const isChecked = selectedSet.has(m.id);
          const thumb = Utils.safeUrl(m.coverPreview || (m.photos && m.photos[0]) || 'assets/ruma_default_avatar.png', 'assets/ruma_default_avatar.png');
          const searchBlob = `${m.title || ''} ${m.date || ''} ${m.location || ''} ${m.subfolderName || ''}`.toLowerCase();
          return `
            <label data-mem-linker-row data-search-blob="${Utils.sanitize(searchBlob)}" style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.4rem 0.55rem;border-radius:var(--radius-xs);background:${isChecked ? 'rgba(168,85,247,0.16)' : 'var(--surface)'};border:1px solid ${isChecked ? 'var(--border-strong)' : 'var(--border)'};cursor:pointer;">
              <div style="display:flex;align-items:center;gap:0.55rem;min-width:0;flex:1;">
                <img src="${Utils.sanitize(thumb)}" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;">
                <div style="min-width:0;">
                  <div style="font-weight:700;font-size:0.82rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(m.title)}</div>
                  <div style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📅 ${Utils.sanitize(m.date || '')}${m.location ? ` · 📍 ${Utils.sanitize(m.location)}` : ''}</div>
                </div>
              </div>
              <input type="checkbox" data-mem-linker-cb value="${Utils.sanitize(m.id)}" ${isChecked ? 'checked' : ''} style="width:17px;height:17px;flex-shrink:0;accent-color:var(--brand-lilac);">
            </label>
          `;
        }).join('')}
      </div>
  `;
  if (collapsible) {
    return `
      <details class="ruma-collapsible-linker" data-mem-linker="${prefix}" ${defaultOpen ? 'open' : ''}>
        <summary class="ruma-collapsible-linker-sum"><span>🎴 Vincular con recuerdos (opcional)</span>${countHtml}</summary>
        ${innerHtml}
      </details>
    `;
  }
  return `
    <div class="form-group" style="margin:0;" data-mem-linker="${prefix}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.35rem;">
        <label class="form-label" style="margin:0;">🎴 Vincular con Recuerdos del Grupo</label>
        ${countHtml}
      </div>
      ${innerHtml}
    </div>
  `;
}


function bindMemoryLinkerEvents(rootEl, prefix = 'memlink', onChange = null) {
  const wrap = rootEl?.querySelector(`[data-mem-linker="${prefix}"]`);
  if (!wrap) return () => [];
  const searchInp = wrap.querySelector('[data-mem-linker-search]');
  const countEl = wrap.querySelector('[data-mem-linker-count]');
  const rows = Array.from(wrap.querySelectorAll('[data-mem-linker-row]'));
  const getSelectedIds = () =>
    Array.from(wrap.querySelectorAll('[data-mem-linker-cb]:checked')).map(cb => cb.value);

  const refreshStyles = () => {
    const selected = getSelectedIds();
    if (countEl) {
      countEl.textContent = `${selected.length} vinculado${selected.length === 1 ? '' : 's'}`;
    }
    rows.forEach(row => {
      const cb = row.querySelector('[data-mem-linker-cb]');
      const on = Boolean(cb?.checked);
      row.style.background = on ? 'rgba(168,85,247,0.16)' : 'var(--surface)';
      row.style.borderColor = on ? 'var(--border-strong)' : 'var(--border)';
    });
    if (typeof onChange === 'function') onChange(selected);
  };

  wrap.querySelectorAll('[data-mem-linker-cb]').forEach(cb => {
    cb.addEventListener('change', refreshStyles);
  });

  searchInp?.addEventListener('input', () => {
    const q = (searchInp.value || '').trim().toLowerCase();
    rows.forEach(row => {
      const blob = row.getAttribute('data-search-blob') || '';
      row.style.display = (!q || blob.includes(q)) ? 'flex' : 'none';
    });
  });

  return getSelectedIds;
}

export function openEditSongModal(group, song) {
  if (!group || !song) return;
  const memories = group.memories || [];

  UI.openModal({
    title: `✏️ Editar · ${song.title}`,
    contentHtml: `
      <form id="form-edit-song" style="display:flex;flex-direction:column;gap:0.9rem;">
        <div style="display:flex;align-items:center;gap:0.7rem;padding:0.55rem 0.7rem;border-radius:var(--radius-md);background:var(--surface-secondary);border:1px solid var(--border);">
          <img src="${Utils.sanitize(song.artwork || 'assets/ruma_icon_512.png')}" alt="" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;">
          <div style="min-width:0;">
            <div style="font-weight:800;font-size:0.92rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(song.title)}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(song.artist || '')}</div>
          </div>
        </div>

        <div class="form-group" style="margin:0;">
          <label class="form-label" for="edit-song-note">Dedicatoria o reseña para el grupo</label>
          <input type="text" id="edit-song-note" class="form-input" value="${Utils.sanitize(song.note || '')}" placeholder="Ej: La canción de nuestro viaje a la montaña 💫">
        </div>

        ${renderMemoryLinkerHtml(memories, song.linkedMemories || [], 'edit_song')}

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-edit-song" style="justify-content:center;">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm" style="justify-content:center;">Guardar cambios</button>
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const getCheckedMems = bindMemoryLinkerEvents(modalEl, 'edit_song');
      document.getElementById('btn-cancel-edit-song')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-edit-song')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const note = document.getElementById('edit-song-note')?.value.trim() || '';
        const checkedMems = getCheckedMems();
        store.updateMediaItem('songs', song.id, { note, linkedMemories: checkedMems });
        UI.closeModal();
        UI.showToast('Canción actualizada 🎵', 'success');
      });
    }
  });
}

export function openAddSongModal(group) {
  let debounceTimer = null;
  let searchSeq = 0;
  let selectedRating = 5;
  let unsubModalPreview = null;
  const memories = group.memories || [];
  const normKey = (t, a) => `${String(t || '').trim().toLowerCase()}__${String(a || '').trim().toLowerCase()}`;
  const existingKeys = new Set();
  const existingItunes = new Set();
  (group.songs || []).forEach(s => {
    if (s.itunesId) existingItunes.add(String(s.itunesId));
    existingKeys.add(normKey(s.title, s.artist));
  });

  UI.openModal({
    title: '🎵 Añadir Canción',
    size: 'lg',
    onClose: () => {
      clearTimeout(debounceTimer);
      if (unsubModalPreview) { unsubModalPreview(); unsubModalPreview = null; }
    },
    contentHtml: `
      <div>
        <form id="song-search-form" style="margin-bottom:0.75rem;">
          <div style="display:flex;gap:0.45rem;align-items:center;">
            <input type="search" id="song-search-inp" class="form-input" style="flex:1;min-width:0;" placeholder="Canción o artista..." enterkeyhint="search" autocomplete="off" autocorrect="off" spellcheck="false">
            <button type="submit" class="btn btn-primary btn-sm" style="flex-shrink:0;padding:0.65rem 0.9rem;">Buscar</button>
          </div>
          <div style="font-size:0.74rem;color:var(--text-secondary);margin-top:0.3rem;">
            ⚡ Búsqueda en vivo en iTunes con preview oficial de 30s.
          </div>
        </form>

        <div class="rmu-add-meta-grid">
          <div>
            <label class="form-label" for="song-note-inp">Dedicatoria (opcional)</label>
            <input type="text" id="song-note-inp" class="form-input" placeholder="Ej: La canción de nuestro viaje 💫">
          </div>
          <div>
            <label class="form-label">Tu calificación</label>
            <div class="rmu-pick-stars" id="song-rating-stars" role="radiogroup" aria-label="Calificación de 1 a 5 estrellas">
              ${[1, 2, 3, 4, 5].map(n => `<button type="button" class="rmu-pick-star active" data-pick-star="${n}" aria-label="${n} estrellas">★</button>`).join('')}
              <span id="song-rating-lbl">5.0</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom:0.75rem;">
          ${memories.length > 0 ? renderMemoryLinkerHtml(memories, [], 'add_song', { collapsible: true, defaultOpen: false }) : ''}
        </div>

        <div id="song-search-results" class="rmu-search-results">
          <div style="text-align:center;padding:1.35rem 0.75rem;color:var(--text-secondary);font-size:0.85rem;">
            Empieza a escribir para buscar en vivo...
          </div>
        </div>
      </div>
    `,
    onMount: (modalEl) => {
      const form = document.getElementById('song-search-form');
      const inp = document.getElementById('song-search-inp');
      const resultsEl = document.getElementById('song-search-results');
      const getAddSongCheckedMems = bindMemoryLinkerEvents(modalEl, 'add_song');
      let currentList = [];

      const paintStars = () => {
        modalEl.querySelectorAll('[data-pick-star]').forEach(b => {
          b.classList.toggle('active', Number(b.getAttribute('data-pick-star')) <= selectedRating);
        });
        const lbl = document.getElementById('song-rating-lbl');
        if (lbl) lbl.textContent = `${selectedRating}.0`;
      };
      modalEl.querySelectorAll('[data-pick-star]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedRating = Number(btn.getAttribute('data-pick-star')) || 5;
          paintStars();
        });
      });

      const syncModalPreviewBtns = (playerState) => {
        if (!resultsEl || !document.body.contains(resultsEl)) return;
        const activeId = playerState?.isPlaying ? playerState.trackId : null;
        resultsEl.querySelectorAll('[data-modal-preview]').forEach(btn => {
          const item = currentList[Number(btn.getAttribute('data-modal-preview'))];
          const isNow = Boolean(item && activeId && item.id === activeId);
          btn.textContent = isNow ? '⏸ Pausar' : '▶ 30s';
        });
      };
      unsubModalPreview = MusicService.subscribe(syncModalPreviewBtns);

      const executeSearch = async () => {
        const mySeq = ++searchSeq;
        const q = inp?.value.trim();
        if (!q || !resultsEl) {
          currentList = [];
          if (resultsEl) resultsEl.innerHTML = `<div style="text-align:center;padding:1.35rem 0.75rem;color:var(--text-secondary);font-size:0.85rem;">Empieza a escribir para buscar en vivo...</div>`;
          return;
        }

        resultsEl.innerHTML = `<div style="color:var(--primary);font-size:0.85rem;padding:0.75rem;">Buscando coincidencias en iTunes...</div>`;
        let list = [];
        try {
          list = await MusicService.searchSongs(q, 10);
        } catch (_) {
          list = [];
        }
        if (mySeq !== searchSeq || !document.body.contains(resultsEl)) return;
        currentList = list;

        if (list.length === 0) {
          const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
          resultsEl.innerHTML = `<div style="color:var(--text-muted);font-size:0.85rem;padding:1rem;text-align:center;">${
            isOffline
              ? '📴 Sin conexión a internet. Verifica tu red e intenta de nuevo.'
              : 'No encontramos canciones con esa búsqueda.'
          }</div>`;
          return;
        }

        const activeId = MusicService.getCurrentPlayingId();
        resultsEl.innerHTML = list.map((s, i) => {
          const alreadyIn = (s.itunesId && existingItunes.has(String(s.itunesId))) || existingKeys.has(normKey(s.title, s.artist));
          const isPlayingNow = activeId && activeId === s.id;
          return `
            <div class="rmu-search-row">
              <div class="rmu-search-main">
                <img class="rmu-search-art" src="${Utils.sanitize(s.artwork)}" alt="art" loading="lazy">
                <div class="rmu-search-info">
                  <div class="rmu-search-title">${Utils.sanitize(s.title)}</div>
                  <div class="rmu-search-sub">${Utils.sanitize(s.artist)}${s.album ? ` · ${Utils.sanitize(s.album)}` : ''}</div>
                </div>
              </div>
              <div class="rmu-search-actions">
                ${s.previewUrl ? `
                  <button type="button" class="btn btn-secondary btn-sm" data-modal-preview="${i}" title="Escuchar fragmento oficial de 30 segundos">
                    ${isPlayingNow ? '⏸ Pausar' : '▶ 30s'}
                  </button>
                ` : ''}
                ${alreadyIn
                  ? `<span class="badge badge-free rmu-search-added">✓ En playlist</span>`
                  : `<button type="button" class="btn btn-primary btn-sm" data-pick-song="${i}">+ Guardar</button>`}
              </div>
            </div>
          `;
        }).join('');

        resultsEl.querySelectorAll('[data-modal-preview]').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-modal-preview'));
            const item = list[idx];
            if (!item?.previewUrl) return;
            MusicService.toggleTrack(item);
          });
        });

        resultsEl.querySelectorAll('[data-pick-song]').forEach(btn => {
          btn.addEventListener('click', () => {
            const picked = list[Number(btn.getAttribute('data-pick-song'))];
            if (!picked) return;
            const note = document.getElementById('song-note-inp')?.value.trim() || '';
            const checkedMems = getAddSongCheckedMems();
            const currentUser = store.getCurrentUser();
            const { id: rawItunesId, ...songMeta } = picked;

            const res = store.addMediaToActiveGroup('songs', {
              ...songMeta,
              itunesId: picked.itunesId || rawItunesId || '',
              note,
              rating: selectedRating,
              ratingCount: 1,
              ratings: currentUser ? { [currentUser.id]: selectedRating } : {},
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

      form?.addEventListener('submit', (e) => {
        e.preventDefault();
        clearTimeout(debounceTimer);
        inp?.blur();
        executeSearch();
      });

      inp?.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(executeSearch, 280);
      });

      resultsEl?.addEventListener('touchmove', () => {
        if (document.activeElement === inp) inp.blur();
      }, { passive: true });
    }
  });
}


export function openPickGroupItemToQuoteModal(group, onPicked, onSelectQuote = null) {
  const lockedMovies = Entitlements.getLockedMediaIds(group, 'movies');
  const lockedSeries = Entitlements.getLockedMediaIds(group, 'series');
  const lockedSongs = Entitlements.getLockedMediaIds(group, 'songs');
  const lockedBooks = Entitlements.getLockedMediaIds(group, 'books');

  const items = [
    ...(group.movies || []).filter(m => !lockedMovies.has(m.id)).map(m => ({
      type: 'movie',
      cat: 'movies',
      itemId: m.id,
      label: '🎬 Película',
      title: m.title,
      subtitle: [m.year, m.director].filter(Boolean).join(' · ') || 'Película',
      thumb: m.poster || 'assets/ruma_icon_512.png'
    })),
    ...(group.series || []).filter(s => !lockedSeries.has(s.id)).map(s => ({
      type: 'series',
      cat: 'series',
      itemId: s.id,
      label: '📺 Serie',
      title: s.title,
      subtitle: [s.year, s.seasons?.length ? `${s.seasons.length} temp.` : ''].filter(Boolean).join(' · ') || 'Serie',
      thumb: s.poster || 'assets/ruma_icon_512.png'
    })),
    ...(group.songs || []).filter(s => !lockedSongs.has(s.id)).map(s => ({
      type: 'song',
      cat: 'songs',
      itemId: s.id,
      label: '🎵 Canción',
      title: s.title,
      subtitle: s.artist || 'Música',
      thumb: s.artwork || 'assets/ruma_icon_512.png'
    })),
    ...(group.books || []).filter(b => !lockedBooks.has(b.id)).map(b => ({
      type: 'book',
      cat: 'books',
      itemId: b.id,
      label: '📚 Libro',
      title: b.title,
      subtitle: b.author || 'Libro',
      thumb: b.poster || 'assets/ruma_icon_512.png'
    })),
    ...(group.memories || []).map(m => ({
      type: 'memory',
      cat: 'memories',
      itemId: m.id,
      label: '📸 Recuerdo',
      title: m.title,
      subtitle: m.subfolderName || m.date || 'Recuerdo',
      thumb: m.coverPreview || 'assets/ruma_icon_512.png'
    })),
    ...(group.activities || []).map(a => {
      const p = store.getActivityProgress(a);
      return {
        type: 'activity',
        cat: 'activities',
        itemId: a.id,
        label: `${a.icon || '🎯'} Actividad`,
        title: a.title,
        subtitle: p.total > 0 ? `${p.done}/${p.total} responsabilidades · ${p.pct}%` : (a.status || 'Planeando'),
        thumb: group.avatar || 'assets/ruma_home_axolotl.png'
      };
    })
  ];

  const categories = [
    { id: 'all', label: 'Todo', count: items.length },
    { id: 'movies', label: '🎬 Películas', count: items.filter(i => i.cat === 'movies').length },
    { id: 'series', label: '📺 Series', count: items.filter(i => i.cat === 'series').length },
    { id: 'songs', label: '🎵 Música', count: items.filter(i => i.cat === 'songs').length },
    { id: 'books', label: '📚 Libros', count: items.filter(i => i.cat === 'books').length },
    { id: 'memories', label: '📸 Recuerdos', count: items.filter(i => i.cat === 'memories').length },
    { id: 'activities', label: '🎯 Actividades', count: items.filter(i => i.cat === 'activities').length }
  ].filter(c => c.id === 'all' || c.count > 0);

  UI.openModal({
    title: '🔗 Enlazar contenido en el chat',
    contentHtml: items.length === 0 ? `
      <div class="rm-empty">
        <b>Aún no hay contenido para enlazar</b>
        <span>Agrega películas, series, música, libros, recuerdos o actividades al grupo para compartirlos aquí.</span>
      </div>
    ` : `
      <div class="rch-link-wrap">
        <div class="rch-link-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input type="search" id="rch-link-q" placeholder="Buscar película, canción, libro..." autocomplete="off">
        </div>

        <div class="rch-link-chips" id="rch-link-chips">
          ${categories.map((c, idx) => `
            <button type="button" class="rmv-chip ${idx === 0 ? 'active' : ''}" data-link-cat="${c.id}">
              ${c.label} <span style="opacity:.75;margin-left:.15rem;">${c.count}</span>
            </button>`).join('')}
        </div>

        <div class="rch-link-list" id="rch-link-list"></div>
      </div>
    `,
    onMount: (modalEl) => {
      if (items.length === 0) return;
      let activeCat = 'all';
      let query = '';

      const listEl = modalEl.querySelector('#rch-link-list');
      const searchInp = modalEl.querySelector('#rch-link-q');
      const chipsWrap = modalEl.querySelector('#rch-link-chips');

      const renderList = () => {
        if (!listEl) return;
        const q = query.trim().toLowerCase();
        const filtered = items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) => (activeCat === 'all' || it.cat === activeCat))
          .filter(({ it }) => !q || (it.title || '').toLowerCase().includes(q) || (it.subtitle || '').toLowerCase().includes(q) || (it.label || '').toLowerCase().includes(q));

        if (filtered.length === 0) {
          listEl.innerHTML = `<div class="rm-empty" style="padding:1.1rem .5rem;"><b>Sin resultados</b><span>No encontramos elementos que coincidan con "${Utils.sanitize(query)}".</span></div>`;
          return;
        }

        listEl.innerHTML = filtered.map(({ it, idx }) => `
          <button type="button" class="rch-link-row" data-select-quote="${idx}">
            <img src="${Utils.sanitize(it.thumb)}" alt="" class="rch-link-thumb" loading="lazy">
            <span class="rch-link-meta">
              <span class="rch-link-badge">${Utils.sanitize(it.label)}</span>
              <b class="rch-link-title">${Utils.sanitize(it.title)}</b>
              <small class="rch-link-sub">${Utils.sanitize(it.subtitle)}</small>
            </span>
            <span class="rch-link-go">Enlazar</span>
          </button>
        `).join('');

        listEl.querySelectorAll('[data-select-quote]').forEach(btn => {
          btn.addEventListener('click', () => {
            const picked = items[Number(btn.getAttribute('data-select-quote'))];
            if (typeof onSelectQuote === 'function') onSelectQuote(picked);
            UI.closeModal();
            if (typeof onPicked === 'function') onPicked();
          });
        });
      };

      chipsWrap?.querySelectorAll('[data-link-cat]').forEach(chip => {
        chip.addEventListener('click', () => {
          activeCat = chip.getAttribute('data-link-cat');
          chipsWrap.querySelectorAll('[data-link-cat]').forEach(c => c.classList.toggle('active', c === chip));
          renderList();
        });
      });

      searchInp?.addEventListener('input', (e) => {
        query = e.target.value;
        renderList();
      });

      renderList();
    }
  });
}

