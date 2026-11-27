/**
 * ruma 🌟 — Almacenamiento Seguro de Tokens (Android Keystore AES-256-GCM en APK / Web Fallback)
 *
 * En Android Capacitor utiliza el plugin nativo `RumaSecureStorage` respaldado por Android Keystore,
 * evitando persistir tokens OAuth o refresh tokens en texto plano en `localStorage`.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

const RumaSecureStorage = registerPlugin('RumaSecureStorage');
const memoryFallback = new Map();

function isNativeAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch (_) {
    return false;
  }
}

export const SecureStorage = {
  isNativeAvailable() {
    return isNativeAndroid();
  },

  async set(key, value) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return false;
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    memoryFallback.set(cleanKey, strVal);

    if (isNativeAndroid()) {
      try {
        await RumaSecureStorage.set({ key: cleanKey, value: strVal });
        // Limpiar cualquier copia legacy en localStorage dentro de Android
        try { localStorage.removeItem(cleanKey); } catch (_) {}
        return true;
      } catch (err) {
        console.warn('SecureStorage native set warning:', err);
      }
    }

    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(cleanKey, strVal);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cleanKey, strVal);
      }
      return true;
    } catch (_) {
      return false;
    }
  },

  async get(key) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return null;

    if (isNativeAndroid()) {
      try {
        const res = await RumaSecureStorage.get({ key: cleanKey });
        if (res?.value) {
          memoryFallback.set(cleanKey, res.value);
          return res.value;
        }
      } catch (_) {}
    }

    if (memoryFallback.has(cleanKey)) return memoryFallback.get(cleanKey);

    try {
      if (typeof sessionStorage !== 'undefined') {
        const fromSession = sessionStorage.getItem(cleanKey);
        if (fromSession !== null) return fromSession;
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(cleanKey);
      }
    } catch (_) {}
    return null;
  },

  async remove(key) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) return;
    memoryFallback.delete(cleanKey);

    if (isNativeAndroid()) {
      try {
        await RumaSecureStorage.remove({ key: cleanKey });
      } catch (_) {}
    }
    try { sessionStorage.removeItem(cleanKey); } catch (_) {}
    try { localStorage.removeItem(cleanKey); } catch (_) {}
  }
};
