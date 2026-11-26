// Vista modular del Chat del Grupo (eliminación definitiva por autor/admin, selección múltiple, edición, mensajes fijados, borrador persistente, scroll inteligente y voz con vista previa)
import { store } from '../core/store.js';
import { Entitlements } from '../core/entitlements.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { MusicService } from '../services/music-service.js';
import { CloudSync } from '../services/cloud-sync.js';

const svg = (inner, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICO = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  photo: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5-6 6-2-2-5 5"/>',
  video: '<rect x="2.5" y="6" width="14" height="12" rx="2.2"/><path d="m16.5 10 5-3v10l-5-3z"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5 10.5a7 7 0 0 0 14 0M12 17.5V21M8.5 21h7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  moreVert: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'
};

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😮', '😢'];

const chatUiState = {
  searchOpen: false,
  searchQuery: '',
  drafts: {}, // { [groupId]: string }
  scrollByGroup: {}, // { [groupId]: { top, atBottom } }
  forceScrollBottom: false,
  selectMode: false,
  selectGroupId: null,
  selectedIds: new Set()
};

let unsubscribeChatMusic = null;

function dayLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return 'Hoy';
  const now = new Date();
  const key = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return 'Hoy';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (key(d) === key(y)) return 'Ayer';
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(d);
}

function compressImageFile(file, maxDim = 960, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        c.getContext('2d').drawImage(img, 0, 0, width, height);
        const out = c.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve(out);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Error leyendo archivo'));
    r.readAsDataURL(blob);
  });
}

function senderAvatarFor(msg, group) {
  const m = (group.members || []).find(x => x.id === msg.senderId);
  return m?.avatar || msg.senderAvatar || 'assets/ruma_default_avatar.png';
}

function senderNameFor(msg, group) {
  const m = (group.members || []).find(x => x.id === msg.senderId);
  return m?.name || msg.senderName || 'Miembro';
}

/** Sanitiza texto y convierte URLs http(s) válidas en enlaces clicables seguros. */
function formatChatTextHtml(raw) {
  const text = String(raw || '');
  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    out += Utils.sanitize(text.slice(lastIdx, m.index));
    let url = m[0];
    let trail = '';
    while (url.length > 8 && /[.,!?;:)\]]$/.test(url)) {
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    const safeUrl = Utils.sanitize(url);
    out += `<a class="rch-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>${Utils.sanitize(trail)}`;
    lastIdx = m.index + m[0].length;
  }
  out += Utils.sanitize(text.slice(lastIdx));
  return out;
}

function messagePreviewText(msg) {
  if (!msg) return '';
  if (msg.text) return msg.text;
  if (msg.media) {
    return msg.media.type === 'image' ? '🖼️ Foto' : (msg.media.type === 'video' ? '🎬 Vídeo' : '🎙️ Nota de voz');
  }
  return msg.quote?.title || 'Mensaje';
}

function renderQuoteHtml(msg, playingTrackId) {
  const q = msg.quote;
  if (!q) return '';
  if (q.type === 'message') {
    const isDeleted = Boolean(q.deleted);
    return `
      <div class="rch-reply-box ${isDeleted ? 'is-deleted' : ''}" ${isDeleted ? '' : `data-jump-msg="${Utils.sanitize(q.itemId || '')}"`}>
        <b>${Utils.sanitize((q.label || 'Respuesta').replace(/^💬\s*Respuesta a\s*/i, ''))}</b>
        <span>${isDeleted ? '🚫 Mensaje eliminado' : Utils.sanitize(q.title || '')}</span>
      </div>`;
  }
  const isSong = q.type === 'song';
  const isPlaying = Boolean(isSong && playingTrackId && playingTrackId === q.itemId);
  return `
    <div class="rch-quote-card" data-jump-quote-type="${Utils.sanitize(q.type || '')}" data-jump-quote-id="${Utils.sanitize(q.itemId || '')}">
      ${q.thumb ? `
        <div class="rch-qthumb-wrap">
          <img src="${Utils.sanitize(q.thumb)}" alt="" class="rch-qthumb">
          ${isSong ? `<button type="button" class="rch-qplay" data-chat-play-song="${Utils.sanitize(q.itemId || '')}" aria-label="Reproducir canción">${isPlaying ? '⏸' : '▶'}</button>` : ''}
        </div>` : ''}
      <div class="rch-qinfo">
        <div class="rch-qlabel">${Utils.sanitize(q.label || '')}</div>
        <div class="rch-qtitle">${Utils.sanitize(q.title || '')}</div>
        ${q.subtitle ? `<div class="rch-qsub">${Utils.sanitize(q.subtitle)}</div>` : ''}
      </div>
    </div>`;
}

function buildResolvedMediaHtml(type, url, duration = '') {
  if (!url) return '';
  if (type === 'image') {
    return `<img src="${Utils.sanitize(url)}" alt="Foto adjunta" class="rch-media-img" data-zoom-img="${Utils.sanitize(url)}">`;
  }
  if (type === 'video') {
    return `<video src="${Utils.sanitize(url)}" controls playsinline webkit-playsinline preload="metadata" class="rch-media-vid"></video>`;
  }
  if (type === 'audio') {
    return `
      <div class="rch-media-aud">
        <span>🎙️ Nota de voz${duration ? ` · ${Utils.sanitize(duration)}` : ''}</span>
        <audio src="${Utils.sanitize(url)}" controls preload="metadata"></audio>
      </div>`;
  }
  return '';
}

function renderMediaHtml(msg) {
  const m = msg.media;
  if (!m) return '';
  if (m.url) {
    return buildResolvedMediaHtml(m.type, m.url, m.duration || '');
  }
  if (m.id) {
    const label = m.type === 'video' ? '🎬 Cargando vídeo...' : (m.type === 'audio' ? '🎙️ Cargando audio...' : '🖼️ Cargando foto...');
    return `<div class="rch-media-lazy" data-chat-media-id="${Utils.sanitize(m.id)}" data-chat-media-type="${Utils.sanitize(m.type || 'image')}" data-chat-media-dur="${Utils.sanitize(m.duration || '')}" style="padding:0.65rem 0.85rem;border-radius:12px;background:var(--primary-soft);border:1px dashed var(--border-strong);font-size:0.78rem;color:var(--text-muted);">${label}</div>`;
  }
  return '';
}

