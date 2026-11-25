// Vista modular del Chat del Grupo (burbujas alineadas, buscador en chat, reacciones, menú + en cuadrícula 2x2)
import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { UI } from '../components/ui.js';
import { MusicService } from '../services/music-service.js';

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
  reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'
};

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😮', '😢'];
const chatUiState = { searchOpen: false, searchQuery: '' };

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

function renderQuoteHtml(msg) {
  const q = msg.quote;
  if (!q) return '';
  if (q.type === 'message') {
    return `
      <div class="rch-reply-box" data-jump-msg="${Utils.sanitize(q.itemId || '')}">
        <b>${Utils.sanitize((q.label || 'Respuesta').replace(/^💬\s*Respuesta a\s*/i, ''))}</b>
        <span>${Utils.sanitize(q.title || '')}</span>
      </div>`;
  }
  const isSong = q.type === 'song';
  return `
    <div class="rch-quote-card" data-jump-quote-type="${Utils.sanitize(q.type || '')}" data-jump-quote-id="${Utils.sanitize(q.itemId || '')}">
      ${q.thumb ? `
        <div class="rch-qthumb-wrap">
          <img src="${Utils.sanitize(q.thumb)}" alt="" class="rch-qthumb">
          ${isSong ? `<button type="button" class="rch-qplay" data-chat-play-song="${Utils.sanitize(q.itemId || '')}" aria-label="Reproducir canción">▶</button>` : ''}
        </div>` : ''}
      <div class="rch-qinfo">
        <div class="rch-qlabel">${Utils.sanitize(q.label || '')}</div>
        <div class="rch-qtitle">${Utils.sanitize(q.title || '')}</div>
        ${q.subtitle ? `<div class="rch-qsub">${Utils.sanitize(q.subtitle)}</div>` : ''}
      </div>
    </div>`;
}

