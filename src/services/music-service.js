/**
 * ruma 🌟 — Servicio de Música, Búsqueda en Vivo y Reproductor Global Colaborativo
 *
 * Características acopladas con LUMA:
 * 1. Búsqueda instantánea en vivo mientras el usuario escribe (nombre, artista o letra).
 * 2. Reproductor de fragmentos oficiales de 30 segundos (vía CDN de Apple) con barra global flotante responsive.
 * 3. Controles de Anterior / Play-Pause / Siguiente / Letra / Barra de progreso táctil interactiva.
 * 4. Auto-recuperación si un preview caducó, reproducción de playlist completa y modo aleatorio.
 * 5. Enlaces directos hacia Spotify, YouTube y Apple Music.
 */

let sharedAudio = null;
let audioGestureUnlocked = false;
let isUnlockingAudio = false;
let currentPlayingId = null;
let currentPlayingTrack = null;
let currentUpdateCallback = null;
let playlistTracks = [];
let globalListeners = new Set();
let onLyricsRequest = null;
let onPreviewRefresh = null;
let retriedTrackIds = new Set();

const SILENT_UNLOCK_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

function unlockAudioForGesture() {
  if (audioGestureUnlocked) return;
  try {
    const audio = getSharedAudio();
    if (!audio || currentPlayingId) return;
    isUnlockingAudio = true;
    audio.src = SILENT_UNLOCK_WAV;
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        audioGestureUnlocked = true;
        if (isUnlockingAudio) audio.pause();
      }).catch(() => {}).finally(() => {
        isUnlockingAudio = false;
      });
    } else {
      isUnlockingAudio = false;
    }
  } catch (_) {
    isUnlockingAudio = false;
  }
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function notifyGlobalPlayer() {
  const state = MusicService.getPlayerState();
  globalListeners.forEach(fn => {
    try { fn(state); } catch (_) {}
  });
  renderFloatingPlayerBar(state);
}

function syncMediaSession(track) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !track) return;
  try {
    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title || 'Canción',
        artist: track.artist || 'ruma',
        album: track.album || 'ruma Music',
        artwork: track.artwork ? [{ src: track.artwork, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    }
    navigator.mediaSession.setActionHandler('play', () => {
      if (currentPlayingTrack) MusicService.toggleTrack(currentPlayingTrack);
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      const a = getSharedAudio();
      if (a && !a.paused) a.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => MusicService.playPrev());
    navigator.mediaSession.setActionHandler('nexttrack', () => MusicService.playNext());
  } catch (_) {}
}

function getSharedAudio() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'none';
    sharedAudio.playsInline = true;
    sharedAudio.setAttribute('playsinline', '');
    sharedAudio.setAttribute('webkit-playsinline', '');

    sharedAudio.addEventListener('timeupdate', () => {
      if (isUnlockingAudio || !currentPlayingId) return;
      if (typeof currentUpdateCallback === 'function' && sharedAudio) {
        currentUpdateCallback({
          trackId: currentPlayingId,
          currentTime: sharedAudio.currentTime || 0,
          duration: sharedAudio.duration || 30,
          isPlaying: !sharedAudio.paused
        });
      }
      notifyGlobalPlayer();
    });

    sharedAudio.addEventListener('play', () => {
      audioGestureUnlocked = true;
      if (isUnlockingAudio || !currentPlayingId) return;
      if (currentPlayingTrack) syncMediaSession(currentPlayingTrack);
      notifyGlobalPlayer();
    });
    sharedAudio.addEventListener('pause', () => {
      if (isUnlockingAudio) return;
      notifyGlobalPlayer();
    });

    sharedAudio.addEventListener('ended', () => {
      if (isUnlockingAudio || !currentPlayingId) return;
      const prevId = currentPlayingId;
      if (typeof currentUpdateCallback === 'function') {
        currentUpdateCallback({
          trackId: prevId,
          currentTime: 0,
          duration: 30,
          isPlaying: false
        });
      }
      const playable = playlistTracks.filter(t => t && (t.previewUrl || t.title));
      if (playable.length > 1 && currentPlayingId) {
        const idx = playable.findIndex(t => t.id === currentPlayingId);
        if (idx >= 0) {
          const next = playable[(idx + 1) % playable.length];
          MusicService.playTrackOrResolve(next);
          return;
        }
      }
      currentPlayingId = null;
      notifyGlobalPlayer();
    });

    sharedAudio.addEventListener('error', async () => {
      if (isUnlockingAudio || !currentPlayingId) return;
      const failedTrack = currentPlayingTrack;
      const prevId = currentPlayingId;

      // Intento único de refrescar un previewUrl caducado desde iTunes
      if (failedTrack && prevId && !retriedTrackIds.has(prevId) && failedTrack.title) {
        retriedTrackIds.add(prevId);
        try {
          const freshList = await MusicService.searchSongs(`${failedTrack.title} ${failedTrack.artist || ''}`, 3);
          const freshUrl = freshList.find(r => r.previewUrl)?.previewUrl;
          if (freshUrl && freshUrl !== failedTrack.previewUrl && currentPlayingTrack?.id === prevId) {
            failedTrack.previewUrl = freshUrl;
            if (typeof onPreviewRefresh === 'function') {
              try { onPreviewRefresh(prevId, freshUrl); } catch (_) {}
            }
            sharedAudio.src = freshUrl;
            sharedAudio.currentTime = 0;
            sharedAudio.play().catch(() => {});
            notifyGlobalPlayer();
            return;
          }
        } catch (_) {}
      }

      currentPlayingId = null;
      if (typeof currentUpdateCallback === 'function') {
        currentUpdateCallback({
          trackId: prevId,
          currentTime: 0,
          duration: 30,
          isPlaying: false,
          error: true
        });
      }
      notifyGlobalPlayer();
    });
  }
  return sharedAudio;
}

