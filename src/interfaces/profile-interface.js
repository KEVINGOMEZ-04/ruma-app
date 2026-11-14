/**
 * ruma 🌟 — INTERFAZ 3: Perfil de Usuario Estilo Discord
 *
 * Reglas exactas:
 * - Muestra foto de perfil, marco decorativo estilo Discord, color de banner y estado.
 * - Muestra las películas y series que el usuario ha visto/calificado y decidido destacar:
 *   SOLO Póster + Título + Calificación dada por el usuario (SIN reseña de texto para evitar saturación).
 * - Si el usuario está viendo su propio perfil, aparece la lista de todas las películas y series que ha calificado
 *   en los grupos a los que pertenece para que elija con un check cuáles mostrar públicamente en su tarjeta.
 */

import { CONFIG } from '../core/config.js';
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';

export function renderProfileInterface(container) {
  const currentUser = store.getCurrentUser();
  if (!currentUser) {
    store.navigate('hub');
    return;
  }

  const targetId = store.inspectedUserId || currentUser.id;
  const accounts = store.getAccounts();
  const profileUser = accounts.find(u => u.id === targetId) || currentUser;
  const isOwnProfile = profileUser.id === currentUser.id;
  const isPrem = Entitlements.isUserPremium(profileUser, store.getGroups());

  // Obtener todas las películas y series que este usuario ha calificado en todos sus grupos
  const allRatedByUser = store.getUserRatedMediaAcrossGroups(profileUser.id);
  const showcaseSet = new Set(profileUser.showcaseIds || []);
  const showcasedItems = allRatedByUser.filter(item => showcaseSet.has(item.id));

  container.innerHTML = `
    <div style="max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem;">
      <!-- Tarjeta Principal Estilo Discord -->
      <div class="ruma-card" style="padding:0;overflow:hidden;">
        <!-- Banner Superior -->
        <div style="height:135px;background:linear-gradient(135deg, ${Utils.sanitize(profileUser.bannerColor || '#7C3AED')}, #EC4899);position:relative;">
          <div style="position:absolute;top:1rem;right:1rem;display:flex;gap:0.5rem;">
            <span class="badge ${isPrem ? 'badge-premium' : 'badge-free'}">${isPrem ? '✨ ruma Plus' : '🌱 Miembro ruma'}</span>
          </div>
        </div>

        <!-- Cabecera con Avatar + Marco Decorativo -->
        <div style="padding:0 1.75rem 1.75rem;position:relative;">
          <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:-48px;margin-bottom:1rem;flex-wrap:wrap;gap:1rem;">
            <div class="avatar-wrap ${Utils.sanitize(profileUser.frameId || 'frame-axolotl')}" style="width:96px;height:96px;background:var(--bg-card);">
              <img src="${Utils.sanitize(profileUser.avatar || 'assets/ruma_icon_512.png')}" alt="Avatar" class="avatar-img">
            </div>
            ${isOwnProfile ? `
              <button type="button" class="btn btn-secondary btn-sm" id="btn-edit-discord-card">🎨 Personalizar Avatar y Marco</button>
            ` : `
              <button type="button" class="btn btn-secondary btn-sm" id="btn-back-own-profile">👤 Ver mi propio perfil</button>
            `}
          </div>

          <div>
            <h1 style="font-family:var(--font-display);font-size:1.65rem;font-weight:800;">
              ${Utils.sanitize(profileUser.name)}
            </h1>
            <div style="color:var(--brand-lilac);font-family:var(--font-mono);font-size:0.88rem;margin-bottom:0.5rem;">
              @${Utils.sanitize(profileUser.username || 'usuario')}
            </div>
            <p style="color:var(--text-secondary);font-size:0.92rem;">
              ${Utils.sanitize(profileUser.bio || '✨ Compartiendo cine, series y recuerdos en ruma.')}
            </p>
          </div>

          <!-- Escaparate Estilo Discord: Películas y Series Vistas + Calificación (Sin Reseñas) -->
          <div style="margin-top:1.6rem;padding-top:1.4rem;border-top:1px solid var(--border-subtle);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
              <h2 style="font-family:var(--font-display);font-size:1.15rem;text-transform:uppercase;letter-spacing:0.04em;color:var(--text-secondary);">
                🎬 Películas y Series Destacadas (${showcasedItems.length})
              </h2>
              <span style="font-size:0.78rem;color:var(--text-muted);">Póster · Título · Mi Calificación</span>
            </div>

            ${showcasedItems.length === 0 ? `
              <div style="background:var(--bg-elevated);border-radius:var(--radius-md);padding:1.5rem;text-align:center;color:var(--text-muted);font-size:0.9rem;">
                ${isOwnProfile
                  ? 'Aún no has marcado películas o series para mostrar en tu perfil. ¡Selecciónalas en la lista de abajo!'
                  : 'Este usuario aún no ha destacado películas o series en su vitrina.'}
              </div>
            ` : `
              <div class="ruma-grid-4">
                ${showcasedItems.map(item => `
                  <div style="background:var(--bg-elevated);border:1px solid var(--border-subtle);border-radius:var(--radius-md);overflow:hidden;display:flex;flex-direction:column;">
                    <div style="position:relative;aspect-ratio:2/3;width:100%;background:#090414;">
                      <img src="${Utils.sanitize(item.poster)}" alt="${Utils.sanitize(item.title)}" style="width:100%;height:100%;object-fit:cover;">
                      <span class="badge badge-premium" style="position:absolute;top:0.5rem;right:0.5rem;font-size:0.78rem;">
                        ⭐ ${Number(item.score).toFixed(1)}
                      </span>
                      <span class="badge badge-free" style="position:absolute;bottom:0.5rem;left:0.5rem;background:rgba(14,7,29,0.85);">
                        ${Utils.sanitize(item.type)}
                      </span>
                    </div>
                    <div style="padding:0.65rem 0.75rem;">
                      <div style="font-weight:700;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${Utils.sanitize(item.title)}
                      </div>
                      <div style="font-size:0.74rem;color:var(--text-muted);margin-top:0.15rem;">
                        ${Utils.sanitize(item.year || item.type)}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>

      <!-- Selector Privado (Solo en Mi Propio Perfil): Elegir qué películas/series calificadas en mis grupos mostrar -->
      ${isOwnProfile ? `
        <div class="ruma-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.6rem;flex-wrap:wrap;gap:0.5rem;">
            <h3 style="font-family:var(--font-display);font-size:1.25rem;">
              ✅ Mis Películas y Series Calificadas en Grupos (${allRatedByUser.length})
            </h3>
            <span class="badge badge-admin">Elige cuáles mostrar en tu perfil</span>
          </div>
          <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:1.15rem;">
            Aquí aparecen todas las películas y series que has calificado dentro de los grupos a los que perteneces. Activa o desactiva las que quieras lucir en tu tarjeta estilo Discord.
          </p>

          ${allRatedByUser.length === 0 ? `
            <p style="color:var(--text-muted);font-size:0.88rem;">
              Todavía no has calificado películas o series en ningún grupo. Entra a un grupo y califica una para poder destacarla aquí.
            </p>
          ` : `
            <div style="display:flex;flex-direction:column;gap:0.6rem;">
              ${allRatedByUser.map(item => {
                const isSelected = showcaseSet.has(item.id);
                return `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:0.65rem 0.9rem;background:var(--bg-elevated);border:1px solid ${isSelected ? 'var(--brand-lilac)' : 'var(--border-subtle)'};border-radius:var(--radius-md);gap:0.75rem;">
                    <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;">
                      <img src="${Utils.sanitize(item.poster)}" alt="poster" style="width:40px;height:56px;border-radius:6px;object-fit:cover;flex-shrink:0;">
                      <div style="min-width:0;">
                        <div style="font-weight:700;font-size:0.92rem;">${Utils.sanitize(item.title)} <span style="color:var(--text-muted);font-weight:400;">(${Utils.sanitize(item.type)})</span></div>
                        <div style="font-size:0.78rem;color:var(--text-secondary);">
                          Tu nota: <strong style="color:var(--brand-gold);">⭐ ${Number(item.score).toFixed(1)}</strong> · Grupo: ${Utils.sanitize(item.groupName)}
                        </div>
                      </div>
                    </div>
                    <button type="button" class="btn ${isSelected ? 'btn-primary' : 'btn-secondary'} btn-sm" data-toggle-showcase="${Utils.sanitize(item.id)}">
                      ${isSelected ? '✓ Mostrando en Perfil' : '+ Mostrar en Perfil'}
                    </button>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('btn-back-own-profile')?.addEventListener('click', () => {
    store.navigate('profile', { inspectUserId: currentUser.id });
  });

  document.getElementById('btn-edit-discord-card')?.addEventListener('click', () => {
    openCustomizeProfileModal(currentUser, isPrem);
  });

  container.querySelectorAll('[data-toggle-showcase]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-toggle-showcase');
      store.toggleShowcaseMediaItem(id);
      UI.showToast('Escaparate de perfil actualizado ✨');
    });
  });
}

