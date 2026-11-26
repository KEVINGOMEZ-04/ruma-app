/**
 * ruma 🌟 — Perfil de Usuario (Rediseño integral mobile-first)
 * - Hero optimizado para teléfonos (sin cortes de nombre, marco de avatar, alto contraste)
 * - Barra unificada de 4 métricas (Películas, Series, Libros, Música)
 * - Destacados en carrusel horizontal compacto (incluye Libros)
 * - Sobre mí y Enlaces a ancho completo en móvil (con logos oficiales SVG y editor de Enlaces corregido)
 */
import { store } from '../core/store.js';
import { CONFIG } from '../core/config.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { openImageCropperModal } from '../components/image-cropper.js';

const esc = v => Utils.sanitize(v);

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  clapper: '<rect x="3" y="7" width="18" height="13" rx="2.2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4"/>',
  tv: '<rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="m8 2 4 4 4-4"/>',
  book: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H12v17H4.5A2.5 2.5 0 0 0 2 22V5.5Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H12v17h7.5a2.5 2.5 0 0 1 2.5 2V5.5Z"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.7 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  plus: '<path d="M12 5v14M5 12h14"/>'
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
  { id: 'instagram', label: 'Instagram', logo: 'assets/logos/instagram.svg', icon: '📸', placeholder: '@usuario o instagram.com/tu_perfil', baseUrl: h => `https://instagram.com/${h}` },
  { id: 'spotify', label: 'Spotify', logo: 'assets/logos/spotify.svg', icon: '🟢', placeholder: 'https://open.spotify.com/user/...', baseUrl: h => `https://open.spotify.com/user/${h}` },
  { id: 'tiktok', label: 'TikTok', logo: 'assets/logos/tiktok.svg', icon: '🎵', placeholder: '@usuario o tiktok.com/@usuario', baseUrl: h => `https://www.tiktok.com/@${h}` },
  { id: 'youtube', label: 'YouTube', logo: 'assets/logos/youtube.svg', icon: '▶️', placeholder: '@canal o youtube.com/@canal', baseUrl: h => `https://www.youtube.com/@${h}` },
  { id: 'letterboxd', label: 'Letterboxd', logo: 'assets/logos/letterboxd.svg', icon: '🎞️', placeholder: 'usuario o letterboxd.com/usuario', baseUrl: h => `https://letterboxd.com/${h}` },
  { id: 'apple', label: 'Apple Music', logo: 'assets/logos/apple-music.svg', icon: '🎵', placeholder: 'https://music.apple.com/...', baseUrl: h => `https://music.apple.com/profile/${h}` },
  { id: 'goodreads', label: 'Goodreads', logo: null, icon: '📚', placeholder: 'https://goodreads.com/...', baseUrl: h => `https://www.goodreads.com/${h}` },
  { id: 'x', label: 'X / Twitter', logo: null, icon: '𝕏', placeholder: '@usuario o x.com/usuario', baseUrl: h => `https://x.com/${h}` },
  { id: 'web', label: 'Web / Otro', logo: null, icon: '🌐', placeholder: 'https://tusitio.com', baseUrl: h => `https://${h}` }
];

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') return Object.values(val);
  return [];
}

function normalizeLinkUrl(platformId, rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  // Si parece dominio o ruta con punto (ej. instagram.com/kevin o open.spotify.com/...)
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(raw)) {
    return `https://${raw}`;
  }
  // Si el usuario escribió un @usuario o handle directo
  const handle = raw.replace(/^@+/, '').replace(/\s+/g, '');
  if (!handle) return '';
  const meta = LINK_PLATFORMS.find(p => p.id === platformId) || LINK_PLATFORMS[LINK_PLATFORMS.length - 1];
  return meta.baseUrl(handle);
}

function prettyUrlSubtitle(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch (_) {
    return String(url || '').replace(/^https?:\/\/(www\.)?/i, '');
  }
}

