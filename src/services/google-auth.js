/**
 * ruma 🌟 — Servicio de Autenticación Oficial con Google Identity Services (GIS OAuth 2.0)
 *
 * - Separa «Iniciar sesión con Google» (solo `openid email profile`, sin pedir Drive)
 *   de «Conectar Google Drive» (autorización incremental con `drive.file`, solo carpeta Ruma 🌷).
 * - Preserva el gesto táctil síncrono en iPhone / Safari iOS evitando `await` antes de abrir el popup
 *   cuando GIS ya fue precargado desde `index.html`.
 * - Evita forzar `prompt: 'consent'` en renovaciones cuando el usuario ya autorizó la app.
 */

import { CONFIG } from '../core/config.js';

let currentSession = null;

function loadPersistedSession() {
  if (currentSession) {
    if (currentSession.accessToken && currentSession.expiresAt && Date.now() < currentSession.expiresAt) {
      return currentSession;
    }
    currentSession = null;
    try { localStorage.removeItem(CONFIG.storageKeys.driveAuthSession); } catch (_) {}
  }
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
  // Retrocompatibilidad con sesiones guardadas antes de separar login vs Drive
  if (typeof session.grantedScope === 'string') {
    return session.grantedScope.includes('drive');
  }
  return true;
}

export const GoogleAuth = {
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
   * Carga el script oficial de Google Identity Services (https://accounts.google.com/gsi/client)
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
   * Lanza el flujo OAuth 2.0 GIS preservando el gesto síncrono del clic (crítico en Safari iOS).
   */
  _requestToken({ scopes, expectDriveScope = false, customClientId = '', group = null, prompt = '' }) {
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
        // Llamada síncrona dentro del clic para no perder el gesto táctil en Safari iOS
        tokenClient.requestAccessToken(reqOpts);
      } catch (err) {
        reject(err);
      }
    });

    // Si GIS ya está precargado (caso normal), lanzar síncronamente sin `await` previo
    if (window.google?.accounts?.oauth2) {
      return runTokenFlow();
    }

    // Fallback si el usuario pulsó antes de terminar de cargar el script de index.html
    return this.loadGoogleScript().then(() => runTokenFlow());
  },

  /**
   * Inicia sesión con Google pidiendo SOLO perfil y correo (`openid email profile`).
   * No solicita permisos de Google Drive en el login inicial.
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
   * En renovaciones no fuerza `prompt: 'consent'` para mejorar la experiencia en móvil.
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
    if (s?.accessToken && typeof window !== 'undefined' && window.google?.accounts?.oauth2?.revoke) {
      try { window.google.accounts.oauth2.revoke(s.accessToken, () => {}); } catch (_) {}
    }
    savePersistedSession(null);
  }
};
