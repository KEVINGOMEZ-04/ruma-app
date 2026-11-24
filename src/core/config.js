/**
 * ruma 🌟 — Configuración Global & Reglas de Negocio
 */

export const CONFIG = {
  appName: 'ruma',
  tagline: 'Tus personas · Tus recuerdos · Tu refugio',
  version: '1.0.0',

  // TMDb API (Películas & Series)
  tmdb: {
    apiKey: 'e9e9d8da18ae29fc430845952232787c',
    backupKeys: [
      '8265bd1679663a7ea12ac168da84d2e8',
      'cfe422613b250f702980a3bbf9e90716'
    ],
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
    language: 'es-ES'
  },

  // Google Drive OAuth 2.0 & Master Bridge
  googleDrive: {
    clientId: '',
    scopes: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
    defaultBridgeUrl: 'https://script.google.com/macros/s/AKfycbx3nWf8YgIzkq1Kna1yfB9rv0d3gjr9xvV1yiE-qb5qwzaV6rFujoacsFjOgMkRrbOFiQ/exec'
  },

  // Marcos de Perfil Estilo Discord
  avatarFrames: [
    { id: 'frame-none', label: 'Clásico Sutil', premium: false },
    { id: 'frame-axolotl', label: 'Ajolote Cósmico', premium: false },
    { id: 'frame-celestial', label: 'Luz Celestial ✨', premium: true },
    { id: 'frame-gold', label: 'Realeza Dorada 👑', premium: true },
    { id: 'frame-neon', label: 'Aurora Boreal 🌌', premium: true }
  ],

  // Claves de Persistencia Local
  storageKeys: {
    accounts: 'ruma_accounts_v1',
    currentUserId: 'ruma_current_user_id_v1',
    groups: 'ruma_groups_v1',
    activeGroupId: 'ruma_active_group_id_v1',
    driveCachePrefix: 'ruma_drive_cache_v1_',
    driveAuthSession: 'ruma_google_drive_oauth_v1',
    driveClientId: 'ruma_google_client_id_v1',
    theme: 'ruma_theme_v1'
  }
};

