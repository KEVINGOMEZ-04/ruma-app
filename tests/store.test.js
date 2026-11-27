import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage in Node before importing store.js
function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => { data.clear(); }
  };
}

globalThis.localStorage = createMemoryStorage();
globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));

const { CONFIG } = await import('../src/core/config.js');
CONFIG.cloudSync.enabled = false;

const { store } = await import('../src/core/store.js');

function seedSession(user, groups, activeGroupId = null) {
  localStorage.clear();
  localStorage.setItem(CONFIG.storageKeys.accounts, JSON.stringify([user]));
  localStorage.setItem(CONFIG.storageKeys.currentUserId, user.id);
  localStorage.setItem(CONFIG.storageKeys.groups, JSON.stringify(groups));
  if (activeGroupId) {
    localStorage.setItem(CONFIG.storageKeys.activeGroupId, activeGroupId);
  }
}

describe('Store security & group joining (AUD-03)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rejects partial name or short queries and only allows exact 6-character invitation code', () => {
    const userA = { id: 'u_a', name: 'Ana', username: 'ana', isPremium: false };
    const privateGroup = {
      id: 'g_priv',
      name: 'Amigos Secretos',
      code: 'K9R4M2',
      plan: 'free',
      creatorId: 'u_other',
      members: [{ id: 'u_other', name: 'Luis', role: 'admin' }]
    };
    seedSession(userA, [privateGroup]);

    expect(store.joinGroupByCodeOrQuery('A').ok).toBe(false);
    expect(store.joinGroupByCodeOrQuery('Amigos').ok).toBe(false);
    expect(store.joinGroupByCodeOrQuery('K9R4M').ok).toBe(false);
    expect(store.joinGroupByCodeOrQuery('K9R4M2X').ok).toBe(false);

    const okRes = store.joinGroupByCodeOrQuery(' k9r-4m2 ');
    expect(okRes.ok).toBe(true);
    expect(okRes.group.id).toBe('g_priv');
  });
});

describe('Store merge integrity (AUD-04)', () => {
  it('never resurrects deleted chat messages and merges concurrent per-user progress for series, books, and songs', () => {
    const baseGroup = {
      id: 'g1',
      name: 'Grupo',
      code: 'ABC123',
      updatedAt: '2026-05-01T10:00:00Z',
      members: [{ id: 'u1', name: 'Kevin' }, { id: 'u2', name: 'Laura' }],
      messages: [
        { id: 'msg_keep', text: 'Hola', createdAt: '2026-05-01T09:00:00Z' },
        { id: 'msg_del', text: 'Borrar esto', createdAt: '2026-05-01T09:05:00Z' }
      ],
      deletedMessages: {},
      series: [{
        id: 's1',
        title: 'Dark',
        userProgress: { u1: { status: 'Viendo', watchedEpisodes: { '1_1': true }, updatedAt: '2026-05-01T10:00:00Z' } },
        ratings: { u1: { score: 9 } },
        comments: [{ id: 'c1', text: 'Brutal', createdAt: '2026-05-01T09:00:00Z' }]
      }],
      songs: [{
        id: 'k1',
        title: 'Sparks',
        ratings: { u1: 5 },
        rating: 5,
        ratingCount: 1,
        comments: []
      }]
    };

    const incomingGroup = {
      ...baseGroup,
      updatedAt: '2026-05-01T10:05:00Z',
      messages: [{ id: 'msg_keep', text: 'Hola', createdAt: '2026-05-01T09:00:00Z' }],
      deletedMessages: { msg_del: '2026-05-01T10:04:00Z' },
      series: [{
        id: 's1',
        title: 'Dark',
        userProgress: { u2: { status: 'Viendo', watchedEpisodes: { '1_2': true }, updatedAt: '2026-05-01T10:05:00Z' } },
        ratings: { u2: { score: 8.5 } },
        comments: [{ id: 'c2', text: 'Me atrapó', createdAt: '2026-05-01T10:05:00Z' }]
      }],
      songs: [{
        id: 'k1',
        title: 'Sparks',
        ratings: { u2: 3 },
        rating: 3,
        ratingCount: 1,
        comments: [{ id: 'sc1', text: 'Temazo', createdAt: '2026-05-01T10:05:00Z' }]
      }]
    };

    const [merged] = store.mergeCloudAndLocalGroups([baseGroup], [incomingGroup]);

    expect(merged.messages.map(m => m.id)).toEqual(['msg_keep']);
    expect(merged.deletedMessages.msg_del).toBeTruthy();

    expect(merged.series[0].userProgress.u1.watchedEpisodes['1_1']).toBe(true);
    expect(merged.series[0].userProgress.u2.watchedEpisodes['1_2']).toBe(true);
    expect(merged.series[0].ratings.u1.score).toBe(9);
    expect(merged.series[0].ratings.u2.score).toBe(8.5);
    expect(merged.series[0].comments.map(c => c.id)).toEqual(['c1', 'c2']);

    expect(merged.songs[0].ratings).toEqual({ u1: 5, u2: 3 });
    expect(merged.songs[0].ratingCount).toBe(2);
    expect(merged.songs[0].rating).toBe(4);
    expect(merged.songs[0].comments.map(c => c.id)).toEqual(['sc1']);
  });
});