function renderMediaHtml(msg) {
  const m = msg.media;
  if (!m || !m.url) return '';
  if (m.type === 'image') {
    return `<img src="${Utils.sanitize(m.url)}" alt="Foto adjunta" class="rch-media-img" data-zoom-img="${Utils.sanitize(m.url)}">`;
  }
  if (m.type === 'video') {
    return `<video src="${Utils.sanitize(m.url)}" controls playsinline preload="metadata" class="rch-media-vid"></video>`;
  }
  if (m.type === 'audio') {
    return `
      <div class="rch-media-aud">
        <span>🎙️ Nota de voz${m.duration ? ` · ${Utils.sanitize(m.duration)}` : ''}</span>
        <audio src="${Utils.sanitize(m.url)}" controls preload="metadata"></audio>
      </div>`;
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

export function renderGroupChatView(viewport, group, user, ctx) {
  const { getPendingQuote, setPendingQuote, openPickItemModal, rerender } = ctx;
  const allMessages = group.messages || [];
  const q = chatUiState.searchQuery.trim().toLowerCase();
  const messages = q
    ? allMessages.filter(m =>
        (m.text || '').toLowerCase().includes(q) ||
        (m.senderName || '').toLowerCase().includes(q) ||
        (m.quote?.title || '').toLowerCase().includes(q)
      )
    : allMessages;
  const pendingQuote = getPendingQuote();

  let lastDay = '';
  const rowsHtml = messages.map(msg => {
    const day = dayLabel(msg.timestamp);
    const sep = day !== lastDay ? `<div class="rch-day"><span>${Utils.sanitize(day)}</span></div>` : '';
    lastDay = day;
    const isMine = msg.senderId === user.id;
    const id = Utils.sanitize(msg.id);
    const av = Utils.sanitize(senderAvatarFor(msg, group));

    return `${sep}
      <div class="rch-row ${isMine ? 'mine' : 'other'}" data-msg-id="${id}">
        ${!isMine ? `<button type="button" class="rch-av-btn" data-chat-profile="${Utils.sanitize(msg.senderId || '')}" title="${Utils.sanitize(msg.senderName || '')}"><img class="rch-av" src="${av}" alt="${Utils.sanitize(msg.senderName || '')}"></button>` : ''}
        <div class="rch-bubble ${isMine ? 'mine' : 'other'}">
          <div class="rch-head">
            <strong class="rch-sender">${isMine ? 'Tú' : Utils.sanitize(msg.senderName || 'Miembro')}</strong>
            <div class="rch-head-acts">
              <button type="button" class="rch-ico-act" data-reply-msg="${id}" title="Responder" aria-label="Responder">${svg(ICO.reply, 14)}</button>
              <button type="button" class="rch-ico-act" data-more-msg="${id}" title="Reaccionar o más opciones" aria-label="Opciones del mensaje">⋯</button>
            </div>
          </div>
          ${renderQuoteHtml(msg)}
          ${renderMediaHtml(msg)}
          ${msg.text ? `<div class="rch-text">${Utils.sanitize(msg.text)}</div>` : ''}
          <div class="rch-foot">
            ${renderReactionsHtml(msg, user.id)}
            <span class="rch-time">${Utils.formatTime(msg.timestamp)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

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
        </div>
      </div>

      ${chatUiState.searchOpen ? `
        <div class="rch-searchbar">
          ${svg(ICO.search, 15)}
          <input type="search" id="rch-search-inp" value="${Utils.sanitize(chatUiState.searchQuery)}" placeholder="Buscar mensajes, personas o contenido..." autocomplete="off">
          ${chatUiState.searchQuery ? `<button type="button" id="rch-search-clear" aria-label="Limpiar">✕</button>` : ''}
        </div>` : ''}

      <div class="rch-scroll" id="rch-scroll">
        ${messages.length === 0 ? `
          <div class="rg-card rm-empty" style="margin:auto 0;">
            <b>${q ? 'Sin coincidencias' : `Aún no hay mensajes en ${Utils.sanitize(group.name)}`}</b>
            <span>${q ? 'Prueba con otra palabra o borra el filtro.' : 'Escribe el primer mensaje o pulsa + para compartir fotos, audios o enlazar contenido del grupo.'}</span>
          </div>` : rowsHtml}
      </div>

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
                <small>Grabar o subir audio</small>
              </button>
            </div>
          </div>

          <input type="file" id="rch-inp-photo" accept="image/*" hidden>
          <input type="file" id="rch-inp-video" accept="video/*" hidden>
          <input type="file" id="rch-inp-audio" accept="audio/*" hidden>

          <form id="rch-form" class="rch-form">
            <button type="button" class="rch-plus-btn" id="rch-plus-btn" aria-label="Adjuntar o enlazar" aria-expanded="false">${svg(ICO.plus, 20)}</button>
            <div class="rch-pill">
              <input type="text" id="rch-text-inp" placeholder="Escribe un mensaje..." autocomplete="off">
            </div>
            <button type="submit" class="rch-send-btn" aria-label="Enviar mensaje">${svg(ICO.send, 18)}</button>
          </form>
        </div>
      </div>
    </div>`;

  const rootEl = viewport.querySelector('#rch-root');
  const scrollBox = viewport.querySelector('#rch-scroll');
  if (scrollBox && !q) scrollBox.scrollTop = scrollBox.scrollHeight;

  // Buscador en chat
  viewport.querySelector('#rch-toggle-search')?.addEventListener('click', () => {
    chatUiState.searchOpen = !chatUiState.searchOpen;
    if (!chatUiState.searchOpen) chatUiState.searchQuery = '';
    rerender();
    if (chatUiState.searchOpen) viewport.querySelector('#rch-search-inp')?.focus();
  });

  const searchInp = viewport.querySelector('#rch-search-inp');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      chatUiState.searchQuery = e.target.value;
      const pos = e.target.selectionStart;
      rerender();
      const next = viewport.querySelector('#rch-search-inp');
      if (next) {
        next.focus();
        next.setSelectionRange(pos, pos);
      }
    });
  }
  viewport.querySelector('#rch-search-clear')?.addEventListener('click', () => {
    chatUiState.searchQuery = '';
    rerender();
    viewport.querySelector('#rch-search-inp')?.focus();
  });

  // Abrir perfil al tocar avatar
  viewport.querySelectorAll('[data-chat-profile]').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.getAttribute('data-chat-profile');
      if (uid) store.navigate('profile', { inspectUserId: uid });
    });
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
      const caption = viewport.querySelector('#rch-text-inp')?.value.trim() || '';
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
      const caption = viewport.querySelector('#rch-text-inp')?.value.trim() || '';
      store.sendChatMessage({ text: caption, quote: getPendingQuote(), media: { type: 'video', url, name: f.name } });
      setPendingQuote(null);
    } catch (_) {
      UI.showToast('No se pudo adjuntar el vídeo.', 'error');
    }
    e.target.value = '';
  });

  // Nota de voz / audio
  const audioInp = viewport.querySelector('#rch-inp-audio');
  viewport.querySelector('#rch-act-audio')?.addEventListener('click', () => {
    togglePop(false);
    openVoiceRecorderModal({
      onSend: (audioDataUrl, durationLabel) => {
        const caption = viewport.querySelector('#rch-text-inp')?.value.trim() || '';
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
      store.sendChatMessage({ text: '', quote: getPendingQuote(), media: { type: 'audio', url, name: f.name } });
      setPendingQuote(null);
    } catch (_) {
      UI.showToast('No se pudo adjuntar el audio.', 'error');
    }
    e.target.value = '';
  });

  // Reacciones directas en burbujas
  viewport.querySelectorAll('[data-react-msg]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.toggleChatMessageReaction(btn.getAttribute('data-react-msg'), btn.getAttribute('data-react-emoji'));
    });
  });

  // Responder mensaje
  const replyToMsg = (msg) => {
    const preview = msg.text || (msg.media ? `[${msg.media.type === 'image' ? 'Foto' : msg.media.type === 'video' ? 'Vídeo' : 'Nota de voz'}]` : (msg.quote?.title || 'Mensaje'));
    setPendingQuote({
      type: 'message',
      itemId: msg.id,
      label: `💬 Respuesta a ${msg.senderName}`,
      title: preview,
      subtitle: Utils.formatTime(msg.timestamp),
      thumb: ''
    });
    rerender();
    viewport.querySelector('#rch-text-inp')?.focus();
  };

  viewport.querySelectorAll('[data-reply-msg]').forEach(btn => btn.addEventListener('click', () => {
    const m = allMessages.find(x => x.id === btn.getAttribute('data-reply-msg'));
    if (m) replyToMsg(m);
  }));

  // Menú ⋯ de cada mensaje: Reacciones rápidas + Copiar + Responder + Eliminar
  viewport.querySelectorAll('[data-more-msg]').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = allMessages.find(x => x.id === btn.getAttribute('data-more-msg'));
    if (!m) return;
    const canDelete = store.canDeleteChatMessage(group, m, user);
    UI.openModal({
      title: `Mensaje de ${m.senderName || 'Miembro'}`,
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
            ${canDelete ? `<button type="button" class="btn btn-danger" id="ch-m-del">🗑️ Eliminar mensaje</button>` : `
              <div style="font-size:.76rem;color:var(--text-muted);text-align:center;padding:.45rem;border-radius:.75rem;background:var(--surface-secondary);">🔒 Solo ${Utils.sanitize(m.senderName || 'el autor')} o el líder del grupo pueden eliminar este mensaje.</div>`}
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
          try { await navigator.clipboard.writeText(m.text); UI.showToast('Texto copiado 📋', 'success'); }
          catch (_) { UI.showToast('No se pudo copiar automáticamente.', 'info'); }
          UI.closeModal();
        });
        document.getElementById('ch-m-reply')?.addEventListener('click', () => { UI.closeModal(); replyToMsg(m); });
        document.getElementById('ch-m-del')?.addEventListener('click', () => {
          const res = store.deleteChatMessage(m.id);
          UI.closeModal();
          UI.showToast(res.ok ? 'Mensaje eliminado 🗑️' : res.error, res.ok ? 'info' : 'error');
        });
      }
    });
  }));

  // Reproducir canción citada directamente desde el chat
  viewport.querySelectorAll('[data-chat-play-song]').forEach(btn => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const songId = btn.getAttribute('data-chat-play-song');
    const song = (group.songs || []).find(s => s.id === songId);
    if (!song) return;
    if (song.previewUrl) {
      const res = MusicService.toggleTrack(song);
      btn.textContent = res.isPlaying ? '⏸' : '▶';
      return;
    }
    btn.textContent = '⏳';
    const results = await MusicService.searchSongs(`${song.title} ${song.artist}`, 3);
    if (results.length > 0 && results[0].previewUrl) {
      store.updateMediaItem('songs', song.id, { previewUrl: results[0].previewUrl });
      song.previewUrl = results[0].previewUrl;
      MusicService.playTrack(song);
      btn.textContent = '⏸';
    } else {
      btn.textContent = '▶';
      UI.showToast('Preview de 30s no disponible.', 'info');
    }
  }));

  // Navegar a sección al tocar tarjeta citada o hacer scroll al mensaje respondido
  viewport.querySelectorAll('[data-jump-quote-type]').forEach(box => box.addEventListener('click', () => {
    const t = box.getAttribute('data-jump-quote-type');
    if (t === 'memory') store.navigate('group', { groupTab: 'memories' });
    else if (t === 'movie') store.navigate('group', { groupTab: 'movies' });
    else if (t === 'series') store.navigate('group', { groupTab: 'series' });
    else if (t === 'song') store.navigate('group', { groupTab: 'music' });
    else if (t === 'book') store.navigate('group', { groupTab: 'books' });
    else if (t === 'activity' || t === 'goal') store.navigate('group', { groupTab: 'goals_notes' });
  }));
  viewport.querySelectorAll('[data-jump-msg]').forEach(box => box.addEventListener('click', () => {
    const target = viewport.querySelector(`[data-msg-id="${CSS.escape(box.getAttribute('data-jump-msg'))}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  viewport.querySelectorAll('[data-zoom-img]').forEach(img => img.addEventListener('click', () => {
    UI.openModal({
      title: 'Foto del chat',
      contentHtml: `<img src="${Utils.sanitize(img.getAttribute('data-zoom-img'))}" style="width:100%;max-height:70dvh;object-fit:contain;border-radius:12px;">`
    });
  }));

  viewport.querySelector('#rch-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = viewport.querySelector('#rch-text-inp');
    const text = inp?.value.trim();
    if (!text) return;
    store.sendChatMessage({ text, quote: getPendingQuote() });
    setPendingQuote(null);
  });
}

function openVoiceRecorderModal({ onSend, onPickFile }) {
  let recorder = null;
  let stream = null;
  let chunks = [];
  let timer = null;
  let secs = 0;

  const stopTracks = () => {
    clearInterval(timer);
    stream?.getTracks().forEach(t => t.stop());
  };

  UI.openModal({
    title: '🎙️ Grabar nota de voz',
    contentHtml: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:.9rem;padding:.5rem 0;">
        <div id="rch-rec-timer" style="font-family:var(--font-display);font-size:2rem;font-weight:800;color:var(--primary);">00:00</div>
        <div id="rch-rec-status" style="font-size:.82rem;color:var(--text-secondary);">Pulsa «Grabar» para usar tu micrófono</div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;justify-content:center;">
          <button type="button" class="btn btn-primary" id="rch-rec-start">🎙️ Grabar</button>
          <button type="button" class="btn btn-danger" id="rch-rec-stop" hidden>⏹ Detener y enviar</button>
          <button type="button" class="btn btn-secondary" id="rch-rec-file">📁 Subir archivo</button>
        </div>
      </div>`,
    onMount: () => {
      const startBtn = document.getElementById('rch-rec-start');
      const stopBtn = document.getElementById('rch-rec-stop');
      const fileBtn = document.getElementById('rch-rec-file');
      const statusEl = document.getElementById('rch-rec-status');
      const timerEl = document.getElementById('rch-rec-timer');

      fileBtn?.addEventListener('click', () => { stopTracks(); UI.closeModal(); onPickFile(); });

      startBtn?.addEventListener('click', async () => {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
          UI.showToast('Tu navegador no soporta grabación directa. Sube un archivo de audio.', 'info');
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (ev) => { if (ev.data.size > 0) chunks.push(ev.data); };
          recorder.onstop = async () => {
            stopTracks();
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            if (blob.size > 1.5 * 1024 * 1024) {
              UI.showToast('El audio superó 1.5 MB. Graba un mensaje más corto.', 'error');
              return;
            }
            const dataUrl = await readAsDataUrl(blob);
            const mm = String(Math.floor(secs / 60)).padStart(2, '0');
            const ss = String(secs % 60).padStart(2, '0');
            UI.closeModal();
            onSend(dataUrl, `${mm}:${ss}`);
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
        if (recorder?.state === 'recording') recorder.stop();
      });

      document.getElementById('ruma-modal-close-btn')?.addEventListener('click', stopTracks, { once: true });
    }
  });
}
