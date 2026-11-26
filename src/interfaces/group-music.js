// Vista modular de Música del Grupo (Banner, 3 métricas, Chips, Filtro por integrante, Buscador, CTA, tarjetas de canción)
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { MusicService } from '../services/music-service.js';

const svg = (inner, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  timer: '<circle cx="12" cy="14" r="7"/><path d="M12 14V10M9 2h6M12 2v3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'
};

const musicUiState = { search: '' };

function fmtDuration(totalSec) {
  const mins = Math.floor(totalSec / 60);
  if (mins >= 60) return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return `${mins} min`;
}

export function renderGroupMusicView(viewport, group, user, ctx) {
  const { getFilterState, setFilterState, openAddSongModal, openMediaCommentsModal, openLyricsModal, onQuoteSong, rerender } = ctx;
  const state = getFilterState();
  const allSongs = group.songs || [];
  const allMemories = group.memories || [];
  const check = Entitlements.canAddMediaItem(group, 'songs');

  const authors = new Set();
  allSongs.forEach(s => { if (s.addedBy) authors.add(s.addedBy); });
  const totalSec = allSongs.reduce((a, s) => a + Math.round((s.trackTimeMillis || 210000) / 1000), 0);
  const integrantes = Math.max(authors.size, allSongs.length ? 1 : 0);

  let songs = [...allSongs];
  if (state.type === 'top-rated') songs.sort((a, b) => (b.rating || 5) - (a.rating || 5));
  else if (state.type === 'with-memories') songs = songs.filter(s => s.linkedMemories?.length);
  else if (state.type === 'my-songs') songs = songs.filter(s => s.addedBy === user.name || s.authorId === user.id);
  else if (state.type === 'by-member' && state.memberName) songs = songs.filter(s => s.addedBy === state.memberName);

  const q = (musicUiState.search || '').trim().toLowerCase();
  if (q) songs = songs.filter(s => [s.title, s.artist, s.album].some(v => String(v || '').toLowerCase().includes(q)));

  const chips = [
    { id: 'all', label: 'Todas', ico: '' },
    { id: 'top-rated', label: 'Mejor valoradas', ico: '⭐' },
    { id: 'with-memories', label: 'Con recuerdos', ico: '📸' },
    { id: 'my-songs', label: 'Mis canciones', ico: '👤' }
  ];

  viewport.innerHTML = `
    <div class="rmv-wrap">
      <section class="rg-card rmv-banner">
        <div class="rm-banner-left">
          <div class="rm-banner-ico">${svg(ICO.note, 26)}</div>
          <div class="rm-banner-txt"><h1>Música</h1><p>Playlist colaborativa del grupo</p></div>
        </div>
        <div class="rmv-banner-art" aria-hidden="true"><span class="rmv-pop">🎧</span></div>
      </section>

      <section class="rms-stats">
        <div class="rmv-stat-card"><span class="rmv-stat-ico">${svg(ICO.note, 20)}</span><b>${allSongs.length}</b><small>Canciones</small></div>
        <div class="rmv-stat-card"><span class="rmv-stat-ico">${svg(ICO.users, 20)}</span><b>${integrantes}</b><small>Integrantes</small></div>
        <div class="rmv-stat-card"><span class="rmv-stat-ico">${svg(ICO.timer, 20)}</span><b>${fmtDuration(totalSec)}</b><small>Duración</small></div>
      </section>

      <div class="rmv-chips" role="tablist">
        ${chips.map(c => `<button type="button" class="rmv-chip ${state.type === c.id ? 'active' : ''}" data-mu-filter="${c.id}">${c.ico ? c.ico + ' ' : ''}${c.label}</button>`).join('')}
      </div>

      <select id="mu-member" class="rmu-select" aria-label="Filtrar por integrante">
        <option value="">👥 Filtrar por integrante...</option>
        ${[...authors].map(n => `<option value="${Utils.sanitize(n)}" ${state.type === 'by-member' && state.memberName === n ? 'selected' : ''}>👤 ${Utils.sanitize(n)}</option>`).join('')}
      </select>

      <div class="rmv-search-row">
        <div class="rmv-search-box">
          ${svg(ICO.search, 18)}
          <input type="text" id="mu-search" placeholder="Buscar canción, artista o álbum..." value="${Utils.sanitize(musicUiState.search)}">
        </div>
      </div>

      <button type="button" class="rm-add-cta" id="mu-add">
        <span class="rm-plus">+</span>${svg(ICO.note, 22)}<span>Añadir canción</span>
      </button>

      ${songs.length === 0 ? `
        <div class="rg-card rm-empty">
          <b>${q || state.type !== 'all' ? 'No hay canciones en este filtro' : 'Aún no hay canciones'}</b>
          <span>${q || state.type !== 'all' ? 'Prueba con otro filtro o búsqueda.' : 'Añade la primera canción para empezar la playlist del grupo.'}</span>
        </div>` : `
        <div class="rmv-list">
          ${(() => {
            const lockedIds = Entitlements.getLockedMediaIds(group, 'songs');
            return songs.map(song => {
            const isLocked = lockedIds.has(song.id);
            const id = Utils.sanitize(song.id);
            const rating = Number(song.rating || 5);
            const linked = (song.linkedMemories || []).map(mid => allMemories.find(m => m.id === mid)).filter(Boolean);
            const playing = MusicService.getCurrentPlayingId() === song.id;
            return `
            <article class="rg-card rmu-card ${isLocked ? 'is-locked' : ''}">
              <div class="rmu-art">
                <img src="${Utils.sanitize(song.artwork || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(song.title)}">
                <button type="button" class="rmu-play" ${isLocked ? 'data-locked-song' : `data-mu-play="${id}"`} aria-label="${isLocked ? 'Bloqueada' : 'Reproducir fragmento'}">${isLocked ? '🔒' : (playing ? '⏸' : '▶')}</button>
              </div>
              <div class="rmu-body">
                <div class="rmu-top">
                  <div class="rmu-titles">
                    <h3>${Utils.sanitize(song.title)}</h3>
                    <div class="rmu-artist"><b>${Utils.sanitize(song.artist || '')}</b>${song.album ? ` <span>· ${Utils.sanitize(song.album)}</span>` : ''}</div>
                  </div>
                  <div class="rmu-top-actions">
                    ${isLocked ? '' : `<button type="button" class="rmu-comm" data-mu-comm="${id}">${svg(ICO.comment, 14)} ${(song.comments || []).length}</button>`}
                    <button type="button" class="rmv-more-btn" data-mu-more="${id}" aria-label="Más opciones">⋯</button>
                  </div>
                </div>
                ${isLocked ? `
                  <div class="rmv-watched-some" style="color:var(--error);">🔒 Excede el límite de 5 canciones del Plan Free</div>
                  <div class="rmu-links">
                    <button type="button" class="rms-btn is-locked" data-locked-song>🔒 Bloqueada · Activar ruma Plus</button>
                  </div>
                ` : `
                  <div class="rmu-stars">
                    ${[1, 2, 3, 4, 5].map(st => `<span class="${st <= Math.round(rating) ? 'on' : ''}" data-mu-star="${id}" data-star="${st}">★</span>`).join('')}
                    <b>${rating.toFixed(1)}</b><small>(${song.ratingCount || 1})</small>
                  </div>
                  ${song.note ? `<p class="rmu-note">“${Utils.sanitize(song.note)}”</p>` : ''}
                  ${linked.length ? `<button type="button" class="rmu-linked" data-mu-linked="${Utils.sanitize(song.linkedMemories.join(','))}">🎴 Usada en ${linked.length} recuerdo(s) ›</button>` : ''}
                  <div class="rmu-links">
                    <a class="rmu-pl spotify" target="_blank" rel="noopener" href="${Utils.sanitize(song.spotifyUrl || MusicService.buildSpotifyUrl(song.title, song.artist))}" title="Escuchar en Spotify"><img class="rmu-brand-icon" src="assets/logos/spotify.svg" alt="" width="14" height="14">Spotify</a>
                    <a class="rmu-pl youtube" target="_blank" rel="noopener" href="${Utils.sanitize(song.youtubeUrl || MusicService.buildYoutubeUrl(song.title, song.artist))}" title="Ver en YouTube"><img class="rmu-brand-icon" src="assets/logos/youtube.svg" alt="" width="14" height="14">YouTube</a>
                    <a class="rmu-pl apple" target="_blank" rel="noopener" href="${Utils.sanitize(song.appleMusicUrl || MusicService.buildAppleMusicUrl(song.title, song.artist))}" title="Escuchar en Apple Music"><img class="rmu-brand-icon" src="assets/logos/apple-music.svg" alt="" width="14" height="14">Apple</a>
                    <button type="button" class="rmu-pl lyrics" data-mu-lyrics="${id}">${svg(ICO.mic, 13)}Letra</button>
                  </div>
                `}
              </div>
            </article>`;
          }).join('');
          })()}
        </div>`}
    </div>`;

  const find = id => allSongs.find(s => s.id === id);

  viewport.querySelectorAll('[data-mu-filter]').forEach(b => b.addEventListener('click', () => {
    setFilterState({ type: b.getAttribute('data-mu-filter'), memberName: '' });
    rerender();
  }));
  viewport.querySelector('#mu-member')?.addEventListener('change', e => {
    setFilterState(e.target.value ? { type: 'by-member', memberName: e.target.value } : { type: 'all', memberName: '' });
    rerender();
  });
  viewport.querySelector('#mu-search')?.addEventListener('input', e => {
    musicUiState.search = e.target.value;
    const pos = e.target.selectionStart;
    rerender();
    const n = viewport.querySelector('#mu-search');
    if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) {} }
  });
  viewport.querySelector('#mu-add')?.addEventListener('click', () => {
    if (!check.allowed) { UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id)); return; }
    openAddSongModal(group);
  });

  viewport.querySelectorAll('[data-locked-song]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    UI.showUpgradeModal('En el Plan Free el límite es de 5 canciones por grupo. Las más recientes quedaron bloqueadas; activa ruma Plus para desbloquearlas.', () => store.upgradeGroupToPremium(group.id));
  }));

  viewport.querySelectorAll('[data-mu-play]').forEach(btn => btn.addEventListener('click', async () => {
    const song = find(btn.getAttribute('data-mu-play'));
    if (!song) return;
    if (song.previewUrl) {
      const res = MusicService.toggleTrack(song);
      btn.textContent = res.isPlaying ? '⏸' : '▶';
      return;
    }
    btn.textContent = '⏳';
    const results = await MusicService.searchSongs(`${song.title} ${song.artist}`, 3);
    if (results.length > 0 && results[0].previewUrl) {
      store.updateMediaItem('songs', song.id, { previewUrl: results[0].previewUrl });
      song.previewUrl = results[0].previewUrl;
      MusicService.playTrack(song);
      btn.textContent = '⏸';
    } else {
      btn.textContent = '▶';
      UI.showToast('Preview de 30s no disponible para esta canción.', 'info');
    }
  }));

  viewport.querySelectorAll('[data-mu-star]').forEach(el => el.addEventListener('click', () => {
    const star = Number(el.getAttribute('data-star'));
    store.rateSong(el.getAttribute('data-mu-star'), star);
    UI.showToast(`¡Calificaste con ${star}★!`, 'success');
  }));
  viewport.querySelectorAll('[data-mu-comm]').forEach(b => b.addEventListener('click', () => {
    const s = find(b.getAttribute('data-mu-comm')); if (s) openMediaCommentsModal('songs', s);
  }));
  viewport.querySelectorAll('[data-mu-lyrics]').forEach(b => b.addEventListener('click', () => {
    const s = find(b.getAttribute('data-mu-lyrics')); if (s) openLyricsModal(s);
  }));
  viewport.querySelectorAll('[data-mu-linked]').forEach(b => b.addEventListener('click', () => {
    const ids = b.getAttribute('data-mu-linked').split(',').filter(Boolean);
    store.navigate('group', { groupTab: 'memories', memoryFilterIds: ids });
  }));

  viewport.querySelectorAll('[data-mu-more]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const s = find(btn.getAttribute('data-mu-more'));
    if (!s) return;
    const canDelete = store.canDeleteMediaItem(group, s, user) || s.authorId === user.id;
    const who = s.addedBy || 'Miembro';
    UI.openModal({
      title: Utils.sanitize(s.title),
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="mu-m-lyrics">🎤 Ver letra</button>
          <button type="button" class="btn btn-secondary" id="mu-m-comm">💬 Comentarios (${(s.comments || []).length})</button>
          <button type="button" class="btn btn-secondary" id="mu-m-quote">↩ Citar en el chat</button>
          <div style="font-size:.75rem;color:var(--text-muted);">Añadida por <b>${Utils.sanitize(who)}</b></div>
          ${canDelete ? `<button type="button" class="btn" id="mu-m-del" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:var(--error);">🗑️ Eliminar canción</button>` :
            `<div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.35rem;border-radius:.6rem;background:rgba(255,255,255,.03);">🔒 Solo quien la añadió (${Utils.sanitize(who)}) o el líder del grupo pueden eliminarla.</div>`}
        </div>`,
      onMount: () => {
        const on = (i, fn) => document.getElementById(i)?.addEventListener('click', () => { UI.closeModal(); fn(); });
        on('mu-m-lyrics', () => openLyricsModal(s));
        on('mu-m-comm', () => openMediaCommentsModal('songs', s));
        on('mu-m-quote', () => onQuoteSong(s));
        on('mu-m-del', () => {
          MusicService.stopPreview();
          const res = store.deleteMediaItem('songs', s.id);
          UI.showToast(res.ok ? 'Canción eliminada 🗑️' : res.error, res.ok ? 'info' : 'error');
        });
      }
    });
  }));
}