describe('Store Freemium guards, Series/Movies states & permissions (AUD-05, AUD-06, AUD-09)', () => {
  it('blocks mutations on locked 6th Free items while still allowing deletion to return <= 5', () => {
    const user = { id: 'u1', name: 'Kevin', username: 'kevin', isPremium: false };
    const movies = Array.from({ length: 6 }, (_, i) => ({
      id: `m${6 - i}`,
      title: `Movie ${6 - i}`,
      createdAt: `2026-0${6 - i}-01T00:00:00Z`,
      proposedBy: { id: 'u1', name: 'Kevin' },
      userStatuses: {},
      ratings: {},
      comments: []
    }));
    const group = {
      id: 'g1',
      name: 'FreeGroup',
      code: 'FREE01',
      plan: 'free',
      creatorId: 'u1',
      members: [{ id: 'u1', name: 'Kevin', role: 'admin' }],
      movies,
      series: [],
      songs: [],
      books: [],
      memories: []
    };
    seedSession(user, [group], 'g1');

    // m6 is the newest (6th) item -> locked
    expect(store.setUserMovieStatus('m6', 'Vista')).toBeNull();
    expect(store.rateMovieOrSeries('movies', 'm6', 9, 'Buena').ok).toBe(false);
    expect(store.addMediaComment('movies', 'm6', 'Hola')).toBeNull();

    // m1 is within the 5 oldest -> allowed
    expect(store.setUserMovieStatus('m1', 'Vista')).toBe('Vista');

    // Deleting m6 is allowed so the user can return within the Free limit
    expect(store.deleteMediaItem('movies', 'm6').ok).toBe(true);
    expect(store.getActiveGroup().movies.length).toBe(5);
  });

  it('reverts a Completed series to Viendo/Por ver on uncheck without overwriting shared series.status', () => {
    const user = { id: 'u1', name: 'Kevin', username: 'kevin', isPremium: false };
    const group = {
      id: 'g1',
      name: 'SeriesGroup',
      code: 'SER001',
      plan: 'free',
      creatorId: 'u1',
      members: [{ id: 'u1', name: 'Kevin', role: 'admin' }, { id: 'u2', name: 'Laura', role: 'member' }],
      series: [{
        id: 's1',
        title: 'Mini',
        status: 'Por ver',
        seasons: [{ seasonNumber: 1, episodeCount: 2 }],
        userProgress: {
          u1: { status: 'Completada', watchedEpisodes: { '1_1': true, '1_2': true } }
        }
      }]
    };
    seedSession(user, [group], 'g1');

    // Uncheck episode 2 -> should revert from Completada to Viendo
    const r1 = store.toggleEpisodeWatched('s1', 1, 2);
    expect(r1.isFullyCompleted).toBe(false);
    expect(r1.progress.status).toBe('Viendo');
    // Global series.status must remain untouched for other users
    expect(r1.series.status).toBe('Por ver');

    // Uncheck episode 1 -> should revert to Por ver
    const r2 = store.toggleEpisodeWatched('s1', 1, 1);
    expect(r2.progress.status).toBe('Por ver');
  });

  it('updates userStatuses[user.id] to Vista when rating a Por ver movie', () => {
    const user = { id: 'u1', name: 'Kevin', username: 'kevin', isPremium: false };
    const group = {
      id: 'g1',
      name: 'Cine',
      code: 'CIN001',
      plan: 'free',
      creatorId: 'u1',
      members: [{ id: 'u1', name: 'Kevin', role: 'admin' }],
      movies: [{ id: 'm1', title: 'Dune', userStatuses: {} }]
    };
    seedSession(user, [group], 'g1');

    const res = store.rateMovieOrSeries('movies', 'm1', 9.5, 'Obra maestra');
    expect(res.ok).toBe(true);
    const updatedMovie = store.getActiveGroup().movies[0];
    expect(store.getUserMovieStatus(updatedMovie, 'u1')).toBe('Vista');
  });

  it('checks item.authorId in canDeleteMediaItem and enforces permissions in deleteMemoryFromActiveGroup', () => {
    const member = { id: 'u2', name: 'Laura Nuevo Nombre', username: 'laura', isPremium: false };
    const group = {
      id: 'g1',
      name: 'Grupo',
      code: 'MEM001',
      plan: 'free',
      creatorId: 'u1',
      members: [
        { id: 'u1', name: 'Kevin', role: 'admin' },
        { id: 'u2', name: 'Laura Nuevo Nombre', role: 'member' }
      ],
      songs: [{ id: 'k1', title: 'Song', authorId: 'u2', addedBy: 'Laura Antiguo' }],
      memories: [
        { id: 'mem_kevin', title: 'De Kevin', authorId: 'u1' },
        { id: 'mem_laura', title: 'De Laura', authorId: 'u2' }
      ]
    };
    seedSession(member, [group], 'g1');

    // Author can delete their song even after renaming display name
    expect(store.canDeleteMediaItem(group, group.songs[0], member)).toBe(true);

    // Non-admin member cannot delete another member's memory
    expect(store.deleteMemoryFromActiveGroup('mem_kevin').ok).toBe(false);
    expect(store.getActiveGroup().memories.length).toBe(2);

    // Author CAN delete their own memory
    expect(store.deleteMemoryFromActiveGroup('mem_laura').ok).toBe(true);
    expect(store.getActiveGroup().memories.map(m => m.id)).toEqual(['mem_kevin']);
  });

  it('restricts Google Drive settings and Drive memory sync exclusively to the group creator (even if user is a promoted admin)', async () => {
    const promotedAdmin = { id: 'u2', name: 'Laura Admin', username: 'laura', isPremium: false };
    const creator = { id: 'u1', name: 'Kevin Creador', username: 'kevin', isPremium: false };
    const group = {
      id: 'g1',
      name: 'Grupo',
      code: 'DRV001',
      plan: 'free',
      creatorId: 'u1',
      driveFolderUrl: '',
      members: [
        { id: 'u1', name: 'Kevin Creador', role: 'admin' },
        { id: 'u2', name: 'Laura Admin', role: 'admin' }
      ],
      memories: [{ id: 'mem1', title: 'Paseo', date: '2026-11-26', authorId: 'u2', files: [] }]
    };

    // Promoted admin can edit group name/description, but NOT driveFolderUrl/driveClientId or sync to Drive
    seedSession(promotedAdmin, [group], 'g1');
    expect(store.updateGroupSettings('g1', { name: 'Nuevo Nombre' }).ok).toBe(true);
    const blockedDrivePatch = store.updateGroupSettings('g1', { driveFolderUrl: 'https://drive.google.com/drive/folders/123456789' });
    expect(blockedDrivePatch.ok).toBe(false);
    expect(blockedDrivePatch.error).toMatch(/creador del grupo/i);

    const blockedSync = await store.syncExistingMemoryToDrive('mem1');
    expect(blockedSync.ok).toBe(false);
    expect(blockedSync.error).toMatch(/creador del grupo/i);

    // Group creator CAN update driveFolderUrl
    seedSession(creator, [group], 'g1');
    const allowedDrivePatch = store.updateGroupSettings('g1', { driveFolderUrl: 'https://drive.google.com/drive/folders/123456789' });
    expect(allowedDrivePatch.ok).toBe(true);
    expect(store.getActiveGroup().driveFolderUrl).toBe('https://drive.google.com/drive/folders/123456789');
  });
});

