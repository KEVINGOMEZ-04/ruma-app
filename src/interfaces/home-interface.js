/**
 * ruma 🌟 — Módulo Exclusivo del Home (Inicio), Tarjetas de Grupos y Modales Freemium
 */

import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { CloudSync } from '../services/cloud-sync.js';
import { UI } from '../components/ui.js';
import { renderAuthScreen } from './auth-interface.js';

export function renderHomeInterface(container) {
  const user = store.getCurrentUser();

  if (!user) {
    renderAuthScreen(container);
    return;
  }

  const allGroups = store.getGroups();
  const myGroups = store.getMyGroups();
  const isPrem = Entitlements.isUserPremium(user, allGroups);
  const firstName = (user.name || 'Usuario').trim().split(/\s+/)[0];
  const avatarSrc = (user.avatar && user.avatar !== 'assets/ruma_icon_512.png')
    ? user.avatar
    : 'assets/ruma_default_avatar.png';
  const accountSubLabel = isPrem ? 'Cuenta Plus ✨' : 'Cuenta personal';
  const quotaLabel = isPrem
    ? 'ruma Plus · Grupos ilimitados ✨'
    : `Plan Gratis · ${myGroups.length} / ${PLAN_LIMITS.free.maxTotalGroups} grupos`;
  const cloudOnline = CloudSync.getStatus() !== 'offline';

  container.innerHTML = `
    <div class="ruma-home-shell">
      <!-- Ondas de luz neón violeta del fondo (arriba derecha y abajo izquierda) -->
      <svg class="ruma-home-bg-waves" viewBox="0 0 600 1000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="homeWaveTopRight" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#7E22CE" stop-opacity="0" />
            <stop offset="45%" stop-color="#A855F7" stop-opacity="0.65" />
            <stop offset="100%" stop-color="#E879F9" stop-opacity="0.95" />
          </linearGradient>
          <linearGradient id="homeWaveBotLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#E879F9" stop-opacity="0.95" />
            <stop offset="55%" stop-color="#A855F7" stop-opacity="0.55" />
            <stop offset="100%" stop-color="#581C87" stop-opacity="0" />
          </linearGradient>
          <filter id="homeNeonBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="b1" />
            <feGaussianBlur stdDeviation="14" result="b2" />
            <feMerge>
              <feMergeNode in="b2" />
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <!-- Curva neón superior derecha -->
        <path d="M465,245 C515,175 555,140 612,108" fill="none" stroke="url(#homeWaveTopRight)" stroke-width="3" filter="url(#homeNeonBlur)" />
        <!-- Curva neón inferior izquierda -->
        <path d="M-12,805 C35,832 82,872 135,935" fill="none" stroke="url(#homeWaveBotLeft)" stroke-width="3" filter="url(#homeNeonBlur)" />
      </svg>

      <div class="ruma-home-inner">
        <!-- 1. Encabezado Superior: Logo ruma✨ + Píldora de Cuenta con Menú -->
        <header class="ruma-home-topbar">
          <div class="ruma-home-brand" id="home-brand-reload" title="ruma · Inicio">
            <img src="assets/ruma_home_axolotl.png" alt="ruma" class="ruma-home-brand-mascot">
            <span class="ruma-home-brand-word">
              <span class="ru">ru</span><span class="ma">ma</span>
              <svg class="ruma-home-sparkles" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 1L14.2 7.8L21 10L14.2 12.2L12 19L9.8 12.2L3 10L9.8 7.8L12 1Z" fill="#E9D5FF"/>
                <path d="M19.5 14L20.5 17L23.5 18L20.5 19L19.5 22L18.5 19L15.5 18L18.5 17L19.5 14Z" fill="#C084FC"/>
              </svg>
            </span>
          </div>

          <div class="ruma-home-account-wrap" id="home-account-wrap">
            <button type="button" class="ruma-home-account-pill" id="btn-home-account-pill" title="Abrir mi Perfil">
              <img src="${Utils.sanitize(avatarSrc)}" alt="${Utils.sanitize(firstName)}" class="ruma-home-avatar">
              <div class="ruma-home-account-meta">
                <span class="ruma-home-account-name">${Utils.sanitize(firstName)}</span>
                <span class="ruma-home-account-sub">${Utils.sanitize(accountSubLabel)}</span>
              </div>
            </button>
          </div>
        </header>

        <!-- 2. Saludo Principal -->
        <section class="ruma-home-greeting">
          <h1 class="ruma-home-hello">Hola, ${Utils.sanitize(firstName)} 👋</h1>
          <p class="ruma-home-subtitle">Tu espacio comienza aquí.</p>
        </section>

        <!-- 3. Grid de 2 Tarjetas: Crear grupo | Unirme a grupo -->
        <section class="ruma-home-actions-grid" aria-label="Acciones de grupo">
          <button type="button" class="ruma-home-action-card primary" id="btn-home-create-group">
            <span class="ruma-home-action-icon" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <rect x="4" y="4" width="36" height="36" rx="11" stroke="currentColor" stroke-width="2.4"/>
                <line x1="22" y1="14" x2="22" y2="30" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
                <line x1="14" y1="22" x2="30" y2="22" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="ruma-home-action-title">Crear grupo</span>
            <span class="ruma-home-action-desc">Construye un nuevo espacio para tu gente.</span>
          </button>

          <button type="button" class="ruma-home-action-card secondary" id="btn-home-join-group">
            <span class="ruma-home-action-icon" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path d="M15 6H11C8.23858 6 6 8.23858 6 11V15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M29 6H33C35.7614 6 38 8.23858 38 11V15" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M15 38H11C8.23858 38 6 35.7614 6 33V29" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M29 38H33C35.7614 38 38 35.7614 38 33V29" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
              </svg>
            </span>
            <span class="ruma-home-action-title">Unirme a grupo</span>
            <span class="ruma-home-action-desc">Ingresa un código de invitación.</span>
          </button>
        </section>

        <!-- 4. Sección: Mis grupos -->
        <section class="ruma-home-groups-section" aria-label="Mis grupos">
          <div class="ruma-home-section-head">
            <h2 class="ruma-home-section-title">
              <svg width="26" height="26" viewBox="0 0 28 24" fill="none" aria-hidden="true">
                <circle cx="14" cy="7.5" r="3.4" stroke="currentColor" stroke-width="2"/>
                <path d="M8.2 19.5C8.2 16.4 10.7 14.2 14 14.2C17.3 14.2 19.8 16.4 19.8 19.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <circle cx="5.5" cy="9.5" r="2.4" stroke="currentColor" stroke-width="1.8"/>
                <path d="M1.8 19.5C1.8 17.1 3.4 15.4 5.8 15.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <circle cx="22.5" cy="9.5" r="2.4" stroke="currentColor" stroke-width="1.8"/>
                <path d="M26.2 19.5C26.2 17.1 24.6 15.4 22.2 15.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <span>Mis grupos</span>
            </h2>
            ${myGroups.length > 0 ? `
              <span class="ruma-home-quota-pill">
                ${isPrem ? `${myGroups.length} · Plus ✨` : `${myGroups.length} / ${PLAN_LIMITS.free.maxTotalGroups} grupos`}
              </span>
            ` : ''}
          </div>

          ${myGroups.length === 0 ? `
            <!-- Estado Vacío idéntico al Mockup -->
            <div class="ruma-home-empty-card">
              <div class="ruma-home-empty-icon-box" aria-hidden="true">
                <svg width="32" height="28" viewBox="0 0 28 24" fill="none">
                  <circle cx="14" cy="7.5" r="3.4" stroke="currentColor" stroke-width="2"/>
                  <path d="M8.2 19.5C8.2 16.4 10.7 14.2 14 14.2C17.3 14.2 19.8 16.4 19.8 19.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <circle cx="5.5" cy="9.5" r="2.4" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M1.8 19.5C1.8 17.1 3.4 15.4 5.8 15.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  <circle cx="22.5" cy="9.5" r="2.4" stroke="currentColor" stroke-width="1.8"/>
                  <path d="M26.2 19.5C26.2 17.1 24.6 15.4 22.2 15.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
              </div>
              <h3 class="ruma-home-empty-title">Aún no tienes grupos</h3>
              <p class="ruma-home-empty-desc">
                Crea un nuevo espacio o únete a uno con un código de invitación.
              </p>

              <!-- Onda luminosa neón en la base de la tarjeta -->
              <svg class="ruma-home-empty-wave" viewBox="0 0 500 90" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="emptyWaveStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#D8B4FE" stop-opacity="0.9" />
                    <stop offset="30%" stop-color="#A855F7" stop-opacity="0.65" />
                    <stop offset="50%" stop-color="#6B21A8" stop-opacity="0.2" />
                    <stop offset="75%" stop-color="#A855F7" stop-opacity="0.75" />
                    <stop offset="100%" stop-color="#E9D5FF" stop-opacity="0.9" />
                  </linearGradient>
                  <linearGradient id="emptyWaveFill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#A855F7" stop-opacity="0.24" />
                    <stop offset="100%" stop-color="#120824" stop-opacity="0.05" />
                  </linearGradient>
                </defs>
                <path d="M0,26 C85,22 135,78 245,84 C365,90 415,24 500,24 L500,90 L0,90 Z" fill="url(#emptyWaveFill)" />
                <path d="M0,26 C85,22 135,78 245,84 C365,90 415,24 500,24" fill="none" stroke="url(#emptyWaveStroke)" stroke-width="2.4" />
              </svg>
            </div>
          ` : `
            <!-- Tarjetas de Grupos Sincronizados -->
            <div class="ruma-home-groups-list">
              ${(() => {
                const lockedIds = Entitlements.getLockedGroupIds(user, allGroups);
                return myGroups.map(g => {
                const isCreator = g.creatorId === user.id;
                const isAdmin = Entitlements.isGroupAdmin(g, user.id);
                const gPrem = Entitlements.isGroupPremium(g);
                const isLocked = lockedIds.has(g.id);
                return `
                  <article class="ruma-home-group-card ${isLocked ? 'is-locked' : ''}" data-enter-group="${Utils.sanitize(g.id)}">
                    <div class="ruma-home-group-top">
                      <div class="ruma-home-group-badges">
                        <span class="badge ${gPrem ? 'badge-premium' : 'badge-free'}">
                          ${gPrem ? '✨ Grupo Plus' : '🌱 Gratis'}
                        </span>
                        <span class="badge badge-admin">
                          ${isCreator ? '👑 Creador' : (isAdmin ? '🛡️ Admin' : '👤 Miembro')}
                        </span>
                        ${isLocked ? `<span class="badge" style="background:rgba(239,68,68,.18);border:1px solid rgba(248,113,113,.45);color:#fca5a5;">🔒 Bloqueado</span>` : ''}
                      </div>
                      <button
                        type="button"
                        class="ruma-home-code-btn"
                        data-copy-group-code="${Utils.sanitize(g.code)}"
                        title="Toca para copiar el código de invitación"
                      >
                        📋 ${Utils.sanitize(g.code)}
                      </button>
                    </div>

                    <div class="ruma-home-group-main">
                      <h3 class="ruma-home-group-name">${Utils.sanitize(g.name)}</h3>
                      <p class="ruma-home-group-desc">
                        ${isLocked
                          ? 'Acceso bloqueado en Plan Free (máx. 2 grupos). Activa ruma Plus para desbloquearlo.'
                          : Utils.sanitize(g.description || 'Espacio privado sincronizado en la nube.')}
                      </p>
                    </div>

                    <div class="ruma-home-group-footer">
                      <div class="ruma-home-group-stats">
                        <span>👥 ${(g.members || []).length}</span>
                        <span>📸 ${(g.memories || []).length}</span>
                        <span>🎬 ${(g.movies || []).length}/${gPrem ? '∞' : '5'}</span>
                        <span>📺 ${(g.series || []).length}/${gPrem ? '∞' : '5'}</span>
                        <span>💬 ${(g.messages || []).length}</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:0.45rem;">
                        ${isCreator && !gPrem ? `
                          <button type="button" class="badge badge-premium" style="cursor:pointer;border:none;" data-upgrade-group="${Utils.sanitize(g.id)}" title="Mejorar este grupo a ruma Plus ilimitado">
                            ✨ Mejorar a Plus
                          </button>
                        ` : ''}
                        <button type="button" class="ruma-home-group-enter ${isLocked ? 'is-locked' : ''}" data-enter-group="${Utils.sanitize(g.id)}">
                          ${isLocked ? '🔒 Bloqueado' : 'Entrar ➔'}
                        </button>
                      </div>
                    </div>
                  </article>
                `;
              }).join('');
              })()}
            </div>
          `}
        </section>
      </div>
    </div>
  `;

  // Píldora de usuario en barra superior: acción fija -> abrir Mi Perfil
  document.getElementById('btn-home-account-pill')?.addEventListener('click', () => {
    store.navigate('profile', { inspectUserId: user.id });
  });

  // Botón Crear grupo -> Modal con selector Freemium (Gratis vs Plus)
  document.getElementById('btn-home-create-group')?.addEventListener('click', () => {
    openCreateGroupModal('free');
  });

  // Botón Unirme a grupo -> Modal limpio para ingresar código de invitación
  document.getElementById('btn-home-join-group')?.addEventListener('click', () => {
    openJoinGroupModal();
  });

  // Copiar código de invitación
  container.querySelectorAll('[data-copy-group-code]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = btn.getAttribute('data-copy-group-code');
      const ok = await Utils.copyText(code);
      UI.showToast(
        ok ? `📋 Código "${code}" copiado. ¡Compártelo para que se unan desde otro teléfono!` : `Código de invitación: ${code}`,
        ok ? 'success' : 'info'
      );
    });
  });

  // Mejorar grupo existente a ruma Plus
  container.querySelectorAll('[data-upgrade-group]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupId = btn.getAttribute('data-upgrade-group');
      const res = await store.upgradeGroupToPremiumAsync(groupId);
      if (res.ok) {
        UI.showToast(`¡"${res.group.name}" ahora es un Grupo ruma Plus ilimitado! ✨👑`, 'success');
      }
    });
  });

  // Entrar al grupo al tocar la tarjeta (evitando doble disparo del botón interno)
  container.querySelectorAll('[data-enter-group]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = el.getAttribute('data-enter-group');
      const res = store.setActiveGroup(groupId);
      if (res && res.locked) {
        UI.showUpgradeModal(
          'En el Plan Free solo puedes acceder a 2 grupos (1 creado y 1 unido). El grupo más reciente quedó bloqueado. Activa ruma Plus para entrar a todos tus grupos.',
          () => {
            store.setUserPremiumPlan(true);
            store.setActiveGroup(groupId);
          }
        );
      }
    });
  });
}