function renderReactionsHtml(msg, userId) {
  const entries = Object.entries(msg.reactions || {}).filter(([, arr]) => Array.isArray(arr) && arr.length > 0);
  if (!entries.length) return '';
  const id = Utils.sanitize(msg.id);
  return `
    <div class="rch-reacts">
      ${entries.map(([emoji, arr]) => {
        const mine = arr.includes(userId);
        return `<button type="button" class="rch-react-pill ${mine ? 'mine' : ''}" data-react-msg="${id}" data-react-emoji="${Utils.sanitize(emoji)}">${Utils.sanitize(emoji)} <span>${arr.length}</span></button>`;
      }).join('')}
    </div>`;
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(110, Math.max(22, el.scrollHeight))}px`;
}

export function renderGroupChatView(viewport, group, user, ctx) {
  const { getPendingQuote, setPendingQuote, openPickItemModal, rerender } = ctx;

  // Preservar estado previo del textarea si el usuario estaba escribiendo en este mismo grupo
  const prevInp = document.getElementById('rch-text-inp');
  const wasFocusedComposer = Boolean(prevInp && document.activeElement === prevInp);
  const prevSelectionStart = wasFocusedComposer ? prevInp.selectionStart : null;
  const prevSelectionEnd = wasFocusedComposer ? prevInp.selectionEnd : null;
  if (prevInp && prevInp.dataset.groupId === group.id) {
    chatUiState.drafts[group.id] = prevInp.value;
  }

  // Preservar scroll previo antes de reconstruir el DOM
  const prevScrollEl = document.getElementById('rch-scroll');
  if (prevScrollEl && prevScrollEl.dataset.groupId === group.id) {
    const distFromBottom = prevScrollEl.scrollHeight - prevScrollEl.scrollTop - prevScrollEl.clientHeight;
    chatUiState.scrollByGroup[group.id] = {
      top: prevScrollEl.scrollTop,
      atBottom: distFromBottom <= 64
    };
  }

  // Reiniciar modo selección si cambió de grupo
  if (chatUiState.selectGroupId !== group.id) {
    chatUiState.selectMode = false;
    chatUiState.selectGroupId = group.id;
    chatUiState.selectedIds.clear();
  }

  const isAdmin = Entitlements.isGroupAdmin(group, user.id);
  const allMessages = group.messages || [];

  // Limpiar IDs seleccionados que ya no existan
  const liveMsgIds = new Set(allMessages.map(m => m.id));
  Array.from(chatUiState.selectedIds).forEach(id => {
    if (!liveMsgIds.has(id)) chatUiState.selectedIds.delete(id);
  });

  const pinnedMsg = group.pinnedMessageId ? allMessages.find(m => m.id === group.pinnedMessageId) : null;
  const pendingQuote = getPendingQuote();
  const draftValue = chatUiState.drafts[group.id] || '';

  const buildChatRowsHtml = () => {
    const q = chatUiState.searchQuery.trim().toLowerCase();
    const messages = q
      ? allMessages.filter(m =>
          (m.text || '').toLowerCase().includes(q) ||
          senderNameFor(m, group).toLowerCase().includes(q) ||
          (m.quote?.title || '').toLowerCase().includes(q)
        )
      : allMessages;

    if (messages.length === 0) {
      return `
        <div class="rg-card rm-empty" style="margin:auto 0;">
          <b>${q ? 'Sin coincidencias' : `Aún no hay mensajes en ${Utils.sanitize(group.name)}`}</b>
          <span>${q ? 'Prueba con otra palabra o borra el filtro.' : 'Escribe el primer mensaje o pulsa + para compartir fotos, audios o enlazar contenido del grupo.'}</span>
        </div>`;
    }

    const playingTrackId = MusicService.getCurrentPlayingId();
    let lastDay = '';
    return messages.map(msg => {
      const day = dayLabel(msg.timestamp);
      const sep = day !== lastDay ? `<div class="rch-day"><span>${Utils.sanitize(day)}</span></div>` : '';
      lastDay = day;
      const isMine = msg.senderId === user.id;
      const id = Utils.sanitize(msg.id);
      const av = Utils.sanitize(senderAvatarFor(msg, group));
      const displayName = senderNameFor(msg, group);
      const canDel = store.canDeleteChatMessage(group, msg, user);
      const isSelected = chatUiState.selectMode && chatUiState.selectedIds.has(msg.id);
      const isPinned = Boolean(group.pinnedMessageId && group.pinnedMessageId === msg.id);

      return `${sep}
        <div class="rch-row ${isMine ? 'mine' : 'other'} ${chatUiState.selectMode ? 'is-select-mode' : ''} ${isSelected ? 'is-selected' : ''} ${chatUiState.selectMode && !canDel ? 'is-unselectable' : ''}" data-msg-id="${id}" ${chatUiState.selectMode && canDel ? `data-toggle-select="${id}"` : ''}>
          ${chatUiState.selectMode ? `
            <span class="rch-select-chk ${isSelected ? 'checked' : ''} ${canDel ? '' : 'disabled'}" aria-hidden="true">${canDel ? (isSelected ? '✓' : '') : '🔒'}</span>
          ` : ''}
          ${!isMine ? `<button type="button" class="rch-av-btn" data-chat-profile="${Utils.sanitize(msg.senderId || '')}" title="${Utils.sanitize(displayName)}"><img class="rch-av" src="${av}" alt="${Utils.sanitize(displayName)}"></button>` : ''}
          <div class="rch-bubble ${isMine ? 'mine' : 'other'}" data-bubble-msg="${id}">
            <div class="rch-head">
              <strong class="rch-sender">${isMine ? 'Tú' : Utils.sanitize(displayName)}${isPinned ? ' <span class="rch-pin-ico" title="Mensaje fijado">📌</span>' : ''}</strong>
              ${chatUiState.selectMode ? '' : `
                <div class="rch-head-acts">
                  <button type="button" class="rch-ico-act" data-reply-msg="${id}" title="Responder" aria-label="Responder">${svg(ICO.reply, 14)}</button>
                  <button type="button" class="rch-ico-act" data-more-msg="${id}" title="Reaccionar o más opciones" aria-label="Opciones del mensaje">⋯</button>
                </div>
              `}
            </div>
            ${renderQuoteHtml(msg, playingTrackId)}
            ${renderMediaHtml(msg)}
            ${msg.text ? `<div class="rch-text">${formatChatTextHtml(msg.text)}</div>` : ''}
            <div class="rch-foot">
              ${renderReactionsHtml(msg, user.id)}
              <span class="rch-time">
                ${msg.editedAt ? `<span class="rch-edited">editado</span> · ` : ''}${Utils.formatTime(msg.timestamp)}
              </span>
            </div>
          </div>
        </div>`;
    }).join('');
  };

  const q = chatUiState.searchQuery.trim().toLowerCase();

  viewport.innerHTML = `
    <div class="rch-wrap" id="rch-root">
      <!-- Cabecera compacta del chat -->
      <div class="rch-topbar">
        <div class="rch-topbar-info">
          <img class="rch-topbar-av" src="${Utils.sanitize(group.avatar || 'assets/ruma_home_axolotl.png')}" alt="">
          <div class="rch-topbar-txt">
            <b>${Utils.sanitize(group.name)}</b>
            <small>${(group.members || []).length} miembros · ${allMessages.length} ${allMessages.length === 1 ? 'mensaje' : 'mensajes'}</small>
          </div>
        </div>
        <div class="rch-topbar-acts">
          <button type="button" class="rch-top-btn ${chatUiState.searchOpen ? 'active' : ''}" id="rch-toggle-search" title="Buscar en el chat" aria-label="Buscar mensajes">${svg(ICO.search, 16)}</button>
          <button type="button" class="rch-top-btn" id="rch-quick-link" title="Enlazar contenido del grupo" aria-label="Enlazar contenido">${svg(ICO.link, 16)}</button>
          <button type="button" class="rch-top-btn ${chatUiState.selectMode ? 'active' : ''}" id="rch-chat-menu" title="Opciones del chat" aria-label="Opciones del chat">${svg(ICO.moreVert, 16)}</button>
        </div>
      </div>

      ${pinnedMsg ? `
        <div class="rch-pinned-bar" id="rch-pinned-jump" data-jump-msg="${Utils.sanitize(pinnedMsg.id)}">
          <span class="rch-pinned-badge">📌</span>
          <div class="rch-pinned-txt">
            <b>Fijado · ${Utils.sanitize(senderNameFor(pinnedMsg, group))}</b>
            <span>${Utils.sanitize(messagePreviewText(pinnedMsg))}</span>
          </div>
          ${isAdmin ? `<button type="button" class="rch-pinned-x" id="rch-unpin-btn" title="Desfijar mensaje" aria-label="Desfijar mensaje">✕</button>` : ''}
        </div>
      ` : ''}

      ${chatUiState.searchOpen ? `
        <div class="rch-searchbar">
          ${svg(ICO.search, 15)}
          <input type="text" id="rch-search-inp" value="${Utils.sanitize(chatUiState.searchQuery)}" placeholder="Buscar mensajes, personas o contenido..." enterkeyhint="search" autocomplete="off">
          <button type="button" id="rch-search-clear" aria-label="Limpiar" ${chatUiState.searchQuery ? '' : 'hidden'}>✕</button>
        </div>` : ''}

      <div class="rch-scroll-wrap">
        <div class="rch-scroll" id="rch-scroll" data-group-id="${Utils.sanitize(group.id)}">
          ${buildChatRowsHtml()}
        </div>
        <button type="button" class="rch-scroll-bottom-btn" id="rch-scroll-bottom" hidden aria-label="Ir al último mensaje" title="Ir al último mensaje">${svg(ICO.arrowDown, 17)}</button>
      </div>

      ${chatUiState.selectMode ? `
        <div class="rch-bulk-bar">
          <div class="rch-bulk-info">
            <b>${chatUiState.selectedIds.size} seleccionado${chatUiState.selectedIds.size === 1 ? '' : 's'}</b>
            <small>${isAdmin ? 'Admin: puedes borrar cualquier mensaje' : 'Solo puedes seleccionar tus mensajes'}</small>
          </div>
          <div class="rch-bulk-acts">
            <button type="button" class="btn btn-secondary btn-sm" id="rch-bulk-cancel">Cancelar</button>
            <button type="button" class="btn btn-danger btn-sm" id="rch-bulk-delete" ${chatUiState.selectedIds.size === 0 ? 'disabled' : ''}>🗑️ Eliminar (${chatUiState.selectedIds.size})</button>
          </div>
        </div>
      ` : `
        <div class="rch-bottom">
          ${pendingQuote ? `
            <div class="rch-pending">
              <div class="rch-pending-txt">
                <b>${Utils.sanitize(pendingQuote.label || 'Respuesta')}</b>
                <span>${Utils.sanitize(pendingQuote.title || '')}</span>
              </div>
              <button type="button" class="rch-pending-x" id="rch-clear-quote" aria-label="Cancelar respuesta">✕</button>
            </div>` : ''}

          <div class="rch-composer">
            <div class="rch-pop" id="rch-pop" hidden>
              <div class="rch-pop-grid">
                <button type="button" class="rch-pop-tile" id="rch-act-link">
                  <span class="rch-pop-ico t-link">${svg(ICO.link, 20)}</span>
                  <b>Enlazar contenido</b>
                  <small>Cine, música, libros...</small>
                </button>
                <button type="button" class="rch-pop-tile" id="rch-act-photo">
                  <span class="rch-pop-ico t-photo">${svg(ICO.photo, 20)}</span>
                  <b>Foto</b>
                  <small>Galería o cámara</small>
                </button>
                <button type="button" class="rch-pop-tile" id="rch-act-video">
                  <span class="rch-pop-ico t-video">${svg(ICO.video, 20)}</span>
                  <b>Vídeo</b>
                  <small>Clip hasta 2.5 MB</small>
                </button>
                <button type="button" class="rch-pop-tile" id="rch-act-audio">
                  <span class="rch-pop-ico t-audio">${svg(ICO.mic, 20)}</span>
                  <b>Nota de voz</b>
                  <small>Grabar con vista previa</small>
                </button>
              </div>
            </div>

            <input type="file" id="rch-inp-photo" accept="image/*,.heic,.heif" hidden>
            <input type="file" id="rch-inp-video" accept="video/*" hidden>
            <input type="file" id="rch-inp-audio" accept="audio/*" hidden>

            <form id="rch-form" class="rch-form">
              <button type="button" class="rch-plus-btn" id="rch-plus-btn" aria-label="Adjuntar o enlazar" aria-expanded="false">${svg(ICO.plus, 20)}</button>
              <div class="rch-pill">
                <textarea id="rch-text-inp" data-group-id="${Utils.sanitize(group.id)}" rows="1" placeholder="Escribe un mensaje..." autocomplete="off">${Utils.sanitize(draftValue)}</textarea>
              </div>
              <button type="submit" class="rch-send-btn" aria-label="Enviar mensaje">${svg(ICO.send, 18)}</button>
            </form>
          </div>
        </div>
      `}
    </div>`;

  const rootEl = viewport.querySelector('#rch-root');
  const scrollBox = viewport.querySelector('#rch-scroll');
  const scrollBottomBtn = viewport.querySelector('#rch-scroll-bottom');
  const textInp = viewport.querySelector('#rch-text-inp');

  // Auto-ajuste y recuperación de foco/cursor del borrador
  if (textInp) {
    autoResizeTextarea(textInp);
    if (wasFocusedComposer && !chatUiState.selectMode) {
      textInp.focus();
      if (prevSelectionStart !== null) {
        try { textInp.setSelectionRange(prevSelectionStart, prevSelectionEnd ?? prevSelectionStart); } catch (_) {}
      }
    }
    textInp.addEventListener('input', () => {
      chatUiState.drafts[group.id] = textInp.value;
      autoResizeTextarea(textInp);
    });
    textInp.addEventListener('keydown', (e) => {
      const isDesktop = window.matchMedia && window.matchMedia('(min-width: 768px) and (pointer: fine)').matches;
      if (isDesktop && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        viewport.querySelector('#rch-form')?.requestSubmit();
      }
    });
  }

  // Scroll inteligente: conservar posición si el usuario estaba leyendo arriba; ir al final si estaba abajo o acaba de enviar
  const updateScrollBottomBtn = () => {
    if (!scrollBox || !scrollBottomBtn) return;
    const dist = scrollBox.scrollHeight - scrollBox.scrollTop - scrollBox.clientHeight;
    scrollBottomBtn.hidden = dist <= 120;
    chatUiState.scrollByGroup[group.id] = { top: scrollBox.scrollTop, atBottom: dist <= 64 };
  };

  if (scrollBox && !q) {
    const saved = chatUiState.scrollByGroup[group.id];
    if (chatUiState.forceScrollBottom || !saved || saved.atBottom) {
      scrollBox.scrollTop = scrollBox.scrollHeight;
      chatUiState.forceScrollBottom = false;
    } else {
      scrollBox.scrollTop = Math.min(saved.top, scrollBox.scrollHeight);
    }
    updateScrollBottomBtn();
    scrollBox.addEventListener('scroll', updateScrollBottomBtn, { passive: true });
  }

  scrollBottomBtn?.addEventListener('click', () => {
    if (!scrollBox) return;
    scrollBox.scrollTo({ top: scrollBox.scrollHeight, behavior: 'smooth' });
  });

  // Helper: resaltar y saltar a un mensaje concreto
  const jumpToMessage = (msgId) => {
    if (!msgId) return;
    const target = viewport.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
    if (!target) {
      UI.showToast('Ese mensaje ya no está visible en el filtro actual.', 'info');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const bubble = target.querySelector('.rch-bubble');
    if (bubble) {
      bubble.classList.remove('is-highlight');
      void bubble.offsetWidth;
      bubble.classList.add('is-highlight');
      setTimeout(() => bubble.classList.remove('is-highlight'), 1400);
    }
  };

  // Confirmación de eliminación definitiva (1 o varios mensajes)
  const confirmDeleteMessages = (ids = [], label = '') => {
    const clean = (ids || []).filter(Boolean);
    if (!clean.length) return;
    const plural = clean.length > 1;
    UI.openModal({
      title: plural ? `🗑️ Eliminar ${clean.length} mensajes` : '🗑️ Eliminar mensaje definitivamente',
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:0.9rem;">
          <p style="margin:0;font-size:0.88rem;line-height:1.5;color:var(--text-secondary);">
            ${plural
              ? `¿Seguro que quieres eliminar definitivamente <strong>${clean.length} mensajes</strong>? Se borrarán para todos los miembros del grupo (incluyendo fotos/audios adjuntos) y no se podrán recuperar.`
              : `¿Seguro que quieres eliminar definitivamente ${label ? `el mensaje de <strong>${Utils.sanitize(label)}</strong>` : 'este mensaje'}? Desaparecerá para todos los miembros del grupo y no se podrá recuperar.`}
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="rch-del-cancel" style="justify-content:center;">Cancelar</button>
            <button type="button" class="btn btn-danger btn-sm" id="rch-del-confirm" style="justify-content:center;">Eliminar definitivamente</button>
          </div>
        </div>`,
      onMount: () => {
        document.getElementById('rch-del-cancel')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('rch-del-confirm')?.addEventListener('click', () => {
          const res = store.deleteChatMessagesBulk(clean);
          UI.closeModal();
          if (res.ok) {
            chatUiState.selectMode = false;
            chatUiState.selectedIds.clear();
            UI.showToast(
              res.deletedCount > 1
                ? `${res.deletedCount} mensajes eliminados definitivamente 🗑️`
                : 'Mensaje eliminado definitivamente 🗑️',
              'info'
            );
          } else {
            UI.showToast(res.error || 'No se pudo eliminar.', 'error');
          }
        });
      }
    });
  };

  // Modal de confirmación para vaciar todo el chat (solo administrador)
  const confirmClearChat = () => {
    if (!isAdmin) return;
    UI.openModal({
      title: '🧹 Vaciar todo el chat',
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:0.9rem;">
          <p style="margin:0;font-size:0.88rem;line-height:1.5;color:var(--text-secondary);">
            Esta acción de <strong>administrador</strong> eliminará definitivamente los <strong>${allMessages.length} mensajes</strong> y archivos adjuntos del chat para <strong>todos los miembros</strong> de <strong>${Utils.sanitize(group.name)}</strong>.
          </p>
          <div style="padding:0.65rem 0.8rem;border-radius:var(--radius-md);background:var(--error-soft);border:1px solid rgba(220,38,38,0.35);color:var(--error);font-size:0.8rem;font-weight:700;">
            ⚠️ Esta acción es permanente y no se puede deshacer.
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="rch-clr-cancel" style="justify-content:center;">Cancelar</button>
            <button type="button" class="btn btn-danger btn-sm" id="rch-clr-confirm" style="justify-content:center;">Sí, vaciar todo</button>
          </div>
        </div>`,
      onMount: () => {
        document.getElementById('rch-clr-cancel')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('rch-clr-confirm')?.addEventListener('click', () => {
          const res = store.clearGroupChat();
          UI.closeModal();
          if (res.ok) {
            chatUiState.selectMode = false;
            chatUiState.selectedIds.clear();
            UI.showToast('Chat vaciado definitivamente 🧹', 'info');
          } else {
            UI.showToast(res.error || 'No se pudo vaciar el chat.', 'error');
          }
        });
      }
    });
  };

  // Modal de edición de mensaje propio
  const openEditMessageModal = (msg) => {
    if (!store.canEditChatMessage(group, msg, user)) return;
    UI.openModal({
      title: '✏️ Editar mensaje',
      contentHtml: `
        <form id="rch-edit-form" style="display:flex;flex-direction:column;gap:0.85rem;">
          <textarea id="rch-edit-inp" class="form-input" rows="4" style="resize:vertical;min-height:92px;" placeholder="Escribe tu mensaje...">${Utils.sanitize(msg.text || '')}</textarea>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.55rem;">
            <button type="button" class="btn btn-secondary btn-sm" id="rch-edit-cancel" style="justify-content:center;">Cancelar</button>
            <button type="submit" class="btn btn-primary btn-sm" style="justify-content:center;">Guardar cambios</button>
          </div>
        </form>`,
      onMount: () => {
        const inp = document.getElementById('rch-edit-inp');
        if (inp) {
          inp.focus();
          try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {}
        }
        document.getElementById('rch-edit-cancel')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('rch-edit-form')?.addEventListener('submit', (e) => {
          e.preventDefault();
          const res = store.editChatMessage(msg.id, inp?.value || '');
          if (!res.ok) {
            UI.showToast(res.error || 'No se pudo editar.', 'error');
            return;
          }
          UI.closeModal();
          UI.showToast('Mensaje editado ✏️', 'success');
        });
      }
    });
  };

  // Menú ⋮ de la barra superior del chat (Selección múltiple + Vaciar chat solo admin)
  viewport.querySelector('#rch-chat-menu')?.addEventListener('click', () => {
    if (chatUiState.selectMode) {
      chatUiState.selectMode = false;
      chatUiState.selectedIds.clear();
      rerender();
      return;
    }
    const myDeletableCount = allMessages.filter(m => store.canDeleteChatMessage(group, m, user)).length;
    UI.openModal({
      title: 'Opciones del chat',
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          <button type="button" class="btn btn-secondary" id="rch-opt-select" ${myDeletableCount === 0 ? 'disabled' : ''}>
            ☑️ ${isAdmin ? 'Seleccionar mensajes para borrar (Admin)' : 'Seleccionar mis mensajes para borrar'}
          </button>
          ${isAdmin ? `
            <button type="button" class="btn btn-danger" id="rch-opt-clear" ${allMessages.length === 0 ? 'disabled' : ''}>
              🧹 Vaciar todo el chat (${allMessages.length})
            </button>
            <div style="font-size:0.74rem;color:var(--text-muted);text-align:center;padding:0.4rem;border-radius:0.65rem;background:var(--surface-secondary);">
              🛡️ Como administrador puedes eliminar mensajes de cualquier miembro o vaciar el chat definitivamente.
            </div>
          ` : `
            <div style="font-size:0.74rem;color:var(--text-muted);text-align:center;padding:0.4rem;border-radius:0.65rem;background:var(--surface-secondary);">
              Puedes eliminar definitivamente tus propios mensajes. Solo los administradores pueden eliminar los de otros.
            </div>
          `}
        </div>`,
      onMount: () => {
        document.getElementById('rch-opt-select')?.addEventListener('click', () => {
          UI.closeModal();
          chatUiState.selectMode = true;
          chatUiState.selectGroupId = group.id;
          chatUiState.selectedIds.clear();
          rerender();
        });
        document.getElementById('rch-opt-clear')?.addEventListener('click', () => {
          UI.closeModal();
          confirmClearChat();
        });
      }
    });
  });

  // Controles de la barra de selección múltiple
  if (chatUiState.selectMode) {
    viewport.querySelector('#rch-bulk-cancel')?.addEventListener('click', () => {
      chatUiState.selectMode = false;
      chatUiState.selectedIds.clear();
      rerender();
    });
    viewport.querySelector('#rch-bulk-delete')?.addEventListener('click', () => {
      confirmDeleteMessages(Array.from(chatUiState.selectedIds));
    });
  }

  // Barra de mensaje fijado
  viewport.querySelector('#rch-pinned-jump')?.addEventListener('click', () => {
    const pinnedId = viewport.querySelector('#rch-pinned-jump')?.getAttribute('data-jump-msg');
    if (pinnedId) jumpToMessage(pinnedId);
  });
  viewport.querySelector('#rch-unpin-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const res = store.togglePinChatMessage(null);
    if (res.ok) UI.showToast('Mensaje desfijado', 'info');
  });

  // Buscador en chat (actualización in-situ de #rch-scroll para no cerrar ni romper el teclado en iPhone)
  viewport.querySelector('#rch-toggle-search')?.addEventListener('click', () => {
    chatUiState.searchOpen = !chatUiState.searchOpen;
    if (!chatUiState.searchOpen) chatUiState.searchQuery = '';
    rerender();
    if (chatUiState.searchOpen) viewport.querySelector('#rch-search-inp')?.focus();
  });

  const searchInp = viewport.querySelector('#rch-search-inp');
  const clearSearchBtn = viewport.querySelector('#rch-search-clear');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      chatUiState.searchQuery = e.target.value;
      if (clearSearchBtn) clearSearchBtn.hidden = !chatUiState.searchQuery;
      if (scrollBox) {
        scrollBox.innerHTML = buildChatRowsHtml();
        bindChatScrollEvents(scrollBox);
      }
    });
    searchInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        searchInp.blur();
      }
    });
  }
  clearSearchBtn?.addEventListener('click', () => {
    chatUiState.searchQuery = '';
    if (searchInp) {
      searchInp.value = '';
      searchInp.focus();
    }
    clearSearchBtn.hidden = true;
    if (scrollBox) {
      scrollBox.innerHTML = buildChatRowsHtml();
      bindChatScrollEvents(scrollBox);
      scrollBox.scrollTop = scrollBox.scrollHeight;
    }
  });

  // Popover + (atado a rootEl para no acumular listeners en viewport)
  const pop = viewport.querySelector('#rch-pop');
  const plusBtn = viewport.querySelector('#rch-plus-btn');
  const togglePop = (force) => {
    if (!pop) return;
    const next = typeof force === 'boolean' ? !force : !pop.hidden;
    pop.hidden = next;
    plusBtn?.setAttribute('aria-expanded', String(!next));
  };

  plusBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePop();
  });
  rootEl?.addEventListener('click', (e) => {
    if (pop && !pop.hidden && !pop.contains(e.target) && !plusBtn?.contains(e.target)) togglePop(false);
  });

  viewport.querySelector('#rch-clear-quote')?.addEventListener('click', () => {
    setPendingQuote(null);
    rerender();
  });

  const openLinker = () => {
    togglePop(false);
    openPickItemModal(group, () => {
      rerender();
      viewport.querySelector('#rch-text-inp')?.focus();
    });
  };
  viewport.querySelector('#rch-act-link')?.addEventListener('click', openLinker);
  viewport.querySelector('#rch-quick-link')?.addEventListener('click', openLinker);

  // Foto comprimida
  const photoInp = viewport.querySelector('#rch-inp-photo');
  viewport.querySelector('#rch-act-photo')?.addEventListener('click', () => { togglePop(false); photoInp?.click(); });
  photoInp?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await compressImageFile(f);
      const caption = (chatUiState.drafts[group.id] || '').trim();
      chatUiState.drafts[group.id] = '';
      chatUiState.forceScrollBottom = true;
      store.sendChatMessage({ text: caption, quote: getPendingQuote(), media: { type: 'image', url, name: f.name } });
      setPendingQuote(null);
    } catch (_) {
      UI.showToast('No se pudo procesar la foto.', 'error');
    }
    e.target.value = '';
  });

  // Vídeo
  const videoInp = viewport.querySelector('#rch-inp-video');
  viewport.querySelector('#rch-act-video')?.addEventListener('click', () => { togglePop(false); videoInp?.click(); });
  videoInp?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2.5 * 1024 * 1024) {
      UI.showToast('El vídeo debe pesar máximo 2.5 MB para enviarlo por el chat.', 'error');
      e.target.value = '';
      return;
    }
    try {
      const url = await readAsDataUrl(f);
      const caption = (chatUiState.drafts[group.id] || '').trim();
      chatUiState.drafts[group.id] = '';
      chatUiState.forceScrollBottom = true;
      store.sendChatMessage({ text: caption, quote: getPendingQuote(), media: { type: 'video', url, name: f.name } });
      setPendingQuote(null);
    } catch (_) {
      UI.showToast('No se pudo adjuntar el vídeo.', 'error');
    }
    e.target.value = '';
  });

  // Nota de voz / audio (con vista previa antes de enviar)
  const audioInp = viewport.querySelector('#rch-inp-audio');
  viewport.querySelector('#rch-act-audio')?.addEventListener('click', () => {
    togglePop(false);
    openVoiceRecorderModal({
      onSend: (audioDataUrl, durationLabel) => {
        const caption = (chatUiState.drafts[group.id] || '').trim();
        chatUiState.drafts[group.id] = '';
        chatUiState.forceScrollBottom = true;
        store.sendChatMessage({ text: caption, quote: getPendingQuote(), media: { type: 'audio', url: audioDataUrl, duration: durationLabel } });
        setPendingQuote(null);
      },
      onPickFile: () => audioInp?.click()
    });
  });
  audioInp?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) {
      UI.showToast('El audio debe pesar máximo 1.5 MB.', 'error');
      e.target.value = '';
      return;
    }
    try {
      const url = await readAsDataUrl(f);
      chatUiState.forceScrollBottom = true;
      store.sendChatMessage({ text: '', quote: getPendingQuote(), media: { type: 'audio', url, name: f.name } });
      setPendingQuote(null);
    } catch (_) {
      UI.showToast('No se pudo adjuntar el audio.', 'error');
    }
    e.target.value = '';
  });

  // Responder mensaje
  const replyToMsg = (msg) => {
    const senderLabel = senderNameFor(msg, group);
    setPendingQuote({
      type: 'message',
      itemId: msg.id,
      label: `💬 Respuesta a ${senderLabel}`,
      title: messagePreviewText(msg),
      subtitle: Utils.formatTime(msg.timestamp),
      thumb: ''
    });
    rerender();
    viewport.querySelector('#rch-text-inp')?.focus();
  };

  // Menú ⋯ / long-press de cada mensaje
  const openMessageActionsModal = (m) => {
    if (!m) return;
    const canDelete = store.canDeleteChatMessage(group, m, user);
    const canEdit = store.canEditChatMessage(group, m, user);
    const isPinned = Boolean(group.pinnedMessageId && group.pinnedMessageId === m.id);
    const displayName = senderNameFor(m, group);

    UI.openModal({
      title: `Mensaje de ${displayName}`,
      contentHtml: `
        <div style="display:flex;flex-direction:column;gap:.75rem;">
          <div class="rch-quick-reacts">
            ${QUICK_REACTIONS.map(em => {
              const active = Array.isArray(m.reactions?.[em]) && m.reactions[em].includes(user.id);
              return `<button type="button" class="rch-qreact-btn ${active ? 'active' : ''}" data-pick-react="${em}">${em}</button>`;
            }).join('')}
          </div>
          <div style="display:flex;flex-direction:column;gap:.5rem;">
            <button type="button" class="btn btn-secondary" id="ch-m-reply">↩ Responder</button>
            ${m.text ? `<button type="button" class="btn btn-secondary" id="ch-m-copy">📋 Copiar texto</button>` : ''}
            ${canEdit ? `<button type="button" class="btn btn-secondary" id="ch-m-edit">✏️ Editar mensaje</button>` : ''}
            ${isAdmin ? `<button type="button" class="btn btn-secondary" id="ch-m-pin">${isPinned ? '📌 Desfijar del chat' : '📌 Fijar arriba en el chat'}</button>` : ''}
            ${canDelete ? `<button type="button" class="btn btn-danger" id="ch-m-del">🗑️ Eliminar definitivamente</button>` : `
              <div style="font-size:.76rem;color:var(--text-muted);text-align:center;padding:.45rem;border-radius:.75rem;background:var(--surface-secondary);">🔒 Solo ${Utils.sanitize(displayName)} o un administrador pueden eliminar este mensaje.</div>`}
          </div>
        </div>`,
      onMount: () => {
        document.querySelectorAll('[data-pick-react]').forEach(rBtn => {
          rBtn.addEventListener('click', () => {
            store.toggleChatMessageReaction(m.id, rBtn.getAttribute('data-pick-react'));
            UI.closeModal();
          });
        });
        document.getElementById('ch-m-copy')?.addEventListener('click', async () => {
          const ok = await Utils.copyText(m.text);
          UI.showToast(ok ? 'Texto copiado 📋' : 'No se pudo copiar automáticamente.', ok ? 'success' : 'info');
          UI.closeModal();
        });
        document.getElementById('ch-m-reply')?.addEventListener('click', () => { UI.closeModal(); replyToMsg(m); });
        document.getElementById('ch-m-edit')?.addEventListener('click', () => { UI.closeModal(); openEditMessageModal(m); });
        document.getElementById('ch-m-pin')?.addEventListener('click', () => {
          const res = store.togglePinChatMessage(m.id);
          UI.closeModal();
          if (res.ok) UI.showToast(res.pinned ? 'Mensaje fijado arriba 📌' : 'Mensaje desfijado', 'success');
          else UI.showToast(res.error || 'No se pudo fijar.', 'error');
        });
        document.getElementById('ch-m-del')?.addEventListener('click', () => {
          UI.closeModal();
          confirmDeleteMessages([m.id], displayName);
        });
      }
    });
  };

  // Reproducir canción citada directamente desde el chat (sincronizado con reproductor global)
  if (!chatUiState.selectMode) {
    const syncChatSongBtns = (playerState) => {
      if (!document.body.contains(viewport)) {
        if (unsubscribeChatMusic) { unsubscribeChatMusic(); unsubscribeChatMusic = null; }
        return;
      }
      const activeId = playerState?.isPlaying ? playerState.trackId : null;
      viewport.querySelectorAll('[data-chat-play-song]').forEach(btn => {
        const sid = btn.getAttribute('data-chat-play-song');
        if (btn.textContent !== '⏳') {
          btn.textContent = (activeId && activeId === sid) ? '⏸' : '▶';
        }
      });
    };
    if (unsubscribeChatMusic) unsubscribeChatMusic();
    unsubscribeChatMusic = MusicService.subscribe(syncChatSongBtns);
  } else if (unsubscribeChatMusic) {
    unsubscribeChatMusic();
    unsubscribeChatMusic = null;
  }

  function bindChatScrollEvents(scrollEl) {
    if (!scrollEl) return;

    if (chatUiState.selectMode) {
      scrollEl.querySelectorAll('[data-toggle-select]').forEach(row => {
        row.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const mid = row.getAttribute('data-toggle-select');
          if (!mid) return;
          if (chatUiState.selectedIds.has(mid)) chatUiState.selectedIds.delete(mid);
          else chatUiState.selectedIds.add(mid);
          rerender();
        });
      });
    } else {
      scrollEl.querySelectorAll('[data-chat-profile]').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-chat-profile');
          if (uid) store.navigate('profile', { inspectUserId: uid });
        });
      });

      scrollEl.querySelectorAll('[data-react-msg]').forEach(btn => {
        btn.addEventListener('click', () => {
          store.toggleChatMessageReaction(btn.getAttribute('data-react-msg'), btn.getAttribute('data-react-emoji'));
        });
      });

      scrollEl.querySelectorAll('[data-reply-msg]').forEach(btn => btn.addEventListener('click', () => {
        const m = allMessages.find(x => x.id === btn.getAttribute('data-reply-msg'));
        if (m) replyToMsg(m);
      }));

      scrollEl.querySelectorAll('[data-more-msg]').forEach(btn => btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const m = allMessages.find(x => x.id === btn.getAttribute('data-more-msg'));
        if (m) openMessageActionsModal(m);
      }));

      scrollEl.querySelectorAll('[data-bubble-msg]').forEach(bubble => {
        let pressTimer = null;
        let startX = 0;
        let startY = 0;
        const cancelPress = () => {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        };
        bubble.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          if (e.target.closest('button, a, audio, video, img')) return;
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          const mid = bubble.getAttribute('data-bubble-msg');
          pressTimer = setTimeout(() => {
            pressTimer = null;
            const m = allMessages.find(x => x.id === mid);
            if (m) {
              try { navigator.vibrate?.(15); } catch (_) {}
              openMessageActionsModal(m);
            }
          }, 460);
        }, { passive: true });
        bubble.addEventListener('touchmove', (e) => {
          if (!pressTimer || e.touches.length !== 1) return;
          const dx = Math.abs(e.touches[0].clientX - startX);
          const dy = Math.abs(e.touches[0].clientY - startY);
          if (dx > 10 || dy > 10) cancelPress();
        }, { passive: true });
        bubble.addEventListener('touchend', cancelPress, { passive: true });
        bubble.addEventListener('touchcancel', cancelPress, { passive: true });
      });

      scrollEl.querySelectorAll('[data-chat-play-song]').forEach(btn => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const songId = btn.getAttribute('data-chat-play-song');
        const song = (group.songs || []).find(s => s.id === songId);
        if (!song) return;
        if (song.previewUrl) {
          MusicService.toggleTrack(song);
          return;
        }
        btn.textContent = '⏳';
        const res = await MusicService.playTrackOrResolve(song);
        if (!res.ok) {
          btn.textContent = '▶';
          UI.showToast(res.error || 'Preview de 30s no disponible.', 'info');
        }
      }));

      scrollEl.querySelectorAll('[data-jump-quote-type]').forEach(box => box.addEventListener('click', () => {
        const t = box.getAttribute('data-jump-quote-type');
        if (t === 'memory') store.navigate('group', { groupTab: 'memories' });
        else if (t === 'movie') store.navigate('group', { groupTab: 'movies' });
        else if (t === 'series') store.navigate('group', { groupTab: 'series' });
        else if (t === 'song') store.navigate('group', { groupTab: 'music' });
        else if (t === 'book') store.navigate('group', { groupTab: 'books' });
        else if (t === 'activity' || t === 'goal') store.navigate('group', { groupTab: 'goals_notes' });
      }));

      scrollEl.querySelectorAll('[data-jump-msg]').forEach(box => box.addEventListener('click', () => {
        jumpToMessage(box.getAttribute('data-jump-msg'));
      }));
    }

    const bindZoom = (img) => {
      img.addEventListener('click', (e) => {
        if (chatUiState.selectMode) return;
        e.stopPropagation();
        UI.openLightbox(img.getAttribute('data-zoom-img'), false);
      });
    };
    scrollEl.querySelectorAll('[data-zoom-img]').forEach(bindZoom);

    scrollEl.querySelectorAll('[data-chat-media-id]').forEach(async (slot) => {
      const mediaId = slot.getAttribute('data-chat-media-id');
      const mediaType = slot.getAttribute('data-chat-media-type') || 'image';
      const mediaDur = slot.getAttribute('data-chat-media-dur') || '';
      const dataUrl = await CloudSync.fetchChatMedia(group.id, mediaId);
      if (!slot.isConnected) return;
      if (!dataUrl) {
        slot.textContent = '⚠️ Adjunto no disponible';
        return;
      }
      const tmp = document.createElement('div');
      tmp.innerHTML = buildResolvedMediaHtml(mediaType, dataUrl, mediaDur);
      const rendered = tmp.firstElementChild;
      if (rendered) {
        slot.replaceWith(rendered);
        if (rendered.matches('[data-zoom-img]')) bindZoom(rendered);
      }
    });
  }

  bindChatScrollEvents(scrollBox);

  viewport.querySelector('#rch-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = viewport.querySelector('#rch-text-inp');
    const text = inp?.value.trim();
    const pending = getPendingQuote();
    if (!text && !pending) return;
    chatUiState.drafts[group.id] = '';
    chatUiState.forceScrollBottom = true;
    store.sendChatMessage({ text, quote: pending });
    setPendingQuote(null);
  });
}

