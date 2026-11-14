/**
 * ruma 🌟 — Motor Central de Estado, Persistencia Multi-Grupo y Cuentas
 */

import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Entitlements } from './entitlements.js';
import { DriveBridge } from '../services/drive-bridge.js';

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
        subfolderName: 'Tarde de Mirador y Café - Domingo 15 de noviembre de 2026',
        driveUrl: 'https://drive.google.com/drive/folders/1RumaDemoFolderPublicEditor',
        description: 'Viendo el atardecer morado con la mejor compañía.',
        authorId: 'usr_kevin',
        authorName: 'Kevin Gómez',
        coverPreview: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=900&q=80',
        filesCount: 4
      }
    ],
    movies: [
      {
        id: 'mov_demo_1',
        title: 'Interstellar',
        year: '2014',
        status: 'Vista',
        poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
        addedBy: 'Kevin Gómez',
        ratings: {
          usr_kevin: { score: 9.8, review: 'Obra maestra absoluta, la banda sonora es de otro planeta.' },
          usr_laura: { score: 9.5, review: 'Lloré con la escena de los mensajes.' }
        }
      },
      {
        id: 'mov_demo_2',
        title: 'Cuestión de Tiempo',
        year: '2013',
        status: 'Vista',
        poster: 'https://image.tmdb.org/t/p/w500/iR1bVfURbN7r1C46WHFbwCkVve.jpg',
        addedBy: 'Laura',
        ratings: {
          usr_kevin: { score: 9.2, review: 'Hace valorar cada día cotidiano.' },
          usr_laura: { score: 10, review: 'Mi película favorita para ver juntos.' }
        }
      }
    ],
    series: [
      {
        id: 'ser_demo_1',
        title: 'Arcane',
        year: '2021',
        status: 'Viendo',
        currentSeason: 2,
        currentEpisode: 4,
        poster: 'https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg',
        addedBy: 'Kevin Gómez',
        ratings: {
          usr_kevin: { score: 9.7, review: 'Animación impecable en cada capítulo.' },
          usr_laura: { score: 9.4, review: 'La historia atrapa desde el episodio 1.' }
        }
      }
    ],
    songs: [
      {
        id: 'sng_demo_1',
        title: 'Sweater Weather',
        artist: 'The Neighbourhood',
        artwork: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
        note: 'La canción que siempre ponemos en carretera 🚗💜',
        addedBy: 'Kevin Gómez',
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
    this.inspectedUserId = null; // Permite ver el perfil estilo Discord propio o de otro miembro
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

  // --- CUENTAS Y AUTENTICACIÓN TRIPLE (Correo, Teléfono o @Usuario + Contraseña) ---
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

  logout() {
    localStorage.removeItem(CONFIG.storageKeys.currentUserId);
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

    // Sincronizar nombre, avatar y marco en los grupos donde participa
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
      return JSON.parse(localStorage.getItem(CONFIG.storageKeys.groups)) || DEMO_GROUPS;
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

  /**
   * Actualiza la carpeta de Google Drive o ajustes del grupo (Exclusivo para Administradores)
   */
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

  /**
   * Cambia el rango de un integrante entre 'admin' y 'member' (Exclusivo para Administradores)
   */
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

  // --- RECUERDOS CON PUENTE GOOGLE DRIVE + CACHÉ LOCAL ---
  async addMemoryToActiveGroup({ title, date, description, files }) {
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
      title,
      date,
      description,
      authorId: user.id,
      authorName: user.name
    }, files || []);

    group.memories = group.memories || [];
    group.memories.unshift({
      id: record.id,
      title: record.title,
      date: record.date,
      subfolderName: record.subfolderName,
      driveUrl: record.driveUrl,
      description: record.description,
      authorId: user.id,
      authorName: user.name,
      coverPreview: record.coverPreview || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
      filesCount: (files && files.length) || 1
    });

    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, memory: group.memories[0] };
  }

  // --- CINE, SERIES Y MÚSICA (REGLA DE MÁXIMO 5 EN GRUPOS GRATIS) ---
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
      createdAt: new Date().toISOString()
    };

    group[category].unshift(newItem);
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, item: newItem };
  }

  rateMovieOrSeries(category, itemId, score, review = '') {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false };

    const list = group[category] || [];
    const item = list.find(x => x.id === itemId);
    if (!item) return { ok: false };

    item.ratings = item.ratings || {};
    item.ratings[user.id] = {
      score: Math.min(10, Math.max(1, Number(score) || 8)),
      review: String(review || '').trim(),
      updatedAt: new Date().toISOString()
    };

    this.saveGroups(allGroups);
    this.notify();
    return { ok: true };
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
  /**
   * Devuelve todas las películas y series que un usuario ha calificado en cualquiera de sus grupos
   * para que pueda elegir cuáles mostrar en su perfil estilo Discord (solo póster, título y nota, sin reseña).
   */
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
