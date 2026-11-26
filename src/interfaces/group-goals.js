// Vista integral rediseñada de Objetivos del Grupo
// 3 pestañas independientes: Metas · Actividades (principal) · Notas
// Mobile-first · Identidad oscura violeta-magenta de Ruma
import '../styles/goals.css';
import { fireConfetti } from '../core/confetti.js';
import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { timeAgo } from './group-home.js';

const esc = v => Utils.sanitize(v);
const DEFAULT_AVATAR = 'assets/ruma_default_avatar.png';

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><path d="m15.5 8.5 4.5-4.5M17 4h3v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  chevRight: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16h14v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76Z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.5-5.5 6-5.5s6 2.5 6 5.5"/><path d="M16 5.5a3 3 0 0 1 0 5"/><path d="M18 14.5c1.8.8 3 2.5 3 4.5"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>'
};

const ACTIVITY_STATUSES = [
  { id: 'Planeando', label: 'Planeando', cls: 'st-planning', order: 2 },
  { id: 'Confirmada', label: 'Confirmada', cls: 'st-confirmed', order: 1 },
  { id: 'En curso', label: 'En curso', cls: 'st-ongoing', order: 0 },
  { id: 'Completada', label: 'Completada', cls: 'st-done', order: 3 }
];

const ACTIVITY_ICONS = ['🎬', '✈️', '🍽️', '🎂', '🎉', '⚽', '🏕️', '☕', '🎵', '🎮', '🏖️', '🎲'];

const ACTIVITY_TEMPLATES = [
  { icon: '🎬', label: 'Ir al cine', placeholder: 'Cine – ' },
  { icon: '✈️', label: 'Viaje', placeholder: 'Viaje a ' },
  { icon: '🍽️', label: 'Salida a comer', placeholder: 'Cena en ' },
  { icon: '🎂', label: 'Cumpleaños', placeholder: 'Cumpleaños de ' },
  { icon: '🎉', label: 'Reunión', placeholder: 'Reunión del grupo' },
  { icon: '⚽', label: 'Deporte', placeholder: 'Partido de ' }
];

const GOAL_ICONS = ['🎯', '✈️', '💰', '🚀', '🏠', '🌟', '📚', '💪', '🎸', '🎓', '🌍', '🏆'];
const GOAL_CATEGORIES = ['Viajes', 'Ahorro', 'Proyecto', 'Experiencia', 'Reto', 'General'];
const GOAL_TEMPLATES = [
  { icon: '💰', category: 'Ahorro', label: 'Ahorrar para un viaje', title: 'Ahorrar para un viaje juntos' },
  { icon: '🚀', category: 'Proyecto', label: 'Crear un proyecto', title: '' },
  { icon: '🌟', category: 'Reto', label: 'Objetivo colectivo', title: '' },
  { icon: '✈️', category: 'Viajes', label: 'Plan a largo plazo', title: '' }
];

const NOTE_CATEGORIES = [
  { id: 'Idea', label: 'Idea', emoji: '💡', cls: 'cat-idea' },
  { id: 'Recordatorio', label: 'Recordatorio', emoji: '⏰', cls: 'cat-reminder' },
  { id: 'Mensaje', label: 'Mensaje', emoji: '💬', cls: 'cat-message' },
  { id: 'Propuesta', label: 'Propuesta', emoji: '✨', cls: 'cat-proposal' },
  { id: 'Importante', label: 'Importante', emoji: '📌', cls: 'cat-important' }
];

const MONTH_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const goalsUiState = {
  activeTab: 'activities', // 'goals' | 'activities' | 'notes'
  activeActivityId: null,
  activityFilter: 'all', // 'all' | 'mine' | 'Planeando' | 'Confirmada' | 'En curso' | 'Completada'
  taskFilter: 'all', // 'all' | 'mine' | 'pending'
  goalFilter: 'all', // 'all' | 'active' | 'completed'
  noteFilter: 'all', // 'all' | 'pinned' | category
  lastGroupId: null
};

export function resetGoalsDetailState() {
  goalsUiState.activeActivityId = null;
  goalsUiState.taskFilter = 'all';
}