function renderPlatformBadge(meta) {
  if (meta.logo) {
    return `<img src="${meta.logo}" alt="" loading="lazy">`;
  }
  return `<span>${meta.icon}</span>`;
}

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
  const booksCount = allRatedByUser.filter(i => i.type === 'Libro').length;
  const songsCount = countRatedSongs(profileUser.id);

  const showcaseSet = new Set(toArray(profileUser.showcaseIds));
  const showcasedItems = allRatedByUser.filter(item => showcaseSet.has(item.id));
  const aboutTags = toArray(profileUser.aboutTags).filter(Boolean);
  const links = toArray(profileUser.links).filter(l => l && l.url);

  const frameClass = esc(profileUser.frameId || 'frame-axolotl');
  const avatarSrc = (profileUser.avatar && profileUser.avatar !== 'assets/ruma_icon_512.png')
    ? profileUser.avatar
    : 'assets/ruma_default_avatar.png';

  const bannerStyle = profileUser.bannerImage
    ? `background-image:url('${esc(profileUser.bannerImage)}');`
    : `background:${esc(profileUser.bannerGradient || PRESET_GRADIENTS[0])};`;

  container.innerHTML = `
    <div class="rpf-wrap">
      <!-- 1. Hero de Perfil -->
      <section class="rpf-hero">
        <div class="rpf-banner" style="${bannerStyle}" ${isOwnProfile ? 'id="rpf-banner-area" role="button" tabindex="0" aria-label="Cambiar portada"' : 'data-readonly="true"'}>
          <div class="rpf-banner-top">
            ${isPrem ? `<span class="rpf-prem-pill">✨ ruma Plus</span>` : '<span></span>'}
            ${isOwnProfile ? `
              <button type="button" class="rpf-banner-btn" id="rpf-banner-btn">
                ${svg(ICO.camera, 14)}
                <span>${profileUser.bannerImage ? 'Portada' : 'Añadir portada'}</span>
              </button>` : ''}
          </div>
        </div>

        <div class="rpf-id-shell">
          <div class="rpf-id-top">
            <div class="rpf-avatar-slot">
              <span class="rpf-avatar-ring ${frameClass}">
                <img src="${esc(avatarSrc)}" alt="${esc(profileUser.name || 'Perfil')}" class="rpf-avatar-img">
              </span>
              ${isOwnProfile ? `<button type="button" class="rpf-avatar-cam" id="rpf-avatar-btn" aria-label="Cambiar foto de perfil">${svg(ICO.camera, 15)}</button>` : ''}
            </div>

            ${isOwnProfile
              ? `<button type="button" class="rpf-edit-primary" id="rpf-edit-btn">${svg(ICO.edit, 14)}<span>Editar perfil</span></button>`
              : `<button type="button" class="rpf-edit-primary" id="rpf-back-own">Mi perfil</button>`}
          </div>

          <div class="rpf-id-body">
            <h1 class="rpf-name">${esc(profileUser.name || 'Tu nombre')}</h1>
            <div class="rpf-handle-row">
              <span class="rpf-handle">@${esc(profileUser.username || 'usuario')}</span>
            </div>
            <p class="rpf-bio ${profileUser.bio ? '' : 'empty'}">${esc(profileUser.bio || (isOwnProfile ? 'Agrega una biografía corta sobre ti…' : 'Sin biografía aún.'))}</p>
          </div>
        </div>
      </section>

      <!-- 2. Barra unificada de métricas (4 categorías) -->
      <section class="rpf-stats-bar" aria-label="Actividad calificada">
        <div class="rpf-stat-cell">
          <span class="rpf-stat-cell-ico">${svg(ICO.clapper, 17)}</span>
          <b>${moviesCount}</b>
          <small>Películas</small>
        </div>
        <div class="rpf-stat-cell">
          <span class="rpf-stat-cell-ico">${svg(ICO.tv, 17)}</span>
          <b>${seriesCount}</b>
          <small>Series</small>
        </div>
        <div class="rpf-stat-cell">
          <span class="rpf-stat-cell-ico">${svg(ICO.book, 17)}</span>
          <b>${booksCount}</b>
          <small>Libros</small>
        </div>
        <div class="rpf-stat-cell">
          <span class="rpf-stat-cell-ico">${svg(ICO.note, 17)}</span>
          <b>${songsCount}</b>
          <small>Música</small>
        </div>
      </section>

      <!-- 3. Destacados (Carrusel horizontal en móvil) -->
      <section class="rpf-section">
        <div class="rpf-sec-head">
          <h2 class="rpf-sec-title">
            <span class="rpf-sec-title-ico">${svg(ICO.star, 16)}</span>
            <span>Destacados</span>
            ${showcasedItems.length > 0 ? `<span class="rpf-sec-count">${showcasedItems.length}</span>` : ''}
          </h2>
          ${isOwnProfile ? `<button type="button" class="rpf-sec-action" id="rpf-edit-showcase">${svg(ICO.edit, 13)}<span>Gestionar</span></button>` : ''}
        </div>

        ${showcasedItems.length === 0 ? `
          <div class="rpf-empty-box ${isOwnProfile ? 'clickable' : ''}" ${isOwnProfile ? 'id="rpf-add-showcase-empty" role="button" tabindex="0"' : ''}>
            <p>${isOwnProfile ? 'Destaca tus películas, series o libros favoritos calificados en tus grupos.' : 'Aún no ha destacado favoritos.'}</p>
            ${isOwnProfile ? `<span class="rpf-empty-cta">${svg(ICO.plus, 14)}<span>Elegir favoritos</span></span>` : ''}
          </div>
        ` : `
          <div class="rpf-showcase-track">
            ${showcasedItems.map(item => `
              <article class="rpf-sc-card">
                <div class="rpf-sc-poster">
                  <img src="${esc(item.poster)}" alt="${esc(item.title)}" loading="lazy">
                  <span class="rpf-sc-rate">★ ${Number(item.score).toFixed(1)}</span>
                  <span class="rpf-sc-type">${esc(item.type)}</span>
                </div>
                <div class="rpf-sc-title">${esc(item.title)}</div>
              </article>
            `).join('')}
          </div>
        `}
      </section>

      <!-- 4. Sobre mí y Enlaces (1 columna en móvil, 2 en pantallas grandes) -->
      <div class="rpf-lower-grid">
        <!-- Sobre mí -->
        <section class="rpf-section">
          <div class="rpf-sec-head">
            <h2 class="rpf-sec-title">
              <span class="rpf-sec-title-ico">${svg(ICO.info, 16)}</span>
              <span>Sobre mí</span>
              ${aboutTags.length > 0 ? `<span class="rpf-sec-count">${aboutTags.length}</span>` : ''}
            </h2>
            ${isOwnProfile ? `<button type="button" class="rpf-sec-action" data-edit-about>${svg(ICO.edit, 13)}<span>Editar</span></button>` : ''}
          </div>

          ${aboutTags.length === 0 ? `
            <div class="rpf-empty-box">
              <p>${isOwnProfile ? 'Añade intereses y etiquetas para presentarte en tus grupos.' : 'Sin etiquetas aún.'}</p>
              ${isOwnProfile ? `<button type="button" class="rpf-empty-cta" data-edit-about>${svg(ICO.plus, 14)}<span>Añadir etiquetas</span></button>` : ''}
            </div>
          ` : `
            <div class="rpf-tags">
              ${aboutTags.map(t => `<span class="rpf-tag">${esc(t)}</span>`).join('')}
            </div>
          `}
        </section>

        <!-- Enlaces -->
        <section class="rpf-section">
          <div class="rpf-sec-head">
            <h2 class="rpf-sec-title">
              <span class="rpf-sec-title-ico">${svg(ICO.link, 16)}</span>
              <span>Enlaces</span>
              ${links.length > 0 ? `<span class="rpf-sec-count">${links.length}</span>` : ''}
            </h2>
            ${isOwnProfile ? `<button type="button" class="rpf-sec-action" data-edit-links>${svg(ICO.edit, 13)}<span>${links.length > 0 ? 'Editar' : 'Añadir'}</span></button>` : ''}
          </div>

          ${links.length === 0 ? `
            <div class="rpf-empty-box">
              <p>${isOwnProfile ? 'Comparte tu Spotify, Instagram, Letterboxd, Goodreads o sitio web.' : 'Sin enlaces vinculados.'}</p>
              ${isOwnProfile ? `<button type="button" class="rpf-empty-cta" data-edit-links>${svg(ICO.plus, 14)}<span>Añadir enlace</span></button>` : ''}
            </div>
          ` : `
            <div class="rpf-links-list">
              ${links.map(lk => {
                const meta = LINK_PLATFORMS.find(p => p.id === lk.platform) || LINK_PLATFORMS[LINK_PLATFORMS.length - 1];
                const href = normalizeLinkUrl(lk.platform, lk.url);
                return `
                  <a class="rpf-link-item" href="${esc(href)}" target="_blank" rel="noopener noreferrer">
                    <span class="rpf-link-ico" aria-hidden="true">${renderPlatformBadge(meta)}</span>
                    <span class="rpf-link-txt">
                      <b>${esc(lk.label || meta.label)}</b>
                      <small>${esc(prettyUrlSubtitle(href))}</small>
                    </span>
                    <i class="rpf-link-ext" aria-hidden="true">↗</i>
                  </a>`;
              }).join('')}
            </div>
          `}
        </section>
      </div>
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
  const openBanner = (e) => {
    e?.stopPropagation?.();
    openBannerPickerModal(profileUser, () => bnInp?.click());
  };
  container.querySelector('#rpf-banner-area')?.addEventListener('click', openBanner);
  container.querySelector('#rpf-banner-btn')?.addEventListener('click', openBanner);
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

  container.querySelector('#rpf-edit-btn')?.addEventListener('click', () => openEditBasicProfileModal(profileUser, isPrem));
  container.querySelector('#rpf-edit-showcase')?.addEventListener('click', () => openShowcasePickerModal(profileUser, allRatedByUser));
  container.querySelector('#rpf-add-showcase-empty')?.addEventListener('click', () => openShowcasePickerModal(profileUser, allRatedByUser));
  container.querySelectorAll('[data-edit-about]').forEach(b => b.addEventListener('click', () => openAboutTagsModal(profileUser)));
  container.querySelectorAll('[data-edit-links]').forEach(b => b.addEventListener('click', () => openLinksModal(profileUser)));
}

// ============================================================================
// PORTADA
// ============================================================================
function openBannerPickerModal(user, onPickFile) {
  UI.openModal({
    title: 'Portada de perfil',
    contentHtml: `
      <div style="display:flex;flex-direction:column;gap:0.85rem;">
        <button type="button" class="btn btn-primary" id="rpf-bn-upload">📷 Subir imagen desde galería</button>
        ${user.bannerImage ? `<button type="button" class="btn btn-secondary" id="rpf-bn-remove">Quitar imagen y usar degradado</button>` : ''}
        <div style="font-size:0.8rem;color:var(--text-secondary);font-weight:700;">O elige un degradado:</div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.45rem;">
          ${PRESET_GRADIENTS.map((g, idx) => `
            <button type="button" data-bn-grad="${idx}" aria-label="Degradado ${idx + 1}" style="height:2.8rem;border-radius:0.75rem;border:2px solid ${user.bannerGradient === g && !user.bannerImage ? 'var(--primary)' : 'var(--border)'};background:${g};cursor:pointer;"></button>
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
        UI.showToast('Portada actualizada ✨', 'success');
      }));
    }
  });
}

// ============================================================================
// EDITAR PERFIL BÁSICO + MARCO DE AVATAR
// ============================================================================
function openEditBasicProfileModal(user, isPrem) {
  let chosenFrame = user.frameId || 'frame-axolotl';
  const frames = CONFIG.avatarFrames || [];

  UI.openModal({
    title: 'Editar perfil',
    contentHtml: `
      <form id="rpf-basic-form" style="display:flex;flex-direction:column;gap:0.85rem;">
        <div class="form-group">
          <label class="form-label" for="rpf-inp-name">Nombre</label>
          <input type="text" id="rpf-inp-name" class="form-input" maxlength="40" required value="${esc(user.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label" for="rpf-inp-user">Usuario (sin @)</label>
          <input type="text" id="rpf-inp-user" class="form-input" maxlength="24" required value="${esc(user.username || '')}">
        </div>
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <label class="form-label" for="rpf-inp-bio" style="margin:0;">Biografía</label>
            <small id="rpf-bio-count" style="font-size:0.72rem;color:var(--text-muted);">${(user.bio || '').length}/140</small>
          </div>
          <textarea id="rpf-inp-bio" class="form-input" rows="3" maxlength="140" placeholder="Cuéntale a tus grupos sobre ti…">${esc(user.bio || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Marco de avatar</label>
          <div class="rpf-frame-grid">
            ${frames.map(f => {
              const locked = Boolean(f.premium && !isPrem);
              const active = chosenFrame === f.id;
              return `
                <button type="button" class="rpf-frame-opt ${active ? 'active' : ''} ${locked ? 'locked' : ''}" data-pick-frame="${esc(f.id)}" data-frame-locked="${locked}">
                  <span class="rpf-frame-preview rpf-avatar-ring ${esc(f.id)}"><i></i></span>
                  <span>${esc(f.label.replace(/\s*[✨👑🌌]/g, ''))}${locked ? ' 🔒' : ''}</span>
                </button>`;
            }).join('')}
          </div>
        </div>

        <div class="rpf-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-b-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm">Guardar cambios</button>
        </div>
      </form>`,
    onMount: (modalEl) => {
      const bioInp = document.getElementById('rpf-inp-bio');
      const bioCnt = document.getElementById('rpf-bio-count');
      bioInp?.addEventListener('input', () => {
        if (bioCnt) bioCnt.textContent = `${bioInp.value.length}/140`;
      });

      modalEl.querySelectorAll('[data-pick-frame]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.getAttribute('data-frame-locked') === 'true') {
            UI.showToast('Este marco es exclusivo de ruma Plus ✨', 'info');
            return;
          }
          chosenFrame = btn.getAttribute('data-pick-frame');
          modalEl.querySelectorAll('[data-pick-frame]').forEach(x => x.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      document.getElementById('rpf-b-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('rpf-basic-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('rpf-inp-name').value.trim();
        const username = document.getElementById('rpf-inp-user').value.trim().replace(/^@+/, '').toLowerCase();
        const bio = document.getElementById('rpf-inp-bio').value.trim();
        if (!name || !username) return;
        const res = store.updateCurrentUser({ name, username, bio, frameId: chosenFrame });
        if (res && res.ok === false) {
          UI.showToast(res.error || 'No se pudo actualizar el perfil.', 'error');
          return;
        }
        UI.closeModal();
        UI.showToast('Perfil actualizado ✨', 'success');
      });
    }
  });
}

// ============================================================================
// DESTACADOS (Películas, Series y Libros calificados)
// ============================================================================
function openShowcasePickerModal(user, allRated) {
  let activeType = 'Todos';
  const types = ['Todos', 'Película', 'Serie', 'Libro'];

  const renderModal = () => {
    const freshUser = store.getCurrentUser() || user;
    const selected = new Set(toArray(freshUser.showcaseIds));
    const filtered = activeType === 'Todos' ? allRated : allRated.filter(i => i.type === activeType);

    UI.openModal({
      title: 'Destacados en tu perfil',
      contentHtml: allRated.length === 0 ? `
        <div style="text-align:center;padding:1rem;color:var(--text-secondary);font-size:0.86rem;line-height:1.5;">
          Todavía no has calificado películas, series o libros en tus grupos.<br><br>
          Entra a un grupo, califica tus favoritos y vuelve aquí para destacarlos.
        </div>` : `
        <div style="display:flex;flex-direction:column;gap:0.75rem;">
          <div class="rpf-sc-tabs">
            ${types.map(t => `<button type="button" class="rpf-sc-tab ${activeType === t ? 'active' : ''}" data-sc-type="${t}">${t === 'Todos' ? 'Todos' : `${t}s`}</button>`).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:50dvh;overflow-y:auto;">
            ${filtered.length === 0 ? `
              <div style="text-align:center;padding:1rem;color:var(--text-muted);font-size:0.82rem;">No tienes elementos calificados en esta categoría.</div>
            ` : filtered.map(it => {
              const on = selected.has(it.id);
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:0.65rem;padding:0.5rem 0.65rem;border-radius:0.85rem;background:var(--surface-secondary);border:1px solid ${on ? 'var(--primary)' : 'var(--border)'};">
                  <div style="display:flex;align-items:center;gap:0.65rem;min-width:0;">
                    <img src="${esc(it.poster)}" alt="" style="width:38px;height:54px;border-radius:6px;object-fit:cover;flex-shrink:0;">
                    <div style="min-width:0;">
                      <div style="font-weight:700;font-size:0.86rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(it.title)}</div>
                      <div style="font-size:0.74rem;color:var(--text-muted);">${esc(it.type)} · ★ ${Number(it.score).toFixed(1)}</div>
                    </div>
                  </div>
                  <button type="button" class="btn ${on ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex:0 0 auto;" data-sc-tog="${esc(it.id)}">${on ? '✓ Destacado' : '+ Destacar'}</button>
                </div>`;
            }).join('')}
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="rpf-sc-done" style="width:100%;min-height:40px;">Listo</button>
        </div>`,
      onMount: (modalEl) => {
        modalEl.querySelectorAll('[data-sc-type]').forEach(btn => {
          btn.addEventListener('click', () => {
            activeType = btn.getAttribute('data-sc-type');
            renderModal();
          });
        });
        modalEl.querySelectorAll('[data-sc-tog]').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-sc-tog');
            store.toggleShowcaseMediaItem(id);
            renderModal();
          });
        });
        document.getElementById('rpf-sc-done')?.addEventListener('click', () => UI.closeModal());
      }
    });
  };

  renderModal();
}

