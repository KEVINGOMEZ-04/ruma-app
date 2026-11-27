/**
 * Moderación UGC (obligatoria en Google Play): recepción de reportes de abuso/contenido inapropiado.
 */

import { rtdbAdminRequest, safeRtdbKey } from '../firebase-admin.js';

const VALID_REASONS = new Set(['spam', 'harassment', 'inappropriate', 'illegal', 'impersonation', 'other']);

export async function handleUgcReport(request, env, authUser, jsonRes) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const groupId = String(body.groupId || '').trim().slice(0, 80);
  const targetType = String(body.targetType || 'message').trim().slice(0, 30);
  const targetId = String(body.targetId || '').trim().slice(0, 120);
  const targetUserId = String(body.targetUserId || '').trim().slice(0, 120);
  const reason = VALID_REASONS.has(body.reason) ? body.reason : 'other';
  const details = String(body.details || '').trim().slice(0, 600);

  if (!targetId && !targetUserId) {
    return jsonRes({ ok: false, error: 'Debes indicar el contenido o usuario a reportar.' }, 400);
  }

  const reportId = `rep_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    id: reportId,
    reporterId: authUser.uid,
    reporterEmail: authUser.email || '',
    groupId,
    targetType,
    targetId,
    targetUserId,
    reason,
    details,
    status: 'open',
    createdAt: new Date().toISOString()
  };

  await rtdbAdminRequest(env, `/reports/${safeRtdbKey(reportId)}.json`, {
    method: 'PUT',
    body: record
  });

  return jsonRes({ ok: true, reportId }, 201);
}
