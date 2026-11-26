// Vista modular de Música del Grupo (Banner, 3 métricas, Chips, Filtro por integrante, Buscador + Orden, Playlist Play/Shuffle, Tarjetas sincronizadas)
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
  sliders: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="18" r="2" fill="var(--surface)"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'
};

const musicUiState = { search: '', sort: 'recent' };
let unsubscribeMusicSync = null;

function fmtDuration(totalSec) {
  const mins = Math.floor(totalSec / 60);
  if (mins >= 60) return `${Math.floor(mins / 60)} h ${mins % 60} min`;
  return `${mins} min`;
}

function getSongAuthorId(song) {
  return song?.proposedBy?.id || song?.authorId || '';
}

function getSongAuthorName(song, memberById) {
  const aid = getSongAuthorId(song);
  if (aid && memberById.has(aid)) return memberById.get(aid).name;
  return song?.proposedBy?.name || song?.addedBy || 'Miembro';
}

function getSongAuthorKey(song, memberById) {
  const aid = getSongAuthorId(song);
  if (aid) return `id:${aid}`;
  return `name:${getSongAuthorName(song, memberById)}`;
}

function getSongRatingSummary(song, userId) {
  const map = (song?.ratings && typeof song.ratings === 'object') ? song.ratings : null;
  const vals = map ? Object.values(map).map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
  if (vals.length > 0) {
    const avg = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
    const myVote = userId && map[userId] ? Number(map[userId]) : null;
    return { avg, count: vals.length, myVote };
  }
  const fallback = Number(song?.rating || 5);
  const creatorId = getSongAuthorId(song);
  return {
    avg: fallback,
    count: Number(song?.ratingCount || 1),
    myVote: (userId && creatorId && creatorId === userId) ? fallback : null
  };
}

