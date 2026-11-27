import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    clear: () => { data.clear(); }
  };
}

globalThis.localStorage = createMemoryStorage();
globalThis.sessionStorage = createMemoryStorage();
globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }));

const { CONFIG } = await import('../src/core/config.js');
CONFIG.cloudSync.enabled = false;

const { Utils } = await import('../src/core/utils.js');
const { CryptoAuth } = await import('../src/core/crypto.js');
const { store } = await import('../src/core/store.js');
const { buildMemberIdsMap, compactGroupForStorage } = await import('../src/core/store-sync-merge.js');
const { buildReminderSchedules, parseEventDateTime } = await import('../src/services/reminders-service.js');
const { FirebaseAuth } = await import('../src/services/firebase-auth.js');

describe('CSS injection hardening & security invariants (Fase 0)', () => {
  it('sanitizes CSS URLs by neutralizing quotes, parentheses, and backslashes', () => {
    const evil = `https://example.com/a'b(c)d\\e.png`;
    const safe = Utils.safeCssUrl(evil, '');
    expect(safe).not.toContain("'");
    expect(safe).not.toContain('(');
    expect(safe).not.toContain(')');
    expect(safe).not.toContain('\\');
    expect(Utils.safeCssUrl('javascript:alert(1)', '')).toBe('');
  });

  it('blocks CSS property injection via bannerGradient allowlist', () => {
    const valid = 'linear-gradient(135deg,#7C3AED 0%,#C084FC 50%,#F472B6 100%)';
    expect(Utils.safeCssGradient(valid)).toBe(valid);
    expect(Utils.safeCssGradient('#7C3AED')).toBe('#7C3AED');

    const injected = 'red; background-image: url(https://evil.test/x)';
    expect(Utils.safeCssGradient(injected, '#000')).toBe('#000');
  });

  it('never embeds hardcoded TMDb API keys in CONFIG by default', () => {
    expect(CONFIG.tmdb.apiKey).toBe('');
    expect(CONFIG.tmdb.backupKeys).toEqual([]);
  });

  it('never allows localStorage ruma_dev_tools to unlock beta self-upgrade in production', () => {
    localStorage.setItem('ruma_dev_tools', '1');
    // En Vitest (DEV=false o test env), verifica que el flag localStorage por sí solo no existe en la implementación
    const fnSrc = CryptoAuth.isBetaSelfUpgradeAllowed.toString();
    expect(fnSrc).not.toContain('ruma_dev_tools');
  });
});

describe('RTDB security rules & Android manifest compliance (Play Store 2026)', () => {
  it('enforces auth, memberIds isolation, non-plaintext passwords, and read-only entitlements in database.rules.json', () => {
    const rulesRaw = fs.readFileSync(path.resolve(process.cwd(), 'database.rules.json'), 'utf8');
    const rules = JSON.parse(rulesRaw);
    const root = rules.rules.ruma_cloud_v1;

    expect(rules.rules['.read']).toBe(false);
    expect(rules.rules['.write']).toBe(false);
    expect(root.accounts.$uid['.validate']).toContain("!newData.hasChild('password')");
    expect(root.entitlements.$uid['.write']).toBe(false);
    expect(root.groups.$groupId['.read']).toContain('memberIds');
    expect(root.groups.$groupId.plan['.validate']).toContain('entitlements');
  });

  it('configures AndroidManifest.xml with appId app.ruma.social and blocks restricted Play Store permissions', () => {
    const capCfg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'capacitor.config.json'), 'utf8'));
    expect(capCfg.appId).toBe('app.ruma.social');

    const manifest = fs.readFileSync(path.resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS');
    expect(manifest).toContain('android.permission.RUN_USER_INITIATED_JOBS');
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_DATA_SYNC');
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('READ_MEDIA_IMAGES" tools:node="remove"');
    expect(manifest).toContain('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" tools:node="remove"');
    expect(manifest).toContain('USE_EXACT_ALARM" tools:node="remove"');
  });

  it('always keeps memberIds map synchronized in compactGroupForStorage', () => {
    const group = {
      id: 'g_sync',
      creatorId: 'uid_creator',
      members: [{ id: 'uid_creator', role: 'admin' }, { id: 'uid_m2', role: 'member' }]
    };
    expect(buildMemberIdsMap(group)).toEqual({ uid_creator: true, uid_m2: true });
    expect(compactGroupForStorage(group).memberIds).toEqual({ uid_creator: true, uid_m2: true });
  });
});

