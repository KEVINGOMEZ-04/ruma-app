/**
 * ruma 🌟 — INTERFAZ 1: Principal (Login Triple + Hub Central de Grupos)
 *
 * Funcionalidades:
 * 1. Si no ha iniciado sesión: Login / Registro con Correo + Contraseña, Teléfono + Contraseña o @Usuario + Contraseña.
 * 2. Una vez dentro: Hub Central con el desglose de:
 *    - 📂 Grupos a los que perteneces (con límite de 2 en Plan Gratis: 1 creado + 1 unido).
 *    - ✨ Crear grupo (Gratis o Premium — única forma de obtener Premium).
 *    - 🔍 Buscar / Unirse a grupo (por código o nombre).
 */

import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';

export function renderHubInterface(container) {
  const user = store.getCurrentUser();

  // Si no hay sesión activa -> Mostrar Login / Registro Triple
  if (!user) {
    renderAuthScreen(container);
    return;
  }

  const allGroups = store.getGroups();
  const myGroups = store.getMyGroups();
  const isPrem = Entitlements.isUserPremium(user, allGroups);
  const maxGroupsLabel = isPrem ? 'Ilimitados ✨' : `${myGroups.length} / ${PLAN_LIMITS.free.maxTotalGroups} grupos`;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1.75rem;">
      <!-- Banner de Bienvenida con Mascota ruma -->
      <div class="ruma-card" style="background:var(--grad-surface);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1.25rem;">
        <div style="display:flex;align-items:center;gap:1.1rem;">
          <img src="assets/ruma_mascot.png" alt="ruma mascot" style="width:76px;height:76px;object-fit:contain;">
          <div>
            <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
              <h1 style="font-family:var(--font-display);font-size:1.65rem;font-weight:800;">¡Hola, ${Utils.sanitize(user.name)}!</h1>
              <span class="badge ${isPrem ? 'badge-premium' : 'badge-free'}">${isPrem ? '✨ ruma Plus Activo' : '🌱 Plan Gratis'}</span>
            </div>
            <p style="color:var(--text-secondary);font-size:0.92rem;margin-top:0.25rem;">
              Gestiona tus grupos privados, crea un santuario nuevo o únete con un código.
            </p>
          </div>
        </div>
        <div style="display:flex;gap:0.65rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-hub-go-profile">🎮 Mi Perfil Discord</button>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-hub-go-settings">⚙️ Ajustes</button>
        </div>
      </div>

      <!-- Desglose de las 3 Opciones Principales del Hub -->
      <div class="ruma-grid-2">
        <!-- OPCIÓN 1: Crear Grupo (Modo Creador) -->
        <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1rem;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
              <span class="badge badge-admin">👑 Modo Creador</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">1 grupo propio</span>
            </div>
            <h2 style="font-family:var(--font-display);font-size:1.3rem;margin-bottom:0.4rem;">✨ Crear un Grupo</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.5;">
              Crea tu propio grupo privado, conecta tu carpeta de Google Drive para los recuerdos y elige entre <strong>Grupo Gratis</strong> o <strong>Grupo Premium 🌟</strong>.
            </p>
          </div>
          <div style="display:flex;gap:0.65rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" id="btn-open-create-free">Crear Grupo Gratis</button>
            <button type="button" class="btn btn-premium" id="btn-open-create-premium">✨ Crear Grupo Premium</button>
          </div>
        </div>

        <!-- OPCIÓN 2: Buscar / Unirse a un Grupo (Modo Usuario) -->
        <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1rem;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;">
              <span class="badge badge-limit">🔑 Modo Miembro</span>
              <span style="font-size:0.78rem;color:var(--text-muted);">Cupo: ${maxGroupsLabel}</span>
            </div>
            <h2 style="font-family:var(--font-display);font-size:1.3rem;margin-bottom:0.4rem;">🔍 Buscar o Unirse a un Grupo</h2>
            <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.5;">
              Ingresa el código de 6 caracteres (ej: <code>RUMA01</code> o <code>CINE99</code>) o busca por el nombre del grupo para entrar como miembro.
            </p>
          </div>
          <form id="form-hub-join-group" style="display:flex;gap:0.6rem;">
            <input type="text" id="input-hub-join-code" class="form-input" placeholder="Código o nombre del grupo..." required>
            <button type="submit" class="btn btn-primary">Unirme</button>
          </form>
        </div>
      </div>

      <!-- OPCIÓN 3: Grupos a los que perteneces -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
          <h2 style="font-family:var(--font-display);font-size:1.35rem;">📂 Grupos a los que perteneces</h2>
          <span class="badge ${isPrem ? 'badge-premium' : 'badge-limit'}">Capacidad actual: ${maxGroupsLabel}</span>
        </div>

        ${myGroups.length === 0 ? `
          <div class="ruma-card" style="text-align:center;padding:2.5rem;">
            <p style="color:var(--text-secondary);">Aún no perteneces a ningún grupo. ¡Crea uno arriba o únete con un código!</p>
          </div>
        ` : `
          <div class="ruma-grid-2">
            ${myGroups.map(g => {
              const isCreator = g.creatorId === user.id;
              const isAdmin = Entitlements.isGroupAdmin(g, user.id);
              const gPrem = Entitlements.isGroupPremium(g);
              return `
                <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1rem;">
                  <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.6rem;">
                      <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                        <span class="badge ${gPrem ? 'badge-premium' : 'badge-free'}">${gPrem ? '✨ Grupo Premium' : '🌱 Grupo Gratis'}</span>
                        <span class="badge badge-admin">${isCreator ? '👑 Creador & Admin' : (isAdmin ? '🛡️ Administrador' : '👤 Miembro')}</span>
                      </div>
                      <span style="font-family:var(--font-mono);font-size:0.8rem;color:var(--brand-lilac);">Código: ${Utils.sanitize(g.code)}</span>
                    </div>
                    <h3 style="font-family:var(--font-display);font-size:1.3rem;margin-bottom:0.3rem;">${Utils.sanitize(g.name)}</h3>
                    <p style="color:var(--text-secondary);font-size:0.86rem;">${Utils.sanitize(g.description || 'Espacio privado en ruma')}</p>
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-subtle);padding-top:0.85rem;gap:0.75rem;flex-wrap:wrap;">
                    <div style="font-size:0.78rem;color:var(--text-muted);">
                      👥 ${(g.members || []).length} miembros · 📸 ${(g.memories || []).length} recuerdos · 🎬 ${(g.movies || []).length}/${gPrem ? '∞' : '5'} pelis
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" data-enter-group="${Utils.sanitize(g.id)}">
                      Entrar al Grupo ➔
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;

  // Eventos del Hub
  document.getElementById('btn-hub-go-profile')?.addEventListener('click', () => {
    store.navigate('profile', { inspectUserId: user.id });
  });
  document.getElementById('btn-hub-go-settings')?.addEventListener('click', () => {
    store.navigate('settings');
  });

  document.getElementById('btn-open-create-free')?.addEventListener('click', () => openCreateGroupModal('free'));
  document.getElementById('btn-open-create-premium')?.addEventListener('click', () => openCreateGroupModal('premium'));

  document.getElementById('form-hub-join-group')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = document.getElementById('input-hub-join-code')?.value || '';
    const res = store.joinGroupByCodeOrQuery(query);
    if (!res.ok) {
      if (res.needsUpgrade) {
        UI.showUpgradeModal(res.reason, () => openCreateGroupModal('premium'));
      } else {
        UI.showToast(res.reason, 'error');
      }
      return;
    }
    UI.showToast(`Has entrado a "${res.group.name}" ✨`, 'success');
  });

  container.querySelectorAll('[data-enter-group]').forEach(btn => {
    btn.addEventListener('click', () => {
      const groupId = btn.getAttribute('data-enter-group');
      store.setActiveGroup(groupId);
    });
  });
}