/**
 * Modal Ordenado para Crear Grupo con Selector Freemium (Gratis vs ruma Plus)
 */
export function openCreateGroupModal(defaultPlan = 'free') {
  const user = store.getCurrentUser();
  const allGroups = store.getGroups();
  const myCreatedGroup = allGroups.find(g => g.creatorId === user?.id);

  // Regla Freemium: Cada cuenta puede crear 1 grupo propio. Si ya lo creó, ofrecerle mejorarlo a Plus o entrar.
  if (myCreatedGroup) {
    const isAlreadyPrem = Entitlements.isGroupPremium(myCreatedGroup);
    UI.openModal({
      title: isAlreadyPrem ? '👑 Ya tienes tu Grupo Plus creado' : '🌱 Límite de 1 grupo propio creado',
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <p style="color:var(--text-secondary);font-size:0.92rem;line-height:1.55;">
            En <strong>ruma</strong> cada cuenta puede ser creadora de <strong>1 grupo propio</strong> (tu grupo actual es <strong>"${Utils.sanitize(myCreatedGroup.name)}"</strong> con código <code>${Utils.sanitize(myCreatedGroup.code)}</code>).
          </p>
          ${!isAlreadyPrem ? `
            <div style="padding:1rem;border-radius:16px;background:var(--primary-soft);border:1px solid var(--border-strong);">
              <div style="font-weight:800;color:var(--primary);margin-bottom:0.3rem;">✨ ¿Quieres desbloquear ruma Plus?</div>
              <p style="font-size:0.83rem;color:var(--text-secondary);line-height:1.45;">
                Al mejorar tu grupo <strong>"${Utils.sanitize(myCreatedGroup.name)}"</strong> a <strong>Grupo Premium</strong> tendrás películas, series, libros y música ilimitadas y podrás unirte a todos los grupos invitados que quieras.
              </p>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:flex-end;gap:0.65rem;flex-wrap:wrap;margin-top:0.4rem;">
            <button type="button" class="btn btn-secondary" id="btn-close-limit-modal">Cerrar</button>
            ${!isAlreadyPrem ? `
              <button type="button" class="btn btn-premium" id="btn-upgrade-existing-grp">✨ Mejorar a Grupo Plus</button>
            ` : ''}
            <button type="button" class="btn btn-primary" id="btn-go-existing-grp">Entrar a mi grupo ➔</button>
          </div>
        </div>
      `,
      onMount: () => {
        document.getElementById('btn-close-limit-modal')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('btn-go-existing-grp')?.addEventListener('click', () => {
          UI.closeModal();
          store.setActiveGroup(myCreatedGroup.id);
        });
        document.getElementById('btn-upgrade-existing-grp')?.addEventListener('click', async () => {
          const res = await store.upgradeGroupToPremiumAsync(myCreatedGroup.id);
          UI.closeModal();
          if (res.ok) {
            UI.showToast(`¡Tu grupo "${res.group.name}" ahora es ruma Plus! ✨`, 'success');
          }
        });
      }
    });
    return;
  }

  const check = Entitlements.canCreateGroup(user, allGroups, defaultPlan);
  if (!check.allowed) {
    UI.showToast(check.reason, 'info');
    return;
  }

  let selectedPlan = defaultPlan === 'premium' ? 'premium' : 'free';

  UI.openModal({
    title: '✨ Crear nuevo grupo',
    contentHtml: `
      <form id="form-modal-create-group">
        <div class="form-group">
          <label class="form-label">Nombre del grupo</label>
          <input type="text" id="create-grp-name" class="form-input" placeholder="Ej: Nuestro Refugio ✨" required>
        </div>

        <div class="form-group">
          <label class="form-label">Descripción o propósito (opcional)</label>
          <input type="text" id="create-grp-desc" class="form-input" placeholder="Recuerdos, películas, series y chat privado">
        </div>

        <div class="form-group">
          <label class="form-label">Plan del grupo (Reglas Freemium)</label>
          <div class="ruma-plan-cards" id="plan-selector-cards">
            <div class="ruma-plan-option ${selectedPlan === 'free' ? 'selected' : ''}" data-select-plan="free">
              <div class="ruma-plan-option-title">🌱 Grupo Gratis</div>
              <div class="ruma-plan-option-desc">
                Hasta 5 películas, 5 series y 5 canciones · Recuerdos en Drive · Cupo total: 2 grupos (1 creado + 1 unido).
              </div>
            </div>
            <div class="ruma-plan-option ${selectedPlan === 'premium' ? 'selected' : ''}" data-select-plan="premium">
              <div class="ruma-plan-option-title">✨ Grupo Plus</div>
              <div class="ruma-plan-option-desc">
                Cine, series y música ilimitados · Te permite unirte a grupos ilimitados · Marcos y temas exclusivos.
              </div>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:0.5rem;">
          <label class="form-label">Carpeta de Google Drive del grupo (opcional)</label>
          <input type="url" id="create-grp-drive" class="form-input" placeholder="https://drive.google.com/drive/folders/...">
          <small style="color:var(--text-muted);font-size:0.74rem;margin-top:0.25rem;display:block;">
            Puedes pegarla ahora o vincularla después desde Ajustes cuando activen los Recuerdos.
          </small>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:0.7rem;margin-top:1.35rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-create-grp">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-create-grp">Crear grupo</button>
        </div>
      </form>
    `,
    onMount: () => {
      const planCards = document.querySelectorAll('[data-select-plan]');
      planCards.forEach(card => {
        card.addEventListener('click', () => {
          selectedPlan = card.getAttribute('data-select-plan');
          planCards.forEach(c => c.classList.toggle('selected', c === card));
        });
      });

      document.getElementById('btn-cancel-create-grp')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-modal-create-group')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-create-grp');
        const name = document.getElementById('create-grp-name')?.value;
        const description = document.getElementById('create-grp-desc')?.value;
        const driveFolderUrl = document.getElementById('create-grp-drive')?.value;

        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Creando en la nube...';
        }
        const res = await store.createGroupAsync({
          name,
          description,
          driveFolderUrl,
          plan: selectedPlan
        });
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Crear grupo';
        }
        if (!res.ok) {
          UI.showToast(res.reason, 'error');
          return;
        }
        UI.closeModal();
        UI.showToast(`¡Grupo "${res.group.name}" creado! Código de invitación: ${res.group.code} 🎉`, 'success');
      });
    }
  });
}

