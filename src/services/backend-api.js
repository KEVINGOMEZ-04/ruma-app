/**
 * ruma 🌟 — Cliente autenticado para el Backend en Cloudflare Workers (Opción B, $0)
 */

import { CONFIG } from '../core/config.js';
import { FirebaseAuth } from './firebase-auth.js';

function getBaseUrl() {
  return (CONFIG.backend?.apiUrl || '').trim().replace(/\/+$/, '');
}

async function apiRequest(path, { method = 'GET', body = undefined, requireAuth = true } = {}) {
  const base = getBaseUrl();
  if (!base) {
    return { ok: false, unconfigured: true, error: 'Backend API URL no configurada.' };
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (requireAuth) {
    const token = await FirebaseAuth.getValidIdToken();
    if (!token) {
      return { ok: false, unauthorized: true, error: 'Sesión de Firebase Auth no disponible.' };
    }
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        needsUpgrade: Boolean(data?.needsUpgrade),
        error: data?.error || `Error del servidor (HTTP ${res.status})`
      };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, networkError: true, error: err?.message || 'Error de conexión con el servidor.' };
  }
}

export const BackendApi = {
  isConfigured() {
    return Boolean(getBaseUrl());
  },

  async resolveUsernameToEmail(identifier) {
    const res = await apiRequest('/api/auth/resolve-identifier', {
      method: 'POST',
      body: { identifier },
      requireAuth: false
    });
    if (!res.ok) return res;
    return { ok: true, email: res.data?.email || '' };
  },

  async fetchTmdb(endpoint) {
    const res = await apiRequest(`/api/tmdb?path=${encodeURIComponent(endpoint)}`, {
      method: 'GET',
      requireAuth: false
    });
    return res.ok ? res.data : null;
  },

  async joinGroupByCode(code) {
    const res = await apiRequest('/api/groups/join', {
      method: 'POST',
      body: { code },
      requireAuth: true
    });
    if (!res.ok) return res;
    return {
      ok: true,
      alreadyMember: Boolean(res.data?.alreadyMember),
      group: res.data?.group || null
    };
  },

  async registerPushToken({ deviceId, token, platform = 'android' }) {
    return apiRequest('/api/push/register', {
      method: 'POST',
      body: { deviceId, token, platform },
      requireAuth: true
    });
  },

  async unregisterPushToken(deviceId) {
    return apiRequest('/api/push/register', {
      method: 'DELETE',
      body: { deviceId },
      requireAuth: true
    });
  },

  async notifyGroupEvent({ groupId, type = 'chat', title, body }) {
    return apiRequest('/api/push/group-event', {
      method: 'POST',
      body: { groupId, type, title, body },
      requireAuth: true
    });
  },

  async reportContent({ groupId = '', targetType = 'message', targetId = '', targetUserId = '', reason = 'other', details = '' }) {
    return apiRequest('/api/ugc/report', {
      method: 'POST',
      body: { groupId, targetType, targetId, targetUserId, reason, details },
      requireAuth: true
    });
  },

  async getBillingStatus() {
    const res = await apiRequest('/api/billing/status', {
      method: 'GET',
      requireAuth: true
    });
    if (!res.ok) return res;
    return {
      ok: true,
      isPremium: Boolean(res.data?.isPremium),
      entitlements: res.data?.entitlements || null
    };
  },

  async deleteMyAccount() {
    return apiRequest('/api/account', {
      method: 'DELETE',
      requireAuth: true
    });
  }
};
