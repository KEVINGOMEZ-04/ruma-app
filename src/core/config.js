/**
 * ruma 🌟 — Configuración Global, Integraciones Nativas y Reglas de Negocio
 */

export const CONFIG = {
  appName: 'ruma',
  appId: 'app.ruma.social',
  tagline: 'Descubre • Comparte • Conecta',
  version: '1.1.0',

  // Sitio web oficial & Páginas legales públicas
  webUrls: {
    site: 'https://kevingomez-04.github.io/ruma-web/',
    app: 'https://kevingomez-04.github.io/ruma-app/',
    privacy: 'https://kevingomez-04.github.io/ruma-web/privacidad.html',
    terms: 'https://kevingomez-04.github.io/ruma-web/terminos.html',
    deleteAccount: 'https://kevingomez-04.github.io/ruma-web/eliminar-cuenta.html'
  },

  // Backend ligero en Cloudflare Workers (Plan Gratis: proxy TMDb, FCM Push, códigos de grupo, RevenueCat webhook y borrado de cuenta)
  backend: {
    apiUrl: (import.meta.env?.VITE_BACKEND_API_URL || '').trim().replace(/\/+$/, '')
  },

  // Firebase Authentication (Plan Spark gratuito)
  firebaseAuth: {
    apiKey: (import.meta.env?.VITE_FIREBASE_API_KEY || '').trim(),
    projectId: (import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'luma-f53ee').trim()
  },

  // TMDb API (Películas & Series — en producción pasa por Cloudflare Worker `/api/tmdb` sin exponer claves en el APK)
  tmdb: {
    apiKey: (import.meta.env?.VITE_TMDB_API_KEY || '').trim(),
    backupKeys: [],
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
    language: 'es-ES'
  },

  // Google Drive OAuth 2.0 (scope mínimo `drive.file`: solo carpeta Ruma 🌷 y archivos creados por la app)
  googleDrive: {
    clientId: (import.meta.env?.VITE_GOOGLE_CLIENT_ID || '419243559314-jriep6ork2h3o44ht83r5fe20ekpi3io.apps.googleusercontent.com').trim(),
    androidClientId: (import.meta.env?.VITE_GOOGLE_ANDROID_CLIENT_ID || '').trim(),
    profileScopes: 'openid email profile',
    scopes: 'https://www.googleapis.com/auth/drive.file openid email profile',
    rootFolderName: 'Ruma 🌷'
  },

  // Sincronización en la Nube en Tiempo Real (Firebase Realtime Database — Plan Spark)
  cloudSync: {
    enabled: true,
    databaseUrl: (import.meta.env?.VITE_FIREBASE_DATABASE_URL || 'https://luma-f53ee-default-rtdb.firebaseio.com').trim().replace(/\/+$/, ''),
    rootPath: (import.meta.env?.VITE_FIREBASE_ROOT_PATH || 'ruma_cloud_v1').trim()
  },

  // Monetización oficial Google Play Billing v8+ vía RevenueCat (Gratis hasta $2,500 MTR)
  billing: {
    revenueCatAndroidKey: (import.meta.env?.VITE_REVENUECAT_ANDROID_KEY || '').trim(),
    entitlementId: (import.meta.env?.VITE_REVENUECAT_ENTITLEMENT_ID || 'ruma_plus').trim(),
    manageAndroidSubscriptionUrl: 'https://play.google.com/store/account/subscriptions?package=app.ruma.social'
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
    firebaseAuthSession: 'ruma_firebase_auth_v1',
    blockedUsers: 'ruma_blocked_users_v1',
    pushDeviceId: 'ruma_push_device_id_v1',
    remindersEnabled: 'ruma_reminders_enabled_v1',
    theme: 'ruma_theme_v1'
  }
};
