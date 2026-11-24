/**
 * ruma 🌟 — INTERFAZ 1: Principal (Login Triple + Hub Central de Grupos)
 * Clean Luxury Edition
 */

import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { GoogleAuth } from '../services/google-auth.js';
import { UI } from '../components/ui.js';

export function renderHubInterface(container) {
  const user = store.getCurrentUser();

  // Si no ha iniciado sesión -> Mostrar pantalla de bienvenida y Login/Registro Triple
  if (!user) {
    renderAuthScreen(container);
    return;
  }

  const allGroups = store.getGroups();
  const myGroups = store.getMyGroups();
  const isPrem = Entitlements.isUserPremium(user, allGroups);
  const maxGroupsLabel = isPrem ? 'Ilimitados ✨' : `${myGroups.length} / ${PLAN_LIMITS.free.maxTotalGroups} grupos`;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:2rem;">
      <!-- Hero Banner Principal con Mascota ruma y Glassmorphism -->
      <div class="ruma-card" style="background:var(--grad-surface);border-color:var(--border-strong);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1.5rem;padding:2rem;">
        <div style="display:flex;align-items:center;gap:1.4rem;">
          <div style="position:relative;">
            <img src="assets/ruma_mascot.png" alt="ruma mascot" style="width:84px;height:84px;object-fit:contain;filter:drop-shadow(0 0 20px rgba(244,114,182,0.45));">
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
              <h1 style="font-family:var(--font-display);font-size:1.85rem;font-weight:900;letter-spacing:-0.03em;">
                ¡Hola, ${Utils.sanitize(user.name)}!
              </h1>
              <span class="badge ${isPrem ? 'badge-premium' : 'badge-free'}">
                ${isPrem ? '✨ ruma Plus Activo' : '🌱 Plan Gratis'}
              </span>
            </div>
            <p style="color:var(--text-secondary);font-size:0.95rem;margin-top:0.35rem;max-width:560px;line-height:1.5;">
              Bienvenido a tu santuario privado. Administra tus grupos, crea un espacio nuevo o únete con un código de 6 caracteres.
            </p>
          </div>
        </div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary" id="btn-hub-go-profile">
            🎮 Mi Perfil Discord
          </button>
          <button type="button" class="btn btn-secondary" id="btn-hub-go-settings">
            ⚙️ Ajustes & Plan
          </button>
        </div>
      </div>

      <!-- Desglose de las 2 Opciones de Entrada: Modo Creador vs Modo Miembro -->
      <div class="ruma-grid-2">
        <!-- 1. CREAR GRUPO (Modo Creador) -->
        <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1.25rem;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
              <span class="badge badge-admin">👑 Modo Creador</span>
              <span style="font-size:0.8rem;color:var(--text-muted);">1 grupo propio</span>
            </div>
            <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;margin-bottom:0.45rem;">
              ✨ Crear un Nuevo Grupo
            </h2>
            <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.55;">
              Crea tu espacio privado, vincula la carpeta de <strong>Google Drive</strong> para guardar fotos y videos sin límite de peso por fecha, y elige entre <strong>Grupo Gratis</strong> o <strong>Grupo Premium 🌟</strong>.
            </p>
          </div>
          <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
            <button type="button" class="btn btn-primary" id="btn-open-create-free">
              🌱 Crear Grupo Gratis
            </button>
            <button type="button" class="btn btn-premium" id="btn-open-create-premium">
              ✨ Crear Grupo Premium
            </button>
          </div>
        </div>

        <!-- 2. BUSCAR / UNIRSE (Modo Miembro) -->
        <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1.25rem;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
              <span class="badge badge-limit">🔑 Modo Miembro</span>
              <span style="font-size:0.8rem;color:var(--brand-lilac);">Cupo: ${maxGroupsLabel}</span>
            </div>
            <h2 style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;margin-bottom:0.45rem;">
              🔍 Buscar o Unirse a un Grupo
            </h2>
            <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.55;">
              Ingresa el código de 6 caracteres (ej: <code style="color:var(--brand-pink);background:rgba(244,114,182,0.15);padding:0.15rem 0.4rem;border-radius:6px;">RUMA01</code> o <code style="color:var(--brand-pink);background:rgba(244,114,182,0.15);padding:0.15rem 0.4rem;border-radius:6px;">CINE99</code>) o el nombre del grupo para acceder como invitado.
            </p>
          </div>
          <form id="form-hub-join-group" style="display:flex;gap:0.65rem;">
            <input type="text" id="input-hub-join-code" class="form-input" placeholder="Código ej: RUMA01 o nombre..." required style="text-transform:uppercase;">
            <button type="submit" class="btn btn-primary">Unirme</button>
          </form>
        </div>
      </div>

      <!-- 3. GRUPOS A LOS QUE PERTENECES -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.15rem;flex-wrap:wrap;gap:0.75rem;">
          <div>
            <h2 style="font-family:var(--font-display);font-size:1.45rem;font-weight:800;">
              📂 Mis Santuarios Privados (${myGroups.length})
            </h2>
            <p style="font-size:0.84rem;color:var(--text-muted);">
              Toca cualquier grupo para entrar directamente a su espacio privado.
            </p>
          </div>
          <span class="badge ${isPrem ? 'badge-premium' : 'badge-limit'}">
            Límite de grupos: ${maxGroupsLabel}
          </span>
        </div>

        ${myGroups.length === 0 ? `
          <div class="ruma-card" style="text-align:center;padding:3rem 1.5rem;">
            <p style="color:var(--text-secondary);font-size:0.95rem;">Aún no perteneces a ningún grupo. ¡Crea el primero o únete con un código!</p>
          </div>
        ` : `
          <div class="ruma-grid-2">
            ${myGroups.map(g => {
              const isCreator = g.creatorId === user.id;
              const isAdmin = Entitlements.isGroupAdmin(g, user.id);
              const gPrem = Entitlements.isGroupPremium(g);
              return `
                <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1.25rem;">
                  <div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.75rem;">
                      <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
                        <span class="badge ${gPrem ? 'badge-premium' : 'badge-free'}">${gPrem ? '✨ Grupo Premium' : '🌱 Grupo Gratis'}</span>
                        <span class="badge badge-admin">${isCreator ? '👑 Creador & Admin' : (isAdmin ? '🛡️ Administrador' : '👤 Miembro')}</span>
                      </div>
                      <span style="font-family:var(--font-mono);font-size:0.82rem;color:var(--brand-lilac);font-weight:700;">
                        Código: ${Utils.sanitize(g.code)}
                      </span>
                    </div>

                    <h3 style="font-family:var(--font-display);font-size:1.4rem;font-weight:800;margin-bottom:0.35rem;">
                      ${Utils.sanitize(g.name)}
                    </h3>
                    <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.5;">
                      ${Utils.sanitize(g.description || 'Espacio privado en ruma')}
                    </p>
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border-subtle);padding-top:1rem;gap:0.75rem;flex-wrap:wrap;">
                    <div style="font-size:0.8rem;color:var(--text-muted);display:flex;gap:0.6rem;flex-wrap:wrap;">
                      <span>👥 ${(g.members || []).length} miembros</span>
                      <span>📸 ${(g.memories || []).length} recuerdos</span>
                      <span>🎬 ${(g.movies || []).length}/${gPrem ? '∞' : '5'}</span>
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
          <label class="form-label">Descripción o Lema</label>
          <input type="text" id="create-grp-desc" class="form-input" placeholder="Recuerdos, películas y momentos compartidos">
        </div>
        <div class="form-group">
          <label class="form-label">Carpeta de Google Drive del Grupo (Pública con permisos de Editor)</label>
          <input type="url" id="create-grp-drive" class="form-input" placeholder="https://drive.google.com/drive/folders/...">
          <small style="color:var(--text-muted);font-size:0.76rem;margin-top:0.25rem;display:block;">
            En esta carpeta se crearán automáticamente las subcarpetas por fecha de cada recuerdo sin límite de peso.
          </small>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Grupo</label>
          <select id="create-grp-plan" class="form-select">
            <option value="free" ${defaultPlan === 'free' ? 'selected' : ''}>🌱 Grupo Gratis (Tope de 5 películas, series y canciones)</option>
            <option value="premium" ${defaultPlan === 'premium' ? 'selected' : ''}>✨ Grupo Premium ruma Plus (Cine, series y música ilimitadas)</option>
          </select>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:1.5rem;">
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
    <div style="max-width:480px;margin:2rem auto;">
      <div class="ruma-card" style="text-align:center;padding:2.4rem 2rem;">
        <img src="assets/ruma_icon_512.png" alt="ruma logo" style="width:92px;height:92px;border-radius:24px;box-shadow:var(--shadow-glow);margin-bottom:1rem;display:inline-block;">
        <h1 class="ruma-brand-name" style="font-size:2.5rem;margin-bottom:0.35rem;">ruma</h1>
        <p style="color:var(--text-secondary);font-size:0.95rem;margin-bottom:1.4rem;line-height:1.5;">
          Tus personas · Tus recuerdos · Tu refugio.<br>
          <span style="font-size:0.84rem;color:var(--text-muted);">Inicia sesión con <strong>Google</strong> o con tu cuenta de <strong>ruma</strong>.</span>
        </p>

        <!-- Botón de Inicio de Sesión con Google OAuth 2.0 -->
        <button
          type="button"
          class="btn btn-primary"
          id="btn-auth-google-signin"
          style="width:100%;padding:0.85rem 1.2rem;font-size:0.96rem;display:flex;align-items:center;justify-content:center;gap:0.75rem;box-shadow:var(--shadow-glow);margin-bottom:0.85rem;"
        >
          <span style="background:#fff;color:#111;width:25px;height:25px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:0.92rem;">G</span>
          <span>Continuar con Google (Drive)</span>
        </button>

        <div id="auth-google-feedback" style="display:none;margin-bottom:0.85rem;padding:0.7rem 0.85rem;border-radius:var(--radius-sm);font-size:0.8rem;text-align:left;"></div>

        <div style="display:flex;align-items:center;gap:0.75rem;margin:1rem 0;color:var(--text-muted);font-size:0.76rem;">
          <div style="flex:1;height:1px;background:var(--border-subtle);"></div>
          <span>o accede directamente a la app</span>
          <div style="flex:1;height:1px;background:var(--border-subtle);"></div>
        </div>

        <!-- Selector Login vs Registro -->
        <div style="display:flex;gap:0.5rem;margin-bottom:1.25rem;background:rgba(14,6,30,0.8);padding:0.35rem;border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
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
          <button type="submit" class="btn btn-secondary" style="width:100%;margin-top:0.65rem;padding:0.8rem;">
            Entrar a ruma ➔
          </button>
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
          <button type="submit" class="btn btn-primary" style="width:100%;margin-top:0.65rem;padding:0.8rem;">
            Registrarme y Entrar ✨
          </button>
        </form>
      </div>
    </div>
  `;

  const btnGoogle = document.getElementById('btn-auth-google-signin');
  const feedbackEl = document.getElementById('auth-google-feedback');
  const loginForm = document.getElementById('form-auth-login');
  const regForm = document.getElementById('form-auth-register');
  const tabLogin = document.getElementById('tab-auth-login');
  const tabReg = document.getElementById('tab-auth-register');

  const showErr = (msg) => {
    if (!feedbackEl) return;
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(239,68,68,0.14)';
    feedbackEl.style.border = '1px solid rgba(239,68,68,0.4)';
    feedbackEl.style.color = '#FCA5A5';
    feedbackEl.textContent = msg;
  };

  btnGoogle?.addEventListener('click', async () => {
    const cid = GoogleAuth.getClientId();
    btnGoogle.disabled = true;
    const prevHtml = btnGoogle.innerHTML;
    btnGoogle.textContent = '⏳ Conectando con Google...';

    try {
      const session = await GoogleAuth.requestDriveAccess(cid);
      const res = store.loginWithGoogle({
        email: session.email,
        name: session.name,
        picture: session.picture
      });
      if (res.ok) {
        UI.showToast(`¡Bienvenido, ${res.user.name}! Google Drive conectado ☁️✨`, 'success');
      }
    } catch (err) {
      showErr(`❌ No se pudo iniciar sesión con Google: ${err.message}`);
    } finally {
      btnGoogle.disabled = false;
      btnGoogle.innerHTML = prevHtml;
    }
  });

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