function openCreateGroupModal(defaultPlan = 'free') {
  const user = store.getCurrentUser();
  const check = Entitlements.canCreateGroup(user, store.getGroups(), defaultPlan);
  if (!check.allowed) {
    UI.showToast(check.reason, 'info');
    return;
  }

  UI.openModal({
    title: defaultPlan === 'premium' ? '✨ Crear Grupo Premium (ruma Plus)' : '🌱 Crear Grupo Gratis',
    contentHtml: `
      <form id="form-modal-create-group">
        <div class="form-group">
          <label class="form-label">Nombre del Grupo</label>
          <input type="text" id="create-grp-name" class="form-input" placeholder="Ej: Nuestro Refugio ✨" required>
        </div>
        <div class="form-group">
          <label class="form-label">Descripción o frase</label>
          <input type="text" id="create-grp-desc" class="form-input" placeholder="Recuerdos, películas y planes juntos">
        </div>
        <div class="form-group">
          <label class="form-label">Carpeta de Google Drive del Grupo (Pública / Editor)</label>
          <input type="url" id="create-grp-drive" class="form-input" placeholder="https://drive.google.com/drive/folders/...">
          <small style="color:var(--text-muted);font-size:0.75rem;">
            Aquí se crearán automáticamente las carpetas por fecha de cada recuerdo sin límite de peso.
          </small>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Grupo</label>
          <select id="create-grp-plan" class="form-select">
            <option value="free" ${defaultPlan === 'free' ? 'selected' : ''}>🌱 Grupo Gratis (Máx 5 películas, 5 series y 5 canciones)</option>
            <option value="premium" ${defaultPlan === 'premium' ? 'selected' : ''}>✨ Grupo Premium ruma Plus (Todo ilimitado + más grupos)</option>
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-create-grp">Cancelar</button>
          <button type="submit" class="btn ${defaultPlan === 'premium' ? 'btn-premium' : 'btn-primary'}">Crear Grupo</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('btn-cancel-create-grp')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-modal-create-group')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('create-grp-name')?.value;
        const description = document.getElementById('create-grp-desc')?.value;
        const driveFolderUrl = document.getElementById('create-grp-drive')?.value;
        const plan = document.getElementById('create-grp-plan')?.value;

        const res = store.createGroup({ name, description, driveFolderUrl, plan });
        if (!res.ok) {
          UI.showToast(res.reason, 'error');
          return;
        }
        UI.closeModal();
        UI.showToast(`¡Grupo "${res.group.name}" creado con código ${res.group.code}! 🎉`, 'success');
      });
    }
  });
}

function renderAuthScreen(container) {
  container.innerHTML = `
    <div style="max-width:460px;margin:2rem auto;">
      <div class="ruma-card" style="text-align:center;padding:2rem;">
        <img src="assets/ruma_icon_512.png" alt="ruma logo" style="width:84px;height:84px;border-radius:22px;box-shadow:var(--shadow-glow);margin-bottom:0.85rem;">
        <h1 class="ruma-brand-name" style="font-size:2.3rem;margin-bottom:0.25rem;">ruma</h1>
        <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:1.5rem;">
          Inicia sesión con tu <strong>Correo</strong>, <strong>Teléfono</strong> o <strong>@Usuario</strong> y tu contraseña.
        </p>

        <!-- Selector Login vs Registro -->
        <div style="display:flex;gap:0.5rem;margin-bottom:1.25rem;background:var(--bg-elevated);padding:0.3rem;border-radius:var(--radius-md);">
          <button type="button" class="btn btn-primary btn-sm" id="tab-auth-login" style="flex:1;">Iniciar Sesión</button>
          <button type="button" class="btn btn-secondary btn-sm" id="tab-auth-register" style="flex:1;">Crear Cuenta</button>
        </div>

        <!-- Formulario Login Triple -->
        <form id="form-auth-login" style="text-align:left;">
          <div class="form-group">
            <label class="form-label">Correo, Número de Teléfono o @Usuario</label>
            <input type="text" id="login-identifier" class="form-input" placeholder="ej: kevin@ruma.app | 3001234567 | @kevin" value="kevin@ruma.app" required>
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input type="password" id="login-password" class="form-input" placeholder="••••••••" value="123" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Entrar a ruma ➔</button>
          <p style="font-size:0.76rem;color:var(--text-muted);margin-top:0.85rem;text-align:center;">
            Demo rápida: <code>kevin@ruma.app</code> / <code>3001234567</code> / <code>@kevin</code> (Contraseña: <code>123</code>)
          </p>
        </form>

        <!-- Formulario Registro Triple -->
        <form id="form-auth-register" style="text-align:left;display:none;">
          <div class="form-group">
            <label class="form-label">Tu Nombre</label>
            <input type="text" id="reg-name" class="form-input" placeholder="Ej: Kevin Gómez" required>
          </div>
          <div class="form-group">
            <label class="form-label">Nombre de Usuario (@usuario)</label>
            <input type="text" id="reg-username" class="form-input" placeholder="ej: kevin04" required>
          </div>
          <div class="form-group">
            <label class="form-label">Correo Electrónico</label>
            <input type="email" id="reg-email" class="form-input" placeholder="tu@correo.com">
          </div>
          <div class="form-group">
            <label class="form-label">Número de Teléfono</label>
            <input type="tel" id="reg-phone" class="form-input" placeholder="Ej: 3001234567">
          </div>
          <div class="form-group">
            <label class="form-label">Contraseña</label>
            <input type="password" id="reg-password" class="form-input" placeholder="Crea tu contraseña" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Registrarme y Entrar ✨</button>
        </form>
      </div>
    </div>
  `;

  const loginForm = document.getElementById('form-auth-login');
  const regForm = document.getElementById('form-auth-register');
  const tabLogin = document.getElementById('tab-auth-login');
  const tabReg = document.getElementById('tab-auth-register');

  tabLogin?.addEventListener('click', () => {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    tabLogin.className = 'btn btn-primary btn-sm';
    tabReg.className = 'btn btn-secondary btn-sm';
  });

  tabReg?.addEventListener('click', () => {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    tabReg.className = 'btn btn-primary btn-sm';
    tabLogin.className = 'btn btn-secondary btn-sm';
  });

  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('login-identifier')?.value;
    const pw = document.getElementById('login-password')?.value;
    const res = store.login(id, pw);
    if (!res.ok) {
      UI.showToast(res.error, 'error');
      return;
    }
    UI.showToast(`¡Bienvenido de nuevo, ${res.user.name}! 💜`, 'success');
  });

  regForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const res = store.register({
      name: document.getElementById('reg-name')?.value,
      username: document.getElementById('reg-username')?.value,
      email: document.getElementById('reg-email')?.value,
      phone: document.getElementById('reg-phone')?.value,
      password: document.getElementById('reg-password')?.value
    });
    if (!res.ok) {
      UI.showToast(res.error, 'error');
      return;
    }
    UI.showToast(`¡Cuenta creada con éxito, ${res.user.name}! 🎉`, 'success');
  });
}
