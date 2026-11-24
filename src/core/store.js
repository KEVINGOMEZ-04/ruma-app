/**
 * ruma 🌟 — Motor Central de Estado, Persistencia Multi-Grupo y Cuentas
 * Acoplado con todas las funciones completas de LUMA para Películas, Series, Recuerdos y Música.
 */

import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Entitlements } from './entitlements.js';
import { DriveBridge } from '../services/drive-bridge.js';
import { GoogleAuth } from '../services/google-auth.js';
import { PRELOADED_SERIES_EPISODES } from '../services/media-api.js';

const DEMO_USERS = [
  {
    id: 'usr_kevin',
    name: 'Kevin Gómez',
    username: 'kevin',
    email: 'kevin@ruma.app',
    phone: '3001234567',
    password: '123',
    avatar: 'assets/ruma_icon_512.png',
    frameId: 'frame-axolotl',
    bannerColor: '#7C3AED',
    bio: '✨ Creando recuerdos en ruma',
    showcaseIds: ['mov_demo_1', 'ser_demo_1'],
    isPremium: false
  },
  {
    id: 'usr_laura',
    name: 'Laura',
    username: 'laura',
    email: 'laura@ruma.app',
    phone: '3007654321',
    password: '123',
    avatar: 'assets/ruma_mascot.png',
    frameId: 'frame-celestial',
    bannerColor: '#EC4899',
    bio: '🎬 Amante del cine y los viajes',
    showcaseIds: ['mov_demo_1', 'mov_demo_2'],
    isPremium: false
  }
];

