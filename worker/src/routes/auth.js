/**
 * Resuelve un `@usuario` a su correo de inicio de sesión Firebase Auth sin exponer `/accounts`.
 */

import { rtdbAdminRequest, safeRtdbKey } from '../firebase-admin.js';

export async function handleResolveIdentifier(request, env, jsonRes) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const raw = String(body.identifier || '').trim().toLowerCase().replace(/^@+/, '');
  if (!raw || raw.length < 2 || raw.length > 80) {
    return jsonRes({ ok: false, error: 'Identificador inválido.' }, 400);
  }

  if (raw.includes('@')) {
    return jsonRes({ ok: true, email: raw }, 200);
  }

  const entry = await rtdbAdminRequest(env, `/usernames/${safeRtdbKey(raw)}.json`).catch(() => null);
  if (!entry?.email) {
    return jsonRes({ ok: false, error: 'No encontramos una cuenta con ese @usuario.' }, 404);
  }

  return jsonRes({ ok: true, email: String(entry.email).trim().toLowerCase() }, 200);
}
