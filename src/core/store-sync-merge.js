/**
 * ruma 🌟 — Motor puro de fusión nube-local (Cuentas, Grupos, Medios, Chat y Tombstones)
 */

// Evita incrustar copias repetidas de avatares base64 (~30-60 KB) dentro de logs, películas o reseñas.
// La UI resuelve el avatar actualizado desde group.members / accounts por userId.
export function compactAvatar(avatar) {
  if (!avatar || typeof avatar !== 'string') return '';
  if (avatar.startsWith('data:') || avatar.length > 2000) return '';
  return avatar;
}

function compactMemoryForStorage(mem) {
  if (!mem || typeof mem !== 'object') return mem;
  const files = Array.isArray(mem.files) ? mem.files : [];
  const fileDataThumbs = new Set(
    files
      .map(f => f?.thumbnail)
      .filter(t => typeof t === 'string' && t.startsWith('data:'))
  );

  let compactedPhotos = [];
  if (Array.isArray(mem.photos)) {
    const seenPhotos = new Set();
    compactedPhotos = mem.photos.filter(p => {
      if (!p || typeof p !== 'string') return false;
      if (p.startsWith('data:') && fileDataThumbs.has(p)) return false;
      if (seenPhotos.has(p)) return false;
      seenPhotos.add(p);
      return true;
    });
  }

  const firstFileThumb = files.find(f => f?.thumbnail)?.thumbnail || '';
  const defaultCover = firstFileThumb || compactedPhotos[0] || '';
  let coverPreview = typeof mem.coverPreview === 'string' ? mem.coverPreview : '';
  if (coverPreview.startsWith('data:') && coverPreview === defaultCover) {
    coverPreview = '';
  }

  const comments = Array.isArray(mem.comments)
    ? mem.comments.map(c => (c && typeof c === 'object' ? { ...c, authorAvatar: compactAvatar(c.authorAvatar) } : c))
    : [];

  return {
    ...mem,
    authorAvatar: compactAvatar(mem.authorAvatar),
    coverPreview,
    photos: compactedPhotos,
    comments
  };
}

function compactMediaEntryForStorage(item) {
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };

  if (next.proposedBy && typeof next.proposedBy === 'object') {
    next.proposedBy = {
      ...next.proposedBy,
      avatar: compactAvatar(next.proposedBy.avatar)
    };
  }

  if (next.ratings && typeof next.ratings === 'object') {
    const cleanRatings = {};
    Object.entries(next.ratings).forEach(([uid, val]) => {
      if (val && typeof val === 'object') {
        cleanRatings[uid] = { ...val, userAvatar: compactAvatar(val.userAvatar) };
      } else {
        cleanRatings[uid] = val;
      }
    });
    next.ratings = cleanRatings;
  }

  if (next.userProgress && typeof next.userProgress === 'object') {
    const cleanProg = {};
    Object.entries(next.userProgress).forEach(([uid, up]) => {
      if (up && typeof up === 'object') {
        cleanProg[uid] = { ...up, userAvatar: compactAvatar(up.userAvatar) };
      } else {
        cleanProg[uid] = up;
      }
    });
    next.userProgress = cleanProg;
  }

  if (Array.isArray(next.comments)) {
    next.comments = next.comments.map(c => (c && typeof c === 'object' ? {
      ...c,
      authorAvatar: compactAvatar(c.authorAvatar),
      userAvatar: compactAvatar(c.userAvatar)
    } : c));
  }

  if (Array.isArray(next.quotes)) {
    next.quotes = next.quotes.map(q => (q && typeof q === 'object' ? {
      ...q,
      authorAvatar: compactAvatar(q.authorAvatar)
    } : q));
  }

  return next;
}

/**
 * Compacta un grupo eliminando duplicación triple de miniaturas Base64 en recuerdos
 * y avatares Base64 incrustados en registros hijos, preservando `members[].avatar`.
 */
