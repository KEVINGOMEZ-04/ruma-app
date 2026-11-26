/**
 * ruma 🌟 — Servicios de Entretenimiento (TMDb, iTunes, LRCLIB y Plataformas de Streaming)
 * Portado y acoplado con todas las capacidades completas de LUMA (detalles, tráiler, fotogramas,
 * dónde ver, temporadas, capítulos con sinopsis/duración/miniaturas y letras).
 */

import { CONFIG } from '../core/config.js';

const tmdbCache = new Map();

export const TMDB_GENRES = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia ficción',
  10770: 'Película de TV',
  53: 'Suspense',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y Aventura',
  10765: 'Sci-Fi y Fantasía',
  10768: 'Guerra y Política'
};

export const PRELOADED_SERIES_EPISODES = {
  // Arcane (TMDb 94605 / ser_demo_1)
  '94605': {
    1: [
      { seasonNumber: 1, episodeNumber: 1, name: 'Bienvenidos al terreno de juego', overview: 'Las hermanas huérfanas Vi y Powder propagan el caos por las calles subterráneas de Zaun después de dar un golpe en la acomodada Piltover.', duration: '44 min', still: 'https://image.tmdb.org/t/p/w500/g7dMkFJvJECDYoL0TRzGQCfF3xD.jpg' },
      { seasonNumber: 1, episodeNumber: 2, name: 'Algunos misterios es mejor no resolverlos', overview: 'El inventor idealista Jayce intenta aprovechar la magia a través de la ciencia pese a las advertencias de su mentor. El jefe criminal Silco prueba una poderosa sustancia.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/1uubdoW7nPtpYS6T59COLEKDB7A.jpg' },
      { seasonNumber: 1, episodeNumber: 3, name: 'La violencia mínima necesaria para el cambio', overview: 'Un enfrentamiento épico entre dos viejos rivales tiene como resultado un momento fatídico para Zaun. Jayce y Viktor lo arriesgan todo en nombre de su investigación.', duration: '45 min', still: 'https://image.tmdb.org/t/p/w500/zCc7AEH53aH8r61F5f9DkIQGeZC.jpg' },
      { seasonNumber: 1, episodeNumber: 4, name: '¡Feliz Día del Progreso!', overview: 'Mientras Piltover prospera gracias a su tecnología, Jayce y Viktor sopesan sus próximos pasos. Una cara conocida de Zaun reaparece para causar estragos.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/b0EGdWDOFxbhaGwlJ11vO2h0az6.jpg' },
      { seasonNumber: 1, episodeNumber: 5, name: 'Todos quieren ser mis enemigos', overview: 'Caitlyn, una vigilante rebelde, recorre la ciudad subterránea en busca de Silco. Jayce se convierte en objetivo al intentar acabar con la corrupción en Piltover.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/72Ti7nTKEAPgx4VSggb1ksl31rm.jpg' },
      { seasonNumber: 1, episodeNumber: 6, name: 'Cuando estas paredes se derrumben', overview: 'Un protegido sabotea a su mentor en el Consejo mientras una tecnología mágica evoluciona a gran velocidad. Con las autoridades tras ella, Jinx debe afrontar su pasado.', duration: '43 min', still: 'https://image.tmdb.org/t/p/w500/sPpQYLgoSZ8UXai20CSEABG9rFz.jpg' },
      { seasonNumber: 1, episodeNumber: 7, name: 'El pequeño salvador', overview: 'Tras reunirse con un aliado en las calles de Zaun, Caitlyn y Vi se ven las caras con una enemiga común durante una frenética pelea. Viktor toma una dura decisión.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/ieYvkXKqOuIYcBps7COg8w6rJyN.jpg' },
      { seasonNumber: 1, episodeNumber: 8, name: 'Aceite y agua', overview: 'La heredera desterrada Mel y su madre, de visita, intercambian tácticas de combate. Caitlyn y Vi forjan una inesperada alianza. Jinx se somete a un cambio impactante.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/vYIBscxveNMkxFNTcPZ6YoF6fdU.jpg' },
      { seasonNumber: 1, episodeNumber: 9, name: 'El monstruo que creaste', overview: 'Al borde de la guerra, los líderes de Piltover y Zaun llegan a un punto crítico. Pero un fatídico enfrentamiento cambia las dos ciudades para siempre.', duration: '42 min', still: 'https://image.tmdb.org/t/p/w500/3mSWRynTvvE2IYJ6sI47m8V77Jq.jpg' }
    ],
    2: [
      { seasonNumber: 2, episodeNumber: 1, name: 'El peso de la corona', overview: 'Vi y Caitlyn buscan la mejor forma de responder tras una terrible tragedia que se cobra vidas y aumenta la tensión entre las ciudades hermanas.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/AKzTyLJkQEuftVNIuh0gcJCbDl.jpg' },
      { seasonNumber: 2, episodeNumber: 2, name: 'Ver como todo arde', overview: 'Piltover está lista para la guerra y la ciudad subterránea baraja sus opciones. Jinx pasa desapercibida y planea su próxima acción. Tiene lugar una conversación crucial.', duration: '40 min', still: 'https://image.tmdb.org/t/p/w500/z2MSNefctJYAYGdPJQUcxRcZWTh.jpg' },
      { seasonNumber: 2, episodeNumber: 3, name: 'Por fin te aprendes mi nombre', overview: 'Caitlyn intensifica su búsqueda de Jinx. Ambessa acepta un fatídico encuentro. Los cambios en Zaun resultan en un descubrimiento impactante.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/yXD0EtrlnupXne4R9XHFPkGMxJr.jpg' },
      { seasonNumber: 2, episodeNumber: 4, name: 'Pintad la ciudad de azul', overview: 'Cuando revolotean rumores del regreso de Jinx, Ambessa persigue su objetivo con renovado entusiasmo. Jinx y Sevika se infiltran de incógnito en el vientre de la bestia.', duration: '40 min', still: 'https://image.tmdb.org/t/p/w500/ktXtr0O2WF10Z2r89Xjds4owCXX.jpg' },
      { seasonNumber: 2, episodeNumber: 5, name: 'Ampollas y rocas', overview: 'Vi se despierta con una noticia sorprendente. Una reunión inquietante resulta no ser lo que parece. Caitlyn descubre los orígenes del Shimmer.', duration: '43 min', still: 'https://image.tmdb.org/t/p/w500/3mhMhwHlZQQiB2otufCLZteRPMZ.jpg' },
      { seasonNumber: 2, episodeNumber: 6, name: 'El mensaje escondido dentro del patrón', overview: 'La cura viene de una cara familiar, en un lugar desconocido. Una traición impactante amenaza con cambiar muchas vidas.', duration: '40 min', still: 'https://image.tmdb.org/t/p/w500/A6A6HWu0TjMRcNW31glNuZvVfxp.jpg' },
      { seasonNumber: 2, episodeNumber: 7, name: 'Finjamos que es la primera vez', overview: 'Un momento de oscuridad, un momento de luz... y la visión de lo que pudo haber sido.', duration: '42 min', still: 'https://image.tmdb.org/t/p/w500/sgKSyfB7uor4hSzSsWMEUnMC5SA.jpg' },
      { seasonNumber: 2, episodeNumber: 8, name: 'Matar es un ciclo', overview: 'Se avecina una tormenta que desencadena una serie de transformaciones sorprendentes. En otro lugar, la llama de la rebelión sigue ardiendo.', duration: '41 min', still: 'https://image.tmdb.org/t/p/w500/vqoFpOXDGEEsgkD10QhopOQYoN3.jpg' },
      { seasonNumber: 2, episodeNumber: 9, name: 'La suciedad bajo tus uñas', overview: 'Magia. Ciencia. Poder. Venganza. Los destinos colisionan y desencadenan una guerra sin precedentes en un episodio final épico.', duration: '51 min', still: 'https://image.tmdb.org/t/p/w500/7wYoQZAdbB6e3CFDDYvxQY1sM7.jpg' }
    ]
  }
};
PRELOADED_SERIES_EPISODES['ser_demo_1'] = PRELOADED_SERIES_EPISODES['94605'];

