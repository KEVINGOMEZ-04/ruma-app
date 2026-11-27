// Cabecera de grupo (portada, foto con recorte interactivo, nombre, insignias, miembros y menú completo).
import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { pickAndCropImage } from '../components/image-cropper.js';

export const GROUP_TABS = [
  { id: 'memories', label: 'Recuerdos', icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>' },
  { id: 'movies', label: 'Películas', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4m3 0 3-4"/>' },
  { id: 'series', label: 'Series', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m8 3 4 4 4-4"/>' },
  { id: 'music', label: 'Música', icon: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>' },
  { id: 'chat', label: 'Chat', icon: '<path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>' }
];

const svg = (inner) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export function groupTabLabelCounts(group, isPrem) {
  const lim = PLAN_LIMITS.free;
  return {
    memories: (group.memories || []).length,
    movies: `${(group.movies || []).length}/${isPrem ? '∞' : lim.maxMoviesPerGroup}`,
    series: `${(group.series || []).length}/${isPrem ? '∞' : lim.maxSeriesPerGroup}`,
    music: `${(group.songs || []).length}/${isPrem ? '∞' : lim.maxSongsPerGroup}`,
    chat: (group.messages || []).length
  };
}

export function groupHeaderHtml(group, user) {
  const isPrem = Entitlements.isGroupPremium(group);
  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const members = group.members || [];
  const shown = members.slice(0, 3);
  const safeCover = Utils.safeCssUrl(group.coverImage, '');
  const cover = safeCover ? `style="background-image:url('${Utils.sanitize(safeCover)}')"` : '';
  const avatar = group.avatar
    ? `<img src="${Utils.sanitize(group.avatar)}" alt="">`
    : svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.3c1.8.8 3 2.6 3 4.7"/>');

  return `
    <section class="rg-card rg-header">
      <div class="rg-cover ${group.coverImage ? 'has-img' : ''}" ${cover}>
        ${isAdmin ? `<button type="button" class="rg-icon-btn rg-cover-cam" id="rg-edit-cover" aria-label="Cambiar portada">${svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')}</button>` : ''}
      </div>
      <div class="rg-head-body">
        <div class="rg-title-row">
          <button type="button" class="rg-avatar" id="rg-edit-avatar" ${isAdmin ? '' : 'disabled'} aria-label="Foto del grupo">
            ${avatar}
            ${isAdmin ? `<span class="rg-avatar-cam">${svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')}</span>` : ''}
          </button>
          <div class="rg-title-text">
            <h1 class="rg-name">
              <span>${Utils.sanitize(group.name)}</span>
              ${isAdmin ? `<button type="button" class="rg-pencil" id="rg-edit-name" aria-label="Editar nombre">✎</button>` : ''}
            </h1>
            <p class="rg-desc">${Utils.sanitize(group.description || 'Sin descripción')}</p>
          </div>
          <button type="button" class="rg-icon-btn rg-more" id="rg-more" aria-label="Más opciones">⋯</button>
        </div>

        <div class="rg-badges">
          <span class="rg-badge ${isPrem ? 'rg-badge-prem' : 'rg-badge-free'}">${isPrem ? '✨ Grupo Premium' : '🌱 Grupo Gratis'}</span>
          <span class="rg-badge">${isAdmin ? '🛡️ Administrador' : '👤 Miembro'}</span>
          <button type="button" class="rg-badge rg-code" id="btn-group-copy-code" title="Copiar código">
            <span>📋 Código:</span><b>${Utils.sanitize(group.code)}</b>
          </button>
        </div>

        <div class="rg-members-row">
          <div class="rg-avatars">
            ${shown.map(m => `
              <button type="button" class="rg-mini" data-member-profile="${Utils.sanitize(m.id)}" title="${Utils.sanitize(m.name)}">
                <img src="${Utils.sanitize(m.avatar || 'assets/ruma_default_avatar.png')}" alt="${Utils.sanitize(m.name)}">
              </button>`).join('')}
            <button type="button" class="rg-mini rg-mini-add" id="btn-group-share-invite-plus" aria-label="Invitar">+</button>
          </div>
          <button type="button" class="rg-pill" id="btn-group-share-invite">🔗 <span>Invitar amigos</span></button>
          <button type="button" class="rg-pill" id="rg-members-btn">👤 <span>${members.length} ${members.length === 1 ? 'miembro' : 'miembros'}</span> ›</button>
        </div>
      </div>
    </section>
  `;
}

export function bindGroupHeader(container, group, user, { onTab } = {}) {
  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const save = (patch, msg) => {
    const r = store.updateGroupSettings(group.id, patch);
    if (!r.ok) return UI.showToast(r.error, 'error');
    UI.showToast(msg, 'success');
  };

  const triggerCoverCrop = () => {
    if (!isAdmin) return;
    pickAndCropImage({
      title: '🖼️ Ajustar portada del grupo',
      aspectW: 16,
      aspectH: 5,
      radius: '14px',
      outW: 960,
      outH: 300,
      onCropped: (dataUrl) => save({ coverImage: dataUrl }, 'Portada del grupo actualizada 🖼️')
    });
  };

  const triggerAvatarCrop = () => {
    if (!isAdmin) return;
    pickAndCropImage({
      title: '📷 Ajustar foto del grupo',
      aspectW: 1,
      aspectH: 1,
      radius: '24px',
      outW: 320,
      outH: 320,
      onCropped: (dataUrl) => save({ avatar: dataUrl }, 'Foto del grupo actualizada 📷')
    });
  };

  container.querySelector('#rg-edit-cover')?.addEventListener('click', triggerCoverCrop);
  container.querySelector('#rg-edit-avatar')?.addEventListener('click', triggerAvatarCrop);
  container.querySelector('#rg-edit-name')?.addEventListener('click', () => openEditGroupModal(group, save));

  container.querySelector('#btn-group-copy-code')?.addEventListener('click', async () => {
    const ok = await Utils.copyText(group.code);
    UI.showToast(ok ? `📋 Código "${group.code}" copiado. ¡Compártelo con tu grupo!` : `Código del grupo: ${group.code}`, ok ? 'success' : 'info');
  });

  const invite = async () => {
    const inviteUrl = `${window.location.origin + window.location.pathname}?join=${encodeURIComponent(group.code)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Únete a "${group.name}" en ruma 🌟`, text: `Usa el código ${group.code} o entra directo:`, url: inviteUrl });
        return;
      }
      const ok = await Utils.copyText(inviteUrl);
      UI.showToast(ok ? `🔗 Enlace de invitación copiado (${group.code}) ✨` : `Código para invitar: ${group.code}`, ok ? 'success' : 'info');
    } catch (_) { UI.showToast(`Código para invitar: ${group.code}`, 'info'); }
  };
  container.querySelector('#btn-group-share-invite')?.addEventListener('click', invite);
  container.querySelector('#btn-group-share-invite-plus')?.addEventListener('click', invite);

  container.querySelector('#rg-members-btn')?.addEventListener('click', () => openGroupMembersModal(group, user, invite));
  container.querySelectorAll('[data-member-profile]').forEach(el =>
    el.addEventListener('click', () => store.navigate('profile', { inspectUserId: el.getAttribute('data-member-profile') })));

  container.querySelector('#rg-more')?.addEventListener('click', () => openGroupMenu(group, user, {
    save,
    invite,
    triggerCoverCrop,
    triggerAvatarCrop
  }));

  container.querySelector('.rg-badge-free')?.addEventListener('click', () => {
    if (!isAdmin) return;
    UI.showUpgradeModal(`Mejora "${group.name}" a Grupo Premium ruma Plus para tener películas, series, libros y canciones ilimitadas.`, () => {
      store.upgradeGroupToPremium(group.id);
      UI.showToast('¡Grupo mejorado a ruma Plus! ✨🎉', 'success');
    });
  });

  container.querySelectorAll('[data-group-tab]').forEach(btn =>
    btn.addEventListener('click', () => onTab && onTab(btn.getAttribute('data-group-tab'))));
}

function openEditGroupModal(group, save) {
  UI.openModal({
    title: '✏️ Editar grupo',
    contentHtml: `
      <form id="rg-edit-form" style="display:flex;flex-direction:column;gap:.85rem;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Nombre del grupo</label>
          <input type="text" id="rg-edit-name-inp" class="form-input" maxlength="40" required value="${Utils.sanitize(group.name || '')}" placeholder="Ej: Los de siempre">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">Descripción</label>
          <textarea id="rg-edit-desc-inp" class="form-textarea" rows="3" maxlength="100" placeholder="Cuéntale al grupo de qué va este espacio...">${Utils.sanitize(group.description || '')}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="rg-edit-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>`,
    onMount: () => {
      document.getElementById('rg-edit-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('rg-edit-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('rg-edit-name-inp').value.trim();
        const description = document.getElementById('rg-edit-desc-inp').value.trim();
        if (!name) return;
        UI.closeModal();
        save({ name: name.slice(0, 40), description: description.slice(0, 100) }, 'Grupo actualizado ✏️');
      });
    }
  });
}

function openGroupMembersModal(group, currentUser, invite) {
  const members = group.members || [];
  const amIAdmin = Entitlements.isGroupAdmin(group, currentUser.id);
  UI.openModal({
    title: `👥 Miembros (${members.length})`,
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.6rem;">
        ${members.map(m => {
          const isCreator = m.id === group.creatorId;
          const isAdmin = Entitlements.isGroupAdmin(group, m.id);
          const roleLabel = isCreator ? '👑 Creador' : (isAdmin ? '🛡️ Admin' : '👤 Miembro');
          const isMe = m.id === currentUser.id;
          const canKick = amIAdmin && !isMe && !isCreator;
          return `
            <div class="rst-row" style="justify-content:space-between;gap:0.5rem;">
              <button type="button" data-open-member="${Utils.sanitize(m.id)}" style="display:flex;align-items:center;gap:0.75rem;flex:1;min-width:0;background:none;border:none;color:inherit;text-align:left;cursor:pointer;padding:0;">
                <img src="${Utils.sanitize(m.avatar || 'assets/ruma_default_avatar.png')}" alt="${Utils.sanitize(m.name)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1.5px solid var(--primary);flex-shrink:0;">
                <span class="rst-row-txt">
                  <b>${Utils.sanitize(m.name)}${isMe ? ' (Tú)' : ''}</b>
                  <small>@${Utils.sanitize(m.username || 'usuario')} · ${roleLabel}</small>
                </span>
              </button>
              ${canKick ? `<button type="button" class="btn btn-secondary btn-sm" data-kick-member="${Utils.sanitize(m.id)}" data-kick-name="${Utils.sanitize(m.name)}" style="color:var(--error);border-color:rgba(239,68,68,0.35);flex-shrink:0;">Expulsar</button>` : '<span class="rst-chev">›</span>'}
            </div>`;
        }).join('')}
        <button type="button" class="btn btn-primary" id="rg-members-invite" style="margin-top:.35rem;width:100%;">
          🔗 Invitar amigos (${Utils.sanitize(group.code)})
        </button>
      </div>`,
    onMount: () => {
      document.querySelectorAll('[data-open-member]').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-open-member');
          UI.closeModal();
          store.navigate('profile', { inspectUserId: uid });
        });
      });
      document.querySelectorAll('[data-kick-member]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetId = btn.getAttribute('data-kick-member');
          const targetName = btn.getAttribute('data-kick-name') || 'este miembro';
          btn.disabled = true;
          const res = await store.removeMemberFromGroup(group.id, targetId);
          UI.closeModal();
          UI.showToast(
            res.ok ? `${targetName} fue expulsado del grupo 🛡️` : (res.error || 'No se pudo expulsar al miembro.'),
            res.ok ? 'info' : 'error'
          );
        });
      });
      document.getElementById('rg-members-invite')?.addEventListener('click', () => {
        UI.closeModal();
        invite();
      });
    }
  });
}

// Menú "⋯" del grupo: acciones reales y útiles según rol.
function openGroupMenu(group, user, { save, invite, triggerCoverCrop, triggerAvatarCrop }) {
  const isCreator = group.creatorId === user.id;
  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const isPrem = Entitlements.isGroupPremium(group);
  const memberCount = (group.members || []).length;

  UI.openModal({
    title: 'Opciones del grupo',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.55rem;">
        ${isAdmin ? `
          <button type="button" class="rst-row" id="rg-menu-edit">
            <span class="rst-row-ico">✏️</span>
            <span class="rst-row-txt"><b>Editar nombre y descripción</b><small>Personaliza la identidad del grupo</small></span>
            <span class="rst-chev">›</span>
          </button>
          <button type="button" class="rst-row" id="rg-menu-avatar">
            <span class="rst-row-ico">📷</span>
            <span class="rst-row-txt"><b>Cambiar foto del grupo</b><small>Sube y encuadra con zoom</small></span>
            <span class="rst-chev">›</span>
          </button>
          <button type="button" class="rst-row" id="rg-menu-cover">
            <span class="rst-row-ico">🖼️</span>
            <span class="rst-row-txt"><b>Cambiar portada</b><small>Sube y recorta el banner superior</small></span>
            <span class="rst-chev">›</span>
          </button>
        ` : ''}

        <button type="button" class="rst-row" id="rg-menu-members">
          <span class="rst-row-ico">👥</span>
          <span class="rst-row-txt"><b>Ver miembros (${memberCount})</b><small>Consulta perfiles y roles del grupo</small></span>
          <span class="rst-chev">›</span>
        </button>

        <button type="button" class="rst-row" id="rg-menu-invite">
          <span class="rst-row-ico">🔗</span>
          <span class="rst-row-txt"><b>Compartir invitación</b><small>Código: ${Utils.sanitize(group.code)}</small></span>
          <span class="rst-chev">›</span>
        </button>

        ${isAdmin && !isPrem ? `
          <button type="button" class="btn btn-premium" id="rg-menu-upgrade" style="margin-top:.2rem;width:100%;">
            ✨ Mejorar grupo a ruma Plus
          </button>
        ` : ''}

        ${memberCount > 1 || !isCreator ? `
          <button type="button" class="btn btn-secondary" id="rg-menu-leave" style="margin-top:.2rem;width:100%;color:var(--error);border-color:rgba(220,38,38,.3);">
            🚪 Salir del grupo
          </button>
        ` : ''}

        ${isCreator ? `
          <button type="button" class="btn btn-danger" id="rg-menu-delete" style="margin-top:.2rem;width:100%;">
            🗑️ Eliminar grupo
          </button>
        ` : ''}
      </div>`,
    onMount: () => {
      document.getElementById('rg-menu-edit')?.addEventListener('click', () => {
        UI.closeModal();
        openEditGroupModal(group, save);
      });
      document.getElementById('rg-menu-avatar')?.addEventListener('click', () => {
        UI.closeModal();
        triggerAvatarCrop();
      });
      document.getElementById('rg-menu-cover')?.addEventListener('click', () => {
        UI.closeModal();
        triggerCoverCrop();
      });
      document.getElementById('rg-menu-members')?.addEventListener('click', () => {
        UI.closeModal();
        openGroupMembersModal(group, user, invite);
      });
      document.getElementById('rg-menu-invite')?.addEventListener('click', () => {
        UI.closeModal();
        invite();
      });
      document.getElementById('rg-menu-upgrade')?.addEventListener('click', () => {
        UI.closeModal();
        UI.showUpgradeModal(`Mejora "${group.name}" a Grupo Premium ruma Plus para tener películas, series, libros y canciones ilimitadas.`, () => {
          store.upgradeGroupToPremium(group.id);
          UI.showToast('¡Grupo mejorado a ruma Plus! ✨🎉', 'success');
        });
      });
      document.getElementById('rg-menu-leave')?.addEventListener('click', () => confirmLeaveGroup(group, user));
      document.getElementById('rg-menu-delete')?.addEventListener('click', () => confirmDeleteGroup(group));
    }
  });
}

function confirmLeaveGroup(group, user) {
  const isCreator = group.creatorId === user.id;
  const remaining = (group.members || []).filter(m => m.id !== user.id);
  const nextLeader = remaining.find(m => m.role === 'admin') || remaining[0];

  UI.closeModal();
  UI.openModal({
    title: '¿Salir de este grupo?',
    contentHtml: `
      <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:1rem;line-height:1.45;">
        Dejarás de pertenecer a <b>${Utils.sanitize(group.name)}</b>. Podrás volver a unirte más adelante si tienes el código de invitación.
        ${isCreator && nextLeader ? `<br><br>Como eres el creador, la administración pasará automáticamente a <b>${Utils.sanitize(nextLeader.name)}</b>.` : ''}
      </p>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" id="rg-leave-cancel">Cancelar</button>
        <button type="button" class="btn btn-danger" id="rg-leave-ok">🚪 Salir del grupo</button>
      </div>`,
    onMount: () => {
      document.getElementById('rg-leave-cancel')?.addEventListener('click', () => UI.closeModal());
      const ok = document.getElementById('rg-leave-ok');
      ok?.addEventListener('click', async () => {
        ok.disabled = true;
        const r = await store.leaveGroup(group.id);
        UI.closeModal();
        if (!r.ok) {
          UI.showToast(r.error, 'error');
          return;
        }
        UI.showToast(
          r.newLeaderName
            ? `Saliste del grupo. ${r.newLeaderName} es ahora el administrador.`
            : `Saliste de "${group.name}" 👋`,
          'info'
        );
      });
    }
  });
}

function confirmDeleteGroup(group) {
  UI.closeModal();
  UI.openModal({
    title: '¿Eliminar este grupo?',
    contentHtml: `
      <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.85rem;line-height:1.45;">
        Se eliminará <b>${Utils.sanitize(group.name)}</b> para <b>todos los miembros</b>, con sus recuerdos, películas, series, música, libros, objetivos y chat. Esta acción no se puede deshacer.
      </p>
      <div class="form-group">
        <label class="form-label">Escribe el nombre del grupo para confirmar</label>
        <input id="rg-del-input" class="form-input" autocomplete="off" placeholder="${Utils.sanitize(group.name)}">
      </div>
      <div style="display:flex;gap:.6rem;justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" id="rg-del-cancel">Cancelar</button>
        <button type="button" class="btn btn-danger" id="rg-del-ok" disabled>Eliminar</button>
      </div>`,
    onMount: () => {
      const input = document.getElementById('rg-del-input');
      const ok = document.getElementById('rg-del-ok');
      input.addEventListener('input', () => {
        const match = input.value.trim() === group.name.trim();
        ok.disabled = !match;
      });
      document.getElementById('rg-del-cancel').addEventListener('click', () => UI.closeModal());
      ok.addEventListener('click', async () => {
        ok.disabled = true;
        const r = await store.deleteGroup(group.id);
        UI.closeModal();
        UI.showToast(r.ok ? 'Grupo eliminado 🗑️' : r.error, r.ok ? 'success' : 'error');
      });
    }
  });
}
