// Home del grupo: "Explora tu grupo" (accesos a secciones) + "Actividad del grupo".
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';

const svg = (inner) => `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS = {
  memories: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  movies: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m3 7 3-4h4L7 7m3 0 3-4h4l-3 4m3 0 3-4"/>',
  series: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m8 3 4 4 4-4"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  books: '<path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H12v17H4.5A2.5 2.5 0 0 0 2 22V5.5Z"/><path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H12v17h7.5a2.5 2.5 0 0 1 2.5 2V5.5Z"/>',
  goals_notes: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><path d="m15.5 8.5 4.5-4.5M17 4h3v3"/>',
  join: '<circle cx="10" cy="8" r="3.2"/><path d="M4 20c0-3.3 2.7-6 6-6s6 2.7 6 6M19 8v6M16 11h6"/>'
};

const EXPLORE = [
  { tab: 'memories', title: 'Recuerdos', sub: 'Fotos, videos y momentos compartidos' },
  { tab: 'movies', title: 'Películas', sub: 'Catálogo de películas del grupo' },
  { tab: 'series', title: 'Series', sub: 'Series que seguimos juntos' },
  { tab: 'music', title: 'Música', sub: 'Canciones y playlists del grupo' },
  { tab: 'books', title: 'Libros', sub: 'Libros que leemos y recomendamos' },
  { tab: 'goals_notes', title: 'Objetivos', sub: 'Actividades, metas y notas' }
];

const ACT_META = {
  song: { icon: 'music', cls: 'a-song', text: 'añadió una canción' },
  movie: { icon: 'movies', cls: 'a-movie', text: 'agregó una película' },
  series: { icon: 'series', cls: 'a-series', text: 'agregó una serie' },
  book: { icon: 'books', cls: 'a-series', text: 'añadió un libro' },
  activity: { icon: 'goals_notes', cls: 'a-memory', text: 'creó una actividad' },
  goal: { icon: 'goals_notes', cls: 'a-memory', text: 'creó una meta' },
  note: { icon: 'goals_notes', cls: 'a-memory', text: 'publicó una nota' },
  memory: { icon: 'memories', cls: 'a-memory', text: 'subió un recuerdo' },
  join: { icon: 'join', cls: 'a-join', text: 'se unió al grupo' }
};

export function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'Ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `Hace ${d} ${d === 1 ? 'día' : 'días'}`;
  return new Date(iso).toLocaleDateString('es');
}

function activityRowHtml(a, group) {
  const meta = ACT_META[a.type] || ACT_META.memory;
  const isJoin = a.type === 'join';
  const member = (group?.members || []).find(m => m.id === a.userId);
  const avatarSrc = member?.avatar || a.userAvatar || 'assets/ruma_default_avatar.png';
  return `
    <li class="rg-act-row">
      <span class="rg-act-ico ${meta.cls}">${svg(ICONS[meta.icon])}</span>
      <img class="rg-act-avatar" src="${Utils.sanitize(avatarSrc)}" alt="">
      <div class="rg-act-text">
        <div class="rg-act-title"><b>${Utils.sanitize(member?.name || a.userName || 'Alguien')}</b> ${meta.text}</div>
        ${!isJoin && a.detail ? `<div class="rg-act-sub">${Utils.sanitize(a.detail)}</div>` : ''}
      </div>
      <span class="rg-act-time">${timeAgo(a.at)}</span>
    </li>`;
}

function sortedActivity(group) {
  return (group.activity || []).slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

export function groupHomeHtml(group) {
  const all = sortedActivity(group);
  const recent = all.slice(0, 4);
  return `
    <h2 class="rg-section-title">
      <span class="rg-section-ico">${svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>')}</span>
      Explora tu grupo
    </h2>
    <div class="rg-explore">
      ${EXPLORE.map(e => `
        <button type="button" class="rg-explore-card" data-group-tab="${e.tab}">
          <span class="rg-explore-ico">${svg(ICONS[e.tab])}</span>
          <span class="rg-explore-text"><b>${e.title}</b><small>${e.sub}</small></span>
          <span class="rg-explore-chev" aria-hidden="true">›</span>
        </button>`).join('')}
    </div>

    <section class="rg-card rg-activity">
      <div class="rg-activity-head">
        <h2><span class="rg-bell">🔔</span> Actividad del grupo</h2>
        ${all.length > 0 ? `<button type="button" class="rg-pill" id="rg-act-all">Ver todo ›</button>` : ''}
      </div>
      ${recent.length === 0
        ? `<div class="rg-act-empty"><b>Aún no hay actividad</b><span>Aquí verás las novedades del grupo cuando comiencen a ocurrir.</span></div>`
        : `<ul class="rg-act-list">${recent.map(a => activityRowHtml(a, group)).join('')}</ul>`}
    </section>`;
}

export function bindGroupHome(container, group) {
  container.querySelector('#rg-act-all')?.addEventListener('click', () => {
    const all = sortedActivity(group);
    UI.openModal({
      title: 'Toda la actividad',
      size: 'md',
      contentHtml: `<ul class="rg-act-list rg-act-list-full">${all.map(a => activityRowHtml(a, group)).join('')}</ul>`
    });
  });
}