// ============================================================================
// UTILIDADES DE FECHAS Y MIEMBROS
// ============================================================================
function getTodayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalYmd(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

function formatPlanDate(ymd, { short = false } = {}) {
  const parts = parseLocalYmd(ymd);
  if (!parts) return '';
  const today = getTodayYmd();
  if (ymd === today) return 'Hoy';

  const now = new Date();
  const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomYmd = `${tom.getFullYear()}-${String(tom.getMonth() + 1).padStart(2, '0')}-${String(tom.getDate()).padStart(2, '0')}`;
  if (ymd === tomYmd) return 'Mañana';

  const sameYear = parts.y === now.getFullYear();
  if (short) {
    return sameYear ? `${parts.d} ${MONTH_SHORT[parts.m]}` : `${parts.d} ${MONTH_SHORT[parts.m]} ${parts.y}`;
  }
  return sameYear
    ? `${parts.d} de ${MONTH_LONG[parts.m]}`
    : `${parts.d} de ${MONTH_LONG[parts.m]} de ${parts.y}`;
}

function formatTime12Or24(timeStr) {
  if (!timeStr) return '';
  const m = /^(\d{2}):(\d{2})/.exec(String(timeStr));
  if (!m) return timeStr;
  let hh = Number(m[1]);
  const mm = m[2];
  const suffix = hh >= 12 ? 'p. m.' : 'a. m.';
  hh = hh % 12 || 12;
  return `${hh}:${mm} ${suffix}`;
}

function isDateOverdue(ymd) {
  if (!ymd) return false;
  return ymd < getTodayYmd();
}

function statusMeta(st) {
  return ACTIVITY_STATUSES.find(s => s.id === st) || ACTIVITY_STATUSES[0];
}

function noteCatMeta(cat) {
  const found = NOTE_CATEGORIES.find(c => c.id.toLowerCase() === String(cat || '').toLowerCase());
  return found || { id: cat || 'Nota', label: cat || 'Nota', emoji: '📝', cls: 'cat-idea' };
}

function resolveMember(group, memberId, fallbackName = '', fallbackAvatar = '') {
  const members = group?.members || [];
  const found = memberId ? members.find(m => m.id === memberId) : null;
  if (found) {
    return {
      id: found.id,
      name: found.name || 'Integrante',
      firstName: (found.name || 'Integrante').split(' ')[0],
      avatar: found.avatar || DEFAULT_AVATAR
    };
  }
  if (fallbackName) {
    const byName = members.find(m => m.name === fallbackName);
    return {
      id: byName?.id || memberId || '',
      name: byName?.name || fallbackName,
      firstName: (byName?.name || fallbackName).split(' ')[0],
      avatar: byName?.avatar || fallbackAvatar || DEFAULT_AVATAR
    };
  }
  return null;
}

function getActivityParticipants(group, activity) {
  const members = group?.members || [];
  const ids = Array.isArray(activity?.participantIds) ? activity.participantIds : [];
  if (ids.length === 0) return [];
  const out = [];
  ids.forEach(id => {
    const m = members.find(x => x.id === id);
    if (m) out.push(resolveMember(group, m.id));
  });
  return out;
}

function sortActivities(list) {
  return [...list].sort((a, b) => {
    const sa = statusMeta(a.status).order;
    const sb = statusMeta(b.status).order;
    const doneA = a.status === 'Completada';
    const doneB = b.status === 'Completada';
    if (doneA !== doneB) return doneA ? 1 : -1;

    // Entre activas: las que tienen fecha más próxima primero
    if (!doneA && !doneB) {
      if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      if (sa !== sb) return sa - sb;
    }
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });
}

// ============================================================================
// PUNTO DE ENTRADA PRINCIPAL
// ============================================================================
export function renderGroupGoalsView(viewport, group, user, ctx = {}) {
  if (goalsUiState.lastGroupId !== group.id) {
    goalsUiState.lastGroupId = group.id;
    goalsUiState.activeActivityId = null;
    goalsUiState.taskFilter = 'all';
  }

  const activities = group.activities || [];

  // Si hay una actividad abierta, renderizar la vista dedicada de detalle
  if (goalsUiState.activeActivityId) {
    const currentActivity = activities.find(a => a.id === goalsUiState.activeActivityId);
    if (currentActivity) {
      renderActivityDetailView(viewport, group, user, currentActivity, ctx);
      return;
    }
    goalsUiState.activeActivityId = null;
  }

  renderMainGoalsScreen(viewport, group, user, ctx);
}

// ============================================================================
// PANTALLA PRINCIPAL DE OBJETIVOS (RESUMEN + 3 PESTAÑAS EXCLUSIVAS)
// ============================================================================
function renderMainGoalsScreen(viewport, group, user, ctx) {
  const { rerender } = ctx;
  const activities = group.activities || [];
  const goals = group.goals || [];
  const notes = group.notes || [];
  const today = getTodayYmd();

  // Métricas compactas del resumen visual
  const pendingActivities = activities.filter(a => a.status !== 'Completada');
  const upcomingActivities = pendingActivities
    .filter(a => a.date && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nextActivity = upcomingActivities[0] || null;

  const pendingTasksTotal = pendingActivities.reduce(
    (sum, a) => sum + (a.tasks || []).filter(t => !t.completed).length,
    0
  );
  const activeGoalsCount = goals.filter(g => !g.completed).length;

  const tab = goalsUiState.activeTab;
  const ctaMap = {
    activities: { label: 'Actividad', sub: 'Planes del grupo' },
    goals: { label: 'Meta', sub: 'Metas a largo plazo' },
    notes: { label: 'Nota', sub: 'Notas compartidas' }
  };
  const currentCta = ctaMap[tab] || ctaMap.activities;

  let tabContentHtml = '';
  if (tab === 'activities') {
    tabContentHtml = renderActivitiesTabHtml(group, user, activities);
  } else if (tab === 'goals') {
    tabContentHtml = renderGoalsTabHtml(goals);
  } else {
    tabContentHtml = renderNotesTabHtml(group, notes);
  }

  viewport.innerHTML = `
    <div class="rgl-wrap">
      <!-- Encabezado compacto + Resumen visual útil -->
      <header class="rgl-header">
        <div class="rgl-header-top">
          <div class="rgl-title-group">
            <div class="rgl-header-ico">${svg(ICO.target, 21)}</div>
            <div class="rgl-title-text">
              <h1>Objetivos</h1>
              <p>${currentCta.sub}</p>
            </div>
          </div>
          <button type="button" class="rgl-add-btn" id="rgl-main-add">
            ${svg(ICO.plus, 16)}<span>${currentCta.label}</span>
          </button>
        </div>

        <div class="rgl-summary" aria-label="Resumen de objetivos del grupo">
          <button type="button" class="rgl-sum-item" data-rgl-jump="pending-act" title="Actividades pendientes">
            <b>${pendingActivities.length}</b>
            <span>Pendientes</span>
          </button>
          <button type="button" class="rgl-sum-item ${upcomingActivities.length > 0 ? 'is-accent' : ''}" data-rgl-jump="upcoming-act" title="Actividades próximas">
            <b>${upcomingActivities.length}</b>
            <span>Próximas</span>
          </button>
          <button type="button" class="rgl-sum-item ${pendingTasksTotal > 0 ? 'is-accent' : ''}" data-rgl-jump="pending-tasks" title="Responsabilidades pendientes">
            <b>${pendingTasksTotal}</b>
            <span>Tareas</span>
          </button>
          <button type="button" class="rgl-sum-item" data-rgl-jump="active-goals" title="Metas activas">
            <b>${activeGoalsCount}</b>
            <span>Metas</span>
          </button>
        </div>

        ${nextActivity ? `
          <button type="button" class="rgl-next-bar" data-rgl-open-act="${esc(nextActivity.id)}">
            <span class="rgl-next-tag">Próxima</span>
            <span class="rgl-next-title">${esc(nextActivity.icon || '🎉')} ${esc(nextActivity.title)}</span>
            <span class="rgl-next-date">${esc(formatPlanDate(nextActivity.date, { short: true }))} ›</span>
          </button>
        ` : ''}
      </header>

      <!-- Navegación principal: 3 pestañas exclusivas -->
      <nav class="rgl-tabs" role="tablist" aria-label="Secciones de Objetivos">
        <button type="button" role="tab" aria-selected="${tab === 'goals'}" class="rgl-tab-btn ${tab === 'goals' ? 'active' : ''}" data-rgl-tab="goals">
          <span>Metas</span>
          <span class="rgl-tab-count">${goals.length}</span>
        </button>
        <button type="button" role="tab" aria-selected="${tab === 'activities'}" class="rgl-tab-btn ${tab === 'activities' ? 'active' : ''}" data-rgl-tab="activities">
          <span>Actividades</span>
          <span class="rgl-tab-count">${activities.length}</span>
        </button>
        <button type="button" role="tab" aria-selected="${tab === 'notes'}" class="rgl-tab-btn ${tab === 'notes' ? 'active' : ''}" data-rgl-tab="notes">
          <span>Notas</span>
          <span class="rgl-tab-count">${notes.length}</span>
        </button>
      </nav>

      <!-- Contenido exclusivo de la pestaña seleccionada -->
      ${tabContentHtml}
    </div>
  `;

  bindMainScreenEvents(viewport, group, user, ctx, rerender);
}

// ============================================================================
// PESTAÑA 1: ACTIVIDADES GRUPALES (FUNCIONALIDAD PRINCIPAL)
// ============================================================================
function renderActivitiesTabHtml(group, user, allActivities) {
  const filter = goalsUiState.activityFilter;
  const sorted = sortActivities(allActivities);

  const myTasksActCount = allActivities.filter(a =>
    a.status !== 'Completada' && (a.tasks || []).some(t => !t.completed && t.assigneeId === user.id)
  ).length;

  let filtered = sorted;
  if (filter === 'mine') {
    filtered = sorted.filter(a =>
      (a.tasks || []).some(t => !t.completed && t.assigneeId === user.id)
    );
  } else if (filter !== 'all') {
    filtered = sorted.filter(a => (a.status || 'Planeando') === filter);
  }

  const filterChips = [
    { id: 'all', label: 'Todas', count: allActivities.length },
    ...(myTasksActCount > 0 ? [{ id: 'mine', label: 'Mis tareas', count: myTasksActCount }] : []),
    ...ACTIVITY_STATUSES.map(s => ({
      id: s.id,
      label: s.label,
      count: allActivities.filter(a => (a.status || 'Planeando') === s.id).length
    }))
  ];

  const chipsHtml = allActivities.length > 0 ? `
    <div class="rgl-chips" aria-label="Filtrar actividades">
      ${filterChips.map(c => `
        <button type="button" class="rgl-chip ${filter === c.id ? 'active' : ''}" data-rgl-act-filter="${esc(c.id)}">
          <span>${c.label}</span>
          ${c.count > 0 ? `<span class="rgl-chip-n">${c.count}</span>` : ''}
        </button>
      `).join('')}
    </div>
  ` : '';

  if (allActivities.length === 0) {
    return `
      <div class="rgl-empty">
        <div class="rgl-empty-ico">🎬</div>
        <b>Organiza el próximo plan del grupo</b>
        <span>Crea una actividad, reparte las responsabilidades entre tus amigos y sigan el progreso juntos.</span>
        <div class="rgl-quick-ideas">
          ${ACTIVITY_TEMPLATES.map((tpl, idx) => `
            <button type="button" class="rgl-idea-chip" data-rgl-act-tpl="${idx}">
              <span>${tpl.icon}</span><span>${tpl.label}</span>
            </button>
          `).join('')}
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="rgl-empty-new-act" style="margin-top:0.3rem;">+ Crear actividad</button>
      </div>
    `;
  }

  if (filtered.length === 0) {
    return `
      ${chipsHtml}
      <div class="rgl-empty">
        <div class="rgl-empty-ico">✨</div>
        <b>No hay actividades en este filtro</b>
        <span>Cambia de filtro o crea un nuevo plan para el grupo.</span>
        <button type="button" class="btn btn-secondary btn-sm" id="rgl-reset-act-filter">Ver todas las actividades</button>
      </div>
    `;
  }

  return `
    ${chipsHtml}
    <div class="rgl-list">
      ${filtered.map(act => renderActivityCardHtml(group, user, act)).join('')}
    </div>
  `;
}

function renderActivityCardHtml(group, user, act) {
  const st = statusMeta(act.status);
  const prog = store.getActivityProgress(act);
  const participants = getActivityParticipants(group, act);
  const shownAvatars = participants.slice(0, 4);
  const extraCount = Math.max(0, participants.length - shownAvatars.length);
  const myPendingCount = (act.tasks || []).filter(t => !t.completed && t.assigneeId === user.id).length;

  const dateLabel = act.date ? formatPlanDate(act.date) : 'Sin fecha';
  const partLabel = `${participants.length} ${participants.length === 1 ? 'integrante' : 'integrantes'}`;
  const metaItems = [dateLabel, partLabel];
  if (act.location) metaItems.push(act.location);

  const tasksSummary = prog.total > 0
    ? `${prog.done}/${prog.total} ${prog.total === 1 ? 'responsabilidad' : 'responsabilidades'}`
    : 'Sin responsabilidades aún';

  const isComplete = prog.pct >= 100 && (prog.total > 0 || act.status === 'Completada');

  return `
    <article class="rgl-act-card ${act.status === 'Completada' ? 'is-done' : ''}" data-rgl-open-act="${esc(act.id)}">
      <div class="rgl-act-top">
        <div class="rgl-icon-badge" aria-hidden="true">${esc(act.icon || '🎉')}</div>
        <div class="rgl-act-head-info">
          <div class="rgl-act-title-row">
            <h3 class="rgl-act-title">${esc(act.title)}</h3>
            <span class="rgl-status-pill ${st.cls}">
              <span class="rgl-status-dot"></span>${esc(st.label)}
            </span>
          </div>
          <div class="rgl-act-meta">
            ${metaItems.map((m, i) => `${i > 0 ? '<span class="rgl-meta-sep">·</span>' : ''}<span>${esc(m)}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="rgl-prog-track">
        <i class="rgl-prog-fill ${isComplete ? 'is-complete' : ''}" style="width:${prog.total > 0 ? prog.pct : (act.status === 'Completada' ? 100 : 0)}%;"></i>
      </div>

      <div class="rgl-act-foot">
        <div class="rgl-act-foot-left">
          ${shownAvatars.length > 0 ? `
            <div class="rgl-avatar-stack" aria-hidden="true">
              ${shownAvatars.map(p => `<img src="${esc(p.avatar)}" alt="${esc(p.firstName)}">`).join('')}
              ${extraCount > 0 ? `<span class="rgl-avatar-more">+${extraCount}</span>` : ''}
            </div>
          ` : ''}
          <span class="rgl-act-tasks-txt">${esc(tasksSummary)}</span>
        </div>

        <div class="rgl-act-foot-right">
          ${myPendingCount > 0 && act.status !== 'Completada'
            ? `<span class="rgl-mine-badge">Te ${myPendingCount === 1 ? 'toca' : 'tocan'} ${myPendingCount}</span>`
            : ''}
          <span class="rgl-pct-pill ${isComplete ? 'is-complete' : ''}">${prog.pct}%</span>
          <span class="rgl-chev">${svg(ICO.chevRight, 15)}</span>
        </div>
      </div>
    </article>
  `;
}

// ============================================================================
// VISTA DEDICADA: DETALLE DE ACTIVIDAD + SISTEMA DE RESPONSABILIDADES
// ============================================================================
function renderActivityDetailView(viewport, group, user, act, ctx) {
  const { onQuoteActivity, rerender } = ctx;
  const prog = store.getActivityProgress(act);
  const participants = getActivityParticipants(group, act);
  const tasks = Array.isArray(act.tasks) ? act.tasks : [];

  const isComplete = prog.pct >= 100 && (prog.total > 0 || act.status === 'Completada');
  const progressCopy = prog.total > 0
    ? `${prog.done} de ${prog.total} ${prog.total === 1 ? 'responsabilidad completada' : 'responsabilidades completadas'} — ${prog.pct}%`
    : 'Añade responsabilidades para repartir la organización del plan.';

  // Filtro ligero de responsabilidades cuando hay >= 2 tareas
  const myTasksCount = tasks.filter(t => t.assigneeId === user.id).length;
  const pendingCount = tasks.filter(t => !t.completed).length;
  let visibleTasks = tasks;
  if (goalsUiState.taskFilter === 'mine') {
    visibleTasks = tasks.filter(t => t.assigneeId === user.id);
  } else if (goalsUiState.taskFilter === 'pending') {
    visibleTasks = tasks.filter(t => !t.completed);
  }

  const pendingTasks = visibleTasks.filter(t => !t.completed);
  const completedTasks = visibleTasks.filter(t => t.completed);

  const dateChipText = act.date
    ? `${formatPlanDate(act.date)}${act.time ? ` · ${formatTime12Or24(act.time)}` : ''}`
    : (act.time ? formatTime12Or24(act.time) : '');

  viewport.innerHTML = `
    <div class="rgl-wrap">
      <!-- Barra superior dedicada -->
      <div class="rgl-det-bar">
        <button type="button" class="rgl-back-btn" id="rgl-det-back">
          ${svg(ICO.back, 16)}<span>Actividades</span>
        </button>
        <div class="rgl-det-actions">
          <button type="button" class="rgl-icon-act" id="rgl-det-edit">
            ${svg(ICO.edit, 15)}<span>Editar</span>
          </button>
          <button type="button" class="rgl-icon-act is-round" id="rgl-det-more" aria-label="Más opciones de la actividad">⋯</button>
        </div>
      </div>

      <!-- Tarjeta principal de la actividad -->
      <section class="rgl-det-hero">
        <div class="rgl-det-head">
          <div class="rgl-det-ico" aria-hidden="true">${esc(act.icon || '🎉')}</div>
          <div class="rgl-det-titles">
            <h1>${esc(act.title)}</h1>
            <div class="rgl-det-submeta">
              ${dateChipText ? `<span class="rgl-info-chip">📅 ${esc(dateChipText)}</span>` : ''}
              ${act.location ? `<span class="rgl-info-chip">📍 ${esc(act.location)}</span>` : ''}
              ${!dateChipText && !act.location
                ? `<button type="button" class="rgl-info-chip is-add" id="rgl-det-add-meta">+ Añadir fecha o lugar</button>`
                : ''}
            </div>
          </div>
        </div>

        <!-- Selector rápido de estado en 1 toque -->
        <div class="rgl-status-selector" role="group" aria-label="Estado de la actividad">
          ${ACTIVITY_STATUSES.map(s => `
            <button type="button" class="rgl-st-choice ${s.cls} ${(act.status || 'Planeando') === s.id ? 'active' : ''}" data-rgl-set-status="${esc(s.id)}">
              ${esc(s.label)}
            </button>
          `).join('')}
        </div>

        ${act.description ? `<p class="rgl-det-desc">${esc(act.description)}</p>` : ''}

        <!-- Participantes -->
        <div class="rgl-det-block">
          <div class="rgl-block-head">
            <span class="rgl-block-label">Participantes (${participants.length})</span>
            <button type="button" class="rgl-mini-link" id="rgl-det-participants">Gestionar</button>
          </div>
          <div class="rgl-participants-row">
            ${participants.length === 0
              ? `<span style="font-size:0.78rem;color:var(--text-muted);">Sin participantes seleccionados</span>`
              : participants.map(p => `
                  <span class="rgl-part-pill">
                    <img src="${esc(p.avatar)}" alt="${esc(p.firstName)}">
                    <span>${esc(p.firstName)}</span>
                  </span>
                `).join('')}
          </div>
        </div>

        <!-- Progreso automático -->
        <div class="rgl-det-prog">
          <div class="rgl-det-prog-top">
            <span>Progreso de organización</span>
            <b class="rgl-det-prog-pct ${isComplete ? 'is-complete' : ''}">${prog.pct}%</b>
          </div>
          <div class="rgl-prog-track is-lg">
            <i class="rgl-prog-fill ${isComplete ? 'is-complete' : ''}" style="width:${prog.total > 0 ? prog.pct : (act.status === 'Completada' ? 100 : 0)}%;"></i>
          </div>
          <div class="rgl-det-prog-sub">${esc(progressCopy)}</div>
        </div>
      </section>

      <!-- Lista de responsabilidades vinculadas exclusivamente a esta actividad -->
      <section class="rgl-tasks-sec">
        <div class="rgl-sec-head">
          <div class="rgl-sec-title">
            <h2>Responsabilidades</h2>
            <span class="rgl-sec-count">${prog.done}/${prog.total}</span>
          </div>
          <button type="button" class="rgl-add-btn" id="rgl-add-task-btn">
            ${svg(ICO.plus, 15)}<span>Añadir</span>
          </button>
        </div>

        ${tasks.length >= 2 ? `
          <div class="rgl-chips" aria-label="Filtrar responsabilidades">
            <button type="button" class="rgl-chip ${goalsUiState.taskFilter === 'all' ? 'active' : ''}" data-rgl-task-filter="all">
              <span>Todas</span><span class="rgl-chip-n">${tasks.length}</span>
            </button>
            ${myTasksCount > 0 ? `
              <button type="button" class="rgl-chip ${goalsUiState.taskFilter === 'mine' ? 'active' : ''}" data-rgl-task-filter="mine">
                <span>Mías</span><span class="rgl-chip-n">${myTasksCount}</span>
              </button>
            ` : ''}
            <button type="button" class="rgl-chip ${goalsUiState.taskFilter === 'pending' ? 'active' : ''}" data-rgl-task-filter="pending">
              <span>Pendientes</span><span class="rgl-chip-n">${pendingCount}</span>
            </button>
          </div>
        ` : ''}

        ${tasks.length === 0 ? `
          <div class="rgl-empty">
            <div class="rgl-empty-ico">🤝</div>
            <b>Reparte las responsabilidades del plan</b>
            <span>Asigna a cada integrante lo que le toca hacer para que esta actividad se haga realidad.</span>
            <button type="button" class="btn btn-primary btn-sm" id="rgl-empty-add-task">+ Añadir responsabilidad</button>
          </div>
        ` : visibleTasks.length === 0 ? `
          <div class="rgl-empty">
            <div class="rgl-empty-ico">✅</div>
            <b>Nada pendiente en este filtro</b>
            <span>Todo está al día aquí.</span>
            <button type="button" class="btn btn-secondary btn-sm" id="rgl-reset-task-filter">Ver todas</button>
          </div>
        ` : `
          ${pendingTasks.length > 0 ? `
            <div class="rgl-task-list">
              ${pendingTasks.map(t => renderTaskRowHtml(group, user, t)).join('')}
            </div>
          ` : ''}

          ${completedTasks.length > 0 ? `
            <div class="rgl-group-divider">Completadas (${completedTasks.length})</div>
            <div class="rgl-task-list">
              ${completedTasks.map(t => renderTaskRowHtml(group, user, t)).join('')}
            </div>
          ` : ''}
        `}
      </section>

      <!-- Acciones secundarias de la actividad -->
      <div class="rgl-det-foot">
        <div style="display:flex;gap:0.42rem;flex-wrap:wrap;">
          ${typeof onQuoteActivity === 'function' ? `
            <button type="button" class="rgl-icon-act" id="rgl-det-quote">
              ${svg(ICO.chat, 14)}<span>Compartir en chat</span>
            </button>
          ` : ''}
          <button type="button" class="rgl-icon-act" id="rgl-det-edit-foot">
            ${svg(ICO.edit, 14)}<span>Editar</span>
          </button>
        </div>
        <button type="button" class="rgl-icon-act danger" id="rgl-det-delete-foot">
          ${svg(ICO.trash, 14)}<span>Eliminar</span>
        </button>
      </div>
    </div>
  `;

  // Bind eventos del detalle
  viewport.querySelector('#rgl-det-back')?.addEventListener('click', () => {
    goalsUiState.activeActivityId = null;
    goalsUiState.taskFilter = 'all';
    rerender();
  });

  const openEditAct = () => openActivityModal(group, user, { editingActivity: act });
  viewport.querySelector('#rgl-det-edit')?.addEventListener('click', openEditAct);
  viewport.querySelector('#rgl-det-edit-foot')?.addEventListener('click', openEditAct);
  viewport.querySelector('#rgl-det-add-meta')?.addEventListener('click', openEditAct);

  viewport.querySelector('#rgl-det-quote')?.addEventListener('click', () => {
    if (typeof onQuoteActivity === 'function') onQuoteActivity(act, prog);
  });

  viewport.querySelector('#rgl-det-delete-foot')?.addEventListener('click', () => {
    confirmDeleteActivity(act, () => {
      goalsUiState.activeActivityId = null;
      goalsUiState.taskFilter = 'all';
    });
  });

  viewport.querySelector('#rgl-det-more')?.addEventListener('click', () => {
    openActivityOptionsSheet(group, user, act, prog, {
      onEdit: openEditAct,
      onParticipants: () => openParticipantsModal(group, act),
      onQuote: typeof onQuoteActivity === 'function' ? () => onQuoteActivity(act, prog) : null,
      onDelete: () => confirmDeleteActivity(act, () => {
        goalsUiState.activeActivityId = null;
        goalsUiState.taskFilter = 'all';
      })
    });
  });

  viewport.querySelector('#rgl-det-participants')?.addEventListener('click', () => {
    openParticipantsModal(group, act);
  });

  // Cambio rápido de estado en 1 toque
  viewport.querySelectorAll('[data-rgl-set-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-rgl-set-status');
      if (next === act.status) return;
      store.setActivityStatus(act.id, next);
      if (next === 'Completada') {
        fireConfetti({ particleCount: 55, spread: 60, origin: { y: 0.72 } });
        UI.showToast('¡Actividad completada! 🎉', 'success');
      } else {
        UI.showToast(`Estado actualizado a "${next}"`, 'success');
      }
    });
  });

  // Añadir tarea rápida
  const openNewTask = () => openTaskModal(group, user, act);
  viewport.querySelector('#rgl-add-task-btn')?.addEventListener('click', openNewTask);
  viewport.querySelector('#rgl-empty-add-task')?.addEventListener('click', openNewTask);

  // Filtros de tareas
  viewport.querySelectorAll('[data-rgl-task-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      goalsUiState.taskFilter = btn.getAttribute('data-rgl-task-filter');
      rerender();
    });
  });
  viewport.querySelector('#rgl-reset-task-filter')?.addEventListener('click', () => {
    goalsUiState.taskFilter = 'all';
    rerender();
  });

  // Check / uncheck tarea
  viewport.querySelectorAll('[data-rgl-toggle-task]').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-rgl-toggle-task');
      const res = store.toggleActivityTaskCompleted(act.id, taskId);
      if (res?.allCompleted && res.completed) {
        fireConfetti({ particleCount: 60, spread: 65, origin: { y: 0.7 } });
        UI.showToast('¡Todas las responsabilidades listas! 🎉✨', 'success');
      }
    });
  });

  // Tocar píldora de responsable -> reasignación / opciones rápidas
  viewport.querySelectorAll('[data-rgl-task-assignee]').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-rgl-task-assignee');
      const task = tasks.find(t => t.id === taskId);
      if (task) openTaskOptionsSheet(group, user, act, task);
    });
  });

  // Menú ⋯ de cada tarea
  viewport.querySelectorAll('[data-rgl-task-more]').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.getAttribute('data-rgl-task-more');
      const task = tasks.find(t => t.id === taskId);
      if (task) openTaskOptionsSheet(group, user, act, task);
    });
  });
}

function renderTaskRowHtml(group, user, task) {
  const assignee = resolveMember(group, task.assigneeId, task.assigneeName, task.assigneeAvatar);
  const isMine = assignee && assignee.id === user.id;
  const overdue = !task.completed && isDateOverdue(task.dueDate);
  const id = esc(task.id);

  return `
    <div class="rgl-task-row ${task.completed ? 'is-done' : ''} ${isMine && !task.completed ? 'is-mine' : ''}">
      <button type="button" class="rgl-check-btn ${task.completed ? 'checked' : ''}" data-rgl-toggle-task="${id}" aria-label="${task.completed ? 'Marcar pendiente' : 'Marcar completada'}">
        <span class="rgl-check-circle">${svg(ICO.check, 13)}</span>
      </button>

      <div class="rgl-task-body">
        <div class="rgl-task-title">${esc(task.title)}</div>
        ${task.description ? `<div class="rgl-task-desc">${esc(task.description)}</div>` : ''}
        <div class="rgl-task-meta">
          ${assignee ? `
            <button type="button" class="rgl-assignee-pill ${isMine ? 'is-me' : ''}" data-rgl-task-assignee="${id}" title="Cambiar responsable">
              <img src="${esc(assignee.avatar)}" alt="${esc(assignee.firstName)}">
              <span>${esc(assignee.firstName)}</span>
            </button>
          ` : `
            <button type="button" class="rgl-assignee-pill is-unassigned" data-rgl-task-assignee="${id}" title="Asignar responsable">
              + Asignar responsable
            </button>
          `}
          ${task.dueDate ? `
            <span class="rgl-due-pill ${overdue ? 'is-overdue' : ''}">
              📅 ${esc(formatPlanDate(task.dueDate, { short: true }))}
            </span>
          ` : ''}
        </div>
      </div>

      <button type="button" class="rgl-more-btn" data-rgl-task-more="${id}" aria-label="Opciones de responsabilidad">⋯</button>
    </div>
  `;
}

// ============================================================================
// PESTAÑA 2: METAS GRUPALES (LARGO PLAZO / PROYECTOS COMPARTIDOS)
// ============================================================================
function renderGoalsTabHtml(allGoals) {
  const filter = goalsUiState.goalFilter;
  const activeCount = allGoals.filter(g => !g.completed).length;
  const completedCount = allGoals.filter(g => g.completed).length;

  let list = [...allGoals].sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)));
  if (filter === 'active') list = list.filter(g => !g.completed);
  else if (filter === 'completed') list = list.filter(g => g.completed);

  const chipsHtml = allGoals.length > 0 ? `
    <div class="rgl-chips" aria-label="Filtrar metas">
      <button type="button" class="rgl-chip ${filter === 'all' ? 'active' : ''}" data-rgl-goal-filter="all">
        <span>Todas</span><span class="rgl-chip-n">${allGoals.length}</span>
      </button>
      <button type="button" class="rgl-chip ${filter === 'active' ? 'active' : ''}" data-rgl-goal-filter="active">
        <span>Activas</span><span class="rgl-chip-n">${activeCount}</span>
      </button>
      <button type="button" class="rgl-chip ${filter === 'completed' ? 'active' : ''}" data-rgl-goal-filter="completed">
        <span>Cumplidas</span><span class="rgl-chip-n">${completedCount}</span>
      </button>
    </div>
  ` : '';

  if (allGoals.length === 0) {
    return `
      <div class="rgl-empty">
        <div class="rgl-empty-ico">🎯</div>
        <b>Proyectos y metas a largo plazo</b>
        <span>Define objetivos que requieran seguimiento continuo, como ahorrar para un viaje o lograr un reto juntos.</span>
        <div class="rgl-quick-ideas">
          ${GOAL_TEMPLATES.map((tpl, idx) => `
            <button type="button" class="rgl-idea-chip" data-rgl-goal-tpl="${idx}">
              <span>${tpl.icon}</span><span>${tpl.label}</span>
            </button>
          `).join('')}
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="rgl-empty-new-goal" style="margin-top:0.3rem;">+ Crear meta</button>
      </div>
    `;
  }

  if (list.length === 0) {
    return `
      ${chipsHtml}
      <div class="rgl-empty">
        <div class="rgl-empty-ico">✨</div>
        <b>No hay metas en esta vista</b>
        <button type="button" class="btn btn-secondary btn-sm" id="rgl-reset-goal-filter">Ver todas las metas</button>
      </div>
    `;
  }

  return `
    ${chipsHtml}
    <div class="rgl-list">
      ${list.map(g => renderGoalCardHtml(g)).join('')}
    </div>
  `;
}

function renderGoalCardHtml(goal) {
  const { totalTasks, doneTasks, pct } = store.getGoalProgress(goal);
  const id = esc(goal.id);
  const isDone = Boolean(goal.completed) || pct >= 100;

  return `
    <article class="rgl-goal-card ${isDone ? 'is-done' : ''}" data-rgl-open-goal="${id}">
      <div class="rgl-goal-top">
        <div class="rgl-goal-ico" aria-hidden="true">${esc(goal.icon || '🎯')}</div>
        <div class="rgl-goal-info">
          <h3 class="rgl-goal-title">${esc(goal.title)}</h3>
          <div class="rgl-goal-tags">
            ${goal.category ? `<span class="rgl-cat-chip">${esc(goal.category)}</span>` : ''}
            ${goal.targetDate ? `<span class="rgl-due-pill">📅 ${esc(formatPlanDate(goal.targetDate, { short: true }))}</span>` : ''}
          </div>
        </div>
        <div class="rgl-goal-actions">
          <button type="button" class="rgl-check-btn ${isDone ? 'checked' : ''}" data-rgl-toggle-goal="${id}" aria-label="${isDone ? 'Reabrir meta' : 'Marcar meta cumplida'}">
            <span class="rgl-check-circle">${svg(ICO.check, 13)}</span>
          </button>
          <button type="button" class="rgl-more-btn" data-rgl-goal-more="${id}" aria-label="Opciones de meta">⋯</button>
        </div>
      </div>

      ${goal.description ? `<p class="rgl-goal-desc">${esc(goal.description)}</p>` : ''}

      <div class="rgl-prog-track">
        <i class="rgl-prog-fill ${isDone ? 'is-complete' : ''}" style="width:${pct}%;"></i>
      </div>

      <div class="rgl-goal-prog-foot">
        <span>${totalTasks > 0 ? `${doneTasks}/${totalTasks} pasos completados` : (isDone ? 'Meta cumplida' : 'Toca para actualizar progreso')}</span>
        <span class="rgl-pct-pill ${isDone ? 'is-complete' : ''}">${pct}%</span>
      </div>
    </article>
  `;
}

// ============================================================================
// PESTAÑA 3: NOTAS COMPARTIDAS (SIN FORMULARIO ABIERTO PERMANENTEMENTE)
// ============================================================================
function renderNotesTabHtml(group, allNotes) {
  const filter = goalsUiState.noteFilter;
  const pinnedCount = allNotes.filter(n => n.pinned).length;

  let list = [...allNotes].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });

  if (filter === 'pinned') {
    list = list.filter(n => n.pinned);
  } else if (filter !== 'all') {
    list = list.filter(n => String(n.category || '').toLowerCase() === filter.toLowerCase());
  }

  const chipsHtml = allNotes.length > 0 ? `
    <div class="rgl-chips" aria-label="Filtrar notas">
      <button type="button" class="rgl-chip ${filter === 'all' ? 'active' : ''}" data-rgl-note-filter="all">
        <span>Todas</span><span class="rgl-chip-n">${allNotes.length}</span>
      </button>
      ${pinnedCount > 0 ? `
        <button type="button" class="rgl-chip ${filter === 'pinned' ? 'active' : ''}" data-rgl-note-filter="pinned">
          <span>📌 Fijadas</span><span class="rgl-chip-n">${pinnedCount}</span>
        </button>
      ` : ''}
      ${NOTE_CATEGORIES.map(c => {
        const cnt = allNotes.filter(n => String(n.category || '').toLowerCase() === c.id.toLowerCase()).length;
        if (cnt === 0) return '';
        return `
          <button type="button" class="rgl-chip ${filter === c.id ? 'active' : ''}" data-rgl-note-filter="${esc(c.id)}">
            <span>${c.emoji} ${c.label}</span><span class="rgl-chip-n">${cnt}</span>
          </button>
        `;
      }).join('')}
    </div>
  ` : '';

  if (allNotes.length === 0) {
    return `
      <div class="rgl-empty">
        <div class="rgl-empty-ico">📝</div>
        <b>Espacio de notas compartidas</b>
        <span>Guarda ideas, recordatorios, propuestas o datos importantes para todo el grupo.</span>
        <div class="rgl-quick-ideas">
          ${NOTE_CATEGORIES.slice(0, 4).map(c => `
            <button type="button" class="rgl-idea-chip" data-rgl-note-cat-tpl="${esc(c.id)}">
              <span>${c.emoji}</span><span>${c.label}</span>
            </button>
          `).join('')}
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="rgl-empty-new-note" style="margin-top:0.3rem;">+ Crear nota</button>
      </div>
    `;
  }

  if (list.length === 0) {
    return `
      ${chipsHtml}
      <div class="rgl-empty">
        <div class="rgl-empty-ico">📝</div>
        <b>Sin notas en esta categoría</b>
        <button type="button" class="btn btn-secondary btn-sm" id="rgl-reset-note-filter">Ver todas las notas</button>
      </div>
    `;
  }

  return `
    ${chipsHtml}
    <div class="rgl-list">
      ${list.map(n => renderNoteCardHtml(group, n)).join('')}
    </div>
  `;
}

function renderNoteCardHtml(group, note) {
  const cat = noteCatMeta(note.category);
  const author = resolveMember(group, note.authorId, note.authorName, note.authorAvatar) || {
    firstName: note.authorName || 'Miembro',
    avatar: DEFAULT_AVATAR
  };
  const id = esc(note.id);
  const when = note.updatedAt || note.createdAt ? timeAgo(note.updatedAt || note.createdAt) : '';

  return `
    <article class="rgl-note-card ${cat.cls}">
      <div class="rgl-note-top">
        <div class="rgl-note-badges">
          <span class="rgl-note-cat">${cat.emoji} ${esc(cat.label)}</span>
          ${note.pinned ? `<span class="rgl-note-pin-tag">📌 Fijada</span>` : ''}
        </div>
        <button type="button" class="rgl-more-btn" data-rgl-note-more="${id}" aria-label="Opciones de nota">⋯</button>
      </div>

      <h3 class="rgl-note-title">${esc(note.title)}</h3>
      ${note.content ? `<p class="rgl-note-content">${esc(note.content)}</p>` : ''}

      <div class="rgl-note-foot">
        <span class="rgl-note-author">
          <img src="${esc(author.avatar)}" alt="${esc(author.firstName)}">
          <span>${esc(author.firstName)}</span>
        </span>
        ${when ? `<span class="rgl-note-time">${esc(when)}</span>` : ''}
      </div>
    </article>
  `;
}

// ============================================================================
// BINDINGS DE LA PANTALLA PRINCIPAL
// ============================================================================
function bindMainScreenEvents(viewport, group, user, ctx, rerender) {
  const activities = group.activities || [];
  const goals = group.goals || [];
  const notes = group.notes || [];

  // Botón principal contextual del header
  viewport.querySelector('#rgl-main-add')?.addEventListener('click', () => {
    if (goalsUiState.activeTab === 'activities') {
      openActivityModal(group, user, {
        onCreated: (created) => {
          goalsUiState.activeActivityId = created.id;
          goalsUiState.taskFilter = 'all';
          rerender();
        }
      });
    } else if (goalsUiState.activeTab === 'goals') {
      openGoalModal();
    } else {
      openNoteModal();
    }
  });

  // Atajos del resumen visual
  viewport.querySelectorAll('[data-rgl-jump]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-rgl-jump');
      if (target === 'active-goals') {
        goalsUiState.activeTab = 'goals';
        goalsUiState.goalFilter = 'active';
      } else if (target === 'pending-tasks') {
        goalsUiState.activeTab = 'activities';
        const hasMine = activities.some(a =>
          a.status !== 'Completada' && (a.tasks || []).some(t => !t.completed && t.assigneeId === user.id)
        );
        goalsUiState.activityFilter = hasMine ? 'mine' : 'all';
      } else {
        goalsUiState.activeTab = 'activities';
        goalsUiState.activityFilter = 'all';
      }
      rerender();
    });
  });

  // Cambio de pestañas principales
  viewport.querySelectorAll('[data-rgl-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      goalsUiState.activeTab = btn.getAttribute('data-rgl-tab');
      rerender();
    });
  });

  // --- Eventos de Actividades ---
  viewport.querySelectorAll('[data-rgl-open-act]').forEach(el => {
    el.addEventListener('click', () => {
      goalsUiState.activeTab = 'activities';
      goalsUiState.activeActivityId = el.getAttribute('data-rgl-open-act');
      goalsUiState.taskFilter = 'all';
      rerender();
    });
  });

  viewport.querySelectorAll('[data-rgl-act-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      goalsUiState.activityFilter = btn.getAttribute('data-rgl-act-filter');
      rerender();
    });
  });

  viewport.querySelector('#rgl-reset-act-filter')?.addEventListener('click', () => {
    goalsUiState.activityFilter = 'all';
    rerender();
  });

  viewport.querySelector('#rgl-empty-new-act')?.addEventListener('click', () => {
    openActivityModal(group, user, {
      onCreated: (created) => {
        goalsUiState.activeActivityId = created.id;
        rerender();
      }
    });
  });

  viewport.querySelectorAll('[data-rgl-act-tpl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = ACTIVITY_TEMPLATES[Number(btn.getAttribute('data-rgl-act-tpl'))];
      openActivityModal(group, user, {
        prefill: tpl ? { icon: tpl.icon, titlePlaceholder: tpl.placeholder } : null,
        onCreated: (created) => {
          goalsUiState.activeActivityId = created.id;
          rerender();
        }
      });
    });
  });

  // --- Eventos de Metas ---
  viewport.querySelectorAll('[data-rgl-goal-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      goalsUiState.goalFilter = btn.getAttribute('data-rgl-goal-filter');
      rerender();
    });
  });

  viewport.querySelector('#rgl-reset-goal-filter')?.addEventListener('click', () => {
    goalsUiState.goalFilter = 'all';
    rerender();
  });

  viewport.querySelector('#rgl-empty-new-goal')?.addEventListener('click', () => openGoalModal());

  viewport.querySelectorAll('[data-rgl-goal-tpl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tpl = GOAL_TEMPLATES[Number(btn.getAttribute('data-rgl-goal-tpl'))];
      openGoalModal({ prefill: tpl });
    });
  });

  viewport.querySelectorAll('[data-rgl-open-goal]').forEach(card => {
    card.addEventListener('click', () => {
      const g = goals.find(x => x.id === card.getAttribute('data-rgl-open-goal'));
      if (g) openGoalDetailModal(g.id, user);
    });
  });

  viewport.querySelectorAll('[data-rgl-toggle-goal]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const done = store.toggleGoalCompleted(btn.getAttribute('data-rgl-toggle-goal'));
      if (done) {
        fireConfetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
        UI.showToast('¡Meta cumplida! 🎉✨', 'success');
      }
    });
  });

  viewport.querySelectorAll('[data-rgl-goal-more]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const g = goals.find(x => x.id === btn.getAttribute('data-rgl-goal-more'));
      if (g) openGoalOptionsSheet(g, user);
    });
  });

  // --- Eventos de Notas ---
  viewport.querySelectorAll('[data-rgl-note-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      goalsUiState.noteFilter = btn.getAttribute('data-rgl-note-filter');
      rerender();
    });
  });

  viewport.querySelector('#rgl-reset-note-filter')?.addEventListener('click', () => {
    goalsUiState.noteFilter = 'all';
    rerender();
  });

  viewport.querySelector('#rgl-empty-new-note')?.addEventListener('click', () => openNoteModal());

  viewport.querySelectorAll('[data-rgl-note-cat-tpl]').forEach(btn => {
    btn.addEventListener('click', () => {
      openNoteModal({ prefillCategory: btn.getAttribute('data-rgl-note-cat-tpl') });
    });
  });

  viewport.querySelectorAll('[data-rgl-note-more]').forEach(btn => {
    btn.addEventListener('click', () => {
      const note = notes.find(x => x.id === btn.getAttribute('data-rgl-note-more'));
      if (note) openNoteOptionsSheet(note);
    });
  });
}

// ============================================================================
// MODALES Y ACTION SHEETS: ACTIVIDADES
// ============================================================================
function openActivityModal(group, user, { editingActivity = null, prefill = null, onCreated = null } = {}) {
  const members = group.members || [];
  let selectedIcon = editingActivity?.icon || prefill?.icon || '🎬';
  let selectedStatus = editingActivity?.status || 'Planeando';
  const selectedParticipants = new Set(
    editingActivity
      ? (editingActivity.participantIds || [])
      : members.map(m => m.id)
  );

  UI.openModal({
    title: editingActivity ? 'Editar actividad' : 'Nueva actividad grupal',
    contentHtml: `
      <form id="rgl-act-form" class="rgl-form">
        <div class="rgl-field">
          <label>Icono</label>
          <div class="rgl-emoji-grid">
            ${ACTIVITY_ICONS.map(ic => `
              <button type="button" class="rgl-emoji-opt ${selectedIcon === ic ? 'active' : ''}" data-pick-icon="${ic}">${ic}</button>
            `).join('')}
          </div>
        </div>

        <div class="rgl-field">
          <label for="rgl-act-title">Nombre de la actividad</label>
          <input type="text" id="rgl-act-title" maxlength="80" placeholder="${esc(prefill?.titlePlaceholder || 'Ej: Cine – Avengers: Doomsday')}" value="${esc(editingActivity?.title || '')}" required autofocus>
        </div>

        <div class="rgl-grid-2">
          <div class="rgl-field">
            <label for="rgl-act-date">Fecha prevista</label>
            <input type="date" id="rgl-act-date" value="${esc(editingActivity?.date || '')}">
          </div>
          <div class="rgl-field">
            <label for="rgl-act-time">Hora (opcional)</label>
            <input type="time" id="rgl-act-time" value="${esc(editingActivity?.time || '')}">
          </div>
        </div>

        <div class="rgl-field">
          <label for="rgl-act-loc">Lugar (opcional)</label>
          <input type="text" id="rgl-act-loc" maxlength="70" placeholder="Ej: Cinemark, Mirador, Casa de..." value="${esc(editingActivity?.location || '')}">
        </div>

        <div class="rgl-field">
          <label>Estado</label>
          <div class="rgl-status-selector">
            ${ACTIVITY_STATUSES.map(s => `
              <button type="button" class="rgl-st-choice ${s.cls} ${selectedStatus === s.id ? 'active' : ''}" data-pick-st="${esc(s.id)}">${esc(s.label)}</button>
            `).join('')}
          </div>
        </div>

        <div class="rgl-field">
          <label for="rgl-act-desc">Descripción (opcional)</label>
          <textarea id="rgl-act-desc" rows="2" placeholder="Detalles útiles del plan...">${esc(editingActivity?.description || '')}</textarea>
        </div>

        <div class="rgl-field">
          <label>Integrantes participantes</label>
          <div class="rgl-member-picker">
            ${members.map(m => {
              const active = selectedParticipants.has(m.id);
              return `
                <button type="button" class="rgl-member-chip ${active ? 'active' : ''}" data-pick-part="${esc(m.id)}">
                  <img src="${esc(m.avatar || DEFAULT_AVATAR)}" alt="">
                  <span>${esc((m.name || 'Miembro').split(' ')[0])}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="rgl-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rgl-act-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm">${editingActivity ? 'Guardar cambios' : 'Crear actividad'}</button>
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-pick-icon]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedIcon = btn.getAttribute('data-pick-icon');
          modalEl.querySelectorAll('[data-pick-icon]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      modalEl.querySelectorAll('[data-pick-st]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedStatus = btn.getAttribute('data-pick-st');
          modalEl.querySelectorAll('[data-pick-st]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      modalEl.querySelectorAll('[data-pick-part]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mid = btn.getAttribute('data-pick-part');
          if (selectedParticipants.has(mid)) selectedParticipants.delete(mid);
          else selectedParticipants.add(mid);
          btn.classList.toggle('active', selectedParticipants.has(mid));
        });
      });

      document.getElementById('rgl-act-cancel')?.addEventListener('click', () => UI.closeModal());

      document.getElementById('rgl-act-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const title = document.getElementById('rgl-act-title')?.value.trim();
        if (!title) return;

        const payload = {
          icon: selectedIcon,
          title,
          date: document.getElementById('rgl-act-date')?.value || '',
          time: document.getElementById('rgl-act-time')?.value || '',
          location: document.getElementById('rgl-act-loc')?.value.trim() || '',
          status: selectedStatus,
          description: document.getElementById('rgl-act-desc')?.value.trim() || '',
          participantIds: Array.from(selectedParticipants)
        };

        if (editingActivity) {
          store.updateActivityInActiveGroup(editingActivity.id, payload);
          UI.closeModal();
          UI.showToast('Actividad actualizada ✨', 'success');
        } else {
          const created = store.addActivityToActiveGroup(payload);
          UI.closeModal();
          UI.showToast(`Actividad "${title}" creada 🎉`, 'success');
          if (created && typeof onCreated === 'function') onCreated(created);
        }
      });
    }
  });
}

function openParticipantsModal(group, act) {
  const members = group.members || [];
  const selected = new Set(act.participantIds || []);

  UI.openModal({
    title: 'Integrantes participantes',
    contentHtml: `
      <div class="rgl-form">
        <p style="margin:0;font-size:0.82rem;color:#cbbbe6;">Toca los integrantes del grupo que participan en <b>${esc(act.title)}</b>.</p>
        <div class="rgl-member-picker">
          ${members.map(m => `
            <button type="button" class="rgl-member-chip ${selected.has(m.id) ? 'active' : ''}" data-part-toggle="${esc(m.id)}">
              <img src="${esc(m.avatar || DEFAULT_AVATAR)}" alt="">
              <span>${esc(m.name || 'Miembro')}</span>
            </button>
          `).join('')}
        </div>
        ${members.length <= 1 ? `
          <div style="font-size:0.76rem;color:var(--text-muted);">Invita más personas al grupo desde el encabezado para asignarles responsabilidades.</div>
        ` : ''}
        <div class="rgl-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rgl-part-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary btn-sm" id="rgl-part-save">Guardar</button>
        </div>
      </div>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-part-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-part-toggle');
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          btn.classList.toggle('active', selected.has(id));
        });
      });
      document.getElementById('rgl-part-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('rgl-part-save')?.addEventListener('click', () => {
        store.updateActivityInActiveGroup(act.id, { participantIds: Array.from(selected) });
        UI.closeModal();
        UI.showToast('Participantes actualizados', 'success');
      });
    }
  });
}

