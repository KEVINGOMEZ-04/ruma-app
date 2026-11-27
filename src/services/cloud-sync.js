/**
 * ruma 🌟 — Motor de Sincronización en la Nube Particionado v3 (Firebase Auth + RTDB Reglas Estrictas)
 *
 * - Modo Seguro Autenticado (cuando Firebase Auth está activo):
 *   * Nunca lee `/accounts.json` ni `/groups.json` completos.
 *   * Lee únicamente `/accounts/{uid}.json`, `/entitlements/{uid}.json`, `/userGroups/{uid}.json`
 *     y los `/groups/{gid}.json` donde `memberIds/{uid} === true`.
 *   * Usa PATCH por cuenta sin subir jamás `password` en texto plano ni intentar manipular `isPremium`/`entitlements`.
 *   * Mantiene `/inviteCodes/{code}` y `/usernames/{username}` para que el Cloudflare Worker opere sin exponer listas globales.
 *   * Monitorea únicamente `/groups/{gid}/updatedAt.json` de los grupos propios (100 % compatible con `database.rules.json`).
 */

import { CONFIG } from '../core/config.js';
import { MediaStorage } from './media-storage.js';
import { compactGroupForStorage } from '../core/store-sync-merge.js';
import { FirebaseAuth } from './firebase-auth.js';

const BASE_URL = `${CONFIG.cloudSync?.databaseUrl || 'https://luma-f53ee-default-rtdb.firebaseio.com'}/${CONFIG.cloudSync?.rootPath || 'ruma_cloud_v1'}`;

let eventSource = null;
let pollTimer = null;
let resumeCleanup = null;
let isPushing = false;
let lastKnownCloudRev = 0;
let authToken = null;
const lastGroupUpdatedAt = new Map();

function rtdbUrl(path, query = '') {
  const sep = query ? `&${query}` : '';
  const auth = authToken ? `auth=${encodeURIComponent(authToken)}` : '';
  const qs = auth ? `?${auth}${sep}` : (query ? `?${query}` : '');
  return `${BASE_URL}${path}${qs}`;
}

let statusListeners = [];
let currentStatus = 'connecting'; // 'online' | 'syncing' | 'offline' | 'connecting'

const chatMediaUrlCache = new Map();
const chatMediaInflight = new Map();

function setStatus(next) {
  if (currentStatus === next) return;
  currentStatus = next;
  statusListeners.forEach(fn => {
    try { fn(currentStatus); } catch (_) {}
  });
}

