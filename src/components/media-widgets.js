/**
 * ruma 🌟 — Widgets compartidos de Películas y Series
 *  - Plataformas reales de streaming (TMDb /watch/providers, datos de JustWatch)
 *  - Formulario de reseña intuitivo (estrellas 1-10, slider, etiquetas rápidas)
 *  - Lista de reseñas del grupo
 *  - Hidratación en segundo plano con datos reales de TMDb
 */

import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { MediaService } from '../services/media-api.js';
import { UI } from './ui.js';

const esc = v => Utils.sanitize(v);

export const COUNTRY_NAMES = {
  CO: 'Colombia', MX: 'México', ES: 'España', AR: 'Argentina', CL: 'Chile', PE: 'Perú', US: 'Estados Unidos'
};

// Búsqueda directa dentro de cada plataforma conocida (TMDb solo entrega un enlace por título)
const PROVIDER_SEARCH = [
  { match: /netflix/i, url: q => `https://www.netflix.com/search?q=${q}` },
  { match: /amazon|prime video/i, url: q => `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${q}` },
  { match: /disney/i, url: q => `https://www.disneyplus.com/search?q=${q}` },
  { match: /^max$|hbo/i, url: q => `https://play.max.com/search?q=${q}` },
  { match: /apple tv/i, url: q => `https://tv.apple.com/search?term=${q}` },
  { match: /crunchyroll/i, url: q => `https://www.crunchyroll.com/search?q=${q}` },
  { match: /paramount/i, url: q => `https://www.paramountplus.com/search/?q=${q}` },
  { match: /mubi/i, url: q => `https://mubi.com/search/films?query=${q}` },
  { match: /google play/i, url: q => `https://play.google.com/store/search?q=${q}&c=movies` },
  { match: /youtube/i, url: q => `https://www.youtube.com/results?search_query=${q}` },
  { match: /vix/i, url: q => `https://vix.com/es-es/search?q=${q}` },
  { match: /movistar/i, url: q => `https://ver.movistarplus.es/busqueda/?q=${q}` },
  { match: /claro/i, url: q => `https://www.clarovideo.com/colombia/search?q=${q}` }
];

export function providerLink(provider, wp, title) {
  const q = encodeURIComponent(title || '');
  const known = PROVIDER_SEARCH.find(p => p.match.test(provider.name || ''));
  if (known) return known.url(q);
  return (wp && wp.link) || `https://www.justwatch.com/co/buscar?q=${q}`;
}

const TYPE_STYLE = {
  'Suscripción': { icon: '✅', cls: 'wp-type-sub' },
  'Gratis': { icon: '🆓', cls: 'wp-type-free' },
  'Gratis con anuncios': { icon: '🆓', cls: 'wp-type-free' },
  'Alquiler': { icon: '💳', cls: 'wp-type-rent' },
  'Compra': { icon: '🛒', cls: 'wp-type-buy' },
  'Cadena original': { icon: '📡', cls: 'wp-type-net' }
};

/** Tira compacta de logos para las tarjetas. */
export function renderProvidersStrip(item) {
  const wp = item.watchProviders;
  if (!item.tmdbId && !wp) return '';
  if (!wp) {
    return `<div class="wp-strip wp-loading"><span class="wp-skeleton"></span><span class="wp-skeleton"></span><span style="font-size:0.72rem;color:var(--text-muted);">Buscando plataformas…</span></div>`;
  }
  const providers = wp.providers || [];
  if (providers.length === 0) {
    return `<div class="wp-strip"><span class="wp-none">🚫 Sin streaming en ${esc(COUNTRY_NAMES[wp.country] || 'tu región')} por ahora</span></div>`;
  }
  const main = providers.filter(p => p.type === 'Suscripción' || p.type.startsWith('Gratis') || p.type === 'Cadena original');
  const list = (main.length ? main : providers).slice(0, 5);
  const extra = providers.length - list.length;
  return `
    <div class="wp-strip" title="Dónde ver (datos reales de JustWatch vía TMDb)">
      <span class="wp-strip-label">${main.length ? '📺 Ver en' : '💳 Alquiler/compra'}</span>
      ${list.map(p => `
        <a class="wp-logo" href="${esc(providerLink(p, wp, item.title))}" target="_blank" rel="noopener" title="${esc(p.name)} · ${esc(p.types ? p.types.join(' / ') : p.type)}" data-stop>
          ${p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)}" loading="lazy">` : `<span>${esc((p.name || '?').slice(0, 2))}</span>`}
        </a>
      `).join('')}
      ${extra > 0 ? `<span class="wp-more">+${extra}</span>` : ''}
      ${wp.country ? `<span class="wp-country">${esc(wp.country)}</span>` : ''}
    </div>
  `;
}

