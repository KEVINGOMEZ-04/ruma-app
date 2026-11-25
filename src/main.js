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

import { store } from './core/store.js';
import { Utils } from './core/utils.js';
import { CloudSync } from './services/cloud-sync.js';
import { CosmicBackground } from './components/cosmic-background.js';
import { renderAuthScreen } from './interfaces/auth-interface.js';
import { renderHomeInterface } from './interfaces/home-interface.js';
import { renderGroupInterface } from './interfaces/group-interface.js';
import { renderProfileInterface } from './interfaces/profile-interface.js';
import { renderSettingsInterface } from './interfaces/settings-interface.js';

let cosmicBg = null;

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

function getBottomCapsuleNavHtml(iface) {
  const isHomeActive = iface === 'hub';
  const isProfileActive = iface === 'profile';
  const isSettingsActive = iface === 'settings';

  return `
    <div class="ruma-capsule-nav-wrap">
      <nav class="ruma-capsule-nav" aria-label="Navegación principal">
        <button type="button" class="ruma-capsule-btn ${isHomeActive ? 'active' : ''}" data-nav-iface="hub">
          <span class="cap-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 10.5L12 3.8L20 10.5V19.2C20 20.1941 19.1941 21 18.2 21H14.6V15.4C14.6 14.2954 13.7046 13.4 12.6 13.4H11.4C10.2954 13.4 9.4 14.2954 9.4 15.4V21H5.8C4.80589 21 4 20.1941 4 19.2V10.5Z" fill="${isHomeActive ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="cap-label">Inicio</span>
        </button>

        <button type="button" class="ruma-capsule-btn ${isProfileActive ? 'active' : ''}" data-nav-iface="profile">
          <span class="cap-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="7.5" r="3.6" stroke="currentColor" stroke-width="2"/>
              <path d="M5.5 20C5.5 16.4101 8.41015 13.5 12 13.5C15.5899 13.5 18.5 16.4101 18.5 20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="cap-label">Perfil</span>
        </button>

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
    renderAuthScreen(document.getElementById('ruma-view-root'));
    return;
  }

  // 2. Si está en el Home (Inicio) -> Pantalla completa de Home + Barra Cápsula Inferior (3 pestañas)
  if (iface === 'hub') {
    root.innerHTML = `
      <main class="ruma-auth-root" id="ruma-view-root"></main>
      ${getBottomCapsuleNavHtml(iface)}
    `;
    renderHomeInterface(document.getElementById('ruma-view-root'));
    bindCapsuleNav(root, user);
    return;
  }

  // 3. Si está dentro de un Grupo, Perfil o Ajustes -> Header limpio con regreso a Inicio + Barra Cápsula Inferior
  const avatarSrc = (user.avatar && user.avatar !== 'assets/ruma_icon_512.png')
    ? user.avatar
    : 'assets/ruma_default_avatar.png';

  root.innerHTML = `
    <header class="ruma-topbar">
      <div style="display:flex;align-items:center;gap:0.65rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="nav-back-home" style="border-radius:9999px;padding:0.4rem 0.85rem;">
          ← Inicio
        </button>
        <div class="ruma-brand" id="nav-brand-home">
          <img src="assets/ruma_home_axolotl.png" alt="ruma" class="ruma-brand-logo" style="box-shadow:none;background:transparent;">
          <span class="ruma-brand-name">ruma</span>
        </div>
        ${getCloudBadgeHtml(CloudSync.getStatus())}
      </div>

      <!-- Píldora de Usuario Actual -->
      <div class="ruma-user-pill" id="nav-user-pill" title="Abrir mi Perfil">
        <div class="avatar-wrap ${Utils.sanitize(user.frameId || 'frame-axolotl')}" style="width:30px;height:30px;">
          <img src="${Utils.sanitize(avatarSrc)}" alt="Avatar" class="avatar-img">
        </div>
        <span style="font-size:0.84rem;font-weight:700;">${Utils.sanitize(user.name.split(' ')[0])}</span>
      </div>
    </header>

    <main class="ruma-container" id="ruma-view-root" style="padding-bottom:6.5rem;"></main>

    ${getBottomCapsuleNavHtml(iface)}
  `;

  document.getElementById('nav-back-home')?.addEventListener('click', () => store.navigate('hub'));
  document.getElementById('nav-brand-home')?.addEventListener('click', () => store.navigate('hub'));
  document.getElementById('nav-user-pill')?.addEventListener('click', () => {
    store.navigate('profile', { inspectUserId: user.id });
  });

  bindCapsuleNav(root, user);

  const viewRoot = document.getElementById('ruma-view-root');
  if (!viewRoot) return;

  if (iface === 'group') renderGroupInterface(viewRoot);
  else if (iface === 'profile') renderProfileInterface(viewRoot);
  else if (iface === 'settings') renderSettingsInterface(viewRoot);
}

function bindCapsuleNav(root, user) {
  root.querySelectorAll('[data-nav-iface]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-iface');
      if (target === 'profile') {
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

store.subscribe(renderApp);
window.addEventListener('DOMContentLoaded', renderApp);