function openActivityOptionsSheet(group, user, act, prog, { onEdit, onParticipants, onQuote, onDelete }) {
  UI.openModal({
    title: 'Opciones de la actividad',
    contentHtml: `
      <div class="rgl-sheet">
        <div style="display:flex;align-items:center;gap:0.65rem;padding:0.6rem;border-radius:0.9rem;background:rgba(255,255,255,0.04);border:1px solid rgba(192,132,252,0.18);">
          <div class="rgl-icon-badge" style="width:2.4rem;height:2.4rem;font-size:1.2rem;">${esc(act.icon || '🎉')}</div>
          <div style="min-width:0;flex:1;">
            <b style="display:block;font-size:0.92rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(act.title)}</b>
            <small style="font-size:0.74rem;color:#b8a3d9;">${prog.done}/${prog.total} responsabilidades · ${prog.pct}%</small>
          </div>
        </div>

        <div class="rgl-sheet-list">
          <button type="button" class="rgl-sheet-row" id="rgl-as-edit">
            <span class="rgl-sheet-ico">${svg(ICO.edit, 16)}</span>
            <span class="rgl-sheet-txt"><span>Editar actividad</span><small>Nombre, fecha, lugar, icono o descripción</small></span>
          </button>

          <button type="button" class="rgl-sheet-row" id="rgl-as-parts">
            <span class="rgl-sheet-ico">${svg(ICO.users, 16)}</span>
            <span class="rgl-sheet-txt"><span>Gestionar participantes</span><small>Elegir quiénes van a esta actividad</small></span>
          </button>

          ${onQuote ? `
            <button type="button" class="rgl-sheet-row" id="rgl-as-quote">
              <span class="rgl-sheet-ico">${svg(ICO.chat, 16)}</span>
              <span class="rgl-sheet-txt"><span>Compartir en el chat</span><small>Enviar este plan a la conversación del grupo</small></span>
            </button>
          ` : ''}

          <button type="button" class="rgl-sheet-row danger" id="rgl-as-delete">
            <span class="rgl-sheet-ico">${svg(ICO.trash, 16)}</span>
            <span class="rgl-sheet-txt"><span>Eliminar actividad</span><small>También se eliminarán sus responsabilidades</small></span>
          </button>
        </div>
      </div>
    `,
    onMount: () => {
      const go = (id, fn) => document.getElementById(id)?.addEventListener('click', () => { UI.closeModal(); if (fn) fn(); });
      go('rgl-as-edit', onEdit);
      go('rgl-as-parts', onParticipants);
      go('rgl-as-quote', onQuote);
      go('rgl-as-delete', onDelete);
    }
  });
}

