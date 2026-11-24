/**
 * ruma 🌟 — INTERFAZ 4: Ajustes (Cuenta, Administración de Grupo / Google Drive y Plan Freemium)
 *
 * Reglas:
 * 1. Credenciales del usuario (Nombre, @usuario, Correo, Teléfono y Contraseña).
 * 2. Administración del grupo activo:
 *    - Solo el rango 'admin' (Administrador) puede modificar la carpeta de Google Drive donde se guardan fotos/videos.
 *    - Los Administradores pueden ascender a otros miembros a 'admin' o cambiarlos a 'member'.
 * 3. Estado del Plan Freemium (Gratis vs ruma Plus) con contadores claros.
 */

import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { renderDriveConnectionPanelHtml, bindDriveConnectionPanelEvents } from '../components/drive-connect-modal.js';

export function renderSettingsInterface(container) {
  const user = store.getCurrentUser();
  if (!user) {
    store.navigate('hub');
    return;
  }

  const allGroups = store.getGroups();
  const activeGroup = store.getActiveGroup();
  const isUserPrem = Entitlements.isUserPremium(user, allGroups);
  const isGroupAdmin = activeGroup ? Entitlements.isGroupAdmin(activeGroup, user.id) : false;
  const isGroupPrem = activeGroup ? Entitlements.isGroupPremium(activeGroup) : false;

  container.innerHTML = `
    <div style="max-width:920px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
        <div>
          <h1 style="font-family:var(--font-display);font-size:1.75rem;font-weight:800;">⚙️ Centro de Ajustes</h1>
          <p style="color:var(--text-secondary);font-size:0.9rem;">Gestiona tu cuenta, los permisos de tu grupo, la carpeta de Google Drive y tu plan.</p>
        </div>
        <button type="button" class="btn btn-danger btn-sm" id="btn-settings-logout">🚪 Cerrar Sesión</button>
      </div>

      <div class="ruma-grid-2">
        <!-- 1. Credenciales de Cuenta (Correo, Teléfono, @Usuario y Contraseña) -->
        <div class="ruma-card">
          <h2 style="font-family:var(--font-display);font-size:1.2rem;margin-bottom:1rem;">👤 Mi Cuenta y Accesos</h2>
          <form id="form-settings-account">
            <div class="form-group">
              <label class="form-label">Nombre Visible</label>
              <input type="text" id="set-user-name" class="form-input" value="${Utils.sanitize(user.name)}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Usuario (@usuario)</label>
              <input type="text" id="set-user-username" class="form-input" value="${Utils.sanitize(user.username || '')}" required>
            </div>
            <div class="form-group">
              <label class="form-label">Correo Electrónico</label>
              <input type="email" id="set-user-email" class="form-input" value="${Utils.sanitize(user.email || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Número de Teléfono</label>
              <input type="tel" id="set-user-phone" class="form-input" value="${Utils.sanitize(user.phone || '')}">
            </div>
            <div class="form-group">
              <label class="form-label">Contraseña</label>
              <input type="password" id="set-user-password" class="form-input" value="${Utils.sanitize(user.password || '')}" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;">Guardar Credenciales</button>
          </form>
        </div>

        <!-- 2. Estado del Plan Freemium (Gratis vs ruma Plus) -->
        <div class="ruma-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:1rem;">
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
              <h2 style="font-family:var(--font-display);font-size:1.2rem;">💎 Plan y Límites Freemium</h2>
              <span class="badge ${isUserPrem ? 'badge-premium' : 'badge-free'}">${isUserPrem ? '✨ ruma Plus' : '🌱 Plan Gratis'}</span>
            </div>
            <p style="color:var(--text-secondary);font-size:0.88rem;line-height:1.5;margin-bottom:1rem;">
              La única forma de activar <strong>ruma Plus</strong> es creando o mejorando tu grupo a <strong>Grupo Premium</strong>.
            </p>

            <div style="display:flex;flex-direction:column;gap:0.65rem;background:var(--bg-elevated);padding:1rem;border-radius:var(--radius-md);font-size:0.86rem;">
              <div style="display:flex;justify-content:space-between;">
                <span style="color:var(--text-secondary);">Grupos a los que perteneces:</span>
                <strong>${store.getMyGroups().length} / ${isUserPrem ? '∞' : PLAN_LIMITS.free.maxTotalGroups}</strong>
              </div>
              ${activeGroup ? `
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Películas en "${Utils.sanitize(activeGroup.name)}":</span>
                  <strong>${(activeGroup.movies || []).length} / ${isGroupPrem ? '∞' : PLAN_LIMITS.free.maxMoviesPerGroup}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Series en "${Utils.sanitize(activeGroup.name)}":</span>
                  <strong>${(activeGroup.series || []).length} / ${isGroupPrem ? '∞' : PLAN_LIMITS.free.maxSeriesPerGroup}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:var(--text-secondary);">Canciones en "${Utils.sanitize(activeGroup.name)}":</span>
                  <strong>${(activeGroup.songs || []).length} / ${isGroupPrem ? '∞' : PLAN_LIMITS.free.maxSongsPerGroup}</strong>
                </div>
              ` : ''}
            </div>

            <!-- Apariencia -->
            <div style="margin-top:1.25rem;">
              <label class="form-label" style="display:block;margin-bottom:0.5rem;">Tema de la Interfaz</label>
              <div style="display:flex;gap:0.6rem;">
                <button type="button" class="btn ${store.getTheme() === 'dark' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-theme-dark" style="flex:1;">🌙 Midnight Violet</button>
                <button type="button" class="btn ${store.getTheme() === 'light' ? 'btn-primary' : 'btn-secondary'} btn-sm" id="btn-theme-light" style="flex:1;">☀️ Soft Lilac</button>
              </div>
            </div>
          </div>

          ${activeGroup && !isGroupPrem ? `
            <button type="button" class="btn btn-premium" id="btn-upgrade-active-group" style="width:100%;">
              ✨ Convertir "${Utils.sanitize(activeGroup.name)}" en Grupo Premium
            </button>
          ` : ''}
        </div>
      </div>

      <!-- 3. Administración del Grupo Activo y Carpeta de Google Drive (Control por Rangos) -->
      ${activeGroup ? `
        <div class="ruma-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.85rem;flex-wrap:wrap;gap:0.5rem;">
            <div>
              <h2 style="font-family:var(--font-display);font-size:1.3rem;">
                📂 Puente Google Drive (OAuth 2.0) & Rangos de "${Utils.sanitize(activeGroup.name)}"
              </h2>
              <p style="color:var(--text-secondary);font-size:0.86rem;">
                Código de invitación: <strong style="color:var(--brand-lilac);font-family:var(--font-mono);">${Utils.sanitize(activeGroup.code)}</strong>
              </p>
            </div>
            <span class="badge ${isGroupAdmin ? 'badge-admin' : 'badge-free'}">
              Tu rango: ${isGroupAdmin ? '🛡️ Administrador (Puedes editar Drive)' : '👤 Miembro (Puedes conectar tu Google)'}
            </span>
          </div>

          <div id="settings-drive-connection-panel" style="margin-bottom:1.5rem;">
            ${renderDriveConnectionPanelHtml(activeGroup, isGroupAdmin)}
          </div>

          <!-- Lista de Miembros y Rangos (Administrador vs Miembro) -->
          <div>
            <h3 style="font-size:1rem;margin-bottom:0.75rem;color:var(--text-secondary);">👥 Integrantes y Rangos del Grupo</h3>
            <div style="display:flex;flex-direction:column;gap:0.55rem;">
              ${(activeGroup.members || []).map(m => {
                const isCreator = m.id === activeGroup.creatorId;
                const mIsAdmin = isCreator || m.role === 'admin';
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:0.65rem 0.9rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);flex-wrap:wrap;gap:0.5rem;">
                    <div style="display:flex;align-items:center;gap:0.7rem;cursor:pointer;" data-inspect-member="${Utils.sanitize(m.id)}">
                      <div class="avatar-wrap ${Utils.sanitize(m.frameId || 'frame-none')}" style="width:38px;height:38px;">
                        <img src="${Utils.sanitize(m.avatar || 'assets/ruma_icon_512.png')}" alt="avatar" class="avatar-img">
                      </div>
                      <div>
                        <div style="font-weight:700;font-size:0.9rem;">${Utils.sanitize(m.name)}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);">Ver tarjeta estilo Discord</div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.5rem;">
                      <span class="badge ${mIsAdmin ? 'badge-admin' : 'badge-free'}">
                        ${isCreator ? '👑 Creador & Admin' : (mIsAdmin ? '🛡️ Administrador' : '👤 Miembro')}
                      </span>
                      ${isGroupAdmin && !isCreator ? `
                        <button type="button" class="btn btn-secondary btn-sm" data-toggle-role="${Utils.sanitize(m.id)}">
                          ${mIsAdmin ? 'Pasar a Miembro' : 'Ascender a Admin'}
                        </button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('btn-settings-logout')?.addEventListener('click', () => {
    store.logout();
    UI.showToast('Has cerrado sesión correctamente.', 'info');
  });

  document.getElementById('form-settings-account')?.addEventListener('submit', (e) => {
    e.preventDefault();
    store.updateCurrentUser({
      name: document.getElementById('set-user-name')?.value.trim(),
      username: document.getElementById('set-user-username')?.value.trim().replace(/^@/, ''),
      email: document.getElementById('set-user-email')?.value.trim(),
      phone: document.getElementById('set-user-phone')?.value.trim(),
      password: document.getElementById('set-user-password')?.value
    });
    UI.showToast('Datos de cuenta actualizados ✅', 'success');
  });

  document.getElementById('btn-theme-dark')?.addEventListener('click', () => store.setTheme('dark'));
  document.getElementById('btn-theme-light')?.addEventListener('click', () => store.setTheme('light'));

  document.getElementById('btn-upgrade-active-group')?.addEventListener('click', () => {
    if (!activeGroup) return;
    UI.showUpgradeModal(`Convierte "${activeGroup.name}" en un Grupo Premium ruma Plus para desbloquear películas, series y canciones ilimitadas.`, () => {
      store.upgradeGroupToPremium(activeGroup.id);
      UI.showToast(`¡"${activeGroup.name}" ahora es un Grupo Premium ruma Plus! ✨🎉`, 'success');
    });
  });

  if (activeGroup) {
    bindDriveConnectionPanelEvents(
      document.getElementById('settings-drive-connection-panel'),
      activeGroup,
      isGroupAdmin,
      () => renderSettingsInterface(container)
    );
  }

  container.querySelectorAll('[data-toggle-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeGroup) return;
      const memberId = btn.getAttribute('data-toggle-role');
      const res = store.toggleMemberRole(activeGroup.id, memberId);
      if (!res.ok) {
        UI.showToast(res.error, 'error');
        return;
      }
      UI.showToast(`Rango actualizado a ${res.newRole === 'admin' ? 'Administrador 🛡️' : 'Miembro 👤'}`, 'success');
    });
  });

  container.querySelectorAll('[data-inspect-member]').forEach(el => {
    el.addEventListener('click', () => {
      const memberId = el.getAttribute('data-inspect-member');
      store.navigate('profile', { inspectUserId: memberId });
    });
  });
}
