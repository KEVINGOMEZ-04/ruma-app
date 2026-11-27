/**
 * ruma 🌟 — Orquestador Principal Modular
 * - Login & Registro (src/interfaces/auth-interface.js)
 * - Home / Inicio (src/interfaces/home-interface.js)
 * - El Grupo (src/interfaces/group-interface.js)
 * - Perfil de Usuario (src/interfaces/profile-interface.js)
 * - Ajustes y Plan Freemium (src/interfaces/settings-interface.js)
 */

import './styles/tokens.css';
import './styles/layout.css';
import './styles/auth.css';
import './styles/home.css';
import './styles/group.css';
import './styles/profile.css';

import { store } from './core/store.js';
import { Utils } from './core/utils.js';
import { CloudSync } from './services/cloud-sync.js';
import { GoogleAuth } from './services/google-auth.js';
import { AppNativeService } from './services/app-native.js';
import { CosmicBackground } from './components/cosmic-background.js';

let cosmicBg = null;
let appRenderSeq = 0;

const interfaceCache = new Map();
const interfaceLoaders = {
  auth: () => import('./interfaces/auth-interface.js'),
  hub: () => import('./interfaces/home-interface.js'),
  group: () => import('./interfaces/group-interface.js'),
  profile: () => import('./interfaces/profile-interface.js'),
  settings: () => import('./interfaces/settings-interface.js')
};

function mountInterface(name, exportKey, viewRoot) {
  if (!viewRoot) return;
  const cached = interfaceCache.get(name);
  if (cached?.[exportKey]) {
    cached[exportKey](viewRoot);
    syncDriveUploadPillDom();
    return;
  }

  const seq = appRenderSeq;
  viewRoot.innerHTML = `<div class="ruma-view-loading" role="status" aria-live="polite"><span class="ruma-spinner" aria-hidden="true"></span><span>Cargando...</span></div>`;

  const loader = interfaceLoaders[name];
  if (!loader) return;
  loader()
    .then((mod) => {
      interfaceCache.set(name, mod);
      if (seq !== appRenderSeq) return;
      const liveRoot = document.getElementById('ruma-view-root');
      if (liveRoot && mod?.[exportKey]) {
        mod[exportKey](liveRoot);
        syncDriveUploadPillDom();
      }
    })
    .catch((err) => {
      console.error(`Error cargando vista ${name}:`, err);
      if (Utils.tryAutoReloadForStaleChunk(err)) return;
      if (seq !== appRenderSeq) return;
      const liveRoot = document.getElementById('ruma-view-root');
      if (liveRoot) {
        Utils.renderChunkLoadFallback(liveRoot, () => renderApp());
      }
    });
}

// Sincronización de viewport visual para teclado virtual en iPhone / iOS Safari
function syncVisualViewport() {
  const vv = window.visualViewport;
  const h = vv ? vv.height : window.innerHeight;
  const top = vv ? Math.max(0, Math.round(vv.offsetTop || 0)) : 0;
  if (h && h > 180) {
    document.documentElement.style.setProperty('--vvh', `${Math.round(h)}px`);
  }
  document.documentElement.style.setProperty('--vv-top', `${top}px`);
  const active = document.activeElement;
  const isEditing = !!active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
  const kbOpen = !!vv && isEditing && (window.innerHeight - vv.height > 120);
  document.documentElement.classList.toggle('ruma-kb-open', kbOpen);
}

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    Utils.tryAutoReloadForStaleChunk(event?.payload || new Error('Failed to fetch dynamically imported module'));
  });
  try {
    const cleanUrl = new URL(window.location.href);
    if (cleanUrl.searchParams.has('_rv')) {
      cleanUrl.searchParams.delete('_rv');
      window.history.replaceState({}, '', cleanUrl.toString());
    }
  } catch (_) {}
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport);
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true });
  }
  window.addEventListener('orientationchange', () => setTimeout(syncVisualViewport, 120));
  document.addEventListener('focusin', () => setTimeout(syncVisualViewport, 40));
  document.addEventListener('focusout', () => setTimeout(syncVisualViewport, 80));
  syncVisualViewport();
}

