/**
 * ruma 🌟 — Ajustes (Mi Cuenta con edición por campo, Plan y Límites con toggle Freemium/ruma Plus para pruebas)
 */
import { store } from '../core/store.js';
import { CryptoAuth } from '../core/crypto.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { CONFIG } from '../core/config.js';

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
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'
};

export function renderSettingsInterface(container) {
  const user = store.getCurrentUser();
  if (!user) {
    store.navigate('hub');
    return;
  }

  const allGroups = store.getGroups();
  const myGroups = store.getMyGroups();
  const refGroup = store.getActiveGroup() || myGroups[0] || null;

  const isUserPrem = Entitlements.isUserPremium(user, allGroups);
  const isGroupPrem = refGroup ? Entitlements.isGroupPremium(refGroup) : isUserPrem;
  const allowDevToggle = CryptoAuth.isBetaSelfUpgradeAllowed();

  const groupsCount = myGroups.length;
  const groupsMax = isUserPrem ? Infinity : PLAN_LIMITS.free.maxTotalGroups;
  const moviesCount = refGroup ? (refGroup.movies || []).length : 0;
  const moviesMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxMoviesPerGroup;
  const seriesCount = refGroup ? (refGroup.series || []).length : 0;
  const seriesMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxSeriesPerGroup;
  const songsCount = refGroup ? (refGroup.songs || []).length : 0;
  const songsMax = isGroupPrem ? Infinity : PLAN_LIMITS.free.maxSongsPerGroup;

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
    { label: 'Canciones', val: songsCount, max: songsMax, ico: ICO.note }
  ];

  container.innerHTML = `
    <div class="rst-wrap">
      <!-- Cabecera -->
      <header class="rst-head">
        <div>
          <h1>⚙️ Ajustes</h1>
          <p>Gestiona tu cuenta y tu plan en Ruma.</p>
        </div>
        <button type="button" class="rst-logout" id="rst-logout-btn">🚪 Cerrar Sesión</button>
      </header>

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
            <p>Gestiona tu suscripción de ruma Plus y consulta tus límites.</p>
          </div>
        </div>

        <div class="rst-plus-box ${isUserPrem ? 'active' : ''}">
          <div class="rst-plus-top">
            <span class="rst-plus-title">✨ ruma Plus</span>
            ${isUserPrem ? `<span class="rst-plus-on">Activo</span>` : ''}
          </div>
          <p>${isUserPrem
            ? 'Tienes ruma Plus activo: puedes unirte a todos los grupos que quieras, crear 1 grupo Premium y guardar películas, series y canciones ilimitadas.'
            : 'Desbloquea todo el potencial de Ruma: más grupos, contenido ilimitado y funciones exclusivas.'}</p>

          ${allowDevToggle ? `
            <button type="button" class="rst-plus-btn ${isUserPrem ? 'is-off' : ''}" id="rst-toggle-plus">
              ${isUserPrem ? '🔄 Desactivar ruma Plus (Modo Dev)' : '👑 Activar ruma Plus (Modo Dev)'}
            </button>
          ` : `
            <button type="button" class="rst-plus-btn" id="rst-plus-coming-soon" style="opacity:0.85;">
              ${isUserPrem ? '✨ Plan ruma Plus activo' : '✨ ruma Plus · Próximamente'}
            </button>
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

      <!-- Legal & Privacidad -->
      <section class="rg-card rst-card">
        <div class="rst-sec-head">
          <div class="rst-sec-ico">${svg(ICO.shield, 20)}</div>
          <div>
            <h2>Privacidad y Términos</h2>
            <p>Documentación oficial de ruma y opciones de protección de datos.</p>
          </div>
        </div>

        <div class="rst-rows">
          <a class="rst-row" href="${CONFIG.webUrls.privacy}" target="_blank" rel="noopener" style="text-decoration:none;">
            <span class="rst-row-ico">${svg(ICO.shield, 18)}</span>
            <span class="rst-row-txt">
              <b>Política de Privacidad</b>
              <small>Cómo protegemos tus datos y uso limitado de Google</small>
            </span>
            <span class="rst-chev">${svg(ICO.external, 14)}</span>
          </a>

          <a class="rst-row" href="${CONFIG.webUrls.terms}" target="_blank" rel="noopener" style="text-decoration:none;">
            <span class="rst-row-ico">${svg(ICO.fileText, 18)}</span>
            <span class="rst-row-txt">
              <b>Términos y Condiciones</b>
              <small>Reglas de uso del servicio y compromisos de la plataforma</small>
            </span>
            <span class="rst-chev">${svg(ICO.external, 14)}</span>
          </a>

          <a class="rst-row" href="${CONFIG.webUrls.deleteAccount}" target="_blank" rel="noopener" style="text-decoration:none;">
            <span class="rst-row-ico" style="color:var(--error);background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.25);">${svg(ICO.trash, 18)}</span>
            <span class="rst-row-txt">
              <b>Eliminar mi cuenta</b>
              <small>Solicitar borrado total y purga de datos conforme a Play Store</small>
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

  container.querySelector('#rst-plus-coming-soon')?.addEventListener('click', () => {
    UI.showToast(
      isUserPrem
        ? 'Tu cuenta ya cuenta con beneficios ruma Plus ✨'
        : 'ruma Plus estará disponible próximamente en el lanzamiento oficial. ¡Gracias por probar la beta! 💜',
      'info'
    );
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