function confirmDeleteActivity(act, onDeleted) {
  UI.openModal({
    title: '¿Eliminar actividad?',
    contentHtml: `
      <div class="rgl-form">
        <p style="margin:0;font-size:0.86rem;color:#dcd0f5;line-height:1.48;">
          Se eliminará <b>${esc(act.icon || '🎉')} ${esc(act.title)}</b> junto con sus ${(act.tasks || []).length} responsabilidades. Esta acción no se puede deshacer.
        </p>
        <div class="rgl-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rgl-del-act-cancel">Cancelar</button>
          <button type="button" class="btn btn-danger btn-sm" id="rgl-del-act-ok">Eliminar</button>
        </div>
      </div>
    `,
    onMount: () => {
      document.getElementById('rgl-del-act-cancel')?.addEventListener('click', () => UI.closeModal());
      document.getElementById('rgl-del-act-ok')?.addEventListener('click', () => {
        if (typeof onDeleted === 'function') onDeleted();
        store.deleteActivityFromActiveGroup(act.id);
        UI.closeModal();
        UI.showToast('Actividad eliminada', 'info');
      });
    }
  });
}

// ============================================================================
// MODALES Y ACTION SHEETS: RESPONSABILIDADES (TAREAS VINCULADAS)
// ============================================================================
function openTaskModal(group, user, act, editingTask = null) {
  const members = group.members || [];
  // Mostrar primero los participantes de la actividad y luego los demás miembros del grupo
  const partSet = new Set(act.participantIds || []);
  const orderedMembers = [
    ...members.filter(m => partSet.has(m.id)),
    ...members.filter(m => !partSet.has(m.id))
  ];

  let selectedAssigneeId = editingTask ? (editingTask.assigneeId || '') : user.id;
  let showOptional = Boolean(editingTask && (editingTask.description || editingTask.dueDate));

  UI.openModal({
    title: editingTask ? 'Editar responsabilidad' : 'Nueva responsabilidad',
    contentHtml: `
      <form id="rgl-task-form" class="rgl-form">
        <div class="rgl-field">
          <label for="rgl-task-title">¿Qué hay que hacer?</label>
          <input type="text" id="rgl-task-title" maxlength="100" placeholder="Ej: Comprar boletas, llevar carro..." value="${esc(editingTask?.title || '')}" required autofocus>
        </div>

        <div class="rgl-field">
          <label>Responsable</label>
          <div class="rgl-member-picker">
            ${orderedMembers.map(m => `
              <button type="button" class="rgl-member-chip ${selectedAssigneeId === m.id ? 'active' : ''}" data-pick-assignee="${esc(m.id)}">
                <img src="${esc(m.avatar || DEFAULT_AVATAR)}" alt="">
                <span>${esc((m.name || 'Miembro').split(' ')[0])}</span>
              </button>
            `).join('')}
            <button type="button" class="rgl-member-chip no-avatar ${selectedAssigneeId === '' ? 'active' : ''}" data-pick-assignee="">
              <span>Sin asignar</span>
            </button>
          </div>
        </div>

        <button type="button" class="rgl-opt-toggle" id="rgl-task-opt-toggle">
          ${showOptional ? '− Ocultar detalles opcionales' : '+ Fecha límite o descripción (opcional)'}
        </button>

        <div class="rgl-opt-box" id="rgl-task-opt-box" style="display:${showOptional ? 'flex' : 'none'};">
          <div class="rgl-field">
            <label for="rgl-task-due">Fecha límite (opcional)</label>
            <input type="date" id="rgl-task-due" value="${esc(editingTask?.dueDate || '')}">
          </div>
          <div class="rgl-field">
            <label for="rgl-task-desc">Descripción (opcional)</label>
            <textarea id="rgl-task-desc" rows="2" placeholder="Detalles, links o notas sobre esta tarea...">${esc(editingTask?.description || '')}</textarea>
          </div>
        </div>

        <div class="rgl-modal-foot">
          ${editingTask ? `
            <button type="button" class="btn btn-danger btn-sm" id="rgl-task-delete">Eliminar</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar cambios</button>
          ` : `
            <button type="button" class="btn btn-secondary btn-sm" id="rgl-task-save-more">Guardar y otra</button>
            <button type="submit" class="btn btn-primary btn-sm">Guardar</button>
          `}
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      const titleInp = document.getElementById('rgl-task-title');
      const dueInp = document.getElementById('rgl-task-due');
      const descInp = document.getElementById('rgl-task-desc');
      const optBox = document.getElementById('rgl-task-opt-box');
      const optToggle = document.getElementById('rgl-task-opt-toggle');

      modalEl.querySelectorAll('[data-pick-assignee]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedAssigneeId = btn.getAttribute('data-pick-assignee') || '';
          modalEl.querySelectorAll('[data-pick-assignee]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      optToggle?.addEventListener('click', () => {
        showOptional = !showOptional;
        if (optBox) optBox.style.display = showOptional ? 'flex' : 'none';
        optToggle.textContent = showOptional ? '− Ocultar detalles opcionales' : '+ Fecha límite o descripción (opcional)';
      });

      const saveTask = (keepOpen = false) => {
        const title = titleInp?.value.trim();
        if (!title) {
          titleInp?.focus();
          return;
        }
        const payload = {
          title,
          assigneeId: selectedAssigneeId,
          dueDate: dueInp?.value || '',
          description: descInp?.value.trim() || ''
        };

        if (editingTask) {
          store.updateActivityTask(act.id, editingTask.id, payload);
          UI.closeModal();
          UI.showToast('Responsabilidad actualizada', 'success');
        } else {
          store.addTaskToActivity(act.id, payload);
          if (keepOpen) {
            if (titleInp) titleInp.value = '';
            if (descInp) descInp.value = '';
            if (dueInp) dueInp.value = '';
            titleInp?.focus();
            UI.showToast('Responsabilidad añadida ✓', 'success');
          } else {
            UI.closeModal();
            UI.showToast('Responsabilidad añadida ✓', 'success');
          }
        }
      };

      document.getElementById('rgl-task-form')?.addEventListener('submit', e => {
        e.preventDefault();
        saveTask(false);
      });

      document.getElementById('rgl-task-save-more')?.addEventListener('click', () => saveTask(true));

      document.getElementById('rgl-task-delete')?.addEventListener('click', () => {
        store.deleteActivityTask(act.id, editingTask.id);
        UI.closeModal();
        UI.showToast('Responsabilidad eliminada', 'info');
      });
    }
  });
}

function openTaskOptionsSheet(group, user, act, task) {
  const members = group.members || [];

  UI.openModal({
    title: 'Responsabilidad',
    contentHtml: `
      <div class="rgl-sheet">
        <div style="padding:0.65rem 0.78rem;border-radius:0.9rem;background:rgba(255,255,255,0.04);border:1px solid rgba(192,132,252,0.18);">
          <b style="display:block;font-size:0.92rem;color:#fff;">${esc(task.title)}</b>
          ${task.description ? `<small style="display:block;margin-top:0.2rem;font-size:0.76rem;color:#cbbbe6;">${esc(task.description)}</small>` : ''}
        </div>

        <div>
          <div class="rgl-seg-label" style="margin-bottom:0.42rem;">Asignar responsable rápido</div>
          <div class="rgl-member-picker">
            ${members.map(m => `
              <button type="button" class="rgl-member-chip ${task.assigneeId === m.id ? 'active' : ''}" data-quick-assign="${esc(m.id)}">
                <img src="${esc(m.avatar || DEFAULT_AVATAR)}" alt="">
                <span>${esc((m.name || 'Miembro').split(' ')[0])}</span>
              </button>
            `).join('')}
            <button type="button" class="rgl-member-chip no-avatar ${!task.assigneeId ? 'active' : ''}" data-quick-assign="">
              <span>Sin asignar</span>
            </button>
          </div>
        </div>

        <div class="rgl-sheet-list">
          <button type="button" class="rgl-sheet-row" id="rgl-ts-toggle">
            <span class="rgl-sheet-ico">${svg(ICO.check, 16)}</span>
            <span class="rgl-sheet-txt"><span>${task.completed ? 'Marcar como pendiente' : 'Marcar como completada'}</span></span>
          </button>

          <button type="button" class="rgl-sheet-row" id="rgl-ts-edit">
            <span class="rgl-sheet-ico">${svg(ICO.edit, 16)}</span>
            <span class="rgl-sheet-txt"><span>Editar responsabilidad</span><small>Título, descripción o fecha límite</small></span>
          </button>

          <button type="button" class="rgl-sheet-row danger" id="rgl-ts-del">
            <span class="rgl-sheet-ico">${svg(ICO.trash, 16)}</span>
            <span class="rgl-sheet-txt"><span>Eliminar responsabilidad</span></span>
          </button>
        </div>
      </div>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-quick-assign]').forEach(btn => {
        btn.addEventListener('click', () => {
          const mid = btn.getAttribute('data-quick-assign') || '';
          store.updateActivityTask(act.id, task.id, { assigneeId: mid });
          UI.closeModal();
          const m = members.find(x => x.id === mid);
          UI.showToast(m ? `Asignada a ${m.name.split(' ')[0]}` : 'Responsabilidad sin asignar', 'success');
        });
      });

      document.getElementById('rgl-ts-toggle')?.addEventListener('click', () => {
        const res = store.toggleActivityTaskCompleted(act.id, task.id);
        UI.closeModal();
        if (res?.allCompleted && res.completed) {
          fireConfetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
          UI.showToast('¡Todas las responsabilidades listas! 🎉', 'success');
        }
      });

      document.getElementById('rgl-ts-edit')?.addEventListener('click', () => {
        UI.closeModal();
        openTaskModal(group, user, act, task);
      });

      document.getElementById('rgl-ts-del')?.addEventListener('click', () => {
        store.deleteActivityTask(act.id, task.id);
        UI.closeModal();
        UI.showToast('Responsabilidad eliminada', 'info');
      });
    }
  });
}

