/**
 * ruma 🌟 — Módulo Exclusivo de Autenticación (Login & Registro Sincronizados en la Nube)
 */

import { store } from '../core/store.js';
import { Utils } from '../core/utils.js';
import { GoogleAuth } from '../services/google-auth.js';
import { UI } from '../components/ui.js';

export function renderAuthScreen(container) {
  container.innerHTML = `
    <div class="ruma-auth-stage">
      <!-- Ondas de luz neón violeta del fondo -->
      <svg class="ruma-auth-waves-svg" viewBox="0 0 600 1000" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="rumaWaveGradTop" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#D946EF" stop-opacity="0.95" />
            <stop offset="35%" stop-color="#A855F7" stop-opacity="0.55" />
            <stop offset="65%" stop-color="#9333EA" stop-opacity="0.45" />
            <stop offset="100%" stop-color="#C084FC" stop-opacity="0.95" />
          </linearGradient>
          <linearGradient id="rumaWaveAreaTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#9333EA" stop-opacity="0.32" />
            <stop offset="50%" stop-color="#6B21A8" stop-opacity="0.14" />
            <stop offset="100%" stop-color="#090314" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="rumaWaveGradBot" x1="20%" y1="100%" x2="100%" y2="30%">
            <stop offset="0%" stop-color="#7E22CE" stop-opacity="0" />
            <stop offset="55%" stop-color="#A855F7" stop-opacity="0.7" />
            <stop offset="100%" stop-color="#E879F9" stop-opacity="0.95" />
          </linearGradient>
          <filter id="rumaNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur1" />
            <feGaussianBlur stdDeviation="18" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d="M-20,390 C75,280 200,295 360,260 C475,235 535,120 620,65 L620,0 L-20,0 Z" fill="url(#rumaWaveAreaTop)" />
        <path d="M-15,385 C75,275 195,295 355,255 C475,225 530,115 615,62" fill="none" stroke="url(#rumaWaveGradTop)" stroke-width="3.2" filter="url(#rumaNeonGlow)" />
        <path d="M260,990 C420,955 520,925 615,810" fill="none" stroke="url(#rumaWaveGradBot)" stroke-width="3.2" filter="url(#rumaNeonGlow)" />
      </svg>

      <div class="ruma-auth-wrap">
        <!-- Ícono del Ajolote en Squircle Glass con Glow -->
        <div class="ruma-auth-logo-box">
          <img src="assets/ruma_login_squircle.png" alt="ruma logo" class="ruma-auth-logo-img">
        </div>

        <!-- Título ruma con degradado blanco a lila -->
        <h1 class="ruma-auth-title">
          <span class="ruma-title-ru">ru</span><span class="ruma-title-ma">ma</span>
        </h1>

        <!-- Subtítulo -->
        <p class="ruma-auth-tagline">
          Tus personas <span class="dot">·</span> Tus recuerdos <span class="dot">·</span> <span class="accent">Tu refugio</span>
        </p>

        <!-- Selector Píldora: Iniciar sesión / Crear cuenta -->
        <div class="ruma-auth-segmented" role="tablist">
          <button type="button" class="ruma-auth-seg-btn active" id="tab-auth-login" role="tab" aria-selected="true">
            Iniciar sesión
          </button>
          <button type="button" class="ruma-auth-seg-btn" id="tab-auth-register" role="tab" aria-selected="false">
            Crear cuenta
          </button>
        </div>

        <!-- Formulario: Iniciar sesión -->
        <form id="form-auth-login" class="ruma-auth-form" autocomplete="on">
          <div class="ruma-auth-field">
            <span class="ruma-auth-field-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="3"></rect>
                <polyline points="3,7 12,13 21,7"></polyline>
              </svg>
            </span>
            <input
              type="text"
              id="login-identifier"
              class="ruma-auth-input"
              placeholder="Correo, teléfono o @usuario"
              autocomplete="username"
              required
            >
          </div>

          <div class="ruma-auth-field">
            <span class="ruma-auth-field-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2.5"></rect>
                <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
                <circle cx="12" cy="16" r="1"></circle>
              </svg>
            </span>
            <input
              type="password"
              id="login-password"
              class="ruma-auth-input"
              placeholder="Contraseña"
              autocomplete="current-password"
              required
            >
            <button type="button" class="ruma-auth-eye-btn" data-toggle-pass="login-password" aria-label="Mostrar u ocultar contraseña">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>

          <div class="ruma-auth-forgot-row">
            <button type="button" class="ruma-auth-forgot-link" id="btn-auth-forgot-pass">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <button type="submit" class="ruma-auth-cta" id="btn-login-submit">
            Iniciar sesión
          </button>
        </form>

        <!-- Formulario: Crear cuenta -->
        <form id="form-auth-register" class="ruma-auth-form" style="display:none;" autocomplete="on">
          <div class="ruma-auth-field">
            <span class="ruma-auth-field-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </span>
            <input
              type="text"
              id="reg-name"
              class="ruma-auth-input"
              placeholder="Tu nombre completo"
              autocomplete="name"
              required
            >
          </div>

          <div class="ruma-auth-field">
            <span class="ruma-auth-field-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path>
              </svg>
            </span>
            <input
              type="text"
              id="reg-username"
              class="ruma-auth-input"
              placeholder="Nombre de usuario (@usuario)"
              autocomplete="username"
              required
            >
          </div>

          <div class="ruma-auth-field">
            <span class="ruma-auth-field-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="3"></rect>
                <polyline points="3,7 12,13 21,7"></polyline>
              </svg>
            </span>
            <input
              type="text"
              id="reg-email-or-phone"
              class="ruma-auth-input"
              placeholder="Correo electrónico o teléfono"
              autocomplete="email"
              required
            >
          </div>

          <div class="ruma-auth-field">
            <span class="ruma-auth-field-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="5" y="11" width="14" height="10" rx="2.5"></rect>
                <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
                <circle cx="12" cy="16" r="1"></circle>
              </svg>
            </span>
            <input
              type="password"
              id="reg-password"
              class="ruma-auth-input"
              placeholder="Crea tu contraseña"
              autocomplete="new-password"
              required
            >
            <button type="button" class="ruma-auth-eye-btn" data-toggle-pass="reg-password" aria-label="Mostrar u ocultar contraseña">
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>

          <button type="submit" class="ruma-auth-cta" id="btn-register-submit" style="margin-top:0.25rem;">
            Crear cuenta
          </button>
        </form>

        <div id="auth-google-feedback" style="display:none;margin-top:0.85rem;padding:0.7rem 0.9rem;border-radius:14px;font-size:0.8rem;text-align:left;width:100%;"></div>

        <!-- Separador: o continúa con -->
        <div class="ruma-auth-divider">
          <span class="line"></span>
          <span class="text">o continúa con</span>
          <span class="line"></span>
        </div>

        <!-- Botón Cuadrado Oficial con la G multicolor de Google -->
        <div class="ruma-auth-social-row">
          <button type="button" class="ruma-auth-google-box" id="btn-auth-google-signin" title="Continuar con Google">
            <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          </button>
        </div>

        <!-- Pie Legal -->
        <p class="ruma-auth-legal">
          Al continuar, aceptas los <a href="terms.html" target="_blank" rel="noopener">Términos de uso</a> y la<br>
          <a href="privacy.html" target="_blank" rel="noopener">Política de privacidad</a> de ruma.
        </p>
      </div>
    </div>
  `;

  const btnGoogle = document.getElementById('btn-auth-google-signin');
  const feedbackEl = document.getElementById('auth-google-feedback');
  const loginForm = document.getElementById('form-auth-login');
  const regForm = document.getElementById('form-auth-register');
  const tabLogin = document.getElementById('tab-auth-login');
  const tabReg = document.getElementById('tab-auth-register');

  container.querySelectorAll('[data-toggle-pass]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-pass');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.classList.toggle('showing', isPass);
    });
  });

  tabLogin?.addEventListener('click', () => {
    loginForm.style.display = 'flex';
    regForm.style.display = 'none';
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    tabLogin.setAttribute('aria-selected', 'true');
    tabReg.setAttribute('aria-selected', 'false');
  });

  tabReg?.addEventListener('click', () => {
    loginForm.style.display = 'none';
    regForm.style.display = 'flex';
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    tabReg.setAttribute('aria-selected', 'true');
    tabLogin.setAttribute('aria-selected', 'false');
  });

  document.getElementById('btn-auth-forgot-pass')?.addEventListener('click', () => {
    const prefill = document.getElementById('login-identifier')?.value || '';
    UI.openModal({
      title: '🔑 Recuperar / Restablecer Contraseña',
      contentHtml: `
        <form id="form-reset-password">
          <div class="form-group">
            <label class="form-label">Tu Correo, Teléfono o @Usuario</label>
            <input type="text" id="reset-pass-id" class="form-input" placeholder="ej: kevin@ruma.app o @kevin" value="${Utils.sanitize(prefill)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Nueva Contraseña</label>
            <input type="password" id="reset-pass-new" class="form-input" placeholder="Escribe tu nueva contraseña" required>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.65rem;margin-top:1.25rem;">
            <button type="button" class="btn btn-secondary" id="btn-cancel-reset">Cancelar</button>
            <button type="submit" class="btn btn-primary">Actualizar Contraseña</button>
          </div>
        </form>
      `,
      onMount: () => {
        document.getElementById('btn-cancel-reset')?.addEventListener('click', () => UI.closeModal());
        document.getElementById('form-reset-password')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const identifier = document.getElementById('reset-pass-id')?.value;
          const newPw = document.getElementById('reset-pass-new')?.value;
          const res = await store.resetPasswordAsync(identifier, newPw);
          if (!res.ok) {
            UI.showToast(res.error, 'error');
            return;
          }
          UI.closeModal();
          const idInp = document.getElementById('login-identifier');
          const pwInp = document.getElementById('login-password');
          if (idInp) idInp.value = identifier;
          if (pwInp) pwInp.value = newPw;
          UI.showToast(`¡Contraseña actualizada para ${res.user.name}! Ya puedes iniciar sesión ✨`, 'success');
        });
      }
    });
  });

  const showErr = (msg) => {
    if (!feedbackEl) return;
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(239,68,68,0.14)';
    feedbackEl.style.border = '1px solid rgba(239,68,68,0.4)';
    feedbackEl.style.color = '#FCA5A5';
    feedbackEl.textContent = msg;
  };

  btnGoogle?.addEventListener('click', async () => {
    const cid = GoogleAuth.getClientId();
    btnGoogle.disabled = true;
    try {
      const session = await GoogleAuth.requestDriveAccess(cid);
      const res = store.loginWithGoogle({
        email: session.email,
        name: session.name,
        picture: session.picture
      });
      if (res.ok) {
        UI.showToast(`¡Bienvenido, ${res.user.name}! Google conectado ☁️✨`, 'success');
      }
    } catch (err) {
      showErr(`⚠️ Google OAuth: ${err.message}`);
    } finally {
      btnGoogle.disabled = false;
    }
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-login-submit');
    const id = document.getElementById('login-identifier')?.value;
    const pw = document.getElementById('login-password')?.value;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Iniciando sesión...';
    }
    const res = await store.loginAsync(id, pw);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Iniciar sesión';
    }
    if (!res.ok) {
      UI.showToast(res.error, 'error');
      return;
    }
    UI.showToast(`¡Bienvenido, ${res.user.name}! 💜`, 'success');
  });

  regForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-register-submit');
    const rawContact = (document.getElementById('reg-email-or-phone')?.value || '').trim();
    const isEmail = rawContact.includes('@');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creando cuenta...';
    }
    const res = await store.registerAsync({
      name: document.getElementById('reg-name')?.value,
      username: document.getElementById('reg-username')?.value,
      email: isEmail ? rawContact : '',
      phone: !isEmail ? rawContact : '',
      password: document.getElementById('reg-password')?.value
    });
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Crear cuenta';
    }
    if (!res.ok) {
      UI.showToast(res.error, 'error');
      return;
    }
    UI.showToast(`¡Cuenta creada en la nube, ${res.user.name}! 🎉`, 'success');
  });
}
