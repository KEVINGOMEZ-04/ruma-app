/**
 * ruma 🌟 — Servicio de Autenticación Oficial con Google Identity Services (GIS)
 *
 * Solicita exclusivamente el permiso seguro:
 * 'https://www.googleapis.com/auth/drive.file'
 * para que ruma solo pueda crear y gestionar su propia carpeta de grupo,
 * sin poder acceder jamás a los demás archivos privados del usuario.
 */

import { CONFIG } from '../core/config.js';

let tokenClient = null;
let currentAccessToken = null;
let tokenExpiresAt = 0;

export const GoogleAuth = {
  /**
   * Carga el script oficial de Google Identity Services si aún no está presente
   */
  loadGoogleScript() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) {
        return resolve(window.google);
      }

      const existing = document.getElementById('google-identity-script');
      if (existing) {
        existing.onload = () => resolve(window.google);
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
   * Solicita al Administrador autorización para la carpeta de Google Drive
   * Abre la ventana oficial de Google
   */
  async requestDriveAccess(clientId = '') {
    const effectiveClientId = clientId || CONFIG.googleDrive.clientId || 'DEMO_CLIENT_ID';

    // Si estamos en entorno de desarrollo / demo sin Client ID de producción
    if (!effectiveClientId || effectiveClientId === 'DEMO_CLIENT_ID') {
      console.warn('GoogleAuth: Utilizando sesión simulada de desarrollo hasta configurar Google Cloud Client ID.');
      currentAccessToken = 'demo_token_' + Date.now();
      tokenExpiresAt = Date.now() + 3600 * 1000;
      return {
        accessToken: currentAccessToken,
        isDemo: true
      };
    }

    await this.loadGoogleScript();

    return new Promise((resolve, reject) => {
      try {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: effectiveClientId,
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (response) => {
            if (response.error) {
              return reject(new Error(response.error_description || response.error));
            }
            currentAccessToken = response.access_token;
            tokenExpiresAt = Date.now() + (parseInt(response.expires_in, 10) || 3600) * 1000;
            resolve({
              accessToken: currentAccessToken,
              expiresIn: response.expires_in,
              isDemo: false
            });
          }
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  },

  getAccessToken() {
    if (currentAccessToken && Date.now() < tokenExpiresAt) {
      return currentAccessToken;
    }
    return null;
  },

  clearToken() {
    currentAccessToken = null;
    tokenExpiresAt = 0;
  }
};