// ============================================================================
// MODALES Y ACTION SHEETS: METAS GRUPALES
// ============================================================================
function openGoalModal({ editingGoal = null, prefill = null } = {}) {
  let selectedIcon = editingGoal?.icon || prefill?.icon || '🎯';
  let selectedCat = editingGoal?.category || prefill?.category || 'General';

  UI.openModal({
    title: editingGoal ? 'Editar meta grupal' : 'Nueva meta grupal',
    contentHtml: `
      <form id="rgl-goal-form" class="rgl-form">
        <div class="rgl-field">
          <label>Icono</label>
          <div class="rgl-emoji-grid">
            ${GOAL_ICONS.map(ic => `
              <button type="button" class="rgl-emoji-opt ${selectedIcon === ic ? 'active' : ''}" data-goal-ico="${ic}">${ic}</button>
            `).join('')}
          </div>
        </div>

        <div class="rgl-field">
          <label for="rgl-goal-title">Nombre de la meta</label>
          <input type="text" id="rgl-goal-title" maxlength="90" placeholder="Ej: Ahorrar para viaje a la playa, Crear un proyecto..." value="${esc(editingGoal?.title || prefill?.title || '')}" required autofocus>
        </div>

        <div class="rgl-field">
          <label>Categoría</label>
          <div class="rgl-member-picker">
            ${GOAL_CATEGORIES.map(c => `
              <button type="button" class="rgl-member-chip no-avatar ${selectedCat === c ? 'active' : ''}" data-goal-cat="${esc(c)}">${esc(c)}</button>
            `).join('')}
          </div>
        </div>

        <div class="rgl-field">
          <label for="rgl-goal-date">Fecha objetivo (opcional)</label>
          <input type="date" id="rgl-goal-date" value="${esc(editingGoal?.targetDate || '')}">
        </div>

        <div class="rgl-field">
          <label for="rgl-goal-desc">Descripción (opcional)</label>
          <textarea id="rgl-goal-desc" rows="2" placeholder="¿Qué quieren lograr juntos y por qué es importante?">${esc(editingGoal?.description || '')}</textarea>
        </div>

        <div class="rgl-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rgl-goal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm">${editingGoal ? 'Guardar cambios' : 'Crear meta'}</button>
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-goal-ico]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedIcon = btn.getAttribute('data-goal-ico');
          modalEl.querySelectorAll('[data-goal-ico]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });
      modalEl.querySelectorAll('[data-goal-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedCat = btn.getAttribute('data-goal-cat');
          modalEl.querySelectorAll('[data-goal-cat]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      document.getElementById('rgl-goal-cancel')?.addEventListener('click', () => UI.closeModal());

      document.getElementById('rgl-goal-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const title = document.getElementById('rgl-goal-title')?.value.trim();
        if (!title) return;
        const payload = {
          icon: selectedIcon,
          title,
          category: selectedCat,
          targetDate: document.getElementById('rgl-goal-date')?.value || '',
          description: document.getElementById('rgl-goal-desc')?.value.trim() || ''
        };
        if (editingGoal) {
          store.updateGoalInActiveGroup(editingGoal.id, payload);
          UI.closeModal();
          UI.showToast('Meta actualizada ✨', 'success');
        } else {
          store.addGoalToActiveGroup(payload);
          UI.closeModal();
          UI.showToast('Meta creada 🎯', 'success');
        }
      });
    }
  });
}

function openGoalDetailModal(goalId, user) {
  const renderModal = () => {
    const group = store.getActiveGroup();
    const goal = (group?.goals || []).find(g => g.id === goalId);
    if (!goal) { UI.closeModal(); return; }

    const { totalTasks, doneTasks, pct } = store.getGoalProgress(goal);
    const isDone = Boolean(goal.completed) || pct >= 100;
    const tasks = Array.isArray(goal.tasks) ? goal.tasks : [];

    UI.openModal({
      title: `${goal.icon || '🎯'} ${goal.title}`,
      contentHtml: `
        <div class="rgl-form">
          <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;">
            ${goal.category ? `<span class="rgl-cat-chip">${esc(goal.category)}</span>` : ''}
            ${goal.targetDate ? `<span class="rgl-due-pill">📅 ${esc(formatPlanDate(goal.targetDate))}</span>` : ''}
            ${isDone ? `<span class="rgl-status-pill st-done"><span class="rgl-status-dot"></span>Cumplida</span>` : ''}
          </div>

          ${goal.description ? `<p class="rgl-det-desc">${esc(goal.description)}</p>` : ''}

          <div class="rgl-det-prog">
            <div class="rgl-det-prog-top">
              <span>Progreso de la meta</span>
              <b class="rgl-det-prog-pct ${isDone ? 'is-complete' : ''}">${pct}%</b>
            </div>
            <div class="rgl-prog-track is-lg">
              <i class="rgl-prog-fill ${isDone ? 'is-complete' : ''}" style="width:${pct}%;"></i>
            </div>
            ${totalTasks > 0
              ? `<div class="rgl-det-prog-sub">${doneTasks} de ${totalTasks} pasos completados</div>`
              : `
                <div class="rgl-step-grid" style="margin-top:0.35rem;">
                  <button type="button" class="rgl-step-btn" data-goal-pct="${Math.min(100, pct + 10)}">+10%</button>
                  <button type="button" class="rgl-step-btn" data-goal-pct="${Math.min(100, pct + 25)}">+25%</button>
                  <button type="button" class="rgl-step-btn" data-goal-pct="50">50%</button>
                  <button type="button" class="rgl-step-btn" data-goal-pct="100">100%</button>
                </div>
              `}
          </div>

          <!-- Pasos o tareas relacionadas con esta meta (opcionales) -->
          <div class="rgl-det-block">
            <div class="rgl-block-head">
              <span class="rgl-block-label">Pasos relacionados (${doneTasks}/${totalTasks})</span>
            </div>

            ${tasks.length > 0 ? `
              <div class="rgl-task-list">
                ${tasks.map(t => `
                  <div class="rgl-task-row ${t.completed ? 'is-done' : ''}" style="padding:0.55rem 0.65rem;">
                    <button type="button" class="rgl-check-btn ${t.completed ? 'checked' : ''}" data-goal-toggle-step="${esc(t.id)}" aria-label="Completar paso">
                      <span class="rgl-check-circle">${svg(ICO.check, 12)}</span>
                    </button>
                    <div class="rgl-task-body">
                      <div class="rgl-task-title" style="font-size:0.84rem;">${esc(t.title)}</div>
                    </div>
                    <button type="button" class="rgl-more-btn" data-goal-del-step="${esc(t.id)}" aria-label="Eliminar paso" style="font-size:0.85rem;">✕</button>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div style="font-size:0.78rem;color:var(--text-muted);">Divide esta meta en pasos si quieren llevar un seguimiento detallado.</div>
            `}

            <form id="rgl-goal-add-step-form" class="rgl-inline-add" style="margin-top:0.25rem;">
              <input type="text" id="rgl-goal-step-inp" placeholder="Añadir un paso a esta meta..." maxlength="90" required>
              <button type="submit" class="btn btn-primary btn-sm">+ Añadir</button>
            </form>
          </div>

          <div class="rgl-modal-foot">
            <button type="button" class="btn btn-secondary btn-sm" id="rgl-gd-edit">✎ Editar meta</button>
            <button type="button" class="btn btn-danger btn-sm" id="rgl-gd-delete">Eliminar</button>
          </div>
        </div>
      `,
      onMount: (modalEl) => {
        modalEl.querySelectorAll('[data-goal-pct]').forEach(btn => {
          btn.addEventListener('click', () => {
            const nextPct = Number(btn.getAttribute('data-goal-pct'));
            store.updateGoalInActiveGroup(goal.id, { progress: nextPct });
            if (nextPct >= 100) {
              fireConfetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
              UI.showToast('¡Meta cumplida! 🎉✨', 'success');
            }
            renderModal();
          });
        });

        modalEl.querySelectorAll('[data-goal-toggle-step]').forEach(btn => {
          btn.addEventListener('click', () => {
            const res = store.toggleGoalTask(goal.id, btn.getAttribute('data-goal-toggle-step'));
            if (res?.goalCompleted && res.completed) {
              fireConfetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
              UI.showToast('¡Meta completada al 100%! 🎉', 'success');
            }
            renderModal();
          });
        });

        modalEl.querySelectorAll('[data-goal-del-step]').forEach(btn => {
          btn.addEventListener('click', () => {
            store.deleteGoalTask(goal.id, btn.getAttribute('data-goal-del-step'));
            renderModal();
          });
        });

        document.getElementById('rgl-goal-add-step-form')?.addEventListener('submit', e => {
          e.preventDefault();
          const title = document.getElementById('rgl-goal-step-inp')?.value.trim();
          if (!title) return;
          store.addGoalTask(goal.id, { title, assigneeId: user.id });
          renderModal();
        });

        document.getElementById('rgl-gd-edit')?.addEventListener('click', () => {
          UI.closeModal();
          openGoalModal({ editingGoal: goal });
        });

        document.getElementById('rgl-gd-delete')?.addEventListener('click', () => {
          store.deleteGoalFromActiveGroup(goal.id);
          UI.closeModal();
          UI.showToast('Meta eliminada', 'info');
        });
      }
    });
  };

  renderModal();
}

