/**
 * ruma 🌟 — Recordatorios Programados en 2.º Plano (Planes, Actividades y Metas con fecha)
 *
 * Usa `@capacitor/local-notifications` v8 con alarmas INEXACTAS (cumple políticas Google Play Android 14–16
 * sin declarar USE_EXACT_ALARM ni SCHEDULE_EXACT_ALARM).
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { CONFIG } from '../core/config.js';
import { NativePlatform } from './native-platform.js';

let listenersBound = false;

function hashToNotificationId(key) {
  const str = String(key || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 2_000_000_000) + 1000;
}

export function parseEventDateTime(dateStr, timeStr = '') {
  const cleanDate = String(dateStr || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return null;
  const cleanTime = /^\d{2}:\d{2}/.test(String(timeStr || '').trim())
    ? String(timeStr).trim().slice(0, 5)
    : '09:00';
  const dt = new Date(`${cleanDate}T${cleanTime}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

export function buildReminderSchedules(item, { groupId, groupName, kind = 'plan', now = Date.now() } = {}) {
  const target = parseEventDateTime(item?.date || item?.targetDate, item?.time || '');
  if (!target) return [];
  const targetMs = target.getTime();
  if (targetMs <= now + 60_000) return [];

  const titlePrefix = kind === 'goal' ? '🎯 Meta de grupo' : (kind === 'activity' ? '📌 Actividad programada' : '🗓️ Plan próximo');
  const itemTitle = String(item?.title || 'Evento').trim();
  const baseKey = `${kind}_${groupId}_${item?.id || itemTitle}`;

  const candidates = [
    {
      suffix: '24h',
      atMs: targetMs - 24 * 60 * 60 * 1000,
      body: `Mañana en ${groupName || 'tu grupo'}: ${itemTitle}`
    },
    {
      suffix: '1h',
      atMs: targetMs - 60 * 60 * 1000,
      body: `En 1 hora en ${groupName || 'tu grupo'}: ${itemTitle}`
    }
  ];

  return candidates
    .filter(c => c.atMs > now + 60_000)
    .map(c => ({
      id: hashToNotificationId(`${baseKey}_${c.suffix}`),
      title: `${titlePrefix} · ${itemTitle}`,
      body: c.body,
      channelId: 'reminders',
      schedule: {
        at: new Date(c.atMs),
        allowWhileIdle: true
      },
      extra: {
        groupId: groupId || '',
        kind,
        itemId: item?.id || ''
      }
    }));
}

export const RemindersService = {
  isSupported() {
    return NativePlatform.isNative();
  },

  isEnabled() {
    try {
      return localStorage.getItem(CONFIG.storageKeys.remindersEnabled) !== '0';
    } catch (_) {
      return true;
    }
  },

  setEnabled(enabled) {
    try {
      localStorage.setItem(CONFIG.storageKeys.remindersEnabled, enabled ? '1' : '0');
    } catch (_) {}
  },

  async init({ store } = {}) {
    if (!this.isSupported() || listenersBound) return;
    listenersBound = true;

    try {
      await LocalNotifications.createChannel({
        id: 'reminders',
        name: 'Recordatorios de planes y metas',
        description: 'Avisos de fechas importantes de tus grupos en ruma',
        importance: 4,
        visibility: 1,
        vibration: true
      });
    } catch (_) {}

    LocalNotifications.addListener('localNotificationActionPerformed', (evt) => {
      const groupId = evt?.notification?.extra?.groupId;
      if (groupId && store?.getCurrentUser?.()) {
        store.setActiveGroup(groupId);
      }
    }).catch(() => {});
  },

  async requestPermission() {
    if (!this.isSupported()) {
      return { ok: false, error: 'Los recordatorios nativos están disponibles en Android.' };
    }
    try {
      let status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        status = await LocalNotifications.requestPermissions();
      }
      if (status.display !== 'granted') {
        return { ok: false, error: 'Permiso de notificaciones denegado.' };
      }
      this.setEnabled(true);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudieron activar los recordatorios.' };
    }
  },

  async scheduleForItem(item, { groupId, groupName, kind = 'plan' } = {}) {
    if (!this.isSupported() || !this.isEnabled() || !item) return { scheduled: 0 };
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') return { scheduled: 0 };

      const notifications = buildReminderSchedules(item, { groupId, groupName, kind });
      if (!notifications.length) return { scheduled: 0 };

      await LocalNotifications.schedule({ notifications });
      return { scheduled: notifications.length };
    } catch (_) {
      return { scheduled: 0 };
    }
  },

  async cancelForItem(itemId, { groupId, kind = 'plan' } = {}) {
    if (!this.isSupported() || !itemId) return;
    const baseKey = `${kind}_${groupId}_${itemId}`;
    const ids = [
      { id: hashToNotificationId(`${baseKey}_24h`) },
      { id: hashToNotificationId(`${baseKey}_1h`) }
    ];
    try {
      await LocalNotifications.cancel({ notifications: ids });
    } catch (_) {}
  },

  /**
   * Re-sincroniza todos los recordatorios futuros de los grupos del usuario (útil al iniciar sesión o al abrir la app).
   */
  async syncAllFromGroups(groups = []) {
    if (!this.isSupported() || !this.isEnabled()) return { scheduled: 0 };
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') return { scheduled: 0 };

      const notifications = [];
      const now = Date.now();
      (groups || []).forEach(g => {
        if (!g || g.deleted) return;
        (g.plans || []).forEach(p => {
          notifications.push(...buildReminderSchedules(p, { groupId: g.id, groupName: g.name, kind: 'plan', now }));
        });
        (g.activities || []).forEach(a => {
          if (a.status !== 'Completada' && a.status !== 'Cancelada') {
            notifications.push(...buildReminderSchedules(a, { groupId: g.id, groupName: g.name, kind: 'activity', now }));
          }
        });
        (g.goals || []).forEach(goal => {
          if (Number(goal.progress || 0) < 100) {
            notifications.push(...buildReminderSchedules(goal, { groupId: g.id, groupName: g.name, kind: 'goal', now }));
          }
        });
      });

      // Android limita notificaciones pendientes por app (~50); priorizar las 40 más próximas
      notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
      const top = notifications.slice(0, 40);
      if (top.length > 0) {
        await LocalNotifications.schedule({ notifications: top });
      }
      return { scheduled: top.length };
    } catch (_) {
      return { scheduled: 0 };
    }
  }
};
