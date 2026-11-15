/**
 * ruma 🌟 — Servicio de Música, Búsqueda en Vivo y Reproductor de Fragmentos Legales
 *
 * Características:
 * 1. Búsqueda instantánea en vivo mientras el usuario escribe (nombre, artista o letra).
 * 2. Reproductor de fragmentos oficiales de 30 segundos (vía CDN de Apple)
 *    - 100% legal, sin problemas de derechos de autor ni licencias comerciales.
 * 3. Enlaces directos hacia Spotify, YouTube y Apple Music.
 * 4. Control singleton: reproducir una canción pausa automáticamente cualquier otra.
 */

let sharedAudio = null;
let currentPlayingId = null;
let currentUpdateCallback = null;

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
    });

    sharedAudio.addEventListener('ended', () => {
      const prevId = currentPlayingId;
      currentPlayingId = null;
      if (typeof currentUpdateCallback === 'function') {
        currentUpdateCallback({
          trackId: prevId,
          currentTime: 0,
          duration: 30,
          isPlaying: false
        });
      }
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
    });
  }
  return sharedAudio;
}

export const MusicService = {
  /**
   * Búsqueda en tiempo real de canciones por título, artista o fragmento de letra
   */
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
          album: item.collectionName || '',
          artwork: artworkHighRes || item.artworkUrl100 || '',
          previewUrl: item.previewUrl || '', // Fragmento oficial de 30 segundos
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

  /**
   * Genera el enlace de búsqueda directa en la app de Spotify
   */
  buildSpotifyUrl(title, artist) {
    return `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;
  },

  /**
   * Genera el enlace de búsqueda directa en YouTube
   */
  buildYoutubeUrl(title, artist) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist} audio oficial`)}`;
  },

  /**
   * Genera el enlace de búsqueda directa en Apple Music
   */
  buildAppleMusicUrl(title, artist) {
    return `https://music.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}`;
  },

  /**
   * Reproduce o pausa el fragmento oficial de 30 segundos de una canción
   * @param {string} trackId - ID único de la canción
   * @param {string} previewUrl - URL oficial del fragmento provista por Apple CDN
   * @param {Function} onUpdate - Callback con estado (currentTime, duration, isPlaying)
   */
  togglePreview(trackId, previewUrl, onUpdate = null) {
    if (!previewUrl) return { error: 'No hay fragmento disponible para este tema.' };

    const audio = getSharedAudio();
    currentUpdateCallback = onUpdate;

    // Si ya se está reproduciendo este mismo tema, pausar/reanudar
    if (currentPlayingId === trackId) {
      if (audio.paused) {
        audio.play().catch(console.warn);
        return { isPlaying: true, trackId };
      } else {
        audio.pause();
        return { isPlaying: false, trackId };
      }
    }

    // Si es un tema diferente, detener el anterior e iniciar el nuevo
    audio.pause();
    audio.currentTime = 0;
    audio.src = previewUrl;
    currentPlayingId = trackId;

    audio.play().catch((err) => {
      console.warn('Reproducción de fragmento bloqueada por el navegador:', err);
    });

    return { isPlaying: true, trackId };
  },

  /**
   * Detiene la reproducción de cualquier fragmento en curso
   */
  stopPreview() {
    const audio = getSharedAudio();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    const prevId = currentPlayingId;
    currentPlayingId = null;
    return prevId;
  },

  /**
   * Devuelve el ID de la canción que está sonando actualmente (o null)
   */
  getCurrentPlayingId() {
    const audio = getSharedAudio();
    if (audio && !audio.paused) return currentPlayingId;
    return null;
  }
};
