/**
 * ruma 🌟 — Perfil de Usuario (Diseño móvil neón, cropper 1:1 y portada, métricas calificadas, Destacados, Sobre mí con etiquetas y Enlaces)
 */
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { openImageCropperModal } from '../components/image-cropper.js';

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  cover: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-6 6-2-2-5 5"/><path d="M17 3v4M15 5h4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  clapper: '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4"/>',
  tv: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="m8 2 4 4 4-4"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  aboutDoc: '<rect x="5" y="4" width="14" height="16" rx="2.5"/><path d="M9 9h6M9 13h6M9 17h4"/>'
};

const PRESET_GRADIENTS = [
  'linear-gradient(135deg, #4c1d95 0%, #9333ea 55%, #ec4899 100%)',
  'linear-gradient(135deg, #1e1b4b 0%, #7c3aed 60%, #db2777 100%)',
  'linear-gradient(135deg, #0f172a 0%, #2563eb 55%, #a855f7 100%)',
  'linear-gradient(135deg, #3b0764 0%, #be185d 60%, #f59e0b 100%)',
  'linear-gradient(135deg, #064e3b 0%, #0d9488 55%, #6366f1 100%)'
];

const SUGGESTED_TAGS = [
  '🎮 Gamer', '🎬 Cinéfilo', '📺 Seriéfilo', '🎧 Melómano',
  '🍿 Maratonero', '🌙 Nocturno', '🎨 Creativo', '📚 Lector',
  '✈️ Viajero', '☕ Cafetero', '🐾 Amante de mascotas', '✨ Otaku'
];

const LINK_PLATFORMS = [
  { id: 'spotify', label: 'Spotify', logo: 'assets/logos/spotify.svg', icon: '🟢' },
  { id: 'instagram', label: 'Instagram', logo: 'assets/logos/instagram.svg', icon: '📸' },
  { id: 'tiktok', label: 'TikTok', logo: 'assets/logos/tiktok.svg', icon: '🎵' },
  { id: 'youtube', label: 'YouTube', logo: 'assets/logos/youtube.svg', icon: '▶️' },
  { id: 'letterboxd', label: 'Letterboxd', logo: 'assets/logos/letterboxd.svg', icon: '🎞️' },
  { id: 'web', label: 'Web / Otro', logo: null, icon: '🌐' }
];