describe('Google Play UGC moderation & in-app account deletion', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    const u1 = { id: 'u1', name: 'Kevin', username: 'kevin', email: 'k@ruma.app', isPremium: false };
    const u2 = { id: 'u2', name: 'Trol', username: 'trol', email: 't@ruma.app', isPremium: false };
    const grp = {
      id: 'g1',
      name: 'Amigos',
      code: 'K9R4M2',
      plan: 'free',
      creatorId: 'u1',
      memberIds: { u1: true, u2: true },
      members: [
        { id: 'u1', name: 'Kevin', role: 'admin' },
        { id: 'u2', name: 'Trol', role: 'member' }
      ]
    };
    localStorage.setItem(CONFIG.storageKeys.accounts, JSON.stringify([u1, u2]));
    localStorage.setItem(CONFIG.storageKeys.currentUserId, 'u1');
    localStorage.setItem(CONFIG.storageKeys.groups, JSON.stringify([grp]));
    localStorage.setItem(CONFIG.storageKeys.activeGroupId, 'g1');
  });

  it('blocks and unblocks users cleanly and prevents self-blocking', () => {
    expect(store.blockUser('u1').ok).toBe(false);
    expect(store.blockUser('u2').ok).toBe(true);
    expect(store.isUserBlocked('u2')).toBe(true);
    expect(store.unblockUser('u2').ok).toBe(true);
    expect(store.isUserBlocked('u2')).toBe(false);
  });

  it('allows group admin to kick a non-creator member and updates memberIds', async () => {
    const res = await store.removeMemberFromGroup('g1', 'u2');
    expect(res.ok).toBe(true);
    const updated = store.getGroups().find(g => g.id === 'g1');
    expect(updated.members.map(m => m.id)).toEqual(['u1']);
    expect(updated.memberIds).toEqual({ u1: true });
  });

  it('deletes current user account in-app and clears session + group membership', async () => {
    const res = await store.deleteCurrentUserAccountAsync();
    expect(res.ok).toBe(true);
    expect(store.getCurrentUser()).toBeNull();
    expect(store.getAccounts().some(a => a.id === 'u1')).toBe(false);
    const remainingGroup = store.getGroups().find(g => g.id === 'g1');
    expect(remainingGroup.members.map(m => m.id)).toEqual(['u2']);
    expect(remainingGroup.creatorId).toBe('u2');
  });
});

describe('RemindersService & FirebaseAuth token lifecycle', () => {
  it('builds Google-Play-safe inexact 24h and 1h reminders for future plans', () => {
    const now = new Date('2026-11-26T10:00:00').getTime();
    const dt = parseEventDateTime('2026-11-30', '18:00');
    expect(dt).not.toBeNull();

    const list = buildReminderSchedules(
      { id: 'pln_1', title: 'Noche de cine', date: '2026-11-30', time: '18:00' },
      { groupId: 'g1', groupName: 'Santuario', kind: 'plan', now }
    );
    expect(list).toHaveLength(2);
    expect(list[0].channelId).toBe('reminders');
    expect(list[0].schedule.allowWhileIdle).toBe(true);
  });

  it('authenticates and refreshes JWT cleanly when FirebaseAuth apiKey is configured', async () => {
    const prevKey = CONFIG.firebaseAuth.apiKey;
    CONFIG.firebaseAuth.apiKey = 'test_web_api_key';
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('accounts:signInWithPassword')) {
        return {
          ok: true,
          json: async () => ({
            localId: 'fb_uid_1',
            email: 'kevin@ruma.app',
            idToken: 'jwt_initial',
            refreshToken: 'ref_1',
            expiresIn: '3600'
          })
        };
      }
      if (String(url).includes('securetoken.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            user_id: 'fb_uid_1',
            id_token: 'jwt_refreshed',
            refresh_token: 'ref_2',
            expires_in: '3600'
          })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    try {
      const session = await FirebaseAuth.signInWithEmail('kevin@ruma.app', 'secret123');
      expect(session.uid).toBe('fb_uid_1');
      expect(session.idToken).toBe('jwt_initial');

      const refreshed = await FirebaseAuth.refreshIdToken();
      expect(refreshed.idToken).toBe('jwt_refreshed');
      await FirebaseAuth.signOut();
      expect(FirebaseAuth.getSession()).toBeNull();
    } finally {
      CONFIG.firebaseAuth.apiKey = prevKey;
    }
  });
});
