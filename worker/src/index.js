/**
 * ruma Backend — Cloudflare Worker (Plan Gratuito $0)
 *
 * Rutas expuestas:
 * - GET  /health                         (diagnóstico)
 * - GET  /api/tmdb?path=...              (proxy cacheado TMDb, requiere Firebase ID Token o público con origen permitido)
 * - POST /api/auth/resolve-identifier    (resuelve @usuario -> email para Firebase Auth)
 * - POST /api/groups/join                (auth: unión segura por código de 6 caracteres)
 * - POST /api/push/register              (auth: registra token FCM Android/iOS)
 * - DELETE /api/push/register            (auth: elimina token FCM al cerrar sesión)
 * - POST /api/push/group-event           (auth: envía push FCM a miembros del grupo)
 * - POST /api/ugc/report                 (auth: reporte UGC obligatorio en Google Play)
 * - GET  /api/billing/status             (auth: consulta estado autoritativo de ruma Plus)
 * - POST /api/webhooks/revenuecat        (webhook firmado de RevenueCat / Google Play Billing)
 * - DELETE /api/account                  (auth: eliminación definitiva in-app de cuenta y datos)
 */

import { verifyFirebaseIdToken } from './firebase-admin.js';
import { handleTmdbProxy } from './routes/tmdb.js';
import { handleResolveIdentifier } from './routes/auth.js';
import { handleJoinGroupByCode } from './routes/groups.js';
import { handleRegisterPushToken, handleGroupPushEvent } from './routes/push.js';
import { handleUgcReport } from './routes/ugc.js';
import { handleRevenueCatWebhook, handleBillingStatus } from './routes/billing.js';
import { handleDeleteAccount } from './routes/account.js';

function getCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env?.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowOrigin = !origin
    ? '*'
    : (allowed.includes(origin) ? origin : (allowed[0] || '*'));

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
}

function makeJsonResponder(corsHeaders) {
  return (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...extraHeaders
    }
  });
}

async function requireAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error('Authorization Bearer token requerido.');
  return verifyFirebaseIdToken(match[1].trim(), env.FIREBASE_PROJECT_ID || 'luma-f53ee');
}

export async function handleWorkerRequest(request, env = {}) {
  const corsHeaders = getCorsHeaders(request, env);
  const jsonRes = makeJsonResponder(corsHeaders);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (request.method === 'GET' && path === '/health') {
      return jsonRes({ ok: true, service: 'ruma-backend', appId: 'app.ruma.social' }, 200);
    }

    // Webhook de RevenueCat usa su propio Bearer Secret (no Firebase ID Token)
    if (request.method === 'POST' && path === '/api/webhooks/revenuecat') {
      return await handleRevenueCatWebhook(request, env, jsonRes);
    }

    if (request.method === 'POST' && path === '/api/auth/resolve-identifier') {
      return await handleResolveIdentifier(request, env, jsonRes);
    }

    if (request.method === 'GET' && path === '/api/tmdb') {
      return await handleTmdbProxy(request, env, jsonRes);
    }

    // Rutas protegidas con Firebase Auth ID Token verificado
    let authUser;
    try {
      authUser = await requireAuth(request, env);
    } catch (authErr) {
      return jsonRes({ ok: false, error: authErr.message || 'Sesión inválida.' }, 401);
    }

    if (request.method === 'POST' && path === '/api/groups/join') {
      return await handleJoinGroupByCode(request, env, authUser, jsonRes);
    }
    if ((request.method === 'POST' || request.method === 'DELETE') && path === '/api/push/register') {
      return await handleRegisterPushToken(request, env, authUser, jsonRes);
    }
    if (request.method === 'POST' && path === '/api/push/group-event') {
      return await handleGroupPushEvent(request, env, authUser, jsonRes);
    }
    if (request.method === 'POST' && path === '/api/ugc/report') {
      return await handleUgcReport(request, env, authUser, jsonRes);
    }
    if (request.method === 'GET' && path === '/api/billing/status') {
      return await handleBillingStatus(request, env, authUser, jsonRes);
    }
    if (request.method === 'DELETE' && path === '/api/account') {
      return await handleDeleteAccount(request, env, authUser, jsonRes);
    }

    return jsonRes({ ok: false, error: 'Ruta no encontrada.' }, 404);
  } catch (err) {
    return jsonRes({ ok: false, error: err?.message || 'Error interno del servidor.' }, 500);
  }
}

export default {
  fetch: handleWorkerRequest
};
