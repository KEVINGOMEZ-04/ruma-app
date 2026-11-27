/**
 * ruma 🌟 — Ajustes (Mi Cuenta con edición por campo, Plan y Límites con toggle Freemium/ruma Plus para pruebas)
 */
import { store } from '../core/store.js';
import { CryptoAuth } from '../core/crypto.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { CONFIG } from '../core/config.js';
import { PushService } from '../services/push-service.js';
import { RemindersService } from '../services/reminders-service.js';
import { BillingService } from '../services/billing-service.js';
import { GoogleAuth } from '../services/google-auth.js';
import { DriveBridge } from '../services/drive-bridge.js';
import { AppNativeService } from '../services/app-native.js';

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.15-8.15m0 0h-3.5m3.5 0v3.5m-4.5 1 2 2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  clapper: '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4"/>',
  tv: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="m8 2 4 4 4-4"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'
};

export function renderSettingsInterface(container) {
  const user = store.getCurrentUser();
  if (!user) {
    store.navigate('hub');
    return;
  }

  const allGroups = store.getGroups();
  const myGroups = store.getMyGroups();
  const myCreatedGroup = allGroups.find(g => g.creatorId === user.id) || null;
  const refGroup = store.getActiveGroup() || myCreatedGroup || myGroups[0] || null;
  const accounts = store.getAccounts();
  const blockedIds = store.getBlockedUserIds();

  const googleSession = GoogleAuth.getSession();
  const hasGoogleDriveSync = Boolean(
    GoogleAuth.hasDriveAccess() ||
    (user.googleDriveSynced && user.googleDriveFolderUrl && DriveBridge.isRealFolderConfigured(user.googleDriveFolderUrl))
  );
  const effectiveDriveEmail = googleSession?.email || user.googleEmail || user.email || '';
  const effectiveFolderUrl = (myCreatedGroup?.driveFolderUrl && DriveBridge.isRealFolderConfigured(myCreatedGroup.driveFolderUrl))
    ? myCreatedGroup.driveFolderUrl
    : ((user.googleDriveFolderUrl && DriveBridge.isRealFolderConfigured(user.googleDriveFolderUrl)) ? user.googleDriveFolderUrl : '');
  const safeDriveFolderUrl = effectiveFolderUrl ? Utils.safeUrl(effectiveFolderUrl, '') : '';

  const nativePrefs = AppNativeService.getPreferences();
  const notifPermission = AppNativeService.getNotificationPermissionStatus();
  const isNotifGranted = notifPermission === 'granted';
  const isStandalone = AppNativeService.isStandaloneApp();
  const canInstallPwa = AppNativeService.canPromptInstall();

  const isUserPrem = Entitlements.isUserPremium(user, allGroups);
  const isGroupPrem = refGroup ? Entitlements.isGroupPremium(refGroup) : isUserPrem;
  const allowDevToggle = CryptoAuth.isBetaSelfUpgradeAllowed();
  const nativeBilling = BillingService.isNativeBillingReady();

  const groupsCount = myGroups.length;
  const groupsMax = isUserPrem ? Infinity : PLAN_LIMITS.free.maxTotalGroups;
  const moviesCount = refGroup ? (refGroup.movies || []).length : 0;
  const moviesMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxMoviesPerGroup;
  const seriesCount = refGroup ? (refGroup.series || []).length : 0;
  const seriesMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxSeriesPerGroup;
  const songsCount = refGroup ? (refGroup.songs || []).length : 0;
  const songsMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxSongsPerGroup;
  const booksCount = refGroup ? (refGroup.books || []).length : 0;
  const booksMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxBooksPerGroup;

  const pct = (val, max) => max === Infinity ? (val > 0 ? 100 : 0) : Math.min(100, Math.round((val / max) * 100));
  const maxLabel = (max) => max === Infinity ? '∞' : max;

  const accountFields = [
    { key: 'name', label: 'Nombre visible', value: user.name || 'Sin definir', icon: ICO.user, type: 'text', placeholder: 'Tu nombre', required: true },
    { key: 'username', label: 'Usuario', value: `@${user.username || 'usuario'}`, icon: ICO.at, type: 'text', placeholder: 'usuario', required: true },
    { key: 'email', label: 'Correo electrónico', value: user.email || 'Sin correo', icon: ICO.mail, type: 'email', placeholder: 'tu@correo.com', required: false },
    { key: 'phone', label: 'Número de teléfono', value: user.phone || 'Sin teléfono', icon: ICO.phone, type: 'tel', placeholder: '3001234567', required: false },
    { key: 'password', label: 'Contraseña', value: '••••••••', icon: ICO.lock, type: 'password', placeholder: 'Nueva contraseña', required: true },
    { key: 'recovery', label: 'Código de recuperación', value: user.recoveryCodeHash ? 'Configurado · Renovar' : 'Sin configurar · Generar ahora', icon: ICO.key, type: 'text', placeholder: '', required: false }
  ];

  const limits = [
    { label: 'Grupos', val: groupsCount, max: groupsMax, ico: ICO.users },
    { label: 'Películas', val: moviesCount, max: moviesMax, ico: ICO.clapper },
    { label: 'Series', val: seriesCount, max: seriesMax, ico: ICO.tv },
    { label: 'Canciones', val: songsCount, max: songsMax, ico: ICO.note },
    { label: 'Libros', val: booksCount, max: booksMax, ico: ICO.book }
  ];

  const resolveBlockedLabel = (uid) => {
    const acc = accounts.find(a => a.id === uid);
    if (acc?.name) return `${acc.name} (@${acc.username || 'usuario'})`;
    for (const g of myGroups) {
      const m = (g.members || []).find(x => x.id === uid);
      if (m?.name) return `${m.name} (@${m.username || 'usuario'})`;
    }
    return `Usuario (${uid.slice(0, 10)})`;
  };

  container.innerHTML = `
    <div class="rst-wrap">
      <!-- Cabecera -->
      <header class="rst-head">
        <div>
          <h1>⚙️ Ajustes</h1>
          <p>Gestiona tu cuenta, sincronización con Google, notificaciones y tu plan en Ruma.</p>
        </div>
        <button type="button" class="rst-logout" id="rst-logout-btn">🚪 Cerrar Sesión</button>
      </header>

      <!-- Sincronización con Google & Carpeta Ruma 🌷 (Centralizado en Ajustes y requerido para crear grupo) -->
      <section class="rg-card rst-card" id="rst-google-sync-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(ICO.cloud, 22)}</div>
          <div>
            <h2>Sincronización con Google & Carpeta Ruma 🌷</h2>
            <p>Obligatoria para crear tu grupo y respaldar los recuerdos en tu carpeta privada <strong>Ruma 🌷</strong>.</p>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.85rem;padding:0.95rem 1rem;border-radius:var(--radius-md);background:${hasGoogleDriveSync ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)'};border:1px solid ${hasGoogleDriveSync ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.35)'};">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;">
            <div>
              <div style="font-weight:800;font-size:0.94rem;color:${hasGoogleDriveSync ? '#34D399' : '#FBBF24'};">
                ${hasGoogleDriveSync
                  ? `🟢 Sincronizado con Google (${Utils.sanitize(effectiveDriveEmail || user.name || 'Cuenta activa')})`
                  : '⚠️ Pendiente de sincronizar con Google'}
              </div>
              <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.2rem;line-height:1.4;">
                ${hasGoogleDriveSync
                  ? (safeDriveFolderUrl
                      ? 'Tu carpeta Ruma 🌷 está activa y lista para crear tu grupo y guardar todos los recuerdos.'
                      : 'Sesión de Google activa. Pulsa «Verificar carpeta Ruma 🌷» o crea tu grupo y se vinculará automáticamente.')
                  : 'Conecta tu cuenta de Google aquí en Ajustes para habilitar la creación de tu grupo y tu carpeta Ruma 🌷 en Google Drive (sin acceso al resto de tu Drive).'}
              </div>
            </div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
              <button type="button" class="btn ${hasGoogleDriveSync ? 'btn-secondary' : 'btn-primary'} btn-sm" id="rst-btn-google-sync">
                ${hasGoogleDriveSync ? '🔄 Sincronizar / Verificar Ruma 🌷' : '🔑 Sincronizar con Google'}
              </button>
              ${safeDriveFolderUrl ? `
                <a href="${Utils.sanitize(safeDriveFolderUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">
                  📂 Abrir Ruma 🌷 ↗
                </a>
              ` : ''}
              ${hasGoogleDriveSync ? `
                <button type="button" class="btn btn-danger btn-sm" id="rst-btn-google-disconnect">
                  Desvincular
                </button>
              ` : ''}
            </div>
          </div>
          <div id="rst-google-sync-feedback" style="display:none;font-size:0.8rem;padding:0.65rem 0.8rem;border-radius:var(--radius-sm);"></div>
        </div>
      </section>

      <!-- Funciones de Aplicación: Notificaciones, Sincronización en Segundo Plano & Compilación Nativa -->
      <section class="rg-card rst-card" id="rst-native-app-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(ICO.bell, 22)}</div>
          <div>
            <h2>Notificaciones y Sincronización en Segundo Plano</h2>
            <p>Funciones nativas de aplicación para alertas del grupo, subidas continuas a Drive y modo instalable / APK.</p>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.85rem;">
          <!-- Estado de permisos de notificaciones -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;padding:0.85rem 1rem;border-radius:var(--radius-md);background:var(--bg-elevated);border:1px solid var(--border-subtle);">
            <div>
              <div style="font-weight:800;font-size:0.9rem;color:${isNotifGranted && nativePrefs.notificationsEnabled ? '#34D399' : 'var(--text-primary)'};">
                ${isNotifGranted
                  ? (nativePrefs.notificationsEnabled ? '🔔 Notificaciones del sistema activas' : '🔕 Notificaciones silenciadas en la app')
                  : (notifPermission === 'denied' ? '🚫 Permiso bloqueado en el navegador / sistema' : '🔔 Permiso de notificaciones pendiente')}
              </div>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:0.15rem;">
                Recibe avisos de mensajes de chat, nuevos recuerdos, planes agendados y cuando termine una carga en Google Drive.
              </div>
            </div>
            <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
              ${!isNotifGranted ? `
                <button type="button" class="btn btn-primary btn-sm" id="rst-btn-req-notif">
                  🔔 Activar permiso
                </button>
              ` : `
                <button type="button" class="btn btn-secondary btn-sm" id="rst-btn-test-notif">
                  ✨ Probar notificación
                </button>
              `}
              ${canInstallPwa && !isStandalone ? `
                <button type="button" class="btn btn-primary btn-sm" id="rst-btn-install-pwa">
                  📲 Instalar App
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Interruptores de funciones en segundo plano -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:0.6rem;">
            <label style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.7rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;">
              <span style="font-size:0.82rem;font-weight:700;">🔔 Alertas generales</span>
              <input type="checkbox" data-native-pref="notificationsEnabled" ${nativePrefs.notificationsEnabled ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-lilac);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.7rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;">
              <span style="font-size:0.82rem;font-weight:700;">💬 Mensajes del chat</span>
              <input type="checkbox" data-native-pref="notifyChat" ${nativePrefs.notifyChat ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-lilac);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.7rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;">
              <span style="font-size:0.82rem;font-weight:700;">📸 Nuevos recuerdos y planes</span>
              <input type="checkbox" data-native-pref="notifyMemories" ${nativePrefs.notifyMemories ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-lilac);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.7rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;">
              <span style="font-size:0.82rem;font-weight:700;">☁️ Aviso al completar carga Drive</span>
              <input type="checkbox" data-native-pref="notifyDriveUpload" ${nativePrefs.notifyDriveUpload ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-lilac);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.7rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;">
              <span style="font-size:0.82rem;font-weight:700;">🔄 Sincronización y reanudación en 2º plano</span>
              <input type="checkbox" data-native-pref="backgroundSyncEnabled" ${nativePrefs.backgroundSyncEnabled ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-lilac);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:0.6rem;padding:0.7rem 0.9rem;background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);cursor:pointer;">
              <span style="font-size:0.82rem;font-weight:700;">⚡ Evitar suspensión durante subidas</span>
              <input type="checkbox" data-native-pref="keepAwakeDuringUpload" ${nativePrefs.keepAwakeDuringUpload ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--brand-lilac);">
            </label>
          </div>
        </div>
      </section>

      <!-- Mi Cuenta -->
      <section class="rg-card rst-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(ICO.user, 22)}</div>
          <div>
            <h2>Mi Cuenta</h2>
            <p>Actualiza tu perfil, contraseña y código de recuperación.</p>
          </div>
        </div>

        <div class="rst-rows">
          ${accountFields.map(f => `
            <button type="button" class="rst-row" data-edit-field="${f.key}">
              <span class="rst-row-ico">${svg(f.icon, 18)}</span>
              <span class="rst-row-txt">
                <b>${f.label}</b>
                <small>${Utils.sanitize(f.value)}</small>
              </span>
              <span class="rst-chev">›</span>
            </button>
          `).join('')}
        </div>
      </section>

      <!-- Notificaciones y Operación en 2.º Plano -->
      <section class="rg-card rst-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(ICO.bell, 20)}</div>
          <div>
            <h2>Notificaciones y 2.º Plano</h2>
            <p>Recibe avisos de chat con la app cerrada y recordatorios de planes o metas.</p>
          </div>
        </div>

        <div class="rst-rows">
          <button type="button" class="rst-row" id="rst-enable-push">
            <span class="rst-row-ico">${svg(ICO.bell, 18)}</span>
            <span class="rst-row-txt">
              <b>Notificaciones Push del Chat y Grupos</b>
              <small id="rst-push-status">${PushService.isSupported() ? 'Activa avisos en tiempo real vía Firebase Cloud Messaging' : 'Disponible al instalar la app Android'}</small>
            </span>
            <span class="rst-chev">›</span>
          </button>

          <button type="button" class="rst-row" id="rst-enable-reminders">
            <span class="rst-row-ico">${svg(ICO.bell, 18)}</span>
            <span class="rst-row-txt">
              <b>Recordatorios de Planes y Metas</b>
              <small>${RemindersService.isEnabled() ? 'Activados (avisos 24 h y 1 h antes)' : 'Desactivados · Toca para activar'}</small>
            </span>
            <span class="rst-chev">›</span>
          </button>
        </div>
      </section>

      <!-- Apariencia -->
      <section class="rg-card rst-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(store.getTheme() === 'light' ? ICO.sun : ICO.moon, 20)}</div>
          <div>
            <h2>Apariencia</h2>
            <p>Elige entre tema claro u oscuro según tu preferencia.</p>
          </div>
        </div>

        <div class="rst-theme-switch" role="group" aria-label="Seleccionar tema">
          <button type="button" class="rst-theme-opt ${store.getTheme() === 'light' ? 'active' : ''}" data-set-theme="light">
            ${svg(ICO.sun, 16)}
            <span>Tema Claro</span>
          </button>
          <button type="button" class="rst-theme-opt ${store.getTheme() !== 'light' ? 'active' : ''}" data-set-theme="dark">
            ${svg(ICO.moon, 16)}
            <span>Tema Oscuro</span>
          </button>
        </div>
      </section>

      <!-- Plan y Límites -->
      <section class="rg-card rst-card">
        <div class="rst-sec-head">
          <div class="rst-crown">👑</div>
          <div>
            <h2>Plan y Límites</h2>
            <p>Gestiona tu suscripción de ruma Plus en Google Play y consulta tus límites.</p>
          </div>
        </div>

        <div class="rst-plus-box ${isUserPrem ? 'active' : ''}">
          <div class="rst-plus-top">
            <span class="rst-plus-title">✨ ruma Plus</span>
            ${isUserPrem ? `<span class="rst-plus-on">Activo</span>` : ''}
          </div>
          <p>${isUserPrem
            ? 'Tienes ruma Plus activo: puedes unirte a todos los grupos que quieras, crear 1 grupo Premium y guardar películas, series y canciones ilimitadas.'
            : 'Desbloquea todo el potencial de Ruma: más grupos, contenido ilimitado y funciones exclusivas vía Google Play Billing.'}</p>

          ${allowDevToggle ? `
            <button type="button" class="rst-plus-btn ${isUserPrem ? 'is-off' : ''}" id="rst-toggle-plus">
              ${isUserPrem ? '🔄 Desactivar ruma Plus (Modo Dev)' : '👑 Activar ruma Plus (Modo Dev)'}
            </button>
          ` : `
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <button type="button" class="rst-plus-btn" id="rst-plus-subscribe">
                ${isUserPrem ? '✨ Gestionar ruma Plus en Google Play' : (nativeBilling ? '👑 Suscribirme con Google Play' : '✨ ruma Plus · Disponible en Google Play')}
              </button>
              ${nativeBilling ? `<button type="button" class="btn btn-secondary btn-sm" id="rst-restore-purchases">🔄 Restaurar compras de Google Play</button>` : ''}
            </div>
          `}
        </div>

        <div class="rst-limits-box">
          <div class="rst-limits-head">
            <span class="rst-plan-pill ${isUserPrem ? 'prem' : ''}">${isUserPrem ? '✨ ruma Plus' : 'Plan Free'}</span>
            <span class="rst-limits-sub">Tus límites actuales${refGroup ? ` · ${Utils.sanitize(refGroup.name)}` : ''}</span>
          </div>

          <div class="rst-limits-list">
            ${limits.map(l => `
              <div class="rst-lim-item">
                <div class="rst-lim-row">
                  <span class="rst-lim-lbl">${svg(l.ico, 17)}<span>${l.label}</span></span>
                  <b>${l.val} / ${maxLabel(l.max)}</b>
                </div>
                <div class="rst-bar"><i style="width:${pct(l.val, l.max)}%"></i></div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>

      <!-- Seguridad Comunitaria (Usuarios bloqueados UGC) -->
      ${blockedIds.length > 0 ? `
        <section class="rg-card rst-card">
          <div class="rst-sec-head">
            <div class="rst-sec-ico">${svg(ICO.ban, 20)}</div>
            <div>
              <h2>Usuarios bloqueados (${blockedIds.length})</h2>
              <p>Los mensajes y avisos de estas cuentas permanecen ocultos para ti.</p>
            </div>
          </div>
          <div class="rst-rows">
            ${blockedIds.map(bid => `
              <div class="rst-row" style="cursor:default;justify-content:space-between;">
                <span class="rst-row-txt">
                  <b>${Utils.sanitize(resolveBlockedLabel(bid))}</b>
                  <small>Bloqueado</small>
                </span>
                <button type="button" class="btn btn-secondary btn-sm" data-unblock-uid="${Utils.sanitize(bid)}">Desbloquear</button>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      <!-- Legal, Privacidad y Eliminación de Cuenta -->
      <section class="rg-card rst-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(ICO.shield, 20)}</div>
          <div>
            <h2>Privacidad, Términos y Cuenta</h2>
            <p>Documentación oficial de ruma y control total sobre tus datos.</p>
          </div>
        </div>

        <div class="rst-rows">
          <a class="rst-row" href="${CONFIG.webUrls.privacy}" target="_blank" rel="noopener" style="text-decoration:none;">
            <span class="rst-row-ico">${svg(ICO.shield, 18)}</span>
            <span class="rst-row-txt">
              <b>Política de Privacidad</b>
              <small>Cómo protegemos tus datos y uso limitado de Google Drive (drive.file)</small>
            </span>
            <span class="rst-chev">${svg(ICO.external, 14)}</span>
          </a>

          <a class="rst-row" href="${CONFIG.webUrls.terms}" target="_blank" rel="noopener" style="text-decoration:none;">
            <span class="rst-row-ico">${svg(ICO.fileText, 18)}</span>
            <span class="rst-row-txt">
              <b>Términos y Condiciones</b>
              <small>Reglas de uso del servicio, moderación UGC y suscripciones</small>
            </span>
            <span class="rst-chev">${svg(ICO.external, 14)}</span>
          </a>

          <button type="button" class="rst-row" id="rst-delete-account-inapp">
            <span class="rst-row-ico" style="color:var(--error);background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.25);">${svg(ICO.trash, 18)}</span>
            <span class="rst-row-txt">
              <b style="color:var(--error);">Eliminar mi cuenta ahora</b>
              <small>Borra definitivamente tu cuenta, sesión y datos en ruma</small>
            </span>
            <span class="rst-chev">›</span>
          </button>

          <a class="rst-row" href="${CONFIG.webUrls.deleteAccount}" target="_blank" rel="noopener" style="text-decoration:none;">
            <span class="rst-row-ico">${svg(ICO.external, 16)}</span>
            <span class="rst-row-txt">
              <b>Portal web de eliminación de datos</b>
              <small>Información y solicitudes externas de eliminación de datos</small>
            </span>
            <span class="rst-chev">${svg(ICO.external, 14)}</span>
          </a>
        </div>
      </section>
    </div>
  `;

  container.querySelector('#rst-logout-btn')?.addEventListener('click', () => {
    store.logout();
    UI.showToast('Has cerrado sesión correctamente.', 'info');
  });

  // Estado contextual de Push FCM
  if (PushService.isSupported()) {
    PushService.checkPermissionStatus().then(st => {
      const el = container.querySelector('#rst-push-status');
      if (!el) return;
      if (st === 'granted') el.textContent = '🟢 Activadas · Recibirás avisos con la app cerrada';
      else if (st === 'denied') el.textContent = '🔴 Bloqueadas en ajustes del sistema Android';
    }).catch(() => {});
  }

  container.querySelector('#rst-enable-push')?.addEventListener('click', async () => {
    const res = await PushService.enableNotifications();
    UI.showToast(res.ok ? '🔔 ¡Notificaciones Push activadas!' : res.error, res.ok ? 'success' : 'info');
    if (res.ok) renderSettingsInterface(container);
  });

  container.querySelector('#rst-enable-reminders')?.addEventListener('click', async () => {
    if (RemindersService.isSupported()) {
      const res = await RemindersService.requestPermission();
      if (!res.ok) {
        UI.showToast(res.error, 'error');
        return;
      }
      const syncRes = await RemindersService.syncAllFromGroups(store.getMyGroups());
      UI.showToast(`🗓️ Recordatorios activos (${syncRes.scheduled} programados).`, 'success');
    } else {
      const next = !RemindersService.isEnabled();
      RemindersService.setEnabled(next);
      UI.showToast(next ? 'Recordatorios activados para Android 🗓️' : 'Recordatorios desactivados', 'info');
    }
    renderSettingsInterface(container);
  });

  const syncFeedbackEl = container.querySelector('#rst-google-sync-feedback');
  const showSyncFeedback = (msg, isError = false) => {
    if (!syncFeedbackEl) return;
    syncFeedbackEl.style.display = 'block';
    syncFeedbackEl.style.background = isError ? 'rgba(239,68,68,0.14)' : 'rgba(16,185,129,0.14)';
    syncFeedbackEl.style.border = `1px solid ${isError ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`;
    syncFeedbackEl.style.color = isError ? '#FCA5A5' : '#6EE7B7';
    syncFeedbackEl.textContent = msg;
  };

  container.querySelector('#rst-btn-google-sync')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = '⏳ Abriendo Google...';

    // Llamada síncrona dentro del clic para preservar el gesto táctil en Safari iOS
    GoogleAuth.requestDriveAccess('', myCreatedGroup)
      .then(async (session) => {
        btn.textContent = '⏳ Preparando carpeta Ruma 🌷...';
        const created = await DriveBridge.createGroupFolderInDrive(myCreatedGroup);
        const folderUrl = created?.webViewLink || '';
        if (!folderUrl) {
          throw new Error('Google Drive no devolvió la carpeta Ruma 🌷. Inténtalo de nuevo.');
        }

        const userPatch = {
          googleDriveSynced: true,
          googleEmail: session.email || user.email || ''
        };
        if (folderUrl) {
          userPatch.googleDriveFolderUrl = folderUrl;
        }
        if (!user.email && session.email) {
          userPatch.email = session.email;
        }
        store.updateCurrentUser(userPatch);

        store.getGroups().filter(g => g.creatorId === user.id).forEach((g) => {
          store.updateGroupSettings(g.id, { driveFolderUrl: folderUrl });
        });
        store.resumePendingDriveUploads?.();

        UI.showToast('¡Cuenta sincronizada con Google y carpeta Ruma 🌷 lista! 🌷✨', 'success');
        renderSettingsInterface(container);
      })
      .catch((err) => {
        btn.disabled = false;
        btn.textContent = prevText;
        showSyncFeedback(`❌ No se pudo sincronizar con Google: ${err?.message || 'Inténtalo de nuevo.'}`, true);
      });
  });

  container.querySelector('#rst-btn-google-disconnect')?.addEventListener('click', () => {
    GoogleAuth.clearToken();
    store.updateCurrentUser({
      googleDriveSynced: false,
      googleDriveFolderUrl: ''
    });
    UI.showToast('Sincronización de Google Drive desvinculada.', 'info');
    renderSettingsInterface(container);
  });

  container.querySelector('#rst-btn-req-notif')?.addEventListener('click', async () => {
    const res = await AppNativeService.requestNotificationPermission();
    if (res.ok) {
      UI.showToast('¡Notificaciones activadas! 🔔', 'success');
      await AppNativeService.sendSystemNotification({
        title: 'ruma 🌟 Notificaciones activas',
        body: 'Recibirás alertas del grupo y cuando terminen tus cargas a Google Drive.'
      });
    } else {
      UI.showToast(res.error || 'Activa el permiso de notificaciones en los ajustes de tu navegador o teléfono.', 'info');
    }
    renderSettingsInterface(container);
  });

  container.querySelector('#rst-btn-test-notif')?.addEventListener('click', async () => {
    const sent = await AppNativeService.sendSystemNotification({
      title: 'ruma 🌟 Prueba de notificación',
      body: 'Las notificaciones y la sincronización en segundo plano están funcionando.'
    });
    UI.showToast(
      sent
        ? 'Notificación enviada al sistema 🔔'
        : 'Asegúrate de tener activadas las alertas generales.',
      sent ? 'success' : 'info'
    );
  });

  container.querySelector('#rst-btn-install-pwa')?.addEventListener('click', async () => {
    const res = await AppNativeService.promptInstallApp();
    if (res.ok) {
      UI.showToast('¡Instalando aplicación en tu dispositivo! 📲', 'success');
      renderSettingsInterface(container);
    }
  });

  container.querySelectorAll('[data-native-pref]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const key = chk.getAttribute('data-native-pref');
      if (!key) return;
      const patch = { [key]: Boolean(chk.checked) };
      if (key === 'notifyMemories') {
        patch.notifyPlans = Boolean(chk.checked);
      }
      AppNativeService.updatePreferences(patch);
      UI.showToast('Preferencia de aplicación guardada ✅', 'info');
    });
  });
  container.querySelectorAll('[data-set-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextTheme = btn.getAttribute('data-set-theme');
      if (nextTheme === store.getTheme()) return;
      store.setTheme(nextTheme);
      UI.showToast(nextTheme === 'light' ? 'Tema claro activado ☀️' : 'Tema oscuro activado 🌙', 'info');
    });
  });

  container.querySelector('#rst-toggle-plus')?.addEventListener('click', () => {
    const next = !isUserPrem;
    store.setUserPremiumPlan(next);
    UI.showToast(
      next
        ? '¡ruma Plus activado (Modo Dev)! ✨'
        : 'Plan cambiado a Free (máx. 2 grupos y 5 ítems por categoría).',
      next ? 'success' : 'info'
    );
  });

  container.querySelector('#rst-plus-subscribe')?.addEventListener('click', () => {
    if (isUserPrem) {
      window.open(BillingService.getManageSubscriptionUrl(), '_blank', 'noopener,noreferrer');
      return;
    }
    UI.showUpgradeModal(
      'Activa ruma Plus para unirte a grupos ilimitados y desbloquear catálogos sin tope en tu grupo Premium.',
      () => store.syncBillingEntitlementsAsync(),
      { userId: user.id }
    );
  });

  container.querySelector('#rst-restore-purchases')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = await BillingService.restorePurchases(user.id);
    btn.disabled = false;
    UI.showToast(res.message || res.error || 'Proceso finalizado.', res.isPremium ? 'success' : 'info');
    if (res.isPremium) await store.syncBillingEntitlementsAsync();
  });

  container.querySelectorAll('[data-unblock-uid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-unblock-uid');
      store.unblockUser(uid);
      UI.showToast('Usuario desbloqueado.', 'info');
    });
  });

  // Eliminación definitiva de cuenta in-app (requisito obligatorio Google Play)
  container.querySelector('#rst-delete-account-inapp')?.addEventListener('click', () => {
    UI.openModal({
      title: '🗑️ Eliminar cuenta definitivamente',
      contentHtml: `
        <form id="rst-del-acc-form" style="display:flex;flex-direction:column;gap:0.85rem;">
          <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.5;margin:0;">
            Esta acción es <strong>permanente e irreversible</strong>. Se borrarán tu cuenta de acceso, perfil, tokens de notificaciones y tu membresía en tus grupos (los archivos guardados en tu Google Drive personal permanecen en tu Drive).
          </p>
          <div class="form-group" style="margin-bottom:0;">
            <label class="form-label" for="rst-del-confirm">Escribe <strong>ELIMINAR</strong> para confirmar</label>
            <input type="text" id="rst-del-confirm" class="form-input" placeholder="ELIMINAR" autocomplete="off" required>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
            <button type="button" class="btn btn-secondary" id="rst-del-cancel">Cancelar</button>
            <button type="submit" class="btn btn-danger" id="rst-del-submit" disabled>Eliminar mi cuenta</button>
          </div>
        </form>
      `,
      onMount: () => {
        const inp = document.getElementById('rst-del-confirm');
        const btn = document.getElementById('rst-del-submit');
        inp?.addEventListener('input', () => {
          if (btn) btn.disabled = inp.value.trim().toUpperCase() !== 'ELIMINAR';
        });
        document.getElementById('rst-del-cancel')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('rst-del-acc-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (btn) { btn.disabled = true; btn.textContent = 'Eliminando…'; }
          const res = await store.deleteCurrentUserAccountAsync();
          UI.closeModal();
          if (!res.ok) {
            UI.showToast(res.error || 'No se pudo eliminar la cuenta.', 'error');
            return;
          }
          UI.showToast('Tu cuenta y tus datos han sido eliminados definitivamente.', 'info');
        });
      }
    });
  });

  container.querySelectorAll('[data-edit-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-edit-field');
      const field = accountFields.find(f => f.key === key);
      if (!field) return;

      // Cambio de contraseña seguro (requiere contraseña actual + mínimo 6 caracteres)
      if (key === 'password') {
        const hasExistingPw = Boolean(user.passwordHash || user.password);
        UI.openModal({
          title: '🔒 Cambiar Contraseña',
          contentHtml: `
            <form id="rst-pw-form" style="display:flex;flex-direction:column;gap:.85rem;">
              ${hasExistingPw ? `
                <div class="form-group">
                  <label class="form-label">Contraseña actual</label>
                  <input type="password" id="rst-pw-cur" class="form-input" placeholder="Tu contraseña actual" autocomplete="current-password" required>
                </div>` : ''}
              <div class="form-group">
                <label class="form-label">Nueva contraseña (mín. 6 caracteres)</label>
                <input type="password" id="rst-pw-new" class="form-input" placeholder="Escribe tu nueva contraseña" minlength="6" autocomplete="new-password" required>
              </div>
              <div style="display:flex;justify-content:flex-end;gap:.6rem;">
                <button type="button" class="btn btn-secondary" id="rst-pw-cancel">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="rst-pw-save">Guardar</button>
              </div>
            </form>`,
          onMount: () => {
            document.getElementById('rst-pw-cancel')?.addEventListener('click', () => UI.closeModal());
            (document.getElementById('rst-pw-cur') || document.getElementById('rst-pw-new'))?.focus();
            document.getElementById('rst-pw-form')?.addEventListener('submit', async (e) => {
              e.preventDefault();
              const cur = document.getElementById('rst-pw-cur')?.value || '';
              const nextPw = document.getElementById('rst-pw-new')?.value || '';
              const saveBtn = document.getElementById('rst-pw-save');
              if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }
              const res = await store.changePasswordAsync(cur, nextPw);
              if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }
              if (!res.ok) {
                UI.showToast(res.error, 'error');
                return;
              }
              UI.closeModal();
              UI.showToast('Contraseña actualizada de forma segura 🔒', 'success');
            });
          }
        });
        return;
      }

      // Generación / renovación de código personal de recuperación
      if (key === 'recovery') {
        const hasExistingPw = Boolean(user.passwordHash || user.password);
        UI.openModal({
          title: '🔐 Código de recuperación',
          contentHtml: `
            <form id="rst-rec-form" style="display:flex;flex-direction:column;gap:.85rem;">
              <p style="font-size:0.86rem;color:var(--text-secondary);line-height:1.45;margin:0;">
                Este código te permite recuperar el acceso a tu cuenta si olvidas tu contraseña. Al generar uno nuevo, cualquier código anterior quedará invalidado.
              </p>
              ${hasExistingPw ? `
                <div class="form-group">
                  <label class="form-label">Confirma tu contraseña actual</label>
                  <input type="password" id="rst-rec-pw" class="form-input" placeholder="Tu contraseña actual" autocomplete="current-password" required>
                </div>` : ''}
              <div style="display:flex;justify-content:flex-end;gap:.6rem;">
                <button type="button" class="btn btn-secondary" id="rst-rec-cancel">Cancelar</button>
                <button type="submit" class="btn btn-primary" id="rst-rec-gen">Generar código</button>
              </div>
            </form>`,
          onMount: () => {
            document.getElementById('rst-rec-cancel')?.addEventListener('click', () => UI.closeModal());
            document.getElementById('rst-rec-pw')?.focus();
            document.getElementById('rst-rec-form')?.addEventListener('submit', async (e) => {
              e.preventDefault();
              const cur = document.getElementById('rst-rec-pw')?.value || '';
              const genBtn = document.getElementById('rst-rec-gen');
              if (genBtn) { genBtn.disabled = true; genBtn.textContent = 'Generando...'; }
              const res = await store.regenerateRecoveryCodeAsync(cur);
              if (genBtn) { genBtn.disabled = false; genBtn.textContent = 'Generar código'; }
              if (!res.ok) {
                UI.showToast(res.error, 'error');
                return;
              }
              UI.openModal({
                title: '🔐 Tu nuevo código de recuperación',
                contentHtml: `
                  <div style="display:flex;flex-direction:column;gap:0.9rem;">
                    <p style="font-size:0.86rem;color:var(--text-secondary);line-height:1.45;margin:0;">
                      Guárdalo en un lugar seguro. Solo se mostrará esta vez.
                    </p>
                    <div style="padding:0.9rem 1rem;border-radius:14px;background:var(--surface-secondary);border:1px solid var(--border-subtle);text-align:center;font-family:var(--font-mono, monospace);font-size:1.25rem;font-weight:800;letter-spacing:0.08em;color:var(--primary);user-select:all;">
                      ${Utils.sanitize(res.recoveryCode)}
                    </div>
                    <div style="display:flex;gap:0.65rem;justify-content:flex-end;flex-wrap:wrap;">
                      <button type="button" class="btn btn-secondary" id="rst-rec-copy">📋 Copiar</button>
                      <button type="button" class="btn btn-primary" id="rst-rec-done">Listo</button>
                    </div>
                  </div>`,
                onMount: () => {
                  document.getElementById('rst-rec-copy')?.addEventListener('click', async () => {
                    const ok = await Utils.copyText(res.recoveryCode);
                    UI.showToast(ok ? 'Código copiado 📋' : `Código: ${res.recoveryCode}`, ok ? 'success' : 'info');
                  });
                  document.getElementById('rst-rec-done')?.addEventListener('click', () => {
                    UI.closeModal();
                    renderSettingsInterface(container);
                  });
                }
              });
            });
          }
        });
        return;
      }

      const rawVal = user[key] || '';
      UI.openModal({
        title: `Editar ${field.label}`,
        contentHtml: `
          <form id="rst-field-form" style="display:flex;flex-direction:column;gap:.85rem;">
            <div class="form-group">
              <label class="form-label">${field.label}</label>
              <input type="${field.type}" id="rst-field-inp" class="form-input" value="${Utils.sanitize(rawVal)}" placeholder="${field.placeholder}" ${field.required ? 'required' : ''}>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:.6rem;">
              <button type="button" class="btn btn-secondary" id="rst-f-cancel">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
          </form>`,
        onMount: () => {
          document.getElementById('rst-f-cancel')?.addEventListener('click', () => UI.closeModal());
          document.getElementById('rst-field-inp')?.focus();
          document.getElementById('rst-field-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            let val = document.getElementById('rst-field-inp')?.value.trim() || '';
            if (key === 'username') val = val.replace(/^@+/, '').toLowerCase();
            if (field.required && !val) return;
            const res = store.updateCurrentUser({ [key]: val });
            if (res && res.ok === false) {
              UI.showToast(res.error || 'No se pudo actualizar este campo.', 'error');
              return;
            }
            UI.closeModal();
            UI.showToast(`${field.label} actualizado ✅`, 'success');
          });
        }
      });
    });
  });
}