function countRatedSongs(userId) {
  const seen = new Set();
  for (const g of store.getGroups()) {
    for (const s of (g.songs || [])) {
      if (s.ratings && s.ratings[userId] !== undefined && !seen.has(s.id)) {
        seen.add(s.id);
      }
    }
  }
  return seen.size;
}

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

  const allRatedByUser = store.getUserRatedMediaAcrossGroups(profileUser.id);
  const moviesCount = allRatedByUser.filter(i => i.type === 'Película').length;
  const seriesCount = allRatedByUser.filter(i => i.type === 'Serie').length;
  const songsCount = countRatedSongs(profileUser.id);

  const showcaseSet = new Set(profileUser.showcaseIds || []);
  const showcasedItems = allRatedByUser.filter(item => showcaseSet.has(item.id));
  const aboutTags = Array.isArray(profileUser.aboutTags) ? profileUser.aboutTags : [];
  const links = Array.isArray(profileUser.links) ? profileUser.links : [];

  const bannerStyle = profileUser.bannerImage
    ? `background-image:url('${Utils.sanitize(profileUser.bannerImage)}');background-size:cover;background-position:center;`
    : `background:${Utils.sanitize(profileUser.bannerGradient || PRESET_GRADIENTS[0])};`;

  container.innerHTML = `
    <div class="rpf-wrap">
      <!-- Tarjeta Principal -->
      <section class="rg-card rpf-hero">
        <div class="rpf-banner" style="${bannerStyle}" ${isOwnProfile ? 'id="rpf-banner-btn" role="button" tabindex="0"' : ''}>
          ${isOwnProfile ? `
            <div class="rpf-banner-cta ${profileUser.bannerImage ? 'has-img' : ''}">
              ${svg(ICO.cover, 20)}
              <span>${profileUser.bannerImage ? 'Cambiar portada' : 'Añadir portada'}</span>
            </div>` : ''}
          ${isPrem ? `<span class="rpf-prem-pill">✨ Plus</span>` : ''}
        </div>

        <div class="rpf-identity">
          <div class="rpf-avatar-wrap">
            <img src="${Utils.sanitize(profileUser.avatar || 'assets/ruma_icon_512.png')}" alt="${Utils.sanitize(profileUser.name)}" class="rpf-avatar">
            ${isOwnProfile ? `<button type="button" class="rpf-avatar-plus" id="rpf-avatar-btn" aria-label="Cambiar foto de perfil">+</button>` : ''}
          </div>

          <div class="rpf-id-main">
            <div class="rpf-name-row">
              <div class="rpf-name-col">
                <h1>${Utils.sanitize(profileUser.name || 'Tu nombre')}</h1>
                <div class="rpf-handle">@${Utils.sanitize(profileUser.username || 'usuario')}</div>
              </div>
              ${isOwnProfile
                ? `<button type="button" class="rpf-pill-btn" id="rpf-edit-btn">${svg(ICO.edit, 13)}<span>Editar perfil</span></button>`
                : `<button type="button" class="rpf-pill-btn" id="rpf-back-own">👤 Mi perfil</button>`}
            </div>
            <p class="rpf-bio ${profileUser.bio ? '' : 'empty'}">${Utils.sanitize(profileUser.bio || 'Agrega una descripción sobre ti...')}</p>
          </div>
        </div>
      </section>

      <!-- 3 Contadores (solo elementos calificados con estrellas) -->
      <section class="rpf-stats">
        <div class="rg-card rpf-stat">
          <span class="rpf-stat-ico">${svg(ICO.clapper, 22)}</span>
          <div><b>${moviesCount}</b><small>Películas</small></div>
        </div>
        <div class="rg-card rpf-stat">
          <span class="rpf-stat-ico">${svg(ICO.tv, 22)}</span>
          <div><b>${seriesCount}</b><small>Series</small></div>
        </div>
        <div class="rg-card rpf-stat">
          <span class="rpf-stat-ico">${svg(ICO.note, 22)}</span>
          <div><b>${songsCount}</b><small>Canciones</small></div>
        </div>
      </section>

      <!-- Destacados -->
      <section class="rg-card rpf-box">
        <div class="rpf-box-head">
          <h2><span class="rpf-star-ico">${svg(ICO.star, 17)}</span> Destacados</h2>
          ${isOwnProfile ? `<button type="button" class="rpf-pill-btn sm" id="rpf-edit-showcase">${svg(ICO.edit, 12)}<span>Editar</span></button>` : ''}
        </div>

        ${showcasedItems.length === 0 ? `
          <div class="rpf-dashed" ${isOwnProfile ? 'id="rpf-add-showcase-empty" role="button" tabindex="0"' : ''}>
            <span class="rpf-plus-box">+</span>
            <p>${isOwnProfile ? 'Añade tus películas o series favoritas' : 'Aún no ha destacado películas o series.'}</p>
          </div>
        ` : `
          <div class="rpf-showcase-grid">
            ${showcasedItems.map(item => `
              <div class="rpf-sc-card">
                <div class="rpf-sc-poster">
                  <img src="${Utils.sanitize(item.poster)}" alt="${Utils.sanitize(item.title)}">
                  <span class="rpf-sc-rate">⭐ ${Number(item.score).toFixed(1)}</span>
                  <span class="rpf-sc-type">${Utils.sanitize(item.type)}</span>
                </div>
                <div class="rpf-sc-title">${Utils.sanitize(item.title)}</div>
              </div>
            `).join('')}
          </div>
        `}
      </section>

      <!-- Sobre mí + Enlaces -->
      <section class="rpf-two-col">
        <!-- Sobre mí (Etiquetas) -->
        <div class="rg-card rpf-box rpf-half">
          <div class="rpf-box-head">
            <h2>${svg(ICO.info, 16)} Sobre mí</h2>
            ${isOwnProfile ? `<button type="button" class="rpf-pill-btn sm" data-edit-about>${svg(ICO.edit, 12)}<span>Editar</span></button>` : ''}
          </div>
          ${aboutTags.length === 0 ? `
            <div class="rpf-empty-half">
              <div class="rpf-empty-ico">${svg(ICO.aboutDoc, 28)}</div>
              <p>${isOwnProfile ? 'Aún no has agregado información sobre ti.' : 'Sin etiquetas aún.'}</p>
              ${isOwnProfile ? `<button type="button" class="rpf-action-btn" data-edit-about>Completar perfil</button>` : ''}
            </div>
          ` : `
            <div class="rpf-tags">
              ${aboutTags.map(t => `<span class="rpf-tag">${Utils.sanitize(t)}</span>`).join('')}
            </div>
          `}
        </div>

        <!-- Enlaces -->
        <div class="rg-card rpf-box rpf-half">
          <div class="rpf-box-head">
            <h2>${svg(ICO.link, 16)} Enlaces</h2>
            ${isOwnProfile ? `<button type="button" class="rpf-pill-btn sm" data-edit-links>${svg(ICO.edit, 12)}<span>Editar</span></button>` : ''}
          </div>
          ${links.length === 0 ? `
            <div class="rpf-empty-half">
              <div class="rpf-empty-ico">${svg(ICO.link, 28)}</div>
              <p>${isOwnProfile ? 'Aún no tienes enlaces vinculados.' : 'Sin enlaces vinculados.'}</p>
              ${isOwnProfile ? `<button type="button" class="rpf-action-btn" data-edit-links>Añadir enlaces</button>` : ''}
            </div>
          ` : `
            <div class="rpf-links-list">
              ${links.map(lk => {
                const meta = LINK_PLATFORMS.find(p => p.id === lk.platform) || LINK_PLATFORMS[5];
                const badge = meta.logo
                  ? `<img src="${meta.logo}" alt="" width="16" height="16" style="vertical-align:middle;border-radius:3px;object-fit:contain;flex-shrink:0;">`
                  : `<span>${meta.icon}</span>`;
                return `
                  <a class="rpf-link-item" href="${Utils.sanitize(lk.url)}" target="_blank" rel="noopener noreferrer">
                    ${badge}
                    <b>${Utils.sanitize(lk.label || meta.label)}</b>
                    <i>↗</i>
                  </a>`;
              }).join('')}
            </div>
          `}
        </div>
      </section>
    </div>
    <input type="file" id="rpf-file-avatar" accept="image/*" hidden>
    <input type="file" id="rpf-file-banner" accept="image/*" hidden>
  `;

  if (!isOwnProfile) {
    container.querySelector('#rpf-back-own')?.addEventListener('click', () => {
      store.navigate('profile', { inspectUserId: currentUser.id });
    });
    return;
  }

  // Cambiar foto de perfil con recorte 1:1
  const avInp = container.querySelector('#rpf-file-avatar');
  container.querySelector('#rpf-avatar-btn')?.addEventListener('click', () => avInp?.click());
  avInp?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    openImageCropperModal(f, {
      title: 'Recortar foto de perfil',
      aspectW: 1,
      aspectH: 1,
      round: true,
      outW: 400,
      outH: 400,
      onCropped: (dataUrl) => {
        store.updateCurrentUser({ avatar: dataUrl });
        UI.showToast('Foto de perfil actualizada ✨', 'success');
      }
    });
    e.target.value = '';
  });

  // Cambiar portada (foto con recorte panorámico o degradado)
  const bnInp = container.querySelector('#rpf-file-banner');
  container.querySelector('#rpf-banner-btn')?.addEventListener('click', () => openBannerPickerModal(profileUser, () => bnInp?.click()));
  bnInp?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    openImageCropperModal(f, {
      title: 'Recortar portada',
      aspectW: 16,
      aspectH: 6,
      round: false,
      outW: 960,
      outH: 360,
      onCropped: (dataUrl) => {
        store.updateCurrentUser({ bannerImage: dataUrl });
        UI.showToast('Portada actualizada 🖼️', 'success');
      }
    });
    e.target.value = '';
  });

  container.querySelector('#rpf-edit-btn')?.addEventListener('click', () => openEditBasicProfileModal(profileUser));
  container.querySelector('#rpf-edit-showcase')?.addEventListener('click', () => openShowcasePickerModal(profileUser, allRatedByUser));
  container.querySelector('#rpf-add-showcase-empty')?.addEventListener('click', () => openShowcasePickerModal(profileUser, allRatedByUser));
  container.querySelectorAll('[data-edit-about]').forEach(b => b.addEventListener('click', () => openAboutTagsModal(profileUser)));
  container.querySelectorAll('[data-edit-links]').forEach(b => b.addEventListener('click', () => openLinksModal(profileUser)));
}

