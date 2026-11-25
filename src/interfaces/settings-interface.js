/**
 * ruma 🌟 — Ajustes (Mi Cuenta con edición por campo, Plan y Límites con toggle Freemium/ruma Plus para pruebas)
 */
import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.2"/><path d="m3 7 9 6 9-6"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  clapper: '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4"/>',
  tv: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="m8 2 4 4 4-4"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
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
    { key: 'password', label: 'Contraseña', value: '••••••••', icon: ICO.lock, type: 'password', placeholder: 'Nueva contraseña', required: true }
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
            <p>Actualiza la información de tu cuenta y accesos.</p>
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

          <button type="button" class="rst-plus-btn ${isUserPrem ? 'is-off' : ''}" id="rst-toggle-plus">
            ${isUserPrem ? '🔄 Desactivar ruma Plus (Probar Plan Free)' : '👑 Obtener ruma Plus'}
          </button>
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
        ? '¡ruma Plus activado! ✨ Ya puedes probar los límites ilimitados.'
        : 'Plan cambiado a Free (máx. 2 grupos y 5 ítems por categoría).',
      next ? 'success' : 'info'
    );
  });

  container.querySelectorAll('[data-edit-field]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-edit-field');
      const field = accountFields.find(f => f.key === key);
      if (!field) return;
      const rawVal = key === 'password' ? '' : (user[key] || '');

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
            store.updateCurrentUser({ [key]: val });
            UI.closeModal();
            UI.showToast(`${field.label} actualizado ✅`, 'success');
          });
        }
      });
    });
  });
}
