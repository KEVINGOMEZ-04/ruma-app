/**
 * ruma 🌟 — Servicio de Firebase Authentication (Plan Spark gratuito, REST oficial)
 *
 * - Autentica con correo/contraseña o proveedor Google (ID Token / Access Token).
 * - Renueva automáticamente el JWT `idToken` vía Secure Token API antes de expirar.
 * - Persiste el `refreshToken` en SecureStorage (Android Keystore en APK).
 * - Inyecta el `idToken` vigente en `CloudSync.setAuthToken(...)` para cumplir reglas RTDB estrictas.
 */

import { CONFIG } from '../core/config.js';
import { SecureStorage } from './secure-storage.js';

const IDK_BASE = 'https://identitytoolkit.googleapis.com/v1';
const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

let activeSession = null;
let refreshInFlight = null;
const authListeners = new Set();

function emitSession(session) {
  authListeners.forEach(fn => {
    try { fn(session); } catch (_) {}
  });
}

function getApiKey() {
  return (CONFIG.firebaseAuth?.apiKey || '').trim();
}

function translateFirebaseError(code) {
  const clean = String(code || '').split(' :')[0].trim().toUpperCase();
  const map = {
    EMAIL_EXISTS: 'Ese correo electrónico ya está registrado. Usa "Iniciar sesión".',
    EMAIL_NOT_FOUND: 'No encontramos ninguna cuenta con ese correo electrónico.',
    INVALID_EMAIL: 'Ingresa un correo electrónico válido.',
    INVALID_PASSWORD: 'Contraseña incorrecta.',
    INVALID_LOGIN_CREDENTIALS: 'Correo o contraseña incorrectos.',
    USER_DISABLED: 'Esta cuenta fue deshabilitada.',
    WEAK_PASSWORD: 'Tu contraseña debe tener al menos 6 caracteres.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Por seguridad, vuelve a iniciar sesión para completar esta acción.',
    TOKEN_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo.'
  };
  return map[clean] || 'No se pudo completar la autenticación. Intenta de nuevo.';
}

async function persistSession(session) {
  activeSession = session;
  if (session) {
    await SecureStorage.set(CONFIG.storageKeys.firebaseAuthSession, JSON.stringify(session));
  } else {
    await SecureStorage.remove(CONFIG.storageKeys.firebaseAuthSession);
  }
  emitSession(session);
  return session;
}