function pickSupportedAudioMime() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  // Priorizar audio/mp4 para compatibilidad total entre iPhone (Safari iOS) y Android/Chrome
  const candidates = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
  ];
  return candidates.find(t => {
    try { return MediaRecorder.isTypeSupported(t); } catch (_) { return false; }
  }) || '';
}

function openVoiceRecorderModal({ onSend, onPickFile }) {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let timer = null;
  let secs = 0;
  let cancelled = false;
  let previewDataUrl = null;
  let previewDuration = '00:00';

  const stopTracks = () => {
    clearInterval(timer);
    timer = null;
    if (recorder && recorder.state === 'recording') {
      cancelled = true;
      try { recorder.stop(); } catch (_) {}
    }
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  };

  UI.openModal({
    title: '🎙️ Nota de voz',
    onClose: stopTracks,
    contentHtml: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:.9rem;padding:.5rem 0;">
        <div id="rch-rec-timer" style="font-family:var(--font-display);font-size:2rem;font-weight:800;color:var(--primary);">00:00</div>
        <div id="rch-rec-status" style="font-size:.82rem;color:var(--text-secondary);text-align:center;">Pulsa «Grabar» para usar tu micrófono</div>
        <div id="rch-rec-preview" hidden style="width:100%;display:flex;flex-direction:column;gap:.65rem;align-items:center;">
          <audio id="rch-rec-audio" controls style="width:100%;"></audio>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.55rem;width:100%;">
            <button type="button" class="btn btn-secondary btn-sm" id="rch-rec-retry" style="justify-content:center;">🔄 Grabar de nuevo</button>
            <button type="button" class="btn btn-primary btn-sm" id="rch-rec-send" style="justify-content:center;">➤ Enviar audio</button>
          </div>
        </div>
        <div id="rch-rec-controls" style="display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;">
          <button type="button" class="btn btn-primary" id="rch-rec-start">🎙️ Grabar</button>
          <button type="button" class="btn btn-danger" id="rch-rec-stop" hidden>⏹ Detener</button>
          <button type="button" class="btn btn-secondary" id="rch-rec-file">📁 Subir archivo</button>
        </div>
      </div>`,
    onMount: () => {
      const startBtn = document.getElementById('rch-rec-start');
      const stopBtn = document.getElementById('rch-rec-stop');
      const fileBtn = document.getElementById('rch-rec-file');
      const controlsEl = document.getElementById('rch-rec-controls');
      const previewEl = document.getElementById('rch-rec-preview');
      const audioEl = document.getElementById('rch-rec-audio');
      const retryBtn = document.getElementById('rch-rec-retry');
      const sendBtn = document.getElementById('rch-rec-send');
      const statusEl = document.getElementById('rch-rec-status');
      const timerEl = document.getElementById('rch-rec-timer');

      const resetToIdle = () => {
        previewDataUrl = null;
        secs = 0;
        if (timerEl) timerEl.textContent = '00:00';
        if (statusEl) statusEl.textContent = 'Pulsa «Grabar» para usar tu micrófono';
        if (previewEl) previewEl.hidden = true;
        if (controlsEl) controlsEl.hidden = false;
        if (startBtn) startBtn.hidden = false;
        if (stopBtn) stopBtn.hidden = true;
        if (fileBtn) fileBtn.hidden = false;
      };

      fileBtn?.addEventListener('click', () => { UI.closeModal(); onPickFile(); });
      retryBtn?.addEventListener('click', resetToIdle);
      sendBtn?.addEventListener('click', () => {
        if (!previewDataUrl) return;
        const outUrl = previewDataUrl;
        const outDur = previewDuration;
        UI.closeModal();
        onSend(outUrl, outDur);
      });

      startBtn?.addEventListener('click', async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
          UI.showToast('Tu navegador no soporta grabación directa. Sube un archivo de audio.', 'info');
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          secs = 0;
          cancelled = false;
          if (timerEl) timerEl.textContent = '00:00';
          const mimeType = pickSupportedAudioMime();
          recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) chunks.push(ev.data); };
          recorder.onstop = async () => {
            clearInterval(timer);
            timer = null;
            stream?.getTracks().forEach(t => t.stop());
            stream = null;
            if (cancelled || chunks.length === 0) return;
            const finalMime = recorder.mimeType || mimeType || 'audio/mp4';
            const blob = new Blob(chunks, { type: finalMime });
            if (blob.size > 1.5 * 1024 * 1024) {
              UI.showToast('El audio superó 1.5 MB. Graba un mensaje más corto.', 'error');
              resetToIdle();
              return;
            }
            previewDataUrl = await readAsDataUrl(blob);
            const mm = String(Math.floor(secs / 60)).padStart(2, '0');
            const ss = String(secs % 60).padStart(2, '0');
            previewDuration = `${mm}:${ss}`;
            if (audioEl) audioEl.src = previewDataUrl;
            if (controlsEl) controlsEl.hidden = true;
            if (previewEl) previewEl.hidden = false;
            if (statusEl) statusEl.textContent = 'Escucha tu nota de voz antes de enviarla';
          };
          recorder.start();
          startBtn.hidden = true;
          stopBtn.hidden = false;
          fileBtn.hidden = true;
          if (statusEl) statusEl.textContent = 'Grabando... (máx. 60s)';
          timer = setInterval(() => {
            secs += 1;
            if (timerEl) timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
            if (secs >= 60 && recorder?.state === 'recording') recorder.stop();
          }, 1000);
        } catch (_) {
          UI.showToast('Permiso de micrófono denegado.', 'error');
        }
      });

      stopBtn?.addEventListener('click', () => {
        if (recorder?.state === 'recording') {
          cancelled = false;
          recorder.stop();
        }
      });
    }
  });
}
