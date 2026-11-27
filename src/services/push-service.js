/**
 * ruma 🌟 — Servicio de Notificaciones Push en 2.º Plano (Firebase Cloud Messaging / Capacitor 8)
 *
 * - Crea canales de notificación Android (`chat_messages`, `group_activity`, `drive_uploads`, `reminders`).
 * - Pide el permiso `POST_NOTIFICATIONS` únicamente en contexto (nunca al abrir el login por primera vez).
 * - Registra el token FCM en Cloudflare Worker (`/api/push/register`) y lo elimina al cerrar sesión.
 * - Navega directamente al grupo/chat cuando el usuario toca una notificación con la app cerrada.
 */

import { PushNotifications } from '@capacitor/push-notifications';
import { CONFIG } from '../core/config.js';
import { NativePlatform } from './native-platform.js';
import { BackendApi } from './backend-api.js';

let listenersBound = false;
let currentToken = null;
let storeRef = null;

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(CONFIG.storageKeys.pushDeviceId);
    if (!id) {
      const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).slice(2, 12);
      id = `dev_${NativePlatform.getPlatform()}_${rand}`;
      localStorage.setItem(CONFIG.storageKeys.pushDeviceId, id);
    }
    return id;
  } catch (_) {
    return `dev_${NativePlatform.getPlatform()}_temp`;
  }
}

async function ensureAndroidChannels() {
  if (!NativePlatform.isAndroid() || typeof PushNotifications.createChannel !== 'function') return;
  const channels = [
    {
      id: 'chat_messages',
      name: 'Mensajes del chat',
      description: 'Mensajes nuevos y notas de voz en tus grupos privados de ruma',
      importance: 4,
      visibility: 1,
      vibration: true
    },
    {
      id: 'group_activity',
      name: 'Actividad del grupo',
      description: 'Nuevos recuerdos, miembros, películas, libros y planes',
      importance: 3,
      visibility: 1,
      vibration: true
    },
    {
      id: 'drive_uploads',
      name: 'Subidas a Google Drive',
      description: 'Progreso de respaldo de fotos y videos en segundo plano',
      importance: 2,
      visibility: 1,
      vibration: false
    },
    {
      id: 'reminders',
      name: 'Recordatorios de planes y metas',
      description: 'Avisos programados de fechas importantes en tus grupos',
      importance: 4,
      visibility: 1,
      vibration: true
    }
  ];

  for (const ch of channels) {
    try {
      await PushNotifications.createChannel(ch);
    } catch (_) {}
  }
}

export const PushService = {
  isSupported() {
    return NativePlatform.isNative();
  },

  getToken() {
    return currentToken;
  },

  async checkPermissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    try {
      const status = await PushNotifications.checkPermissions();
      return status?.receive || 'prompt';
    } catch (_) {
      return 'prompt';
    }
  },

  async init({ store, UI } = {}) {
    storeRef = store || storeRef;
    if (!this.isSupported()) return;

    await ensureAndroidChannels();

    if (!listenersBound) {
      listenersBound = true;

      PushNotifications.addListener('registration', async (tokenObj) => {
        const token = tokenObj?.value || '';
        if (!token) return;
        currentToken = token;
        if (storeRef?.getCurrentUser?.() && BackendApi.isConfigured()) {
          await BackendApi.registerPushToken({
            deviceId: getOrCreateDeviceId(),
            token,
            platform: NativePlatform.getPlatform()
          }).catch(() => {});
        }
      }).catch(() => {});

      PushNotifications.addListener('registrationError', (err) => {
        console.warn('FCM registration error:', err);
      }).catch(() => {});

      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        const activeGroup = storeRef?.getActiveGroup?.();
        const incomingGroupId = notification?.data?.groupId || '';
        const isAlreadyInThatChat = Boolean(
          activeGroup &&
          activeGroup.id === incomingGroupId &&
          storeRef?.currentInterface === 'group' &&
          storeRef?.currentGroupTab === 'chat'
        );
        if (!isAlreadyInThatChat && notification?.title) {
          UI?.showToast?.(`${notification.title}: ${notification.body || ''}`.trim(), 'info');
        }
        storeRef?.syncNowWithCloud?.().catch(() => {});
      }).catch(() => {});

      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action?.notification?.data || {};
        const groupId = data.groupId;
        const tab = data.tab || (data.type === 'chat' ? 'chat' : 'home');
        if (groupId && storeRef?.getCurrentUser?.()) {
          const res = storeRef.setActiveGroup(groupId);
          if (res?.ok && tab && tab !== 'home') {
            storeRef.navigate('group', { groupTab: tab });
          }
        }
      }).catch(() => {});
    }

    // Si ya tiene permiso concedido, registrar silenciosamente sin volver a preguntar
    const perm = await this.checkPermissionStatus();
    if (perm === 'granted') {
      await PushNotifications.register().catch(() => {});
    }
  },

  /**
   * Solicita permiso contextual de notificaciones (Android 13+ POST_NOTIFICATIONS) y registra FCM.
   */
  async enableNotifications() {
    if (!this.isSupported()) {
      return { ok: false, error: 'Las notificaciones push en 2.º plano están disponibles en la app Android.' };
    }
    try {
      await ensureAndroidChannels();
      let status = await PushNotifications.checkPermissions();
      if (status.receive !== 'granted') {
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== 'granted') {
        return { ok: false, error: 'Permiso de notificaciones denegado. Puedes activarlo en Ajustes del teléfono.' };
      }
      await PushNotifications.register();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudieron activar las notificaciones push.' };
    }
  },

  async syncTokenForCurrentUser() {
    if (!this.isSupported() || !currentToken || !BackendApi.isConfigured()) return false;
    const res = await BackendApi.registerPushToken({
      deviceId: getOrCreateDeviceId(),
      token: currentToken,
      platform: NativePlatform.getPlatform()
    });
    return Boolean(res?.ok);
  },

  async unregisterOnLogout() {
    if (!BackendApi.isConfigured()) return;
    await BackendApi.unregisterPushToken(getOrCreateDeviceId()).catch(() => {});
  },

  /**
   * Dispara push silencioso a los demás miembros del grupo cuando se envía un mensaje o evento.
   */
  notifyGroup({ groupId, type = 'chat', title, body }) {
    if (!groupId || !body || !BackendApi.isConfigured()) return;
    BackendApi.notifyGroupEvent({ groupId, type, title, body }).catch(() => {});
  }
};
