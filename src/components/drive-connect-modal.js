/**
 * ruma 🌟 — Asistente y Modal de Conexión OAuth 2.0 con Google Drive
 *
 * Permite:
 * 1. Configurar el Google OAuth 2.0 Client ID (con guía paso a paso de 1 minuto)
 * 2. Iniciar sesión con Google (popup oficial de Google Identity Services)
 * 3. Vincular una carpeta existente de Google Drive o crear automáticamente una carpeta nueva en Drive
 * 4. Probar la conexión real con la carpeta
 */

import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { GoogleAuth } from '../services/google-auth.js';
import { DriveBridge } from '../services/drive-bridge.js';
import { UI } from './ui.js';

export function renderDriveConnectionPanelHtml(group, isAdmin = true) {
  const session = GoogleAuth.getSession();
  const clientId = GoogleAuth.getClientId(group);
  const hasRealFolder = DriveBridge.isRealFolderConfigured(group?.driveFolderUrl);
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://kevingomez-04.github.io';

  return `
    <div style="display:flex;flex-direction:column;gap:1.1rem;">
      <!-- Estado actual de la sesión de Google -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.75rem;padding:0.9rem 1rem;border-radius:var(--radius-md);background:${session ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)'};border:1px solid ${session ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.35)'};">
        <div style="display:flex;align-items:center;gap:0.75rem;">
          ${session?.picture ? `<img src="${Utils.sanitize(session.picture)}" alt="Google" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">` : `<div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:1.2rem;">${session ? '🟢' : '🔐'}</div>`}
          <div>
            <div style="font-weight:800;font-size:0.92rem;color:${session ? '#34D399' : '#FBBF24'};">
              ${session ? `Conectado con Google Drive (${Utils.sanitize(session.name)})` : 'Cuenta de Google no conectada'}
            </div>
            <div style="font-size:0.78rem;color:var(--text-secondary);">
              ${session
                ? `${Utils.sanitize(session.email || 'Sesión OAuth 2.0 activa')} · Lista para crear subcarpetas y subir fotos/videos`
                : 'Conecta tu cuenta de Google para que los recuerdos se suban automáticamente a tu Google Drive.'}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button type="button" class="btn ${session ? 'btn-secondary' : 'btn-primary'} btn-sm" id="btn-drive-google-login">
            ${session ? '🔄 Reconectar Google' : '🔑 Iniciar sesión con Google'}
          </button>
          ${session ? `<button type="button" class="btn btn-danger btn-sm" id="btn-drive-google-logout">Desconectar</button>` : ''}
        </div>
      </div>

      <!-- Paso 1: Client ID de Google OAuth 2.0 -->
      <div style="padding:1rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
          <label class="form-label" style="margin:0;">1️⃣ Client ID de Google OAuth 2.0</label>
          <span class="badge ${GoogleAuth.hasValidClientId(group) ? 'badge-free' : 'badge-limit'}">
            ${GoogleAuth.hasValidClientId(group) ? '✓ Configurado' : 'Requerido 1 sola vez'}
          </span>
        </div>
        <input
          type="text"
          id="inp-drive-client-id"
          class="form-input"
          value="${Utils.sanitize(clientId)}"
          placeholder="1234567890-abcdefg.apps.googleusercontent.com"
        >
        <details style="margin-top:0.65rem;font-size:0.8rem;color:var(--text-secondary);" ${GoogleAuth.hasValidClientId(group) ? '' : 'open'}>
          <summary style="cursor:pointer;color:var(--brand-lilac);font-weight:700;">
            📘 ¿Cómo crear tu Client ID gratuito en Google Cloud en 1 minuto? (Ver pasos)
          </summary>
          <ol style="margin:0.55rem 0 0 1.15rem;display:flex;flex-direction:column;gap:0.4rem;line-height:1.45;">
            <li>Abre <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener" style="color:var(--brand-cyan);font-weight:700;">Google Drive API en Google Cloud ↗</a>, crea o elige un proyecto y pulsa <strong>Habilitar (Enable)</strong>.</li>
            <li>En <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener" style="color:var(--brand-cyan);font-weight:700;">Pantalla de consentimiento OAuth ↗</a> elige <strong>Externo</strong>, pon el nombre <code>ruma</code> y en <strong>Usuarios de prueba (Test users)</strong> añade tu correo de Gmail.</li>
            <li>Ve a <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener" style="color:var(--brand-cyan);font-weight:700;">Credenciales ↗</a> → <strong>+ Crear credenciales</strong> → <strong>ID de cliente de OAuth</strong> → Tipo: <strong>Aplicación web</strong>.</li>
            <li>En <strong>Orígenes de JavaScript autorizados</strong> añade exactamente:<br>
              <code style="background:rgba(0,0,0,0.45);padding:2px 6px;border-radius:4px;color:var(--brand-gold);user-select:all;">${Utils.sanitize(currentOrigin)}</code>
            </li>
            <li>Copia el <strong>ID de cliente</strong> (termina en <code>.apps.googleusercontent.com</code>), pégalo arriba y pulsa <strong>🔑 Iniciar sesión con Google</strong>.</li>
          </ol>
        </details>
      </div>

      <!-- Paso 2: Carpeta de Google Drive del Grupo -->
      <div style="padding:1rem;background:var(--bg-elevated);border-radius:var(--radius-md);border:1px solid var(--border-subtle);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">
          <label class="form-label" style="margin:0;">2️⃣ Carpeta Principal de Google Drive del Grupo</label>
          <span class="badge ${hasRealFolder ? 'badge-free' : 'badge-admin'}">
            ${hasRealFolder ? '📁 Carpeta vinculada' : 'Opcional (o créala en 1 clic)'}
          </span>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <input
            type="url"
            id="inp-drive-folder-url"
            class="form-input"
            style="flex:1;min-width:220px;"
            value="${Utils.sanitize(hasRealFolder ? group.driveFolderUrl : '')}"
            placeholder="https://drive.google.com/drive/folders/1A2B3C4D5E6F..."
            ${!isAdmin ? 'disabled' : ''}
          >
          ${isAdmin ? `
            <button type="button" class="btn btn-secondary btn-sm" id="btn-drive-create-auto-folder" title="Crea automáticamente una carpeta nueva en tu Google Drive y la vincula al grupo">
              ✨ Crear carpeta en mi Drive
            </button>
          ` : ''}
        </div>
        <small style="display:block;color:var(--text-muted);font-size:0.76rem;margin-top:0.4rem;">
          Cada recuerdo creará dentro de esta carpeta una subcarpeta con formato <code>[Nombre del Recuerdo - Día y Fecha]</code> y subirá allí sus fotos, videos y nota de voz.
        </small>
      </div>

      <div id="drive-test-feedback" style="display:none;padding:0.75rem 0.9rem;border-radius:var(--radius-sm);font-size:0.82rem;"></div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-drive-test-connection">
          🚀 Probar Conexión con Drive
        </button>
        ${isAdmin ? `
          <button type="button" class="btn btn-primary btn-sm" id="btn-drive-save-all">
            💾 Guardar Configuración de Drive
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

export function bindDriveConnectionPanelEvents(rootEl, group, isAdmin = true, onUpdated = null) {
  if (!rootEl) return;

  const clientIdInput = rootEl.querySelector('#inp-drive-client-id');
  const folderUrlInput = rootEl.querySelector('#inp-drive-folder-url');
  const feedbackEl = rootEl.querySelector('#drive-test-feedback');

  const showFeedback = (msg, isError = false) => {
    if (!feedbackEl) return;
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = isError ? 'rgba(239,68,68,0.14)' : 'rgba(16,185,129,0.14)';
    feedbackEl.style.border = `1px solid ${isError ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)'}`;
    feedbackEl.style.color = isError ? '#FCA5A5' : '#6EE7B7';
    feedbackEl.textContent = msg;
  };

  const persistInputs = () => {
    const cid = clientIdInput?.value.trim() || '';
    const folderUrl = folderUrlInput?.value.trim() || '';
    GoogleAuth.setClientId(cid);
    if (group && isAdmin) {
      const patch = { driveClientId: cid };
      if (folderUrl) patch.driveFolderUrl = folderUrl;
      store.updateGroupSettings(group.id, patch);
    }
    return { cid, folderUrl };
  };

  rootEl.querySelector('#btn-drive-google-login')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const { cid } = persistInputs();
    if (!cid || !cid.includes('.apps.googleusercontent.com')) {
      showFeedback('⚠️ Primero pega tu Client ID de Google OAuth 2.0 (termina en .apps.googleusercontent.com) en el Paso 1.', true);
      clientIdInput?.focus();
      return;
    }

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = '⏳ Abriendo Google...';
    try {
      const session = await GoogleAuth.requestDriveAccess(cid, group);
      UI.showToast(`¡Conectado con Google como ${session.name || session.email}! 🎉`, 'success');
      if (typeof onUpdated === 'function') onUpdated();
    } catch (err) {
      showFeedback(`❌ No se pudo iniciar sesión con Google: ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  });

  rootEl.querySelector('#btn-drive-google-logout')?.addEventListener('click', () => {
    GoogleAuth.clearToken();
    UI.showToast('Cuenta de Google desconectada.', 'info');
    if (typeof onUpdated === 'function') onUpdated();
  });

  rootEl.querySelector('#btn-drive-create-auto-folder')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const { cid } = persistInputs();
    if (!cid || !cid.includes('.apps.googleusercontent.com')) {
      showFeedback('⚠️ Pega primero tu Client ID de Google OAuth en el Paso 1.', true);
      clientIdInput?.focus();
      return;
    }

    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '⏳ Creando carpeta...';
    try {
      const created = await DriveBridge.createGroupFolderInDrive(group);
      if (folderUrlInput) folderUrlInput.value = created.webViewLink;
      if (group && isAdmin) {
        store.updateGroupSettings(group.id, { driveFolderUrl: created.webViewLink, driveClientId: cid });
      }
      showFeedback(`✅ Carpeta "${created.name}" creada en tu Google Drive y vinculada automáticamente.`, false);
      UI.showToast('¡Carpeta creada y vinculada en tu Google Drive! 📁✨', 'success');
    } catch (err) {
      showFeedback(`❌ ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  rootEl.querySelector('#btn-drive-test-connection')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const { cid, folderUrl } = persistInputs();
    if (!cid || !cid.includes('.apps.googleusercontent.com')) {
      showFeedback('⚠️ Pega primero tu Client ID de Google OAuth en el Paso 1.', true);
      return;
    }
    if (!folderUrl) {
      showFeedback('⚠️ Pega el enlace de tu carpeta de Google Drive o pulsa «✨ Crear carpeta en mi Drive».', true);
      return;
    }

    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = '⏳ Verificando...';
    try {
      const info = await DriveBridge.testFolderConnection(folderUrl, group);
      showFeedback(`🎉 ¡Conexión exitosa con la carpeta "${info.name}"! Lista para subir fotos y videos.`, false);
      UI.showToast(`¡Carpeta "${info.name}" verificada con éxito! 🚀`, 'success');
    } catch (err) {
      showFeedback(`❌ ${err.message}`, true);
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });

  rootEl.querySelector('#btn-drive-save-all')?.addEventListener('click', () => {
    const { cid, folderUrl } = persistInputs();
    if (group && isAdmin) {
      store.updateGroupSettings(group.id, {
        driveClientId: cid,
        driveFolderUrl: folderUrl
      });
    }
    showFeedback('✅ Configuración de Google Drive guardada correctamente.', false);
    UI.showToast('Configuración de Google Drive guardada 📂✨', 'success');
    if (typeof onUpdated === 'function') onUpdated();
  });
}

export function openDriveConnectModal(group, isAdmin = true) {
  UI.openModal({
    title: `📂 Conectar Google Drive — "${group?.name || 'Grupo'}"`,
    size: 'lg',
    contentHtml: renderDriveConnectionPanelHtml(group, isAdmin),
    onMount: (modalEl) => {
      bindDriveConnectionPanelEvents(modalEl, group, isAdmin, () => {
        openDriveConnectModal(store.getActiveGroup() || group, isAdmin);
      });
    }
  });
}
