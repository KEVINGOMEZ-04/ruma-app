/**
 * Unión segura a grupo por código de 6 caracteres sin exponer `/groups` al cliente.
 */

import { rtdbAdminRequest, safeRtdbKey } from '../firebase-admin.js';

export async function handleJoinGroupByCode(request, env, authUser, jsonRes) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const code = String(body.code || '').replace(/[\s-]+/g, '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return jsonRes({ ok: false, error: 'Ingresa un código de invitación válido de 6 caracteres.' }, 400);
  }

  const invite = await rtdbAdminRequest(env, `/inviteCodes/${safeRtdbKey(code)}.json`);
  const groupId = invite?.groupId;
  if (!groupId) {
    return jsonRes({ ok: false, error: 'No se encontró ningún grupo con ese código de invitación.' }, 404);
  }

  const group = await rtdbAdminRequest(env, `/groups/${safeRtdbKey(groupId)}.json`);
  if (!group || group.deleted) {
    return jsonRes({ ok: false, error: 'Este grupo ya no está disponible.' }, 404);
  }

  const members = Array.isArray(group.members) ? [...group.members] : [];
  const memberIds = { ...(group.memberIds || {}) };
  if (group.creatorId) memberIds[group.creatorId] = true;
  members.forEach(m => { if (m?.id) memberIds[m.id] = true; });

  const alreadyMember = Boolean(memberIds[authUser.uid] || members.some(m => m.id === authUser.uid));
  if (!alreadyMember) {
    const account = await rtdbAdminRequest(env, `/accounts/${safeRtdbKey(authUser.uid)}.json`) || {};
    const userGroupsMap = await rtdbAdminRequest(env, `/userGroups/${safeRtdbKey(authUser.uid)}.json`) || {};
    const activeGroupIds = Object.keys(userGroupsMap).filter(k => userGroupsMap[k] === true);
    const isPremium = Boolean(account.isPremium || account.entitlements?.plus === true);

    if (!isPremium && activeGroupIds.length >= 2) {
      return jsonRes({
        ok: false,
        needsUpgrade: true,
        error: 'En el Plan Free puedes pertenecer hasta a 2 grupos. Activa ruma Plus para unirte a grupos ilimitados.'
      }, 403);
    }

    const nowIso = new Date().toISOString();
    members.push({
      id: authUser.uid,
      name: account.name || authUser.name || 'Miembro ruma',
      username: account.username || (authUser.email ? authUser.email.split('@')[0] : 'usuario'),
      avatar: account.avatar || 'assets/ruma_default_avatar.png',
      frameId: account.frameId || 'frame-none',
      role: 'member',
      joinedAt: nowIso
    });
    memberIds[authUser.uid] = true;

    const updatedGroup = {
      ...group,
      members,
      memberIds,
      updatedAt: nowIso
    };

    await Promise.all([
      rtdbAdminRequest(env, `/groups/${safeRtdbKey(groupId)}.json`, {
        method: 'PATCH',
        body: { members, memberIds, updatedAt: nowIso }
      }),
      rtdbAdminRequest(env, `/userGroups/${safeRtdbKey(authUser.uid)}/${safeRtdbKey(groupId)}.json`, {
        method: 'PUT',
        body: true
      })
    ]);

    return jsonRes({ ok: true, alreadyMember: false, group: updatedGroup }, 200);
  }

  return jsonRes({ ok: true, alreadyMember: true, group }, 200);
}