export function compactGroupForStorage(group) {
  if (!group || typeof group !== 'object' || group.deleted) return group;
  const next = { ...group };

  if (Array.isArray(next.activity)) {
    next.activity = next.activity.map(a => (a && typeof a === 'object' ? {
      ...a,
      userAvatar: compactAvatar(a.userAvatar)
    } : a));
  }

  if (Array.isArray(next.memories)) {
    next.memories = next.memories.map(compactMemoryForStorage);
  }

  ['movies', 'series', 'songs', 'books'].forEach(cat => {
    if (Array.isArray(next[cat])) {
      next[cat] = next[cat].map(compactMediaEntryForStorage);
    }
  });

  if (Array.isArray(next.activities)) {
    next.activities = next.activities.map(act => {
      if (!act || typeof act !== 'object' || !Array.isArray(act.tasks)) return act;
      return {
        ...act,
        tasks: act.tasks.map(t => (t && typeof t === 'object' ? {
          ...t,
          assigneeAvatar: compactAvatar(t.assigneeAvatar)
        } : t))
      };
    });
  }

  if (Array.isArray(next.goals)) {
    next.goals = next.goals.map(goal => {
      if (!goal || typeof goal !== 'object' || !Array.isArray(goal.tasks)) return goal;
      return {
        ...goal,
        tasks: goal.tasks.map(t => (t && typeof t === 'object' ? {
          ...t,
          assigneeAvatar: compactAvatar(t.assigneeAvatar)
        } : t))
      };
    });
  }

  if (Array.isArray(next.notes)) {
    next.notes = next.notes.map(n => (n && typeof n === 'object' ? {
      ...n,
      authorAvatar: compactAvatar(n.authorAvatar)
    } : n));
  }

  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map(m => (m && typeof m === 'object' ? {
      ...m,
      senderAvatar: compactAvatar(m.senderAvatar)
    } : m));
  }

  return next;
}

/**
 * Restaura en memoria las referencias `coverPreview` y `photos` de cada recuerdo a partir de `files[].thumbnail`
 * sin duplicar bytes en JSON.
 */
export function hydrateGroupFromStorage(group) {
  if (!group || typeof group !== 'object' || group.deleted) return group;
  if (Array.isArray(group.memories)) {
    group.memories.forEach(mem => {
      if (!mem || typeof mem !== 'object') return;
      const fileThumbs = (mem.files || []).map(f => f?.thumbnail).filter(Boolean);
      const basePhotos = Array.isArray(mem.photos) ? mem.photos.filter(Boolean) : [];
      const mergedPhotos = [...basePhotos];
      fileThumbs.forEach(t => {
        if (!mergedPhotos.includes(t)) mergedPhotos.push(t);
      });
      const fallbackCover = 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80';
      const cover = mem.coverPreview || fileThumbs[0] || mergedPhotos[0] || fallbackCover;
      mem.coverPreview = cover;
      mem.photos = mergedPhotos.length > 0 ? mergedPhotos : [cover];
    });
  }
  return group;
}

/**
 * Recorte de emergencia exclusivo para `localStorage` cuando los recuerdos superan la cuota de 5 MB de iOS Safari.
 * IndexedDB y la memoria RAM mantienen el objeto completo con todas sus miniaturas.
 */
export function stripGroupThumbnailsForEmergencyLocal(group) {
  if (!group || typeof group !== 'object' || group.deleted) return group;
  return {
    ...group,
    memories: Array.isArray(group.memories) ? group.memories.map(mem => {
      if (!mem || typeof mem !== 'object') return mem;
      return {
        ...mem,
        coverPreview: (typeof mem.coverPreview === 'string' && !mem.coverPreview.startsWith('data:')) ? mem.coverPreview : '',
        photos: Array.isArray(mem.photos) ? mem.photos.filter(p => typeof p === 'string' && !p.startsWith('data:')) : [],
        voiceNote: (typeof mem.voiceNote === 'string' && mem.voiceNote.startsWith('data:')) ? null : mem.voiceNote,
        files: Array.isArray(mem.files) ? mem.files.map(f => (f && typeof f === 'object' ? { ...f, thumbnail: '' } : f)) : []
      };
    }) : group.memories
  };
}

export function normalizeAccountList(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
}

