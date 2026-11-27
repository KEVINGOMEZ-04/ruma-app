/**
 * Registro de dispositivos FCM y envío de notificaciones Push de grupo (app cerrada / 2.º plano).
 */

import { rtdbAdminRequest, sendFcmNotification, safeRtdbKey } from '../firebase-admin.js';

export async function handleRegisterPushToken(request, env, authUser, jsonRes) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const deviceId = String(body.deviceId || '').trim().slice(0, 80);
  const token = String(body.token || '').trim().slice(0, 512);
  const platform = String(body.platform || 'android').trim().slice(0, 20);

  if (!deviceId) {
    return jsonRes({ ok: false, error: 'deviceId requerido.' }, 400);
  }

  if (request.method === 'DELETE') {
    await rtdbAdminRequest(env, `/userDevices/${safeRtdbKey(authUser.uid)}/${safeRtdbKey(deviceId)}.json`, {
      method: 'DELETE'
    });
    return jsonRes({ ok: true }, 200);
  }

  if (!token) {
    return jsonRes({ ok: false, error: 'Token FCM requerido.' }, 400);
  }

  await rtdbAdminRequest(env, `/userDevices/${safeRtdbKey(authUser.uid)}/${safeRtdbKey(deviceId)}.json`, {
    method: 'PUT',
    body: {
      token,
      platform,
      updatedAt: new Date().toISOString()
    }
  });

  return jsonRes({ ok: true }, 200);
}

export async function handleGroupPushEvent(request, env, authUser, jsonRes) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const groupId = String(body.groupId || '').trim();
  const title = String(body.title || 'ruma').trim().slice(0, 100);
  const messageBody = String(body.body || '').trim().slice(0, 220);
  const type = String(body.type || 'chat').trim();

  if (!groupId || !messageBody) {
    return jsonRes({ ok: false, error: 'groupId y body son requeridos.' }, 400);
  }

  const group = await rtdbAdminRequest(env, `/groups/${safeRtdbKey(groupId)}.json`);
  if (!group || group.deleted) {
    return jsonRes({ ok: false, error: 'Grupo no encontrado.' }, 404);
  }

  const isMember = Boolean(
    group.creatorId === authUser.uid ||
    group.memberIds?.[authUser.uid] === true ||
    (group.members || []).some(m => m.id === authUser.uid)
  );
  if (!isMember) {
    return jsonRes({ ok: false, error: 'No perteneces a este grupo.' }, 403);
  }

  const recipientIds = new Set();
  if (group.creatorId && group.creatorId !== authUser.uid) recipientIds.add(group.creatorId);
  Object.entries(group.memberIds || {}).forEach(([uid, ok]) => {
    if (ok === true && uid !== authUser.uid) recipientIds.add(uid);
  });
  (group.members || []).forEach(m => {
    if (m?.id && m.id !== authUser.uid) recipientIds.add(m.id);
  });

  const channelId = type === 'chat' ? 'chat_messages' : 'group_activity';
  let sent = 0;

  await Promise.all(Array.from(recipientIds).map(async (uid) => {
    // Respetar usuarios bloqueados por el destinatario
    const recipientAccount = await rtdbAdminRequest(env, `/accounts/${safeRtdbKey(uid)}.json`).catch(() => null);
    const blocked = Array.isArray(recipientAccount?.blockedUserIds) ? recipientAccount.blockedUserIds : [];
    if (blocked.includes(authUser.uid)) return;

    const devicesMap = await rtdbAdminRequest(env, `/userDevices/${safeRtdbKey(uid)}.json`).catch(() => null);
    if (!devicesMap || typeof devicesMap !== 'object') return;

    await Promise.all(Object.entries(devicesMap).map(async ([devId, dev]) => {
      if (!dev?.token) return;
      const result = await sendFcmNotification(env, {
        token: dev.token,
        title,
        body: messageBody,
        channelId,
        data: {
          groupId,
          type,
          tab: type === 'chat' ? 'chat' : 'home'
        }
      });
      if (result.ok) {
        sent += 1;
      } else if (result.invalidToken) {
        await rtdbAdminRequest(env, `/userDevices/${safeRtdbKey(uid)}/${safeRtdbKey(devId)}.json`, {
          method: 'DELETE'
        }).catch(() => {});
      }
    }));
  }));

  return jsonRes({ ok: true, sent }, 200);
}