function getCloudBadgeHtml(status) {
  if (status === 'online') {
    return `<span id="ruma-cloud-badge" class="badge badge-free" style="font-size:0.68rem;padding:0.2rem 0.55rem;" title="Sincronizado en tiempo real con la nube">🟢 En línea</span>`;
  }
  if (status === 'syncing') {
    return `<span id="ruma-cloud-badge" class="badge badge-admin" style="font-size:0.68rem;padding:0.2rem 0.55rem;" title="Sincronizando cambios en la nube...">☁️ Sincronizando...</span>`;
  }
  if (status === 'offline') {
    return `<span id="ruma-cloud-badge" class="badge badge-limit" style="font-size:0.68rem;padding:0.2rem 0.55rem;" title="Modo local">📴 Modo local</span>`;
  }
  return `<span id="ruma-cloud-badge" class="badge badge-admin" style="font-size:0.68rem;padding:0.2rem 0.55rem;">☁️ Conectando...</span>`;
}

function getDriveUploadPillHtml(state = store.getDriveUploadState()) {
  const status = state?.status || 'idle';
  if (status === 'idle') {
    return `<div id="ruma-drive-upload-pill" class="ruma-drive-upload-pill is-idle" style="display:none;"></div>`;
  }

  const pct = status === 'completed'
    ? 100
    : Math.min(99, Math.max(6, Math.round(Number(state?.percent) || 10)));
  const radius = 12;
  const circumference = +(2 * Math.PI * radius).toFixed(2);
  const offset = +(circumference * (1 - pct / 100)).toFixed(2);

  let statusClass = 'is-uploading';
  let labelText = `${pct}%`;
  let tooltip = `Subiendo "${state?.title || 'Recuerdo'}" a Google Drive (${pct}%)`;

  if (status === 'completed') {
    statusClass = 'is-completed';
    labelText = 'Carga completada';
    tooltip = `¡Carga completada en Google Drive! (${state?.title || 'Recuerdo'})`;
  } else if (status === 'paused') {
    statusClass = 'is-paused';
    labelText = `En pausa · ${pct}%`;
    tooltip = state?.error || 'Carga en pausa por desconexión. Se reanudará al volver internet (toca para reanudar).';
  } else if (status === 'error') {
    statusClass = 'is-error';
    labelText = 'Reintentar';
    tooltip = state?.error || 'La subida se detuvo. Toca para reanudar.';
  }

  return `
    <button type="button" id="ruma-drive-upload-pill" class="ruma-drive-upload-pill ${statusClass}" title="${Utils.sanitize(tooltip)}" aria-live="polite">
      <span class="ruma-drive-ring-wrap" aria-hidden="true">
        <svg class="ruma-drive-ring-svg ${status === 'uploading' ? 'is-spinning' : ''}" width="28" height="28" viewBox="0 0 28 28">
          <circle class="ruma-drive-ring-track" cx="14" cy="14" r="${radius}" fill="none" stroke-width="2.5"></circle>
          <circle class="ruma-drive-ring-fill" cx="14" cy="14" r="${radius}" fill="none" stroke-width="2.5" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"></circle>
        </svg>
        <svg class="ruma-drive-cloud-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
        </svg>
      </span>
      <span class="ruma-drive-upload-label">${Utils.sanitize(labelText)}</span>
    </button>
  `;
}

function bindDriveUploadPill() {
  const pill = document.getElementById('ruma-drive-upload-pill');
  if (!pill) return;
  pill.addEventListener('click', () => {
    const st = store.getDriveUploadState();
    if (st.status === 'paused' || st.status === 'error') {
      const grp = store.getGroups().find(g => g.id === st.groupId) || store.getActiveGroup();
      if (!GoogleAuth.hasDriveAccess() && GoogleAuth.hasValidClientId(grp)) {
        GoogleAuth.requestDriveAccess('', grp)
          .then(() => store.resumePendingDriveUploads())
          .catch(() => {});
        return;
      }
      store.resumePendingDriveUploads();
    }
  });
}

function syncDriveUploadPillDom(state = store.getDriveUploadState()) {
  const anchor = document.getElementById('ruma-drive-upload-anchor');
  if (anchor) {
    anchor.innerHTML = getDriveUploadPillHtml(state).trim();
    bindDriveUploadPill();
    return;
  }
  const existing = document.getElementById('ruma-drive-upload-pill');
  if (!existing) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = getDriveUploadPillHtml(state).trim();
  const nextEl = tmp.firstElementChild;
  if (nextEl) {
    existing.replaceWith(nextEl);
    bindDriveUploadPill();
  }
}

