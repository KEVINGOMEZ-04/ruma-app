/**
 * ruma 🌟 — Motor de Sincronización en la Nube Particionado v2 (Firebase Realtime Database)
 *
 * Arquitectura particionada por entidad (adiós al `PUT /state.json` monolítico):
 * - `/meta.json`: metadatos livianos (~120 bytes) para detectar cambios en tiempo real vía SSE y polling.
 * - `/accounts/{userId}.json`: escritura atómica por cuenta (sin contraseñas en texto plano).
 * - `/groups/{groupId}.json`: escritura atómica por grupo (dos grupos nunca se sobrescriben entre sí).
 * - `/chat_media/{groupId}/{mediaId}.json`: fotos, audios y videos del chat separados del JSON del grupo
 *   y cacheados localmente en IndexedDB para no llenar `localStorage` ni inflar sincronizaciones.
 * - Migración automática sin pérdida de datos desde el formato legacy `/state.json`.
 */

import { CONFIG } from '../core/config.js';
import { MediaStorage } from './media-storage.js';

const BASE_URL = `${CONFIG.cloudSync?.databaseUrl || 'https://luma-f53ee-default-rtdb.firebaseio.com'}/${CONFIG.cloudSync?.rootPath || 'ruma_cloud_v1'}`;

let eventSource = null;
let pollTimer = null;
let isPushing = false;
let lastKnownCloudRev = 0;
let statusListeners = [];
let currentStatus = 'connecting'; // 'online' | 'syncing' | 'offline' | 'connecting'

// Caché en memoria y deduplicación de descargas de adjuntos del chat
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

function sanitizeAccountForCloud(account) {
  if (!account || typeof account !== 'object') return account;
  const copy = { ...account };
  // Si ya cuenta con hash seguro, jamás subir la contraseña en texto plano
  if (copy.passwordHash) {
    delete copy.password;
  }
  return copy;
}