function renderFloatingPlayerBar(state) {
  let bar = document.getElementById('ruma-global-music-player');
  if (!state.track) {
    if (bar) bar.style.display = 'none';
    document.body.classList.remove('ruma-has-player');
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ruma-global-music-player';
    bar.className = 'ruma-global-player';
    bar.innerHTML = `
      <div class="ruma-gp-top">
        <div class="ruma-gp-track">
          <img id="ruma-gp-art" src="assets/ruma_icon_192.png" alt="art" class="ruma-gp-art">
          <div class="ruma-gp-meta">
            <div id="ruma-gp-title" class="ruma-gp-title">Canción</div>
            <div id="ruma-gp-artist" class="ruma-gp-artist">Artista</div>
          </div>
        </div>
        <div class="ruma-gp-actions">
          <button type="button" class="ruma-gp-btn" id="ruma-gp-lyrics" title="Ver letra" aria-label="Ver letra">🎤</button>
          <button type="button" class="ruma-gp-btn" id="ruma-gp-prev" title="Anterior" aria-label="Anterior">⏮</button>
          <button type="button" class="ruma-gp-btn ruma-gp-play" id="ruma-gp-toggle" title="Reproducir / Pausar" aria-label="Reproducir o pausar">▶</button>
          <button type="button" class="ruma-gp-btn" id="ruma-gp-next" title="Siguiente" aria-label="Siguiente">⏭</button>
          <button type="button" class="ruma-gp-close" id="ruma-gp-close" title="Cerrar reproductor" aria-label="Cerrar reproductor">✕</button>
        </div>
      </div>
      <div class="ruma-gp-progress-row">
        <span id="ruma-gp-cur">0:00</span>
        <div class="ruma-gp-bar-hit" id="ruma-gp-bar" role="slider" aria-label="Progreso de reproducción">
          <div class="ruma-gp-bar">
            <div class="ruma-gp-fill" id="ruma-gp-fill"></div>
          </div>
        </div>
        <span id="ruma-gp-dur">0:30</span>
      </div>
    `;
    document.body.appendChild(bar);

    document.getElementById('ruma-gp-toggle')?.addEventListener('click', () => {
      if (currentPlayingTrack) MusicService.toggleTrack(currentPlayingTrack);
    });
    document.getElementById('ruma-gp-prev')?.addEventListener('click', () => MusicService.playPrev());
    document.getElementById('ruma-gp-next')?.addEventListener('click', () => MusicService.playNext());
    document.getElementById('ruma-gp-close')?.addEventListener('click', () => MusicService.stopPreview());
    document.getElementById('ruma-gp-lyrics')?.addEventListener('click', () => {
      if (currentPlayingTrack && typeof onLyricsRequest === 'function') {
        onLyricsRequest(currentPlayingTrack);
      }
    });
    document.getElementById('ruma-gp-bar')?.addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const audio = getSharedAudio();
      if (audio && audio.duration) {
        audio.currentTime = ratio * audio.duration;
      }
    });
  }

  bar.style.display = 'flex';
  document.body.classList.add('ruma-has-player');
  const art = document.getElementById('ruma-gp-art');
  const title = document.getElementById('ruma-gp-title');
  const artist = document.getElementById('ruma-gp-artist');
  const toggle = document.getElementById('ruma-gp-toggle');
  const lyricsBtn = document.getElementById('ruma-gp-lyrics');
  const prevBtn = document.getElementById('ruma-gp-prev');
  const nextBtn = document.getElementById('ruma-gp-next');
  const fill = document.getElementById('ruma-gp-fill');
  const curEl = document.getElementById('ruma-gp-cur');
  const durEl = document.getElementById('ruma-gp-dur');

  if (art && art.getAttribute('src') !== (state.track.artwork || 'assets/ruma_icon_192.png')) {
    art.src = state.track.artwork || 'assets/ruma_icon_192.png';
  }
  if (title) title.textContent = state.track.title || 'Canción';
  if (artist) artist.textContent = state.track.artist || 'Artista';
  if (toggle) toggle.textContent = state.isPlaying ? '⏸' : '▶';
  if (lyricsBtn) lyricsBtn.style.display = typeof onLyricsRequest === 'function' ? 'inline-flex' : 'none';
  const hasQueue = playlistTracks.length > 1;
  if (prevBtn) prevBtn.style.display = hasQueue ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = hasQueue ? 'inline-flex' : 'none';

  const cur = Math.floor(state.currentTime || 0);
  const dur = Math.floor(state.duration || 30);
  const pct = dur > 0 ? Math.min(100, (state.currentTime / dur) * 100) : 0;
  if (fill) fill.style.width = `${pct}%`;
  if (curEl) curEl.textContent = fmtClock(cur);
  if (durEl) durEl.textContent = fmtClock(dur);
}

