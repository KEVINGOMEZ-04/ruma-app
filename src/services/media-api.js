/**
 * ruma 🌟 — Servicios de Entretenimiento (TMDb, iTunes y Links a Spotify / YouTube / Apple Music)
 */

import { CONFIG } from '../core/config.js';

const tmdbCache = new Map();

export const MediaService = {
  async fetchTmdb(endpoint) {
    if (tmdbCache.has(endpoint)) {
      return tmdbCache.get(endpoint);
    }

    const keys = [...new Set([
      CONFIG.tmdb.apiKey,
      ...(CONFIG.tmdb.backupKeys || [])
    ].filter(Boolean))];

    for (const key of keys) {
      try {
        const sep = endpoint.includes('?') ? '&' : '?';
        const url = `${CONFIG.tmdb.baseUrl}${endpoint}${sep}api_key=${key}&language=${CONFIG.tmdb.language}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          tmdbCache.set(endpoint, data);
          return data;
        }
      } catch (err) {
        console.warn('TMDb fallback warning:', err);
      }
    }
    return null;
  },

  async searchMovies(query) {
    if (!query || !query.trim()) return [];
    const data = await this.fetchTmdb(`/search/movie?query=${encodeURIComponent(query.trim())}&page=1`);
    if (!data || !Array.isArray(data.results)) return [];
    return data.results.slice(0, 8).map(m => ({
      tmdbId: m.id,
      title: m.title,
      year: m.release_date ? m.release_date.split('-')[0] : '',
      overview: m.overview || 'Sin sinopsis disponible.',
      poster: m.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${m.poster_path}` : 'assets/ruma_icon_512.png',
      voteAverage: m.vote_average ? Number(m.vote_average).toFixed(1) : '8.0'
    }));
  },

  async searchSeries(query) {
    if (!query || !query.trim()) return [];
    const data = await this.fetchTmdb(`/search/tv?query=${encodeURIComponent(query.trim())}&page=1`);
    if (!data || !Array.isArray(data.results)) return [];
    return data.results.slice(0, 8).map(s => ({
      tmdbId: s.id,
      title: s.name,
      year: s.first_air_date ? s.first_air_date.split('-')[0] : '',
      overview: s.overview || 'Sin sinopsis disponible.',
      poster: s.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${s.poster_path}` : 'assets/ruma_icon_512.png',
      voteAverage: s.vote_average ? Number(s.vote_average).toFixed(1) : '8.2'
    }));
  },

  async searchSongs(query) {
    if (!query || !query.trim()) return [];
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query.trim())}&media=music&entity=song&limit=8&country=ES`;
      const res = await fetch(url);
      const data = await res.json();
      return (data.results || []).map(item => ({
        itunesId: item.trackId,
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName || '',
        artwork: (item.artworkUrl100 || '').replace('100x100bb', '500x500bb') || 'assets/ruma_icon_512.png',
        appleMusicUrl: item.trackViewUrl || this.getAppleMusicUrl(item.trackName, item.artistName),
        spotifyUrl: this.getSpotifyUrl(item.trackName, item.artistName),
        youtubeUrl: this.getYoutubeUrl(item.trackName, item.artistName)
      }));
    } catch (err) {
      console.warn('Error buscando canciones en iTunes:', err);
      return [];
    }
  },

  getSpotifyUrl(title, artist) {
    return `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`;
  },

  getYoutubeUrl(title, artist) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`;
  },

  getAppleMusicUrl(title, artist) {
    return `https://music.apple.com/es/search?term=${encodeURIComponent(`${title} ${artist}`)}`;
  }
};