function getBottomCapsuleNavHtml(iface) {
  const inGroup = iface === 'group';
  const isChatActive = inGroup && store.currentGroupTab === 'chat';
  const isHomeActive = iface === 'hub' || (inGroup && !isChatActive);
  const isProfileActive = iface === 'profile';
  const unread = inGroup ? store.getUnreadChatCount(store.getActiveGroup()) : 0;
  const chatBadge = unread > 0 ? `<span class="cap-badge">${unread > 9 ? '9+' : unread}</span>` : '';
  const isSettingsActive = iface === 'settings';

  return `
    <div class="ruma-capsule-nav-wrap">
      <nav class="ruma-capsule-nav" aria-label="Navegación principal">
        <button type="button" class="ruma-capsule-btn ${isHomeActive ? 'active' : ''}" data-nav-iface="hub" ${inGroup ? 'data-nav-group-tab="home"' : ''}>
          <span class="cap-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 10.5L12 3.8L20 10.5V19.2C20 20.1941 19.1941 21 18.2 21H14.6V15.4C14.6 14.2954 13.7046 13.4 12.6 13.4H11.4C10.2954 13.4 9.4 14.2954 9.4 15.4V21H5.8C4.80589 21 4 20.1941 4 19.2V10.5Z" fill="${isHomeActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="cap-label">Inicio</span>
        </button>

        ${inGroup ? `        <button type="button" class="ruma-capsule-btn ${isChatActive ? 'active' : ''}" data-nav-iface="group" data-nav-group-tab="chat">
          <span class="cap-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.4A8 8 0 1 1 21 12z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="${isChatActive ? 'currentColor' : 'none'}"/>
            </svg>
          </span>
          ${chatBadge}
          <span class="cap-label">Chat</span>
        </button>

` : `        <button type="button" class="ruma-capsule-btn ${isProfileActive ? 'active' : ''}" data-nav-iface="profile">
          <span class="cap-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7.5" r="3.6" stroke="currentColor" stroke-width="2"/>
              <path d="M5.5 20C5.5 16.4101 8.41015 13.5 12 13.5C15.5899 13.5 18.5 16.4101 18.5 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="cap-label">Perfil</span>
        </button>

`}

        <button type="button" class="ruma-capsule-btn ${isSettingsActive ? 'active' : ''}" data-nav-iface="settings">
          <span class="cap-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="2"/>
              <path d="M19.4 15A1.65 1.65 0 0 0 19.73 16.82L19.79 16.88A2 2 0 1 1 16.96 19.71L16.9 19.65A1.65 1.65 0 0 0 15.08 19.32A1.65 1.65 0 0 0 14 20.85V21A2 2 0 1 1 10 21V20.91A1.65 1.65 0 0 0 8.92 19.38A1.65 1.65 0 0 0 7.1 19.71L7.04 19.77A2 2 0 1 1 4.21 16.94L4.27 16.88A1.65 1.65 0 0 0 4.6 15.06A1.65 1.65 0 0 0 3.09 14H3A2 2 0 1 1 3 10H3.09A1.65 1.65 0 0 0 4.6 8.92A1.65 1.65 0 0 0 4.27 7.1L4.21 7.04A2 2 0 1 1 7.04 4.21L7.1 4.27A1.65 1.65 0 0 0 8.92 4.6H9A1.65 1.65 0 0 0 10 3.09V3A2 2 0 1 1 14 3V3.09A1.65 1.65 0 0 0 15.08 4.6A1.65 1.65 0 0 0 16.9 4.27L16.96 4.21A2 2 0 1 1 19.79 7.04L19.73 7.1A1.65 1.65 0 0 0 19.4 8.92V9A1.65 1.65 0 0 0 20.91 10H21A2 2 0 1 1 21 14H20.91A1.65 1.65 0 0 0 19.4 15Z" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="cap-label">Ajustes</span>
        </button>
      </nav>
    </div>
  `;
}