// ============================================================================
// SOBRE MÍ — ETIQUETAS
// ============================================================================
function openAboutTagsModal(user) {
  let tags = [...toArray(user.aboutTags)];

  const renderBody = () => {
    const box = document.getElementById('rpf-tags-modal');
    if (!box) return;
    box.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.85rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;color:var(--text-secondary);">
          <span>Elige tus intereses o crea etiquetas:</span>
          <b style="color:var(--primary);">${tags.length}/12</b>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:0.42rem;">
          ${SUGGESTED_TAGS.map(t => {
            const on = tags.includes(t);
            return `<button type="button" class="rpf-tag-pick ${on ? 'on' : ''}" data-pick-tag="${esc(t)}">${esc(t)}</button>`;
          }).join('')}
          ${tags.filter(t => !SUGGESTED_TAGS.includes(t)).map(t =>
            `<button type="button" class="rpf-tag-pick on" data-pick-tag="${esc(t)}">${esc(t)} ✕</button>`
          ).join('')}
        </div>
        <div style="display:flex;gap:0.45rem;">
          <input type="text" id="rpf-custom-tag" class="form-input" maxlength="24" placeholder="Otra etiqueta (ej. Rockero)…" style="flex:1;">
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-add-tag">+ Añadir</button>
        </div>
        <div class="rpf-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-tags-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="rpf-tags-save">Guardar</button>
        </div>
      </div>`;

    const commitPendingTag = () => {
      const inp = box.querySelector('#rpf-custom-tag');
      const v = inp?.value.trim();
      if (!v) return false;
      if (tags.length >= 12) {
        UI.showToast('Máximo 12 etiquetas.', 'info');
        return false;
      }
      if (!tags.includes(v)) tags.push(v);
      return true;
    };

    box.querySelectorAll('[data-pick-tag]').forEach(b => b.addEventListener('click', () => {
      const val = b.getAttribute('data-pick-tag');
      if (tags.includes(val)) {
        tags = tags.filter(x => x !== val);
      } else if (tags.length < 12) {
        tags = [...tags, val];
      } else {
        UI.showToast('Máximo 12 etiquetas.', 'info');
      }
      renderBody();
    }));

    box.querySelector('#rpf-add-tag')?.addEventListener('click', () => {
      if (commitPendingTag()) renderBody();
    });
    box.querySelector('#rpf-custom-tag')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (commitPendingTag()) renderBody();
      }
    });

    box.querySelector('#rpf-tags-cancel')?.addEventListener('click', () => UI.closeModal());
    box.querySelector('#rpf-tags-save')?.addEventListener('click', () => {
      commitPendingTag();
      store.updateCurrentUser({ aboutTags: tags });
      UI.closeModal();
      UI.showToast('Etiquetas guardadas ✨', 'success');
    });
  };

  UI.openModal({
    title: 'Sobre mí · Etiquetas',
    contentHtml: `<div id="rpf-tags-modal"></div>`,
    onMount: renderBody
  });
}

// ============================================================================
// ENLACES (Corregido: acepta URL o @usuario y guarda aunque se pulse Guardar directo)
// ============================================================================
function openLinksModal(user) {
  let links = toArray(user.links).map(l => ({ ...l }));
  let selectedPlatform = 'instagram';

  const renderBody = () => {
    const box = document.getElementById('rpf-links-modal');
    if (!box) return;
    const platMeta = LINK_PLATFORMS.find(p => p.id === selectedPlatform) || LINK_PLATFORMS[0];

    box.innerHTML = `
      <form id="rpf-links-form" style="display:flex;flex-direction:column;gap:0.85rem;">
        ${links.length === 0 ? `
          <div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:0.5rem;border-radius:0.75rem;background:var(--surface-secondary);">
            Aún no tienes enlaces. Agrega uno abajo (URL o @usuario).
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:0.45rem;max-height:28dvh;overflow-y:auto;">
            ${links.map((l, idx) => {
              const m = LINK_PLATFORMS.find(p => p.id === l.platform) || LINK_PLATFORMS[LINK_PLATFORMS.length - 1];
              return `
                <div class="rpf-lk-row">
                  <span class="rpf-link-ico" style="width:1.9rem;height:1.9rem;" aria-hidden="true">${renderPlatformBadge(m)}</span>
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:0.84rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(l.label || m.label)}</div>
                    <div style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(prettyUrlSubtitle(l.url))}</div>
                  </div>
                  <button type="button" class="rpf-lk-del" data-del-link="${idx}" aria-label="Eliminar enlace">✕</button>
                </div>`;
            }).join('')}
          </div>
        `}

        <div style="display:flex;flex-direction:column;gap:0.55rem;padding-top:0.65rem;border-top:1px solid var(--border);">
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="rpf-lk-plat">Plataforma</label>
            <select id="rpf-lk-plat" class="form-select">
              ${LINK_PLATFORMS.map(p => `<option value="${p.id}" ${p.id === selectedPlatform ? 'selected' : ''}>${p.icon} ${p.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="rpf-lk-url">Enlace o @usuario</label>
            <input type="text" id="rpf-lk-url" class="form-input" placeholder="${esc(platMeta.placeholder)}" autocomplete="off" autocapitalize="none" spellcheck="false">
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" for="rpf-lk-label">Nombre visible (opcional)</label>
            <input type="text" id="rpf-lk-label" class="form-input" maxlength="28" placeholder="Ej. Mi ${esc(platMeta.label)}">
          </div>
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-lk-add" style="width:100%;min-height:38px;">+ Añadir otro enlace a la lista</button>
        </div>

        <div class="rpf-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rpf-lk-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm" id="rpf-lk-save">Guardar enlaces</button>
        </div>
      </form>`;

    const readPendingLink = () => {
      const plat = box.querySelector('#rpf-lk-plat')?.value || selectedPlatform;
      const rawUrl = box.querySelector('#rpf-lk-url')?.value.trim() || '';
      const label = box.querySelector('#rpf-lk-label')?.value.trim() || '';
      if (!rawUrl) return null;
      const url = normalizeLinkUrl(plat, rawUrl);
      if (!url) return null;
      const m = LINK_PLATFORMS.find(p => p.id === plat) || LINK_PLATFORMS[LINK_PLATFORMS.length - 1];
      return { platform: plat, label: label || m.label, url };
    };

    box.querySelector('#rpf-lk-plat')?.addEventListener('change', (e) => {
      selectedPlatform = e.target.value;
      const m = LINK_PLATFORMS.find(p => p.id === selectedPlatform) || LINK_PLATFORMS[0];
      const urlInp = box.querySelector('#rpf-lk-url');
      const lblInp = box.querySelector('#rpf-lk-label');
      if (urlInp) urlInp.placeholder = m.placeholder;
      if (lblInp) lblInp.placeholder = `Ej. Mi ${m.label}`;
    });

    box.querySelectorAll('[data-del-link]').forEach(b => b.addEventListener('click', () => {
      links.splice(Number(b.getAttribute('data-del-link')), 1);
      renderBody();
    }));

    box.querySelector('#rpf-lk-add')?.addEventListener('click', () => {
      const item = readPendingLink();
      if (!item) {
        UI.showToast('Escribe una URL o @usuario antes de añadir.', 'info');
        box.querySelector('#rpf-lk-url')?.focus();
        return;
      }
      if (links.length >= 10) {
        UI.showToast('Máximo 10 enlaces en el perfil.', 'info');
        return;
      }
      links.push(item);
      UI.showToast(`Enlace de ${item.label} añadido a la lista`, 'success');
      renderBody();
    });

    box.querySelector('#rpf-lk-cancel')?.addEventListener('click', () => UI.closeModal());

    box.querySelector('#rpf-links-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      // Si el usuario escribió un enlace y pulsó directamente "Guardar enlaces", incluirlo automáticamente
      const pending = readPendingLink();
      if (pending && links.length < 10) {
        links.push(pending);
      }
      store.updateCurrentUser({ links });
      UI.closeModal();
      UI.showToast(links.length > 0 ? 'Enlaces guardados 🔗' : 'Enlaces actualizados', 'success');
    });
  };

  UI.openModal({
    title: 'Mis Enlaces',
    contentHtml: `<div id="rpf-links-modal"></div>`,
    onMount: renderBody
  });
}
