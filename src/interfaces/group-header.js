// Cabecera de grupo (portada, nombre, insignias, miembros) y barra de pestañas.
import { store } from '../core/store.js';
import { Entitlements, PLAN_LIMITS } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';

export const GROUP_TABS = [
  { id: 'memories', label: 'Recuerdos', icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>' },
  { id: 'movies', label: 'Películas', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4m3 0 3-4"/>' },
  { id: 'series', label: 'Series', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m8 3 4 4 4-4"/>' },
  { id: 'music', label: 'Música', icon: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>' },
  { id: 'chat', label: 'Chat', icon: '<path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>' }
];

const svg = (inner) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

function fileToResizedDataUrl(file, maxW, maxH, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const ratio = Math.min(1, maxW / img.width, maxH / img.height);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * ratio);
        c.height = Math.round(img.height * ratio);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function pickImage(maxW, maxH, onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try { onDone(await fileToResizedDataUrl(f, maxW, maxH)); }
    catch (_) { UI.showToast('No se pudo leer la imagen.', 'error'); }
  };
  input.click();
}

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

export function groupHeaderHtml(group, user, tab) {
  const isPrem = Entitlements.isGroupPremium(group);
  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const members = group.members || [];
  const shown = members.slice(0, 3);
  const cover = group.coverImage ? `style="background-image:url('${Utils.sanitize(group.coverImage)}')"` : '';
  const avatar = group.avatar
    ? `<img src="${Utils.sanitize(group.avatar)}" alt="">`
    : svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.3c1.8.8 3 2.6 3 4.7"/>');
  const counts = groupTabLabelCounts(group, isPrem);

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

  container.querySelector('#rg-edit-cover')?.addEventListener('click', () =>
    pickImage(900, 320, (url) => save({ coverImage: url }, 'Portada actualizada 🖼️')));
  container.querySelector('#rg-edit-avatar')?.addEventListener('click', () => {
    if (isAdmin) pickImage(256, 256, (url) => save({ avatar: url }, 'Foto del grupo actualizada 📷'));
  });
  container.querySelector('#rg-edit-name')?.addEventListener('click', () => {
    const name = window.prompt('Nombre del grupo:', group.name);
    if (name && name.trim()) {
      const desc = window.prompt('Descripción del grupo:', group.description || '');
      save({ name: name.trim().slice(0, 40), description: ((desc ?? group.description) || '').trim().slice(0, 90) }, 'Grupo actualizado ✏️');
    }
  });

  container.querySelector('#btn-group-copy-code')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(group.code);
      UI.showToast(`📋 Código "${group.code}" copiado. ¡Compártelo con tu grupo!`, 'success');
    } catch (_) { UI.showToast(`Código del grupo: ${group.code}`, 'info'); }
  });

  const invite = async () => {
    const inviteUrl = `${window.location.origin + window.location.pathname}?join=${encodeURIComponent(group.code)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Únete a "${group.name}" en ruma 🌟`, text: `Usa el código ${group.code} o entra directo:`, url: inviteUrl });
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      UI.showToast(`🔗 Enlace de invitación copiado (${group.code}) ✨`, 'success');
    } catch (_) { UI.showToast(`Código para invitar: ${group.code}`, 'info'); }
  };
  container.querySelector('#btn-group-share-invite')?.addEventListener('click', invite);
  container.querySelector('#btn-group-share-invite-plus')?.addEventListener('click', invite);

  container.querySelector('#rg-members-btn')?.addEventListener('click', () => {
    const first = (group.members || [])[0];
    if (first) store.navigate('profile', { inspectUserId: first.id });
  });
  container.querySelectorAll('[data-member-profile]').forEach(el =>
    el.addEventListener('click', () => store.navigate('profile', { inspectUserId: el.getAttribute('data-member-profile') })));

  container.querySelector('#rg-more')?.addEventListener('click', () => openGroupMenu(group, user));
  container.querySelector('.rg-badge-free')?.addEventListener('click', () => {
    if (!isAdmin) return;
    UI.showUpgradeModal(`Mejora "${group.name}" a Grupo Premium ruma Plus para tener películas, series y canciones ilimitadas.`, () => {
      store.upgradeGroupToPremium(group.id);
      UI.showToast('¡Grupo mejorado a ruma Plus! ✨🎉', 'success');
    });
  });

  container.querySelectorAll('[data-group-tab]').forEach(btn =>
    btn.addEventListener('click', () => onTab && onTab(btn.getAttribute('data-group-tab'))));
}

// Menú "⋯" del grupo: Metas & Notas y (solo creador) eliminar grupo.
function openGroupMenu(group, user) {
  const isCreator = group.creatorId === user.id;
  UI.openModal({
    title: 'Opciones del grupo',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.6rem;">
        <button type="button" class="btn btn-secondary" id="rg-menu-goals">🎯 Metas &amp; Notas</button>
        ${isCreator ? `<button type="button" class="btn" id="rg-menu-delete" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:#fca5a5;">🗑️ Eliminar grupo</button>` : ''}
      </div>`,
    onMount: () => {
      document.getElementById('rg-menu-goals')?.addEventListener('click', () => {
        UI.closeModal();
        store.navigate('group', { groupTab: 'goals_notes' });
      });
      document.getElementById('rg-menu-delete')?.addEventListener('click', () => confirmDeleteGroup(group));
    }
  });
}

function confirmDeleteGroup(group) {
  UI.closeModal();
  UI.openModal({
    title: '¿Eliminar este grupo?',
    contentHtml: `
      <p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.8rem;">
        Se eliminará <b>${Utils.sanitize(group.name)}</b> para <b>todos los miembros</b>, con sus recuerdos, películas, series, música y chat. Esta acción no se puede deshacer.
      </p>
      <label style="font-size:.8rem;color:var(--text-muted);">Escribe el nombre del grupo para confirmar</label>
      <input id="rg-del-input" class="input" style="width:100%;margin:.4rem 0 1rem;" autocomplete="off" placeholder="${Utils.sanitize(group.name)}">
      <div style="display:flex;gap:.6rem;justify-content:flex-end;">
        <button type="button" class="btn btn-secondary" id="rg-del-cancel">Cancelar</button>
        <button type="button" class="btn" id="rg-del-ok" disabled style="background:#dc2626;color:#fff;opacity:.5;">Eliminar</button>
      </div>`,
    onMount: () => {
      const input = document.getElementById('rg-del-input');
      const ok = document.getElementById('rg-del-ok');
      input.addEventListener('input', () => {
        const match = input.value.trim() === group.name.trim();
        ok.disabled = !match;
        ok.style.opacity = match ? '1' : '.5';
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