async function postIdentity(endpoint, body) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('FIREBASE_AUTH_NOT_CONFIGURED');
  }
  const res = await fetch(`${IDK_BASE}/${endpoint}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = data?.error?.message || `HTTP_${res.status}`;
    const err = new Error(translateFirebaseError(code));
    err.code = code;
    throw err;
  }
  return data;
}

export const FirebaseAuth = {
  isConfigured() {
    return Boolean(getApiKey());
  },

  onSessionChange(fn) {
    if (typeof fn !== 'function') return () => {};
    authListeners.add(fn);
    return () => authListeners.delete(fn);
  },

  getSession() {
    return activeSession;
  },

  async restoreSession() {
    if (!this.isConfigured()) return null;
    if (activeSession?.idToken && activeSession.expiresAt > Date.now() + 60_000) {
      return activeSession;
    }
    try {
      const raw = await SecureStorage.get(CONFIG.storageKeys.firebaseAuthSession);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.uid || !parsed?.refreshToken) return null;
      activeSession = parsed;
      if (!parsed.idToken || parsed.expiresAt <= Date.now() + 60_000) {
        return await this.refreshIdToken();
      }
      emitSession(activeSession);
      return activeSession;
    } catch (_) {
      return null;
    }
  },

  async signUpWithEmail(email, password, displayName = '') {
    const data = await postIdentity('accounts:signUp', {
      email: String(email || '').trim().toLowerCase(),
      password: String(password || ''),
      returnSecureToken: true
    });
    if (displayName && data.idToken) {
      postIdentity('accounts:update', {
        idToken: data.idToken,
        displayName: String(displayName).trim(),
        returnSecureToken: false
      }).catch(() => {});
    }
    const expiresIn = Number(data.expiresIn) || 3600;
    return persistSession({
      uid: data.localId,
      email: (data.email || email || '').toLowerCase(),
      displayName: displayName || data.displayName || '',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (expiresIn - 120) * 1000,
      provider: 'password'
    });
  },

  async signInWithEmail(email, password) {
    const data = await postIdentity('accounts:signInWithPassword', {
      email: String(email || '').trim().toLowerCase(),
      password: String(password || ''),
      returnSecureToken: true
    });
    const expiresIn = Number(data.expiresIn) || 3600;
    return persistSession({
      uid: data.localId,
      email: (data.email || email || '').toLowerCase(),
      displayName: data.displayName || '',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (expiresIn - 120) * 1000,
      provider: 'password'
    });
  },

  async signInWithGoogle({ idToken = '', accessToken = '' } = {}) {
    if (!idToken && !accessToken) {
      throw new Error('Falta token de Google para autenticar en Firebase.');
    }
    const postBody = idToken
      ? `id_token=${encodeURIComponent(idToken)}&providerId=google.com`
      : `access_token=${encodeURIComponent(accessToken)}&providerId=google.com`;

    const requestUri = (typeof window !== 'undefined' && window.location?.origin && window.location.origin.startsWith('http'))
      ? window.location.origin
      : 'https://localhost';

    const data = await postIdentity('accounts:signInWithIdp', {
      postBody,
      requestUri,
      returnIdpCredential: true,
      returnSecureToken: true
    });

    const expiresIn = Number(data.expiresIn) || 3600;
    return persistSession({
      uid: data.localId,
      email: (data.email || '').toLowerCase(),
      displayName: data.displayName || data.fullName || '',
      photoUrl: data.photoUrl || '',
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + (expiresIn - 120) * 1000,
      provider: 'google'
    });
  },

  async refreshIdToken() {
    if (!this.isConfigured() || !activeSession?.refreshToken) return null;
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${SECURE_TOKEN_URL}?key=${encodeURIComponent(getApiKey())}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: activeSession.refreshToken
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.id_token) {
          await persistSession(null);
          return null;
        }
        const expiresIn = Number(data.expires_in) || 3600;
        return await persistSession({
          ...activeSession,
          uid: data.user_id || activeSession.uid,
          idToken: data.id_token,
          refreshToken: data.refresh_token || activeSession.refreshToken,
          expiresAt: Date.now() + (expiresIn - 120) * 1000
        });
      } catch (_) {
        return activeSession;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  },

  async getValidIdToken() {
    if (!this.isConfigured()) return null;
    if (!activeSession) {
      await this.restoreSession();
    }
    if (!activeSession) return null;
    if (!activeSession.idToken || activeSession.expiresAt <= Date.now() + 60_000) {
      await this.refreshIdToken();
    }
    return activeSession?.idToken || null;
  },

  async sendPasswordResetEmail(email) {
    await postIdentity('accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email: String(email || '').trim().toLowerCase()
    });
    return { ok: true };
  },

  async updatePassword(newPassword) {
    const idToken = await this.getValidIdToken();
    if (!idToken) throw new Error('Debes iniciar sesión de nuevo para cambiar tu contraseña.');
    const data = await postIdentity('accounts:update', {
      idToken,
      password: String(newPassword || ''),
      returnSecureToken: true
    });
    if (data.idToken) {
      const expiresIn = Number(data.expiresIn) || 3600;
      await persistSession({
        ...activeSession,
        idToken: data.idToken,
        refreshToken: data.refreshToken || activeSession.refreshToken,
        expiresAt: Date.now() + (expiresIn - 120) * 1000
      });
    }
    return { ok: true };
  },

  async deleteCurrentAuthUser() {
    const idToken = await this.getValidIdToken();
    if (!idToken) return { ok: false, error: 'Sesión no activa.' };
    await postIdentity('accounts:delete', { idToken });
    await persistSession(null);
    return { ok: true };
  },

  async signOut() {
    await persistSession(null);
  }
};
