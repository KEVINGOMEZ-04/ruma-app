/**
 * ruma 🌟 — Servicio de Autenticación con Google (Nativo Android + Web GIS Safari-safe)
 *
 * - En Android Capacitor (APK/AAB): utiliza `@capgo/capacitor-social-login` (Credential Manager +
 *   AuthorizationClient nativo de Google Play Services) y guarda tokens cifrados en Android Keystore
 *   vía `SecureStorage` (adiós al `403: disallowed_useragent` del WebView y al token en `localStorage`).
 * - En Web / iPhone Safari: preserva el flujo síncrono GIS (`accounts.google.com/gsi/client`)
 *   sin `await` previo al clic para no perder el gesto táctil en iOS.
 * - Separa «Iniciar sesión con Google» (`openid email profile`) de «Conectar Google Drive» (`drive.file`).
 */

import { SocialLogin } from '@capgo/capacitor-social-login';
import { CONFIG } from '../core/config.js';
import { NativePlatform } from './native-platform.js';
import { SecureStorage } from './secure-storage.js';

let currentSession = null;
let nativeSocialInitialized = false;

function loadPersistedSession() {
  if (currentSession) {
    if (currentSession.accessToken && currentSession.expiresAt && Date.now() < currentSession.expiresAt) {
      return currentSession;
    }
    currentSession = null;
    try { localStorage.removeItem(CONFIG.storageKeys.driveAuthSession); } catch (_) {}
  }
  // En Android nativo el token vive cifrado en Keystore (se hidrata con restoreNativeSession)
  if (NativePlatform.isAndroid()) return null;

  try {
    const raw = localStorage.getItem(CONFIG.storageKeys.driveAuthSession);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.accessToken && parsed.expiresAt && Date.now() < parsed.expiresAt) {
      currentSession = parsed;
      return currentSession;
    }
    localStorage.removeItem(CONFIG.storageKeys.driveAuthSession);
  } catch (_) {}
  return null;
}

function savePersistedSession(session) {
  currentSession = session;
  if (NativePlatform.isAndroid()) {
    if (session) {
      SecureStorage.set(CONFIG.storageKeys.driveAuthSession, JSON.stringify(session)).catch(() => {});
    } else {
      SecureStorage.remove(CONFIG.storageKeys.driveAuthSession).catch(() => {});
    }
    try { localStorage.removeItem(CONFIG.storageKeys.driveAuthSession); } catch (_) {}
    return;
  }

  try {
    if (session) {
      localStorage.setItem(CONFIG.storageKeys.driveAuthSession, JSON.stringify(session));
    } else {
      localStorage.removeItem(CONFIG.storageKeys.driveAuthSession);
    }
  } catch (_) {}
}

function sessionHasDriveScope(session) {
  if (!session || !session.accessToken) return false;
  if (typeof session.hasDriveScope === 'boolean') return session.hasDriveScope;
  if (typeof session.grantedScope === 'string') {
    return session.grantedScope.includes('drive');
  }
  return true;
}

async function ensureNativeGoogleInit(webClientId) {
  if (nativeSocialInitialized) return;
  await SocialLogin.initialize({
    google: {
      webClientId: webClientId || CONFIG.googleDrive.clientId,
      mode: 'online'
    }
  });
  nativeSocialInitialized = true;
}