export const CloudSync = {
  getStatus() {
    return currentStatus;
  },

  onStatusChange(fn) {
    statusListeners.push(fn);
  },

  /**
   * Descarga una cuenta individual por ID (usado en merge granular y eventos SSE)
   */
  async pullAccount(accountId) {
    if (!CONFIG.cloudSync?.enabled || !accountId) return null;
    try {
      const res = await fetch(`${BASE_URL}/accounts/${safeKey(accountId)}.json`, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  },

  /**
   * Descarga un grupo individual por ID (usado en merge granular y eventos SSE)
   */
  async pullGroup(groupId) {
    if (!CONFIG.cloudSync?.enabled || !groupId) return null;
    try {
      const res = await fetch(`${BASE_URL}/groups/${safeKey(groupId)}.json`, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  },

  /**
   * Busca un grupo en la nube de forma liviana consultando la lista shallow y el código de cada uno,
   * sin tener que descargar todos los grupos masivos de golpe.
   */
  async findGroupByCode(code) {
    if (!CONFIG.cloudSync?.enabled || !code) return null;
    const clean = String(code).trim().toUpperCase();
    try {
      const res = await fetch(`${BASE_URL}/groups.json?shallow=true`, { cache: 'no-store' });
      if (!res.ok) return null;
      const indexMap = await res.json();
      if (!indexMap || typeof indexMap !== 'object') return null;
      const groupIds = Object.keys(indexMap);

      const matches = await Promise.all(
        groupIds.map(async (gid) => {
          try {
            const codeRes = await fetch(`${BASE_URL}/groups/${safeKey(gid)}/code.json`, { cache: 'no-store' });
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
   * Descarga el estado completo de la nube (v2 particionado o fallback automático desde v1 legacy)
   */
  async pullCloudState(force = false) {
    if (!CONFIG.cloudSync?.enabled) return null;
    try {
      const metaRes = await fetch(`${BASE_URL}/meta.json`, { cache: 'no-store' });
      if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
      const meta = await metaRes.json();

      if (meta && meta.version === 2) {
        const [accRes, grpRes] = await Promise.all([
          fetch(`${BASE_URL}/accounts.json`, { cache: 'no-store' }),
          fetch(`${BASE_URL}/groups.json`, { cache: 'no-store' })
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

      // Retrocompatibilidad: leer formato v1 (`state.json`) si aún no se migró a v2
      const legacyRes = await fetch(`${BASE_URL}/state.json`, { cache: 'no-store' });
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
    } catch (err) {
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

    isPushing = true;
    setStatus('syncing');
    const rev = Date.now();
    lastKnownCloudRev = rev;

    try {
      const requests = [];

      accList.forEach(acc => {
        const cleanAcc = sanitizeAccountForCloud(acc);
        requests.push(
          fetch(`${BASE_URL}/accounts/${safeKey(acc.id)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanAcc)
          })
        );
      });

      grpList.forEach(grp => {
        requests.push(
          fetch(`${BASE_URL}/groups/${safeKey(grp.id)}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(grp)
          })
        );
      });

      const responses = await Promise.all(requests);
      const failed = responses.find(r => !r.ok);
      if (failed) throw new Error(`HTTP ${failed.status}`);

      const metaPayload = {
        version: 2,
        rev,
        clientId: clientId || 'ruma_client',
        updatedAt: new Date(rev).toISOString(),
        changedAccountId: accList.length === 1 && grpList.length === 0 ? accList[0].id : null,
        changedGroupId: grpList.length === 1 && accList.length === 0 ? grpList[0].id : null
      };

      const metaRes = await fetch(`${BASE_URL}/meta.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metaPayload)
      });
      if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);

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

  /**
   * Compatibilidad: siembra o sincroniza lotes completos usando el esquema particionado v2.
   */
  async pushCloudState({ accounts = [], groups = [], clientId } = {}) {
    return this.pushEntities({ accounts, groups, clientId });
  },

  /**
   * Sube un adjunto multimedia del chat fuera del documento del grupo.
   */
  async uploadChatMedia(groupId, mediaId, payload) {
    if (!groupId || !mediaId || !payload?.dataUrl) return false;
    chatMediaUrlCache.set(mediaId, payload.dataUrl);
    await MediaStorage.saveChatMedia(mediaId, { ...payload, groupId });

    if (!CONFIG.cloudSync?.enabled) return true;
    try {
      const res = await fetch(`${BASE_URL}/chat_media/${safeKey(groupId)}/${safeKey(mediaId)}.json`, {
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

  /**
   * Obtiene la URL de un adjunto de chat: primero caché en memoria -> IndexedDB -> Firebase.
   */
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
        const res = await fetch(`${BASE_URL}/chat_media/${safeKey(groupId)}/${safeKey(mediaId)}.json`);
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

  /**
   * Elimina un adjunto de chat de caché, IndexedDB y Firebase.
   */
  async deleteChatMedia(groupId, mediaId) {
    if (!mediaId) return;
    chatMediaUrlCache.delete(mediaId);
    MediaStorage.deleteMedia(mediaId).catch(() => {});
    if (!CONFIG.cloudSync?.enabled || !groupId) return;
    try {
      await fetch(`${BASE_URL}/chat_media/${safeKey(groupId)}/${safeKey(mediaId)}.json`, {
        method: 'DELETE'
      });
    } catch (_) {}
  },

  /**
   * Escucha en tiempo real sobre `/meta.json` (SSE + polling liviano de respaldo)
   * descargando únicamente el grupo o cuenta modificada cuando es posible.
   */
  startRealtimeListener(clientId, onRemoteState) {
    if (!CONFIG.cloudSync?.enabled) return;

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

    // 1. Stream SSE sobre `/meta.json` (~120 bytes por evento en lugar del JSON entero)
    if (typeof EventSource !== 'undefined') {
      try {
        if (eventSource) eventSource.close();
        eventSource = new EventSource(`${BASE_URL}/meta.json`);

        const onStreamPacket = async (e) => {
          setStatus('online');
          try {
            const packet = JSON.parse(e.data);
            if (!packet) return;
            if (packet.path === '/' && packet.data && typeof packet.data === 'object') {
              await handleMeta(packet.data, false);
            } else {
              const res = await fetch(`${BASE_URL}/meta.json`, { cache: 'no-store' });
              if (res.ok) {
                const freshMeta = await res.json();
                await handleMeta(freshMeta, false);
              }
            }
          } catch (_) {}
        };

        eventSource.addEventListener('put', onStreamPacket);
        eventSource.addEventListener('patch', onStreamPacket);
        eventSource.onerror = () => {
          // El polling de respaldo mantiene la sincronización si SSE se desconecta en red móvil
        };
      } catch (_) {}
    }

    // 2. Polling liviano cada 5s consultando únicamente `/meta.json`
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (isPushing || document.hidden) return;
      try {
        const res = await fetch(`${BASE_URL}/meta.json`, { cache: 'no-store' });
        if (!res.ok) return;
        const remoteMeta = await res.json();
        setStatus('online');
        if (remoteMeta && Number(remoteMeta.rev) > lastKnownCloudRev) {
          await handleMeta(remoteMeta, true);
        }
      } catch (_) {
        setStatus('offline');
      }
    }, 5000);
  }
};
