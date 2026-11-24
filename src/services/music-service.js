/**
 * ruma 🌟 — Servicio de Música, Búsqueda en Vivo y Reproductor Global Colaborativo
 *
 * Características acopladas con LUMA:
 * 1. Búsqueda instantánea en vivo mientras el usuario escribe (nombre, artista o letra).
 * 2. Reproductor de fragmentos oficiales de 30 segundos (vía CDN de Apple) con barra global flotante.
 * 3. Controles de Anterior / Play-Pause / Siguiente / Barra de progreso interactiva.
 * 4. Enlaces directos hacia Spotify, YouTube y Apple Music.
 * 5. Obtención de letras completas desde LRCLIB.
 */

let sharedAudio = null;
let currentPlayingId = null;
let currentPlayingTrack = null;
let currentUpdateCallback = null;
let playlistTracks = [];
let globalListeners = [];

function notifyGlobalPlayer() {
  const state = MusicService.getPlayerState();
  globalListeners.forEach(fn => {
    try { fn(state); } catch (_) {}
  });
  renderFloatingPlayerBar(state);
}

function getSharedAudio() {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'none';

    sharedAudio.addEventListener('timeupdate', () => {
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

    sharedAudio.addEventListener('play', () => notifyGlobalPlayer());
    sharedAudio.addEventListener('pause', () => notifyGlobalPlayer());

    sharedAudio.addEventListener('ended', () => {
      const prevId = currentPlayingId;
      if (typeof currentUpdateCallback === 'function') {
        currentUpdateCallback({
          trackId: prevId,
          currentTime: 0,
          duration: 30,
          isPlaying: false
        });
      }
      // Si hay una playlist activa con varias canciones con preview, pasar a la siguiente
      const playable = playlistTracks.filter(t => t && t.previewUrl);
      if (playable.length > 1 && currentPlayingId) {
        const idx = playable.findIndex(t => t.id === currentPlayingId);
        if (idx >= 0) {
          const next = playable[(idx + 1) % playable.length];
          MusicService.playTrack(next);
          return;
        }
      }
      currentPlayingId = null;
      notifyGlobalPlayer();
    });

    sharedAudio.addEventListener('error', (e) => {
      console.warn('Error en la reproducción del fragmento oficial:', e);
      const prevId = currentPlayingId;
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
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ruma-global-music-player';
    bar.className = 'ruma-global-player';
    bar.innerHTML = `
      <div class="ruma-gp-track">
        <img id="ruma-gp-art" src="assets/ruma_icon_192.png" alt="art" class="ruma-gp-art">
        <div class="ruma-gp-meta">
          <div id="ruma-gp-title" class="ruma-gp-title">Canción</div>
          <div id="ruma-gp-artist" class="ruma-gp-artist">Artista</div>
        </div>
      </div>
      <div class="ruma-gp-center">
        <div class="ruma-gp-controls">
          <button type="button" class="ruma-gp-btn" id="ruma-gp-prev" title="Anterior">⏮</button>
          <button type="button" class="ruma-gp-btn ruma-gp-play" id="ruma-gp-toggle" title="Reproducir / Pausar">▶</button>
          <button type="button" class="ruma-gp-btn" id="ruma-gp-next" title="Siguiente">⏭</button>
        </div>
        <div class="ruma-gp-progress-row">
          <span id="ruma-gp-cur">0:00</span>
          <div class="ruma-gp-bar" id="ruma-gp-bar">
            <div class="ruma-gp-fill" id="ruma-gp-fill"></div>
          </div>
          <span id="ruma-gp-dur">0:30</span>
        </div>
      </div>
      <button type="button" class="ruma-gp-close" id="ruma-gp-close" title="Cerrar reproductor">✕</button>
    `;
    document.body.appendChild(bar);

    document.getElementById('ruma-gp-toggle')?.addEventListener('click', () => {
      if (state.track) MusicService.toggleTrack(state.track);
    });
    document.getElementById('ruma-gp-prev')?.addEventListener('click', () => MusicService.playPrev());
    document.getElementById('ruma-gp-next')?.addEventListener('click', () => MusicService.playNext());
    document.getElementById('ruma-gp-close')?.addEventListener('click', () => MusicService.stopPreview());
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
  const art = document.getElementById('ruma-gp-art');
  const title = document.getElementById('ruma-gp-title');
  const artist = document.getElementById('ruma-gp-artist');
  const toggle = document.getElementById('ruma-gp-toggle');
  const fill = document.getElementById('ruma-gp-fill');
  const curEl = document.getElementById('ruma-gp-cur');
  const durEl = document.getElementById('ruma-gp-dur');

  if (art && art.getAttribute('src') !== (state.track.artwork || 'assets/ruma_icon_192.png')) {
    art.src = state.track.artwork || 'assets/ruma_icon_192.png';
  }
  if (title) title.textContent = state.track.title || 'Canción';
  if (artist) artist.textContent = state.track.artist || 'Artista';
  if (toggle) toggle.textContent = state.isPlaying ? '⏸' : '▶';

  const cur = Math.floor(state.currentTime || 0);
  const dur = Math.floor(state.duration || 30);
  const pct = dur > 0 ? Math.min(100, (state.currentTime / dur) * 100) : 0;
  if (fill) fill.style.width = `${pct}%`;
  if (curEl) curEl.textContent = `0:${String(cur).padStart(2, '0')}`;
  if (durEl) durEl.textContent = `0:${String(dur).padStart(2, '0')}`;
}

export const MusicService = {
  setPlaylist(tracks = []) {
    playlistTracks = Array.isArray(tracks) ? tracks : [];
  },

  subscribe(fn) {
    globalListeners.push(fn);
  },

  getPlayerState() {
    const audio = sharedAudio;
    return {
      trackId: currentPlayingId,
      track: currentPlayingTrack,
      isPlaying: Boolean(audio && !audio.paused && currentPlayingId),
      currentTime: audio ? (audio.currentTime || 0) : 0,
      duration: audio && audio.duration ? audio.duration : 30
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

  playTrack(track, onUpdate = null) {
    if (!track || !track.previewUrl) return { error: 'Sin preview disponible' };
    currentPlayingTrack = track;
    return this.togglePreview(track.id, track.previewUrl, onUpdate, track);
  },

  toggleTrack(track, onUpdate = null) {
    if (!track) return { isPlaying: false };
    currentPlayingTrack = track;
    return this.togglePreview(track.id, track.previewUrl, onUpdate, track);
  },

  playNext() {
    const playable = playlistTracks.filter(t => t && t.previewUrl);
    if (playable.length === 0) return;
    const idx = playable.findIndex(t => t.id === currentPlayingId);
    const next = playable[(idx + 1) % playable.length];
    if (next) this.playTrack(next, currentUpdateCallback);
  },

  playPrev() {
    const playable = playlistTracks.filter(t => t && t.previewUrl);
    if (playable.length === 0) return;
    const idx = playable.findIndex(t => t.id === currentPlayingId);
    const prev = playable[(idx - 1 + playable.length) % playable.length];
    if (prev) this.playTrack(prev, currentUpdateCallback);
  },

  togglePreview(trackId, previewUrl, onUpdate = null, trackMeta = null) {
    if (!previewUrl) return { error: 'No hay fragmento disponible para este tema.' };

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