export const MediaService = {
  getGenreNames(genreIds) {
    if (!Array.isArray(genreIds)) return '';
    return genreIds
      .map(id => TMDB_GENRES[id])
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
  },

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
          if (tmdbCache.size >= 120) {
            const firstKey = tmdbCache.keys().next().value;
            if (firstKey !== undefined) tmdbCache.delete(firstKey);
          }
          tmdbCache.set(endpoint, data);
          return data;
        }
        // Si TMDb responde 404 (no existe), no desperdiciar reintentos con claves de respaldo
        if (res.status === 404) return null;
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
    return data.results.slice(0, 10).map(m => ({
      tmdbId: m.id,
      title: m.title,
      originalTitle: m.original_title || m.title,
      year: m.release_date ? m.release_date.split('-')[0] : '',
      overview: m.overview || 'Sin sinopsis disponible.',
      poster: m.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${m.poster_path}` : 'assets/ruma_icon_512.png',
      backdrop: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : '',
      voteAverage: m.vote_average ? Number(m.vote_average).toFixed(1) : '8.5',
      genres: this.getGenreNames(m.genre_ids) || 'Cine',
      genreIds: m.genre_ids || []
    }));
  },

  /**
   * Convierte la respuesta de TMDb `/watch/providers` (datos reales de JustWatch)
   * en una lista normalizada de plataformas. Prioriza países hispanohablantes.
   */
  extractWatchProviders(wpData, fallbackNetworks = []) {
    const results = (wpData && wpData.results) || {};
    const hasAny = c => results[c] && (results[c].flatrate || results[c].free || results[c].ads || results[c].rent || results[c].buy);
    const priorityCountries = ['CO', 'MX', 'ES', 'AR', 'CL', 'PE', 'US'];
    let country = priorityCountries.find(hasAny) || Object.keys(results).find(hasAny) || '';
    const countryData = country ? results[country] : null;
    const providersMap = new Map();
    const logoUrl = path => (path ? `https://image.tmdb.org/t/p/w92${path}` : '');

    const add = (list, type) => {
      (list || []).forEach(p => {
        const existing = providersMap.get(p.provider_id);
        if (existing) {
          if (!existing.types.includes(type)) existing.types.push(type);
          return;
        }
        providersMap.set(p.provider_id, {
          id: p.provider_id,
          name: p.provider_name,
          logo: logoUrl(p.logo_path),
          type,
          types: [type],
          priority: p.display_priority ?? 99
        });
      });
    };

    if (countryData) {
      add(countryData.flatrate, 'Suscripción');
      add(countryData.free, 'Gratis');
      add(countryData.ads, 'Gratis con anuncios');
      add(countryData.rent, 'Alquiler');
      add(countryData.buy, 'Compra');
    }

    let providers = Array.from(providersMap.values());
    const typeOrder = { 'Suscripción': 0, 'Gratis': 1, 'Gratis con anuncios': 2, 'Alquiler': 3, 'Compra': 4 };
    providers.sort((a, b) => (typeOrder[a.type] - typeOrder[b.type]) || (a.priority - b.priority));

    // Cadenas/plataformas de origen (series): Netflix, HBO, Disney+, etc.
    const networks = (fallbackNetworks || []).map(n => ({
      id: `net_${n.id}`,
      name: n.name,
      logo: logoUrl(n.logo_path),
      type: 'Cadena original',
      types: ['Cadena original']
    }));

    if (providers.length === 0 && networks.length > 0) {
      providers = networks;
    }

    return {
      country: country || null,
      link: (countryData && countryData.link) || '',
      providers,
      networks,
      updatedAt: Date.now()
    };
  },

  _trailerFrom(videos) {
    if (!videos || !Array.isArray(videos.results)) return '';
    const list = videos.results.filter(v => v.site === 'YouTube');
    const trailer = list.find(v => v.type === 'Trailer') || list.find(v => v.type === 'Teaser') || list[0];
    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : '';
  },

  async getMovieDetails(tmdbId) {
    if (!tmdbId) return null;
    try {
      const data = await this.fetchTmdb(`/movie/${tmdbId}?append_to_response=images,videos,watch/providers,credits&include_image_language=es,en,null&include_video_language=es,en`);
      if (!data) return null;

      const hours = data.runtime ? Math.floor(data.runtime / 60) : 0;
      const mins = data.runtime ? data.runtime % 60 : 0;
      const durationFormatted = hours > 0 ? `${hours}h ${mins}m` : (mins > 0 ? `${mins}m` : '');
      const genresFormatted = (data.genres || []).map(g => g.name).slice(0, 3).join(', ');

      const gallery = ((data.images && data.images.backdrops) || [])
        .slice(0, 8)
        .map(img => `https://image.tmdb.org/t/p/w780${img.file_path}`);

      const crew = (data.credits && Array.isArray(data.credits.crew)) ? data.credits.crew : [];
      const directors = crew.filter(c => c.job === 'Director' && c.name).map(c => c.name).slice(0, 2);
      const castList = (data.credits && Array.isArray(data.credits.cast))
        ? data.credits.cast.filter(c => c.name).slice(0, 6).map(c => c.name)
        : [];

      return {
        tmdbId: data.id,
        title: data.title,
        originalTitle: data.original_title,
        year: data.release_date ? data.release_date.split('-')[0] : '',
        duration: durationFormatted,
        runtimeMinutes: data.runtime || 0,
        genres: genresFormatted || 'Cine',
        director: directors.join(', '),
        cast: castList.join(', '),
        overview: data.overview || 'Sin sinopsis disponible.',
        tagline: data.tagline || '',
        poster: data.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${data.poster_path}` : 'assets/ruma_icon_512.png',
        backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
        voteAverage: data.vote_average ? Number(data.vote_average).toFixed(1) : '',
        gallery,
        trailerUrl: this._trailerFrom(data.videos),
        watchProviders: this.extractWatchProviders(data['watch/providers']),
        detailsHydrated: true
      };
    } catch (err) {
      console.warn('Error getMovieDetails:', err);
      return null;
    }
  },

  async getMovieWatchProviders(tmdbId) {
    if (!tmdbId) return null;
    try {
      const data = await this.fetchTmdb(`/movie/${tmdbId}/watch/providers`);
      if (!data) return null;
      return this.extractWatchProviders(data);
    } catch (err) {
      console.warn('Error getMovieWatchProviders:', err);
      return null;
    }
  },

  async getSeriesWatchProviders(tmdbId) {
    if (!tmdbId) return null;
    try {
      const [wp, base] = await Promise.all([
        this.fetchTmdb(`/tv/${tmdbId}/watch/providers`),
        this.fetchTmdb(`/tv/${tmdbId}`)
      ]);
      if (!wp && !base) return null;
      return this.extractWatchProviders(wp, (base && base.networks) || []);
    } catch (err) {
      console.warn('Error getSeriesWatchProviders:', err);
      return null;
    }
  },

  async searchSeries(query) {
    if (!query || !query.trim()) return [];
    const data = await this.fetchTmdb(`/search/tv?query=${encodeURIComponent(query.trim())}&page=1`);
    if (!data || !Array.isArray(data.results)) return [];
    return data.results.slice(0, 10).map(s => ({
      tmdbId: s.id,
      title: s.name,
      originalTitle: s.original_name || s.name,
      year: s.first_air_date ? s.first_air_date.split('-')[0] : '',
      overview: s.overview || 'Sin sinopsis disponible.',
      poster: s.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${s.poster_path}` : 'assets/ruma_icon_512.png',
      backdrop: s.backdrop_path ? `https://image.tmdb.org/t/p/w1280${s.backdrop_path}` : '',
      voteAverage: s.vote_average ? Number(s.vote_average).toFixed(1) : '',
      genres: this.getGenreNames(s.genre_ids) || 'Drama, Serie'
    }));
  },

  async getSeriesDetails(seriesId) {
    if (!seriesId) return null;
    try {
      const data = await this.fetchTmdb(`/tv/${seriesId}?append_to_response=watch/providers,videos&include_video_language=es,en`);
      if (!data) return null;

      const firstYear = data.first_air_date ? data.first_air_date.split('-')[0] : '';
      const lastYear = data.last_air_date ? data.last_air_date.split('-')[0] : '';
      const inProduction = data.in_production || data.status === 'Returning Series';
      const yearsFormatted = firstYear
        ? (inProduction ? `${firstYear}–` : (lastYear && lastYear !== firstYear ? `${firstYear}–${lastYear}` : firstYear))
        : '';
      const genresFormatted = (data.genres || []).map(g => g.name).slice(0, 3).join(', ');

      const watchProviders = this.extractWatchProviders(data['watch/providers'], data.networks || []);
      const platform = (watchProviders.providers[0] && watchProviders.providers[0].name)
        || (data.networks && data.networks[0] && data.networks[0].name)
        || 'Streaming';

      const mapSeason = s => ({
        seasonNumber: s.season_number,
        name: s.name || (s.season_number === 0 ? 'Especiales' : `Temporada ${s.season_number}`),
        episodeCount: s.episode_count || 0,
        overview: s.overview || '',
        airDate: s.air_date || '',
        poster: s.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${s.poster_path}` : ''
      });

      // Temporadas regulares (las "Especiales" / temporada 0 se listan aparte)
      let seasons = (data.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0).map(mapSeason);
      const specials = (data.seasons || []).filter(s => s.season_number === 0 && s.episode_count > 0).map(mapSeason);
      if (seasons.length === 0 && specials.length > 0) {
        seasons = specials.slice();
      }

      const totalEpisodes = seasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0);
      const lastEp = data.last_episode_to_air;
      const nextEp = data.next_episode_to_air;

      return {
        tmdbId: data.id,
        title: data.name,
        originalTitle: data.original_name,
        year: firstYear,
        years: yearsFormatted,
        status: data.status || '',
        inProduction: !!inProduction,
        genres: genresFormatted || 'Drama, Serie',
        overview: data.overview || 'Sin sinopsis disponible.',
        tagline: data.tagline || '',
        platform,
        watchProviders,
        trailerUrl: this._trailerFrom(data.videos),
        poster: data.poster_path ? `${CONFIG.tmdb.imageBaseUrl}${data.poster_path}` : 'assets/ruma_icon_512.png',
        backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
        numberOfSeasons: seasons.length || data.number_of_seasons || 1,
        totalEpisodes: totalEpisodes || data.number_of_episodes || 1,
        episodeRuntime: (data.episode_run_time && data.episode_run_time[0]) || null,
        voteAverage: data.vote_average ? Number(data.vote_average).toFixed(1) : '',
        lastEpisode: lastEp ? { season: lastEp.season_number, episode: lastEp.episode_number, name: lastEp.name, airDate: lastEp.air_date } : null,
        nextEpisode: nextEp ? { season: nextEp.season_number, episode: nextEp.episode_number, name: nextEp.name, airDate: nextEp.air_date } : null,
        seasons,
        specials
      };
    } catch (err) {
      console.warn('Error getSeriesDetails:', err);
      return null;
    }
  },

  async getSeasonEpisodes(seriesId, seasonNumber = 1) {
    if (!seriesId) return [];
    const preloaded = PRELOADED_SERIES_EPISODES[String(seriesId)]?.[seasonNumber];
    try {
      const data = await this.fetchTmdb(`/tv/${seriesId}/season/${seasonNumber}`);
      if (!data || !Array.isArray(data.episodes)) {
        return preloaded || [];
      }

      return data.episodes.map(ep => ({
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number || seasonNumber,
        name: ep.name || `Capítulo ${ep.episode_number}`,
        overview: ep.overview || 'Sin descripción disponible para este capítulo.',
        duration: ep.runtime ? `${ep.runtime} min` : '',
        runtimeMinutes: ep.runtime || 0,
        still: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : 'assets/ruma_icon_512.png',
        airDate: ep.air_date || '',
        voteAverage: ep.vote_average ? Number(ep.vote_average).toFixed(1) : '',
        isReal: true
      }));
    } catch (err) {
      console.warn(`Error getSeasonEpisodes (${seriesId} S${seasonNumber}):`, err);
      return preloaded || [];
    }
  },

  /**
   * Descarga en paralelo TODOS los capítulos reales de todas las temporadas.
   * Devuelve { [seasonNumber]: Episode[] }
   */
  async getAllSeasonsEpisodes(seriesId, seasons = []) {
    const out = {};
    const nums = seasons.map(s => (typeof s === 'number' ? s : s.seasonNumber)).filter(n => n !== undefined);
    const chunk = 4;
    for (let i = 0; i < nums.length; i += chunk) {
      const slice = nums.slice(i, i + chunk);
      const res = await Promise.all(slice.map(n => this.getSeasonEpisodes(seriesId, n)));
      slice.forEach((n, idx) => { out[n] = res[idx] || []; });
    }
    return out;
  },

  async fetchLyrics(artist, title) {
    if (!artist || !title) return null;
    try {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      return data.plainLyrics || data.syncedLyrics || null;
    } catch (_) {
      return null;
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