export function mergeAccountObjects(base = {}, incoming = {}) {
  const bTime = base.updatedAt ? new Date(base.updatedAt).getTime() : 0;
  const iTime = incoming.updatedAt ? new Date(incoming.updatedAt).getTime() : 0;
  const incomingWins = iTime >= bTime;
  const older = incomingWins ? base : incoming;
  const newer = incomingWins ? incoming : base;

  const merged = { ...older, ...newer };
  // Preservar hash seguro y eliminar contraseña en texto plano una vez migrada
  if (newer.passwordHash || older.passwordHash) {
    merged.passwordHash = newer.passwordHash || older.passwordHash;
    delete merged.password;
  }
  if (newer.recoveryCodeHash || older.recoveryCodeHash) {
    merged.recoveryCodeHash = newer.recoveryCodeHash || older.recoveryCodeHash;
  }
  if (merged.links !== undefined) merged.links = normalizeAccountList(merged.links);
  if (merged.aboutTags !== undefined) merged.aboutTags = normalizeAccountList(merged.aboutTags);
  if (merged.showcaseIds !== undefined) merged.showcaseIds = normalizeAccountList(merged.showcaseIds);
  return merged;
}

export function isLegacyDemoGroup(g) {
  return !g || g.id === 'grp_santuario_1' || g.id === 'grp_amigos_2' || g.id === 'grp_test_cloud_1' || g.id === 'grp_comunidad_2';
}