function safeKey(id) {
  return encodeURIComponent(String(id || '').replace(/[.$#[\]/]/g, '_'));
}

function objectMapToArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'object') return Object.values(raw).filter(Boolean);
  return [];
}

/**
 * Jamás subir contraseñas en texto plano ni sobrescribir entitlements controlados por servidor.
 */
function sanitizeAccountForCloud(account, { stripServerFields = false } = {}) {
  if (!account || typeof account !== 'object') return account;
  const copy = { ...account };
  delete copy.password;
  if (stripServerFields) {
    delete copy.isPremium;
    delete copy.entitlements;
  }
  return copy;
}

async function ensureFreshAuthToken() {
  if (!FirebaseAuth.isConfigured()) return authToken;
  const fresh = await FirebaseAuth.getValidIdToken().catch(() => null);
  if (fresh) authToken = fresh;
  return authToken;
}

export const CloudSync = {
  setAuthToken(token) {
    authToken = token ? String(token).trim() : null;
  },

  getAuthToken() {
    return authToken;
  },

  getStatus() {
    return currentStatus;
  },

  onStatusChange(fn) {
    statusListeners.push(fn);
  },

  stopRealtimeListener() {
    if (eventSource) {
      try { eventSource.close(); } catch (_) {}
      eventSource = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (resumeCleanup) {
      try { resumeCleanup(); } catch (_) {}
      resumeCleanup = null;
    }
  },

  /**
   * Descarga una cuenta individual por ID y combina sus entitlements autoritativos del servidor.
   */
  async pullAccount(accountId) {
    if (!CONFIG.cloudSync?.enabled || !accountId) return null;
    await ensureFreshAuthToken();
    try {
      const [accRes, entRes] = await Promise.all([
        fetch(rtdbUrl(`/accounts/${safeKey(accountId)}.json`), { cache: 'no-store' }),
        FirebaseAuth.isConfigured()
          ? fetch(rtdbUrl(`/entitlements/${safeKey(accountId)}.json`), { cache: 'no-store' }).catch(() => null)
          : Promise.resolve(null)
      ]);
      if (!accRes.ok) return null;
      const acc = await accRes.json();
      if (!acc) return null;
      if (entRes?.ok) {
        const ent = await entRes.json().catch(() => null);
        if (ent && typeof ent === 'object') {
          acc.entitlements = ent;
          if (typeof ent.plus === 'boolean') acc.isPremium = ent.plus;
        }
      }
      return acc;
    } catch (_) {
      return null;
    }
  },

  /**
   * Descarga un grupo individual por ID.
   */
  async pullGroup(groupId) {
    if (!CONFIG.cloudSync?.enabled || !groupId) return null;
    await ensureFreshAuthToken();
    try {
      const res = await fetch(rtdbUrl(`/groups/${safeKey(groupId)}.json`), { cache: 'no-store' });
      if (!res.ok) return null;
      const grp = await res.json();
      if (grp?.id && grp.updatedAt) {
        lastGroupUpdatedAt.set(grp.id, grp.updatedAt);
      }
      return grp;
    } catch (_) {
      return null;
    }
  },

  /**
   * Descarga únicamente los datos permitidos para el usuario autenticado (reglas estrictas RTDB):
   * `/accounts/{uid}`, `/entitlements/{uid}`, `/userGroups/{uid}` y cada `/groups/{gid}` propio.
   */
  async pullUserState(uid) {
    if (!CONFIG.cloudSync?.enabled || !uid) return null;
    await ensureFreshAuthToken();
    try {
      const [account, userGroupsRes] = await Promise.all([
        this.pullAccount(uid),
        fetch(rtdbUrl(`/userGroups/${safeKey(uid)}.json`), { cache: 'no-store' })
      ]);

      const userGroupsMap = userGroupsRes.ok ? await userGroupsRes.json().catch(() => ({})) : {};
      const groupIds = (userGroupsMap && typeof userGroupsMap === 'object')
        ? Object.keys(userGroupsMap).filter(gid => userGroupsMap[gid] === true)
        : [];

      const groups = (await Promise.all(groupIds.map(gid => this.pullGroup(gid)))).filter(Boolean);
      setStatus('online');
      return {
        version: 3,
        rev: Date.now(),
        accounts: account ? [account] : [],
        groups
      };
    } catch (_) {
      setStatus('offline');
      return null;
    }
  },

  /**
   * Registra los índices seguros del usuario (`usernames/{user}`, `userGroups/{uid}/{gid}`, `inviteCodes/{code}`).
   */
  async syncUserIndexes({ account = null, groups = [] } = {}) {
    if (!CONFIG.cloudSync?.enabled || !FirebaseAuth.isConfigured()) return;
    await ensureFreshAuthToken();
    if (!authToken) return;

    const ops = [];
    if (account?.id && account.username && account.email) {
      const cleanUser = String(account.username).trim().toLowerCase().replace(/^@+/, '');
      if (cleanUser) {
        ops.push(
          fetch(rtdbUrl(`/usernames/${safeKey(cleanUser)}.json`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: account.id, email: String(account.email).trim().toLowerCase() })
          }).catch(() => {})
        );
      }
    }

    const uid = FirebaseAuth.getSession()?.uid || account?.id;
    (groups || []).forEach(g => {
      if (!g?.id) return;
      if (uid && !g.deleted && ((g.members || []).some(m => m.id === uid) || g.creatorId === uid)) {
        ops.push(
          fetch(rtdbUrl(`/userGroups/${safeKey(uid)}/${safeKey(g.id)}.json`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: 'true'
          }).catch(() => {})
        );
      }
      if (uid && g.creatorId === uid && g.code && !g.deleted) {
        const cleanCode = String(g.code).trim().toUpperCase();
        if (/^[A-Z0-9]{6}$/.test(cleanCode)) {
          ops.push(
            fetch(rtdbUrl(`/inviteCodes/${safeKey(cleanCode)}.json`), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ groupId: g.id, creatorId: uid })
            }).catch(() => {})
          );
        }
      }
    });

    await Promise.all(ops);
  },

  async removeUserGroupIndex(uid, groupId) {
    if (!CONFIG.cloudSync?.enabled || !uid || !groupId || !FirebaseAuth.isConfigured()) return;
    await ensureFreshAuthToken();
    try {
      await fetch(rtdbUrl(`/userGroups/${safeKey(uid)}/${safeKey(groupId)}.json`), {
        method: 'DELETE'
      });
    } catch (_) {}
  },

  /**
   * Busca un grupo por código en modo legacy (cuando Firebase Auth + Worker aún no están activos).
   */
  async findGroupByCode(code) {
    if (!CONFIG.cloudSync?.enabled || !code) return null;
    if (FirebaseAuth.isConfigured()) {
      // En modo seguro las búsquedas por código siempre pasan por BackendApi.joinGroupByCode
      return null;
    }
    const clean = String(code).trim().toUpperCase();
    try {
      const res = await fetch(rtdbUrl('/groups.json', 'shallow=true'), { cache: 'no-store' });
      if (!res.ok) return null;
      const indexMap = await res.json();
      if (!indexMap || typeof indexMap !== 'object') return null;
      const groupIds = Object.keys(indexMap);

      const matches = await Promise.all(
        groupIds.map(async (gid) => {
          try {
            const codeRes = await fetch(rtdbUrl(`/groups/${safeKey(gid)}/code.json`), { cache: 'no-store' });
            if (!codeRes.ok) return null;
            const remoteCode = await codeRes.json();
            if (String(remoteCode || '').trim().toUpperCase() === clean) {
              return gid;
            }
          } catch (_) {}
          return null;
        })
      );

      const matchedId = matches.find(Boolean);
      if (matchedId) {
        return await this.pullGroup(matchedId);
      }
      return null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Descarga el estado en la nube:
   * - Si Firebase Auth está configurado -> modo particionado seguro (`pullUserState(uid)`).
   * - Si aún no está configurado -> retrocompatibilidad v2 local/legacy.
   */
  async pullCloudState(force = false, uid = null) {
    if (!CONFIG.cloudSync?.enabled) return null;
    if (FirebaseAuth.isConfigured()) {
      const activeUid = uid || FirebaseAuth.getSession()?.uid;
      if (!activeUid) return null;
      return this.pullUserState(activeUid);
    }

    try {
      const metaRes = await fetch(rtdbUrl(`/meta.json`), { cache: 'no-store' });
      if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
      const meta = await metaRes.json();

      if (meta && meta.version === 2) {
        const [accRes, grpRes] = await Promise.all([
          fetch(rtdbUrl(`/accounts.json`), { cache: 'no-store' }),
          fetch(rtdbUrl(`/groups.json`), { cache: 'no-store' })
        ]);
        if (!accRes.ok || !grpRes.ok) throw new Error('Error descargando entidades v2');
        const [accRaw, grpRaw] = await Promise.all([accRes.json(), grpRes.json()]);

        const rev = Number(meta.rev) || 0;
        if (rev && (force || rev > lastKnownCloudRev)) {
          lastKnownCloudRev = rev;
        }
        setStatus('online');
        return {
          version: 2,
          rev,
          clientId: meta.clientId || '',
          updatedAt: meta.updatedAt || '',
          accounts: objectMapToArray(accRaw),
          groups: objectMapToArray(grpRaw)
        };
      }

      const legacyRes = await fetch(rtdbUrl(`/state.json`), { cache: 'no-store' });
      if (!legacyRes.ok) throw new Error(`HTTP ${legacyRes.status}`);
      const legacy = await legacyRes.json();
      if (legacy && (Array.isArray(legacy.accounts) || Array.isArray(legacy.groups))) {
        const rev = Number(legacy.rev) || 0;
        if (rev && (force || rev > lastKnownCloudRev)) {
          lastKnownCloudRev = rev;
        }
        setStatus('online');
        return {
          version: 1,
          rev,
          clientId: legacy.clientId || '',
          updatedAt: legacy.updatedAt || '',
          accounts: Array.isArray(legacy.accounts) ? legacy.accounts : [],
          groups: Array.isArray(legacy.groups) ? legacy.groups : [],
          needsV2Migration: true
        };
      }

      setStatus('online');
      return null;
    } catch (_) {
      setStatus('offline');
      return null;
    }
  },

  /**
   * Sube únicamente las cuentas y/o grupos modificados de forma atómica por entidad.
   */
  async pushEntities({ accounts = [], groups = [], clientId } = {}) {
    if (!CONFIG.cloudSync?.enabled) return false;
    const accList = (accounts || []).filter(a => a && a.id);
    const grpList = (groups || []).filter(g => g && g.id);
    if (!accList.length && !grpList.length) return true;

    const strictAuth = FirebaseAuth.isConfigured();
    if (strictAuth) {
      await ensureFreshAuthToken();
      if (!authToken) return false;
    }

    isPushing = true;
    setStatus('syncing');
    const rev = Date.now();
    lastKnownCloudRev = rev;

    try {
      const requests = [];
      const currentUid = FirebaseAuth.getSession()?.uid || null;

      accList.forEach(acc => {
        if (strictAuth && currentUid && acc.id !== currentUid) return;
        const cleanAcc = sanitizeAccountForCloud(acc, { stripServerFields: strictAuth });
        requests.push(
          fetch(rtdbUrl(`/accounts/${safeKey(acc.id)}.json`), {
            method: strictAuth ? 'PATCH' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanAcc)
          })
        );
      });

      grpList.forEach(grp => {
        const cleanGrp = compactGroupForStorage(grp);
        if (cleanGrp?.id && cleanGrp.updatedAt) {
          lastGroupUpdatedAt.set(cleanGrp.id, cleanGrp.updatedAt);
        }
        requests.push(
          fetch(rtdbUrl(`/groups/${safeKey(grp.id)}.json`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanGrp)
          })
        );
      });

      const responses = await Promise.all(requests);
      const failed = responses.find(r => !r.ok);
      if (failed) throw new Error(`HTTP ${failed.status}`);

      if (strictAuth) {
        await this.syncUserIndexes({
          account: accList[0] || null,
          groups: grpList
        });
      } else {
        const metaPayload = {
          version: 2,
          rev,
          clientId: clientId || 'ruma_client',
          updatedAt: new Date(rev).toISOString(),
          changedAccountId: accList.length === 1 && grpList.length === 0 ? accList[0].id : null,
          changedGroupId: grpList.length === 1 && accList.length === 0 ? grpList[0].id : null
        };

        const metaRes = await fetch(rtdbUrl(`/meta.json`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metaPayload)
        });
        if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
      }

      setStatus('online');
      return true;
    } catch (err) {
      console.warn('CloudSync pushEntities warning:', err);
      setStatus('offline');
      return false;
    } finally {
      isPushing = false;
    }
  },

  async pushCloudState({ accounts = [], groups = [], clientId } = {}) {
    return this.pushEntities({ accounts, groups, clientId });
  },

  async uploadChatMedia(groupId, mediaId, payload) {
    if (!groupId || !mediaId || !payload?.dataUrl) return false;
    chatMediaUrlCache.set(mediaId, payload.dataUrl);
    await MediaStorage.saveChatMedia(mediaId, { ...payload, groupId });

    if (!CONFIG.cloudSync?.enabled) return true;
    await ensureFreshAuthToken();
    try {
      const res = await fetch(rtdbUrl(`/chat_media/${safeKey(groupId)}/${safeKey(mediaId)}.json`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mediaId,
          type: payload.type || 'image',
          name: payload.name || '',
          duration: payload.duration || '',
          dataUrl: payload.dataUrl,
          createdAt: payload.createdAt || Date.now()
        })
      });
      return res.ok;
    } catch (err) {
      console.warn('CloudSync uploadChatMedia warning:', err);
      return false;
    }
  },

  async fetchChatMedia(groupId, mediaId) {
    if (!mediaId) return null;
    if (chatMediaUrlCache.has(mediaId)) return chatMediaUrlCache.get(mediaId);
    if (chatMediaInflight.has(mediaId)) return chatMediaInflight.get(mediaId);

    const task = (async () => {
      try {
        const local = await MediaStorage.getChatMedia(mediaId);
        if (local?.dataUrl) {
          chatMediaUrlCache.set(mediaId, local.dataUrl);
          return local.dataUrl;
        }
        if (!CONFIG.cloudSync?.enabled || !groupId) return null;
        await ensureFreshAuthToken();
        const res = await fetch(rtdbUrl(`/chat_media/${safeKey(groupId)}/${safeKey(mediaId)}.json`));
        if (!res.ok) return null;
        const remote = await res.json();
        if (remote?.dataUrl) {
          chatMediaUrlCache.set(mediaId, remote.dataUrl);
          MediaStorage.saveChatMedia(mediaId, { ...remote, groupId });
          return remote.dataUrl;
        }
        return null;
      } catch (_) {
        return null;
      } finally {
        chatMediaInflight.delete(mediaId);
      }
    })();

    chatMediaInflight.set(mediaId, task);
    return task;
  },

  async deleteChatMedia(groupId, mediaId) {
    if (!mediaId) return;
    chatMediaUrlCache.delete(mediaId);
    MediaStorage.deleteMedia(mediaId).catch(() => {});
    if (!CONFIG.cloudSync?.enabled || !groupId) return;
    await ensureFreshAuthToken();
    try {
      await fetch(rtdbUrl(`/chat_media/${safeKey(groupId)}/${safeKey(mediaId)}.json`), {
        method: 'DELETE'
      });
    } catch (_) {}
  },

  /**
   * Escucha particionada por grupo cuando Firebase Auth está activo (sin nodo `/meta` global).
   */
  startUserRealtimeListener(uid, getGroupIds, onRemoteState) {
    if (!CONFIG.cloudSync?.enabled || !uid) return;
    this.stopRealtimeListener();

    const pollUserGroupsOnce = async () => {
      if (isPushing || (typeof document !== 'undefined' && document.hidden)) return;
      await ensureFreshAuthToken();
      if (!authToken) return;
      try {
        const ids = typeof getGroupIds === 'function' ? getGroupIds() : [];
        if (!ids.length) return;
        const updatedGroups = [];
        await Promise.all(ids.map(async (gid) => {
          try {
            const res = await fetch(rtdbUrl(`/groups/${safeKey(gid)}/updatedAt.json`), { cache: 'no-store' });
            if (!res.ok) return;
            const remoteUpdatedAt = await res.json();
            if (remoteUpdatedAt && remoteUpdatedAt !== lastGroupUpdatedAt.get(gid)) {
              const fullGroup = await this.pullGroup(gid);
              if (fullGroup) updatedGroups.push(fullGroup);
            }
          } catch (_) {}
        }));
        setStatus('online');
        if (updatedGroups.length > 0 && typeof onRemoteState === 'function') {
          onRemoteState({ partial: true, rev: Date.now(), groups: updatedGroups });
        }
      } catch (_) {
        setStatus('offline');
      }
    };

    pollTimer = setInterval(pollUserGroupsOnce, 5000);

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onResume = () => {
        if (document.hidden) return;
        pollUserGroupsOnce();
      };
      document.addEventListener('visibilitychange', onResume);
      window.addEventListener('pageshow', onResume);
      window.addEventListener('online', onResume);
      resumeCleanup = () => {
        document.removeEventListener('visibilitychange', onResume);
        window.removeEventListener('pageshow', onResume);
        window.removeEventListener('online', onResume);
      };
    }
  },

  /**
   * Escucha legacy sobre `/meta.json` (solo cuando Firebase Auth aún no está configurado).
   */
  startRealtimeListener(clientId, onRemoteState) {
    if (!CONFIG.cloudSync?.enabled || FirebaseAuth.isConfigured()) return;
    this.stopRealtimeListener();

    const handleMeta = async (meta, fromPoll = false) => {
      if (!meta || isPushing) return;
      const rev = Number(meta.rev) || 0;
      if (!rev) return;
      if (meta.clientId === clientId && rev === lastKnownCloudRev) return;
      if (rev <= lastKnownCloudRev) return;

      const prevRev = lastKnownCloudRev;
      lastKnownCloudRev = rev;
      setStatus('online');

      if (typeof onRemoteState !== 'function') return;

      const canFetchSingle = prevRev > 0 && (!fromPoll || (rev - prevRev) < 8000);

      if (canFetchSingle && meta.changedGroupId && !meta.changedAccountId) {
        const grp = await this.pullGroup(meta.changedGroupId);
        if (grp) {
          onRemoteState({ partial: true, rev, groups: [grp] });
          return;
        }
      }

      if (canFetchSingle && meta.changedAccountId && !meta.changedGroupId) {
        const acc = await this.pullAccount(meta.changedAccountId);
        if (acc) {
          onRemoteState({ partial: true, rev, accounts: [acc] });
          return;
        }
      }

      const full = await this.pullCloudState(true);
      if (full) onRemoteState(full);
    };

    const pollMetaOnce = async () => {
      if (isPushing || (typeof document !== 'undefined' && document.hidden)) return;
      try {
        const res = await fetch(rtdbUrl(`/meta.json`), { cache: 'no-store' });
        if (!res.ok) return;
        const remoteMeta = await res.json();
        setStatus('online');
        if (remoteMeta && Number(remoteMeta.rev) > lastKnownCloudRev) {
          await handleMeta(remoteMeta, true);
        }
      } catch (_) {
        setStatus('offline');
      }
    };

    const connectEventSource = () => {
      if (typeof EventSource === 'undefined') return;
      try {
        if (eventSource) eventSource.close();
        eventSource = new EventSource(rtdbUrl(`/meta.json`));

        const onStreamPacket = async (e) => {
          setStatus('online');
          try {
            const packet = JSON.parse(e.data);
            if (!packet) return;
            if (packet.path === '/' && packet.data && typeof packet.data === 'object') {
              await handleMeta(packet.data, false);
            } else {
              const res = await fetch(rtdbUrl(`/meta.json`), { cache: 'no-store' });
              if (res.ok) {
                const freshMeta = await res.json();
                await handleMeta(freshMeta, false);
              }
            }
          } catch (_) {}
        };

        eventSource.addEventListener('put', onStreamPacket);
        eventSource.addEventListener('patch', onStreamPacket);
        eventSource.onerror = () => {};
      } catch (_) {}
    };

    connectEventSource();
    pollTimer = setInterval(pollMetaOnce, 5000);

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const onResume = () => {
        if (document.hidden) return;
        if (typeof EventSource !== 'undefined' && (!eventSource || eventSource.readyState === EventSource.CLOSED)) {
          connectEventSource();
        }
        pollMetaOnce();
      };
      document.addEventListener('visibilitychange', onResume);
      window.addEventListener('pageshow', onResume);
      window.addEventListener('online', onResume);
      resumeCleanup = () => {
        document.removeEventListener('visibilitychange', onResume);
        window.removeEventListener('pageshow', onResume);
        window.removeEventListener('online', onResume);
      };
    }
  }
};
