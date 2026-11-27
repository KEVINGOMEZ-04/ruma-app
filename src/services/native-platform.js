/**
 * ruma 🌟 — Capa de Plataforma Nativa Android / Capacitor 8
 *
 * Resuelve los problemas críticos de WebView en APK:
 * - Botón físico / gesto Atrás de Android (cierra lightbox -> modal -> pestaña -> hub -> doble toque salir).
 * - Apertura segura de enlaces externos (`target="_blank"`) mediante Chrome Custom Tabs (`@capacitor/browser`).
 * - Recepción de Deep Links / App Links (`?join=CODE`) vía `App.addListener('appUrlOpen')`.
 * - Ciclo de vida en segundo plano (`appStateChange`) para pausar/reanudar recursos y SplashScreen.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';

let initialized = false;
let lastBackPressAt = 0;

export const NativePlatform = {
  isNative() {
    try {
      return Capacitor.isNativePlatform();
    } catch (_) {
      return false;
    }
  },

  getPlatform() {
    try {
      return Capacitor.getPlatform();
    } catch (_) {
      return 'web';
    }
  },

  isAndroid() {
    return this.isNative() && this.getPlatform() === 'android';
  },

  /**
   * Abre una URL externa usando Chrome Custom Tabs en APK Android o nueva pestaña en Web.
   */
  async openExternalUrl(url) {
    const clean = String(url || '').trim();
    if (!/^https?:\/\//i.test(clean)) return false;
    if (this.isNative()) {
      try {
        await Browser.open({ url: clean, presentationStyle: 'popover' });
        return true;
      } catch (_) {}
    }
    try {
      window.open(clean, '_blank', 'noopener,noreferrer');
      return true;
    } catch (_) {
      return false;
    }
  },

  /**
   * Inicializa listeners nativos de Capacitor 8 (Back Button, App Links, enlaces externos y SplashScreen).
   */
  init({ store, UI, onResume, onPause } = {}) {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    if (this.isNative()) {
      document.documentElement.classList.add('ruma-native-app', `ruma-platform-${this.getPlatform()}`);

      // Ocultar Splash Screen suavemente una vez montado el primer frame
      requestAnimationFrame(() => {
        SplashScreen.hide().catch(() => {});
      });

      // 1. Interceptar todos los enlaces externos `a[target="_blank"]` para usar Chrome Custom Tabs
      document.addEventListener('click', (event) => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href') || '';
        const isBlank = anchor.getAttribute('target') === '_blank';
        if (isBlank && /^https?:\/\//i.test(href)) {
          event.preventDefault();
          this.openExternalUrl(href);
        }
      });

      // 2. Botón / gesto Atrás nativo de Android
      App.addListener('backButton', ({ canGoBack }) => {
        const lightbox = document.getElementById('ruma-active-lightbox');
        if (lightbox) {
          lightbox.querySelector('#btn-close-lightbox')?.click() || lightbox.remove();
          return;
        }
        const modal = document.getElementById('ruma-active-modal');
        if (modal) {
          UI?.closeModal?.();
          return;
        }
        if (store?.getCurrentUser?.()) {
          if (store.currentInterface === 'group' && store.currentGroupTab && store.currentGroupTab !== 'home') {
            store.navigate('group', { groupTab: 'home' });
            return;
          }
          if (store.currentInterface !== 'hub') {
            store.navigate('hub');
            return;
          }
        }
        if (canGoBack && window.history.length > 1) {
          window.history.back();
          return;
        }
        const now = Date.now();
        if (now - lastBackPressAt < 2200) {
          App.exitApp().catch(() => {});
        } else {
          lastBackPressAt = now;
          UI?.showToast?.('Pulsa atrás otra vez para salir de ruma', 'info');
        }
      }).catch(() => {});

      // 3. Deep Links / Android App Links (`https://kevingomez-04.github.io/ruma-app/?join=CODE`)
      const handleIncomingUrl = async (incomingUrl) => {
        if (!incomingUrl) return;
        try {
          const parsed = new URL(incomingUrl);
          const code = (parsed.searchParams.get('join') || parsed.searchParams.get('code') || '').trim().toUpperCase();
          if (code && store) {
            if (store.getCurrentUser()) {
              const res = await store.joinGroupByCodeOrQueryAsync(code);
              if (res?.ok) {
                UI?.showToast?.(`🎉 Te uniste a "${res.group?.name || 'el grupo'}"`, 'success');
              } else if (res?.reason) {
                UI?.showToast?.(res.reason, 'error');
              }
            } else {
              try { sessionStorage.setItem('ruma_pending_join_code', code); } catch (_) {}
            }
          }
        } catch (_) {}
      };

      App.addListener('appUrlOpen', ({ url }) => handleIncomingUrl(url)).catch(() => {});
      App.getLaunchUrl().then(res => {
        if (res?.url) handleIncomingUrl(res.url);
      }).catch(() => {});

      // 4. Ciclo de vida primer/segundo plano
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) onResume?.();
        else onPause?.();
      }).catch(() => {});
    }
  }
};