describe('iPhone / iOS Safari QuotaExceededError resilience & Base64 deduplication', () => {
  it('keeps TMDb movies/series additions, episode tracking, and chat working when localStorage throws QuotaExceededError', () => {
    const user = { id: 'u1', name: 'Kevin', username: 'kevin', isPremium: true };
    const group = {
      id: 'g_ios',
      name: 'iPhone Group',
      code: 'IOS001',
      plan: 'premium',
      creatorId: 'u1',
      members: [{ id: 'u1', name: 'Kevin', role: 'admin' }],
      movies: [],
      series: [],
      songs: [],
      books: [],
      memories: [],
      messages: []
    };
    seedSession(user, [group], 'g_ios');

    const origSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    };

    try {
      const addMovie = store.addMediaToActiveGroup('movies', {
        tmdbId: 157336,
        title: 'Interstellar',
        year: '2014',
        poster: 'https://image.tmdb.org/t/p/w500/interstellar.jpg'
      });
      expect(addMovie.ok).toBe(true);

      const addSeries = store.addMediaToActiveGroup('series', {
        tmdbId: 1396,
        title: 'Breaking Bad',
        seasons: [{ seasonNumber: 1, episodeCount: 7 }]
      });
      expect(addSeries.ok).toBe(true);

      const epRes = store.toggleEpisodeWatched(addSeries.item.id, 1, 1);
      expect(epRes.isWatched).toBe(true);

      const chatRes = store.sendChatMessage({ text: 'Probando desde iPhone' });
      expect(chatRes?.msg?.text).toBe('Probando desde iPhone');

      const live = store.getActiveGroup();
      expect(live.movies.map(m => m.title)).toEqual(['Interstellar']);
      expect(live.series[0].userProgress.u1.watchedEpisodes['1_1']).toBe(true);
      expect(live.messages.map(m => m.text)).toEqual(['Probando desde iPhone']);
    } finally {
      localStorage.setItem = origSetItem;
    }
  });

  it('deduplicates triple Base64 memory thumbnails and compacts embedded Base64 child avatars while hydrating UI fields', () => {
    const fakeAvatar = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
    const fakeThumb = 'data:image/jpeg;base64,' + 'B'.repeat(8000);
    const user = { id: 'u1', name: 'Kevin', username: 'kevin', avatar: fakeAvatar, isPremium: true };
    const bloatedGroup = {
      id: 'g_bloat',
      name: 'Testeo',
      code: 'TST001',
      plan: 'premium',
      creatorId: 'u1',
      members: [{ id: 'u1', name: 'Kevin', avatar: fakeAvatar, role: 'admin' }],
      memories: [{
        id: 'mem_1',
        title: 'Viaje',
        authorId: 'u1',
        authorName: 'Kevin',
        authorAvatar: fakeAvatar,
        coverPreview: fakeThumb,
        photos: [fakeThumb],
        files: [{ id: 'f1', name: 'IMG_0001.HEIC', thumbnail: fakeThumb }],
        comments: [{ id: 'mc1', authorId: 'u1', authorName: 'Kevin', authorAvatar: fakeAvatar, text: 'Increíble' }]
      }],
      movies: [],
      series: [],
      songs: [],
      books: [],
      messages: [{ id: 'msg1', senderId: 'u1', senderName: 'Kevin', senderAvatar: fakeAvatar, text: 'Hola', timestamp: '2026-05-01T10:00:00Z' }]
    };

    seedSession(user, [bloatedGroup], 'g_bloat');
    store.saveGroups(store.getGroups());

    const storedRaw = localStorage.getItem(CONFIG.storageKeys.groups);
    // `fakeThumb` must appear only ONCE (in files[0].thumbnail), not 3 times
    expect(storedRaw.split(fakeThumb).length - 1).toBe(1);
    // `fakeAvatar` must appear only ONCE (in group.members[0].avatar), stripped from memories/comments/messages
    expect(storedRaw.split(fakeAvatar).length - 1).toBe(1);

    // Hydrated group returned to UI still exposes coverPreview, photos, and member avatar seamlessly
    const hydrated = store.getActiveGroup();
    expect(hydrated.members[0].avatar).toBe(fakeAvatar);
    expect(hydrated.memories[0].coverPreview).toBe(fakeThumb);
    expect(hydrated.memories[0].photos).toEqual([fakeThumb]);
  });
});