function openCustomizeProfileModal(user, isPrem) {
  UI.openModal({
    title: '🎮 Personalizar Perfil Estilo Discord',
    contentHtml: `
      <form id="form-customize-discord">
        <div class="form-group">
          <label class="form-label">Foto de Perfil (Subir imagen)</label>
          <input type="file" id="prof-avatar-file" class="form-input" accept="image/*">
        </div>
        <div class="form-group">
          <label class="form-label">Marco Decorativo de Avatar</label>
          <select id="prof-frame-select" class="form-select">
            ${CONFIG.avatarFrames.map(f => `
              <option value="${f.id}" ${user.frameId === f.id ? 'selected' : ''} ${f.premium && !isPrem ? 'disabled' : ''}>
                ${Utils.sanitize(f.label)} ${f.premium ? (isPrem ? '(Premium Activo)' : '🔒 Requiere ruma Plus') : '(Gratis)'}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Color de Banner</label>
          <input type="color" id="prof-banner-color" class="form-input" value="${Utils.sanitize(user.bannerColor || '#7C3AED')}" style="height:44px;padding:0.2rem;">
        </div>
        <div class="form-group">
          <label class="form-label">Estado / Frase corta</label>
          <input type="text" id="prof-bio-input" class="form-input" maxlength="90" value="${Utils.sanitize(user.bio || '')}">
        </div>
        <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-prof">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar Perfil</button>
        </div>
      </form>
    `,
    onMount: () => {
      document.getElementById('btn-cancel-prof')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('form-customize-discord')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = document.getElementById('prof-avatar-file')?.files?.[0];
        let avatar = user.avatar;
        if (file) {
          avatar = await Utils.fileToPreviewDataUrl(file, 400, 0.8);
        }
        const frameId = document.getElementById('prof-frame-select')?.value || 'frame-axolotl';
        const bannerColor = document.getElementById('prof-banner-color')?.value || '#7C3AED';
        const bio = document.getElementById('prof-bio-input')?.value || '';

        store.updateCurrentUser({ avatar, frameId, bannerColor, bio });
        UI.closeModal();
        UI.showToast('¡Perfil estilo Discord actualizado! 🎮✨', 'success');
      });
    }
  });
}
