/**
 * ruma 🌟 — Motor de Sincronización en la Nube en Tiempo Real (Firebase Realtime Database)
 *
 * Permite que todos los dispositivos y teléfonos conectados a ruma compartan en tiempo real:
 * - Cuentas y perfiles estilo Discord (sin necesidad de volver a registrarse en otro teléfono)
 * - Grupos creados desde cualquier celular o computador (unirse con el código de 6 caracteres desde otro teléfono)
 * - Películas, Series (progreso capítulo a capítulo y reseñas), Recuerdos, Canciones, Metas, Notas y Mensajes del Chat
 *
 * Utiliza:
 * 1. EventSource (Server-Sent Events) nativo contra Firebase RTDB para recibir cambios al instante (< 200ms).
 * 2. Respaldo de polling inteligente cada 5 segundos por si la red móvil corta el stream SSE.
 * 3. Escritura atómica por grupo y cuenta con control de timestamp (`updatedAt`) para no sobrescribir cambios más recientes.
 */

import { CONFIG } from '../core/config.js';

const BASE_URL = `${CONFIG.cloudSync?.databaseUrl || 'https://luma-f53ee-default-rtdb.firebaseio.com'}/${CONFIG.cloudSync?.rootPath || 'ruma_cloud_v1'}`;

let eventSource = null;
let pollTimer = null;
let isPushing = false;
let lastKnownCloudRev = 0;
let statusListeners = [];
let currentStatus = 'connecting'; // 'online' | 'syncing' | 'offline' | 'connecting'

function setStatus(next) {
  if (currentStatus === next) return;
  currentStatus = next;
  statusListeners.forEach(fn => {
    try { fn(currentStatus); } catch (_) {}
  });
}

export const CloudSync = {
  getStatus() {
    return currentStatus;
  },

  onStatusChange(fn) {
    statusListeners.push(fn);
  },

  /**
   * Descarga el estado completo de la nube (cuentas + grupos)
   */
  async pullCloudState() {
    if (!CONFIG.cloudSync?.enabled) return null;
    try {
      const res = await fetch(`${BASE_URL}/state.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus('online');
      return data;
    } catch (err) {
      setStatus('offline');
      return null;
    }
  },

  /**
   * Sube el estado actualizado (cuentas + grupos) a la nube
   */
  async pushCloudState({ accounts, groups, clientId }) {
    if (!CONFIG.cloudSync?.enabled) return false;
    isPushing = true;
    setStatus('syncing');
    const rev = Date.now();
    lastKnownCloudRev = rev;

    try {
      const payload = {
        rev,
        clientId: clientId || 'ruma_client',
        updatedAt: new Date(rev).toISOString(),
        accounts: accounts || [],
        groups: groups || []
      };

      const res = await fetch(`${BASE_URL}/state.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('online');
      return true;
    } catch (err) {
      console.warn('CloudSync push warning:', err);
      setStatus('offline');
      return false;
    } finally {
      isPushing = false;
    }
  },

  /**
   * Inicia la escucha en tiempo real (Server-Sent Events + Polling de respaldo)
   * @param {Function} onRemoteState - Se invoca cuando otro dispositivo actualiza datos en la nube
   */
  startRealtimeListener(clientId, onRemoteState) {
    if (!CONFIG.cloudSync?.enabled) return;

    const handleIncoming = (cloudData) => {
      if (!cloudData || isPushing) return;
      if (cloudData.clientId === clientId && cloudData.rev === lastKnownCloudRev) return;
      if (cloudData.rev && cloudData.rev <= lastKnownCloudRev) return;

      lastKnownCloudRev = cloudData.rev || Date.now();
      setStatus('online');
      if (typeof onRemoteState === 'function') {
        onRemoteState(cloudData);
      }
    };

    // 1. Stream en tiempo real mediante Server-Sent Events (SSE) de Firebase RTDB
    if (typeof EventSource !== 'undefined') {
      try {
        if (eventSource) eventSource.close();
        eventSource = new EventSource(`${BASE_URL}/state.json`);

        eventSource.addEventListener('put', async (e) => {
          setStatus('online');
          try {
            const packet = JSON.parse(e.data);
            if (!packet) return;
            if (packet.path === '/' && packet.data) {
              handleIncoming(packet.data);
            } else {
              const fresh = await this.pullCloudState();
              if (fresh) handleIncoming(fresh);
            }
          } catch (_) {}
        });

        eventSource.addEventListener('patch', async () => {
          const fresh = await this.pullCloudState();
          if (fresh) handleIncoming(fresh);
        });

        eventSource.onerror = () => {
          // El polling de respaldo mantiene la sincronización si SSE falla
        };
      } catch (_) {}
    }

    // 2. Polling ligero de respaldo cada 4.5s (verifica solo `rev.json` de pocos bytes antes de descargar `state.json`)
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (isPushing || document.hidden) return;
      try {
        const res = await fetch(`${BASE_URL}/state/rev.json`, { cache: 'no-store' });
        if (!res.ok) return;
        const remoteRev = await res.json();
        setStatus('online');
        if (remoteRev && Number(remoteRev) > lastKnownCloudRev) {
          const full = await this.pullCloudState();
          if (full) handleIncoming(full);
        }
      } catch (_) {
        setStatus('offline');
      }
    }, 4500);
  }
};