export const MusicService = {
  setPlaylist(tracks = []) {
    playlistTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (currentPlayingTrack) renderFloatingPlayerBar(this.getPlayerState());
  },

  setOnLyricsRequest(fn) {
    onLyricsRequest = typeof fn === 'function' ? fn : null;
  },

  setOnPreviewRefresh(fn) {
    onPreviewRefresh = typeof fn === 'function' ? fn : null;
  },

  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    globalListeners.add(fn);
    return () => globalListeners.delete(fn);
  },

  getPlayerState() {
    const audio = sharedAudio;
    return {
      trackId: currentPlayingId,
      track: currentPlayingTrack,
      isPlaying: Boolean(audio && !audio.paused && currentPlayingId),
      currentTime: audio ? (audio.currentTime || 0) : 0,
      duration: audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30
    };
  },

  async searchSongs(query, limit = 10) {
    if (!query || !query.trim()) return [];

    const cleanQuery = query.trim();
    const encoded = encodeURIComponent(cleanQuery);
    const url = `https://itunes.apple.com/search?term=${encoded}&media=music&entity=song&limit=${limit}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Error al consultar catálogo musical.');
      const data = await res.json();

      return (data.results || []).map((item) => {
        const title = item.trackName || 'Canción';
        const artist = item.artistName || 'Artista';
        const artworkHighRes = (item.artworkUrl100 || '')
          .replace('100x100bb.jpg', '600x600bb.jpg')
          .replace('100x100bb', '600x600bb');

        return {
          id: String(item.trackId || `${title}-${artist}`),
          itunesId: item.trackId ? String(item.trackId) : '',
          title,
          artist,
          album: item.collectionName || 'Single',
          artwork: artworkHighRes || item.artworkUrl100 || 'assets/ruma_icon_512.png',
          previewUrl: item.previewUrl || '',
          trackTimeMillis: item.trackTimeMillis || 210000,
          hasPreview: Boolean(item.previewUrl),
          spotifyUrl: this.buildSpotifyUrl(title, artist),
          youtubeUrl: this.buildYoutubeUrl(title, artist),
          appleMusicUrl: item.trackViewUrl || this.buildAppleMusicUrl(title, artist)
        };
      });
    } catch (err) {
      console.warn('MusicService search error:', err);
      return [];
    }
  },

  buildSpotifyUrl(title, artist) {
    return `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;
  },

  buildYoutubeUrl(title, artist) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist} audio oficial`)}`;
  },

  buildAppleMusicUrl(title, artist) {
    return `https://music.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}`;
  },

  async playTrackOrResolve(track) {
    if (!track) return { ok: false, error: 'Canción no disponible' };
    if (track.previewUrl) {
      this.playTrack(track);
      return { ok: true, isPlaying: true, track };
    }
    unlockAudioForGesture();
    const results = await this.searchSongs(`${track.title} ${track.artist || ''}`, 3);
    const freshUrl = results.find(r => r.previewUrl)?.previewUrl;
    if (freshUrl) {
      track.previewUrl = freshUrl;
      if (typeof onPreviewRefresh === 'function') {
        try { onPreviewRefresh(track.id, freshUrl); } catch (_) {}
      }
      this.playTrack(track);
      return { ok: true, isPlaying: true, track };
    }
    return { ok: false, error: 'Preview de 30s no disponible para esta canción.' };
  },

  async playPlaylist(tracks = [], { shuffle = false } = {}) {
    const queue = Array.isArray(tracks) ? tracks.filter(Boolean).slice() : [];
    if (queue.length === 0) return { ok: false, error: 'No hay canciones para reproducir.' };
    if (shuffle) {
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }
    this.setPlaylist(queue);
    // Buscar la primera pista con preview o resolver la primera de la cola
    const firstWithPreview = queue.find(t => t.previewUrl) || queue[0];
    return this.playTrackOrResolve(firstWithPreview);
  },

  playTrack(track, onUpdate = null) {
    if (!track || !track.previewUrl) return { error: 'Sin preview disponible' };
    retriedTrackIds.delete(track.id);
    currentPlayingTrack = track;
    return this.togglePreview(track.id, track.previewUrl, onUpdate, track);
  },

  toggleTrack(track, onUpdate = null) {
    if (!track) return { isPlaying: false };
    currentPlayingTrack = track;
    return this.togglePreview(track.id, track.previewUrl, onUpdate, track);
  },

  playNext() {
    const playable = playlistTracks.filter(Boolean);
    if (playable.length === 0) return;
    const idx = playable.findIndex(t => t.id === currentPlayingId);
    const next = playable[(idx + 1) % playable.length];
    if (next) this.playTrackOrResolve(next);
  },

  playPrev() {
    const playable = playlistTracks.filter(Boolean);
    if (playable.length === 0) return;
    const idx = playable.findIndex(t => t.id === currentPlayingId);
    const prevIdx = idx <= 0 ? playable.length - 1 : idx - 1;
    const prev = playable[prevIdx];
    if (prev) this.playTrackOrResolve(prev);
  },

  togglePreview(trackId, previewUrl, onUpdate = null, trackMeta = null) {
    if (!previewUrl) return { error: 'No hay fragmento disponible para este tema.' };

    isUnlockingAudio = false;
    const audio = getSharedAudio();
    if (onUpdate) currentUpdateCallback = onUpdate;
    if (trackMeta) currentPlayingTrack = trackMeta;
    else if (!currentPlayingTrack || currentPlayingTrack.id !== trackId) {
      const found = playlistTracks.find(t => t.id === trackId);
      currentPlayingTrack = found || { id: trackId, title: 'Fragmento 30s', artist: 'ruma Music', previewUrl };
    }

    if (currentPlayingId === trackId) {
      if (audio.paused) {
        audio.play().catch(console.warn);
        notifyGlobalPlayer();
        return { isPlaying: true, trackId };
      } else {
        audio.pause();
        notifyGlobalPlayer();
        return { isPlaying: false, trackId };
      }
    }

    audio.pause();
    audio.currentTime = 0;
    audio.src = previewUrl;
    currentPlayingId = trackId;

    audio.play().catch((err) => {
      console.warn('Reproducción de fragmento bloqueada por el navegador:', err);
    });

    notifyGlobalPlayer();
    return { isPlaying: true, trackId };
  },

  stopPreview() {
    const audio = getSharedAudio();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    const prevId = currentPlayingId;
    currentPlayingId = null;
    currentPlayingTrack = null;
    notifyGlobalPlayer();
    return prevId;
  },

  getCurrentPlayingId() {
    const audio = getSharedAudio();
    if (audio && !audio.paused) return currentPlayingId;
    return null;
  }
};