function openBannerPickerModal(user, onPickFile) {
  UI.openModal({
    title: '🖼️ Portada de perfil',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:.85rem;">
        <button type="button" class="btn btn-primary" id="rpf-bn-upload">📷 Subir imagen desde galería / archivos</button>
        ${user.bannerImage ? `<button type="button" class="btn btn-secondary" id="rpf-bn-remove">🗑️ Quitar imagen y usar degradado</button>` : ''}
        <div style="font-size:.82rem;color:var(--text-secondary);font-weight:700;">O elige un degradado:</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.45rem;">
          ${PRESET_GRADIENTS.map((g, idx) => `
            <button type="button" data-bn-grad="${idx}" style="height:2.6rem;border-radius:.7rem;border:2px solid ${user.bannerGradient === g && !user.bannerImage ? '#fff' : 'rgba(255,255,255,.2)'};background:${g};cursor:pointer;"></button>
          `).join('')}
        </div>
      </div>`,
    onMount: () => {
      document.getElementById('rpf-bn-upload')?.addEventListener('click', () => { UI.closeModal(); onPickFile(); });
      document.getElementById('rpf-bn-remove')?.addEventListener('click', () => {
        store.updateCurrentUser({ bannerImage: '' });
        UI.closeModal();
        UI.showToast('Portada cambiada a degradado.', 'info');
      });
      document.querySelectorAll('[data-bn-grad]').forEach(b => b.addEventListener('click', () => {
        const g = PRESET_GRADIENTS[Number(b.getAttribute('data-bn-grad'))];
        store.updateCurrentUser({ bannerImage: '', bannerGradient: g });
        UI.closeModal();
        UI.showToast('Degradado de portada actualizado ✨', 'success');
      }));
    }
  });
}

function openEditBasicProfileModal(user) {
  UI.openModal({
    title: '✏️ Editar perfil',
    contentHtml: `
      <form id="rpf-basic-form" style="display:flex;flex-direction:column;gap:.85rem;">
        <div class="form-group">
          <label class="form-label">Nombre</label>
          <input type="text" id="rpf-inp-name" class="form-input" maxlength="40" required value="${Utils.sanitize(user.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Usuario (sin @)</label>
          <input type="text" id="rpf-inp-user" class="form-input" maxlength="24" required value="${Utils.sanitize(user.username || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Descripción</label>
          <textarea id="rpf-inp-bio" class="form-input" rows="3" maxlength="140" placeholder="Agrega una descripción sobre ti...">${Utils.sanitize(user.bio || '')}</textarea>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;">
          <button type="button" class="btn btn-secondary" id="rpf-b-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`,
    onMount: () => {
      document.getElementById('rpf-b-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('rpf-basic-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('rpf-inp-name').value.trim();
        const username = document.getElementById('rpf-inp-user').value.trim().replace(/^@+/, '').toLowerCase();
        const bio = document.getElementById('rpf-inp-bio').value.trim();
        if (!name || !username) return;
        store.updateCurrentUser({ name, username, bio });
        UI.closeModal();
        UI.showToast('Perfil actualizado ✨', 'success');
      });
    }
  });
}