export const GoogleAuth = {
  /**
   * Hidrata la sesión cifrada desde Android Keystore al iniciar la app nativa.
   */
  async restoreNativeSession() {
    if (!NativePlatform.isAndroid()) return loadPersistedSession();
    try {
      const raw = await SecureStorage.get(CONFIG.storageKeys.driveAuthSession);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.accessToken && parsed.expiresAt && Date.now() < parsed.expiresAt) {
        currentSession = parsed;
        return currentSession;
      }
      await SecureStorage.remove(CONFIG.storageKeys.driveAuthSession);
    } catch (_) {}
    return null;
  },

  /**
   * Obtiene el Client ID de OAuth 2.0 configurado (prioriza el Client ID oficial de CONFIG)
   */
  getClientId(group = null) {
    const fromConfig = (CONFIG.googleDrive.clientId || '').trim();
    if (fromConfig) return fromConfig;
    const fromGroup = group?.driveClientId ? String(group.driveClientId).trim() : '';
    if (fromGroup) return fromGroup;
    try {
      const saved = localStorage.getItem(CONFIG.storageKeys.driveClientId);
      if (saved && saved.trim()) return saved.trim();
    } catch (_) {}
    return '';
  },

  setClientId(clientId) {
    const clean = String(clientId || '').trim();
    try {
      if (clean) localStorage.setItem(CONFIG.storageKeys.driveClientId, clean);
      else localStorage.removeItem(CONFIG.storageKeys.driveClientId);
    } catch (_) {}
    return clean;
  },

  hasValidClientId(group = null) {
    const cid = this.getClientId(group);
    return Boolean(cid && cid !== 'DEMO_CLIENT_ID' && cid.includes('.apps.googleusercontent.com'));
  },

  /**
   * Carga el script oficial de Google Identity Services (solo entorno Web)
   */
  loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        return resolve(window.google);
      }

      const existing = document.getElementById('google-identity-script');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.google), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-identity-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.google);
      script.onerror = () => reject(new Error('No se pudo cargar el servicio de autenticación de Google.'));
      document.head.appendChild(script);
    });
  },

  /**
   * Obtiene la información del perfil de Google conectado (email, nombre, foto)
   */
  async fetchGoogleUserProfile(accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        email: data.email || '',
        name: data.name || data.given_name || 'Cuenta de Google',
        picture: data.picture || ''
      };
    } catch (_) {
      return null;
    }
  },

  /**
   * Flujo nativo Android (Credential Manager / AuthorizationClient) — evita WebView OAuth block.
   */
  async _requestNativeToken({ scopes, expectDriveScope = false, customClientId = '', group = null, forceRefresh = false }) {
    const webClientId = (customClientId || this.getClientId(group) || '').trim();
    if (!webClientId || !webClientId.includes('.apps.googleusercontent.com')) {
      const err = new Error('CLIENT_ID_MISSING');
      err.code = 'CLIENT_ID_MISSING';
      throw err;
    }

    await ensureNativeGoogleInit(webClientId);
    const scopeList = String(scopes || 'email profile').split(/\s+/).filter(Boolean);
    const prevSession = loadPersistedSession();

    const { result } = await SocialLogin.login({
      provider: 'google',
      options: {
        scopes: scopeList,
        forceRefreshToken: Boolean(forceRefresh || expectDriveScope)
      }
    });

    const accessToken = result?.accessToken?.token || '';
    const idToken = result?.idToken || '';
    if (expectDriveScope && !accessToken) {
      throw new Error('Google no otorgó el token de acceso para Google Drive. Intenta conceder el permiso de nuevo.');
    }

    const profile = result?.profile || (accessToken ? await this.fetchGoogleUserProfile(accessToken) : null);
    const expiresAt = Date.now() + 55 * 60 * 1000;
    const grantedScope = scopeList.join(' ');
    const hasDriveScope = expectDriveScope
      ? Boolean(accessToken)
      : (sessionHasDriveScope(prevSession) || grantedScope.includes('drive.file'));

    const session = {
      accessToken: accessToken || prevSession?.accessToken || '',
      idToken,
      expiresAt,
      clientId: webClientId,
      grantedScope,
      hasDriveScope,
      email: profile?.email || prevSession?.email || '',
      name: profile?.name || profile?.givenName || prevSession?.name || 'Cuenta Google conectada',
      picture: profile?.imageUrl || profile?.picture || prevSession?.picture || '',
      connectedAt: new Date().toISOString()
    };

    if (session.accessToken) {
      savePersistedSession(session);
    }
    return session;
  },

  /**
   * Lanza el flujo OAuth 2.0: nativo en Android APK o GIS síncrono en Web/Safari iOS.
   */
  _requestToken({ scopes, expectDriveScope = false, customClientId = '', group = null, prompt = '' }) {
    if (NativePlatform.isAndroid()) {
      return this._requestNativeToken({
        scopes,
        expectDriveScope,
        customClientId,
        group,
        forceRefresh: prompt === 'consent'
      });
    }

    const effectiveClientId = (customClientId || this.getClientId(group) || '').trim();

    if (!effectiveClientId || effectiveClientId === 'DEMO_CLIENT_ID' || !effectiveClientId.includes('.apps.googleusercontent.com')) {
      const err = new Error('CLIENT_ID_MISSING');
      err.code = 'CLIENT_ID_MISSING';
      return Promise.reject(err);
    }

    this.setClientId(effectiveClientId);

    const prevSession = loadPersistedSession();
    const loginHint = prevSession?.email || '';

    const runTokenFlow = () => new Promise((resolve, reject) => {
      try {
        if (!window.google?.accounts?.oauth2) {
          return reject(new Error('El servicio de Google aún está cargando. Toca de nuevo en un segundo.'));
        }
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: effectiveClientId,
          scope: scopes,
          include_granted_scopes: true,
          callback: async (response) => {
            if (response.error) {
              return reject(new Error(response.error_description || response.error));
            }
            const accessToken = response.access_token;
            const expiresInSec = parseInt(response.expires_in, 10) || 3599;
            const expiresAt = Date.now() + (expiresInSec - 60) * 1000;
            const grantedScope = String(response.scope || scopes || '');
            const hasDriveScope = expectDriveScope
              ? (grantedScope.includes('drive.file') || grantedScope.includes('/auth/drive'))
              : (sessionHasDriveScope(prevSession) || grantedScope.includes('drive.file') || grantedScope.includes('/auth/drive'));

            const profile = await this.fetchGoogleUserProfile(accessToken);

            const session = {
              accessToken,
              expiresAt,
              clientId: effectiveClientId,
              grantedScope,
              hasDriveScope,
              email: profile?.email || prevSession?.email || '',
              name: profile?.name || prevSession?.name || 'Cuenta Google conectada',
              picture: profile?.picture || prevSession?.picture || '',
              connectedAt: new Date().toISOString()
            };

            savePersistedSession(session);
            resolve(session);
          },
          error_callback: (err) => {
            if (err?.type === 'popup_failed_to_open') {
              return reject(new Error('El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.'));
            }
            reject(new Error(err?.message || 'Se canceló o bloqueó la ventana de inicio de sesión de Google.'));
          }
        });

        const reqOpts = {};
        if (prompt !== undefined && prompt !== null) {
          reqOpts.prompt = prompt;
        }
        if (loginHint && prompt !== 'select_account') {
          reqOpts.hint = loginHint;
        }
        tokenClient.requestAccessToken(reqOpts);
      } catch (err) {
        reject(err);
      }
    });

    if (window.google?.accounts?.oauth2) {
      return runTokenFlow();
    }

    return this.loadGoogleScript().then(() => runTokenFlow());
  },

  /**
   * Inicia sesión con Google pidiendo SOLO perfil y correo (`openid email profile`).
   */
  signInWithProfile(customClientId = '') {
    return this._requestToken({
      scopes: CONFIG.googleDrive.profileScopes || 'openid email profile',
      expectDriveScope: false,
      customClientId,
      prompt: 'select_account'
    });
  },

  /**
   * Solicita autorización incremental de Google Drive (`drive.file`: solo carpeta Ruma 🌷).
   */
  requestDriveAccess(customClientId = '', group = null, { forceConsent = false } = {}) {
    const prevSession = loadPersistedSession();
    const prompt = forceConsent ? 'consent' : (prevSession?.email ? '' : 'select_account');
    return this._requestToken({
      scopes: CONFIG.googleDrive.scopes || 'https://www.googleapis.com/auth/drive.file openid email profile',
      expectDriveScope: true,
      customClientId,
      group,
      prompt
    });
  },

  getSession() {
    return loadPersistedSession();
  },

  getAccessToken() {
    const s = loadPersistedSession();
    return s ? s.accessToken : null;
  },

  getDriveAccessToken() {
    const s = loadPersistedSession();
    return s && sessionHasDriveScope(s) ? s.accessToken : null;
  },

  hasDriveAccess() {
    return Boolean(this.getDriveAccessToken());
  },

  isConnected() {
    return this.hasDriveAccess();
  },

  clearToken() {
    const s = loadPersistedSession();
    if (NativePlatform.isAndroid()) {
      SocialLogin.logout({ provider: 'google' }).catch(() => {});
    } else if (s?.accessToken && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
      try { window.google.accounts.oauth2.revoke(s.accessToken, () => {}); } catch (_) {}
    }
    savePersistedSession(null);
  }
};
