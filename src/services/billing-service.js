/**
 * ruma 🌟 — Monetización Oficial Google Play Billing v8+ (vía RevenueCat / Capacitor 8)
 *
 * - Cumple el requisito obligatorio de Google Play (Billing Library v8.0.0+ desde agosto 2026).
 * - Jamás confía en flags locales: consulta RevenueCat (validado contra Google Play) y sincroniza
 *   con el backend en Cloudflare Workers (`/api/billing/status`).
 * - Incluye precio localizado real, compra de suscripción, restauración de compras y enlace de gestión.
 */

import { Purchases } from '@revenuecat/purchases-capacitor';
import { CONFIG } from '../core/config.js';
import { NativePlatform } from './native-platform.js';
import { BackendApi } from './backend-api.js';

let configuredForUid = null;
let cachedOffering = null;

function getAndroidKey() {
  return (CONFIG.billing?.revenueCatAndroidKey || '').trim();
}

function getEntitlementId() {
  return (CONFIG.billing?.entitlementId || 'ruma_plus').trim();
}

function hasActiveEntitlement(customerInfo) {
  const entId = getEntitlementId();
  return Boolean(customerInfo?.entitlements?.active?.[entId]);
}

export const BillingService = {
  isNativeBillingReady() {
    return NativePlatform.isAndroid() && Boolean(getAndroidKey());
  },

  getManageSubscriptionUrl() {
    return CONFIG.billing?.manageAndroidSubscriptionUrl || 'https://play.google.com/store/account/subscriptions?package=app.ruma.social';
  },

  async initForUser(uid) {
    if (!this.isNativeBillingReady() || !uid) return false;
    if (configuredForUid === uid) return true;
    try {
      if (!configuredForUid) {
        await Purchases.configure({
          apiKey: getAndroidKey(),
          appUserID: uid
        });
      } else {
        await Purchases.logIn({ appUserID: uid });
      }
      configuredForUid = uid;
      return true;
    } catch (err) {
      console.warn('RevenueCat configure warning:', err);
      return false;
    }
  },

  async getPlusOfferSummary() {
    if (!this.isNativeBillingReady()) {
      return {
        available: false,
        priceString: '',
        periodLabel: 'mensual',
        pkg: null
      };
    }
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings?.current || null;
      cachedOffering = current;
      const pkg = current?.monthly || current?.availablePackages?.[0] || null;
      return {
        available: Boolean(pkg),
        priceString: pkg?.product?.priceString || '',
        title: pkg?.product?.title || 'ruma Plus',
        periodLabel: pkg?.packageType === 'ANNUAL' ? 'anual' : 'mensual',
        pkg
      };
    } catch (_) {
      return { available: false, priceString: '', periodLabel: 'mensual', pkg: null };
    }
  },

  async purchasePlus(uid) {
    if (!this.isNativeBillingReady()) {
      return {
        ok: false,
        error: 'Las suscripciones de ruma Plus se procesan desde la app de Android vía Google Play.'
      };
    }
    try {
      await this.initForUser(uid);
      const offer = cachedOffering?.monthly
        ? { available: true, pkg: cachedOffering.monthly }
        : await this.getPlusOfferSummary();

      if (!offer?.pkg) {
        return { ok: false, error: 'El plan ruma Plus aún no está activo en Google Play Console.' };
      }

      const result = await Purchases.purchasePackage({ aPackage: offer.pkg });
      const active = hasActiveEntitlement(result?.customerInfo);
      return {
        ok: active,
        isPremium: active,
        error: active ? null : 'La compra fue procesada pero aún está pendiente de confirmación en Google Play.'
      };
    } catch (err) {
      if (err?.userCancelled || String(err?.code) === '1') {
        return { ok: false, cancelled: true, error: 'Compra cancelada.' };
      }
      return { ok: false, error: err?.message || 'No se pudo completar la compra en Google Play.' };
    }
  },

  async restorePurchases(uid) {
    if (!this.isNativeBillingReady()) {
      return { ok: false, error: 'La restauración de compras está disponible en la app Android.' };
    }
    try {
      await this.initForUser(uid);
      const { customerInfo } = await Purchases.restorePurchases();
      const active = hasActiveEntitlement(customerInfo);
      return {
        ok: true,
        isPremium: active,
        message: active
          ? '¡Suscripción ruma Plus restaurada correctamente! ✨'
          : 'No encontramos suscripciones activas asociadas a tu cuenta de Google Play.'
      };
    } catch (err) {
      return { ok: false, error: err?.message || 'No se pudieron restaurar las compras.' };
    }
  },

  /**
   * Consulta el estado autoritativo de suscripción (Google Play/RevenueCat + Backend).
   */
  async refreshPremiumStatus(uid) {
    if (this.isNativeBillingReady() && uid) {
      try {
        await this.initForUser(uid);
        const { customerInfo } = await Purchases.getCustomerInfo();
        if (hasActiveEntitlement(customerInfo)) {
          return { ok: true, isPremium: true, source: 'play_billing' };
        }
      } catch (_) {}
    }

    if (BackendApi.isConfigured()) {
      const serverRes = await BackendApi.getBillingStatus();
      if (serverRes?.ok) {
        return { ok: true, isPremium: Boolean(serverRes.isPremium), source: 'backend' };
      }
    }

    return { ok: false, isPremium: false, source: 'none' };
  }
};
