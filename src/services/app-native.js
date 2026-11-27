/**
 * ruma 🌟 — Motor de Funciones Nativas de Aplicación
 * - Notificaciones del sistema (Capacitor LocalNotifications en APK Android + Web Notifications / Service Worker)
 * - Sincronización en segundo plano (Background Sync API, Page Visibility, WakeLock para cargas largas a Drive)
 * - Instalación PWA / Preparación para compilación APK con Capacitor
 */

import { CONFIG } from '../core/config.js';

const PREFS_KEY = 'ruma_native_app_prefs_v1';

const DEFAULT_PREFS = {
  notificationsEnabled: true,
  notifyChat: true,
  notifyMemories: true,
  notifyPlans: true,
  notifyDriveUpload: true,
  backgroundSyncEnabled: true,
  keepAwakeDuringUpload: true
};

let swRegistration = null;
let deferredInstallPrompt = null;
let activeWakeLock = null;
const installListeners = [];

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) || {}) };
  } catch (_) {
    return { ...DEFAULT_PREFS };
  }
}

function writePrefs(prefs) {
  const merged = { ...DEFAULT_PREFS, ...(prefs || {}) };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch (_) {}
  return merged;
}

export const AppNativeService = {
  _initialized: false,
  _seenEventIds: new Set(),

  getPreferences() {
    return readPrefs();
  },

  updatePreferences(patch = {}) {
    const current = readPrefs();
    return writePrefs({ ...current, ...patch });
  },

  isCapacitorNative() {
    try {
      return Boolean(typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform?.());
    } catch (_) {
      return false;
    }
  },

  isStandaloneApp() {
    if (this.isCapacitorNative()) return true;
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true
    );
  },

  canPromptInstall() {
    return Boolean(deferredInstallPrompt);
  },

  onInstallAvailabilityChange(fn) {
    if (typeof fn !== 'function') return () => {};
    installListeners.push(fn);
    return () => {
      const idx = installListeners.indexOf(fn);
      if (idx >= 0) installListeners.splice(idx, 1);
    };
  },

  async promptInstallApp() {
    if (!deferredInstallPrompt) {
      return { ok: false, reason: 'unavailable' };
    }
    try {
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installListeners.forEach(fn => { try { fn(false); } catch (_) {} });
      return { ok: choice?.outcome === 'accepted', outcome: choice?.outcome || 'dismissed' };
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudo abrir el instalador.' };
    }
  },

  getNotificationPermissionStatus() {
    if (this.isCapacitorNative()) return 'granted';
    if (typeof globalThis.Notification === 'undefined') return 'unsupported';
    return globalThis.Notification.permission; // 'granted' | 'denied' | 'default'
  },

  async requestNotificationPermission() {
    if (this.isCapacitorNative()) {
      try {
        const mod = await import('@capacitor/local-notifications');
        const res = await mod.LocalNotifications.requestPermissions();
        const granted = res?.display === 'granted';
        if (granted) this.updatePreferences({ notificationsEnabled: true });
        return { ok: granted, status: granted ? 'granted' : 'denied' };
      } catch (_) {
        // Fallback a Web Notification si el plugin no está enlazado
      }
    }

    if (typeof globalThis.Notification === 'undefined') {
      return { ok: false, status: 'unsupported', error: 'Este navegador no soporta notificaciones nativas.' };
    }

    try {
      const permission = await globalThis.Notification.requestPermission();
      if (permission === 'granted') {
        this.updatePreferences({ notificationsEnabled: true });
      }
      return { ok: permission === 'granted', status: permission };
    } catch (err) {
      return { ok: false, status: 'error', error: err?.message || 'No se pudo solicitar el permiso.' };
    }
  },

  async sendSystemNotification({ title, body, tag = 'ruma-notif', data = {}, silent = false }) {
    const prefs = this.getPreferences();
    if (!prefs.notificationsEnabled) return false;

    const cleanTitle = String(title || CONFIG.appName || 'ruma').trim();
    const cleanBody = String(body || '').trim();
    if (!cleanBody) return false;

    // 1. Si corre dentro del APK Android de Capacitor -> usar @capacitor/local-notifications
    if (this.isCapacitorNative()) {
      try {
        const mod = await import('@capacitor/local-notifications');
        await mod.LocalNotifications.schedule({
          notifications: [
            {
              id: Math.floor(Date.now() % 2147483000),
              title: cleanTitle,
              body: cleanBody,
              extra: data
            }
          ]
        });
        return true;
      } catch (_) {}
    }

    // 2. Web / PWA instalada -> usar ServiceWorkerRegistration.showNotification o Notification API
    if (typeof globalThis.Notification === 'undefined' || globalThis.Notification.permission !== 'granted') {
      return false;
    }

    const notifOptions = {
      body: cleanBody,
      icon: 'assets/ruma_icon_192.png',
      badge: 'assets/ruma_icon_192.png',
      tag,
      renotify: false,
      silent: Boolean(silent),
      data
    };

    try {
      if (swRegistration && typeof swRegistration.showNotification === 'function') {
        await swRegistration.showNotification(cleanTitle, notifOptions);
        return true;
      }
      const n = new globalThis.Notification(cleanTitle, notifOptions);
      n.onclick = () => {
        try { window.focus(); } catch (_) {}
        n.close();
      };
      return true;
    } catch (_) {
      return false;
    }
  },

  /**
   * Mantiene activo el procesador de pantalla durante subidas pesadas a Google Drive para evitar que el móvil corte la subida
   */
  async setUploadWakeLock(active) {
    const prefs = this.getPreferences();
    if (!prefs.keepAwakeDuringUpload) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;

    try {
      if (active && !activeWakeLock) {
        activeWakeLock = await navigator.wakeLock.request('screen');
        activeWakeLock.addEventListener?.('release', () => {
          activeWakeLock = null;
        });
      } else if (!active && activeWakeLock) {
        await activeWakeLock.release();
        activeWakeLock = null;
      }
    } catch (_) {
      activeWakeLock = null;
    }
  },

  /**
   * Registra una tarea de Background Sync en el Service Worker para reanudar cargas pendientes al recuperar red
   */
  async registerBackgroundSyncTag(tag = 'ruma-drive-resume') {
    const prefs = this.getPreferences();
    if (!prefs.backgroundSyncEnabled) return false;
    if (!swRegistration) return false;
    try {
      if (swRegistration.sync && typeof swRegistration.sync.register === 'function') {
        await swRegistration.sync.register(tag);
        return true;
      }
    } catch (_) {}
    return false;
  },

  /**
   * Inicializa Service Worker, listeners de ciclo de vida (visibilidad, reconexión, foco) y notificaciones de eventos
   */
  init(store) {
    if (this._initialized || typeof window === 'undefined') return;
    this._initialized = true;

    // Capturar evento de instalación PWA / APK WebAPK en Android Chrome
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installListeners.forEach(fn => { try { fn(true); } catch (_) {} });
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installListeners.forEach(fn => { try { fn(false); } catch (_) {} });
    });

    // Registrar Service Worker para caché offline, notificaciones nativas y Background Sync
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js')
        .then(async (reg) => {
          swRegistration = reg;
          try {
            if (reg.periodicSync && typeof reg.periodicSync.register === 'function') {
              await reg.periodicSync.register('ruma-periodic-sync', {
                minInterval: 15 * 60 * 1000
              });
            }
          } catch (_) {}
        })
        .catch(() => {});

      navigator.serviceWorker.addEventListener('message', (event) => {
        const msg = event?.data;
        if (!msg || !store) return;
        if (msg.type === 'RUMA_BACKGROUND_SYNC') {
          store.syncNowWithCloud?.().catch(() => {});
          store.resumePendingDriveUploads?.();
        } else if (msg.type === 'RUMA_NOTIFICATION_CLICK' && msg.data?.groupId) {
          store.setActiveGroup?.(msg.data.groupId);
          store.navigate?.('group', { groupTab: msg.data.groupTab || 'home' });
        }
      });
    }

    // Sembrar IDs de mensajes/recuerdos/planes actuales para solo notificar los nuevos que lleguen después
    this._seedExistingEvents(store);

    // Ciclo de vida de aplicación: al volver al primer plano o recuperar foco, sincronizar nube y reanudar subidas a Drive
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && store) {
        const prefs = this.getPreferences();
        if (prefs.backgroundSyncEnabled) {
          store.syncNowWithCloud?.().catch(() => {});
          store.resumePendingDriveUploads?.();
        }
      }
    });

    window.addEventListener('focus', () => {
      if (store && this.getPreferences().backgroundSyncEnabled) {
        store.resumePendingDriveUploads?.();
      }
    });

    // Suscribirse al estado de subida a Google Drive para WakeLock, Background Sync y notificación al completar
    if (store?.onDriveUploadChange) {
      let lastStatus = 'idle';
      store.onDriveUploadChange((state) => {
        const st = state?.status || 'idle';
        if (st === 'uploading') {
          this.setUploadWakeLock(true);
        } else {
          this.setUploadWakeLock(false);
        }

        if (st === 'paused') {
          this.registerBackgroundSyncTag('ruma-drive-resume');
        }

        if (st === 'completed' && lastStatus === 'uploading') {
          const prefs = this.getPreferences();
          if (prefs.notifyDriveUpload) {
            this.sendSystemNotification({
              title: '☁️ Carga completada en Google Drive',
              body: `El recuerdo "${state.title || 'Recuerdo'}" ya está respaldado en tu carpeta Ruma 🌷.`,
              tag: `drive-done-${state.memoryId || Date.now()}`,
              data: { groupId: state.groupId || '', groupTab: 'memories' }
            });
          }
        }
        lastStatus = st;
      });
    }
  },

  _seedExistingEvents(store) {
    if (!store) return;
    try {
      const groups = store.getGroups?.() || [];
      groups.forEach((g) => {
        (g.messages || []).forEach((m) => { if (m?.id) this._seenEventIds.add(`msg_${m.id}`); });
        (g.memories || []).forEach((m) => { if (m?.id) this._seenEventIds.add(`mem_${m.id}`); });
        (g.plans || []).forEach((p) => { if (p?.id) this._seenEventIds.add(`plan_${p.id}`); });
      });
    } catch (_) {}
  },

  /**
   * Evalúa los cambios recién llegados desde la nube en segundo plano y dispara notificaciones si hay
   * nuevos mensajes de chat, nuevos recuerdos o nuevos planes creados por otros miembros del grupo.
   */
  inspectRemoteUpdatesForNotifications(store, incomingGroups = []) {
    if (!store || !Array.isArray(incomingGroups)) return;
    const currentUser = store.getCurrentUser?.();
    if (!currentUser) return;

    const prefs = this.getPreferences();
    if (!prefs.notificationsEnabled) return;

    const isAppHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const activeGroup = store.getActiveGroup?.();
    const inActiveChat = !isAppHidden && store.currentInterface === 'group' && store.currentGroupTab === 'chat';

    incomingGroups.forEach((g) => {
      if (!g || g.deleted) return;
      const isMember = g.creatorId === currentUser.id || (g.members || []).some(m => m.id === currentUser.id);
      if (!isMember) return;

      // 1. Nuevos mensajes de chat de otros miembros
      if (prefs.notifyChat && Array.isArray(g.messages)) {
        g.messages.forEach((msg) => {
          if (!msg?.id) return;
          const key = `msg_${msg.id}`;
          if (this._seenEventIds.has(key)) return;
          this._seenEventIds.add(key);

          if (msg.authorId && msg.authorId !== currentUser.id) {
            if (inActiveChat && activeGroup?.id === g.id) return;
            this.sendSystemNotification({
              title: `💬 ${msg.authorName || 'Miembro'} en ${g.name}`,
              body: msg.text || (msg.media ? '📎 Envió una foto o archivo' : 'Nuevo mensaje en el chat'),
              tag: `chat-${g.id}`,
              data: { groupId: g.id, groupTab: 'chat' }
            });
          }
        });
      }

      // 2. Nuevos recuerdos subidos por otros miembros
      if (prefs.notifyMemories && Array.isArray(g.memories)) {
        g.memories.forEach((mem) => {
          if (!mem?.id) return;
          const key = `mem_${mem.id}`;
          if (this._seenEventIds.has(key)) return;
          this._seenEventIds.add(key);

          if (mem.authorId && mem.authorId !== currentUser.id) {
            this.sendSystemNotification({
              title: `📸 Nuevo recuerdo en ${g.name}`,
              body: `${mem.authorName || 'Alguien'} inmortalizó "${mem.title || 'un recuerdo'}"`,
              tag: `mem-${mem.id}`,
              data: { groupId: g.id, groupTab: 'memories' }
            });
          }
        });
      }

      // 3. Nuevos planes agendados por otros miembros
      if (prefs.notifyPlans && Array.isArray(g.plans)) {
        g.plans.forEach((plan) => {
          if (!plan?.id) return;
          const key = `plan_${plan.id}`;
          if (this._seenEventIds.has(key)) return;
          this._seenEventIds.add(key);

          if (plan.authorId && plan.authorId !== currentUser.id) {
            this.sendSystemNotification({
              title: `📅 Nuevo plan en ${g.name}`,
              body: `${plan.authorName || 'Alguien'} agendó "${plan.title || 'un plan'}" para el ${plan.date || ''}`,
              tag: `plan-${plan.id}`,
              data: { groupId: g.id, groupTab: 'memories' }
            });
          }
        });
      }
    });
  }
};