export function renderGroupMusicView(viewport, group, user, ctx) {
  const { getFilterState, setFilterState, openAddSongModal, openEditSongModal, openMediaCommentsModal, openLyricsModal, onQuoteSong, rerender } = ctx;
  const state = getFilterState();
  const allSongs = group.songs || [];
  const allMemories = group.memories || [];
  const memById = new Map(allMemories.map(m => [m.id, m]));
  const memberById = new Map((group.members || []).map(m => [m.id, m]));
  const check = Entitlements.canAddMediaItem(group, 'songs');
  const lockedIds = Entitlements.getLockedMediaIds(group, 'songs');

  const authorMap = new Map();
  allSongs.forEach(s => {
    const key = getSongAuthorKey(s, memberById);
    const label = getSongAuthorName(s, memberById);
    if (!authorMap.has(key)) authorMap.set(key, label);
  });

  const totalSec = allSongs.reduce((a, s) => a + Math.round((s.trackTimeMillis || 210000) / 1000), 0);
  const integrantes = Math.max(authorMap.size, allSongs.length ? 1 : 0);

  const liveLinkedMemories = (song) => (song.linkedMemories || []).map(mid => memById.get(mid)).filter(Boolean);

  const getFilteredSongs = () => {
    let songs = [...allSongs];
    if (state.type === 'top-rated') {
      songs.sort((a, b) => getSongRatingSummary(b, user.id).avg - getSongRatingSummary(a, user.id).avg);
    } else if (state.type === 'with-memories') {
      songs = songs.filter(s => liveLinkedMemories(s).length > 0);
    } else if (state.type === 'my-songs') {
      songs = songs.filter(s => {
        const aid = getSongAuthorId(s);
        return aid ? aid === user.id : s.addedBy === user.name;
      });
    } else if (state.type === 'by-member' && state.memberName) {
      songs = songs.filter(s => getSongAuthorKey(s, memberById) === state.memberName || s.addedBy === state.memberName);
    }

    const q = (musicUiState.search || '').trim().toLowerCase();
    if (q) {
      songs = songs.filter(s => [s.title, s.artist, s.album, s.note].some(v => String(v || '').toLowerCase().includes(q)));
    }

    if (state.type !== 'top-rated') {
      if (musicUiState.sort === 'rating') songs.sort((a, b) => getSongRatingSummary(b, user.id).avg - getSongRatingSummary(a, user.id).avg);
      else if (musicUiState.sort === 'comments') songs.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
      else if (musicUiState.sort === 'title') songs.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      else if (musicUiState.sort === 'artist') songs.sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    }

    return { songs, q, unlockedVisibleSongs: songs.filter(s => !lockedIds.has(s.id)) };
  };

  let activeUnlockedSongs = [];
  const buildResultsHtml = () => {
    const { songs, q, unlockedVisibleSongs } = getFilteredSongs();
    activeUnlockedSongs = unlockedVisibleSongs;
    const currentPlayingId = MusicService.getCurrentPlayingId();

    const playbarHtml = unlockedVisibleSongs.length > 0 ? `
      <div class="rmu-playbar">
        <button type="button" class="rmu-playbar-btn primary" id="mu-play-all">▶ Reproducir lista (${unlockedVisibleSongs.length})</button>
        <button type="button" class="rmu-playbar-btn" id="mu-play-shuffle">🔀 Aleatorio</button>
      </div>` : '';

    if (songs.length === 0) {
      return `${playbarHtml}
        <div class="rg-card rm-empty">
          <b>${q || state.type !== 'all' ? 'No hay canciones en este filtro' : 'Aún no hay canciones'}</b>
          <span>${q || state.type !== 'all' ? 'Prueba con otro filtro o búsqueda.' : 'Añade la primera canción para empezar la playlist del grupo.'}</span>
        </div>`;
    }

    return `${playbarHtml}
      <div class="rmv-list">
        ${songs.map(song => {
          const isLocked = lockedIds.has(song.id);
          const id = Utils.sanitize(song.id);
          const { avg, count, myVote } = getSongRatingSummary(song, user.id);
          const linked = liveLinkedMemories(song);
          const playing = currentPlayingId === song.id;
          const who = getSongAuthorName(song, memberById);
          return `
          <article class="rg-card rmu-card ${isLocked ? 'is-locked' : ''} ${playing ? 'is-playing' : ''}" data-mu-card="${id}">
            <div class="rmu-art">
              <img src="${Utils.sanitize(song.artwork || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(song.title)}">
              <button type="button" class="rmu-play" ${isLocked ? 'data-locked-song' : `data-mu-play="${id}"`} aria-label="${isLocked ? 'Bloqueada' : 'Reproducir fragmento'}">${isLocked ? '🔒' : (playing ? '⏸' : '▶')}</button>
            </div>
            <div class="rmu-body">
              <div class="rmu-top">
                <div class="rmu-titles">
                  <div class="rmu-title-line">
                    <h3>${Utils.sanitize(song.title)}</h3>
                    <span class="rmu-eq" aria-hidden="true"><i></i><i></i><i></i></span>
                  </div>
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
                  ${[1, 2, 3, 4, 5].map(st => `<span class="${st <= Math.round(avg) ? 'on' : ''}" data-mu-star="${id}" data-star="${st}" title="Calificar con ${st}★">★</span>`).join('')}
                  <b>${avg.toFixed(1)}</b><small>(${count})</small>
                  ${myVote ? `<span class="rmu-my-vote">Tu voto: ${myVote}★</span>` : ''}
                </div>
                ${song.note ? `<p class="rmu-note">“${Utils.sanitize(song.note)}” <span class="rmu-note-by">— ${Utils.sanitize(who)}</span></p>` : ''}
                ${linked.length ? `<button type="button" class="rmu-linked" data-mu-linked="${Utils.sanitize(linked.map(m => m.id).join(','))}">🎴 Usada en ${linked.length} recuerdo${linked.length === 1 ? '' : 's'} ›</button>` : ''}
                <div class="rmu-links">
                  <a class="rmu-pl spotify" target="_blank" rel="noopener noreferrer" href="${Utils.sanitize(Utils.safeUrl(song.spotifyUrl || MusicService.buildSpotifyUrl(song.title, song.artist), '#'))}" title="Escuchar en Spotify"><img class="rmu-brand-icon" src="assets/logos/spotify.svg" alt="" width="14" height="14">Spotify</a>
                  <a class="rmu-pl youtube" target="_blank" rel="noopener noreferrer" href="${Utils.sanitize(Utils.safeUrl(song.youtubeUrl || MusicService.buildYoutubeUrl(song.title, song.artist), '#'))}" title="Ver en YouTube"><img class="rmu-brand-icon" src="assets/logos/youtube.svg" alt="" width="14" height="14">YouTube</a>
                  <a class="rmu-pl apple" target="_blank" rel="noopener noreferrer" href="${Utils.sanitize(Utils.safeUrl(song.appleMusicUrl || MusicService.buildAppleMusicUrl(song.title, song.artist), '#'))}" title="Escuchar en Apple Music"><img class="rmu-brand-icon" src="assets/logos/apple-music.svg" alt="" width="14" height="14">Apple</a>
                  <button type="button" class="rmu-pl lyrics" data-mu-lyrics="${id}">${svg(ICO.mic, 13)}Letra</button>
                </div>
              `}
            </div>
          </article>`;
        }).join('')}
      </div>`;
  };

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

      ${authorMap.size > 1 ? `
        <select id="mu-member" class="rmu-select" aria-label="Filtrar por integrante">
          <option value="">👥 Filtrar por integrante...</option>
          ${[...authorMap.entries()].map(([key, label]) => `<option value="${Utils.sanitize(key)}" ${state.type === 'by-member' && (state.memberName === key || state.memberName === label) ? 'selected' : ''}>👤 ${Utils.sanitize(label)}</option>`).join('')}
        </select>
      ` : ''}

      <div class="rmv-search-row">
        <div class="rmv-search-box">
          ${svg(ICO.search, 18)}
          <input type="text" id="mu-search" placeholder="Buscar canción, artista, álbum o dedicatoria..." value="${Utils.sanitize(musicUiState.search)}">
        </div>
        <button type="button" class="rmv-sort-btn ${musicUiState.sort !== 'recent' ? 'active' : ''}" id="mu-sort-btn" aria-label="Ordenar canciones">${svg(ICO.sliders, 18)}</button>
      </div>

      <div class="rmu-top-cta-row">
        <button type="button" class="rm-add-cta" id="mu-add" style="flex:1;">
          <span class="rm-plus">+</span>${svg(ICO.note, 22)}<span>Añadir canción</span>
        </button>
      </div>

      <div id="rmu-results-slot">${buildResultsHtml()}</div>
    </div>`;

  const find = id => allSongs.find(s => s.id === id);

  // Sincronizar todos los botones ▶/⏸ y la tarjeta activa con el estado real del reproductor
  const syncCardsPlaybackUi = (playerState) => {
    if (!document.body.contains(viewport)) {
      if (unsubscribeMusicSync) { unsubscribeMusicSync(); unsubscribeMusicSync = null; }
      return;
    }
    const activeId = playerState?.isPlaying ? playerState.trackId : null;
    viewport.querySelectorAll('[data-mu-card]').forEach(card => {
      const cid = card.getAttribute('data-mu-card');
      const isNow = Boolean(activeId && cid === activeId);
      card.classList.toggle('is-playing', isNow);
      const btn = card.querySelector('[data-mu-play]');
      if (btn && btn.textContent !== '⏳') {
        btn.textContent = isNow ? '⏸' : '▶';
      }
    });
  };
  if (unsubscribeMusicSync) unsubscribeMusicSync();
  unsubscribeMusicSync = MusicService.subscribe(syncCardsPlaybackUi);

  const bindResultsEvents = (container) => {
    if (!container) return;
    container.querySelector('#mu-play-all')?.addEventListener('click', async () => {
      const res = await MusicService.playPlaylist(activeUnlockedSongs, { shuffle: false });
      if (!res.ok) UI.showToast(res.error || 'Preview no disponible.', 'info');
    });

    container.querySelector('#mu-play-shuffle')?.addEventListener('click', async () => {
      const res = await MusicService.playPlaylist(activeUnlockedSongs, { shuffle: true });
      if (!res.ok) UI.showToast(res.error || 'Preview no disponible.', 'info');
      else UI.showToast('🔀 Reproduciendo playlist en modo aleatorio', 'info');
    });

    container.querySelectorAll('[data-locked-song]').forEach(el => el.addEventListener('click', (e) => {
      e.stopPropagation();
      UI.showUpgradeModal('En el Plan Free el límite es de 5 canciones por grupo. Las más recientes quedaron bloqueadas; activa ruma Plus para desbloquearlas.', () => store.upgradeGroupToPremium(group.id));
    }));

    container.querySelectorAll('[data-mu-play]').forEach(btn => btn.addEventListener('click', async () => {
      const song = find(btn.getAttribute('data-mu-play'));
      if (!song) return;
      MusicService.setPlaylist(activeUnlockedSongs);
      if (song.previewUrl) {
        MusicService.toggleTrack(song);
        return;
      }
      btn.textContent = '⏳';
      const res = await MusicService.playTrackOrResolve(song);
      if (!res.ok) {
        btn.textContent = '▶';
        UI.showToast(res.error || 'Preview de 30s no disponible para esta canción.', 'info');
      }
    }));

    container.querySelectorAll('[data-mu-star]').forEach(el => el.addEventListener('click', () => {
      const star = Number(el.getAttribute('data-star'));
      store.rateSong(el.getAttribute('data-mu-star'), star);
      UI.showToast(`¡Calificaste con ${star}★!`, 'success');
    }));
    container.querySelectorAll('[data-mu-comm]').forEach(b => b.addEventListener('click', () => {
      const s = find(b.getAttribute('data-mu-comm')); if (s) openMediaCommentsModal('songs', s);
    }));
    container.querySelectorAll('[data-mu-lyrics]').forEach(b => b.addEventListener('click', () => {
      const s = find(b.getAttribute('data-mu-lyrics')); if (s) openLyricsModal(s);
    }));
    container.querySelectorAll('[data-mu-linked]').forEach(b => b.addEventListener('click', () => {
      const ids = b.getAttribute('data-mu-linked').split(',').filter(Boolean);
      store.navigate('group', { groupTab: 'memories', memoryFilterIds: ids });
    }));

    container.querySelectorAll('[data-mu-more]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = find(btn.getAttribute('data-mu-more'));
      if (!s) return;
      const isLocked = lockedIds.has(s.id);
      const canManage = store.canDeleteMediaItem(group, s, user) || getSongAuthorId(s) === user.id;
      const who = getSongAuthorName(s, memberById);
      UI.openModal({
        title: isLocked ? `🔒 ${s.title}` : s.title,
        contentHtml: `
          <div style="display:flex;flex-direction:column;gap:.6rem;">
            ${isLocked ? `
              <p style="font-size:.84rem;color:var(--text-secondary);margin:0;">
                Esta canción excede el límite de 5 canciones del <strong>Plan Free</strong>. Activa ruma Plus para desbloquearla o libera espacio eliminando una canción.
              </p>
              <button type="button" class="btn btn-primary" id="mu-m-upgrade">✨ Ver ruma Plus</button>
            ` : `
              <button type="button" class="btn btn-secondary" id="mu-m-lyrics">🎤 Ver letra</button>
              <button type="button" class="btn btn-secondary" id="mu-m-comm">💬 Comentarios (${(s.comments || []).length})</button>
              <button type="button" class="btn btn-secondary" id="mu-m-quote">↩ Citar en el chat</button>
              ${canManage && typeof openEditSongModal === 'function' ? `<button type="button" class="btn btn-secondary" id="mu-m-edit">✏️ Editar dedicatoria y recuerdos</button>` : ''}
            `}
            <div style="font-size:.75rem;color:var(--text-muted);">Añadida por <b>${Utils.sanitize(who)}</b></div>
            ${canManage ? `<button type="button" class="btn" id="mu-m-del" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:var(--error);">🗑️ Eliminar canción</button>` :
              `<div style="font-size:.74rem;color:var(--text-muted);text-align:center;padding:.45rem;border-radius:.6rem;background:var(--surface-secondary);">🔒 Solo quien la añadió (${Utils.sanitize(who)}) o el líder del grupo pueden editarla o eliminarla.</div>`}
          </div>`,
        onMount: () => {
          const on = (i, fn) => document.getElementById(i)?.addEventListener('click', () => { UI.closeModal(); fn(); });
          on('mu-m-upgrade', () => UI.showUpgradeModal('Mejora a ruma Plus para desbloquear toda la playlist del grupo sin límite de 5.', () => store.upgradeGroupToPremium(group.id)));
          on('mu-m-lyrics', () => openLyricsModal(s));
          on('mu-m-comm', () => openMediaCommentsModal('songs', s));
          on('mu-m-quote', () => onQuoteSong(s));
          on('mu-m-edit', () => openEditSongModal(group, s));
          on('mu-m-del', () => {
            if (MusicService.getPlayerState().trackId === s.id) MusicService.stopPreview();
            const res = store.deleteMediaItem('songs', s.id);
            UI.showToast(res.ok ? 'Canción eliminada 🗑️' : res.error, res.ok ? 'info' : 'error');
          });
        }
      });
    }));
  };

  const resultsSlot = viewport.querySelector('#rmu-results-slot');
  bindResultsEvents(resultsSlot);

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
    if (resultsSlot) {
      resultsSlot.innerHTML = buildResultsHtml();
      bindResultsEvents(resultsSlot);
    }
  });

  viewport.querySelector('#mu-sort-btn')?.addEventListener('click', () => {
    const sorts = [
      ['recent', '🕒 Más recientes primero'],
      ['rating', '⭐ Mejor valoradas'],
      ['comments', '💬 Más comentadas'],
      ['title', '🔤 Título (A–Z)'],
      ['artist', '🎤 Artista (A–Z)']
    ];
    UI.openModal({
      title: 'Ordenar canciones',
      contentHtml: `<div style="display:flex;flex-direction:column;gap:.55rem;">${sorts.map(([id, l]) =>
        `<button type="button" class="btn ${musicUiState.sort === id ? 'btn-primary' : 'btn-secondary'} btn-sm" style="justify-content:flex-start;" data-mu-sort="${id}">${l}</button>`).join('')}</div>`,
      onMount: () => {
        document.querySelectorAll('[data-mu-sort]').forEach(b => b.addEventListener('click', () => {
          musicUiState.sort = b.getAttribute('data-mu-sort');
          if (state.type === 'top-rated' && musicUiState.sort !== 'rating') {
            setFilterState({ type: 'all', memberName: '' });
          }
          UI.closeModal();
          rerender();
        }));
      }
    });
  });

  viewport.querySelector('#mu-add')?.addEventListener('click', () => {
    if (!check.allowed) { UI.showUpgradeModal(check.reason, () => store.upgradeGroupToPremium(group.id)); return; }
    openAddSongModal(group);
  });
}