function openShowcasePickerModal(user, allRated) {
  const selected = new Set(user.showcaseIds || []);
  UI.openModal({
    title: '⭐ Destacados en tu perfil',
    contentHtml: allRated.length === 0 ? `
      <div style="text-align:center;padding:1rem;color:var(--text-secondary);">
        Todavía no has calificado películas o series con estrellas en tus grupos.<br><br>
        Entra a un grupo, califica una película o serie y luego vuelve aquí para destacarla.
      </div>` : `
      <div style="display:flex;flex-direction:column;gap:.55rem;max-height:58dvh;overflow-y:auto;">
        ${allRated.map(it => {
          const on = selected.has(it.id);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:.65rem;padding:.55rem .7rem;border-radius:.8rem;background:rgba(255,255,255,.04);border:1px solid ${on ? '#a855f7' : 'rgba(255,255,255,.1)'};">
              <div style="display:flex;align-items:center;gap:.65rem;min-width:0;">
                <img src="${Utils.sanitize(it.poster)}" alt="" style="width:38px;height:52px;border-radius:6px;object-fit:cover;flex-shrink:0;">
                <div style="min-width:0;">
                  <div style="font-weight:700;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${Utils.sanitize(it.title)}</div>
                  <div style="font-size:.74rem;color:var(--text-muted);">${Utils.sanitize(it.type)} · ⭐ ${Number(it.score).toFixed(1)}</div>
                </div>
              </div>
              <button type="button" class="btn ${on ? 'btn-primary' : 'btn-secondary'} btn-sm" data-sc-tog="${Utils.sanitize(it.id)}">${on ? '✓ Destacada' : '+ Añadir'}</button>
            </div>`;
        }).join('')}
      </div>`,
    onMount: () => {
      document.querySelectorAll('[data-sc-tog]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sc-tog');
        store.toggleShowcaseMediaItem(id);
        const nowOn = !btn.classList.contains('btn-primary');
        btn.className = `btn ${nowOn ? 'btn-primary' : 'btn-secondary'} btn-sm`;
        btn.textContent = nowOn ? '✓ Destacada' : '+ Añadir';
      }));
    }
  });
}

function openAboutTagsModal(user) {
  let tags = [...(user.aboutTags || [])];

  const renderBody = () => {
    const box = document.getElementById('rpf-tags-modal');
    if (!box) return;
    box.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.85rem;">
        <div style="font-size:.8rem;color:var(--text-secondary);">Elige etiquetas que te describan o escribe las tuyas:</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem;">
          ${SUGGESTED_TAGS.map(t => {
            const on = tags.includes(t);
            return `<button type="button" class="rpf-tag-pick ${on ? 'on' : ''}" data-pick-tag="${Utils.sanitize(t)}">${Utils.sanitize(t)}</button>`;
          }).join('')}
          ${tags.filter(t => !SUGGESTED_TAGS.includes(t)).map(t =>
            `<button type="button" class="rpf-tag-pick on" data-pick-tag="${Utils.sanitize(t)}">${Utils.sanitize(t)} ✕</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:.45rem;">
          <input type="text" id="rpf-custom-tag" class="form-input" maxlength="24" placeholder="Otra etiqueta (ej: Rockero)..." style="flex:1;">
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-add-tag">+ Añadir</button>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:.6rem;margin-top:.2rem;">
          <button type="button" class="btn btn-secondary" id="rpf-tags-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="rpf-tags-save">Guardar</button>
        </div>
      </div>`;

    box.querySelectorAll('[data-pick-tag]').forEach(b => b.addEventListener('click', () => {
      const val = b.getAttribute('data-pick-tag');
      tags = tags.includes(val) ? tags.filter(x => x !== val) : (tags.length < 12 ? [...tags, val] : tags);
      renderBody();
    }));
    box.querySelector('#rpf-add-tag')?.addEventListener('click', () => {
      const inp = box.querySelector('#rpf-custom-tag');
      const v = inp?.value.trim();
      if (!v) return;
      if (!tags.includes(v) && tags.length < 12) tags.push(v);
      renderBody();
    });
    box.querySelector('#rpf-tags-cancel')?.addEventListener('click', () => UI.closeModal());
    box.querySelector('#rpf-tags-save')?.addEventListener('click', () => {
      store.updateCurrentUser({ aboutTags: tags });
      UI.closeModal();
      UI.showToast('Etiquetas guardadas ✨', 'success');
    });
  };

  UI.openModal({
    title: 'ℹ️ Sobre mí — Etiquetas',
    contentHtml: `<div id="rpf-tags-modal"></div>`,
    onMount: renderBody
  });
}

function openLinksModal(user) {
  let links = [...(user.links || [])];

  const renderBody = () => {
    const box = document.getElementById('rpf-links-modal');
    if (!box) return;
    box.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:.8rem;">
        ${links.length === 0 ? `<div style="font-size:.8rem;color:var(--text-muted);">Aún no tienes enlaces añadidos.</div>` : `
          <div style="display:flex;flex-direction:column;gap:.4rem;">
            ${links.map((l, idx) => {
              const m = LINK_PLATFORMS.find(p => p.id === l.platform) || LINK_PLATFORMS[5];
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;padding:.45rem .65rem;border-radius:.75rem;background:rgba(255,255,255,.05);">
                  <div style="min-width:0;font-size:.82rem;"><b>${m.icon} ${Utils.sanitize(l.label || m.label)}</b><div style="font-size:.72rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.sanitize(l.url)}</div></div>
                  <button type="button" class="btn btn-secondary btn-sm" data-del-link="${idx}">✕</button>
                </div>`;
            }).join('')}
          </div>`}

        <div style="display:flex;flex-direction:column;gap:.5rem;padding-top:.5rem;border-top:1px solid var(--border-subtle);">
          <select id="rpf-lk-plat" class="form-select">
            ${LINK_PLATFORMS.map(p => `<option value="${p.id}">${p.icon} ${p.label}</option>`).join('')}
          </select>
          <input type="text" id="rpf-lk-label" class="form-input" maxlength="28" placeholder="Nombre visible (opcional, ej: Mi Spotify)">
          <input type="url" id="rpf-lk-url" class="form-input" placeholder="https://...">
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-lk-add">+ Agregar enlace</button>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:.6rem;margin-top:.2rem;">
          <button type="button" class="btn btn-secondary" id="rpf-lk-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="rpf-lk-save">Guardar enlaces</button>
        </div>
      </div>`;

    box.querySelectorAll('[data-del-link]').forEach(b => b.addEventListener('click', () => {
      links.splice(Number(b.getAttribute('data-del-link')), 1);
      renderBody();
    }));
    box.querySelector('#rpf-lk-add')?.addEventListener('click', () => {
      const plat = box.querySelector('#rpf-lk-plat').value;
      const label = box.querySelector('#rpf-lk-label').value.trim();
      let url = box.querySelector('#rpf-lk-url').value.trim();
      if (!url) return UI.showToast('Escribe una URL válida.', 'info');
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      links.push({ platform: plat, label, url });
      renderBody();
    });
    box.querySelector('#rpf-lk-cancel')?.addEventListener('click', () => UI.closeModal());
    box.querySelector('#rpf-lk-save')?.addEventListener('click', () => {
      store.updateCurrentUser({ links });
      UI.closeModal();
      UI.showToast('Enlaces guardados 🔗', 'success');
    });
  };

  UI.openModal({
    title: '🔗 Mis Enlaces',
    contentHtml: `<div id="rpf-links-modal"></div>`,
    onMount: renderBody
  });
}
