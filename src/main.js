/**
 * ruma 🌟 — Orquestador Principal de las 4 Macro-Interfaces
 * 1. Principal (Login Triple + Hub de Grupos)
 * 2. El Grupo (Recuerdos Drive, Cine, Series, Música, Metas/Notas y Chat con Citas)
 * 3. Perfil de Usuario (Estilo Discord: Foto, Marco y Películas/Series calificadas seleccionadas)
 * 4. Ajustes (Cuenta, Rangos Administrador/Miembro, Carpeta Google Drive y Plan Freemium)
 */

import './styles/tokens.css';
import './styles/layout.css';

import { store } from './core/store.js';
import { Utils } from './core/utils.js';
import { CloudSync } from './services/cloud-sync.js';
import { CosmicBackground } from './components/cosmic-background.js';
import { renderHubInterface } from './interfaces/hub-interface.js';
import { renderGroupInterface } from './interfaces/group-interface.js';
import { renderProfileInterface } from './interfaces/profile-interface.js';
import { renderSettingsInterface } from './interfaces/settings-interface.js';

let cosmicBg = null;

function getCloudBadgeHtml(status) {
  if (status === 'online') {
    return `<span id="ruma-cloud-badge" class="badge badge-free" style="font-size:0.68rem;padding:0.2rem 0.55rem;" title="Sincronizado en tiempo real con la nube (todos los dispositivos)">🟢 En línea</span>`;
  }
  if (status === 'syncing') {
    return `<span id="ruma-cloud-badge" class="badge badge-admin" style="font-size:0.68rem;padding:0.2rem 0.55rem;" title="Sincronizando cambios en la nube...">☁️ Sincronizando...</span>`;
  }
  if (status === 'offline') {
    return `<span id="ruma-cloud-badge" class="badge badge-limit" style="font-size:0.68rem;padding:0.2rem 0.55rem;" title="Modo local (se sincronizará al recuperar conexión)">📴 Modo local</span>`;
  }
  return `<span id="ruma-cloud-badge" class="badge badge-admin" style="font-size:0.68rem;padding:0.2rem 0.55rem;">☁️ Conectando...</span>`;
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
  const activeGroup = store.getActiveGroup();
  const iface = store.currentInterface;

  // Si no ha iniciado sesión, mostrar únicamente la Interfaz 1 (Login/Registro)
  if (!user) {
    root.innerHTML = `<main class="ruma-container" id="ruma-view-root"></main>`;
    renderHubInterface(document.getElementById('ruma-view-root'));
    return;
  }

  root.innerHTML = `
    <header class="ruma-topbar">
      <div style="display:flex;align-items:center;gap:0.65rem;">
        <div class="ruma-brand" id="nav-brand-home">
          <img src="assets/ruma_icon_192.png" alt="ruma" class="ruma-brand-logo">
          <span class="ruma-brand-name">ruma</span>
        </div>
        ${getCloudBadgeHtml(CloudSync.getStatus())}
      </div>

      <!-- Navegación Principal (Escritorio) -->
      <nav class="ruma-nav-interfaces" aria-label="Navegación principal">
        <button type="button" class="ruma-iface-btn ${iface === 'hub' ? 'active' : ''}" data-nav-iface="hub">
          <span>🏠</span> <span class="label-text">Mis Grupos</span>
        </button>
        <button type="button" class="ruma-iface-btn ${iface === 'group' ? 'active' : ''}" data-nav-iface="group">
          <span>🌟</span> <span class="label-text">${Utils.sanitize(activeGroup ? activeGroup.name : 'Refugio Activo')}</span>
        </button>
        <button type="button" class="ruma-iface-btn ${iface === 'profile' ? 'active' : ''}" data-nav-iface="profile">
          <span>🎮</span> <span class="label-text">Mi Perfil</span>
        </button>
        <button type="button" class="ruma-iface-btn ${iface === 'settings' ? 'active' : ''}" data-nav-iface="settings">
          <span>⚙️</span> <span class="label-text">Ajustes</span>
        </button>
      </nav>

      <!-- Píldora de Usuario Actual -->
      <div class="ruma-user-pill" id="nav-user-pill" title="Abrir mi Perfil estilo Discord">
        <div class="avatar-wrap ${Utils.sanitize(user.frameId || 'frame-axolotl')}" style="width:30px;height:30px;">
          <img src="${Utils.sanitize(user.avatar || 'assets/ruma_icon_192.png')}" alt="Avatar" class="avatar-img">
        </div>
        <span style="font-size:0.84rem;font-weight:700;">${Utils.sanitize(user.name.split(' ')[0])}</span>
      </div>
    </header>

    <main class="ruma-container" id="ruma-view-root"></main>

    <!-- Barra de Navegación Inferior Nativa para Móviles -->
    <nav class="ruma-mobile-bottom-nav" aria-label="Navegación móvil">
      <button type="button" class="ruma-mob-nav-btn ${iface === 'hub' ? 'active' : ''}" data-nav-iface="hub">
        <span class="mob-icon">🏠</span>
        <span class="mob-label">Grupos</span>
      </button>
      <button type="button" class="ruma-mob-nav-btn ${iface === 'group' ? 'active' : ''}" data-nav-iface="group">
        <span class="mob-icon">🌟</span>
        <span class="mob-label">${Utils.sanitize(activeGroup ? (activeGroup.name.length > 10 ? activeGroup.name.slice(0, 10) + '…' : activeGroup.name) : 'Refugio')}</span>
      </button>
      <button type="button" class="ruma-mob-nav-btn ${iface === 'profile' ? 'active' : ''}" data-nav-iface="profile">
        <span class="mob-icon">🎮</span>
        <span class="mob-label">Perfil</span>
      </button>
      <button type="button" class="ruma-mob-nav-btn ${iface === 'settings' ? 'active' : ''}" data-nav-iface="settings">
        <span class="mob-icon">⚙️</span>
        <span class="mob-label">Ajustes</span>
      </button>
    </nav>
  `;

  document.getElementById('nav-brand-home')?.addEventListener('click', () => store.navigate('hub'));
  document.getElementById('nav-user-pill')?.addEventListener('click', () => {
    store.navigate('profile', { inspectUserId: user.id });
  });

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

  const viewRoot = document.getElementById('ruma-view-root');
  if (!viewRoot) return;

  if (iface === 'hub') renderHubInterface(viewRoot);
  else if (iface === 'group') renderGroupInterface(viewRoot);
  else if (iface === 'profile') renderProfileInterface(viewRoot);
  else if (iface === 'settings') renderSettingsInterface(viewRoot);
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