/**
 * Modal Limpio para Unirse a un Grupo con Código de Invitación (6 caracteres)
 */
export function openJoinGroupModal() {
  const user = store.getCurrentUser();
  const allGroups = store.getGroups();
  const check = Entitlements.canJoinGroup(user, allGroups);

  if (!check.allowed) {
    UI.showUpgradeModal(check.reason, () => {
      const myCreatedGroup = allGroups.find(g => g.creatorId === user?.id);
      if (myCreatedGroup) {
        store.upgradeGroupToPremiumAsync(myCreatedGroup.id).then(res => {
          if (res.ok) {
            UI.showToast(`¡Tu grupo "${res.group.name}" ahora es ruma Plus! Ya puedes unirte a grupos ilimitados ✨`, 'success');
          }
        });
      } else {
        openCreateGroupModal('premium');
      }
    });
    return;
  }

  UI.openModal({
    title: '🔑 Unirme a un grupo',
    contentHtml: `
      <form id="form-modal-join-group">
        <p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.5;margin-bottom:1rem;">
          Ingresa el <strong>código de invitación de 6 caracteres</strong> que te compartieron para conectarte al grupo en tiempo real.
        </p>
        <div class="form-group">
          <label class="form-label">Código de invitación</label>
          <input
            type="text"
            id="modal-join-code-input"
            class="form-input"
            placeholder="Ej: K9R4M2"
            maxlength="18"
            style="text-transform:uppercase;font-family:var(--font-mono);font-size:1.15rem;font-weight:800;letter-spacing:0.12em;text-align:center;"
            required
          >
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.7rem;margin-top:1.35rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-join-grp">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-join-grp">Unirme al grupo</button>
        </div>
      </form>
    `,
    onMount: () => {
      const inputEl = document.getElementById('modal-join-code-input');
      setTimeout(() => inputEl?.focus(), 60);

      document.getElementById('btn-cancel-join-grp')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-modal-join-group')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = (inputEl?.value || '').trim();
        if (!code) return;
        const btn = document.getElementById('btn-submit-join-grp');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Conectando con la nube...';
        }
        const res = await store.joinGroupByCodeOrQueryAsync(code);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Unirme al grupo';
        }
        if (!res.ok) {
          if (res.needsUpgrade) {
            UI.closeModal();
            UI.showUpgradeModal(res.reason, () => openCreateGroupModal('premium'));
          } else {
            UI.showToast(res.reason, 'error');
          }
          return;
        }
        UI.closeModal();
        UI.showToast(`¡Te uniste a "${res.group.name}" en tiempo real! ✨`, 'success');
      });
    }
  });
}
