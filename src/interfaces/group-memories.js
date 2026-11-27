// Vista modular de Recuerdos del Grupo (Banner, Calendario interactivo, Línea de Tiempo, Filtros y Menú "⋯")
import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { GoogleAuth } from '../services/google-auth.js';
import { DriveBridge } from '../services/drive-bridge.js';
import { MusicService } from '../services/music-service.js';

const MONTH_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTH_CAP = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const svg = (inner, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  filter: '<path d="M4 5h16l-6.5 7.5V19l-3 1.5v-8L4 5z"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  msg: '<path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>'
};

function parseYmd(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
  const dt = new Date(dateStr || Date.now());
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

function fmtLongDate(dateStr) {
  const { y, m, d } = parseYmd(dateStr);
  return `${d} de ${(MONTH_FULL[m] || '').toLowerCase()} de ${y}`;
}

export function renderGroupMemoriesView(viewport, group, user, isAdmin, ctx) {
  const {
    memFilterState,
    getHolidaysForYear,
    openUploadMemoryModal,
    openMemoryDetailModal,
    openAddPlanModal,
    onQuoteMemory,
    rerender
  } = ctx;

  const allMemories = group.memories || [];
  const plans = group.plans || [];
  let memories = [...allMemories];

  if (Array.isArray(store.memoryFilterIds) && store.memoryFilterIds.length > 0) {
    memories = memories.filter(m => store.memoryFilterIds.includes(m.id));
  }

  const q = (memFilterState.search || '').trim().toLowerCase();
  if (q) {
    memories = memories.filter(m => {
      const inTitle = (m.title || '').toLowerCase().includes(q);
      const inDesc = (m.description || '').toLowerCase().includes(q);
      const inLoc = (m.location || '').toLowerCase().includes(q);
      const inAuthor = (m.authorName || '').toLowerCase().includes(q);
      const inSong = m.song ? `${m.song.title || ''} ${m.song.artist || ''}`.toLowerCase().includes(q) : false;
      return inTitle || inDesc || inLoc || inAuthor || inSong;
    });
  }

  const cat = memFilterState.category || 'recent';
  if (cat === 'featured') memories = memories.filter(m => m.isFeatured);
  else if (cat === 'photos') memories = memories.filter(m => (m.photos && m.photos.length > 0) || m.coverPreview);
  else if (cat === 'videos') memories = memories.filter(m => m.isVideo || (m.files || []).some(f => f.isVideo));
  else if (cat === 'songs') memories = memories.filter(m => m.song && m.song.title);
  else if (cat === 'audios') memories = memories.filter(m => Boolean(m.voiceNote));

  memories.sort((a, b) => {
    const tA = new Date(a.date || a.createdAt || 0).getTime();
    const tB = new Date(b.date || b.createdAt || 0).getTime();
    return cat === 'oldest' ? tA - tB : tB - tA;
  });

  // Miniaturas para el abanico del banner
  const thumbs = allMemories.map(m => m.coverPreview).filter(Boolean).slice(0, 3);
  const stackImg = thumbs[0] || 'assets/ruma_default_avatar.png';

  const year = memFilterState.calYear;
  const month = memFilterState.calMonth;
  const selectedDay = memFilterState.calSelectedDay;
  const holidays = getHolidaysForYear(year);
  const monthHolidays = holidays.filter(h => h.month === month);
  const firstDay = new Date(year, month, 1);
  const startDayIdx = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const nowLocal = new Date();
  const todayStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

  let cellsHtml = '';
  for (let i = 0; i < startDayIdx; i++) {
    cellsHtml += `<div class="rm-day empty"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isSel = d === selectedDay;
    const holiday = holidays.find(h => h.month === month && h.day === d);
    const hasMem = allMemories.some(m => m.date === dateStr);
    const hasPlan = plans.some(p => p.date === dateStr);

    cellsHtml += `
      <button type="button" class="rm-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}" data-rm-day="${d}" data-rm-date="${dateStr}">
        <span>${d}</span>
        <span class="rm-dots">
          ${holiday ? `<i class="rm-dot holiday"></i>` : ''}
          ${hasPlan ? `<i class="rm-dot plan"></i>` : ''}
          ${hasMem ? `<i class="rm-dot memory"></i>` : ''}
        </span>
      </button>`;
  }

  const hasActiveFilter = Boolean(q) || (cat && cat !== 'recent') || Boolean(store.memoryFilterIds);

  viewport.innerHTML = `
    <div class="rm-wrap">
      <!-- Banner Recuerdos -->
      <section class="rg-card rm-banner">
        <div class="rm-banner-left">
          <div class="rm-banner-ico">${svg(ICO.photo, 26)}</div>
          <div class="rm-banner-txt">
            <h1>Recuerdos</h1>
            <p>${Utils.sanitize(group.name)}</p>
          </div>
        </div>
        <div class="rm-stack" aria-hidden="true">
          <span class="rm-stack-card c3"></span>
          <span class="rm-stack-card c2"></span>
          <span class="rm-stack-card c1" style="background-image:url('${Utils.sanitize(Utils.safeUrl(stackImg, 'assets/ruma_default_avatar.png'))}')"></span>
        </div>
      </section>

      <!-- Calendario Mensual -->
      <section class="rg-card rm-cal">
        <div class="rm-cal-top">
          <button type="button" class="rm-nav-circle" id="rm-cal-prev" aria-label="Mes anterior">◀</button>
          <button type="button" class="rm-month-pill" id="rm-cal-picker">
            ${svg(ICO.cal, 16)}
            <span>${MONTH_FULL[month]} ${year}</span>
            <small>⌄</small>
          </button>
          <div class="rm-cal-right">
            <button type="button" class="rm-nav-circle" id="rm-cal-next" aria-label="Mes siguiente">▶</button>
            <button type="button" class="rm-today-btn" id="rm-cal-today">Hoy</button>
          </div>
        </div>

        <div class="rm-weekdays">
          <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>
        </div>
        <div class="rm-grid">${cellsHtml}</div>

        <button type="button" class="rm-holidays-bar" id="rm-holidays-btn">
          <span>🎉 <b>Festivos del mes</b> ${monthHolidays.length ? `<small>(${monthHolidays.length})</small>` : ''}</span>
          <span class="rm-chev">›</span>
        </button>
      </section>

      <!-- CTA Principal -->
      <button type="button" class="rm-add-cta" id="rm-add-memory">
        <span class="rm-plus">+</span>
        ${svg(ICO.camera, 22)}
        <span>Añadir Recuerdo</span>
      </button>

      <!-- Línea de Tiempo -->
      <section class="rm-timeline-sec">
        <div class="rm-tl-head">
          <span class="rm-tl-clock">${svg(ICO.clock, 22)}</span>
          <div class="rm-tl-titles">
            <h2>Línea de Tiempo</h2>
            <p>${hasActiveFilter ? 'Filtro activo · toca el embudo para ajustar' : 'Del 1 de enero hasta hoy.'}</p>
          </div>
          <button type="button" class="rm-filter-btn ${hasActiveFilter ? 'active' : ''}" id="rm-filter-btn" aria-label="Filtrar recuerdos">
            ${svg(ICO.filter, 18)}
          </button>
        </div>

        ${memories.length === 0 ? `
          <div class="rg-card rm-empty">
            <b>${q || hasActiveFilter ? 'Ningún recuerdo coincide con el filtro' : 'Aún no hay recuerdos'}</b>
            <span>${q || hasActiveFilter ? 'Prueba cambiando la búsqueda o limpiando los filtros.' : 'Guarda la primera salida, foto o momento del grupo.'}</span>
            ${hasActiveFilter ? `<button type="button" class="rg-pill" id="rm-clear-filters">Limpiar filtros</button>` : ''}
          </div>
        ` : `
          <div class="rm-timeline">
            ${memories.map(mem => {
              const { y, m } = parseYmd(mem.date || mem.createdAt);
              const photosCount = (mem.photos && mem.photos.length) || mem.filesCount || 1;
              const commentsCount = (mem.comments && mem.comments.length) || 0;
              const hasSong = Boolean(mem.song && mem.song.title);
              const hasVoice = Boolean(mem.voiceNote);
              const thumb = mem.coverPreview || 'assets/ruma_default_avatar.png';
              return `
                <article class="rm-tl-item" id="memory-card-${Utils.sanitize(mem.id)}">
                  <span class="rm-tl-node" aria-hidden="true"></span>
                  <div class="rm-tl-month">
                    <b>${MONTH_SHORT[m] || 'MES'}</b>
                    <small>${y}</small>
                  </div>
                  <div class="rm-tl-card" data-open-mem="${Utils.sanitize(mem.id)}">
                    <img class="rm-tl-thumb" src="${Utils.sanitize(thumb)}" alt="">
                    <div class="rm-tl-body">
                      <div class="rm-tl-top">
                        <h3>${mem.isFeatured ? '⭐ ' : ''}${Utils.sanitize(mem.title)}</h3>
                        <button type="button" class="rm-tl-more" data-more-mem="${Utils.sanitize(mem.id)}" aria-label="Opciones">⋯</button>
                      </div>
                      <div class="rm-tl-stats">
                        <span>${svg(ICO.camera, 14)} ${photosCount}</span>
                        ${hasSong ? `<span data-play-song="${Utils.sanitize(mem.id)}" title="Toca para escuchar: ${Utils.sanitize(mem.song.title)} - ${Utils.sanitize(mem.song.artist || '')}" style="display:inline-flex;align-items:center;gap:0.25rem;color:var(--brand-lilac-soft);font-weight:700;max-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;">${svg(ICO.music, 14)} ${Utils.sanitize(mem.song.title)}</span>` : ''}
                        ${hasVoice ? `<span>${svg(ICO.mic, 14)} Voz</span>` : ''}
                        <span>${svg(ICO.msg, 14)} ${commentsCount}</span>
                      </div>
                      <div class="rm-tl-date">${svg(ICO.cal, 14)} <span>${Utils.sanitize(fmtLongDate(mem.date || mem.createdAt))}</span></div>
                    </div>
                  </div>
                </article>`;
            }).join('')}
          </div>
        `}
      </section>
    </div>
  `;

  // Navegación del calendario
  viewport.querySelector('#rm-cal-prev')?.addEventListener('click', () => {
    if (memFilterState.calMonth === 0) { memFilterState.calMonth = 11; memFilterState.calYear -= 1; }
    else memFilterState.calMonth -= 1;
    memFilterState.calSelectedDay = 1;
    rerender();
  });
  viewport.querySelector('#rm-cal-next')?.addEventListener('click', () => {
    if (memFilterState.calMonth === 11) { memFilterState.calMonth = 0; memFilterState.calYear += 1; }
    else memFilterState.calMonth += 1;
    memFilterState.calSelectedDay = 1;
    rerender();
  });
  viewport.querySelector('#rm-cal-today')?.addEventListener('click', () => {
    const now = new Date();
    memFilterState.calYear = now.getFullYear();
    memFilterState.calMonth = now.getMonth();
    memFilterState.calSelectedDay = now.getDate();
    rerender();
  });

  const isCreator = group?.creatorId === user?.id;

  // Selector rápido de Mes / Año
  viewport.querySelector('#rm-cal-picker')?.addEventListener('click', () => {
    UI.openModal({
      title: 'Elegir mes y año',
      contentHtml: `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;">
          <button type="button" class="btn btn-secondary btn-sm" id="pk-yr-prev">◀ ${year - 1}</button>
          <strong style="font-size:1.1rem;">${year}</strong>
          <button type="button" class="btn btn-secondary btn-sm" id="pk-yr-next">${year + 1} ▶</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;">
          ${MONTH_FULL.map((mName, idx) => `
            <button type="button" class="btn ${idx === month ? 'btn-primary' : 'btn-secondary'} btn-sm" data-pk-m="${idx}">${mName}</button>
          `).join('')}
        </div>
        ${isCreator ? `
        <div style="margin-top:.9rem;padding-top:.8rem;border-top:1px solid var(--border-subtle);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.8rem;color:var(--text-secondary);">Google Drive del grupo (Ajustes)</span>
          <button type="button" class="btn btn-secondary btn-sm" id="pk-drive">⚙️ Ir a Ajustes</button>
        </div>` : ''}`,
      onMount: () => {
        document.getElementById('pk-yr-prev')?.addEventListener('click', () => { memFilterState.calYear -= 1; UI.closeModal(); rerender(); });
        document.getElementById('pk-yr-next')?.addEventListener('click', () => { memFilterState.calYear += 1; UI.closeModal(); rerender(); });
        document.querySelectorAll('[data-pk-m]').forEach(b => b.addEventListener('click', () => {
          memFilterState.calMonth = +b.getAttribute('data-pk-m');
          memFilterState.calSelectedDay = 1;
          UI.closeModal();
          rerender();
        }));
        if (isCreator) {
          document.getElementById('pk-drive')?.addEventListener('click', () => {
            UI.closeModal();
            store.navigate('settings');
          });
        }
      }
    });
  });

  // Tocar un día -> Modal del día (recuerdos, planes futuros, festivo y acciones)
  viewport.querySelectorAll('[data-rm-day]').forEach(btn => {
    btn.addEventListener('click', () => {
      const d = +btn.getAttribute('data-rm-day');
      const dateStr = btn.getAttribute('data-rm-date');
      memFilterState.calSelectedDay = d;
      rerender();
      openDayModal(dateStr, d);
    });
  });

  function openDayModal(dateStr, d) {
    const holiday = holidays.find(h => h.month === month && h.day === d);
    const dayMems = allMemories.filter(m => m.date === dateStr);
    const dayPlans = plans.filter(p => p.date === dateStr);
    const isFuture = dateStr > todayStr;
    const isPast = dateStr < todayStr;

    UI.openModal({
      title: `📅 ${fmtLongDate(dateStr)}`,
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.75rem;">
          ${holiday ? `<div class="rg-badge" style="align-self:flex-start;background:rgba(16,185,129,.18);color:#6ee7a0;">🎉 Festivo: ${Utils.sanitize(holiday.name)}</div>` : ''}
          ${dayMems.length > 0 ? `
            <div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.35rem;">Recuerdos de este día</div>
              ${dayMems.map(m => `
                <button type="button" class="rm-day-row" data-day-open-mem="${Utils.sanitize(m.id)}">
                  <img src="${Utils.sanitize(m.coverPreview || 'assets/ruma_default_avatar.png')}" alt="">
                  <span><b>${Utils.sanitize(m.title)}</b><small>${Utils.sanitize(m.location || 'Ver álbum completo')}</small></span>
                  <span>›</span>
                </button>`).join('')}
            </div>` : ''}
          ${dayPlans.length > 0 ? `
            <div>
              <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.35rem;">Planes agendados</div>
              ${dayPlans.map(p => `
                <div class="rm-day-row">
                  <span>🗓️</span>
                  <span><b>${Utils.sanitize(p.title)}</b><small>${Utils.sanitize(p.time || '')} ${Utils.sanitize(p.note || '')}</small></span>
                </div>`).join('')}
            </div>` : ''}
          ${dayMems.length === 0 && dayPlans.length === 0 ? `<p style="color:var(--text-secondary);font-size:.88rem;margin:0;">No hay recuerdos ni planes registrados en esta fecha.</p>` : ''}
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:flex-end;margin-top:.3rem;">
            ${!isFuture ? `<button type="button" class="btn btn-primary btn-sm" id="day-add-mem">+ Añadir Recuerdo aquí</button>` : ''}
            ${!isPast ? `<button type="button" class="btn ${isFuture ? 'btn-primary' : 'btn-secondary'} btn-sm" id="day-add-plan">+ Agendar Plan 🗓️</button>` : ''}
          </div>
        </div>`,
      onMount: () => {
        document.querySelectorAll('[data-day-open-mem]').forEach(b => b.addEventListener('click', () => {
          const mem = allMemories.find(m => m.id === b.getAttribute('data-day-open-mem'));
          UI.closeModal();
          if (mem) openMemoryDetailModal(group, mem, user);
        }));
        document.getElementById('day-add-mem')?.addEventListener('click', () => {
          UI.closeModal();
          openUploadMemoryModal(group, null, dateStr, isCreator);
        });
        document.getElementById('day-add-plan')?.addEventListener('click', () => {
          UI.closeModal();
          openAddPlanModal(dateStr, rerender);
        });
      }
    });
  }

  // Barra de festivos del mes
  viewport.querySelector('#rm-holidays-btn')?.addEventListener('click', () => {
    UI.openModal({
      title: `🎉 Festivos de ${MONTH_FULL[month]} ${year}`,
      contentHtml: monthHolidays.length === 0
        ? `<p style="color:var(--text-secondary);font-size:.9rem;">No hay días festivos registrados en ${MONTH_FULL[month]}.</p>`
        : `<div style="display:flex;flex-direction:column;gap:.5rem;">
            ${monthHolidays.map(h => {
              const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`;
              return `<button type="button" class="rm-day-row" data-hol-day="${h.day}" data-hol-date="${dStr}">
                <span style="font-weight:800;color:#6ee7a0;">${h.day} ${MONTH_CAP[month]}</span>
                <span><b>${Utils.sanitize(h.name)}</b></span>
                <span>›</span>
              </button>`;
            }).join('')}
          </div>`,
      onMount: () => {
        document.querySelectorAll('[data-hol-day]').forEach(b => b.addEventListener('click', () => {
          const d = +b.getAttribute('data-hol-day');
          const dStr = b.getAttribute('data-hol-date');
          memFilterState.calSelectedDay = d;
          UI.closeModal();
          rerender();
          openDayModal(dStr, d);
        }));
      }
    });
  });

  // Botón principal "+ Añadir Recuerdo"
  viewport.querySelector('#rm-add-memory')?.addEventListener('click', () => {
    openUploadMemoryModal(group, null, null, isCreator);
  });

  // Limpiar filtros
  viewport.querySelector('#rm-clear-filters')?.addEventListener('click', () => {
    memFilterState.search = '';
    memFilterState.category = 'recent';
    store.memoryFilterIds = null;
    rerender();
  });

  // Modal de búsqueda y filtros (embudo)
  viewport.querySelector('#rm-filter-btn')?.addEventListener('click', () => {
    const opts = [
      ['recent', '🕒 Más recientes primero'],
      ['oldest', '⏳ Más antiguos primero'],
      ['featured', '⭐ Solo destacados'],
      ['photos', '📷 Con fotos / álbum'],
      ['videos', '🎬 Con videos'],
      ['songs', '🎵 Con canción vinculada'],
      ['audios', '🎙️ Con nota de voz']
    ];
    UI.openModal({
      title: 'Filtrar Línea de Tiempo',
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.75rem;">
          <input type="text" id="rm-f-q" class="form-input" placeholder="🔍 Buscar por título, lugar, canción o autor..." value="${Utils.sanitize(memFilterState.search || '')}">
          <div style="display:flex;flex-direction:column;gap:.4rem;">
            ${opts.map(([id, label]) => `
              <button type="button" class="btn ${cat === id ? 'btn-primary' : 'btn-secondary'} btn-sm" style="justify-content:flex-start;" data-f-cat="${id}">${label}</button>
            `).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;gap:.5rem;margin-top:.3rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="rm-f-reset">Limpiar</button>
            <button type="button" class="btn btn-primary btn-sm" id="rm-f-apply">Aplicar</button>
          </div>
        </div>`,
      onMount: () => {
        document.querySelectorAll('[data-f-cat]').forEach(b => b.addEventListener('click', () => {
          memFilterState.category = b.getAttribute('data-f-cat');
          memFilterState.search = document.getElementById('rm-f-q')?.value || '';
          UI.closeModal();
          rerender();
        }));
        document.getElementById('rm-f-reset')?.addEventListener('click', () => {
          memFilterState.search = '';
          memFilterState.category = 'recent';
          store.memoryFilterIds = null;
          UI.closeModal();
          rerender();
        });
        document.getElementById('rm-f-apply')?.addEventListener('click', () => {
          memFilterState.search = document.getElementById('rm-f-q')?.value || '';
          UI.closeModal();
          rerender();
        });
      }
    });
  });

  // Abrir detalle al tocar tarjeta
  viewport.querySelectorAll('[data-open-mem]').forEach(card => {
    card.addEventListener('click', () => {
      const mem = allMemories.find(m => m.id === card.getAttribute('data-open-mem'));
      if (mem) openMemoryDetailModal(group, mem, user);
    });
  });

  // Reproducir canción desde el chip
  viewport.querySelectorAll('[data-play-song]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const mem = allMemories.find(m => m.id === el.getAttribute('data-play-song'));
      if (!mem?.song) return;
      const res = await MusicService.playTrackOrResolve(mem.song);
      if (!res?.ok && res?.error) {
        UI.showToast(res.error, 'info');
      }
    });
  });

  // Menú "⋯" de cada tarjeta de recuerdo
  viewport.querySelectorAll('[data-more-mem]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mem = allMemories.find(m => m.id === btn.getAttribute('data-more-mem'));
      if (!mem) return;
      const isSynced = mem.driveSyncStatus === 'synced' || (mem.driveUrl && DriveBridge.isRealFolderConfigured(mem.driveUrl));
      const safeDriveUrl = Utils.safeUrl(mem.driveUrl, '');
      const canDelete = store.canDeleteMemory(group, mem, user);

      UI.openModal({
        title: mem.title,
        contentHtml: `
          <div style="display:flex;flex-direction:column;gap:.55rem;">
            <button type="button" class="btn btn-secondary" id="mm-view">👁️ Ver álbum y comentarios</button>
            <button type="button" class="btn btn-secondary" id="mm-edit">✏️ Editar recuerdo</button>
            <button type="button" class="btn btn-secondary" id="mm-feat">${mem.isFeatured ? '⭐ Quitar de destacados' : '⭐ Marcar como destacado'}</button>
            <button type="button" class="btn btn-secondary" id="mm-quote">💬 Citar en el chat</button>
            ${isSynced && safeDriveUrl
              ? `<a href="${Utils.sanitize(safeDriveUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="text-align:center;">☁️ Abrir en Google Drive ↗</a>`
              : (isCreator ? `<button type="button" class="btn btn-secondary" id="mm-drive">☁️ Subir a Google Drive</button>` : '')}
            ${canDelete ? `<button type="button" class="btn" id="mm-del" style="background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.5);color:var(--error);">🗑️ Eliminar recuerdo</button>` : ''}
          </div>`,
        onMount: () => {
          document.getElementById('mm-view')?.addEventListener('click', () => { UI.closeModal(); openMemoryDetailModal(group, mem, user); });
          document.getElementById('mm-edit')?.addEventListener('click', () => { UI.closeModal(); openUploadMemoryModal(group, mem, null, isCreator); });
          document.getElementById('mm-feat')?.addEventListener('click', () => {
            store.toggleMemoryFeatured(mem.id);
            UI.closeModal();
            rerender();
          });
          document.getElementById('mm-quote')?.addEventListener('click', () => {
            UI.closeModal();
            onQuoteMemory(mem);
          });
          document.getElementById('mm-drive')?.addEventListener('click', () => {
            UI.closeModal();
            if (!isCreator) {
              UI.showToast('Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar y sincronizar con Google Drive 👑', 'info');
              return;
            }
            if (!GoogleAuth.hasDriveAccess()) {
              if (GoogleAuth.hasValidClientId(group)) {
                GoogleAuth.requestDriveAccess('', group)
                  .then((session) => {
                    store.updateCurrentUser({
                      googleDriveSynced: true,
                      googleEmail: session.email || user?.email || ''
                    });
                    store.enqueueMemoryDriveUpload(mem.id, group.id);
                    UI.showToast(`☁️ Subiendo "${mem.title}" en segundo plano · Puedes seguir navegando`, 'info');
                  })
                  .catch(() => {
                    store.navigate('settings');
                    UI.showToast('Sincroniza tu cuenta con Google en ⚙️ Ajustes para subir recuerdos a Ruma 🌷', 'info');
                  });
                return;
              }
              store.navigate('settings');
              UI.showToast('Sincroniza tu cuenta con Google en ⚙️ Ajustes para subir recuerdos a Ruma 🌷', 'info');
              return;
            }
            store.enqueueMemoryDriveUpload(mem.id, group.id);
            UI.showToast(`☁️ Subiendo "${mem.title}" en segundo plano · Puedes seguir navegando`, 'info');
          });
          document.getElementById('mm-del')?.addEventListener('click', () => {
            const res = store.deleteMemoryFromActiveGroup(mem.id);
            UI.closeModal();
            UI.showToast(res?.ok ? 'Recuerdo eliminado 🗑️' : (res?.error || 'No tienes permiso para eliminar este recuerdo.'), res?.ok ? 'info' : 'error');
          });
        }
      });
    });
  });
}
