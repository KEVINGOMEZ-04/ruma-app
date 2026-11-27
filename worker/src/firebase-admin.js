/**
 * ruma Backend (Cloudflare Workers) — Helper Firebase Admin puro con Web Crypto API
 *
 * Permite operar al 100 % en Cloudflare Workers Free ($0) sin SDK pesado de Node:
 * - Verifica Firebase Auth ID Tokens contra las llaves públicas de Google (RS256).
 * - Firma JWT con Service Account JSON (Web Crypto RS256) para obtener OAuth2 Access Tokens.
 * - Lee/escribe en Firebase RTDB con permisos de servidor.
 * - Envía notificaciones Push nativas mediante FCM HTTP v1 API (gratuito en Firebase Spark).
 * - Elimina usuarios definitivamente en Firebase Auth vía Identity Toolkit Admin API.
 */

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ADMIN_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/identitytoolkit'
].join(' ');

let cachedJwks = null;
let cachedJwksExpiresAt = 0;
let cachedAdminToken = null;
let cachedAdminTokenExpiresAt = 0;

function base64UrlToBytes(input) {
  const b64 = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeJsonBase64Url(obj) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}

function pemToArrayBuffer(pem) {
  const clean = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function safeRtdbKey(id) {
  return encodeURIComponent(String(id || '').replace(/[.$#[\]/]/g, '_'));
}

async function fetchGoogleJwks() {
  const now = Date.now();
  if (cachedJwks && now < cachedJwksExpiresAt) return cachedJwks;

  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) throw new Error(`No se pudieron obtener las llaves JWKS de Firebase (HTTP ${res.status})`);
  const data = await res.json();
  const maxAgeMatch = (res.headers.get('cache-control') || '').match(/max-age=(\d+)/);
  const ttlMs = (maxAgeMatch ? Number(maxAgeMatch[1]) : 3600) * 1000;
  cachedJwks = Array.isArray(data.keys) ? data.keys : [];
  cachedJwksExpiresAt = now + ttlMs;
  return cachedJwks;
}

/**
 * Verifica criptográficamente un Firebase Auth ID Token (RS256 + aud + iss + exp + sub).
 */
export async function verifyFirebaseIdToken(idToken, projectId) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Token de sesión faltante.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Token JWT inválido.');

  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Algoritmo JWT no soportado.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new Error('Audiencia de token inválida.');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('Emisor de token inválido.');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('UID de token ausente.');
  if (Number(payload.exp || 0) <= nowSec) throw new Error('Sesión expirada.');
  if (Number(payload.iat || 0) > nowSec + 300) throw new Error('Token emitido en el futuro.');

  const keys = await fetchGoogleJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Llave pública de verificación no encontrada.');

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToBytes(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signingInput);
  if (!valid) throw new Error('Firma criptográfica del token inválida.');

  return {
    uid: payload.sub,
    email: payload.email || '',
    emailVerified: Boolean(payload.email_verified),
    name: payload.name || ''
  };
}

/**
 * Obtiene un OAuth2 Access Token de servidor usando la Service Account JSON de Firebase.
 */
export async function getAdminAccessToken(env) {
  const now = Date.now();
  if (cachedAdminToken && now < cachedAdminTokenExpiresAt) {
    return cachedAdminToken;
  }

  const rawSa = env?.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawSa) throw new Error('Falta secreto FIREBASE_SERVICE_ACCOUNT_JSON en Cloudflare Worker.');
  const sa = typeof rawSa === 'string' ? JSON.parse(rawSa) : rawSa;

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;
  const headerB64 = encodeJsonBase64Url({ alg: 'RS256', typ: 'JWT' });
  const claimB64 = encodeJsonBase64Url({
    iss: sa.client_email,
    scope: ADMIN_SCOPES,
    aud: OAUTH_TOKEN_URL,
    iat,
    exp
  });

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${headerB64}.${claimB64}`)
  );
  const assertion = `${headerB64}.${claimB64}.${bytesToBase64Url(new Uint8Array(sigBuf))}`;

  const tokenRes = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Error autenticando Service Account: HTTP ${tokenRes.status} ${errText.slice(0, 160)}`);
  }

  const tokenData = await tokenRes.json();
  cachedAdminToken = tokenData.access_token;
  cachedAdminTokenExpiresAt = now + ((Number(tokenData.expires_in) || 3500) - 120) * 1000;
  return cachedAdminToken;
}

export async function rtdbAdminRequest(env, subPath, { method = 'GET', body = undefined } = {}) {
  const token = await getAdminAccessToken(env);
  const dbUrl = (env.FIREBASE_DATABASE_URL || 'https://luma-f53ee-default-rtdb.firebaseio.com').replace(/\/+$/, '');
  const rootPath = (env.FIREBASE_ROOT_PATH || 'ruma_cloud_v1').replace(/^\/+|\/+$/g, '');
  const clean = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const url = `${dbUrl}/${rootPath}${clean}?access_token=${encodeURIComponent(token)}`;

  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`RTDB Admin ${method} ${clean} falló con HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Envía una notificación Push Android/iOS mediante FCM HTTP v1 API.
 */
export async function sendFcmNotification(env, { token, title, body, channelId = 'chat_messages', data = {} }) {
  if (!token) return { ok: false, invalidToken: false };
  const accessToken = await getAdminAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID || 'luma-f53ee';
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

  const stringData = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) stringData[k] = String(v);
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: String(title || 'ruma').slice(0, 120),
          body: String(body || '').slice(0, 240)
        },
        data: stringData,
        android: {
          priority: 'HIGH',
          notification: {
            channel_id: channelId,
            sound: 'default'
          }
        }
      }
    })
  });

  if (res.ok) return { ok: true, invalidToken: false };
  const errBody = await res.text().catch(() => '');
  const invalidToken = res.status === 404 || errBody.includes('UNREGISTERED') || errBody.includes('INVALID_ARGUMENT');
  return { ok: false, invalidToken, status: res.status };
}

/**
 * Elimina un usuario de Firebase Authentication con credenciales de servidor.
 */
export async function deleteFirebaseAuthUser(env, uid) {
  const accessToken = await getAdminAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID || 'luma-f53ee';
  const url = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:delete`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ localId: uid })
  });
  return res.ok || res.status === 400;
}

export function resetAdminCachesForTests() {
  cachedJwks = null;
  cachedJwksExpiresAt = 0;
  cachedAdminToken = null;
  cachedAdminTokenExpiresAt = 0;
}