function openGoalOptionsSheet(goal, user) {
  UI.openModal({
    title: 'Opciones de la meta',
    contentHtml: `
      <div class="rgl-sheet">
        <div class="rgl-sheet-list">
          <button type="button" class="rgl-sheet-row" id="rgl-gs-detail">
            <span class="rgl-sheet-ico">${svg(ICO.target, 16)}</span>
            <span class="rgl-sheet-txt"><span>Ver progreso y pasos</span><small>Actualizar porcentaje o añadir pasos</small></span>
          </button>
          <button type="button" class="rgl-sheet-row" id="rgl-gs-edit">
            <span class="rgl-sheet-ico">${svg(ICO.edit, 16)}</span>
            <span class="rgl-sheet-txt"><span>Editar meta</span></span>
          </button>
          <button type="button" class="rgl-sheet-row" id="rgl-gs-toggle">
            <span class="rgl-sheet-ico">${svg(ICO.check, 16)}</span>
            <span class="rgl-sheet-txt"><span>${goal.completed ? 'Marcar como activa' : 'Marcar como cumplida'}</span></span>
          </button>
          <button type="button" class="rgl-sheet-row danger" id="rgl-gs-del">
            <span class="rgl-sheet-ico">${svg(ICO.trash, 16)}</span>
            <span class="rgl-sheet-txt"><span>Eliminar meta</span></span>
          </button>
        </div>
      </div>
    `,
    onMount: () => {
      document.getElementById('rgl-gs-detail')?.addEventListener('click', () => { UI.closeModal(); openGoalDetailModal(goal.id, user); });
      document.getElementById('rgl-gs-edit')?.addEventListener('click', () => { UI.closeModal(); openGoalModal({ editingGoal: goal }); });
      document.getElementById('rgl-gs-toggle')?.addEventListener('click', () => {
        const done = store.toggleGoalCompleted(goal.id);
        UI.closeModal();
        if (done) {
          fireConfetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
          UI.showToast('¡Meta cumplida! 🎉✨', 'success');
        }
      });
      document.getElementById('rgl-gs-del')?.addEventListener('click', () => {
        store.deleteGoalFromActiveGroup(goal.id);
        UI.closeModal();
        UI.showToast('Meta eliminada', 'info');
      });
    }
  });
}

