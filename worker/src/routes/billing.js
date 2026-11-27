/**
 * Monetización oficial Google Play Billing v8+ vía RevenueCat Webhook (autoritativo en servidor).
 */

import { rtdbAdminRequest, safeRtdbKey } from '../firebase-admin.js';

const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE'
]);
const REVOKED_EVENTS = new Set(['EXPIRATION', 'BILLING_ISSUE']);

function timingSafeCompare(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (!sa || sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

export async function handleRevenueCatWebhook(request, env, jsonRes) {
  const expectedSecret = (env?.REVENUECAT_WEBHOOK_SECRET || '').trim();
  if (!expectedSecret) {
    return jsonRes({ ok: false, error: 'Webhook no configurado.' }, 503);
  }

  const authHeader = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!timingSafeCompare(authHeader, expectedSecret)) {
    return jsonRes({ ok: false, error: 'No autorizado.' }, 401);
  }

  let payload = {};
  try { payload = await request.json(); } catch (_) {
    return jsonRes({ ok: false, error: 'JSON inválido.' }, 400);
  }

  const evt = payload.event || {};
  const uid = String(evt.app_user_id || '').trim();
  const eventType = String(evt.type || '').toUpperCase();
  if (!uid) {
    return jsonRes({ ok: false, error: 'app_user_id ausente.' }, 400);
  }

  let isPlus = null;
  if (ACTIVE_EVENTS.has(eventType)) isPlus = true;
  else if (REVOKED_EVENTS.has(eventType)) isPlus = false;

  if (isPlus === null) {
    return jsonRes({ ok: true, ignored: eventType }, 200);
  }

  const nowIso = new Date().toISOString();
  const expiresAtMs = Number(evt.expiration_at_ms) || null;

  const entitlementPayload = {
    plus: isPlus,
    productId: evt.product_id || '',
    store: evt.store || 'PLAY_STORE',
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    lastEvent: eventType,
    updatedAt: nowIso
  };

  await Promise.all([
    rtdbAdminRequest(env, `/entitlements/${safeRtdbKey(uid)}.json`, {
      method: 'PUT',
      body: entitlementPayload
    }),
    rtdbAdminRequest(env, `/accounts/${safeRtdbKey(uid)}.json`, {
      method: 'PATCH',
      body: {
        isPremium: isPlus,
        updatedAt: nowIso
      }
    })
  ]);

  // Sincronizar el plan de los grupos creados por el usuario
  const userGroupsMap = await rtdbAdminRequest(env, `/userGroups/${safeRtdbKey(uid)}.json`).catch(() => null);
  if (userGroupsMap && typeof userGroupsMap === 'object') {
    await Promise.all(Object.keys(userGroupsMap).map(async (gid) => {
      const grp = await rtdbAdminRequest(env, `/groups/${safeRtdbKey(gid)}.json`).catch(() => null);
      if (grp && grp.creatorId === uid && !grp.deleted) {
        await rtdbAdminRequest(env, `/groups/${safeRtdbKey(gid)}.json`, {
          method: 'PATCH',
          body: { plan: isPlus ? 'premium' : 'free', updatedAt: nowIso }
        }).catch(() => {});
      }
    }));
  }

  return jsonRes({ ok: true, uid, isPlus }, 200);
}

export async function handleBillingStatus(_request, env, authUser, jsonRes) {
  const [entitlements, account] = await Promise.all([
    rtdbAdminRequest(env, `/entitlements/${safeRtdbKey(authUser.uid)}.json`).catch(() => null),
    rtdbAdminRequest(env, `/accounts/${safeRtdbKey(authUser.uid)}.json`).catch(() => null)
  ]);
  const isPremium = Boolean(entitlements?.plus === true || account?.isPremium === true);
  return jsonRes({
    ok: true,
    isPremium,
    entitlements: entitlements || { plus: isPremium }
  }, 200);
}