function renderApp() {
  appRenderSeq += 1;
  AppNativeService.init(store);

  if (!cosmicBg) {
    try {
      cosmicBg = new CosmicBackground();
    } catch (e) {
      console.warn('CosmicBackground init error:', e);
    }
  }

  const root = document.getElementById('app');
  if (!root) return;

  const user = store.getCurrentUser();
  const iface = store.currentInterface;

  // 1. Si no ha iniciado sesión -> Pantalla completa de Login/Registro
  if (!user) {
    root.innerHTML = `<main class="ruma-auth-root" id="ruma-view-root"></main>`;
    mountInterface('auth', 'renderAuthScreen', document.getElementById('ruma-view-root'));
    return;
  }

  // 2. Si está en el Home (Inicio) -> Pantalla completa de Home + Barra Cápsula Inferior (3 pestañas)
  // La nube de subida se monta fija justo a la izquierda de la píldora de Perfil dentro del encabezado de Home
  if (iface === 'hub') {
    root.innerHTML = `
      <main class="ruma-auth-root" id="ruma-view-root"></main>
      ${getBottomCapsuleNavHtml(iface)}
    `;
    mountInterface('hub', 'renderHomeInterface', document.getElementById('ruma-view-root'));
    bindCapsuleNav(root, user);
    syncDriveUploadPillDom();
    return;
  }

  // 3. Si está dentro de un Grupo, Perfil o Ajustes -> Header limpio con regreso a Inicio + Barra Cápsula Inferior
  const avatarSrc = (user.avatar && user.avatar !== 'assets/ruma_icon_512.png')
    ? user.avatar
    : 'assets/ruma_default_avatar.png';

  root.innerHTML = `
    <header class="ruma-topbar">
      <div style="display:flex;align-items:center;gap:0.65rem;flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-sm" id="nav-back-home" style="border-radius:9999px;padding:0.4rem 0.85rem;">
          ${iface === 'group' ? (store.currentGroupTab && store.currentGroupTab !== 'home' ? '← Grupo' : '← Mis Grupos') : '← Inicio'}
        </button>
        <div class="ruma-brand" id="nav-brand-home">
          <img src="assets/ruma_home_axolotl.png" alt="ruma" class="ruma-brand-logo" style="box-shadow:none;background:transparent;">
          <span class="ruma-brand-name">ruma</span>
        </div>
        ${getCloudBadgeHtml(CloudSync.getStatus())}
      </div>

      <!-- Nube de Subida fija a la izquierda de la Píldora de Perfil -->
      <div style="display:inline-flex;align-items:center;gap:0.55rem;flex-shrink:0;">
        <span id="ruma-drive-upload-anchor" style="display:inline-flex;align-items:center;">
          ${getDriveUploadPillHtml(store.getDriveUploadState())}
        </span>
        <button type="button" class="ruma-user-pill" id="nav-user-pill" title="Abrir mi Perfil">
          <div class="avatar-wrap ${Utils.sanitize(user.frameId || 'frame-axolotl')}" style="width:30px;height:30px;">
            <img src="${Utils.sanitize(avatarSrc)}" alt="Avatar" class="avatar-img">
          </div>
          <span style="font-size:0.84rem;font-weight:700;">${Utils.sanitize(user.name.split(' ')[0])}</span>
        </button>
      </div>
    </header>

    <main class="ruma-container" id="ruma-view-root" style="padding-bottom:calc(6.5rem + env(safe-area-inset-bottom, 0px));"></main>

    ${getBottomCapsuleNavHtml(iface)}
  `;

  document.getElementById('nav-back-home')?.addEventListener('click', () => {
    if (iface === 'group' && store.currentGroupTab && store.currentGroupTab !== 'home') {
      store.navigate('group', { groupTab: 'home' });
    } else {
      store.navigate('hub');
    }
  });
  document.getElementById('nav-brand-home')?.addEventListener('click', () => store.navigate('hub'));
  document.getElementById('nav-user-pill')?.addEventListener('click', () => {
    store.navigate('profile', { inspectUserId: user.id });
  });

  bindCapsuleNav(root, user);
  bindDriveUploadPill();

  const viewRoot = document.getElementById('ruma-view-root');
  if (!viewRoot) return;

  if (iface === 'group') mountInterface('group', 'renderGroupInterface', viewRoot);
  else if (iface === 'profile') mountInterface('profile', 'renderProfileInterface', viewRoot);
  else if (iface === 'settings') mountInterface('settings', 'renderSettingsInterface', viewRoot);
}

function bindCapsuleNav(root, user) {
  root.querySelectorAll('[data-nav-iface]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-iface');
      const groupTab = btn.getAttribute('data-nav-group-tab');
      if (target === 'group' || (target === 'hub' && groupTab)) {
        store.navigate('group', { groupTab });
      } else if (target === 'profile') {
        store.navigate('profile', { inspectUserId: user.id });
      } else {
        store.navigate(target);
      }
    });
  });
}

CloudSync.onStatusChange((status) => {
  const badge = document.getElementById('ruma-cloud-badge');
  if (badge) {
    const tmp = document.createElement('div');
    tmp.innerHTML = getCloudBadgeHtml(status);
    badge.replaceWith(tmp.firstElementChild);
  }
});

store.onDriveUploadChange((state) => {
  syncDriveUploadPillDom(state);
});

store.subscribe(renderApp);
window.addEventListener('DOMContentLoaded', renderApp);
