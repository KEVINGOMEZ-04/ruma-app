// Vista modular de Series del Grupo (Banner, 3 métricas por usuario, Chips, Buscador + Orden, CTA TMDb, Tarjetas con progreso, +1 capítulo rápido y menú "⋯")
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { hydrateMediaFromTmdb, getAverage } from '../components/media-widgets.js';
import { fireConfetti } from '../core/confetti.js';

const svg = (inner, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  tv: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="m8 2 4 4 4-4"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="18" r="2" fill="var(--surface)"/>'
};

const seriesUiState = { search: '', sort: 'recent' };

function totalEpisodes(s) {
  return (s.seasons || []).reduce((a, x) => a + (x.episodeCount || 0), 0);
}

function watchedKeys(s, uid) {
  const map = s.userProgress?.[uid]?.watchedEpisodes || {};
  return Object.keys(map).filter(k => map[k] && !k.startsWith('0_'));
}

// Estado personal del usuario en la serie: 'Viendo' | 'Por ver' | 'Completada'
export function userSeriesStatus(s, uid) {
  const total = totalEpisodes(s);
  const up = s.userProgress?.[uid];
  const watched = watchedKeys(s, uid).length;
  if (up?.status === 'Completada') return 'Completada';
  if (total > 0 && watched >= total) return 'Completada';
  if (watched > 0) return 'Viendo';
  if (up?.status === 'Viendo' || up?.status === 'Por ver') return up.status;
  return 'Por ver';
}

function nextEpisodeForUser(s, uid) {
  const seasons = (s.seasons && s.seasons.length)
    ? s.seasons
    : (s.totalEpisodes ? [{ seasonNumber: 1, episodeCount: s.totalEpisodes }] : []);
  if (!seasons.length) return null;
  const map = s.userProgress?.[uid]?.watchedEpisodes || {};
  for (const season of seasons) {
    const count = season.episodeCount || 0;
    for (let ep = 1; ep <= count; ep++) {
      if (!map[`${season.seasonNumber}_${ep}`]) {
        return { season: season.seasonNumber, episode: ep };
      }
    }
  }
  return null;
}

function badgeMeta(st) {
  if (st === 'Completada') return { icon: '🏆', label: 'Completada', cls: 'ss-done' };
  if (st === 'Viendo') return { icon: '📺', label: 'Viendo', cls: 'ss-watching' };
  return { icon: '🌱', label: 'Por ver', cls: 'ss-pending' };
}

function progressInfo(s, uid, st) {
  const total = totalEpisodes(s);
  const keys = watchedKeys(s, uid);
  const last = s.userProgress?.[uid]?.lastWatched;
  if (st === 'Viendo' && last && last.season) {
    const seasonTotal = (s.seasons || []).find(x => x.seasonNumber === last.season)?.episodeCount || 0;
    const inSeason = keys.filter(k => k.startsWith(`${last.season}_`)).length;
    if (seasonTotal > 0) {
      return { label: `T${last.season}: ${inSeason} / ${seasonTotal}`, pct: Math.round((inSeason / seasonTotal) * 100) };
    }
  }
  const done = st === 'Completada' && total > 0 ? total : keys.length;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (st === 'Completada' ? 100 : 0);
  return { label: `${done} / ${total}`, pct };
}

