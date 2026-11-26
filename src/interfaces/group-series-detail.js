/**
 * ruma 🌟 — Vista de Detalle y Maratón de Series
 */
import { fireConfetti } from '../core/confetti.js';
import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { MediaService } from '../services/media-api.js';
import { UI } from '../components/ui.js';
import {
  renderProvidersSection,
  renderGroupReviews,
  reviewFormHtml,
  bindReviewForm,
  seriesPatchFromDetails,
  getAverage
} from '../components/media-widgets.js';

let activeSeriesSeasonNum = 1;

export function resetSeriesDetailTabState(seasonNum = 1) {
  activeSeriesDetailTab = 'episodes';
  activeSeriesSeasonNum = seasonNum;
}

let seriesDetailRenderToken = 0;
let activeSeriesDetailTab = 'episodes'; // 'episodes' | 'group' | 'reviews' | 'forum'
let pendingSeriesScrollY = null;
const seriesRefreshedThisSession = new Set();
const seriesEpisodesMemCache = new Map();

function getSeriesHideSpoilers() {
  try { return localStorage.getItem('ruma_series_hide_spoilers_v1') === '1'; } catch (_) { return false; }
}
function setSeriesHideSpoilers(val) {
  try { localStorage.setItem('ruma_series_hide_spoilers_v1', val ? '1' : '0'); } catch (_) {}
}

function fmtAirDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(`${dateStr}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

function episodeCardHtml(series, ep, seasonNum, watchedMap, targetKey, hideSpoilers = false) {
  const epKey = `${seasonNum}_${ep.episodeNumber}`;
  const isWatched = Boolean(watchedMap[epKey]);
  const isTarget = targetKey === epKey;
  const epNumStr = String(ep.episodeNumber).padStart(2, '0');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = ep.airDate && ep.airDate > today;
  const membersWhoWatched = Object.values(series.userProgress || {}).filter(u => u.watchedEpisodes && u.watchedEpisodes[epKey]);
  const longOverview = (ep.overview || '').length > 190;
  const maskOverview = Boolean(hideSpoilers && !isWatched && ep.overview);

  return `
    <div class="ruma-episode-card ${isWatched ? 'watched' : ''} ${isTarget ? 'target' : ''} ${upcoming ? 'upcoming' : ''}">
      <div class="ep-card-row">
        <div class="ep-card-main">
          <div class="ep-card-media">
            <div class="ep-num-badge">${epNumStr}</div>
            <div class="ep-thumb">
              <img src="${Utils.sanitize(ep.still || series.backdrop || series.poster || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(ep.name)}" loading="lazy">
              <span class="ep-chip ep-num-mobile">#${epNumStr}</span>
              ${ep.duration ? `<span class="ep-chip" style="bottom:6px;right:6px;">⏱ ${Utils.sanitize(ep.duration)}</span>` : ''}
              ${isWatched ? `<span class="ep-chip" style="top:6px;right:6px;background:rgba(16,185,129,0.94);">✓ Visto</span>` : ''}
            </div>
          </div>

          <div class="ep-card-info">
            <div class="ep-title-row">
              <h4 class="ep-title">${Utils.sanitize(ep.name)}</h4>
              ${isTarget ? `<span class="badge badge-limit">▶ Siguiente</span>` : ''}
              ${upcoming ? `<span class="badge badge-admin">🗓️ Próximamente</span>` : ''}
            </div>
            <div class="ep-meta-row">
              <span>T${seasonNum} · E${ep.episodeNumber}</span>
              ${ep.airDate ? `<span>📅 ${Utils.sanitize(fmtAirDate(ep.airDate))}</span>` : ''}
              ${ep.voteAverage && Number(ep.voteAverage) > 0 ? `<span style="color:var(--brand-gold);font-weight:700;">⭐ ${Utils.sanitize(ep.voteAverage)}</span>` : ''}
            </div>
            ${maskOverview ? `
              <details class="ep-overview rsd-spoiler-box">
                <summary>🙈 Sinopsis oculta (sin spoilers) · <span>tocar para revelar</span></summary>
                <p>${Utils.sanitize(ep.overview)}</p>
              </details>
            ` : ep.overview ? (longOverview ? `
              <details class="ep-overview">
                <summary>${Utils.sanitize(ep.overview.slice(0, 175))}… <span>ver más</span></summary>
                <p>${Utils.sanitize(ep.overview)}</p>
              </details>
            ` : `<p class="ep-synopsis">${Utils.sanitize(ep.overview)}</p>`) : `
              <p class="ep-synopsis ep-synopsis-empty">Sin sinopsis en español todavía.</p>
            `}
          </div>
        </div>

        <div class="ep-card-actions">
          <button type="button" class="btn ${isWatched ? 'btn-primary' : 'btn-secondary'} btn-sm" data-toggle-ep="${seasonNum}_${ep.episodeNumber}">
            ${isWatched ? '✓ Visto' : 'Marcar Visto'}
          </button>
          <button type="button" class="btn btn-secondary btn-sm" data-upto-ep="${seasonNum}_${ep.episodeNumber}" title="Marca todos los capítulos anteriores y este como vistos">
            ⏭ Visto hasta aquí
          </button>
        </div>
      </div>

      ${membersWhoWatched.length > 0 ? `
        <div class="ep-watched-by">
          <span>🍿 Ya lo vieron:</span>
          ${membersWhoWatched.map(m => `<strong style="color:var(--primary);">${Utils.sanitize(m.userName)}</strong>`).join(', ')}
        </div>
      ` : ''}
    </div>
  `;
}

function placeholderEpisodes(series, seasonNum, count) {
  return Array.from({ length: count || 1 }, (_, i) => ({
    seasonNumber: seasonNum,
    episodeNumber: i + 1,
    name: `Capítulo ${i + 1}`,
    overview: '',
    duration: '',
    still: series.backdrop || series.poster || 'assets/ruma_icon_512.png'
  }));
}

function getCachedSeasonEpisodesSync(series, seasonNum) {
  const memKey = `${series.id}_${seasonNum}`;
  if (seriesEpisodesMemCache.has(memKey)) return seriesEpisodesMemCache.get(memKey);
  const cached = series.seasonEpisodes?.[seasonNum];
  if (cached && cached.length) {
    seriesEpisodesMemCache.set(memKey, cached);
    return cached;
  }
  return null;
}

async function loadSeasonEpisodes(series, seasonNum) {
  const syncCached = getCachedSeasonEpisodesSync(series, seasonNum);
  if (syncCached) return syncCached;
  const seasonObj = [...(series.seasons || []), ...(series.specials || [])].find(s => s.seasonNumber === seasonNum);
  if (series.tmdbId) {
    const real = await MediaService.getSeasonEpisodes(series.tmdbId, seasonNum);
    if (real && real.length) {
      seriesEpisodesMemCache.set(`${series.id}_${seasonNum}`, real);
      return real;
    }
  }
  const fallback = placeholderEpisodes(series, seasonNum, seasonObj?.episodeCount || 1);
  seriesEpisodesMemCache.set(`${series.id}_${seasonNum}`, fallback);
  return fallback;
}

function renderGroupMarathonHtml(series, group, user, seasons, totalEps) {
  const members = (group.members || []).map(m => {
    const up = series.userProgress?.[m.id] || {};
    const wMap = up.watchedEpisodes || {};
    const watched = Object.keys(wMap).filter(k => wMap[k] && !k.startsWith('0_')).length;
    const done = store.isSeriesCompletedByUser(series, m.id) || (totalEps > 0 && watched >= totalEps);
    const pct = totalEps > 0 ? Math.min(100, Math.round((watched / totalEps) * 100)) : (done ? 100 : 0);
    const last = up.lastWatched;
    let statusTxt = '🌱 Por ver';
    let cls = 'is-pending';
    if (done) {
      statusTxt = '🏆 Completada';
      cls = 'is-done';
    } else if (watched > 0) {
      statusTxt = last?.season ? `📺 T${last.season} · E${last.episode}` : `📺 ${watched} vistos`;
      cls = 'is-watching';
    }
    return {
      id: m.id,
      name: m.name || up.userName || 'Miembro',
      avatar: m.avatar || up.userAvatar || 'assets/ruma_default_avatar.png',
      watched,
      done,
      pct,
      statusTxt,
      cls,
      isMe: m.id === user.id
    };
  }).sort((a, b) => (b.done - a.done) || (b.watched - a.watched) || a.name.localeCompare(b.name));

  return `
    <div class="ruma-card rsd-group-card">
      <div class="rsd-group-head">
        <h3 style="font-family:var(--font-display);font-size:1.1rem;">👥 Maratón del grupo</h3>
        <span style="font-size:0.76rem;color:var(--text-muted);">${members.filter(m => m.watched > 0 || m.done).length}/${members.length} en marcha</span>
      </div>
      <div class="rsd-group-list">
        ${members.map(m => `
          <div class="rsd-member-row ${m.isMe ? 'is-me' : ''}">
            <img class="rsd-member-av" src="${Utils.sanitize(m.avatar)}" alt="${Utils.sanitize(m.name)}">
            <div class="rsd-member-info">
              <div class="rsd-member-top">
                <strong>${Utils.sanitize(m.name)}${m.isMe ? ' <span class="rsd-me-tag">Tú</span>' : ''}</strong>
                <span class="rsd-member-st ${m.cls}">${m.statusTxt}</span>
              </div>
              <div class="rsd-member-bar-row">
                <div class="ruma-progress-track"><div class="ruma-progress-fill" style="width:${m.pct}%;"></div></div>
                <span class="rsd-member-pct">${m.watched}/${totalEps} · ${m.pct}%</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export async function renderSeriesDetailView(viewport, group, series, user, onBack = null) {
  const token = ++seriesDetailRenderToken;
  const restoreScrollY = pendingSeriesScrollY;
  pendingSeriesScrollY = null;

  // Refrescar con TMDb: todas las temporadas reales, plataformas y estado (1 vez por sesión)
  if (series.tmdbId && !seriesRefreshedThisSession.has(series.id)) {
    seriesRefreshedThisSession.add(series.id);
    MediaService.getSeriesDetails(series.tmdbId).then(d => {
      if (d) store.applyMediaPatches(group.id, [{ category: 'series', itemId: series.id, patch: seriesPatchFromDetails(series, d) }]);
    });
  }

  const seasons = (series.seasons && series.seasons.length) ? series.seasons : [{ seasonNumber: 1, name: 'Temporada 1', episodeCount: series.totalEpisodes || 1 }];
  const specials = series.specials || [];
  const allTabs = [...seasons, ...specials];
  if (activeSeriesSeasonNum !== 'all' && !allTabs.some(s => s.seasonNumber === activeSeriesSeasonNum)) {
    activeSeriesSeasonNum = seasons[0].seasonNumber;
  }

  const totalEps = seasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0) || series.totalEpisodes || 1;
  const myProg = series.userProgress?.[user.id] || {};
  const watchedMap = myProg.watchedEpisodes || {};
  const watchedRegular = Object.keys(watchedMap).filter(k => watchedMap[k] && !k.startsWith('0_')).length;
  const overallPct = Math.min(100, Math.round((watchedRegular / totalEps) * 100));
  const isCompleted = store.isSeriesCompletedByUser(series, user.id);
  const myRating = series.ratings?.[user.id];
  const avg = getAverage(series);
  const comments = series.comments || [];
  const ratingsCount = Object.keys(series.ratings || {}).length;
  const hideSpoilers = getSeriesHideSpoilers();

  // Siguiente capítulo sugerido (recorriendo todas las temporadas)
  let targetKey = null;
  let targetSeasonNum = null;
  let targetEpNum = null;
  for (const s of seasons) {
    for (let e = 1; e <= (s.episodeCount || 0); e++) {
      if (!watchedMap[`${s.seasonNumber}_${e}`]) {
        targetKey = `${s.seasonNumber}_${e}`;
        targetSeasonNum = s.seasonNumber;
        targetEpNum = e;
        break;
      }
    }
    if (targetKey) break;
  }
  const cachedTargetSeason = targetSeasonNum ? getCachedSeasonEpisodesSync(series, targetSeasonNum) : null;
  const targetEpTitle = cachedTargetSeason?.find(ep => ep.episodeNumber === targetEpNum)?.name || '';

  const trailerLink = series.trailerUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(series.title + ' trailer oficial')}`;
  const statusMap = { 'Returning Series': '🟢 En emisión', 'Ended': '🏁 Finalizada', 'Canceled': '⛔ Cancelada', 'In Production': '🎬 En producción' };

  const detailTabs = [
    { id: 'episodes', label: `🎞️ Capítulos`, count: totalEps },
    { id: 'group', label: `👥 Grupo`, count: (group.members || []).length },
    { id: 'reviews', label: `⭐ Reseñas`, count: ratingsCount },
    { id: 'forum', label: `💬 Foro`, count: comments.length }
  ];

  viewport.innerHTML = `
    <div class="rsd-wrap" style="display:flex;flex-direction:column;gap:1rem;">
      <!-- Cabecera de la Serie -->
      <div class="ruma-card" style="display:flex;flex-direction:column;gap:0.9rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.6rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-back-series-list">← Volver a Series</button>
          <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
            <a href="${Utils.sanitize(Utils.safeUrl(trailerLink, '#'))}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">▶ Tráiler</a>
            <button type="button" class="btn btn-primary btn-sm" id="btn-detail-rate-series">
              ${myRating ? `✏️ ⭐ ${Number(myRating.score).toFixed(1)}` : '✍️ Reseñar'}
            </button>
          </div>
        </div>

        <div class="media-hero ${series.backdrop ? 'has-backdrop' : ''}" style="${series.backdrop ? `--hero-bg: url('${Utils.sanitize(series.backdrop)}');` : ''}">
          <img src="${Utils.sanitize(series.poster || 'assets/ruma_icon_512.png')}" alt="Poster" style="width:120px;height:176px;border-radius:var(--radius-md);object-fit:cover;flex-shrink:0;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
          <div style="flex:1;min-width:200px;display:flex;flex-direction:column;justify-content:space-between;gap:0.65rem;">
            <div>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;margin-bottom:0.35rem;">
                ${series.years || series.year ? `<span class="badge badge-free">${Utils.sanitize(series.years || series.year)}</span>` : ''}
                <span class="badge badge-free">${seasons.length} temp.</span>
                <span class="badge badge-free">${totalEps} caps</span>
                ${series.episodeRuntime ? `<span class="badge badge-free">⏱ ~${series.episodeRuntime}m</span>` : ''}
                ${series.seriesStatus ? `<span class="badge badge-admin">${Utils.sanitize(statusMap[series.seriesStatus] || series.seriesStatus)}</span>` : ''}
                ${series.tmdbRating ? `<span class="badge badge-premium">⭐ TMDb ${Utils.sanitize(series.tmdbRating)}</span>` : ''}
                ${avg !== null ? `<span class="badge badge-premium">👥 Grupo ${avg.toFixed(1)}</span>` : ''}
              </div>
              <h2 style="font-family:var(--font-display);font-size:1.45rem;">${Utils.sanitize(series.title)}</h2>
              <div style="font-size:0.8rem;color:var(--brand-lilac);margin-top:0.18rem;">${Utils.sanitize(series.genres || 'Drama, Serie')}</div>
              <p style="font-size:0.86rem;color:var(--text-secondary);margin-top:0.45rem;line-height:1.5;">
                ${Utils.sanitize(series.synopsis || series.overview || '')}
              </p>
              ${series.nextEpisode ? `
                <div class="badge badge-limit" style="margin-top:0.45rem;">
                  🗓️ Estreno: T${series.nextEpisode.season}·E${series.nextEpisode.episode} “${Utils.sanitize(series.nextEpisode.name || '')}” — ${Utils.sanitize(fmtAirDate(series.nextEpisode.airDate))}
                </div>
              ` : ''}
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:0.3rem;">
                <span>Tu avance: <strong>${watchedRegular} / ${totalEps}</strong> capítulos ${isCompleted ? '🏆' : ''}</span>
                <span style="color:var(--brand-lilac);font-weight:800;">${overallPct}%</span>
              </div>
              <div class="ruma-progress-track"><div class="ruma-progress-fill" style="width:${overallPct}%;"></div></div>
            </div>
          </div>
        </div>

        <!-- Tarjeta rápida de Siguiente Capítulo (1 toque) -->
        ${targetKey ? `
          <div class="rsd-next-card">
            <div class="rsd-next-info">
              <span class="rsd-next-kicker">▶ Siguiente por ver</span>
              <strong>T${targetSeasonNum} · E${targetEpNum}${targetEpTitle ? ` — ${Utils.sanitize(targetEpTitle)}` : ''}</strong>
            </div>
            <div class="rsd-next-actions">
              ${activeSeriesDetailTab !== 'episodes' || activeSeriesSeasonNum !== targetSeasonNum ? `
                <button type="button" class="btn btn-secondary btn-sm" id="btn-jump-next-ep">Ir a T${targetSeasonNum}</button>
              ` : ''}
              <button type="button" class="btn btn-primary btn-sm" id="btn-mark-next-ep">✓ Marcar visto</button>
            </div>
          </div>
        ` : `
          <div class="rsd-next-card is-done">
            <div class="rsd-next-info">
              <span class="rsd-next-kicker">🏆 Maratón completada</span>
              <strong>¡Ya viste todos los capítulos disponibles!</strong>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-done-review">
              ${myRating ? '✏️ Editar reseña' : '⭐ Dejar reseña'}
            </button>
          </div>
        `}
      </div>

      <!-- Pestañas internas mobile-first -->
      <div class="rsd-tabs" role="tablist">
        ${detailTabs.map(t => `
          <button type="button" class="rsd-tab ${activeSeriesDetailTab === t.id ? 'active' : ''}" data-rsd-tab="${t.id}" role="tab" aria-selected="${activeSeriesDetailTab === t.id}">
            <span>${t.label}</span>
            <small>${t.count}</small>
          </button>
        `).join('')}
      </div>

      ${activeSeriesDetailTab === 'episodes' ? `
        <!-- Temporadas y capítulos -->
        <div class="ruma-card" style="display:flex;flex-direction:column;gap:0.9rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem;">
            <h3 style="font-family:var(--font-display);font-size:1.1rem;">🎞️ Temporadas y capítulos</h3>
            <button type="button" class="rsd-spoiler-btn ${hideSpoilers ? 'active' : ''}" id="btn-toggle-spoilers" title="Oculta sinopsis de capítulos que todavía no has visto">
              ${hideSpoilers ? '🙈 Sin spoilers: ON' : '👁️ Sin spoilers: OFF'}
            </button>
          </div>

          <div class="ruma-season-tabs">
            ${seasons.map(s => {
              const w = Array.from({ length: s.episodeCount || 0 }, (_, i) => watchedMap[`${s.seasonNumber}_${i + 1}`]).filter(Boolean).length;
              const isSeasonDone = (s.episodeCount || 0) > 0 && w >= s.episodeCount;
              return `
                <button type="button" class="ruma-season-tab ${s.seasonNumber === activeSeriesSeasonNum ? 'active' : ''}" data-pick-season="${s.seasonNumber}">
                  <strong style="font-size:0.86rem;">${isSeasonDone ? '✓ ' : ''}${Utils.sanitize(s.name || `Temporada ${s.seasonNumber}`)}</strong>
                  <span style="font-size:0.72rem;opacity:0.85;">${w}/${s.episodeCount || 0} caps${s.airDate ? ` · ${s.airDate.slice(0, 4)}` : ''}</span>
                </button>
              `;
            }).join('')}
            ${specials.map(s => `
              <button type="button" class="ruma-season-tab ${activeSeriesSeasonNum === 0 ? 'active' : ''}" data-pick-season="0">
                <strong style="font-size:0.86rem;">✨ ${Utils.sanitize(s.name || 'Especiales')}</strong>
                <span style="font-size:0.72rem;opacity:0.85;">${s.episodeCount} extras</span>
              </button>
            `).join('')}
            ${seasons.length > 1 ? `
              <button type="button" class="ruma-season-tab ${activeSeriesSeasonNum === 'all' ? 'active' : ''}" data-pick-season="all">
                <strong style="font-size:0.86rem;">📚 Todas</strong>
                <span style="font-size:0.72rem;opacity:0.85;">${totalEps} capítulos</span>
              </button>
            ` : ''}
          </div>

          <div id="series-season-summary"></div>
          <div id="series-episodes-list" style="display:flex;flex-direction:column;gap:0.8rem;"></div>
        </div>
      ` : ''}

      ${activeSeriesDetailTab === 'group' ? `
        ${renderGroupMarathonHtml(series, group, user, seasons, totalEps)}
        ${renderProvidersSection(series)}
      ` : ''}

      ${activeSeriesDetailTab === 'reviews' ? `
        <div class="rv-panel" id="series-review-panel">
          <div class="rv-panel-col">
            <div class="rv-panel-title">${myRating ? '✏️ Tu reseña' : '✍️ Reseña la serie'}</div>
            ${reviewFormHtml('series', series, user, 'rvseries')}
          </div>
          <div class="rv-panel-col">
            <div class="rv-panel-title">👥 Reseñas del grupo</div>
            ${renderGroupReviews(series, group, user, { compact: false, category: 'series' })}
          </div>
        </div>
      ` : ''}

      ${activeSeriesDetailTab === 'forum' ? `
        <div class="ruma-card">
          <h3 style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:0.75rem;">
            💬 Foro del Maratón (${comments.length})
          </h3>
          <form id="form-series-comment" style="display:flex;gap:0.5rem;margin-bottom:1rem;">
            <input type="text" id="inp-series-comment" class="form-input" placeholder="Comenta sobre la temporada o capítulo (se etiquetará tu progreso)..." required>
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
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
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
      ` : ''}
    </div>
  `;

  // --- Eventos estáticos ---
  document.getElementById('btn-back-series-list')?.addEventListener('click', () => {
    if (typeof onBack === 'function') onBack();
  });

  document.getElementById('btn-detail-rate-series')?.addEventListener('click', () => {
    activeSeriesDetailTab = 'reviews';
    renderSeriesDetailView(viewport, store.getActiveGroup(), series, user, onBack);
  });

  document.getElementById('btn-done-review')?.addEventListener('click', () => {
    activeSeriesDetailTab = 'reviews';
    renderSeriesDetailView(viewport, store.getActiveGroup(), series, user, onBack);
  });

  document.getElementById('btn-jump-next-ep')?.addEventListener('click', () => {
    if (targetSeasonNum) {
      activeSeriesDetailTab = 'episodes';
      activeSeriesSeasonNum = targetSeasonNum;
      renderSeriesDetailView(viewport, store.getActiveGroup(), series, user, onBack);
    }
  });

  const markNextBtn = document.getElementById('btn-mark-next-ep');
  markNextBtn?.addEventListener('click', () => {
    if (markNextBtn.disabled || !targetSeasonNum || !targetEpNum) return;
    markNextBtn.disabled = true;
    pendingSeriesScrollY = window.scrollY;
    const res = store.markEpisodeWatched(series.id, targetSeasonNum, targetEpNum);
    if (res?.alreadyWatched) return;
    if (res?.isFullyCompleted && res.isWatched) {
      fireConfetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
      UI.showToast(`🏆 ¡Completaste toda la serie "${series.title}"! Tu reseña llevará la insignia ⭐`, 'success');
    } else {
      UI.showToast(`✓ Marcado T${targetSeasonNum}·E${targetEpNum}`, 'success');
    }
  });

  viewport.querySelectorAll('[data-rsd-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextTab = btn.getAttribute('data-rsd-tab');
      if (nextTab && nextTab !== activeSeriesDetailTab) {
        activeSeriesDetailTab = nextTab;
        renderSeriesDetailView(viewport, store.getActiveGroup(), series, user, onBack);
      }
    });
  });

  if (activeSeriesDetailTab === 'reviews') {
    bindReviewForm(document.getElementById('series-review-panel'), 'series', series);
    viewport.querySelector('#series-review-panel [data-review-item]')?.addEventListener('click', () => {
      viewport.querySelector('#series-review-panel textarea')?.focus();
    });
  }

  if (activeSeriesDetailTab === 'forum') {
    document.getElementById('form-series-comment')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = document.getElementById('inp-series-comment');
      if (inp?.value.trim()) {
        pendingSeriesScrollY = window.scrollY;
        store.addMediaComment('series', series.id, inp.value.trim());
      }
    });

    viewport.querySelectorAll('[data-series-react]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSeriesScrollY = window.scrollY;
        store.reactMediaComment('series', series.id, btn.getAttribute('data-series-react'), btn.getAttribute('data-emoji'));
      });
    });
  }

  if (activeSeriesDetailTab !== 'episodes') {
    if (restoreScrollY !== null) window.scrollTo({ top: restoreScrollY, behavior: 'instant' });
    return;
  }

  // --- Eventos de pestaña Capítulos ---
  document.getElementById('btn-toggle-spoilers')?.addEventListener('click', () => {
    pendingSeriesScrollY = window.scrollY;
    setSeriesHideSpoilers(!hideSpoilers);
    renderSeriesDetailView(viewport, store.getActiveGroup(), series, user, onBack);
  });

  viewport.querySelectorAll('[data-pick-season]').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-pick-season');
      activeSeriesSeasonNum = v === 'all' ? 'all' : parseInt(v, 10);
      renderSeriesDetailView(viewport, store.getActiveGroup(), series, user, onBack);
    });
  });

  const listEl = document.getElementById('series-episodes-list');
  const summaryEl = document.getElementById('series-season-summary');

  const paintEpisodes = (sections) => {
    if (token !== seriesDetailRenderToken || !document.body.contains(listEl)) return;

    if (activeSeriesSeasonNum !== 'all' && sections[0]) {
      const { season, episodes } = sections[0];
      const seasonNum = season?.seasonNumber ?? activeSeriesSeasonNum;
      const watchedThisSeason = episodes.filter(ep => watchedMap[`${seasonNum}_${ep.episodeNumber}`]).length;
      const allSeasonWatched = episodes.length > 0 && watchedThisSeason >= episodes.length;
      const seasonPct = Math.min(100, Math.round((watchedThisSeason / (episodes.length || 1)) * 100));
      const totalMinutes = episodes.reduce((a, ep) => a + (ep.runtimeMinutes || 0), 0);
      summaryEl.innerHTML = `
        <div class="rsd-season-bar">
          ${season?.overview ? `<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.55rem;line-height:1.45;">${Utils.sanitize(season.overview)}</p>` : ''}
          <div class="rsd-season-bar-top">
            <div>
              <strong>${Utils.sanitize(season?.name || `Temporada ${seasonNum}`)}: ${watchedThisSeason} / ${episodes.length} vistos</strong>
              <div style="font-size:0.76rem;color:var(--text-muted);margin-top:0.15rem;">
                ${totalMinutes ? `⏱ ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m en total · ` : ''}<span style="color:var(--primary);font-weight:800;">${seasonPct}%</span>
              </div>
            </div>
            <button type="button" class="btn ${allSeasonWatched ? 'btn-secondary' : 'btn-primary'} btn-sm" id="btn-toggle-season-all">
              ${allSeasonWatched ? '↺ Desmarcar temp.' : '✓ Marcar temp. completa'}
            </button>
          </div>
          <div class="ruma-progress-track"><div class="ruma-progress-fill" style="width:${seasonPct}%;"></div></div>
        </div>
      `;

      document.getElementById('btn-toggle-season-all')?.addEventListener('click', () => {
        pendingSeriesScrollY = window.scrollY;
        const res = store.toggleSeasonWatched(series.id, seasonNum, !allSeasonWatched, episodes.length);
        if (res?.isFullyCompleted && res.isWatched) {
          fireConfetti({ particleCount: 130, spread: 85, origin: { y: 0.6 } });
          UI.showToast(`🏆 ¡Completaste toda la serie "${series.title}"!`, 'success');
        } else {
          UI.showToast(
            allSeasonWatched
              ? `↺ Temporada ${seasonNum} desmarcada`
              : `✓ Temporada ${seasonNum} marcada completa`,
            'success'
          );
        }
      });
    } else {
      summaryEl.innerHTML = '';
    }

    listEl.innerHTML = sections.map(({ season, episodes }) => {
      const seasonNum = season?.seasonNumber ?? activeSeriesSeasonNum;
      return `
        ${activeSeriesSeasonNum === 'all' ? `
          <div class="ep-season-header">
            <strong>${Utils.sanitize(season?.name || `Temporada ${seasonNum}`)}</strong>
            <span>${episodes.length} capítulos${season?.airDate ? ` · ${season.airDate.slice(0, 4)}` : ''}</span>
          </div>
        ` : ''}
        ${episodes.map(ep => episodeCardHtml(series, ep, seasonNum, watchedMap, targetKey, hideSpoilers)).join('')}
      `;
    }).join('') || `<div style="color:var(--text-muted);font-size:0.85rem;">No hay capítulos disponibles para esta temporada.</div>`;

    listEl.querySelectorAll('[data-toggle-ep]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSeriesScrollY = window.scrollY;
        const [sNum, epNum] = btn.getAttribute('data-toggle-ep').split('_').map(Number);
        const res = store.toggleEpisodeWatched(series.id, sNum, epNum);
        if (res?.isFullyCompleted && res.isWatched) {
          fireConfetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
          UI.showToast(`🏆 ¡Completaste toda la serie "${series.title}"! Tu reseña llevará la insignia ⭐`, 'success');
        }
      });
    });

    listEl.querySelectorAll('[data-upto-ep]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingSeriesScrollY = window.scrollY;
        const [sNum, epNum] = btn.getAttribute('data-upto-ep').split('_').map(Number);
        const res = store.markEpisodesUpTo(series.id, sNum, epNum);
        if (res?.isFullyCompleted) {
          fireConfetti({ particleCount: 130, spread: 85, origin: { y: 0.6 } });
          UI.showToast(`🎉 ¡Maratón completada! Terminaste "${series.title}" ⭐`, 'success');
        } else {
          UI.showToast(`Avance actualizado hasta Temporada ${sNum} · Cap. ${epNum} 🍿`, 'success');
        }
      });
    });

    if (restoreScrollY !== null) {
      window.scrollTo({ top: restoreScrollY, behavior: 'instant' });
    }
  };

  // Pintado síncrono inmediato si la temporada ya está en caché (cero parpadeo ni pérdida de scroll)
  if (activeSeriesSeasonNum !== 'all') {
    const syncEps = getCachedSeasonEpisodesSync(series, activeSeriesSeasonNum);
    if (syncEps) {
      const s = allTabs.find(x => x.seasonNumber === activeSeriesSeasonNum);
      paintEpisodes([{ season: s, episodes: syncEps }]);
      return;
    }
  } else if (seasons.every(s => Boolean(getCachedSeasonEpisodesSync(series, s.seasonNumber)))) {
    paintEpisodes(seasons.map(s => ({ season: s, episodes: getCachedSeasonEpisodesSync(series, s.seasonNumber) })));
    return;
  }

  // Skeletons solo en la primera carga remota de una temporada no cacheada
  listEl.innerHTML = Array.from({ length: 3 }).map(() => `<div class="ruma-episode-card ep-skeleton"></div>`).join('');

  let sections = [];
  if (activeSeriesSeasonNum === 'all') {
    const all = series.tmdbId ? await MediaService.getAllSeasonsEpisodes(series.tmdbId, seasons) : {};
    for (const s of seasons) {
      let eps = (all[s.seasonNumber] && all[s.seasonNumber].length) ? all[s.seasonNumber] : null;
      if (eps) seriesEpisodesMemCache.set(`${series.id}_${s.seasonNumber}`, eps);
      else eps = await loadSeasonEpisodes(series, s.seasonNumber);
      sections.push({ season: s, episodes: eps });
    }
  } else {
    const s = allTabs.find(x => x.seasonNumber === activeSeriesSeasonNum);
    sections.push({ season: s, episodes: await loadSeasonEpisodes(series, activeSeriesSeasonNum) });
  }

  paintEpisodes(sections);
}