const DEMO_GROUPS = [
  {
    id: 'grp_santuario_1',
    name: 'Nuestro Refugio ✨',
    code: 'RUMA01',
    description: 'Recuerdos, cine, series y música compartida.',
    plan: 'free', // 'free' | 'premium'
    creatorId: 'usr_kevin',
    driveFolderUrl: 'https://drive.google.com/drive/folders/1RumaDemoFolderPublicEditor',
    accentColor: 'purple',
    createdAt: '2026-11-01T12:00:00.000Z',
    members: [
      { id: 'usr_kevin', name: 'Kevin Gómez', username: 'kevin', avatar: 'assets/ruma_icon_512.png', frameId: 'frame-axolotl', role: 'admin' },
      { id: 'usr_laura', name: 'Laura', username: 'laura', avatar: 'assets/ruma_mascot.png', frameId: 'frame-celestial', role: 'member' }
    ],
    memories: [
      {
        id: 'mem_demo_1',
        title: 'Tarde de Mirador y Café',
        date: '2026-11-15',
        location: 'Mirador de Las Palmas',
        auraColor: '#A855F7',
        isFeatured: true,
        subfolderName: 'Tarde de Mirador y Café - Domingo 15 de noviembre de 2026',
        driveUrl: 'https://drive.google.com/drive/folders/1RumaDemoFolderPublicEditor',
        description: 'Viendo el atardecer morado con la mejor compañía, tomando café caliente y escuchando nuestra playlist.',
        authorId: 'usr_kevin',
        authorName: 'Kevin Gómez',
        authorAvatar: 'assets/ruma_icon_512.png',
        coverPreview: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
        photos: [
          'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
          'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=800&q=80'
        ],
        filesCount: 2,
        song: {
          id: 'sng_demo_1',
          title: 'Sweater Weather',
          artist: 'The Neighbourhood',
          artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
          previewUrl: ''
        },
        voiceNote: null,
        comments: [
          {
            id: 'mcom_1',
            authorId: 'usr_laura',
            authorName: 'Laura',
            authorAvatar: 'assets/ruma_mascot.png',
            text: 'Uno de mis días favoritos del año 💜',
            createdAt: '2026-11-15T19:00:00.000Z'
          }
        ]
      }
    ],
    plans: [
      {
        id: 'pln_demo_1',
        title: 'Noche de Cine & Pizza Casera',
        date: '2026-11-28',
        time: '20:00',
        note: 'Ver el final de temporada de Arcane',
        authorName: 'Kevin Gómez'
      }
    ],
    movies: [
      {
        id: 'mov_demo_1',
        tmdbId: 157336,
        title: 'Interstellar',
        year: '2014',
        duration: '2h 49m',
        genres: 'Aventura, Drama, Ciencia ficción',
        tmdbRating: '8.7',
        status: 'Vista',
        priority: 5,
        poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
        backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
        synopsis: 'Un grupo de exploradores viaja a través de un agujero de gusano en el espacio en un intento de asegurar la supervivencia de la humanidad.',
        trailerUrl: 'https://www.youtube.com/watch?v=zSWdZVtXT7E',
        addedBy: 'Kevin Gómez',
        proposedBy: { id: 'usr_kevin', name: 'Kevin Gómez', avatar: 'assets/ruma_icon_512.png', date: '15 Nov 2026' },
        linkedMemories: ['mem_demo_1'],
        ratings: {
          usr_kevin: { score: 9.8, review: 'Obra maestra absoluta, la banda sonora es de otro planeta.' },
          usr_laura: { score: 9.5, review: 'Lloré con la escena de los mensajes.' }
        },
        comments: [
          {
            id: 'mc_demo_1',
            authorId: 'usr_laura',
            authorName: 'Laura',
            authorAvatar: 'assets/ruma_mascot.png',
            text: 'La banda sonora de Hans Zimmer es insuperable 🎹✨',
            time: '15 Nov',
            reactions: { '❤️': 2, '🔥': 1 }
          }
        ]
      },
      {
        id: 'mov_demo_2',
        tmdbId: 122906,
        title: 'Cuestión de Tiempo',
        year: '2013',
        duration: '2h 03m',
        genres: 'Drama, Romance, Comedia',
        tmdbRating: '7.9',
        status: 'Favorita',
        priority: 5,
        poster: 'https://image.tmdb.org/t/p/w500/iR1bVfURbN7r1C46WHFbwCkVve.jpg',
        backdrop: '',
        synopsis: 'Tim descubre que los hombres de su familia pueden viajar en el tiempo y cambiar lo que ocurre en sus propias vidas.',
        trailerUrl: '',
        addedBy: 'Laura',
        proposedBy: { id: 'usr_laura', name: 'Laura', avatar: 'assets/ruma_mascot.png', date: '12 Nov 2026' },
        linkedMemories: [],
        ratings: {
          usr_kevin: { score: 9.2, review: 'Hace valorar cada día cotidiano.' },
          usr_laura: { score: 10, review: 'Mi película favorita para ver juntos.' }
        },
        comments: []
      }
    ],
    series: [
      {
        id: 'ser_demo_1',
        tmdbId: 94605,
        title: 'Arcane',
        year: '2021',
        years: '2021–2024',
        genres: 'Animación, Sci-Fi y Fantasía, Acción',
        platform: 'Netflix',
        status: 'Viendo',
        numberOfSeasons: 2,
        totalEpisodes: 18,
        currentSeason: 2,
        currentEpisode: 4,
        poster: 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg',
        backdrop: 'https://image.tmdb.org/t/p/w1280/q8eejQcg1bAqImEV8jh8RtBD4uH.jpg',
        synopsis: 'En medio del conflicto entre las ciudades gemelas de Piltover y Zaun, dos hermanas luchan en bandos opuestos de una guerra entre tecnologías mágicas y convicciones enfrentadas.',
        addedBy: 'Kevin Gómez',
        proposedBy: { id: 'usr_kevin', name: 'Kevin Gómez', avatar: 'assets/ruma_icon_512.png', date: '10 Nov 2026' },
        seasons: [
          { seasonNumber: 1, name: 'Temporada 1', episodeCount: 9 },
          { seasonNumber: 2, name: 'Temporada 2', episodeCount: 9 }
        ],
        seasonEpisodes: PRELOADED_SERIES_EPISODES['94605'],
        userProgress: {
          usr_kevin: {
            userId: 'usr_kevin',
            userName: 'Kevin Gómez',
            userAvatar: 'assets/ruma_icon_512.png',
            currentSeason: 2,
            currentEpisode: 4,
            lastWatched: { season: 2, episode: 4 },
            status: 'Viendo',
            watchedEpisodes: {
              '1_1': true, '1_2': true, '1_3': true, '1_4': true, '1_5': true, '1_6': true, '1_7': true, '1_8': true, '1_9': true,
              '2_1': true, '2_2': true, '2_3': true, '2_4': true
            }
          },
          usr_laura: {
            userId: 'usr_laura',
            userName: 'Laura',
            userAvatar: 'assets/ruma_mascot.png',
            currentSeason: 2,
            currentEpisode: 3,
            lastWatched: { season: 2, episode: 3 },
            status: 'Viendo',
            watchedEpisodes: {
              '1_1': true, '1_2': true, '1_3': true, '1_4': true, '1_5': true, '1_6': true, '1_7': true, '1_8': true, '1_9': true,
              '2_1': true, '2_2': true, '2_3': true
            }
          }
        },
        ratings: {
          usr_kevin: { score: 9.7, review: 'Animación impecable en cada capítulo.' },
          usr_laura: { score: 9.4, review: 'La historia atrapa desde el episodio 1.' }
        },
        comments: [
          {
            id: 'scom_demo_1',
            userId: 'usr_kevin',
            userName: 'Kevin Gómez',
            userAvatar: 'assets/ruma_icon_512.png',
            userProgressLabel: 'T2 · Cap 4',
            text: '¡El arte visual de la segunda temporada es una locura!',
            date: 'Hace 2 días',
            reactions: { '❤️': 2, '🔥': 3, '😂': 0 }
          }
        ]
      }
    ],
    songs: [
      {
        id: 'sng_demo_1',
        title: 'Sweater Weather',
        artist: 'The Neighbourhood',
        album: 'I Love You.',
        artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
        note: 'La canción que siempre ponemos en carretera 🚗💜',
        addedBy: 'Kevin Gómez',
        authorId: 'usr_kevin',
        authorAvatar: 'assets/ruma_icon_512.png',
        createdAt: '2026-11-15T14:00:00.000Z',
        trackTimeMillis: 240000,
        rating: 5.0,
        ratingCount: 2,
        ratings: { usr_kevin: 5, usr_laura: 5 },
        linkedMemories: ['mem_demo_1'],
        comments: [
          {
            id: 'sc_demo_1',
            authorId: 'usr_laura',
            authorName: 'Laura',
            authorAvatar: 'assets/ruma_mascot.png',
            text: 'Himno oficial de nuestros paseos 🎶',
            time: '15 Nov',
            reactions: { '❤️': 2, '🔥': 1 }
          }
        ],
        spotifyUrl: 'https://open.spotify.com/search/Sweater%20Weather%20The%20Neighbourhood',
        youtubeUrl: 'https://www.youtube.com/results?search_query=Sweater+Weather+The+Neighbourhood',
        appleMusicUrl: 'https://music.apple.com/es/search?term=Sweater%20Weather%20The%20Neighbourhood'
      }
    ],
    goals: [
      {
        id: 'gol_demo_1',
        title: 'Viaje de fin de semana a la montaña',
        category: 'Viajes',
        progress: 70,
        completed: false
      }
    ],
    notes: [
      {
        id: 'not_demo_1',
        title: 'Lista de snacks para maratón',
        category: 'Recordatorio',
        content: 'Palomitas dulces, chocolates y bebidas frías para el viernes.',
        authorName: 'Laura'
      }
    ],
    messages: [
      {
        id: 'msg_demo_1',
        senderId: 'usr_laura',
        senderName: 'Laura',
        text: '¡Mira cómo quedó nuestro recuerdo del domingo!',
        timestamp: '2026-11-15T18:20:00.000Z',
        quote: {
          type: 'memory',
          itemId: 'mem_demo_1',
          label: '📸 Recuerdo',
          title: 'Tarde de Mirador y Café',
          subtitle: 'Domingo 15 de noviembre de 2026',
          thumb: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80'
        }
      },
      {
        id: 'msg_demo_2',
        senderId: 'usr_kevin',
        senderName: 'Kevin Gómez',
        text: '¡Quedó brutal guardado en la carpeta de Drive! Y hoy repetimos esta peli:',
        timestamp: '2026-11-15T18:22:00.000Z',
        quote: {
          type: 'movie',
          itemId: 'mov_demo_1',
          label: '🎬 Película',
          title: 'Interstellar (2014)',
          subtitle: 'Promedio grupal: ⭐ 9.7',
          thumb: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'
        }
      }
    ]
  },
  {
    id: 'grp_comunidad_2',
    name: 'Club de Cine & Amigos 🍿',
    code: 'CINE99',
    description: 'Debates de estrenos y series de fin de semana.',
    plan: 'free',
    creatorId: 'usr_laura',
    driveFolderUrl: 'https://drive.google.com/drive/folders/1ClubCineSharedDriveFolder',
    accentColor: 'pink',
    createdAt: '2026-11-05T15:00:00.000Z',
    members: [
      { id: 'usr_laura', name: 'Laura', username: 'laura', avatar: 'assets/ruma_mascot.png', frameId: 'frame-celestial', role: 'admin' },
      { id: 'usr_kevin', name: 'Kevin Gómez', username: 'kevin', avatar: 'assets/ruma_icon_512.png', frameId: 'frame-axolotl', role: 'member' }
    ],
    memories: [],
    plans: [],
    movies: [],
    series: [],
    songs: [],
    goals: [],
    notes: [],
    messages: []
  }
];

