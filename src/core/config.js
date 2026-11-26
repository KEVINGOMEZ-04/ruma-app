/**
 * ruma 🌟 — Configuración Global & Reglas de Negocio
 */

export const CONFIG = {
  appName: 'ruma',
  tagline: 'Descubre • Comparte • Conecta',
  version: '1.0.0',

  // Sitio web oficial & Páginas legales públicas
  webUrls: {
    site: 'https://kevingomez-04.github.io/ruma-web/',
    privacy: 'https://kevingomez-04.github.io/ruma-web/privacidad.html',
    terms: 'https://kevingomez-04.github.io/ruma-web/terminos.html',
    deleteAccount: 'https://kevingomez-04.github.io/ruma-web/eliminar-cuenta.html'
  },

  // TMDb API (Películas & Series)
  tmdb: {
    apiKey: import.meta.env?.VITE_TMDB_API_KEY || 'e9e9d8da18ae29fc430845952232787c',
    backupKeys: [
      '8265bd1679663a7ea12ac168da84d2e8',
      'cfe422613b250f702980a3bbf9e90716'
    ],
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
    language: 'es-ES'
  },

  // Google Drive OAuth 2.0
  googleDrive: {
    clientId: import.meta.env?.VITE_GOOGLE_CLIENT_ID || '419243559314-jriep6ork2h3o44ht83r5fe20ekpi3io.apps.googleusercontent.com',
    scopes: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
  },

  // Sincronización en la Nube en Tiempo Real (Firebase Realtime Database)
  cloudSync: {
    enabled: true,
    databaseUrl: import.meta.env?.VITE_FIREBASE_DATABASE_URL || 'https://luma-f53ee-default-rtdb.firebaseio.com',
    rootPath: import.meta.env?.VITE_FIREBASE_ROOT_PATH || 'ruma_cloud_v1'
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