// ============================================================================
// MODALES Y ACTION SHEETS: NOTAS COMPARTIDAS
// ============================================================================
function openNoteModal({ editingNote = null, prefillCategory = null } = {}) {
  let selectedCat = editingNote?.category || prefillCategory || 'Idea';
  if (!NOTE_CATEGORIES.some(c => c.id.toLowerCase() === String(selectedCat).toLowerCase())) {
    selectedCat = 'Idea';
  }

  UI.openModal({
    title: editingNote ? 'Editar nota' : 'Nueva nota compartida',
    contentHtml: `
      <form id="rgl-note-form" class="rgl-form">
        <div class="rgl-field">
          <label>Tipo de nota</label>
          <div class="rgl-member-picker">
            ${NOTE_CATEGORIES.map(c => `
              <button type="button" class="rgl-member-chip no-avatar ${selectedCat.toLowerCase() === c.id.toLowerCase() ? 'active' : ''}" data-note-cat="${esc(c.id)}">
                ${c.emoji} ${c.label}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="rgl-field">
          <label for="rgl-note-title">Título</label>
          <input type="text" id="rgl-note-title" maxlength="80" placeholder="Ej: Lista para el viaje, Idea de salida..." value="${esc(editingNote?.title || '')}" required autofocus>
        </div>

        <div class="rgl-field">
          <label for="rgl-note-content">Contenido</label>
          <textarea id="rgl-note-content" rows="4" placeholder="Escribe una idea, recordatorio, mensaje o dato útil para el grupo..." required>${esc(editingNote?.content || '')}</textarea>
        </div>

        <label class="rgl-check-toggle">
          <input type="checkbox" id="rgl-note-pinned" ${editingNote?.pinned ? 'checked' : ''}>
          <span>📌 Fijar arriba en las notas del grupo</span>
        </label>

        <div class="rgl-modal-foot">
          <button type="button" class="btn btn-secondary btn-sm" id="rgl-note-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary btn-sm">${editingNote ? 'Guardar cambios' : 'Publicar nota'}</button>
        </div>
      </form>
    `,
    onMount: (modalEl) => {
      modalEl.querySelectorAll('[data-note-cat]').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedCat = btn.getAttribute('data-note-cat');
          modalEl.querySelectorAll('[data-note-cat]').forEach(b => b.classList.toggle('active', b === btn));
        });
      });

      document.getElementById('rgl-note-cancel')?.addEventListener('click', () => UI.closeModal());

      document.getElementById('rgl-note-form')?.addEventListener('submit', e => {
        e.preventDefault();
        const title = document.getElementById('rgl-note-title')?.value.trim();
        const content = document.getElementById('rgl-note-content')?.value.trim();
        const pinned = Boolean(document.getElementById('rgl-note-pinned')?.checked);
        if (!title && !content) return;

        if (editingNote) {
          store.updateNoteInActiveGroup(editingNote.id, { title, category: selectedCat, content, pinned });
          UI.closeModal();
          UI.showToast('Nota actualizada ✨', 'success');
        } else {
          store.addNoteToActiveGroup({ title, category: selectedCat, content, pinned });
          UI.closeModal();
          UI.showToast('Nota publicada 📝', 'success');
        }
      });
    }
  });
}

function openNoteOptionsSheet(note) {
  UI.openModal({
    title: 'Opciones de la nota',
    contentHtml: `
      <div class="rgl-sheet">
        <div class="rgl-sheet-list">
          <button type="button" class="rgl-sheet-row" id="rgl-ns-pin">
            <span class="rgl-sheet-ico">${svg(ICO.pin, 16)}</span>
            <span class="rgl-sheet-txt"><span>${note.pinned ? 'Quitar de fijadas' : 'Fijar nota arriba'}</span></span>
          </button>
          <button type="button" class="rgl-sheet-row" id="rgl-ns-edit">
            <span class="rgl-sheet-ico">${svg(ICO.edit, 16)}</span>
            <span class="rgl-sheet-txt"><span>Editar nota</span></span>
          </button>
          <button type="button" class="rgl-sheet-row danger" id="rgl-ns-del">
            <span class="rgl-sheet-ico">${svg(ICO.trash, 16)}</span>
            <span class="rgl-sheet-txt"><span>Eliminar nota</span></span>
          </button>
        </div>
      </div>
    `,
    onMount: () => {
      document.getElementById('rgl-ns-pin')?.addEventListener('click', () => {
        const pinned = store.toggleNotePinned(note.id);
        UI.closeModal();
        UI.showToast(pinned ? 'Nota fijada arriba 📌' : 'Nota desfijada', 'success');
      });
      document.getElementById('rgl-ns-edit')?.addEventListener('click', () => {
        UI.closeModal();
        openNoteModal({ editingNote: note });
      });
      document.getElementById('rgl-ns-del')?.addEventListener('click', () => {
        store.deleteNoteFromActiveGroup(note.id);
        UI.closeModal();
        UI.showToast('Nota eliminada', 'info');
      });
    }
  });
}