export function renderGroupSeriesView(viewport, group, user, ctx) {
  const { getFilterState, setFilterState, openSearchTmdbModal, openSeriesDetail, openReviewModal, openMediaCommentsModal, onQuoteSeries, rerender } = ctx;

  const filterState = getFilterState();
  const all = group.series || [];
  const check = Entitlements.canAddMediaItem(group, 'series');

  const statusOf = new Map(all.map(s => [s.id, userSeriesStatus(s, user.id)]));
  const watchingCount = all.filter(s => statusOf.get(s.id) === 'Viendo').length;
  const completedCount = all.filter(s => statusOf.get(s.id) === 'Completada').length;

  let list = [...all];
  if (['Viendo', 'Por ver', 'Completada'].includes(filterState)) {
    list = list.filter(s => statusOf.get(s.id) === filterState);
  } else if (filterState === 'my-proposals') {
    list = list.filter(s => s.proposedBy?.id === user.id || s.addedBy === user.name);
  }

  const q = (seriesUiState.search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(s => [s.title, s.genres, s.synopsis, s.cast, s.years, s.year].some(v => String(v || '').toLowerCase().includes(q)));
  }

  const rate = s => Number(getAverage(s) ?? s.tmdbRating ?? 0);
  const stOrder = { Viendo: 0, 'Por ver': 1, Completada: 2 };
  if (seriesUiState.sort === 'watching') list.sort((a, b) => (stOrder[statusOf.get(a.id)] ?? 9) - (stOrder[statusOf.get(b.id)] ?? 9));
  else if (seriesUiState.sort === 'rating') list.sort((a, b) => rate(b) - rate(a));
  else if (seriesUiState.sort === 'year') list.sort((a, b) => (parseInt(b.year || b.years, 10) || 0) - (parseInt(a.year || a.years, 10) || 0));
  else if (seriesUiState.sort === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const chips = [
    { id: 'all', label: 'Todas' },
    { id: 'Viendo', label: '📺 Viendo' },
    { id: 'Por ver', label: '🌱 Por ver' },
    { id: 'Completada', label: '🏆 Completadas' },
    { id: 'my-proposals', label: '👤 Mis propuestas' }
  ];

  viewport.innerHTML = `
    <div class="rmv-wrap">
      <section class="rg-card rmv-banner">
        <div class="rm-banner-left">
          <div class="rm-banner-ico">${svg(ICO.tv, 26)}</div>
          <div class="rm-banner-txt">
            <h1>Series</h1>
            <p>Centro de maratones del grupo</p>
          </div>
        </div>
        <div class="rmv-banner-art" aria-hidden="true"><span class="rmv-pop">🎬</span><span class="rmv-reel">📺</span></div>
      </section>

      <section class="rms-stats">
        <div class="rmv-stat-card"><span class="rmv-stat-ico">${svg(ICO.film, 20)}</span><b>${all.length}</b><small>Series</small></div>
        <div class="rmv-stat-card"><span class="rmv-stat-ico">${svg(ICO.tv, 20)}</span><b>${watchingCount}</b><small>En curso</small></div>
        <div class="rmv-stat-card"><span class="rmv-stat-ico">🏆</span><b>${completedCount}</b><small>Completadas</small></div>
      </section>

      <div class="rmv-chips" role="tablist">
        ${chips.map(c => `<button type="button" class="rmv-chip ${filterState === c.id ? 'active' : ''}" data-sr-filter="${c.id}">${c.label}</button>`).join('')}
      </div>

      <div class="rmv-search-row">
        <div class="rmv-search-box">
          ${svg(ICO.search, 18)}
          <input type="text" id="rms-search-inp" placeholder="Buscar serie por título, actor o género..." value="${Utils.sanitize(seriesUiState.search)}">
        </div>
        <button type="button" class="rmv-sort-btn ${seriesUiState.sort !== 'recent' ? 'active' : ''}" id="rms-sort-btn" aria-label="Ordenar">${svg(ICO.sliders, 18)}</button>
      </div>

      <button type="button" class="rm-add-cta" id="rms-add">
        <span class="rm-plus">+</span>${svg(ICO.tv, 22)}<span>Añadir Serie (TMDb)</span>
      </button>

      ${list.length === 0 ? `
        <div class="rg-card rm-empty">
          <b>${q || filterState !== 'all' ? 'No hay series en este filtro' : 'Aún no hay series en el grupo'}</b>
          <span>${q || filterState !== 'all' ? 'Prueba cambiando el filtro o buscando otro título.' : 'Añade la primera serie desde TMDb para empezar una maratón grupal.'}</span>
        </div>
      ` : `
        <div class="rmv-list">
          ${(() => {
            const lockedIds = Entitlements.getLockedMediaIds(group, 'series');
            return list.map(s => {
            const isLocked = lockedIds.has(s.id);
            const st = statusOf.get(s.id);
            const bm = badgeMeta(st);
            const avg = getAverage(s);
            const ratingNum = avg !== null && avg !== undefined ? Number(avg).toFixed(1) : (s.tmdbRating ? Number(s.tmdbRating).toFixed(1) : '—');
            const seasonsN = (s.seasons || []).length;
            const meta = [s.years || s.year, seasonsN ? `${seasonsN} temp.` : '', totalEpisodes(s) ? `${totalEpisodes(s)} capítulos` : ''].filter(Boolean).join(' • ');
            const pr = progressInfo(s, user.id, st);
            const nextEp = !isLocked ? nextEpisodeForUser(s, user.id) : null;
            const activeMembers = (group.members || []).filter(m => {
              const mst = userSeriesStatus(s, m.id);
              return mst === 'Viendo' || mst === 'Completada';
            });
            const id = Utils.sanitize(s.id);
            return `
              <article class="rg-card rmv-card rms-card ${isLocked ? 'is-locked' : ''}">
                <img class="rmv-poster" src="${Utils.sanitize(s.poster || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(s.title)}" ${isLocked ? 'data-locked-series' : `data-sr-open="${id}"`}>
                <div class="rmv-body">
                  <div class="rmv-top">
                    <h3 class="rmv-title" ${isLocked ? 'data-locked-series' : `data-sr-open="${id}"`}>${Utils.sanitize(s.title)}</h3>
                    <button type="button" class="rmv-more-btn" data-sr-more="${id}" aria-label="Más opciones">⋯</button>
                  </div>
                  <div class="rmv-meta">${Utils.sanitize(meta || 'Serie')}</div>
                  <div class="rms-row">
                    <span class="rmv-rating-pill">⭐ <b>${Utils.sanitize(String(ratingNum))}</b></span>
                    ${isLocked
                      ? `<span class="rms-badge is-locked">🔒 Plan Free</span>`
                      : `<span class="rms-badge ${bm.cls}">${bm.icon} ${bm.label}</span>`}
                    ${!isLocked && activeMembers.length > 0 ? `<span class="rms-group-pill" title="Miembros viendo o que completaron">👥 ${activeMembers.length}</span>` : ''}
                  </div>
                  ${isLocked ? `
                    <div class="rmv-watched-some" style="color:var(--error);">🔒 Excede el límite de 5 series del Plan Free</div>
                  ` : `
                    <div class="rms-progress">
                      <span class="rms-prog-txt">${pr.label} (${pr.pct}%)</span>
                      <div class="rms-bar"><i style="width:${pr.pct}%"></i></div>
                    </div>
                  `}
                  <div class="rms-actions">
                    ${isLocked ? `
                      <button type="button" class="rms-btn is-locked" data-locked-series>🔒 Bloqueada · Activar ruma Plus</button>
                    ` : `
                      <button type="button" class="rms-btn rms-btn-main" data-sr-open="${id}">▶ Capítulos<span class="rms-mar"> &amp; Maratón</span></button>
                      ${nextEp ? `<button type="button" class="rms-btn rms-btn-next" data-sr-quick-ep="${id}" data-s="${nextEp.season}" data-e="${nextEp.episode}" title="Marcar T${nextEp.season}·E${nextEp.episode} como visto">✓ T${nextEp.season}·E${nextEp.episode}</button>` : ''}
                      <button type="button" class="rms-btn" data-sr-comm="${id}">💬 ${(s.comments || []).length}</button>
                    `}
                  </div>
                </div>
              </article>`;
          }).join('');
          })()}
        </div>
      `}
    </div>
  `;

  const find = id => all.find(s => s.id === id);

  viewport.querySelectorAll('[data-sr-filter]').forEach(b => b.addEventListener('click', () => {
    setFilterState(b.getAttribute('data-sr-filter'));
    rerender();
  }));

  viewport.querySelector('#rms-search-inp')?.addEventListener('input', e => {
    seriesUiState.search = e.target.value;
    const pos = e.target.selectionStart;
    rerender();
    const n = viewport.querySelector('#rms-search-inp');
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} }
  });

  viewport.querySelector('#rms-sort-btn')?.addEventListener('click', () => {
    const sorts = [
      ['recent', '🕒 Más recientes primero'],
      ['watching', '📺 En curso primero'],
      ['rating', '⭐ Mejor calificadas'],
      ['year', '📅 Año (nuevas primero)'],
      ['title', '🔤 Orden alfabético (A-Z)']
    ];
    UI.openModal({
      title: 'Ordenar series',
      contentHtml: `<div style="display:flex;flex-direction:column;gap:.55rem;">${sorts.map(([id, l]) =>
        `<button type="button" class="btn ${seriesUiState.sort === id ? 'btn-primary' : 'btn-secondary'} btn-sm" style="justify-content:flex-start;" data-sr-sort="${id}">${l}</button>`).join('')}</div>`,
      onMount: () => {
        document.querySelectorAll('[data-sr-sort]').forEach(b => b.addEventListener('click', () => {
          seriesUiState.sort = b.getAttribute('data-sr-sort');
          UI.closeModal();
          rerender();
        }));
      }
    });
  });

  viewport.querySelector('#rms-add')?.addEventListener('click', () => {
    if (!check.allowed) {
      UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id));
      return;
    }
    openSearchTmdbModal(group, 'series');
  });

  viewport.querySelectorAll('[data-sr-open]').forEach(el => el.addEventListener('click', () => {
    const s = find(el.getAttribute('data-sr-open'));
    if (s) openSeriesDetail(s);
  }));
  viewport.querySelectorAll('[data-sr-quick-ep]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (el.disabled) return;
    const s = find(el.getAttribute('data-sr-quick-ep'));
    const sNum = Number(el.getAttribute('data-s'));
    const eNum = Number(el.getAttribute('data-e'));
    if (!s || !sNum || !eNum) return;
    el.disabled = true;
    const res = store.markEpisodeWatched(s.id, sNum, eNum);
    if (res?.alreadyWatched) return;
    if (res?.isFullyCompleted) {
      fireConfetti({ particleCount: 110, spread: 80, origin: { y: 0.65 } });
      UI.showToast(`🏆 ¡Completaste "${s.title}"!`, 'success');
    } else {
      UI.showToast(`✓ Marcado T${sNum}·E${eNum} de "${s.title}"`, 'success');
    }
  }));
  viewport.querySelectorAll('[data-locked-series]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    UI.showUpgradeModal('En el Plan Free el límite es de 5 series por grupo. Las más recientes quedaron bloqueadas; activa ruma Plus para desbloquearlas.', () => store.upgradeGroupToPremium(group.id));
  }));
  viewport.querySelectorAll('[data-sr-comm]').forEach(el => el.addEventListener('click', () => {
    const s = find(el.getAttribute('data-sr-comm'));
    if (s) openMediaCommentsModal('series', s);
  }));

  viewport.querySelectorAll('[data-sr-more]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const s = find(btn.getAttribute('data-sr-more'));
    if (!s) return;
    const canDelete = store.canDeleteMediaItem(group, s, user);
    const proposer = s.proposedBy?.name || s.addedBy || 'Miembro';
    UI.openModal({
      title: Utils.sanitize(s.title),
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="sr-m-open">▶ Capítulos &amp; Maratón</button>
          <button type="button" class="btn btn-secondary" id="sr-m-rate">⭐ Calificar / Escribir reseña</button>
          <button type="button" class="btn btn-secondary" id="sr-m-comm">💬 Comentarios (${(s.comments || []).length})</button>
          <button type="button" class="btn btn-secondary" id="sr-m-quote">↩ Citar en el chat</button>
          <div style="font-size:.75rem;color:var(--text-muted);">Añadida por <b>${Utils.sanitize(proposer)}</b></div>
          ${canDelete ? `<button type="button" class="btn" id="sr-m-del" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:var(--error);">🗑️ Eliminar serie</button>` : `
            <div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.35rem;border-radius:.6rem;background:var(--surface-secondary);">🔒 Solo quien la añadió (${Utils.sanitize(proposer)}) o el líder del grupo pueden eliminarla.</div>`}
        </div>`,
      onMount: () => {
        const on = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { UI.closeModal(); fn(); });
        on('sr-m-open', () => openSeriesDetail(s));
        on('sr-m-rate', () => openReviewModal('series', s, user));
        on('sr-m-comm', () => openMediaCommentsModal('series', s));
        on('sr-m-quote', () => onQuoteSeries(s));
        on('sr-m-del', () => {
          const res = store.deleteMediaItem('series', s.id);
          UI.showToast(res.ok ? 'Serie eliminada 🗑️' : res.error, res.ok ? 'info' : 'error');
        });
      }
    });
  }));

  hydrateMediaFromTmdb(group, 'series');
}
