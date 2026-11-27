/**
 * Eliminación irreversible de cuenta y datos (Política obligatoria de Google Play).
 */

import { rtdbAdminRequest, deleteFirebaseAuthUser, safeRtdbKey } from '../firebase-admin.js';

export async function handleDeleteAccount(_request, env, authUser, jsonRes) {
  const uid = authUser.uid;
  const nowIso = new Date().toISOString();

  const [account, userGroupsMap] = await Promise.all([
    rtdbAdminRequest(env, `/accounts/${safeRtdbKey(uid)}.json`).catch(() => null),
    rtdbAdminRequest(env, `/userGroups/${safeRtdbKey(uid)}.json`).catch(() => null)
  ]);

  // 1. Salir de todos los grupos o transferir liderazgo / borrar si era el único integrante
  if (userGroupsMap && typeof userGroupsMap === 'object') {
    await Promise.all(Object.keys(userGroupsMap).map(async (gid) => {
      const grp = await rtdbAdminRequest(env, `/groups/${safeRtdbKey(gid)}.json`).catch(() => null);
      if (!grp || grp.deleted) return;

      const remainingMembers = (grp.members || []).filter(m => m && m.id !== uid);
      if (remainingMembers.length === 0) {
        await Promise.all([
          rtdbAdminRequest(env, `/groups/${safeRtdbKey(gid)}.json`, { method: 'DELETE' }),
          rtdbAdminRequest(env, `/chat_media/${safeRtdbKey(gid)}.json`, { method: 'DELETE' }).catch(() => {}),
          grp.code
            ? rtdbAdminRequest(env, `/inviteCodes/${safeRtdbKey(String(grp.code).toUpperCase())}.json`, { method: 'DELETE' }).catch(() => {})
            : Promise.resolve()
        ]);
        return;
      }

      const nextMemberIds = {};
      remainingMembers.forEach(m => { nextMemberIds[m.id] = true; });
      let nextCreatorId = grp.creatorId;
      if (grp.creatorId === uid) {
        const nextLeader = remainingMembers.find(m => m.role === 'admin') || remainingMembers[0];
        nextLeader.role = 'admin';
        nextCreatorId = nextLeader.id;
      }

      const leftMembers = { ...(grp.leftMembers || {}), [uid]: nowIso };
      await rtdbAdminRequest(env, `/groups/${safeRtdbKey(gid)}.json`, {
        method: 'PATCH',
        body: {
          creatorId: nextCreatorId,
          members: remainingMembers,
          memberIds: nextMemberIds,
          leftMembers,
          updatedAt: nowIso
        }
      });
    }));
  }

  // 2. Eliminar cuenta, índice de username, lista de grupos y dispositivos FCM
  const deletions = [
    rtdbAdminRequest(env, `/accounts/${safeRtdbKey(uid)}.json`, { method: 'DELETE' }).catch(() => {}),
    rtdbAdminRequest(env, `/userGroups/${safeRtdbKey(uid)}.json`, { method: 'DELETE' }).catch(() => {}),
    rtdbAdminRequest(env, `/userDevices/${safeRtdbKey(uid)}.json`, { method: 'DELETE' }).catch(() => {})
  ];
  if (account?.username) {
    const cleanUser = String(account.username).trim().toLowerCase().replace(/^@+/, '');
    if (cleanUser) {
      deletions.push(
        rtdbAdminRequest(env, `/usernames/${safeRtdbKey(cleanUser)}.json`, { method: 'DELETE' }).catch(() => {})
      );
    }
  }
  await Promise.all(deletions);

  // 3. Eliminar usuario de Firebase Authentication
  await deleteFirebaseAuthUser(env, uid).catch(() => {});

  return jsonRes({ ok: true, deletedUid: uid }, 200);
}
