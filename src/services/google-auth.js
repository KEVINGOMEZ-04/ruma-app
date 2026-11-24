/**
 * ruma 🌟 — Servicio de Autenticación Oficial con Google Identity Services (GIS OAuth 2.0)
 *
 * - Permite iniciar sesión con Google ("Conectar cuenta de Google Drive") usando OAuth 2.0.
 * - Solicita el permiso de Google Drive para poder crear subcarpetas y subir fotos/videos
 *   dentro de cualquier carpeta existente de Google Drive cuyo enlace pegue el usuario.
 * - Persiste el token OAuth y el perfil de Google conectado (email, nombre, avatar) en localStorage
 *   mientras la sesión esté vigente (1 hora), y permite renovarlo con un clic.
 */

import { CONFIG } from '../core/config.js';

let currentSession = null;

function loadPersistedSession() {
  if (currentSession) return currentSession;
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
        existing.addEventListener('load', () => resolve(window.google));
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services.')));
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
   * Abre el popup oficial de Inicio de Sesión de Google para autorizar Google Drive.
   */
  async requestDriveAccess(customClientId = '', group = null) {
    const effectiveClientId = (customClientId || this.getClientId(group) || '').trim();

    if (!effectiveClientId || effectiveClientId === 'DEMO_CLIENT_ID' || !effectiveClientId.includes('.apps.googleusercontent.com')) {
      const err = new Error('CLIENT_ID_MISSING');
      err.code = 'CLIENT_ID_MISSING';
      throw err;
    }

    this.setClientId(effectiveClientId);
    await this.loadGoogleScript();

    return new Promise((resolve, reject) => {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: effectiveClientId,
          scope: CONFIG.googleDrive.scopes || 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email',
          callback: async (response) => {
            if (response.error) {
              return reject(new Error(response.error_description || response.error));
            }
            const accessToken = response.access_token;
            const expiresInSec = parseInt(response.expires_in, 10) || 3599;
            const expiresAt = Date.now() + (expiresInSec - 60) * 1000;
            const profile = await this.fetchGoogleUserProfile(accessToken);

            const session = {
              accessToken,
              expiresAt,
              clientId: effectiveClientId,
              email: profile?.email || '',
              name: profile?.name || 'Cuenta Google conectada',
              picture: profile?.picture || '',
              connectedAt: new Date().toISOString()
            };

            savePersistedSession(session);
            resolve(session);
          },
          error_callback: (err) => {
            reject(new Error(err?.message || 'Se canceló o bloqueó la ventana de inicio de sesión de Google.'));
          }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  },

  getSession() {
    return loadPersistedSession();
  },

  getAccessToken() {
    const s = loadPersistedSession();
    return s ? s.accessToken : null;
  },

  isConnected() {
    return Boolean(this.getAccessToken());
  },

  clearToken() {
    const s = loadPersistedSession();
    if (s?.accessToken && window.google?.accounts?.oauth2?.revoke) {
      try { window.google.accounts.oauth2.revoke(s.accessToken, () => {}); } catch (_) {}
    }
    savePersistedSession(null);
  }
};