/** Sección completa "Dónde ver" agrupada por tipo (detalle). */
export function renderProvidersSection(item) {
  const wp = item.watchProviders;
  const title = item.title || '';
  const q = encodeURIComponent(title);
  let body = '';

  if (!wp) {
    body = `<div class="wp-strip wp-loading"><span class="wp-skeleton"></span><span class="wp-skeleton"></span><span class="wp-skeleton"></span><span style="font-size:0.8rem;color:var(--text-muted);">Consultando plataformas reales…</span></div>`;
  } else if (!wp.providers || wp.providers.length === 0) {
    body = `
      <div class="wp-none" style="display:block;padding:0.7rem 0.9rem;">
        🚫 No hay plataformas de streaming registradas para "${esc(title)}" en ${esc(COUNTRY_NAMES[wp.country] || 'tu región')} en este momento.
      </div>
      <a class="btn btn-secondary btn-sm" style="margin-top:0.6rem;" href="https://www.justwatch.com/co/buscar?q=${q}" target="_blank" rel="noopener">🔎 Buscar en JustWatch</a>
    `;
  } else {
    const groups = {};
    wp.providers.forEach(p => {
      (p.types || [p.type]).forEach(t => {
        groups[t] = groups[t] || [];
        groups[t].push(p);
      });
    });
    const order = ['Suscripción', 'Gratis', 'Gratis con anuncios', 'Cadena original', 'Alquiler', 'Compra'];
    body = order.filter(t => groups[t]).map(t => `
      <div class="wp-group">
        <div class="wp-group-title ${TYPE_STYLE[t]?.cls || ''}">${TYPE_STYLE[t]?.icon || '📺'} ${esc(t)}</div>
        <div class="wp-group-list">
          ${groups[t].map(p => `
            <a class="wp-provider" href="${esc(providerLink(p, wp, title))}" target="_blank" rel="noopener">
              ${p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)}" loading="lazy">` : ''}
              <span>${esc(p.name)}</span>
              <span class="wp-go">↗</span>
            </a>
          `).join('')}
        </div>
      </div>
    `).join('');

    if (wp.networks && wp.networks.length && !groups['Cadena original']) {
      body += `
        <div class="wp-group">
          <div class="wp-group-title wp-type-net">📡 Producida / emitida por</div>
          <div class="wp-group-list">
            ${wp.networks.map(n => `
              <span class="wp-provider wp-provider-static">
                ${n.logo ? `<img src="${esc(n.logo)}" alt="${esc(n.name)}" loading="lazy" style="background:#fff;object-fit:contain;padding:2px;">` : ''}
                <span>${esc(n.name)}</span>
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="wp-section">
      <div class="wp-section-head">
        <strong>📺 ¿Dónde ver "${esc(title)}"?</strong>
        <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
          ${wp?.country ? `<span class="badge badge-free">📍 ${esc(COUNTRY_NAMES[wp.country] || wp.country)}</span>` : ''}
          ${wp?.link ? `<a class="badge badge-admin" href="${esc(wp.link)}" target="_blank" rel="noopener" style="text-decoration:none;">Ver todas las opciones ↗</a>` : ''}
        </div>
      </div>
      ${body}
      <div class="wp-attribution">Disponibilidad real proporcionada por JustWatch a través de TMDb${wp?.updatedAt ? ` · actualizado ${esc(new Date(wp.updatedAt).toLocaleDateString('es-ES'))}` : ''}.</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// RESEÑAS
// ---------------------------------------------------------------------------
export function scoreLabel(score) {
  const s = Number(score) || 0;
  if (s >= 9.5) return 'Obra maestra 🏆';
  if (s >= 9) return 'Increíble 🔥';
  if (s >= 8) return 'Muy buena 🍿';
  if (s >= 7) return 'Entretenida 👍';
  if (s >= 6) return 'Pasable 🙂';
  if (s >= 5) return 'Regular 😐';
  if (s >= 3) return 'Floja 👎';
  return 'No la recomiendo 💤';
}

function scoreColor(score) {
  const s = Number(score) || 0;
  if (s >= 8.5) return '#34d399';
  if (s >= 7) return '#facc15';
  if (s >= 5) return '#fb923c';
  return '#f87171';
}

const TAGS = {
  movies: ['🔥 Trama brutal', '😭 Me hizo llorar', '😂 Muy divertida', '🤯 Final inesperado', '🎵 Gran banda sonora', '🎨 Visualmente hermosa', '🎭 Actuaciones top', '🍿 Para repetir', '💞 Ideal para ver juntos', '😴 Lenta'],
  series: ['🔥 Enganchadora', '🤯 Giros brutales', '😭 Me destrozó', '😂 Muy divertida', '🎨 Arte increíble', '🎵 Gran soundtrack', '🎭 Personajes top', '📉 Bajó de nivel', '🍿 Para maratonear', '💞 Ideal para ver juntos']
};

export function getAverage(item) {
  const entries = Object.values(item.ratings || {});
  if (!entries.length) return null;
  return entries.reduce((a, r) => a + Number(r.score || 0), 0) / entries.length;
}

/** HTML del formulario intuitivo de reseña. `prefix` evita colisiones de IDs. */
export function reviewFormHtml(category, item, user, prefix = 'rv') {
  const existing = (item.ratings && item.ratings[user.id]) || null;
  const score = existing ? Number(existing.score) : 8;
  const tags = existing?.tags || [];
  const isSeries = category === 'series';
  const myProg = isSeries ? item.userProgress?.[user.id] : null;
  const completed = isSeries ? store.isSeriesCompletedByUser(item, user.id) : false;

  return `
    <div class="rv-form" data-rv-root="${prefix}" data-rv-score="${score}">
      <div class="rv-head">
        <div class="rv-score-big" data-rv-big style="color:${scoreColor(score)};">${score.toFixed(1)}</div>
        <div>
          <div class="rv-score-label" data-rv-label>${esc(scoreLabel(score))}</div>
          <div class="rv-hint">Toca una estrella (vuelve a tocarla para media nota) o desliza la barra</div>
        </div>
      </div>

      <div class="rv-stars" role="radiogroup" aria-label="Calificación del 1 al 10">
        ${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `
          <button type="button" class="rv-star" data-rv-star="${n}" aria-label="${n} de 10">
            <span class="rv-star-glyph">★<span class="rv-star-fill" style="width:${Math.max(0, Math.min(1, score - (n - 1))) * 100}%;">★</span></span>
            <small>${n}</small>
          </button>
        `).join('')}
      </div>

      <input type="range" class="rv-range" data-rv-range min="0.5" max="10" step="0.5" value="${score}" aria-label="Nota">

      <div class="rv-tags">
        ${TAGS[isSeries ? 'series' : 'movies'].map(t => `
          <button type="button" class="ruma-chip rv-tag ${tags.includes(t) ? 'active' : ''}" data-rv-tag="${esc(t)}">${esc(t)}</button>
        `).join('')}
      </div>

      <textarea class="form-textarea" data-rv-text rows="3" maxlength="600" placeholder="${isSeries ? '¿Qué te está pareciendo la serie? Sin spoilers 🙊' : '¿Qué te pareció? Cuéntale al grupo en pocas palabras…'}">${esc(existing?.review || '')}</textarea>

      ${isSeries ? `
        <div class="rv-progress-note">
          ${completed ? '🏆 Completaste la serie: tu reseña llevará la insignia de <strong>serie completada</strong>.'
            : (myProg?.lastWatched ? `📍 Tu reseña mostrará que ibas en <strong>T${myProg.lastWatched.season} · Cap ${myProg.lastWatched.episode}</strong>.` : '📍 Puedes reseñar aunque no hayas empezado; se mostrará tu progreso.')}
        </div>
      ` : ''}

      <div class="rv-actions">
        ${existing ? `<button type="button" class="btn btn-secondary btn-sm" data-rv-delete>🗑️ Borrar mi reseña</button>` : '<span></span>'}
        <button type="button" class="btn btn-primary" data-rv-save>${existing ? '💾 Actualizar reseña' : '✍️ Publicar reseña'}</button>
      </div>
    </div>
  `;
}

/** Conecta la interacción del formulario de reseña. */
export function bindReviewForm(rootEl, category, item, onSaved) {
  const root = rootEl?.matches?.('[data-rv-root]') ? rootEl : rootEl?.querySelector('[data-rv-root]');
  if (!root) return;
  let score = Number(root.getAttribute('data-rv-score')) || 8;
  const big = root.querySelector('[data-rv-big]');
  const label = root.querySelector('[data-rv-label]');
  const range = root.querySelector('[data-rv-range]');
  const stars = root.querySelectorAll('[data-rv-star]');

  const paint = () => {
    big.textContent = score.toFixed(1);
    big.style.color = scoreColor(score);
    label.textContent = scoreLabel(score);
    range.value = String(score);
    stars.forEach(st => {
      const n = Number(st.getAttribute('data-rv-star'));
      const fill = Math.max(0, Math.min(1, score - (n - 1)));
      st.querySelector('.rv-star-fill').style.width = `${fill * 100}%`;
    });
  };

  stars.forEach(st => {
    st.addEventListener('click', () => {
      const n = Number(st.getAttribute('data-rv-star'));
      score = score === n ? n - 0.5 : n;
      if (score < 0.5) score = 0.5;
      paint();
    });
  });
  range.addEventListener('input', () => { score = Number(range.value); paint(); });

  root.querySelectorAll('[data-rv-tag]').forEach(tag => {
    tag.addEventListener('click', () => tag.classList.toggle('active'));
  });

  root.querySelector('[data-rv-save]')?.addEventListener('click', () => {
    const review = root.querySelector('[data-rv-text]')?.value || '';
    const tags = Array.from(root.querySelectorAll('[data-rv-tag].active')).map(t => t.getAttribute('data-rv-tag'));
    const res = store.rateMovieOrSeries(category, item.id, score, review, tags);
    if (!res.ok) {
      UI.showToast(res.error || 'No se pudo guardar la reseña.', 'error');
      return;
    }
    UI.showToast(`⭐ ${score.toFixed(1)} · ${scoreLabel(score)} — ¡Reseña guardada!`, 'success');
    if (typeof onSaved === 'function') onSaved(res.rating);
  });

  root.querySelector('[data-rv-delete]')?.addEventListener('click', () => {
    store.deleteMyRating(category, item.id);
    UI.showToast('Tu reseña fue eliminada.', 'info');
    if (typeof onSaved === 'function') onSaved(null);
  });
}

/** Modal de reseña (1 clic desde la tarjeta). */
export function openReviewModal(category, item, user, onSaved) {
  UI.openModal({
    title: `✍️ Reseñar "${item.title}"`,
    size: 'md',
    contentHtml: `
      <div style="display:flex;gap:0.85rem;align-items:center;margin-bottom:0.9rem;">
        <img src="${esc(item.poster || 'assets/ruma_icon_512.png')}" alt="" style="width:54px;height:80px;border-radius:8px;object-fit:cover;">
        <div>
          <div style="font-weight:800;font-family:var(--font-display);">${esc(item.title)}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);">${esc(item.years || item.year || '')} · ${esc(item.genres || '')}</div>
        </div>
      </div>
      ${reviewFormHtml(category, item, user, 'rvmodal')}
    `,
    onMount: (modalEl) => {
      bindReviewForm(modalEl, category, item, (rating) => {
        UI.closeModal();
        if (typeof onSaved === 'function') onSaved(rating);
      });
    }
  });
}

/** Reseñas del grupo con avatar, nota, etiquetas y texto. */
export function renderGroupReviews(item, group, user, { compact = false, category = 'movies' } = {}) {
  const entries = Object.entries(item.ratings || {});
  const avg = getAverage(item);
  if (entries.length === 0) {
    return `
      <div class="rv-empty">
        <span>Nadie del grupo la ha reseñado aún. ¡Publica tu reseña arriba para ser el primero!</span>
        ${compact ? `<button type="button" class="btn btn-primary btn-sm" data-review-item="${esc(item.id)}" data-review-cat="${category}">✍️ Sé el primero</button>` : ''}
      </div>
    `;
  }
  const sorted = entries.sort(([a], [b]) => (a === user.id ? -1 : b === user.id ? 1 : 0));
  const shown = compact ? sorted.slice(0, 2) : sorted;
  return `
    <div class="rv-list">
      <div class="rv-list-head">
        <span class="rv-avg" style="background:${scoreColor(avg)}22;color:${scoreColor(avg)};">⭐ ${avg.toFixed(1)}</span>
        <span style="font-size:0.78rem;color:var(--text-secondary);">${esc(scoreLabel(avg))} · ${entries.length} reseña${entries.length === 1 ? '' : 's'} del grupo</span>
      </div>
      ${shown.map(([uid, r]) => {
        const member = (group.members || []).find(m => m.id === uid) || {};
        const name = member.name || r.userName || 'Miembro';
        const avatar = member.avatar || r.userAvatar || 'assets/ruma_icon_512.png';
        return `
          <div class="rv-item ${uid === user.id ? 'mine' : ''}">
            <img class="rv-avatar" src="${esc(avatar)}" alt="${esc(name)}">
            <div style="flex:1;min-width:0;">
              <div class="rv-item-head">
                <strong>${esc(name)}${uid === user.id ? ' (tú)' : ''}</strong>
                <span class="rv-pill" style="background:${scoreColor(r.score)};">${Number(r.score).toFixed(1)}</span>
                ${r.progressLabel ? `<span class="badge badge-admin" style="font-size:0.66rem;">${esc(r.progressLabel)}</span>` : ''}
              </div>
              ${r.tags && r.tags.length ? `<div class="rv-item-tags">${r.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
              ${r.review ? `<div class="rv-quote ${compact ? 'clamp' : ''}">“${esc(r.review)}”</div>` : ''}
            </div>
          </div>
        `;
      }).join('')}
      ${compact && sorted.length > shown.length ? `<div style="font-size:0.74rem;color:var(--text-muted);">+${sorted.length - shown.length} reseña(s) más en la ficha</div>` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// HIDRATACIÓN CON DATOS REALES DE TMDB (en segundo plano)
// ---------------------------------------------------------------------------
const inFlight = new Set();
const failedThisSession = new Set();
const PROVIDERS_TTL = 1000 * 60 * 60 * 24 * 3; // 3 días

function needsRefresh(item) {
  if (!item.tmdbId) return false;
  const key = `${item.id}`;
  if (inFlight.has(key) || failedThisSession.has(key)) return false;
  if (!item.watchProviders) return true;
  return Date.now() - (item.watchProviders.updatedAt || 0) > PROVIDERS_TTL;
}

export async function hydrateMediaFromTmdb(group, category) {
  if (!group) return;
  const items = (group[category] || []).filter(needsRefresh);
  if (!items.length) return;
  items.forEach(i => inFlight.add(i.id));

  const patches = [];
  await Promise.all(items.map(async item => {
    try {
      if (category === 'movies') {
        const d = await MediaService.getMovieDetails(item.tmdbId);
        if (!d) { failedThisSession.add(item.id); return; }
        patches.push({
          category, itemId: item.id, patch: {
            watchProviders: d.watchProviders,
            duration: item.duration || d.duration,
            runtimeMinutes: d.runtimeMinutes,
            genres: item.genres || d.genres,
            synopsis: item.synopsis || d.overview,
            tagline: d.tagline,
            backdrop: item.backdrop || d.backdrop,
            gallery: (item.gallery && item.gallery.length) ? item.gallery : d.gallery,
            trailerUrl: item.trailerUrl || d.trailerUrl,
            tmdbRating: d.voteAverage || item.tmdbRating
          }
        });
      } else {
        const d = await MediaService.getSeriesDetails(item.tmdbId);
        if (!d) { failedThisSession.add(item.id); return; }
        patches.push({ category, itemId: item.id, patch: seriesPatchFromDetails(item, d) });
      }
    } catch (err) {
      console.warn('hydrateMediaFromTmdb', err);
      failedThisSession.add(item.id);
    } finally {
      inFlight.delete(item.id);
    }
  }));

  store.applyMediaPatches(group.id, patches);
}

export function seriesPatchFromDetails(item, d) {
  return {
    watchProviders: d.watchProviders,
    platform: d.platform,
    years: d.years,
    year: item.year || d.year,
    genres: d.genres || item.genres,
    synopsis: item.synopsis || d.overview,
    backdrop: item.backdrop || d.backdrop,
    trailerUrl: d.trailerUrl || item.trailerUrl || '',
    seasons: d.seasons && d.seasons.length ? d.seasons : item.seasons,
    specials: d.specials || [],
    numberOfSeasons: d.numberOfSeasons,
    totalEpisodes: d.totalEpisodes,
    episodeRuntime: d.episodeRuntime,
    seriesStatus: d.status,
    inProduction: d.inProduction,
    nextEpisode: d.nextEpisode,
    lastEpisode: d.lastEpisode,
    tmdbRating: d.voteAverage || item.tmdbRating
  };
}