export function mergeCloudAndLocalGroups(baseGroups = [], incomingGroups = []) {
    const map = new Map();
    baseGroups.forEach(g => {
      if (!isLegacyDemoGroup(g)) map.set(g.id, g);
    });
    incomingGroups.forEach(ig => {
      if (isLegacyDemoGroup(ig)) return;
      const bg = map.get(ig.id);
      if (!bg) {
        map.set(ig.id, ig);
        return;
      }
      if (bg.deleted || ig.deleted) {
        map.set(ig.id, bg.deleted ? bg : ig);
        return;
      }
      const bTime = bg.updatedAt ? new Date(bg.updatedAt).getTime() : 0;
      const iTime = ig.updatedAt ? new Date(ig.updatedAt).getTime() : 0;
      const winner = iTime >= bTime ? ig : bg;
      const older = iTime >= bTime ? bg : ig;

      const mergedLeftMembers = { ...(older.leftMembers || {}) };
      Object.entries(winner.leftMembers || {}).forEach(([uid, ts]) => {
        if (!mergedLeftMembers[uid] || ts > mergedLeftMembers[uid]) mergedLeftMembers[uid] = ts;
      });

      const mergedMembersMap = new Map();
      (older.members || []).forEach(m => mergedMembersMap.set(m.id, m));
      (winner.members || []).forEach(m => mergedMembersMap.set(m.id, { ...(mergedMembersMap.get(m.id) || {}), ...m }));
      Object.entries(mergedLeftMembers).forEach(([uid, leftAt]) => {
        const m = mergedMembersMap.get(uid);
        if (!m) return;
        const joinedAt = m.joinedAt || '';
        if (!joinedAt || leftAt >= joinedAt) {
          mergedMembersMap.delete(uid);
        }
      });
      const mergedMemberIds = {};
      mergedMembersMap.forEach((m, uid) => {
        if (uid) mergedMemberIds[uid] = true;
      });
      if (winner.creatorId) mergedMemberIds[winner.creatorId] = true;

      // Lápidas de mensajes eliminados y corte de vaciado (chatClearedAt) para evitar resurrección entre dispositivos
      const mergedChatClearedAt = [older.chatClearedAt || '', winner.chatClearedAt || ''].sort().pop() || '';
      const mergedDeletedMessages = { ...(older.deletedMessages || {}), ...(winner.deletedMessages || {}) };
      const delEntries = Object.entries(mergedDeletedMessages);
      if (delEntries.length > 500) {
        delEntries.sort((a, b) => String(b[1] || '').localeCompare(String(a[1] || '')));
        Object.keys(mergedDeletedMessages).forEach(k => delete mergedDeletedMessages[k]);
        delEntries.slice(0, 500).forEach(([k, v]) => { mergedDeletedMessages[k] = v; });
      }

      const isMessagePurged = (m) => {
        if (!m || !m.id) return true;
        if (mergedDeletedMessages[m.id]) return true;
        if (mergedChatClearedAt && (m.timestamp || '') <= mergedChatClearedAt) return true;
        return false;
      };

      const mergeTwoMessages = (oldMsg, winMsg) => {
        if (!oldMsg) return winMsg;
        if (!winMsg) return oldMsg;
        const winEdit = winMsg.editedAt || '';
        const oldEdit = oldMsg.editedAt || '';
        const keepOldEdit = oldEdit && (!winEdit || oldEdit > winEdit);
        const winReactTs = winMsg.reactionsUpdatedAt || '';
        const oldReactTs = oldMsg.reactionsUpdatedAt || '';
        let reactions = winMsg.reactions;
        if (oldReactTs && (!winReactTs || oldReactTs > winReactTs)) {
          reactions = oldMsg.reactions;
        } else if (!winReactTs && !oldReactTs && (oldMsg.reactions || winMsg.reactions)) {
          const combined = { ...(oldMsg.reactions || {}) };
          Object.entries(winMsg.reactions || {}).forEach(([em, list]) => {
            const set = new Set([...(Array.isArray(combined[em]) ? combined[em] : []), ...(Array.isArray(list) ? list : [])]);
            if (set.size > 0) combined[em] = Array.from(set);
          });
          reactions = combined;
        }
        const quote = (oldMsg.quote?.deleted || winMsg.quote?.deleted)
          ? { ...(winMsg.quote || oldMsg.quote), title: 'Mensaje eliminado', deleted: true }
          : (winMsg.quote !== undefined ? winMsg.quote : oldMsg.quote);
        return {
          ...oldMsg,
          ...winMsg,
          text: keepOldEdit ? oldMsg.text : winMsg.text,
          editedAt: keepOldEdit ? oldMsg.editedAt : winMsg.editedAt,
          reactions,
          reactionsUpdatedAt: winReactTs >= oldReactTs ? (winReactTs || undefined) : oldReactTs,
          quote
        };
      };

      const mergedMessagesMap = new Map();
      (older.messages || []).forEach(m => {
        if (!isMessagePurged(m)) mergedMessagesMap.set(m.id, m);
      });
      (winner.messages || []).forEach(m => {
        if (!isMessagePurged(m)) {
          mergedMessagesMap.set(m.id, mergeTwoMessages(mergedMessagesMap.get(m.id), m));
        }
      });

      const mergedMessages = Array.from(mergedMessagesMap.values())
        .map(m => {
          if (m.quote?.type === 'message' && m.quote?.itemId && (mergedDeletedMessages[m.quote.itemId] || (mergedChatClearedAt && !mergedMessagesMap.has(m.quote.itemId)))) {
            return { ...m, quote: { ...m.quote, title: 'Mensaje eliminado', deleted: true } };
          }
          return m;
        })
        .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

      const rawPinnedId = winner.pinnedMessageId !== undefined ? winner.pinnedMessageId : (older.pinnedMessageId || null);
      const mergedPinnedMessageId = (rawPinnedId && mergedMessagesMap.has(rawPinnedId)) ? rawPinnedId : null;

      const mergedActMap = new Map();
      (older.activity || []).forEach(a => mergedActMap.set(a.id, a));
      (winner.activity || []).forEach(a => mergedActMap.set(a.id, a));
      const mergedActivity = Array.from(mergedActMap.values()).sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 100);

      // Fusionar userStatuses de películas por usuario para no perder el estado individual entre dispositivos
      const olderMoviesMap = new Map((older.movies || []).map(m => [m.id, m]));
      const mergedMovies = (winner.movies || []).map(wm => {
        const om = olderMoviesMap.get(wm.id);
        if (!om) return wm;
        return {
          ...om,
          ...wm,
          userStatuses: { ...(om.userStatuses || {}), ...(wm.userStatuses || {}) },
          ratings: { ...(om.ratings || {}), ...(wm.ratings || {}) }
        };
      });

      // Fusionar progreso individual, reseñas, citas y comentarios de libros entre dispositivos
      const olderBooksMap = new Map((older.books || []).map(b => [b.id, b]));
      const baseBooks = Array.isArray(winner.books) ? winner.books : (older.books || []);
      const mergedBooks = baseBooks.map(wb => {
        const ob = olderBooksMap.get(wb.id);
        if (!ob) return wb;
        const mergedProg = { ...(ob.userProgress || {}) };
        Object.entries(wb.userProgress || {}).forEach(([uid, wp]) => {
          const op = mergedProg[uid];
          if (!op || (wp?.updatedAt || '') >= (op?.updatedAt || '')) {
            mergedProg[uid] = wp;
          }
        });
        const quotesMap = new Map();
        (ob.quotes || []).forEach(q => { if (q?.id) quotesMap.set(q.id, q); });
        (wb.quotes || []).forEach(q => { if (q?.id) quotesMap.set(q.id, q); });
        const commentsMap = new Map();
        (ob.comments || []).forEach(c => { if (c?.id) commentsMap.set(c.id, c); });
        (wb.comments || []).forEach(c => { if (c?.id) commentsMap.set(c.id, c); });
        return {
          ...ob,
          ...wb,
          userProgress: mergedProg,
          ratings: { ...(ob.ratings || {}), ...(wb.ratings || {}) },
          quotes: Array.from(quotesMap.values()).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
          comments: Array.from(commentsMap.values()).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        };
      });

      // Fusionar progreso individual y reseñas de series por usuario (evita que un sync devuelva capítulos)
      const olderSeriesMap = new Map((older.series || []).map(s => [s.id, s]));
      const baseSeries = Array.isArray(winner.series) ? winner.series : (older.series || []);
      const mergedSeries = baseSeries.map(ws => {
        const os = olderSeriesMap.get(ws.id);
        if (!os) return ws;
        const mergedProg = { ...(os.userProgress || {}) };
        Object.entries(ws.userProgress || {}).forEach(([uid, wp]) => {
          const op = mergedProg[uid];
          if (!op || (wp?.updatedAt || '') >= (op?.updatedAt || '')) {
            mergedProg[uid] = wp;
          }
        });
        const commentsMap = new Map();
        (os.comments || []).forEach(c => { if (c?.id) commentsMap.set(c.id, c); });
        (ws.comments || []).forEach(c => { if (c?.id) commentsMap.set(c.id, c); });
        return {
          ...os,
          ...ws,
          userProgress: mergedProg,
          ratings: { ...(os.ratings || {}), ...(ws.ratings || {}) },
          comments: Array.from(commentsMap.values()).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        };
      });

      // Fusionar calificaciones por usuario y comentarios de canciones entre dispositivos
      const olderSongsMap = new Map((older.songs || []).map(s => [s.id, s]));
      const baseSongs = Array.isArray(winner.songs) ? winner.songs : (older.songs || []);
      const mergedSongs = baseSongs.map(ws => {
        const os = olderSongsMap.get(ws.id);
        if (!os) return ws;
        const mergedRatings = { ...(os.ratings || {}), ...(ws.ratings || {}) };
        const ratingVals = Object.values(mergedRatings).map(Number).filter(n => Number.isFinite(n) && n > 0);
        const commentsMap = new Map();
        (os.comments || []).forEach(c => { if (c?.id) commentsMap.set(c.id, c); });
        (ws.comments || []).forEach(c => { if (c?.id) commentsMap.set(c.id, c); });
        return {
          ...os,
          ...ws,
          ratings: mergedRatings,
          ...(ratingVals.length > 0 ? {
            ratingCount: ratingVals.length,
            rating: Number((ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length).toFixed(1))
          } : {}),
          comments: Array.from(commentsMap.values()).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
        };
      });

      map.set(ig.id, {
        ...older,
        ...winner,
        movies: mergedMovies,
        series: mergedSeries,
        songs: mergedSongs,
        activities: Array.isArray(winner.activities) ? winner.activities : (older.activities || []),
        goals: Array.isArray(winner.goals) ? winner.goals : (older.goals || []),
        notes: Array.isArray(winner.notes) ? winner.notes : (older.notes || []),
        books: mergedBooks,
        clubBookId: winner.clubBookId !== undefined ? winner.clubBookId : (older.clubBookId || null),
        activity: mergedActivity,
        leftMembers: mergedLeftMembers,
        deletedMessages: mergedDeletedMessages,
        chatClearedAt: mergedChatClearedAt || undefined,
        pinnedMessageId: mergedPinnedMessageId,
        memberIds: mergedMemberIds,
        members: Array.from(mergedMembersMap.values()),
        messages: mergedMessages
      });
    });
    return Array.from(map.values());
}