class RumaStore {
  constructor() {
    this.listeners = [];
    this.currentInterface = 'hub'; // 'hub' | 'group' | 'profile' | 'settings'
    this.currentGroupTab = 'memories'; // 'memories' | 'movies' | 'series' | 'music' | 'goals_notes' | 'chat'
    this.inspectedUserId = null;
    this.memoryFilterIds = null; // Permite filtrar recuerdos vinculados desde una canción o película
    this.init();
  }

  init() {
    if (!localStorage.getItem(CONFIG.storageKeys.accounts)) {
      localStorage.setItem(CONFIG.storageKeys.accounts, JSON.stringify(DEMO_USERS));
    }
    if (!localStorage.getItem(CONFIG.storageKeys.groups)) {
      localStorage.setItem(CONFIG.storageKeys.groups, JSON.stringify(DEMO_GROUPS));
    }
    const savedTheme = localStorage.getItem(CONFIG.storageKeys.theme) || 'dark';
    this.setTheme(savedTheme, false);
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  notify() {
    this.listeners.forEach(fn => fn());
  }

  setTheme(theme, emit = true) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(CONFIG.storageKeys.theme, theme);
    if (emit) this.notify();
  }

  getTheme() {
    return localStorage.getItem(CONFIG.storageKeys.theme) || 'dark';
  }

  // --- CUENTAS Y AUTENTICACIÓN TRIPLE ---
  getAccounts() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storageKeys.accounts)) || DEMO_USERS;
    } catch (_) {
      return DEMO_USERS;
    }
  }

  saveAccounts(accounts) {
    localStorage.setItem(CONFIG.storageKeys.accounts, JSON.stringify(accounts));
  }

  getCurrentUser() {
    const id = localStorage.getItem(CONFIG.storageKeys.currentUserId);
    if (!id) return null;
    return this.getAccounts().find(u => u.id === id) || null;
  }

  login(identifier, password) {
    const clean = String(identifier || '').trim().toLowerCase().replace(/^@/, '');
    const accounts = this.getAccounts();
    const user = accounts.find(u =>
      (u.email && u.email.toLowerCase() === clean) ||
      (u.phone && u.phone.replace(/\s+/g, '') === clean) ||
      (u.username && u.username.toLowerCase() === clean)
    );

    if (!user) {
      return { ok: false, error: 'No encontramos una cuenta con ese correo, teléfono o usuario.' };
    }
    if (user.password !== password) {
      return { ok: false, error: 'Contraseña incorrecta.' };
    }

    localStorage.setItem(CONFIG.storageKeys.currentUserId, user.id);
    this.currentInterface = 'hub';
    this.notify();
    return { ok: true, user };
  }

  register({ name, username, email, phone, password }) {
    const accounts = this.getAccounts();
    const cleanUser = String(username || '').trim().toLowerCase().replace(/^@/, '');
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPhone = String(phone || '').trim();

    if (!name || !password || (!cleanUser && !cleanEmail && !cleanPhone)) {
      return { ok: false, error: 'Completa tu nombre, contraseña y al menos un método de acceso.' };
    }

    const exists = accounts.some(u =>
      (cleanUser && u.username?.toLowerCase() === cleanUser) ||
      (cleanEmail && u.email?.toLowerCase() === cleanEmail) ||
      (cleanPhone && u.phone === cleanPhone)
    );
    if (exists) {
      return { ok: false, error: 'Ese correo, teléfono o @usuario ya está registrado.' };
    }

    const newUser = {
      id: Utils.generateId('usr'),
      name: name.trim(),
      username: cleanUser || `user_${Date.now().toString().slice(-4)}`,
      email: cleanEmail,
      phone: cleanPhone,
      password,
      avatar: 'assets/ruma_icon_512.png',
      frameId: 'frame-axolotl',
      bannerColor: '#7C3AED',
      bio: '✨ Nuevo en ruma',
      showcaseIds: [],
      isPremium: false
    };

    accounts.push(newUser);
    this.saveAccounts(accounts);
    localStorage.setItem(CONFIG.storageKeys.currentUserId, newUser.id);
    this.currentInterface = 'hub';
    this.notify();
    return { ok: true, user: newUser };
  }

  loginWithGoogle({ email, name, picture }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const displayName = String(name || 'Usuario de Google').trim();
    const accounts = this.getAccounts();

    // Buscar cuenta existente por correo o vincular la primera cuenta demo si aún no tiene cuenta Google
    let user = accounts.find(u => cleanEmail && u.email && u.email.toLowerCase() === cleanEmail);

    if (!user && accounts.length > 0 && accounts[0].id === 'usr_kevin' && accounts[0].email === 'kevin@ruma.app') {
      user = accounts[0];
    }

    if (user) {
      user.name = displayName || user.name;
      if (cleanEmail) user.email = cleanEmail;
      if (picture) user.avatar = picture;
      if (!user.username) {
        user.username = cleanEmail ? cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase() : `user_${Date.now().toString().slice(-4)}`;
      }
      user.authProvider = 'google';
      this.saveAccounts(accounts);

      // Actualizar nombre y foto del miembro en sus grupos
      const groups = this.getGroups().map(g => ({
        ...g,
        members: (g.members || []).map(m => m.id === user.id ? {
          ...m,
          name: user.name,
          username: user.username,
          avatar: user.avatar
        } : m)
      }));
      this.saveGroups(groups);
    } else {
      const baseUsername = cleanEmail
        ? cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase()
        : displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);

      user = {
        id: Utils.generateId('usr'),
        name: displayName,
        username: baseUsername || `user_${Date.now().toString().slice(-4)}`,
        email: cleanEmail,
        phone: '',
        password: '',
        avatar: picture || 'assets/ruma_icon_512.png',
        frameId: 'frame-axolotl',
        bannerColor: '#7C3AED',
        bio: '✨ Conectado con Google Drive',
        showcaseIds: [],
        isPremium: false,
        authProvider: 'google'
      };
      accounts.push(user);
      this.saveAccounts(accounts);
    }

    localStorage.setItem(CONFIG.storageKeys.currentUserId, user.id);
    this.currentInterface = 'hub';
    this.notify();
    return { ok: true, user };
  }

  logout() {
    localStorage.removeItem(CONFIG.storageKeys.currentUserId);
    try { GoogleAuth.clearToken(); } catch (_) {}
    this.currentInterface = 'hub';
    this.notify();
  }

  updateCurrentUser(patch) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(u => u.id === user.id);
    if (idx === -1) return null;

    const updated = { ...accounts[idx], ...patch };
    accounts[idx] = updated;
    this.saveAccounts(accounts);

    const groups = this.getGroups().map(g => ({
      ...g,
      members: (g.members || []).map(m => m.id === updated.id ? {
        ...m,
        name: updated.name,
        username: updated.username,
        avatar: updated.avatar,
        frameId: updated.frameId
      } : m)
    }));
    this.saveGroups(groups);
    this.notify();
    return updated;
  }

  // --- GRUPOS Y NAVEGACIÓN ENTRE LAS 4 INTERFACES ---
  getGroups() {
    try {
      const list = JSON.parse(localStorage.getItem(CONFIG.storageKeys.groups)) || DEMO_GROUPS;
      // Garantizar hidratación de series con episodios precargados
      list.forEach(g => {
        (g.series || []).forEach(s => {
          const matchKey = String(s.tmdbId || s.id);
          if (!s.seasonEpisodes && PRELOADED_SERIES_EPISODES[matchKey]) {
            s.seasonEpisodes = PRELOADED_SERIES_EPISODES[matchKey];
          }
          if (!Array.isArray(s.seasons) || s.seasons.length === 0) {
            if (s.seasonEpisodes) {
              s.seasons = Object.keys(s.seasonEpisodes).map(num => ({
                seasonNumber: parseInt(num, 10),
                name: `Temporada ${num}`,
                episodeCount: s.seasonEpisodes[num].length
              }));
            } else {
              const count = s.numberOfSeasons || 1;
              s.seasons = Array.from({ length: count }, (_, i) => ({
                seasonNumber: i + 1,
                name: `Temporada ${i + 1}`,
                episodeCount: 10
              }));
            }
          }
        });
      });
      return list;
    } catch (_) {
      return DEMO_GROUPS;
    }
  }

  saveGroups(groups) {
    localStorage.setItem(CONFIG.storageKeys.groups, JSON.stringify(groups));
  }

  getMyGroups() {
    const user = this.getCurrentUser();
    if (!user) return [];
    return this.getGroups().filter(g => (g.members || []).some(m => m.id === user.id));
  }

  getActiveGroup() {
    const activeId = localStorage.getItem(CONFIG.storageKeys.activeGroupId);
    const myGroups = this.getMyGroups();
    return myGroups.find(g => g.id === activeId) || myGroups[0] || null;
  }

  setActiveGroup(groupId) {
    localStorage.setItem(CONFIG.storageKeys.activeGroupId, groupId);
    this.currentInterface = 'group';
    this.notify();
  }

  navigate(interfaceName, options = {}) {
    this.currentInterface = interfaceName;
    if (options.groupTab) this.currentGroupTab = options.groupTab;
    if (options.inspectUserId !== undefined) this.inspectedUserId = options.inspectUserId;
    if (options.memoryFilterIds !== undefined) this.memoryFilterIds = options.memoryFilterIds;
    else if (options.groupTab && options.groupTab !== 'memories') this.memoryFilterIds = null;
    this.notify();
  }

  createGroup({ name, description, driveFolderUrl, plan = 'free' }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const check = Entitlements.canCreateGroup(user, allGroups, plan);
    if (!check.allowed) {
      return { ok: false, reason: check.reason };
    }

    const newGroup = {
      id: Utils.generateId('grp'),
      name: (name || 'Mi Grupo ruma').trim(),
      code: Utils.generateGroupCode(),
      description: (description || '').trim(),
      plan: plan === 'premium' ? 'premium' : 'free',
      creatorId: user.id,
      driveFolderUrl: (driveFolderUrl || '').trim(),
      accentColor: 'purple',
      createdAt: new Date().toISOString(),
      members: [
        {
          id: user.id,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
          frameId: user.frameId || 'frame-axolotl',
          role: 'admin'
        }
      ],
      memories: [],
      plans: [],
      movies: [],
      series: [],
      songs: [],
      goals: [],
      notes: [],
      messages: []
    };

    allGroups.unshift(newGroup);
    this.saveGroups(allGroups);

    if (plan === 'premium') {
      this.updateCurrentUser({ isPremium: true });
    }

    this.setActiveGroup(newGroup.id);
    return { ok: true, group: newGroup };
  }

  joinGroupByCodeOrQuery(codeOrQuery) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const clean = String(codeOrQuery || '').trim().toUpperCase();

    const target = allGroups.find(g =>
      g.code.toUpperCase() === clean ||
      g.name.toUpperCase().includes(clean)
    );

    if (!target) {
      return { ok: false, reason: 'No se encontró ningún grupo con ese código o nombre.' };
    }

    if ((target.members || []).some(m => m.id === user.id)) {
      this.setActiveGroup(target.id);
      return { ok: true, group: target, alreadyMember: true };
    }

    const check = Entitlements.canJoinGroup(user, allGroups);
    if (!check.allowed) {
      return { ok: false, reason: check.reason, needsUpgrade: true };
    }

    target.members.push({
      id: user.id,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      frameId: user.frameId || 'frame-none',
      role: 'member'
    });

    this.saveGroups(allGroups);
    this.setActiveGroup(target.id);
    return { ok: true, group: target };
  }

  upgradeGroupToPremium(groupId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return false;
    group.plan = 'premium';
    this.saveGroups(allGroups);
    this.updateCurrentUser({ isPremium: true });
    this.notify();
    return true;
  }

  updateGroupSettings(groupId, patch) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return { ok: false, error: 'Grupo no encontrado.' };

    if (!Entitlements.isGroupAdmin(group, user?.id)) {
      return { ok: false, error: 'Solo los Administradores del grupo pueden modificar la carpeta de Google Drive y los ajustes del grupo.' };
    }

    Object.assign(group, patch);
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, group };
  }

  toggleMemberRole(groupId, targetMemberId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group || !Entitlements.isGroupAdmin(group, user?.id)) {
      return { ok: false, error: 'Solo un Administrador puede cambiar rangos.' };
    }
    if (targetMemberId === group.creatorId) {
      return { ok: false, error: 'El creador principal del grupo siempre mantiene el rango de Administrador.' };
    }

    const member = (group.members || []).find(m => m.id === targetMemberId);
    if (!member) return { ok: false, error: 'Miembro no encontrado.' };

    member.role = member.role === 'admin' ? 'member' : 'admin';
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, newRole: member.role };
  }

  // ==========================================================================
  // 1. RECUERDOS (Puente Google Drive + Álbum / Nota de Voz / Canción / Calendario / Planes)
  // ==========================================================================
  async addMemoryToActiveGroup({ id, title, date, location, description, auraColor, isFeatured, song, voiceNote, files, existingPhotos, onProgress = null }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };

    const limits = Entitlements.getGroupLimits(group);
    if (files && files.length > limits.maxFilesPerMemoryUpload) {
      return {
        ok: false,
        needsUpgrade: true,
        error: `En el Plan Gratis puedes subir hasta ${limits.maxFilesPerMemoryUpload} archivos por carga (sin límite de peso).`
      };
    }

    const record = await DriveBridge.syncMemoryToDrive(group, {
      id,
      title,
      date,
      description,
      voiceNote,
      authorId: user.id,
      authorName: user.name
    }, files || [], onProgress);

    const newThumbnails = (record.files || []).map(f => f.thumbnail).filter(Boolean);
    const allPhotos = [...(existingPhotos || []), ...newThumbnails];
    const coverPreview = allPhotos[0] || record.coverThumbnail || record.coverPreview || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80';
    const hasVideo = (record.files || []).some(f => f.isVideo);

    group.memories = group.memories || [];

    const memoryData = {
      id: id || record.id,
      title: record.title,
      date: record.date,
      location: (location || '').trim(),
      auraColor: auraColor || '#A855F7',
      isFeatured: Boolean(isFeatured),
      subfolderName: record.subfolderName,
      driveSubfolderId: record.driveSubfolderId || '',
      driveUrl: record.driveSubfolderUrl || (DriveBridge.isRealFolderConfigured(group.driveFolderUrl) ? group.driveFolderUrl : ''),
      driveSyncStatus: record.driveSyncStatus || 'local_only',
      driveSyncError: record.driveSyncError || '',
      description: record.description,
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatar,
      coverPreview,
      photos: allPhotos.length > 0 ? allPhotos : [coverPreview],
      files: record.files || [],
      isVideo: hasVideo,
      filesCount: Math.max((files && files.length) || 0, allPhotos.length, 1),
      song: song || null,
      voiceNote: voiceNote || null,
      comments: [],
      createdAt: new Date().toISOString()
    };

    const existingIdx = group.memories.findIndex(m => m.id === id);
    if (existingIdx >= 0) {
      memoryData.comments = group.memories[existingIdx].comments || [];
      if (!files || files.length === 0) {
        memoryData.files = group.memories[existingIdx].files || [];
        if (group.memories[existingIdx].driveSyncStatus === 'synced' && memoryData.driveSyncStatus !== 'synced') {
          memoryData.driveSyncStatus = 'synced';
          memoryData.driveUrl = group.memories[existingIdx].driveUrl || memoryData.driveUrl;
        }
      }
      group.memories[existingIdx] = memoryData;
    } else {
      group.memories.unshift(memoryData);
    }

    this.saveGroups(allGroups);
    this.notify();
    return {
      ok: true,
      memory: memoryData,
      driveSyncStatus: record.driveSyncStatus,
      driveSyncError: record.driveSyncError
    };
  }

  async syncExistingMemoryToDrive(memoryId, onProgress = null) {
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group) return { ok: false, error: 'Grupo no encontrado.' };

    const mem = (group.memories || []).find(m => m.id === memoryId);
    if (!mem) return { ok: false, error: 'Recuerdo no encontrado.' };

    try {
      const synced = await DriveBridge.syncExistingMemoryToDrive(group, mem, onProgress);
      Object.assign(mem, synced);
      this.saveGroups(allGroups);
      this.notify();
      return { ok: true, memory: mem };
    } catch (err) {
      mem.driveSyncStatus = 'error';
      mem.driveSyncError = err.message || 'Error al sincronizar con Google Drive.';
      this.saveGroups(allGroups);
      this.notify();
      return { ok: false, error: mem.driveSyncError };
    }
  }

  deleteMemoryFromActiveGroup(memoryId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    group.memories = (group.memories || []).filter(m => m.id !== memoryId);
    this.saveGroups(allGroups);
    this.notify();
  }

  toggleMemoryFeatured(memoryId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    const mem = (group.memories || []).find(m => m.id === memoryId);
    if (!mem) return;
    mem.isFeatured = !mem.isFeatured;
    this.saveGroups(allGroups);
    this.notify();
    return mem.isFeatured;
  }

  addMemoryComment(memoryId, text) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !text.trim()) return null;

    const mem = (group.memories || []).find(m => m.id === memoryId);
    if (!mem) return null;
    mem.comments = mem.comments || [];
    const comment = {
      id: Utils.generateId('mcom'),
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatar,
      text: text.trim(),
      createdAt: new Date().toISOString()
    };
    mem.comments.push(comment);
    this.saveGroups(allGroups);
    this.notify();
    return comment;
  }

  addPlanToActiveGroup({ title, date, time, note }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !title) return null;

    group.plans = group.plans || [];
    const newPlan = {
      id: Utils.generateId('pln'),
      title: title.trim(),
      date,
      time: time || '19:00',
      note: (note || '').trim(),
      authorId: user.id,
      authorName: user.name
    };
    group.plans.push(newPlan);
    this.saveGroups(allGroups);
    this.notify();
    return newPlan;
  }

  deletePlanFromActiveGroup(planId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    group.plans = (group.plans || []).filter(p => p.id !== planId);
    this.saveGroups(allGroups);
    this.notify();
  }

  // ==========================================================================
  // 2. PELÍCULAS, SERIES Y MÚSICA (Con Límite de 5 en Gratis y Funciones LUMA)
  // ==========================================================================
  addMediaToActiveGroup(category, itemData) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };

    const check = Entitlements.canAddMediaItem(group, category);
    if (!check.allowed) {
      return { ok: false, needsUpgrade: true, error: check.reason };
    }

    group[category] = group[category] || [];
    const newItem = {
      id: Utils.generateId(category.slice(0, 3)),
      ...itemData,
      addedBy: user.name,
      proposedBy: itemData.proposedBy || {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        date: Utils.formatShortDate(new Date().toISOString())
      },
      comments: itemData.comments || [],
      createdAt: new Date().toISOString()
    };

    group[category].unshift(newItem);
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, item: newItem };
  }

  updateMediaItem(category, itemId, patch) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item) return null;
    Object.assign(item, patch);
    this.saveGroups(allGroups);
    this.notify();
    return item;
  }

  cycleMovieStatus(movieId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const movie = (group.movies || []).find(m => m.id === movieId);
    if (!movie) return null;

    const order = ['Por ver', 'Vista', 'Favorita'];
    const currentIdx = order.indexOf(movie.status || 'Por ver');
    movie.status = order[(currentIdx + 1) % order.length];
    this.saveGroups(allGroups);
    this.notify();
    return movie.status;
  }

  rateMovieOrSeries(category, itemId, score, review = '', tags = []) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };

    const list = group[category] || [];
    const item = list.find(x => x.id === itemId);
    if (!item) return { ok: false, error: 'Elemento no encontrado.' };

    // Películas y series se pueden reseñar en cualquier momento.
    // En series guardamos en qué punto iba el usuario al reseñar (T# · Cap #).
    let progressLabel = '';
    let completedWhenRated = false;
    if (category === 'series') {
      completedWhenRated = this.isSeriesCompletedByUser(item, user.id);
      const up = item.userProgress?.[user.id];
      if (completedWhenRated) progressLabel = '🏆 Serie completada';
      else if (up?.lastWatched) progressLabel = `Iba en T${up.lastWatched.season} · Cap ${up.lastWatched.episode}`;
      else progressLabel = 'Sin empezar';
    }

    const numeric = Math.round(Math.min(10, Math.max(0.5, Number(score) || 8)) * 10) / 10;
    item.ratings = item.ratings || {};
    item.ratings[user.id] = {
      score: numeric,
      review: String(review || '').trim(),
      tags: Array.isArray(tags) ? tags.slice(0, 6) : [],
      userName: user.name,
      userAvatar: user.avatar,
      progressLabel,
      completedWhenRated,
      updatedAt: new Date().toISOString()
    };

    // Reseñar una película "Por ver" la marca automáticamente como vista.
    if (category === 'movies' && (item.status || 'Por ver') === 'Por ver') {
      item.status = 'Vista';
    }

    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, rating: item.ratings[user.id] };
  }

  deleteMyRating(category, itemId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return false;
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item || !item.ratings || !item.ratings[user.id]) return false;
    delete item.ratings[user.id];
    this.saveGroups(allGroups);
    this.notify();
    return true;
  }

  /**
   * Aplica varios parches (datos reales de TMDb) en una sola escritura/notify.
   * patches: [{ category, itemId, patch }]
   */
  applyMediaPatches(groupId, patches = []) {
    if (!patches.length) return;
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    let changed = false;
    patches.forEach(({ category, itemId, patch }) => {
      const item = (group[category] || []).find(x => x.id === itemId);
      if (item && patch) {
        Object.assign(item, patch);
        changed = true;
      }
    });
    if (changed) {
      this.saveGroups(allGroups);
      this.notify();
    }
  }

  addMediaComment(category, itemId, text) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !text.trim()) return null;

    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item) return null;

    let userProgressLabel = '';
    if (category === 'series') {
      const up = item.userProgress?.[user.id];
      if (up && up.lastWatched) {
        userProgressLabel = `T${up.lastWatched.season} · Cap ${up.lastWatched.episode}`;
      } else if (up && up.currentSeason) {
        userProgressLabel = `T${up.currentSeason} · Cap ${up.currentEpisode || 1}`;
      } else {
        userProgressLabel = 'T1 · Cap 1';
      }
    }

    item.comments = item.comments || [];
    const newComment = {
      id: Utils.generateId('com'),
      authorId: user.id,
      userId: user.id,
      authorName: user.name,
      userName: user.name,
      authorAvatar: user.avatar,
      userAvatar: user.avatar,
      userProgressLabel,
      text: text.trim(),
      time: 'Hace un momento',
      date: 'Hace un momento',
      createdAt: new Date().toISOString(),
      reactions: { '❤️': 0, '🔥': 0, '😂': 0 }
    };

    item.comments.push(newComment);
    this.saveGroups(allGroups);
    this.notify();
    return newComment;
  }

  reactMediaComment(category, itemId, commentId, emoji) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item || !Array.isArray(item.comments)) return null;
    const comment = item.comments.find(c => c.id === commentId);
    if (!comment) return null;
    comment.reactions = comment.reactions || {};
    comment.reactions[emoji] = (comment.reactions[emoji] || 0) + 1;
    this.saveGroups(allGroups);
    this.notify();
    return comment;
  }

  rateSong(songId, starScore) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    const song = (group.songs || []).find(s => s.id === songId);
    if (!song) return null;

    const val = Math.min(5, Math.max(1, Number(starScore) || 5));
    song.ratings = song.ratings || {};
    song.ratings[user.id] = val;
    const vals = Object.values(song.ratings).map(Number);
    song.ratingCount = vals.length;
    song.rating = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));

    this.saveGroups(allGroups);
    this.notify();
    return song;
  }

  // --- SERIES: SEGUIMIENTO CAPÍTULO A CAPÍTULO Y TEMPORADAS (Estilo LUMA) ---
  isSeriesCompletedByUser(series, userId) {
    if (!series) return false;
    const uid = userId || this.getCurrentUser()?.id;
    const up = series.userProgress?.[uid];
    if (up && up.status === 'Completada') return true;

    const seasons = series.seasons || [];
    if (seasons.length === 0) return true;
    const totalEpisodes = seasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0);
    if (totalEpisodes === 0) return true;

    const watchedCount = Object.keys(up?.watchedEpisodes || {}).filter(k => !k.startsWith('0_')).length;
    return watchedCount >= totalEpisodes;
  }

  toggleEpisodeWatched(seriesId, seasonNum, episodeNum) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;

    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return null;

    series.userProgress = series.userProgress || {};
    if (!series.userProgress[user.id]) {
      series.userProgress[user.id] = {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        currentSeason: seasonNum,
        currentEpisode: episodeNum,
        watchedEpisodes: {},
        lastWatched: { season: seasonNum, episode: episodeNum },
        status: 'Viendo',
        updatedAt: new Date().toISOString()
      };
    }

    const up = series.userProgress[user.id];
    up.watchedEpisodes = up.watchedEpisodes || {};
    const key = `${seasonNum}_${episodeNum}`;
    const wasWatched = Boolean(up.watchedEpisodes[key]);

    if (wasWatched) {
      delete up.watchedEpisodes[key];
    } else {
      up.watchedEpisodes[key] = true;
      up.lastWatched = { season: seasonNum, episode: episodeNum };
      up.currentSeason = seasonNum;
      up.currentEpisode = episodeNum;
    }

    const isCompleted = this.isSeriesCompletedByUser(series, user.id);
    up.status = isCompleted ? 'Completada' : (Object.keys(up.watchedEpisodes).length > 0 ? 'Viendo' : 'Por ver');
    series.status = isCompleted ? 'Completada' : 'Viendo';
    up.updatedAt = new Date().toISOString();

    this.saveGroups(allGroups);
    this.notify();
    return { series, isWatched: !wasWatched, isFullyCompleted: isCompleted, progress: up };
  }

  markEpisodesUpTo(seriesId, targetSeason, targetEpisode) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;

    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return null;

    series.userProgress = series.userProgress || {};
    if (!series.userProgress[user.id]) {
      series.userProgress[user.id] = {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        watchedEpisodes: {},
        status: 'Viendo'
      };
    }

    const up = series.userProgress[user.id];
    up.watchedEpisodes = up.watchedEpisodes || {};
    const seasons = series.seasons || [{ seasonNumber: targetSeason, episodeCount: targetEpisode }];

    for (const s of seasons) {
      const sNum = s.seasonNumber;
      const count = s.episodeCount || 10;
      if (sNum < targetSeason) {
        for (let ep = 1; ep <= count; ep++) {
          up.watchedEpisodes[`${sNum}_${ep}`] = true;
        }
      } else if (sNum === targetSeason) {
        for (let ep = 1; ep <= targetEpisode; ep++) {
          up.watchedEpisodes[`${sNum}_${ep}`] = true;
        }
      }
    }

    up.lastWatched = { season: targetSeason, episode: targetEpisode };
    up.currentSeason = targetSeason;
    up.currentEpisode = targetEpisode;
    up.updatedAt = new Date().toISOString();

    const lastSeason = seasons[seasons.length - 1];
    const isFullyCompleted = (targetSeason === lastSeason.seasonNumber && targetEpisode >= (lastSeason.episodeCount || 1))
      || this.isSeriesCompletedByUser(series, user.id);

    if (isFullyCompleted) {
      up.status = 'Completada';
      series.status = 'Completada';
    } else {
      up.status = 'Viendo';
      if (series.status !== 'Completada') series.status = 'Viendo';
    }

    this.saveGroups(allGroups);
    this.notify();
    return { series, isFullyCompleted, progress: up };
  }

  cacheSeriesSeasonEpisodes(seriesId, seasonNumber, episodes) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return;
    series.seasonEpisodes = series.seasonEpisodes || {};
    series.seasonEpisodes[seasonNumber] = episodes;
    this.saveGroups(allGroups);
  }

  deleteMediaItem(category, itemId) {
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group) return;
    group[category] = (group[category] || []).filter(x => x.id !== itemId);
    this.saveGroups(allGroups);
    this.notify();
  }

  // --- PERFIL ESTILO DISCORD: RECOPILACIÓN DE PELÍCULAS Y SERIES CALIFICADAS ---
  getUserRatedMediaAcrossGroups(userId) {
    const targetId = userId || this.getCurrentUser()?.id;
    if (!targetId) return [];

    const allGroups = this.getGroups();
    const ratedItems = [];
    const seenIds = new Set();

    for (const grp of allGroups) {
      for (const mov of (grp.movies || [])) {
        const userRating = mov.ratings && mov.ratings[targetId];
        if (userRating && !seenIds.has(mov.id)) {
          seenIds.add(mov.id);
          ratedItems.push({
            id: mov.id,
            type: 'Película',
            title: mov.title,
            year: mov.year || '',
            poster: mov.poster || 'assets/ruma_icon_512.png',
            score: userRating.score,
            groupName: grp.name
          });
        }
      }
      for (const ser of (grp.series || [])) {
        const userRating = ser.ratings && ser.ratings[targetId];
        if (userRating && !seenIds.has(ser.id)) {
          seenIds.add(ser.id);
          ratedItems.push({
            id: ser.id,
            type: 'Serie',
            title: ser.title,
            year: ser.year || '',
            poster: ser.poster || 'assets/ruma_icon_512.png',
            score: userRating.score,
            groupName: grp.name
          });
        }
      }
    }

    return ratedItems;
  }

  toggleShowcaseMediaItem(itemId) {
    const user = this.getCurrentUser();
    if (!user) return;
    const current = Array.isArray(user.showcaseIds) ? [...user.showcaseIds] : [];
    const idx = current.indexOf(itemId);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(itemId);
    }
    this.updateCurrentUser({ showcaseIds: current });
  }

  // --- METAS, NOTAS Y CHAT CON CITAS ESTILO WHATSAPP ---
  addGoalToActiveGroup({ title, category }) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    group.goals = group.goals || [];
    group.goals.unshift({
      id: Utils.generateId('gol'),
      title: title.trim(),
      category: category || 'General',
      progress: 0,
      completed: false
    });
    this.saveGroups(allGroups);
    this.notify();
  }

  toggleGoalCompleted(goalId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return false;
    const goal = (group.goals || []).find(g => g.id === goalId);
    if (!goal) return false;
    goal.completed = !goal.completed;
    goal.progress = goal.completed ? 100 : 50;
    this.saveGroups(allGroups);
    this.notify();
    return goal.completed;
  }

  addNoteToActiveGroup({ title, category, content }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return;
    group.notes = group.notes || [];
    group.notes.unshift({
      id: Utils.generateId('not'),
      title: title.trim(),
      category: category || 'Nota',
      content: content.trim(),
      authorName: user.name
    });
    this.saveGroups(allGroups);
    this.notify();
  }

  sendChatMessage({ text, quote = null }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !text.trim()) return;
    group.messages = group.messages || [];
    group.messages.push({
      id: Utils.generateId('msg'),
      senderId: user.id,
      senderName: user.name,
      text: text.trim(),
      timestamp: new Date().toISOString(),
      quote
    });
    this.saveGroups(allGroups);
    this.notify();
  }
}

export const store = new RumaStore();
