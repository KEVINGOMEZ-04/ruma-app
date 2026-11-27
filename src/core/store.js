/**
 * ruma 🌟 — Motor Central de Estado, Persistencia Multi-Grupo y Cuentas
 * Acoplado con todas las funciones completas de LUMA para Películas, Series, Recuerdos y Música.
 */

import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { CryptoAuth } from './crypto.js';
import { Entitlements } from './entitlements.js';
import { DriveBridge } from '../services/drive-bridge.js';
import { GoogleAuth } from '../services/google-auth.js';
import { CloudSync } from '../services/cloud-sync.js';
import { MediaStorage } from '../services/media-storage.js';
import { PRELOADED_SERIES_EPISODES } from '../services/media-api.js';
import {
  compactAvatar,
  compactGroupForStorage,
  hydrateGroupFromStorage,
  mergeAccountObjects,
  mergeCloudAndLocalGroups,
  stripGroupThumbnailsForEmergencyLocal
} from './store-sync-merge.js';

const fallbackKv = new Map();
let hadNonEmptyLocalStorage = false;

function syncFallbackWithClear() {
  try {
    const len = localStorage.length;
    if (typeof len === 'number') {
      if (len > 0) {
        hadNonEmptyLocalStorage = true;
      } else if (hadNonEmptyLocalStorage && len === 0) {
        hadNonEmptyLocalStorage = false;
        fallbackKv.clear();
      }
      return;
    }
    if (
      hadNonEmptyLocalStorage &&
      localStorage.getItem(CONFIG.storageKeys.accounts) === null &&
      localStorage.getItem(CONFIG.storageKeys.groups) === null &&
      localStorage.getItem(CONFIG.storageKeys.currentUserId) === null
    ) {
      hadNonEmptyLocalStorage = false;
      fallbackKv.clear();
    }
  } catch (_) {}
}

function safeGetStorage(key) {
  syncFallbackWithClear();
  if (fallbackKv.has(key)) {
    return fallbackKv.get(key);
  }
  try {
    const val = localStorage.getItem(key);
    if (val !== null) hadNonEmptyLocalStorage = true;
    return val;
  } catch (_) {
    return null;
  }
}

function safeSetStorage(key, value) {
  const str = String(value);
  try {
    localStorage.setItem(key, str);
    hadNonEmptyLocalStorage = true;
    fallbackKv.delete(key);
    return true;
  } catch (err) {
    console.warn('Error guardando en almacenamiento local (cuota iOS/Safari):', err?.name || err);
    return false;
  }
}

function safeSetScalarStorage(key, value) {
  const str = String(value);
  if (!safeSetStorage(key, str)) {
    fallbackKv.set(key, str);
    return false;
  }
  return true;
}

function safeRemoveStorage(key) {
  fallbackKv.delete(key);
  try {
    localStorage.removeItem(key);
  } catch (_) {}
}

class RumaStore {
  constructor() {
    this.listeners = [];
    this.currentInterface = 'hub'; // 'hub' | 'group' | 'profile' | 'settings'
    this.currentGroupTab = 'home'; // 'memories' | 'movies' | 'series' | 'music' | 'goals_notes' | 'chat'
    this.inspectedUserId = null;
    this.memoryFilterIds = null; // Permite filtrar recuerdos vinculados desde una canción o película
    this.clientId = 'cli_' + Math.random().toString(36).slice(2, 10);
    this.cloudPushTimer = null;
    this.dirtyAccountIds = new Set();
    this.dirtyGroupIds = new Set();
    this._syncedAccountSnapshots = new Map();
    this._syncedGroupSnapshots = new Map();
    this._memAccountsJson = null;
    this._lastAccountsStorageRaw = undefined;
    this._accountsQuotaOwner = undefined;
    this._memGroupsJson = null;
    this._lastGroupsStorageRaw = undefined;
    this._groupsQuotaOwner = undefined;
    this.init();
  }

  init() {
    if (!safeGetStorage(CONFIG.storageKeys.accounts)) {
      this._writeAccountsState([]);
    }
    if (!safeGetStorage(CONFIG.storageKeys.groups)) {
      this._writeGroupsState([]);
    }
    this._refreshSnapshots(this.getAccounts(), this.getGroupsRaw());
    const savedTheme = safeGetStorage(CONFIG.storageKeys.theme) || 'dark';
    this.setTheme(savedTheme, false);

    // Restaurar respaldo local de IndexedDB (crucial en iPhone cuando un grupo supera 5 MB de localStorage)
    // e iniciar sincronización en la nube en tiempo real
    this.restoreStateFromIndexedDB().finally(() => {
      this.bootstrapCloudSync();
    });
  }

  async restoreStateFromIndexedDB() {
    try {
      const [idbAccounts, idbGroups] = await Promise.all([
        MediaStorage.getAppState('accounts'),
        MediaStorage.getAppState('groups')
      ]);
      const hasAccounts = Array.isArray(idbAccounts) && idbAccounts.length > 0;
      const hasGroups = Array.isArray(idbGroups) && idbGroups.length > 0;
      if (hasAccounts || hasGroups) {
        this.applyRemoteCloudState({
          accounts: hasAccounts ? idbAccounts : [],
          groups: hasGroups ? idbGroups : []
        }, true);
      }
    } catch (_) {}
  }

  _readAccountsState() {
    const storageRaw = safeGetStorage(CONFIG.storageKeys.accounts);
    const currentOwner = safeGetStorage(CONFIG.storageKeys.currentUserId);
    const ownerReset = storageRaw === null && this._accountsQuotaOwner !== undefined && currentOwner !== this._accountsQuotaOwner;
    if (storageRaw !== this._lastAccountsStorageRaw || ownerReset) {
      this._lastAccountsStorageRaw = storageRaw;
      this._accountsQuotaOwner = undefined;
      this._memAccountsJson = storageRaw || '[]';
    }
    try {
      return JSON.parse(this._memAccountsJson || '[]') || [];
    } catch (_) {
      return [];
    }
  }

  _writeAccountsState(accounts) {
    const clean = Array.isArray(accounts) ? accounts : [];
    const json = JSON.stringify(clean);
    this._memAccountsJson = json;
    if (safeSetStorage(CONFIG.storageKeys.accounts, json)) {
      this._lastAccountsStorageRaw = json;
      this._accountsQuotaOwner = undefined;
    } else {
      this._lastAccountsStorageRaw = safeGetStorage(CONFIG.storageKeys.accounts);
      this._accountsQuotaOwner = safeGetStorage(CONFIG.storageKeys.currentUserId);
    }
    MediaStorage.saveAppState('accounts', clean).catch(() => {});
  }

  _readGroupsState() {
    const storageRaw = safeGetStorage(CONFIG.storageKeys.groups);
    const currentOwner = safeGetStorage(CONFIG.storageKeys.currentUserId);
    const ownerReset = storageRaw === null && this._groupsQuotaOwner !== undefined && currentOwner !== this._groupsQuotaOwner;
    if (storageRaw !== this._lastGroupsStorageRaw || ownerReset) {
      this._lastGroupsStorageRaw = storageRaw;
      this._groupsQuotaOwner = undefined;
      this._memGroupsJson = storageRaw || '[]';
    }
    try {
      return JSON.parse(this._memGroupsJson || '[]') || [];
    } catch (_) {
      return [];
    }
  }

  _writeGroupsState(groups) {
    const cleanList = (Array.isArray(groups) ? groups : [])
      .filter(g => !this.isLegacyDemoGroup(g))
      .map(g => compactGroupForStorage(g));
    const fullJson = JSON.stringify(cleanList);
    this._memGroupsJson = fullJson;

    if (safeSetStorage(CONFIG.storageKeys.groups, fullJson)) {
      this._lastGroupsStorageRaw = fullJson;
      this._groupsQuotaOwner = undefined;
    } else {
      const currentUserId = safeGetStorage(CONFIG.storageKeys.currentUserId);
      const prioritized = currentUserId
        ? cleanList.filter(g => g?.deleted || g?.creatorId === currentUserId || (g?.members || []).some(m => m.id === currentUserId))
        : cleanList;
      const prioJson = JSON.stringify(prioritized);

      if (prioJson.length < fullJson.length && safeSetStorage(CONFIG.storageKeys.groups, prioJson)) {
        this._lastGroupsStorageRaw = prioJson;
        this._groupsQuotaOwner = currentUserId;
      } else {
        const slimJson = JSON.stringify(prioritized.map(g => stripGroupThumbnailsForEmergencyLocal(g)));
        if (safeSetStorage(CONFIG.storageKeys.groups, slimJson)) {
          this._lastGroupsStorageRaw = slimJson;
        } else {
          this._lastGroupsStorageRaw = safeGetStorage(CONFIG.storageKeys.groups);
        }
        this._groupsQuotaOwner = currentUserId;
      }
    }

    MediaStorage.saveAppState('groups', cleanList).catch(() => {});
  }

  _refreshSnapshots(accounts = null, groups = null) {
    if (Array.isArray(accounts)) {
      accounts.forEach(a => {
        if (a && a.id) this._syncedAccountSnapshots.set(a.id, JSON.stringify(a));
      });
    }
    if (Array.isArray(groups)) {
      groups.forEach(g => {
        if (g && g.id) this._syncedGroupSnapshots.set(g.id, JSON.stringify(compactGroupForStorage(g)));
      });
    }
  }

  isLegacyDemoGroup(g) {
    return !g || g.id === 'grp_santuario_1' || g.id === 'grp_amigos_2' || g.id === 'grp_test_cloud_1' || g.id === 'grp_comunidad_2';
  }

  async bootstrapCloudSync() {
    try {
      const cloud = await CloudSync.pullCloudState();
      if (cloud && (Array.isArray(cloud.groups) || Array.isArray(cloud.accounts))) {
        this.applyRemoteCloudState(cloud, true);
        // Si la nube aún estaba en formato v1 (`state.json`), migrar automáticamente a v2 particionado
        if (cloud.needsV2Migration) {
          await CloudSync.pushEntities({
            accounts: this.getAccounts(),
            groups: this.getGroupsRaw(),
            clientId: this.clientId
          });
          this._refreshSnapshots(this.getAccounts(), this.getGroupsRaw());
        }
      } else {
        // Sembrar la nube v2 con el estado inicial si aún está vacía
        await CloudSync.pushEntities({
          accounts: this.getAccounts(),
          groups: this.getGroupsRaw(),
          clientId: this.clientId
        });
        this._refreshSnapshots(this.getAccounts(), this.getGroupsRaw());
      }

      if (this.getCurrentUser()) {
        this.checkPendingInviteFromUrl();
      }

      CloudSync.startRealtimeListener(this.clientId, (remoteData) => {
        this.applyRemoteCloudState(remoteData, true);
      });
    } catch (err) {
      console.warn('CloudSync bootstrap warning:', err);
    }
  }

  mergeCloudAndLocalGroups(baseGroups = [], incomingGroups = []) {
    return mergeCloudAndLocalGroups(baseGroups, incomingGroups);
  }

  applyRemoteCloudState(cloudData, shouldNotify = true) {
    if (!cloudData) return;
    let changed = false;

    if (Array.isArray(cloudData.accounts) && cloudData.accounts.length > 0) {
      const localAccounts = this.getAccounts();
      const mergedMap = new Map();
      localAccounts.forEach(a => mergedMap.set(a.id, a));
      cloudData.accounts.forEach(a => {
        if (!a || !a.id) return;
        const prev = mergedMap.get(a.id) || {};
        mergedMap.set(a.id, mergeAccountObjects(prev, a));
      });
      const mergedAccounts = Array.from(mergedMap.values());
      this._writeAccountsState(mergedAccounts);
      this._refreshSnapshots(mergedAccounts, null);
      changed = true;
    }

    if (Array.isArray(cloudData.groups) && cloudData.groups.length > 0) {
      const localGroups = this.getGroupsRaw();
      const mergedGroups = this.mergeCloudAndLocalGroups(localGroups, cloudData.groups);
      this._writeGroupsState(mergedGroups);
      this._refreshSnapshots(null, mergedGroups);
      changed = true;
    }

    if (changed && shouldNotify) {
      // Si hay un modal abierto, está en la pantalla de login o escribiendo en un input, evitar destruirle el formulario
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      const hasOpenModal = typeof document !== 'undefined' && Boolean(document.getElementById('ruma-active-modal'));
      const isAuthScreen = !this.getCurrentUser() && typeof document !== 'undefined' && Boolean(document.querySelector('.ruma-auth-stage'));
      if (!isTyping && !hasOpenModal && !isAuthScreen) {
        this.notify();
      }
    }
  }

  scheduleCloudPush() {
    if (this.cloudPushTimer) clearTimeout(this.cloudPushTimer);
    this.cloudPushTimer = setTimeout(() => {
      this.pushMergedStateToCloud();
    }, 350);
  }

  async pushMergedStateToCloud() {
    if (this._cloudPushInFlight) {
      return;
    }
    this._cloudPushInFlight = true;
    try {
      if (this.cloudPushTimer) {
        clearTimeout(this.cloudPushTimer);
        this.cloudPushTimer = null;
      }

      const dirtyAccIds = Array.from(this.dirtyAccountIds);
      const dirtyGrpIds = Array.from(this.dirtyGroupIds);
      this.dirtyAccountIds.clear();
      this.dirtyGroupIds.clear();

      if (!dirtyAccIds.length && !dirtyGrpIds.length) return;

      const accountsToPush = [];
      const groupsToPush = [];

      // Merge granular por cuenta modificada (re-leyendo estado tras el await para no perder cambios recientes)
      if (dirtyAccIds.length > 0) {
        const remoteResults = await Promise.all(dirtyAccIds.map(id => CloudSync.pullAccount(id)));
        const freshAccounts = this.getAccounts();
        const accMap = new Map(freshAccounts.map(a => [a.id, a]));
        dirtyAccIds.forEach((id, idx) => {
          const localAcc = accMap.get(id);
          if (!localAcc) return;
          const remoteAcc = remoteResults[idx];
          const merged = remoteAcc ? mergeAccountObjects(remoteAcc, localAcc) : mergeAccountObjects({}, localAcc);
          accMap.set(id, merged);
          accountsToPush.push(merged);
        });
        const nextAccounts = Array.from(accMap.values());
        this._writeAccountsState(nextAccounts);
        this._refreshSnapshots(accountsToPush, null);
      }

      // Merge granular por grupo modificado (re-leyendo estado tras el await para jamás revertir clics rápidos)
      if (dirtyGrpIds.length > 0) {
        const remoteResults = await Promise.all(dirtyGrpIds.map(id => CloudSync.pullGroup(id)));
        const freshGroups = this.getGroupsRaw();
        const grpMap = new Map(freshGroups.map(g => [g.id, g]));
        dirtyGrpIds.forEach((id, idx) => {
          const localGrp = grpMap.get(id);
          if (!localGrp) return;
          const remoteGrp = remoteResults[idx];
          const merged = remoteGrp
            ? (this.mergeCloudAndLocalGroups([remoteGrp], [localGrp])[0] || localGrp)
            : localGrp;
          const compacted = compactGroupForStorage(merged);
          grpMap.set(id, compacted);
          groupsToPush.push(compacted);
        });
        const nextGroups = Array.from(grpMap.values());
        this._writeGroupsState(nextGroups);
        this._refreshSnapshots(null, groupsToPush);
      }

      const ok = await CloudSync.pushEntities({
        accounts: accountsToPush,
        groups: groupsToPush,
        clientId: this.clientId
      });

      // Si falló la red, re-encolar los IDs para el próximo intento
      if (!ok) {
        accountsToPush.forEach(a => this.dirtyAccountIds.add(a.id));
        groupsToPush.forEach(g => this.dirtyGroupIds.add(g.id));
      }
    } catch (_) {
    } finally {
      this._cloudPushInFlight = false;
      // Si el usuario siguió haciendo cambios mientras se subía el lote anterior, programar el siguiente push
      if (this.dirtyAccountIds.size > 0 || this.dirtyGroupIds.size > 0) {
        this.scheduleCloudPush();
      }
    }
  }

  async syncNowWithCloud() {
    try {
      if (this.cloudPushTimer || this.dirtyAccountIds.size > 0 || this.dirtyGroupIds.size > 0) {
        await this.pushMergedStateToCloud();
      }
      const cloud = await CloudSync.pullCloudState(true);
      if (cloud) {
        this.applyRemoteCloudState(cloud, false);
      }
    } catch (_) {}
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  notify() {
    this.listeners.forEach(fn => fn());
  }

  setTheme(theme, emit = true) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    if (typeof document !== 'undefined') {
      document.documentElement?.setAttribute('data-theme', normalized);
      document.body?.setAttribute('data-theme', normalized);
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute('content', normalized === 'light' ? '#FCFAFF' : '#15111E');
    }
    safeSetScalarStorage(CONFIG.storageKeys.theme, normalized);
    if (emit) this.notify();
  }

  getTheme() {
    return safeGetStorage(CONFIG.storageKeys.theme) || 'dark';
  }

  // --- CUENTAS Y AUTENTICACIÓN SEGURA (HASH PBKDF2 + CÓDIGO DE RECUPERACIÓN) ---
  getAccounts() {
    return this._readAccountsState();
  }

  saveAccounts(accounts, syncCloud = true, explicitDirtyIds = null) {
    if (Array.isArray(explicitDirtyIds) && explicitDirtyIds.length > 0) {
      explicitDirtyIds.forEach(id => { if (id) this.dirtyAccountIds.add(id); });
    } else if (Array.isArray(accounts)) {
      accounts.forEach(a => {
        if (!a || !a.id) return;
        const snap = JSON.stringify(a);
        if (this._syncedAccountSnapshots.get(a.id) !== snap) {
          this.dirtyAccountIds.add(a.id);
        }
      });
    }
    this._writeAccountsState(accounts);
    if (syncCloud) this.scheduleCloudPush();
  }

  getCurrentUser() {
    const id = safeGetStorage(CONFIG.storageKeys.currentUserId);
    if (!id) return null;
    return this.getAccounts().find(u => u.id === id) || null;
  }

  async loginAsync(identifier, password) {
    await this.syncNowWithCloud();
    const clean = String(identifier || '').trim().toLowerCase().replace(/^@/, '');
    const accounts = this.getAccounts();
    const user = accounts.find(u =>
      (u.email && u.email.toLowerCase() === clean) ||
      (u.phone && u.phone.replace(/\s+/g, '') === clean) ||
      (u.username && u.username.toLowerCase() === clean)
    );

    if (!user) {
      return { ok: false, error: 'No encontramos una cuenta con ese correo, teléfono o @usuario. Si eres nuevo, pulsa en "Crear cuenta".' };
    }

    const check = await CryptoAuth.verifyAccountPassword(password, user);
    if (!check.valid) {
      return { ok: false, error: 'Contraseña incorrecta.' };
    }

    // Migración transparente: reemplazar contraseña legacy en texto plano por hash PBKDF2
    if (check.needsMigration) {
      user.passwordHash = user.passwordHash || await CryptoAuth.hashSecret(password);
      delete user.password;
      user.updatedAt = new Date().toISOString();
      this.saveAccounts(accounts, true, [user.id]);
      this.pushMergedStateToCloud();
    }

    safeSetScalarStorage(CONFIG.storageKeys.currentUserId, user.id);
    this.currentInterface = 'hub';
    this.checkPendingInviteFromUrl();
    this.notify();
    return { ok: true, user };
  }

  /**
   * Restablece contraseña únicamente si el usuario proporciona su Código de Recuperación personal válido.
   */
  async resetPasswordAsync(identifier, recoveryCode, newPassword) {
    await this.syncNowWithCloud();
    const clean = String(identifier || '').trim().toLowerCase().replace(/^@/, '');
    const cleanCode = CryptoAuth.normalizeRecoveryCode(recoveryCode);
    const nextPw = String(newPassword || '');

    if (!clean || !cleanCode || !nextPw) {
      return { ok: false, error: 'Completa tu usuario/correo, tu código de recuperación y la nueva contraseña.' };
    }
    if (nextPw.length < 6) {
      return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }

    const accounts = this.getAccounts();
    const user = accounts.find(u =>
      (u.email && u.email.toLowerCase() === clean) ||
      (u.phone && u.phone.replace(/\s+/g, '') === clean) ||
      (u.username && u.username.toLowerCase() === clean)
    );
    if (!user) {
      return { ok: false, error: 'No encontramos ninguna cuenta con esos datos.' };
    }
    if (!user.recoveryCodeHash) {
      return {
        ok: false,
        error: 'Esta cuenta aún no tiene un código de recuperación configurado. Si tienes sesión abierta en otro dispositivo, genera uno en Ajustes → Mi Cuenta.'
      };
    }

    const validCode = await CryptoAuth.verifySecret(cleanCode, user.recoveryCodeHash);
    if (!validCode) {
      return { ok: false, error: 'El código de recuperación no es válido.' };
    }

    // Rotar contraseña y generar un nuevo código de recuperación de un solo uso
    const newRecoveryCode = CryptoAuth.generateRecoveryCode();
    user.passwordHash = await CryptoAuth.hashSecret(nextPw);
    delete user.password;
    user.recoveryCodeHash = await CryptoAuth.hashSecret(CryptoAuth.normalizeRecoveryCode(newRecoveryCode));
    user.updatedAt = new Date().toISOString();

    this.saveAccounts(accounts, true, [user.id]);
    await this.pushMergedStateToCloud();
    return { ok: true, user, recoveryCode: newRecoveryCode };
  }

  /**
   * Cambia la contraseña desde Ajustes validando primero la contraseña actual.
   */
  async changePasswordAsync(currentPassword, newPassword) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, error: 'Debes iniciar sesión.' };
    const nextPw = String(newPassword || '');
    if (nextPw.length < 6) {
      return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
    }

    const accounts = this.getAccounts();
    const idx = accounts.findIndex(u => u.id === current.id);
    if (idx === -1) return { ok: false, error: 'Cuenta no encontrada.' };

    const user = accounts[idx];
    const hasExistingPassword = Boolean(user.passwordHash || user.password);
    if (hasExistingPassword) {
      const check = await CryptoAuth.verifyAccountPassword(currentPassword, user);
      if (!check.valid) {
        return { ok: false, error: 'La contraseña actual no coincide.' };
      }
    }

    user.passwordHash = await CryptoAuth.hashSecret(nextPw);
    delete user.password;
    user.updatedAt = new Date().toISOString();
    this.saveAccounts(accounts, true, [user.id]);
    await this.pushMergedStateToCloud();
    return { ok: true, user };
  }

  /**
   * Genera o renueva el código personal de recuperación de la cuenta actual.
   */
  async regenerateRecoveryCodeAsync(currentPassword) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, error: 'Debes iniciar sesión.' };

    const accounts = this.getAccounts();
    const idx = accounts.findIndex(u => u.id === current.id);
    if (idx === -1) return { ok: false, error: 'Cuenta no encontrada.' };

    const user = accounts[idx];
    const hasExistingPassword = Boolean(user.passwordHash || user.password);
    if (hasExistingPassword) {
      const check = await CryptoAuth.verifyAccountPassword(currentPassword, user);
      if (!check.valid) {
        return { ok: false, error: 'Contraseña actual incorrecta.' };
      }
    }

    const recoveryCode = CryptoAuth.generateRecoveryCode();
    user.recoveryCodeHash = await CryptoAuth.hashSecret(CryptoAuth.normalizeRecoveryCode(recoveryCode));
    user.updatedAt = new Date().toISOString();
    this.saveAccounts(accounts, true, [user.id]);
    await this.pushMergedStateToCloud();
    return { ok: true, recoveryCode };
  }

  async registerAsync(payload) {
    await this.syncNowWithCloud();
    const accounts = this.getAccounts();
    const name = String(payload?.name || '').trim();
    const cleanUser = String(payload?.username || '').trim().toLowerCase().replace(/^@/, '');
    const cleanEmail = String(payload?.email || '').trim().toLowerCase();
    const cleanPhone = String(payload?.phone || '').trim().replace(/\s+/g, '');
    const password = String(payload?.password || '');

    if (!name || !password || (!cleanUser && !cleanEmail && !cleanPhone)) {
      return { ok: false, error: 'Completa tu nombre, contraseña y al menos un método de acceso.' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'Tu contraseña debe tener al menos 6 caracteres.' };
    }

    const exists = accounts.some(u =>
      (cleanUser && u.username?.toLowerCase() === cleanUser) ||
      (cleanEmail && u.email?.toLowerCase() === cleanEmail) ||
      (cleanPhone && u.phone && u.phone.replace(/\s+/g, '') === cleanPhone)
    );
    if (exists) {
      return { ok: false, error: 'Ese correo, teléfono o @usuario ya está registrado. Usa "Iniciar sesión".' };
    }

    const recoveryCode = CryptoAuth.generateRecoveryCode();
    const [passwordHash, recoveryCodeHash] = await Promise.all([
      CryptoAuth.hashSecret(password),
      CryptoAuth.hashSecret(CryptoAuth.normalizeRecoveryCode(recoveryCode))
    ]);

    const newUser = {
      id: Utils.generateId('usr'),
      name,
      username: cleanUser || `user_${Date.now().toString().slice(-4)}`,
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash,
      recoveryCodeHash,
      avatar: 'assets/ruma_icon_512.png',
      frameId: 'frame-axolotl',
      bannerColor: '#7C3AED',
      bio: '✨ Nuevo en ruma',
      showcaseIds: [],
      isPremium: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    accounts.push(newUser);
    this.saveAccounts(accounts, true, [newUser.id]);
    safeSetScalarStorage(CONFIG.storageKeys.currentUserId, newUser.id);
    this.currentInterface = 'hub';
    this.checkPendingInviteFromUrl();
    this.notify();
    await this.pushMergedStateToCloud();
    return { ok: true, user: newUser, recoveryCode };
  }

  async loginWithGoogleAsync(profile) {
    try {
      const cloud = await CloudSync.pullCloudState(true);
      if (cloud) {
        this.applyRemoteCloudState(cloud, false);
      }
    } catch (_) {}
    const res = this.loginWithGoogle(profile);
    if (res?.ok) {
      this.checkPendingInviteFromUrl();
      await this.pushMergedStateToCloud();
    }
    return res;
  }

  loginWithGoogle({ email, name, picture }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const displayName = String(name || 'Usuario de Google').trim();
    const accounts = this.getAccounts();

    // Coincidencia estricta por correo (sin reutilizar ni sobrescribir cuentas demo)
    let user = accounts.find(u => cleanEmail && u.email && u.email.toLowerCase() === cleanEmail);

    if (user) {
      user.name = displayName || user.name;
      if (cleanEmail) user.email = cleanEmail;
      if (picture) user.avatar = picture;
      if (!user.username) {
        user.username = cleanEmail ? cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase() : `user_${Date.now().toString().slice(-4)}`;
      }
      user.authProvider = 'google';
      user.updatedAt = new Date().toISOString();
      this.saveAccounts(accounts, true, [user.id]);

      // Actualizar nombre y foto del miembro en sus grupos
      const touchedGroupIds = [];
      const groups = this.getGroups().map(g => {
        const hasMember = (g.members || []).some(m => m.id === user.id);
        if (!hasMember) return g;
        touchedGroupIds.push(g.id);
        return {
          ...g,
          updatedAt: new Date().toISOString(),
          members: (g.members || []).map(m => m.id === user.id ? {
            ...m,
            name: user.name,
            username: user.username,
            avatar: user.avatar
          } : m)
        };
      });
      if (touchedGroupIds.length) this.saveGroups(groups, true, touchedGroupIds);
    } else {
      const baseUsername = cleanEmail
        ? cleanEmail.split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase()
        : displayName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
      const uniqueUsername = accounts.some(u => u.username?.toLowerCase() === baseUsername)
        ? `${baseUsername || 'user'}_${Date.now().toString().slice(-4)}`
        : (baseUsername || `user_${Date.now().toString().slice(-4)}`);

      user = {
        id: Utils.generateId('usr'),
        name: displayName,
        username: uniqueUsername,
        email: cleanEmail,
        phone: '',
        avatar: picture || 'assets/ruma_icon_512.png',
        frameId: 'frame-axolotl',
        bannerColor: '#7C3AED',
        bio: '✨ Conectado con Google',
        showcaseIds: [],
        isPremium: false,
        authProvider: 'google',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      accounts.push(user);
      this.saveAccounts(accounts, true, [user.id]);
    }

    safeSetScalarStorage(CONFIG.storageKeys.currentUserId, user.id);
    this.currentInterface = 'hub';
    this.notify();
    return { ok: true, user };
  }

  logout() {
    safeRemoveStorage(CONFIG.storageKeys.currentUserId);
    try { GoogleAuth.clearToken(); } catch (_) {}
    this.currentInterface = 'hub';
    this.notify();
  }

  updateCurrentUser(patch) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(u => u.id === user.id);
    if (idx === -1) return null;

    // Nunca aceptar contraseña en texto plano por este método (usar changePasswordAsync)
    const safePatch = { ...patch };
    delete safePatch.password;

    // Validar unicidad de @usuario, correo y teléfono frente a otras cuentas
    const nextUsername = safePatch.username !== undefined ? String(safePatch.username).trim().toLowerCase().replace(/^@+/, '') : null;
    const nextEmail = safePatch.email !== undefined ? String(safePatch.email).trim().toLowerCase() : null;
    const nextPhone = safePatch.phone !== undefined ? String(safePatch.phone).trim().replace(/\s+/g, '') : null;

    if (nextUsername !== null) {
      if (nextUsername && accounts.some(u => u.id !== user.id && u.username?.toLowerCase() === nextUsername)) {
        return { ok: false, error: 'Ese @usuario ya está en uso por otra cuenta.' };
      }
      safePatch.username = nextUsername;
    }
    if (nextEmail !== null) {
      if (nextEmail && accounts.some(u => u.id !== user.id && u.email?.toLowerCase() === nextEmail)) {
        return { ok: false, error: 'Ese correo electrónico ya está registrado en otra cuenta.' };
      }
      safePatch.email = nextEmail;
    }
    if (nextPhone !== null) {
      if (nextPhone && accounts.some(u => u.id !== user.id && u.phone && u.phone.replace(/\s+/g, '') === nextPhone)) {
        return { ok: false, error: 'Ese número de teléfono ya está registrado en otra cuenta.' };
      }
      safePatch.phone = nextPhone;
    }

    const updated = { ...accounts[idx], ...safePatch, updatedAt: new Date().toISOString() };
    accounts[idx] = updated;
    this.saveAccounts(accounts, true, [updated.id]);

    const touchedGroupIds = [];
    const groups = this.getGroups().map(g => {
      const hasMember = (g.members || []).some(m => m.id === updated.id);
      if (!hasMember) return g;
      touchedGroupIds.push(g.id);
      return {
        ...g,
        updatedAt: new Date().toISOString(),
        members: (g.members || []).map(m => m.id === updated.id ? {
          ...m,
          name: updated.name,
          username: updated.username,
          avatar: updated.avatar,
          frameId: updated.frameId
        } : m)
      };
    });
    if (touchedGroupIds.length) this.saveGroups(groups, true, touchedGroupIds);
    this.notify();
    return updated;
  }

  // --- GRUPOS Y NAVEGACIÓN ENTRE LAS 4 INTERFACES ---
  // Grupos visibles (excluye eliminados y legacy)
  getGroups() {
    return this.getGroupsRaw().filter(g => !g.deleted);
  }

  // Incluye "lápidas" (grupos eliminados) para que la eliminación se propague por la nube
  getGroupsRaw() {
    try {
      const raw = this._readGroupsState();
      const list = raw.filter(g => !this.isLegacyDemoGroup(g));
      // Garantizar hidratación de recuerdos compactados y de series con episodios precargados
      list.forEach(g => {
        hydrateGroupFromStorage(g);
        (g.series || []).forEach(s => {
          const matchKey = String(s.tmdbId || s.id);
          if (!s.seasonEpisodes && PRELOADED_SERIES_EPISODES[matchKey]) {
            s.seasonEpisodes = PRELOADED_SERIES_EPISODES[matchKey];
          }
          if (!Array.isArray(s.seasons) || s.seasons.length === 0) {
            if (s.seasonEpisodes) {
              s.seasons = Object.keys(s.seasonEpisodes).map(num => ({
                seasonNumber: parseInt(num, 10),
                name: `Temporada ${num}`,
                episodeCount: s.seasonEpisodes[num].length
              }));
            } else {
              const count = s.numberOfSeasons || 1;
              s.seasons = Array.from({ length: count }, (_, i) => ({
                seasonNumber: i + 1,
                name: `Temporada ${i + 1}`,
                episodeCount: 10
              }));
            }
          }
        });
      });
      return list;
    } catch (_) {
      return [];
    }
  }

  saveGroups(groups, syncCloud = true, explicitDirtyIds = null) {
    const nowIso = new Date().toISOString();
    const activeId = safeGetStorage(CONFIG.storageKeys.activeGroupId);
    const keep = (Array.isArray(groups) ? groups : []).map(g => compactGroupForStorage(g));
    const dirtySet = new Set(Array.isArray(explicitDirtyIds) ? explicitDirtyIds.filter(Boolean) : []);

    keep.forEach(g => {
      if (!g || !g.id) return;
      const prevSnap = this._syncedGroupSnapshots.get(g.id);
      const currSnap = JSON.stringify(g);
      if (dirtySet.has(g.id) || prevSnap !== currSnap) {
        g.updatedAt = nowIso;
        this.dirtyGroupIds.add(g.id);
      } else if (!g.updatedAt || g.id === activeId) {
        if (!g.updatedAt) g.updatedAt = nowIso;
      }
    });

    this.getGroupsRaw().filter(g => g.deleted && !keep.some(k => k.id === g.id)).forEach(t => keep.push(t));
    this._writeGroupsState(keep);
    if (syncCloud) this.scheduleCloudPush();
  }

  getMyGroups() {
    const user = this.getCurrentUser();
    if (!user) return [];
    return this.getGroups().filter(g => (g.members || []).some(m => m.id === user.id));
  }

  getActiveGroup() {
    const user = this.getCurrentUser();
    const activeId = safeGetStorage(CONFIG.storageKeys.activeGroupId);
    const myGroups = this.getMyGroups();
    const locked = Entitlements.getLockedGroupIds(user, this.getGroups());
    const found = myGroups.find(g => g.id === activeId && !locked.has(g.id));
    return found || myGroups.find(g => !locked.has(g.id)) || myGroups[0] || null;
  }

  setActiveGroup(groupId) {
    const user = this.getCurrentUser();
    const locked = Entitlements.getLockedGroupIds(user, this.getGroups());
    if (locked.has(groupId)) {
      return { ok: false, locked: true };
    }
    safeSetScalarStorage(CONFIG.storageKeys.activeGroupId, groupId);
    this.currentInterface = 'group';
    this.currentGroupTab = 'home';
    this.notify();
    return { ok: true };
  }

  // --- ACTIVIDAD DEL GRUPO ---
  // Registra un evento (canción, película, serie, recuerdo, ingreso) dentro del grupo.
  logActivity(group, user, type, detail = '') {
    if (!group || !user) return;
    group.activity = group.activity || [];
    group.activity.unshift({
      id: Utils.generateId('act'),
      type,
      userId: user.id,
      userName: user.name,
      userAvatar: compactAvatar(user.avatar),
      detail: String(detail || '').slice(0, 80),
      at: new Date().toISOString()
    });
    if (group.activity.length > 100) group.activity.length = 100;
  }

  // --- CHAT: mensajes no leídos por usuario y grupo ---
  _chatSeenKey(groupId) {
    const u = this.getCurrentUser();
    return `ruma_chat_seen_${u?.id || 'x'}_${groupId}`;
  }

  getUnreadChatCount(group) {
    const u = this.getCurrentUser();
    if (!group || !u) return 0;
    const seen = safeGetStorage(this._chatSeenKey(group.id)) || '';
    return (group.messages || []).filter(m => m.senderId !== u.id && (m.timestamp || '') > seen).length;
  }

  markChatSeen(group) {
    if (!group) return;
    const last = (group.messages || []).reduce((mx, m) => (m.timestamp > mx ? m.timestamp : mx), '');
    if (last) safeSetScalarStorage(this._chatSeenKey(group.id), last);
  }

  navigate(interfaceName, options = {}) {
    this.currentInterface = interfaceName;
    if (options.groupTab) this.currentGroupTab = options.groupTab;
    if (options.inspectUserId !== undefined) this.inspectedUserId = options.inspectUserId;
    if (options.memoryFilterIds !== undefined) this.memoryFilterIds = options.memoryFilterIds;
    else if (options.groupTab && options.groupTab !== 'memories') this.memoryFilterIds = null;
    this.notify();
  }

  async createGroupAsync(payload) {
    const res = this.createGroup(payload);
    if (res.ok) {
      await this.pushMergedStateToCloud();
    }
    return res;
  }

  async upgradeGroupToPremiumAsync(groupId) {
    const allGroups = this.getGroups();
    const grp = allGroups.find(g => g.id === groupId);
    if (!grp) return { ok: false, reason: 'No se encontró el grupo.' };
    grp.plan = 'premium';
    grp.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.updateCurrentUser({ isPremium: true });
    await this.pushMergedStateToCloud();
    this.notify();
    return { ok: true, group: grp };
  }

  isUserGoogleDriveSynced(user = null) {
    const u = user || this.getCurrentUser();
    if (!u) return false;
    return Boolean(
      u.googleDriveSynced ||
      u.googleDriveFolderUrl ||
      GoogleAuth.hasDriveAccess()
    );
  }

  createGroup({ name, description, driveFolderUrl, plan = 'free', requireGoogleSync = false }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    if (requireGoogleSync && !this.isUserGoogleDriveSynced(user)) {
      return {
        ok: false,
        needsGoogleSync: true,
        reason: 'Debes sincronizar tu cuenta con Google desde Ajustes antes de crear un grupo.'
      };
    }
    const check = Entitlements.canCreateGroup(user, allGroups, plan);
    if (!check.allowed) {
      return { ok: false, reason: check.reason };
    }

    const existingCodes = new Set(allGroups.map(g => String(g.code || '').toUpperCase()));
    let uniqueCode = Utils.generateGroupCode();
    for (let attempt = 0; attempt < 20 && existingCodes.has(uniqueCode); attempt++) {
      uniqueCode = Utils.generateGroupCode();
    }

    const effectiveDriveFolderUrl = (driveFolderUrl || user?.googleDriveFolderUrl || '').trim();

    const newGroup = {
      id: Utils.generateId('grp'),
      name: (name || 'Mi Grupo ruma').trim(),
      code: uniqueCode,
      description: (description || '').trim(),
      plan: plan === 'premium' ? 'premium' : 'free',
      creatorId: user.id,
      driveFolderUrl: effectiveDriveFolderUrl,
      accentColor: 'purple',
      createdAt: new Date().toISOString(),
      memberIds: { [user.id]: true },
      members: [
        {
          id: user.id,
          name: user.name,
          username: user.username,
          avatar: user.avatar,
          frameId: user.frameId || 'frame-axolotl',
          role: 'admin'
        }
      ],
      memories: [],
      plans: [],
      movies: [],
      series: [],
      songs: [],
      books: [],
      activities: [],
      goals: [],
      notes: [],
      messages: []
    };

    allGroups.unshift(newGroup);
    this.saveGroups(allGroups);

    if (plan === 'premium') {
      this.updateCurrentUser({ isPremium: true });
    }

    this.setActiveGroup(newGroup.id);
    return { ok: true, group: newGroup };
  }

  checkPendingInviteFromUrl() {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      const joinCode = params.get('join') || params.get('code');
      if (joinCode && joinCode.trim()) {
        const cleanCode = joinCode.trim().toUpperCase();
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        url.searchParams.delete('code');
        window.history.replaceState({}, '', url.toString());
        if (this.getCurrentUser()) {
          this.joinGroupByCodeOrQuery(cleanCode);
        }
        return cleanCode;
      }
    } catch (_) {}
    return null;
  }

  async joinGroupByCodeOrQueryAsync(codeOrQuery) {
    const clean = String(codeOrQuery || '').replace(/[\s-]+/g, '').trim().toUpperCase();
    if (clean.length !== 6 || !/^[A-Z0-9]{6}$/.test(clean)) {
      return { ok: false, reason: 'Ingresa un código de invitación exacto de 6 caracteres (ej: K9R4M2).' };
    }

    // 1. Intentar buscar primero si el grupo específico existe en la nube por código exacto
    try {
      const specificGroup = await CloudSync.findGroupByCode(clean);
      if (specificGroup && specificGroup.id) {
        this.applyRemoteCloudState({ groups: [specificGroup] }, false);
      }
    } catch (_) {}

    // 2. Si aún no está en local, intentar descargar el estado global
    if (!this.getGroups().some(g => String(g.code || '').trim().toUpperCase() === clean)) {
      try {
        const cloud = await CloudSync.pullCloudState(true);
        if (cloud) {
          this.applyRemoteCloudState(cloud, false);
        }
      } catch (_) {}
    }

    const res = this.joinGroupByCodeOrQuery(clean);
    if (res.ok) {
      await this.pushMergedStateToCloud();
    }
    return res;
  }

  joinGroupByCodeOrQuery(codeOrQuery) {
    const user = this.getCurrentUser();
    if (!user) return { ok: false, reason: 'Inicia sesión para unirte a un grupo.' };
    const allGroups = this.getGroups();
    const clean = String(codeOrQuery || '').replace(/[\s-]+/g, '').trim().toUpperCase();

    if (clean.length !== 6 || !/^[A-Z0-9]{6}$/.test(clean)) {
      return { ok: false, reason: 'Ingresa un código de invitación exacto de 6 caracteres (ej: K9R4M2).' };
    }

    const target = allGroups.find(g => String(g.code || '').trim().toUpperCase() === clean);

    if (!target) {
      return { ok: false, reason: 'No se encontró ningún grupo con ese código de invitación. Verifica los 6 caracteres.' };
    }

    if ((target.members || []).some(m => m.id === user.id)) {
      this.setActiveGroup(target.id);
      return { ok: true, group: target, alreadyMember: true };
    }

    const check = Entitlements.canJoinGroup(user, allGroups);
    if (!check.allowed) {
      return { ok: false, reason: check.reason, needsUpgrade: true };
    }

    target.members.push({
      id: user.id,
      name: user.name,
      username: user.username,
      avatar: user.avatar,
      frameId: user.frameId || 'frame-none',
      role: 'member',
      joinedAt: new Date().toISOString()
    });
    target.memberIds = { ...(target.memberIds || {}), [user.id]: true };
    target.updatedAt = new Date().toISOString();
    this.logActivity(target, user, 'join');

    safeSetScalarStorage(CONFIG.storageKeys.activeGroupId, target.id);
    this.saveGroups(allGroups);
    this.setActiveGroup(target.id);
    return { ok: true, group: target };
  }

  upgradeGroupToPremium(groupId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return false;
    group.plan = 'premium';
    this.saveGroups(allGroups);
    this.updateCurrentUser({ isPremium: true });
    this.notify();
    return true;
  }

  setUserPremiumPlan(enable) {
    const user = this.getCurrentUser();
    if (!user) return false;
    const isPrem = Boolean(enable);
    const allGroups = this.getGroups().map(g =>
      g.creatorId === user.id ? { ...g, plan: isPrem ? 'premium' : 'free', updatedAt: new Date().toISOString() } : g
    );
    this.saveGroups(allGroups);
    this.updateCurrentUser({ isPremium: isPrem });
    this.notify();
    return true;
  }

  updateGroupSettings(groupId, patch) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return { ok: false, error: 'Grupo no encontrado.' };

    const touchesDrive = patch && (
      Object.prototype.hasOwnProperty.call(patch, 'driveFolderUrl') ||
      Object.prototype.hasOwnProperty.call(patch, 'driveFolderId') ||
      Object.prototype.hasOwnProperty.call(patch, 'driveClientId')
    );

    if (touchesDrive && !Entitlements.isGroupCreator(group, user?.id)) {
      return { ok: false, error: 'Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar o modificar la sincronización con Google Drive.' };
    }

    if (!Entitlements.isGroupAdmin(group, user?.id)) {
      return { ok: false, error: 'Solo los Administradores del grupo pueden modificar los ajustes del grupo.' };
    }

    Object.assign(group, patch);
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, group };
  }

  // Elimina el grupo para todos. Solo el creador puede hacerlo.
  async deleteGroup(groupId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return { ok: false, error: 'Grupo no encontrado.' };
    if (!user || group.creatorId !== user.id) {
      return { ok: false, error: 'Solo el creador del grupo puede eliminarlo.' };
    }

    // Liberar archivos locales de recuerdos y adjuntos del chat en IndexedDB
    const localIdsToClean = [];
    (group.memories || []).forEach(mem => {
      (mem.files || []).forEach(f => { if (f?.id) localIdsToClean.push(f.id); });
    });
    (group.messages || []).forEach(msg => {
      if (msg?.media?.id) {
        localIdsToClean.push(msg.media.id);
        CloudSync.deleteChatMedia(group.id, msg.media.id).catch(() => {});
      }
    });
    if (localIdsToClean.length) {
      MediaStorage.deleteMediaBatch(localIdsToClean).catch(() => {});
    }

    const tomb = { id: group.id, deleted: true, creatorId: group.creatorId, members: [], updatedAt: new Date().toISOString() };
    const rest = this.getGroupsRaw().filter(g => g.id !== groupId);
    rest.push(tomb);
    this.dirtyGroupIds.add(groupId);
    this._writeGroupsState(rest);
    if (safeGetStorage(CONFIG.storageKeys.activeGroupId) === groupId) {
      safeRemoveStorage(CONFIG.storageKeys.activeGroupId);
    }
    this.currentInterface = 'hub';
    this.notify();
    await this.pushMergedStateToCloud();
    return { ok: true };
  }

  // Permite a cualquier miembro salir del grupo; si el creador sale y hay más miembros, transfiere liderazgo.
  async leaveGroup(groupId) {
    const user = this.getCurrentUser();
    if (!user) return { ok: false, error: 'Inicia sesión para realizar esta acción.' };
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return { ok: false, error: 'Grupo no encontrado.' };

    const members = group.members || [];
    if (!members.some(m => m.id === user.id)) {
      return { ok: false, error: 'No perteneces a este grupo.' };
    }

    const remaining = members.filter(m => m.id !== user.id);
    if (remaining.length === 0) {
      return { ok: false, error: 'Eres el único miembro. Si deseas cerrar este espacio, usa "Eliminar grupo".' };
    }

    const now = new Date().toISOString();
    let newLeader = null;
    if (group.creatorId === user.id) {
      newLeader = remaining.find(m => m.role === 'admin') || remaining[0];
      group.creatorId = newLeader.id;
      newLeader.role = 'admin';
    }

    group.members = remaining;
    const nextMemberIds = {};
    remaining.forEach(m => { if (m?.id) nextMemberIds[m.id] = true; });
    group.memberIds = nextMemberIds;
    group.leftMembers = { ...(group.leftMembers || {}), [user.id]: now };
    group.updatedAt = now;

    this.saveGroups(allGroups);
    if (safeGetStorage(CONFIG.storageKeys.activeGroupId) === groupId) {
      safeRemoveStorage(CONFIG.storageKeys.activeGroupId);
    }
    this.currentInterface = 'hub';
    this.notify();
    await this.pushMergedStateToCloud();
    return { ok: true, newLeaderName: newLeader?.name || null };
  }

  toggleMemberRole(groupId, targetMemberId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group || !Entitlements.isGroupAdmin(group, user?.id)) {
      return { ok: false, error: 'Solo un Administrador puede cambiar rangos.' };
    }
    if (targetMemberId === group.creatorId) {
      return { ok: false, error: 'El creador principal del grupo siempre mantiene el rango de Administrador.' };
    }

    const member = (group.members || []).find(m => m.id === targetMemberId);
    if (!member) return { ok: false, error: 'Miembro no encontrado.' };

    member.role = member.role === 'admin' ? 'member' : 'admin';
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, newRole: member.role };
  }

  // ==========================================================================
  // 1. RECUERDOS (Puente Google Drive + Álbum / Nota de Voz / Canción / Calendario / Planes)
  // ==========================================================================
  async addMemoryToActiveGroup({ id, title, date, location, description, auraColor, isFeatured, song, voiceNote, coverFile = null, files = [], existingPhotos, onProgress = null }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };

    const nowLocal = new Date();
    const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
    if (date && String(date) > localToday) {
      return {
        ok: false,
        error: 'Los recuerdos solo se pueden añadir para días pasados o el día de hoy.'
      };
    }

    const linkedFiles = Array.isArray(files) ? files : [];
    const limits = Entitlements.getGroupLimits(group);
    if (linkedFiles.length > limits.maxFilesPerMemoryUpload) {
      return {
        ok: false,
        needsUpgrade: true,
        error: `En el Plan Gratis puedes subir hasta ${limits.maxFilesPerMemoryUpload} archivos enlazados por carga (sin límite de peso).`
      };
    }

    const cleanMemoryTitle = String(title || 'Recuerdo')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim() || 'Recuerdo';

    const resolveExt = (fileObj, fallback = 'jpg') => {
      const rawName = String(fileObj?.name || '');
      const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
      if (extMatch && extMatch[1]) return extMatch[1];
      const mime = String(fileObj?.type || '').toLowerCase();
      if (mime.includes('mp4')) return 'mp4';
      if (mime.includes('quicktime') || mime.includes('mov')) return 'mov';
      if (mime.includes('webm')) return 'webm';
      if (mime.includes('png')) return 'png';
      if (mime.includes('heic')) return 'heic';
      return fallback;
    };

    // 1. La Portada del Recuerdo se nombra exactamente `Portada.<ext>`
    let namedCoverFile = null;
    if (coverFile) {
      const ext = resolveExt(coverFile, 'jpg');
      try {
        namedCoverFile = new File([coverFile], `Portada.${ext}`, {
          type: coverFile.type || 'image/jpeg'
        });
        namedCoverFile.isCoverFile = true;
      } catch (_) {
        namedCoverFile = coverFile;
        namedCoverFile.isCoverFile = true;
      }
    }

    // 2. Los archivos enlazados se enumeran con el nombre del recuerdo en el orden exacto de carga:
    //    "<Nombre del Recuerdo> 1.<ext>", "<Nombre del Recuerdo> 2.<ext>", ...
    const existingMemForOffset = id ? (group.memories || []).find(m => m.id === id) : null;
    const existingLinkedCount = existingMemForOffset
      ? (existingMemForOffset.files || []).filter(f => !f?.isCover).length
      : 0;

    const namedLinkedFiles = linkedFiles.map((fileObj, idx) => {
      const seqNum = existingLinkedCount + idx + 1;
      const isVid = Boolean(fileObj?.type && fileObj.type.startsWith('video/'));
      const ext = resolveExt(fileObj, isVid ? 'mp4' : 'jpg');
      const targetName = `${cleanMemoryTitle} ${seqNum}.${ext}`;
      try {
        return new File([fileObj], targetName, {
          type: fileObj.type || (isVid ? 'video/mp4' : 'image/jpeg')
        });
      } catch (_) {
        return fileObj;
      }
    });

    const combinedFiles = namedCoverFile ? [namedCoverFile, ...namedLinkedFiles] : namedLinkedFiles;

    const isCreator = Entitlements.isGroupCreator(group, user.id);
    if (isCreator && !DriveBridge.isRealFolderConfigured(group.driveFolderUrl) && DriveBridge.isRealFolderConfigured(user.googleDriveFolderUrl)) {
      group.driveFolderUrl = user.googleDriveFolderUrl;
    }

    const record = await DriveBridge.syncMemoryToDrive(group, {
      id,
      title,
      date,
      description,
      voiceNote,
      authorId: user.id,
      authorName: user.name
    }, combinedFiles, onProgress, {
      allowCreateRootFolder: isCreator,
      allowDriveUpload: isCreator,
      hasExplicitCover: Boolean(namedCoverFile),
      userDriveFolderUrl: user.googleDriveFolderUrl || ''
    });

    const newThumbnails = (record.files || []).map(f => f.thumbnail).filter(Boolean);
    const explicitCoverThumb = namedCoverFile
      ? (record.files?.[0]?.thumbnail || record.coverThumbnail || '')
      : '';
    const allPhotos = explicitCoverThumb
      ? [explicitCoverThumb, ...(existingPhotos || []).filter(p => p !== explicitCoverThumb), ...newThumbnails.slice(1)]
      : [...(existingPhotos || []), ...newThumbnails];
    const coverPreview = explicitCoverThumb || allPhotos[0] || record.coverThumbnail || record.coverPreview || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80';
    const hasVideo = (record.files || []).some(f => f.isVideo);

    group.memories = group.memories || [];

    const memoryData = {
      id: id || record.id,
      title: record.title,
      date: record.date,
      location: (location || '').trim(),
      auraColor: auraColor || '#A855F7',
      isFeatured: Boolean(isFeatured),
      subfolderName: record.subfolderName,
      driveSubfolderId: record.driveSubfolderId || '',
      driveUrl: record.driveSubfolderUrl || (DriveBridge.isRealFolderConfigured(group.driveFolderUrl) ? group.driveFolderUrl : ''),
      driveSyncStatus: record.driveSyncStatus || 'local_only',
      driveSyncError: record.driveSyncError || '',
      description: record.description,
      authorId: user.id,
      authorName: user.name,
      authorAvatar: compactAvatar(user.avatar),
      coverPreview,
      photos: allPhotos.length > 0 ? allPhotos : [coverPreview],
      files: record.files || [],
      isVideo: hasVideo,
      filesCount: Math.max(combinedFiles.length, allPhotos.length, 1),
      song: song || null,
      voiceNote: voiceNote || null,
      comments: [],
      createdAt: new Date().toISOString()
    };

    const existingIdx = group.memories.findIndex(m => m.id === id);
    if (existingIdx >= 0) {
      const prev = group.memories[existingIdx];
      memoryData.comments = prev.comments || [];
      memoryData.authorId = prev.authorId || memoryData.authorId;
      memoryData.authorName = prev.authorName || memoryData.authorName;
      memoryData.authorAvatar = compactAvatar(prev.authorAvatar || memoryData.authorAvatar);
      memoryData.createdAt = prev.createdAt || memoryData.createdAt;
      memoryData.updatedAt = new Date().toISOString();
      if (!memoryData.driveSubfolderId && prev.driveSubfolderId) {
        memoryData.driveSubfolderId = prev.driveSubfolderId;
      }
      if (prev.subfolderName && combinedFiles.length === 0) {
        memoryData.subfolderName = prev.subfolderName;
      }
      if (combinedFiles.length === 0) {
        memoryData.files = prev.files || [];
        memoryData.filesCount = Math.max(memoryData.files.length, allPhotos.length, prev.filesCount || 1);
        if (prev.driveSyncStatus === 'synced' && memoryData.driveSyncStatus !== 'synced') {
          memoryData.driveSyncStatus = 'synced';
          memoryData.driveUrl = prev.driveUrl || memoryData.driveUrl;
        }
      } else if (prev.files && prev.files.length > 0) {
        memoryData.files = namedCoverFile
          ? [memoryData.files[0], ...prev.files.filter(f => !f?.isCover), ...memoryData.files.slice(1)]
          : [...prev.files, ...memoryData.files];
        memoryData.filesCount = Math.max(memoryData.files.length, allPhotos.length, 1);
      }
      group.memories[existingIdx] = memoryData;
    } else {
      group.memories.unshift(memoryData);
      this.logActivity(group, user, 'memory', `${memoryData.filesCount} ${memoryData.filesCount === 1 ? 'archivo' : 'archivos'} · ${memoryData.title}`);
    }

    if (isCreator && record.rootDriveFolderUrl) {
      group.driveFolderUrl = record.rootDriveFolderUrl;
      this.updateCurrentUser({
        googleDriveSynced: true,
        googleDriveFolderUrl: record.rootDriveFolderUrl
      });
    }

    this.saveGroups(allGroups);
    this.notify();
    return {
      ok: true,
      memory: memoryData,
      driveSyncStatus: record.driveSyncStatus,
      driveSyncError: record.driveSyncError
    };
  }

  async syncExistingMemoryToDrive(memoryId, onProgress = null) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group) return { ok: false, error: 'Grupo no encontrado.' };

    const mem = (group.memories || []).find(m => m.id === memoryId);
    if (!mem) return { ok: false, error: 'Recuerdo no encontrado.' };

    const isCreator = Entitlements.isGroupCreator(group, user?.id);
    if (!isCreator) {
      return {
        ok: false,
        error: 'Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar y sincronizar con Google Drive.'
      };
    }

    try {
      const synced = await DriveBridge.syncExistingMemoryToDrive(group, mem, onProgress, { allowCreateRootFolder: isCreator });
      if (isCreator && synced.rootDriveFolderUrl) {
        group.driveFolderUrl = synced.rootDriveFolderUrl;
      }
      const { rootDriveFolderUrl: _rootUrl, ...memPatch } = synced;
      Object.assign(mem, memPatch);
      this.saveGroups(allGroups);
      this.notify();
      return { ok: true, memory: mem };
    } catch (err) {
      mem.driveSyncStatus = 'error';
      mem.driveSyncError = err.message || 'Error al sincronizar con Google Drive.';
      this.saveGroups(allGroups);
      this.notify();
      return { ok: false, error: mem.driveSyncError };
    }
  }

  canDeleteMemory(group, memory, user = null) {
    const u = user || this.getCurrentUser();
    if (!group || !memory || !u) return false;
    const isAdmin = Entitlements.isGroupAdmin(group, u.id);
    const isAuthor = Boolean(memory.authorId && memory.authorId === u.id);
    return Boolean(isAdmin || isAuthor);
  }

  deleteMemoryFromActiveGroup(memoryId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };
    const target = (group.memories || []).find(m => m.id === memoryId);
    if (!target) return { ok: false, error: 'Recuerdo no encontrado.' };
    if (!this.canDeleteMemory(group, target, user)) {
      return { ok: false, error: 'Solo quien creó el recuerdo o un administrador del grupo puede eliminarlo.' };
    }
    if (target?.files?.length) {
      const ids = target.files.map(f => f?.id).filter(Boolean);
      if (ids.length) MediaStorage.deleteMediaBatch(ids).catch(() => {});
    }
    group.memories = (group.memories || []).filter(m => m.id !== memoryId);
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { ok: true };
  }

  toggleMemoryFeatured(memoryId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    const mem = (group.memories || []).find(m => m.id === memoryId);
    if (!mem) return;
    mem.isFeatured = !mem.isFeatured;
    this.saveGroups(allGroups);
    this.notify();
    return mem.isFeatured;
  }

  addMemoryComment(memoryId, text) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !text.trim()) return null;

    const mem = (group.memories || []).find(m => m.id === memoryId);
    if (!mem) return null;
    mem.comments = mem.comments || [];
    const comment = {
      id: Utils.generateId('mcom'),
      authorId: user.id,
      authorName: user.name,
      authorAvatar: compactAvatar(user.avatar),
      text: text.trim(),
      createdAt: new Date().toISOString()
    };
    mem.comments.push(comment);
    this.saveGroups(allGroups);
    this.notify();
    return comment;
  }

  addPlanToActiveGroup({ title, date, time, note }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !title) return null;

    const nowLocal = new Date();
    const localToday = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
    if (date && String(date) < localToday) {
      return null;
    }

    group.plans = group.plans || [];
    const newPlan = {
      id: Utils.generateId('pln'),
      title: title.trim(),
      date,
      time: time || '19:00',
      note: (note || '').trim(),
      authorId: user.id,
      authorName: user.name
    };
    group.plans.push(newPlan);
    this.saveGroups(allGroups);
    this.notify();
    return newPlan;
  }

  deletePlanFromActiveGroup(planId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    group.plans = (group.plans || []).filter(p => p.id !== planId);
    this.saveGroups(allGroups);
    this.notify();
  }

  // ==========================================================================
  // 2. PELÍCULAS, SERIES Y MÚSICA (Con Límite de 5 en Gratis y Funciones LUMA)
  // ==========================================================================
  addMediaToActiveGroup(category, itemData) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };

    group[category] = group[category] || [];

    // Evitar duplicados por tmdbId en películas/series y por itunesId o título+artista en canciones
    if ((category === 'movies' || category === 'series') && itemData?.tmdbId) {
      const exists = group[category].some(x => String(x.tmdbId) === String(itemData.tmdbId));
      if (exists) {
        return {
          ok: false,
          duplicate: true,
          error: category === 'movies'
            ? 'Esta película ya está en la cartelera del grupo.'
            : 'Esta serie ya está en la lista del grupo.'
        };
      }
    } else if (category === 'songs' && itemData?.title) {
      const norm = v => String(v || '').trim().toLowerCase();
      const exists = group.songs.some(x =>
        (itemData.itunesId && x.itunesId && String(x.itunesId) === String(itemData.itunesId)) ||
        (norm(x.title) === norm(itemData.title) && norm(x.artist) === norm(itemData.artist))
      );
      if (exists) {
        return { ok: false, duplicate: true, error: 'Esta canción ya está en la playlist del grupo.' };
      }
    }

    const check = Entitlements.canAddMediaItem(group, category);
    if (!check.allowed) {
      return { ok: false, needsUpgrade: true, error: check.reason };
    }

    const validMovieStatuses = ['Por ver', 'Vista', 'Favorita'];
    const initialMovieStatus = validMovieStatuses.includes(itemData?.status) ? itemData.status : 'Por ver';
    const movieUserStatuses = category === 'movies'
      ? { ...(itemData.userStatuses || {}), [user.id]: initialMovieStatus }
      : itemData.userStatuses;

    const newItem = {
      ...itemData,
      id: Utils.generateId(category.slice(0, 3)),
      ...(category === 'movies' ? { userStatuses: movieUserStatuses } : {}),
      addedBy: user.name,
      proposedBy: itemData.proposedBy || {
        id: user.id,
        name: user.name,
        avatar: compactAvatar(user.avatar),
        date: Utils.formatShortDate(new Date().toISOString())
      },
      comments: itemData.comments || [],
      createdAt: new Date().toISOString()
    };

    group[category].unshift(newItem);
    const actType = { movies: 'movie', series: 'series', songs: 'song', books: 'book' }[category];
    if (actType) {
      const label = newItem.title || newItem.name || '';
      const extra = (category === 'songs' && newItem.artist) || (category === 'books' && newItem.author)
        ? ` — ${newItem.artist || newItem.author}` : '';
      this.logActivity(group, user, actType, `${label}${extra}`);
    }
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { ok: true, item: newItem };
  }

  updateMediaItem(category, itemId, patch, { silent = false } = {}) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item) return null;
    Object.assign(item, patch);
    this.saveGroups(allGroups, true, [group.id]);
    if (!silent) this.notify();
    return item;
  }

  // Obtiene el estado de una película EXCLUSIVO para un usuario ('Por ver' | 'Vista' | 'Favorita')
  getUserMovieStatus(movie, userId = null) {
    if (!movie) return 'Por ver';
    const uid = userId || this.getCurrentUser()?.id;
    if (uid && movie.userStatuses && movie.userStatuses[uid]) {
      return movie.userStatuses[uid];
    }
    return 'Por ver';
  }

  // Fija el estado individual de la película para el usuario actual
  setUserMovieStatus(movieId, nextStatus) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'movies', movieId)) return null;
    const movie = (group.movies || []).find(m => m.id === movieId);
    if (!movie) return null;

    const valid = ['Por ver', 'Vista', 'Favorita'];
    const st = valid.includes(nextStatus) ? nextStatus : 'Por ver';
    movie.userStatuses = movie.userStatuses || {};
    movie.userStatuses[user.id] = st;
    this.saveGroups(allGroups);
    this.notify();
    return st;
  }

  cycleMovieStatus(movieId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    const movie = (group.movies || []).find(m => m.id === movieId);
    if (!movie) return null;

    const order = ['Por ver', 'Vista', 'Favorita'];
    const current = this.getUserMovieStatus(movie, user.id);
    const currentIdx = order.indexOf(current);
    const next = order[(currentIdx + 1) % order.length];
    return this.setUserMovieStatus(movieId, next);
  }

  getUserBookProgress(book, userId) {
    const uid = userId || this.getCurrentUser()?.id;
    const up = book?.userProgress?.[uid];
    const total = Number(book?.pages || 0);
    if (up) {
      const status = up.status || 'Por leer';
      const currentPage = Number(up.currentPage || 0);
      const format = ['physical', 'ebook', 'audiobook'].includes(up.format) ? up.format : 'physical';
      let percent = up.percent !== undefined ? Number(up.percent) : (
        status === 'Leído' ? 100 : (total > 0 ? Math.min(100, Math.round((currentPage / total) * 100)) : 0)
      );
      if (status === 'Leído') percent = 100;
      percent = Math.min(100, Math.max(0, Math.round(percent || 0)));
      return {
        status,
        currentPage,
        percent,
        format,
        finishedAt: up.finishedAt || '',
        updatedAt: up.updatedAt || '',
        sessions: Array.isArray(up.sessions) ? up.sessions : []
      };
    }
    const fallbackStatus = book?.status || 'Por leer';
    return {
      status: fallbackStatus,
      currentPage: 0,
      percent: fallbackStatus === 'Leído' ? 100 : 0,
      format: 'physical',
      finishedAt: '',
      updatedAt: '',
      sessions: []
    };
  }

  setUserBookProgress(bookId, { status, currentPage, totalPages, percent, format, finishedAt } = {}) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'books', bookId)) return null;
    const book = (group.books || []).find(b => b.id === bookId);
    if (!book) return null;

    if (totalPages !== undefined && Number(totalPages) > 0) {
      book.pages = Math.round(Number(totalPages));
    }

    book.userProgress = book.userProgress || {};
    const prev = this.getUserBookProgress(book, user.id);
    const total = Number(book.pages || 0);

    const validFormats = ['physical', 'ebook', 'audiobook'];
    const nextFormat = (format && validFormats.includes(format)) ? format : prev.format;

    let nextPage = prev.currentPage;
    let nextPercent = prev.percent;

    if (percent !== undefined) {
      nextPercent = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
      if (total > 0) nextPage = Math.round((nextPercent / 100) * total);
    } else if (currentPage !== undefined) {
      nextPage = Math.max(0, Math.round(Number(currentPage) || 0));
      if (total > 0) {
        nextPage = Math.min(total, nextPage);
        nextPercent = Math.min(100, Math.round((nextPage / total) * 100));
      }
    } else if (total > 0 && nextPage > 0) {
      nextPage = Math.min(total, nextPage);
      nextPercent = Math.min(100, Math.round((nextPage / total) * 100));
    }

    const validStatuses = ['Por leer', 'Leyendo', 'Leído', 'Abandonado'];
    let nextStatus = (status && validStatuses.includes(status)) ? status : prev.status;

    if (status === 'Leído') {
      if (total > 0) nextPage = total;
      nextPercent = 100;
    } else if (status === 'Por leer' && currentPage === undefined && percent === undefined) {
      nextPage = 0;
      nextPercent = 0;
    } else if ((currentPage !== undefined || percent !== undefined) && status === undefined) {
      if ((total > 0 && nextPage >= total) || nextPercent >= 100) {
        nextStatus = 'Leído';
        nextPercent = 100;
      } else if (nextPage > 0 || nextPercent > 0) {
        nextStatus = 'Leyendo';
      } else {
        nextStatus = 'Por leer';
      }
    }

    let nextFinishedAt = prev.finishedAt || '';
    if (nextStatus === 'Leído') {
      if (finishedAt !== undefined) nextFinishedAt = String(finishedAt || '').trim();
      else if (!nextFinishedAt) nextFinishedAt = new Date().toISOString().slice(0, 10);
    } else if (status && status !== 'Leído') {
      nextFinishedAt = '';
    }

    book.userProgress[user.id] = {
      status: nextStatus,
      currentPage: nextPage,
      percent: nextPercent,
      format: nextFormat,
      finishedAt: nextFinishedAt,
      sessions: prev.sessions || [],
      userName: user.name,
      userAvatar: user.avatar || '',
      updatedAt: new Date().toISOString()
    };

    if (prev.status !== 'Leído' && nextStatus === 'Leído') {
      this.logActivity(group, user, 'book', `Terminó de leer "${book.title}"`);
    }

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return book.userProgress[user.id];
  }

  logBookReadingSession(bookId, { minutes = 0, endPage, endPercent, format } = {}) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'books', bookId)) return null;
    const book = (group.books || []).find(b => b.id === bookId);
    if (!book) return null;

    book.userProgress = book.userProgress || {};
    const prev = this.getUserBookProgress(book, user.id);
    const total = Number(book.pages || 0);
    const cleanMin = Math.max(1, Math.round(Number(minutes) || 1));

    const nextFormat = ['physical', 'ebook', 'audiobook'].includes(format) ? format : prev.format;
    let nextPage = prev.currentPage;
    let nextPercent = prev.percent;

    if (endPercent !== undefined && nextFormat === 'audiobook') {
      nextPercent = Math.min(100, Math.max(0, Math.round(Number(endPercent) || 0)));
      if (total > 0) nextPage = Math.round((nextPercent / 100) * total);
    } else if (endPage !== undefined) {
      nextPage = Math.max(0, Math.round(Number(endPage) || 0));
      if (total > 0) {
        nextPage = Math.min(total, nextPage);
        nextPercent = Math.min(100, Math.round((nextPage / total) * 100));
      }
    } else if (endPercent !== undefined) {
      nextPercent = Math.min(100, Math.max(0, Math.round(Number(endPercent) || 0)));
      if (total > 0) nextPage = Math.round((nextPercent / 100) * total);
    }

    const pagesRead = Math.max(0, nextPage - prev.currentPage);
    const isCompleted = (total > 0 && nextPage >= total) || nextPercent >= 100;
    const nextStatus = isCompleted ? 'Leído' : 'Leyendo';

    const session = {
      id: Utils.generateId('rs'),
      date: new Date().toISOString().slice(0, 10),
      at: new Date().toISOString(),
      minutes: cleanMin,
      pagesRead,
      startPage: prev.currentPage,
      endPage: nextPage,
      format: nextFormat
    };

    const sessions = [...(prev.sessions || []), session].slice(-60);
    book.userProgress[user.id] = {
      status: nextStatus,
      currentPage: isCompleted && total > 0 ? total : nextPage,
      percent: isCompleted ? 100 : nextPercent,
      format: nextFormat,
      finishedAt: isCompleted ? (prev.finishedAt || new Date().toISOString().slice(0, 10)) : '',
      sessions,
      userName: user.name,
      userAvatar: user.avatar || '',
      updatedAt: new Date().toISOString()
    };

    if (prev.status !== 'Leído' && isCompleted) {
      this.logActivity(group, user, 'book', `Terminó de leer "${book.title}"`);
    }

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { completed: isCompleted, session, progress: book.userProgress[user.id] };
  }

  getUserReadingStats(group, userId) {
    const uid = userId || this.getCurrentUser()?.id;
    const books = group?.books || [];
    let totalMinutes = 0;
    let totalSessions = 0;
    let timedPages = 0;
    let timedMinutesWithPages = 0;
    const daySet = new Set();

    books.forEach(b => {
      const up = b?.userProgress?.[uid];
      if (!up) return;
      (up.sessions || []).forEach(s => {
        const m = Number(s.minutes || 0);
        const p = Number(s.pagesRead || 0);
        if (m > 0) {
          totalMinutes += m;
          totalSessions += 1;
        }
        if (m > 0 && p > 0) {
          timedPages += p;
          timedMinutesWithPages += m;
        }
        if (s.date) daySet.add(s.date);
      });
    });

    // Racha de días consecutivos leyendo (hasta hoy o ayer)
    let streakDays = 0;
    if (daySet.size > 0) {
      const cursor = new Date();
      cursor.setHours(12, 0, 0, 0);
      const fmt = d => d.toISOString().slice(0, 10);
      if (!daySet.has(fmt(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
      }
      while (daySet.has(fmt(cursor))) {
        streakDays += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    const avgPagesPerHour = timedMinutesWithPages >= 5 && timedPages > 0
      ? Math.max(10, Math.min(160, Math.round((timedPages / timedMinutesWithPages) * 60)))
      : 35;

    return { totalMinutes, totalSessions, avgPagesPerHour, hasMeasuredPace: timedMinutesWithPages >= 5 && timedPages > 0, streakDays };
  }

  addBookQuote(bookId, { text, page = '', note = '' } = {}) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !String(text || '').trim()) return null;
    if (Entitlements.isMediaItemLocked(group, 'books', bookId)) return null;
    const book = (group.books || []).find(b => b.id === bookId);
    if (!book) return null;

    book.quotes = Array.isArray(book.quotes) ? book.quotes : [];
    const quote = {
      id: Utils.generateId('qt'),
      text: String(text).trim().slice(0, 600),
      page: String(page || '').trim().slice(0, 20),
      note: String(note || '').trim().slice(0, 240),
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatar || '',
      createdAt: new Date().toISOString()
    };
    book.quotes.unshift(quote);
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return quote;
  }

  deleteBookQuote(bookId, quoteId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return false;
    const book = (group.books || []).find(b => b.id === bookId);
    if (!book || !Array.isArray(book.quotes)) return false;
    const target = book.quotes.find(q => q.id === quoteId);
    if (!target) return false;
    const canDel = target.authorId === user.id || Entitlements.isGroupAdmin(group, user.id);
    if (!canDel) return false;

    book.quotes = book.quotes.filter(q => q.id !== quoteId);
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return true;
  }

  setGroupClubBook(bookId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;

    if (!bookId || group.clubBookId === bookId) {
      group.clubBookId = null;
      this.saveGroups(allGroups, true, [group.id]);
      this.notify();
      return null;
    }

    const book = (group.books || []).find(b => b.id === bookId);
    if (!book) return null;
    if (Entitlements.isMediaItemLocked(group, 'books', bookId)) return null;
    group.clubBookId = book.id;
    this.logActivity(group, user, 'book', `Fijó "${book.title}" como lectura del club`);
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return group.clubBookId;
  }

  cycleBookStatus(bookId) {
    const user = this.getCurrentUser();
    const group = this.getActiveGroup();
    const book = (group?.books || []).find(b => b.id === bookId);
    if (!book || !user) return null;
    const order = ['Por leer', 'Leyendo', 'Leído', 'Abandonado'];
    const cur = this.getUserBookProgress(book, user.id).status;
    const idx = order.indexOf(cur);
    const next = order[(idx === -1 ? 0 : idx + 1) % order.length];
    return this.setUserBookProgress(bookId, { status: next });
  }

  rateMovieOrSeries(category, itemId, score, review = '', tags = []) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };
    if (Entitlements.isMediaItemLocked(group, category, itemId)) {
      return { ok: false, needsUpgrade: true, error: 'Este elemento está bloqueado en el Plan Free.' };
    }

    const list = group[category] || [];
    const item = list.find(x => x.id === itemId);
    if (!item) return { ok: false, error: 'Elemento no encontrado.' };

    // Películas, series y libros se pueden reseñar en cualquier momento.
    // En series y libros guardamos el progreso del usuario al reseñar.
    let progressLabel = '';
    let completedWhenRated = false;
    if (category === 'series') {
      completedWhenRated = this.isSeriesCompletedByUser(item, user.id);
      const up = item.userProgress?.[user.id];
      if (completedWhenRated) progressLabel = '🏆 Serie completada';
      else if (up?.lastWatched) progressLabel = `Iba en T${up.lastWatched.season} · Cap ${up.lastWatched.episode}`;
      else progressLabel = 'Sin empezar';
    } else if (category === 'books') {
      const bp = this.getUserBookProgress(item, user.id);
      const total = Number(item.pages || 0);
      completedWhenRated = bp.status === 'Leído';
      if (bp.status === 'Leído') progressLabel = 'Leído';
      else if (bp.status === 'Leyendo') {
        const pct = total > 0 ? Math.min(100, Math.round((bp.currentPage / total) * 100)) : 0;
        progressLabel = total > 0 ? `Leyendo · ${pct}%` : 'Leyendo';
      } else if (bp.status === 'Abandonado') progressLabel = 'Abandonado';
    }

    const numeric = Math.round(Math.min(10, Math.max(0.5, Number(score) || 8)) * 10) / 10;
    item.ratings = item.ratings || {};
    item.ratings[user.id] = {
      score: numeric,
      review: String(review || '').trim(),
      tags: Array.isArray(tags) ? tags.slice(0, 6) : [],
      userName: user.name,
      userAvatar: compactAvatar(user.avatar),
      progressLabel,
      completedWhenRated,
      updatedAt: new Date().toISOString()
    };

    // Reseñar una película "Por ver" la marca automáticamente como vista para este usuario.
    if (category === 'movies') {
      item.userStatuses = item.userStatuses || {};
      const mySt = item.userStatuses[user.id] || 'Por ver';
      if (mySt === 'Por ver') {
        item.userStatuses[user.id] = 'Vista';
        item.status = 'Vista';
      }
    }

    this.saveGroups(allGroups);
    this.notify();
    return { ok: true, rating: item.ratings[user.id] };
  }

  deleteMyRating(category, itemId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return false;
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item || !item.ratings || !item.ratings[user.id]) return false;
    delete item.ratings[user.id];
    this.saveGroups(allGroups);
    this.notify();
    return true;
  }

  /**
   * Aplica varios parches (datos reales de TMDb) en una sola escritura/notify.
   * patches: [{ category, itemId, patch }]
   */
  applyMediaPatches(groupId, patches = [], silent = false) {
    if (!patches.length) return;
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    let changed = false;
    patches.forEach(({ category, itemId, patch }) => {
      const item = (group[category] || []).find(x => x.id === itemId);
      if (item && patch) {
        Object.assign(item, patch);
        changed = true;
      }
    });
    if (changed) {
      this.saveGroups(allGroups);
      if (!silent) this.notify();
    }
  }

  addMediaComment(category, itemId, text, meta = null) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user || !text.trim()) return null;
    if (Entitlements.isMediaItemLocked(group, category, itemId)) return null;

    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item) return null;

    let userProgressLabel = '';
    if (category === 'series') {
      const up = item.userProgress?.[user.id];
      if (up && up.lastWatched) {
        userProgressLabel = `T${up.lastWatched.season} · Cap ${up.lastWatched.episode}`;
      } else if (up && up.currentSeason) {
        userProgressLabel = `T${up.currentSeason} · Cap ${up.currentEpisode || 1}`;
      } else {
        userProgressLabel = 'T1 · Cap 1';
      }
    } else if (category === 'books') {
      const bp = this.getUserBookProgress(item, user.id);
      if (bp.status === 'Leído') userProgressLabel = 'Leído';
      else if (bp.status === 'Leyendo' && bp.format === 'audiobook' && bp.percent > 0) {
        userProgressLabel = `🎧 ${bp.percent}%`;
      } else if (bp.status === 'Leyendo' && item.pages) {
        userProgressLabel = `Pág. ${bp.currentPage}/${item.pages}`;
      } else if (bp.status === 'Leyendo' && bp.percent > 0) {
        userProgressLabel = `${bp.percent}%`;
      } else if (bp.status === 'Leyendo') {
        userProgressLabel = 'Leyendo';
      }
    }

    item.comments = item.comments || [];
    const newComment = {
      id: Utils.generateId('com'),
      authorId: user.id,
      userId: user.id,
      authorName: user.name,
      userName: user.name,
      authorAvatar: user.avatar,
      userAvatar: user.avatar,
      userProgressLabel,
      text: text.trim(),
      time: 'Hace un momento',
      date: 'Hace un momento',
      createdAt: new Date().toISOString(),
      reactions: { '❤️': 0, '🔥': 0, '😂': 0 },
      ...(meta && typeof meta === 'object' ? meta : {})
    };

    item.comments.push(newComment);
    this.saveGroups(allGroups);
    this.notify();
    return newComment;
  }

  reactMediaComment(category, itemId, commentId, emoji) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item || !Array.isArray(item.comments)) return null;
    const comment = item.comments.find(c => c.id === commentId);
    if (!comment) return null;
    comment.reactions = comment.reactions || {};
    comment.reactions[emoji] = (comment.reactions[emoji] || 0) + 1;
    this.saveGroups(allGroups);
    this.notify();
    return comment;
  }

  rateSong(songId, starScore) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'songs', songId)) return null;
    const song = (group.songs || []).find(s => s.id === songId);
    if (!song) return null;

    const val = Math.min(5, Math.max(1, Number(starScore) || 5));
    song.ratings = (song.ratings && typeof song.ratings === 'object') ? song.ratings : {};
    // Conservar el voto inicial del creador en canciones guardadas antes de inicializar `ratings`
    if (Object.keys(song.ratings).length === 0 && song.rating) {
      const creatorId = song.proposedBy?.id || song.authorId || '';
      if (creatorId && creatorId !== user.id) {
        song.ratings[creatorId] = Math.min(5, Math.max(1, Number(song.rating) || 5));
      }
    }
    song.ratings[user.id] = val;
    const vals = Object.values(song.ratings).map(Number).filter(n => Number.isFinite(n) && n > 0);
    song.ratingCount = vals.length;
    song.rating = Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return song;
  }

  // --- SERIES: SEGUIMIENTO CAPÍTULO A CAPÍTULO Y TEMPORADAS (Estilo LUMA) ---
  isSeriesCompletedByUser(series, userId) {
    if (!series) return false;
    const uid = userId || this.getCurrentUser()?.id;
    const up = series.userProgress?.[uid];
    const seasons = series.seasons || [];
    const totalEpisodes = seasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0);

    if (totalEpisodes > 0) {
      const watchedCount = Object.keys(up?.watchedEpisodes || {}).filter(k => !k.startsWith('0_')).length;
      return watchedCount >= totalEpisodes;
    }
    return Boolean(up && up.status === 'Completada');
  }

  _recomputeSeriesLastWatched(watchedMap) {
    let best = null;
    for (const k of Object.keys(watchedMap || {})) {
      if (!watchedMap[k] || k.startsWith('0_')) continue;
      const [s, e] = k.split('_').map(Number);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      if (!best || s > best.season || (s === best.season && e > best.episode)) {
        best = { season: s, episode: e };
      }
    }
    return best;
  }

  toggleEpisodeWatched(seriesId, seasonNum, episodeNum, { onlyMark = false } = {}) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'series', seriesId)) return null;

    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return null;

    const wasCompletedBefore = this.isSeriesCompletedByUser(series, user.id);

    series.userProgress = series.userProgress || {};
    if (!series.userProgress[user.id]) {
      series.userProgress[user.id] = {
        userId: user.id,
        userName: user.name,
        userAvatar: compactAvatar(user.avatar),
        currentSeason: seasonNum,
        currentEpisode: episodeNum,
        watchedEpisodes: {},
        lastWatched: { season: seasonNum, episode: episodeNum },
        status: 'Viendo',
        updatedAt: new Date().toISOString()
      };
    }

    const up = series.userProgress[user.id];
    up.userName = user.name;
    up.userAvatar = compactAvatar(user.avatar);
    up.watchedEpisodes = up.watchedEpisodes || {};
    const key = `${seasonNum}_${episodeNum}`;
    const wasWatched = Boolean(up.watchedEpisodes[key]);

    // Si es un botón de avance rápido (onlyMark), nunca desmarcar por doble toque accidental
    if (onlyMark && wasWatched) {
      return {
        series,
        isWatched: true,
        alreadyWatched: true,
        isFullyCompleted: this.isSeriesCompletedByUser(series, user.id),
        progress: up
      };
    }

    if (wasWatched) {
      delete up.watchedEpisodes[key];
      const latest = this._recomputeSeriesLastWatched(up.watchedEpisodes);
      up.lastWatched = latest;
      up.currentSeason = latest?.season || 1;
      up.currentEpisode = latest?.episode || 1;
    } else {
      up.watchedEpisodes[key] = true;
      if (seasonNum > 0) {
        up.lastWatched = { season: seasonNum, episode: episodeNum };
        up.currentSeason = seasonNum;
        up.currentEpisode = episodeNum;
      }
    }

    const regularWatched = Object.keys(up.watchedEpisodes).filter(k => !k.startsWith('0_') && up.watchedEpisodes[k]).length;
    const isCompleted = this.isSeriesCompletedByUser(series, user.id);
    up.status = isCompleted ? 'Completada' : (regularWatched > 0 ? 'Viendo' : 'Por ver');
    up.updatedAt = new Date().toISOString();

    if (!wasCompletedBefore && isCompleted) {
      this.logActivity(group, user, 'series', `Completó la serie "${series.title}"`);
    }

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { series, isWatched: !wasWatched, isFullyCompleted: isCompleted, progress: up };
  }

  markEpisodeWatched(seriesId, seasonNum, episodeNum) {
    return this.toggleEpisodeWatched(seriesId, seasonNum, episodeNum, { onlyMark: true });
  }

  markEpisodesUpTo(seriesId, targetSeason, targetEpisode) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'series', seriesId)) return null;

    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return null;

    const wasCompletedBefore = this.isSeriesCompletedByUser(series, user.id);

    series.userProgress = series.userProgress || {};
    if (!series.userProgress[user.id]) {
      series.userProgress[user.id] = {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        watchedEpisodes: {},
        status: 'Viendo'
      };
    }

    const up = series.userProgress[user.id];
    up.userName = user.name;
    up.userAvatar = user.avatar;
    up.watchedEpisodes = up.watchedEpisodes || {};
    const seasons = series.seasons || [{ seasonNumber: targetSeason, episodeCount: targetEpisode }];

    for (const s of seasons) {
      const sNum = s.seasonNumber;
      const count = s.episodeCount || 10;
      if (sNum < targetSeason) {
        for (let ep = 1; ep <= count; ep++) {
          up.watchedEpisodes[`${sNum}_${ep}`] = true;
        }
      } else if (sNum === targetSeason) {
        for (let ep = 1; ep <= targetEpisode; ep++) {
          up.watchedEpisodes[`${sNum}_${ep}`] = true;
        }
      }
    }

    up.lastWatched = { season: targetSeason, episode: targetEpisode };
    up.currentSeason = targetSeason;
    up.currentEpisode = targetEpisode;
    up.updatedAt = new Date().toISOString();

    const lastSeason = seasons[seasons.length - 1];
    const isFullyCompleted = (targetSeason === lastSeason.seasonNumber && targetEpisode >= (lastSeason.episodeCount || 1))
      || this.isSeriesCompletedByUser(series, user.id);

    up.status = isFullyCompleted ? 'Completada' : 'Viendo';

    if (!wasCompletedBefore && isFullyCompleted) {
      this.logActivity(group, user, 'series', `Completó la serie "${series.title}"`);
    }

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { series, isFullyCompleted, progress: up };
  }

  toggleSeasonWatched(seriesId, seasonNum, markWatched = true, episodeCountOverride = 0) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !user) return null;
    if (Entitlements.isMediaItemLocked(group, 'series', seriesId)) return null;

    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return null;

    const wasCompletedBefore = this.isSeriesCompletedByUser(series, user.id);

    series.userProgress = series.userProgress || {};
    if (!series.userProgress[user.id]) {
      series.userProgress[user.id] = {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        watchedEpisodes: {},
        status: 'Por ver'
      };
    }

    const up = series.userProgress[user.id];
    up.userName = user.name;
    up.userAvatar = user.avatar;
    up.watchedEpisodes = up.watchedEpisodes || {};

    const seasonObj = [...(series.seasons || []), ...(series.specials || [])].find(s => s.seasonNumber === seasonNum);
    const count = Math.max(Number(episodeCountOverride || 0), Number(seasonObj?.episodeCount || 0));

    if (markWatched) {
      for (let ep = 1; ep <= count; ep++) {
        up.watchedEpisodes[`${seasonNum}_${ep}`] = true;
      }
    } else {
      for (const k of Object.keys(up.watchedEpisodes)) {
        if (k.startsWith(`${seasonNum}_`)) delete up.watchedEpisodes[k];
      }
    }

    const latest = this._recomputeSeriesLastWatched(up.watchedEpisodes);
    up.lastWatched = latest;
    up.currentSeason = latest?.season || 1;
    up.currentEpisode = latest?.episode || 1;

    const regularWatched = Object.keys(up.watchedEpisodes).filter(k => !k.startsWith('0_') && up.watchedEpisodes[k]).length;
    const isFullyCompleted = this.isSeriesCompletedByUser(series, user.id);
    up.status = isFullyCompleted ? 'Completada' : (regularWatched > 0 ? 'Viendo' : 'Por ver');
    up.updatedAt = new Date().toISOString();

    if (!wasCompletedBefore && isFullyCompleted) {
      this.logActivity(group, user, 'series', `Completó la serie "${series.title}"`);
    }

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { series, isWatched: markWatched, isFullyCompleted, progress: up };
  }

  cacheSeriesSeasonEpisodes(seriesId, seasonNumber, episodes) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    const series = (group.series || []).find(s => s.id === seriesId);
    if (!series) return;
    series.seasonEpisodes = series.seasonEpisodes || {};
    series.seasonEpisodes[seasonNumber] = episodes;
    this.saveGroups(allGroups);
  }

  canDeleteMediaItem(group, item, user = null) {
    const u = user || this.getCurrentUser();
    if (!group || !item || !u) return false;
    const isLeader = group.creatorId === u.id || Entitlements.isGroupAdmin(group, u.id);
    const isProposer = (item.proposedBy && item.proposedBy.id === u.id)
      || (item.authorId && item.authorId === u.id)
      || (item.addedBy && item.addedBy === u.name);
    return Boolean(isLeader || isProposer);
  }

  deleteMediaItem(category, itemId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no disponible.' };
    const item = (group[category] || []).find(x => x.id === itemId);
    if (!item) return { ok: false, error: 'Elemento no encontrado.' };
    if (!this.canDeleteMediaItem(group, item, user)) {
      return { ok: false, error: 'Solo quien la añadió o el líder del grupo pueden eliminarla.' };
    }
    group[category] = (group[category] || []).filter(x => x.id !== itemId);
    this.saveGroups(allGroups);
    this.notify();
    return { ok: true };
  }

  // --- PERFIL ESTILO DISCORD: RECOPILACIÓN DE PELÍCULAS Y SERIES CALIFICADAS ---
  getUserRatedMediaAcrossGroups(userId) {
    const targetId = userId || this.getCurrentUser()?.id;
    if (!targetId) return [];

    const allGroups = this.getGroups();
    const ratedItems = [];
    const seenIds = new Set();

    for (const grp of allGroups) {
      for (const mov of (grp.movies || [])) {
        const userRating = mov.ratings && mov.ratings[targetId];
        if (userRating && !seenIds.has(mov.id)) {
          seenIds.add(mov.id);
          ratedItems.push({
            id: mov.id,
            type: 'Película',
            title: mov.title,
            year: mov.year || '',
            poster: mov.poster || 'assets/ruma_icon_512.png',
            score: userRating.score,
            groupName: grp.name
          });
        }
      }
      for (const ser of (grp.series || [])) {
        const userRating = ser.ratings && ser.ratings[targetId];
        if (userRating && !seenIds.has(ser.id)) {
          seenIds.add(ser.id);
          ratedItems.push({
            id: ser.id,
            type: 'Serie',
            title: ser.title,
            year: ser.year || '',
            poster: ser.poster || 'assets/ruma_icon_512.png',
            score: userRating.score,
            groupName: grp.name
          });
        }
      }
      for (const bk of (grp.books || [])) {
        const userRating = bk.ratings && bk.ratings[targetId];
        if (userRating && !seenIds.has(bk.id)) {
          seenIds.add(bk.id);
          ratedItems.push({
            id: bk.id,
            type: 'Libro',
            title: bk.title,
            year: bk.year || '',
            poster: bk.poster || 'assets/ruma_icon_512.png',
            score: userRating.score,
            groupName: grp.name
          });
        }
      }
    }

    return ratedItems;
  }

  toggleShowcaseMediaItem(itemId) {
    const user = this.getCurrentUser();
    if (!user) return;
    const current = Array.isArray(user.showcaseIds) ? [...user.showcaseIds] : [];
    const idx = current.indexOf(itemId);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(itemId);
    }
    this.updateCurrentUser({ showcaseIds: current });
  }

  // --- ACTIVIDADES GRUPALES, RESPONSABILIDADES, METAS Y NOTAS ---
  getActivityProgress(activity) {
    const tasks = Array.isArray(activity?.tasks) ? activity.tasks : [];
    const total = tasks.length;
    const done = tasks.filter(t => Boolean(t.completed)).length;
    const pending = Math.max(0, total - done);
    const pct = total > 0
      ? Math.round((done / total) * 100)
      : (activity?.status === 'Completada' ? 100 : 0);
    return { total, done, pending, pct };
  }

  addActivityToActiveGroup({ title, icon, description, date, time, location, status, participantIds }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    const cleanTitle = String(title || '').trim();
    if (!group || !user || !cleanTitle) return null;

    const validStatuses = ['Planeando', 'Confirmada', 'En curso', 'Completada'];
    const safeStatus = validStatuses.includes(status) ? status : 'Planeando';
    const memberIds = (group.members || []).map(m => m.id);
    const participants = Array.isArray(participantIds) && participantIds.length > 0
      ? Array.from(new Set(participantIds.filter(id => memberIds.includes(id))))
      : memberIds;

    const nowIso = new Date().toISOString();
    const newActivity = {
      id: Utils.generateId('actv'),
      icon: String(icon || '🎉').trim() || '🎉',
      title: cleanTitle,
      description: String(description || '').trim(),
      date: String(date || '').trim(),
      time: String(time || '').trim(),
      location: String(location || '').trim(),
      status: safeStatus,
      participantIds: participants.length > 0 ? participants : [user.id],
      tasks: [],
      createdBy: user.id,
      createdByName: user.name,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    group.activities = group.activities || [];
    group.activities.unshift(newActivity);
    this.logActivity(group, user, 'activity', `${newActivity.icon} ${newActivity.title}`);
    this.saveGroups(allGroups);
    this.notify();
    return newActivity;
  }

  updateActivityInActiveGroup(activityId, patch = {}) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const act = (group.activities || []).find(a => a.id === activityId);
    if (!act) return null;

    const validStatuses = ['Planeando', 'Confirmada', 'En curso', 'Completada'];
    if (patch.title !== undefined) {
      const t = String(patch.title).trim();
      if (t) act.title = t;
    }
    if (patch.icon !== undefined) act.icon = String(patch.icon || '🎉').trim() || '🎉';
    if (patch.description !== undefined) act.description = String(patch.description || '').trim();
    if (patch.date !== undefined) act.date = String(patch.date || '').trim();
    if (patch.time !== undefined) act.time = String(patch.time || '').trim();
    if (patch.location !== undefined) act.location = String(patch.location || '').trim();
    if (patch.status !== undefined && validStatuses.includes(patch.status)) {
      act.status = patch.status;
    }
    if (Array.isArray(patch.participantIds)) {
      const validIds = new Set((group.members || []).map(m => m.id));
      act.participantIds = Array.from(new Set(patch.participantIds.filter(id => validIds.has(id))));
    }
    act.updatedAt = new Date().toISOString();

    this.saveGroups(allGroups);
    this.notify();
    return act;
  }

  setActivityStatus(activityId, nextStatus) {
    return this.updateActivityInActiveGroup(activityId, { status: nextStatus });
  }

  toggleActivityParticipant(activityId, memberId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group || !memberId) return null;
    const act = (group.activities || []).find(a => a.id === activityId);
    if (!act) return null;

    act.participantIds = Array.isArray(act.participantIds) ? [...act.participantIds] : [];
    const idx = act.participantIds.indexOf(memberId);
    if (idx >= 0) {
      act.participantIds.splice(idx, 1);
    } else {
      act.participantIds.push(memberId);
    }
    act.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return act;
  }

  deleteActivityFromActiveGroup(activityId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return false;
    group.activities = (group.activities || []).filter(a => a.id !== activityId);
    this.saveGroups(allGroups);
    this.notify();
    return true;
  }

  addTaskToActivity(activityId, { title, description, assigneeId, dueDate }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    const cleanTitle = String(title || '').trim();
    if (!group || !user || !cleanTitle) return null;

    const act = (group.activities || []).find(a => a.id === activityId);
    if (!act) return null;

    const assignee = assigneeId ? (group.members || []).find(m => m.id === assigneeId) : null;
    const nowIso = new Date().toISOString();
    const newTask = {
      id: Utils.generateId('tsk'),
      title: cleanTitle,
      description: String(description || '').trim(),
      assigneeId: assignee ? assignee.id : '',
      assigneeName: assignee ? assignee.name : '',
      assigneeAvatar: assignee ? (assignee.avatar || '') : '',
      dueDate: String(dueDate || '').trim(),
      completed: false,
      completedAt: '',
      createdBy: user.id,
      createdAt: nowIso
    };

    act.tasks = Array.isArray(act.tasks) ? act.tasks : [];
    act.tasks.push(newTask);

    // Si el responsable aún no estaba listado como participante, sumarlo automáticamente
    if (assignee) {
      act.participantIds = Array.isArray(act.participantIds) ? act.participantIds : [];
      if (!act.participantIds.includes(assignee.id)) {
        act.participantIds.push(assignee.id);
      }
    }
    act.updatedAt = nowIso;

    this.saveGroups(allGroups);
    this.notify();
    return newTask;
  }

  updateActivityTask(activityId, taskId, patch = {}) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;

    const act = (group.activities || []).find(a => a.id === activityId);
    if (!act || !Array.isArray(act.tasks)) return null;
    const task = act.tasks.find(t => t.id === taskId);
    if (!task) return null;

    if (patch.title !== undefined) {
      const t = String(patch.title).trim();
      if (t) task.title = t;
    }
    if (patch.description !== undefined) task.description = String(patch.description || '').trim();
    if (patch.dueDate !== undefined) task.dueDate = String(patch.dueDate || '').trim();
    if (patch.assigneeId !== undefined) {
      const assignee = patch.assigneeId ? (group.members || []).find(m => m.id === patch.assigneeId) : null;
      task.assigneeId = assignee ? assignee.id : '';
      task.assigneeName = assignee ? assignee.name : '';
      task.assigneeAvatar = assignee ? (assignee.avatar || '') : '';
      if (assignee) {
        act.participantIds = Array.isArray(act.participantIds) ? act.participantIds : [];
        if (!act.participantIds.includes(assignee.id)) {
          act.participantIds.push(assignee.id);
        }
      }
    }
    act.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return task;
  }

  toggleActivityTaskCompleted(activityId, taskId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;

    const act = (group.activities || []).find(a => a.id === activityId);
    if (!act || !Array.isArray(act.tasks)) return null;
    const task = act.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : '';
    act.updatedAt = new Date().toISOString();

    const progress = this.getActivityProgress(act);
    const allCompleted = progress.total > 0 && progress.done === progress.total;

    this.saveGroups(allGroups);
    this.notify();
    return { task, completed: task.completed, allCompleted, progress };
  }

  deleteActivityTask(activityId, taskId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return false;
    const act = (group.activities || []).find(a => a.id === activityId);
    if (!act || !Array.isArray(act.tasks)) return false;

    act.tasks = act.tasks.filter(t => t.id !== taskId);
    act.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return true;
  }

  // --- METAS GRUPALES (LARGO PLAZO / PROYECTOS COMPARTIDOS) ---
  getGoalProgress(goal) {
    const tasks = Array.isArray(goal?.tasks) ? goal.tasks : [];
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => Boolean(t.completed)).length;
    let pct = 0;
    if (totalTasks > 0) {
      pct = Math.round((doneTasks / totalTasks) * 100);
    } else if (goal?.completed) {
      pct = 100;
    } else {
      pct = Math.max(0, Math.min(100, Math.round(Number(goal?.progress || 0))));
    }
    return { totalTasks, doneTasks, pct };
  }

  addGoalToActiveGroup({ title, category, icon, description, targetDate, progress, tasks }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    const cleanTitle = String(title || '').trim();
    if (!group || !cleanTitle) return null;

    const nowIso = new Date().toISOString();
    const initTasks = Array.isArray(tasks) ? tasks : [];
    const numericProgress = initTasks.length > 0
      ? Math.round((initTasks.filter(t => t.completed).length / initTasks.length) * 100)
      : Math.max(0, Math.min(100, Math.round(Number(progress || 0))));

    const newGoal = {
      id: Utils.generateId('gol'),
      icon: String(icon || '🎯').trim() || '🎯',
      title: cleanTitle,
      category: String(category || 'General').trim() || 'General',
      description: String(description || '').trim(),
      targetDate: String(targetDate || '').trim(),
      progress: numericProgress,
      completed: numericProgress >= 100,
      tasks: initTasks,
      createdBy: user?.id || '',
      createdByName: user?.name || '',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    group.goals = group.goals || [];
    group.goals.unshift(newGoal);
    if (user) this.logActivity(group, user, 'goal', `${newGoal.icon} ${newGoal.title}`);
    this.saveGroups(allGroups);
    this.notify();
    return newGoal;
  }

  updateGoalInActiveGroup(goalId, patch = {}) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const goal = (group.goals || []).find(g => g.id === goalId);
    if (!goal) return null;

    if (patch.title !== undefined) {
      const t = String(patch.title).trim();
      if (t) goal.title = t;
    }
    if (patch.icon !== undefined) goal.icon = String(patch.icon || '🎯').trim() || '🎯';
    if (patch.category !== undefined) goal.category = String(patch.category || 'General').trim() || 'General';
    if (patch.description !== undefined) goal.description = String(patch.description || '').trim();
    if (patch.targetDate !== undefined) goal.targetDate = String(patch.targetDate || '').trim();

    if (patch.progress !== undefined && (!Array.isArray(goal.tasks) || goal.tasks.length === 0)) {
      const pct = Math.max(0, Math.min(100, Math.round(Number(patch.progress) || 0)));
      goal.progress = pct;
      goal.completed = pct >= 100;
    }
    if (patch.completed !== undefined) {
      goal.completed = Boolean(patch.completed);
      if (goal.completed) goal.progress = 100;
      else if (goal.progress >= 100) goal.progress = 50;
    }

    goal.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return goal;
  }

  toggleGoalCompleted(goalId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return false;
    const goal = (group.goals || []).find(g => g.id === goalId);
    if (!goal) return false;

    goal.completed = !goal.completed;
    if (Array.isArray(goal.tasks) && goal.tasks.length > 0) {
      goal.tasks.forEach(t => { t.completed = goal.completed; });
      goal.progress = goal.completed ? 100 : 0;
    } else {
      if (goal.completed) {
        goal.prevProgress = Number(goal.progress || 0) < 100 ? Number(goal.progress || 0) : 50;
        goal.progress = 100;
      } else {
        goal.progress = Number(goal.prevProgress ?? 50);
      }
    }
    goal.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return goal.completed;
  }

  addGoalTask(goalId, { title, assigneeId }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    const cleanTitle = String(title || '').trim();
    if (!group || !cleanTitle) return null;
    const goal = (group.goals || []).find(g => g.id === goalId);
    if (!goal) return null;

    const assignee = assigneeId ? (group.members || []).find(m => m.id === assigneeId) : null;
    goal.tasks = Array.isArray(goal.tasks) ? goal.tasks : [];
    const newTask = {
      id: Utils.generateId('gtsk'),
      title: cleanTitle,
      assigneeId: assignee ? assignee.id : '',
      assigneeName: assignee ? assignee.name : '',
      assigneeAvatar: assignee ? (assignee.avatar || '') : '',
      completed: false,
      createdBy: user?.id || '',
      createdAt: new Date().toISOString()
    };
    goal.tasks.push(newTask);
    const { pct } = this.getGoalProgress(goal);
    goal.progress = pct;
    goal.completed = pct >= 100;
    goal.updatedAt = new Date().toISOString();

    this.saveGroups(allGroups);
    this.notify();
    return newTask;
  }

  toggleGoalTask(goalId, taskId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const goal = (group.goals || []).find(g => g.id === goalId);
    if (!goal || !Array.isArray(goal.tasks)) return null;
    const task = goal.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.completed = !task.completed;
    const { pct } = this.getGoalProgress(goal);
    goal.progress = pct;
    goal.completed = pct >= 100;
    goal.updatedAt = new Date().toISOString();

    this.saveGroups(allGroups);
    this.notify();
    return { task, completed: task.completed, goalCompleted: goal.completed, progress: pct };
  }

  deleteGoalTask(goalId, taskId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return false;
    const goal = (group.goals || []).find(g => g.id === goalId);
    if (!goal || !Array.isArray(goal.tasks)) return false;

    goal.tasks = goal.tasks.filter(t => t.id !== taskId);
    if (goal.tasks.length > 0) {
      const { pct } = this.getGoalProgress(goal);
      goal.progress = pct;
      goal.completed = pct >= 100;
    }
    goal.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return true;
  }

  deleteGoalFromActiveGroup(goalId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    group.goals = (group.goals || []).filter(g => g.id !== goalId);
    this.saveGroups(allGroups);
    this.notify();
  }

  // --- NOTAS COMPARTIDAS ---
  addNoteToActiveGroup({ title, category, content, pinned = false }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    const cleanTitle = String(title || '').trim();
    const cleanContent = String(content || '').trim();
    if (!group || !user || (!cleanTitle && !cleanContent)) return null;

    const nowIso = new Date().toISOString();
    const newNote = {
      id: Utils.generateId('not'),
      title: cleanTitle || 'Nota rápida',
      category: String(category || 'Idea').trim() || 'Idea',
      content: cleanContent,
      pinned: Boolean(pinned),
      authorId: user.id,
      authorName: user.name,
      authorAvatar: user.avatar || '',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    group.notes = group.notes || [];
    group.notes.unshift(newNote);
    this.logActivity(group, user, 'note', newNote.title);
    this.saveGroups(allGroups);
    this.notify();
    return newNote;
  }

  updateNoteInActiveGroup(noteId, patch = {}) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return null;
    const note = (group.notes || []).find(n => n.id === noteId);
    if (!note) return null;

    if (patch.title !== undefined) note.title = String(patch.title || '').trim() || 'Nota rápida';
    if (patch.category !== undefined) note.category = String(patch.category || 'Idea').trim() || 'Idea';
    if (patch.content !== undefined) note.content = String(patch.content || '').trim();
    if (patch.pinned !== undefined) note.pinned = Boolean(patch.pinned);
    note.updatedAt = new Date().toISOString();

    this.saveGroups(allGroups);
    this.notify();
    return note;
  }

  toggleNotePinned(noteId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return false;
    const note = (group.notes || []).find(n => n.id === noteId);
    if (!note) return false;
    note.pinned = !note.pinned;
    note.updatedAt = new Date().toISOString();
    this.saveGroups(allGroups);
    this.notify();
    return note.pinned;
  }

  deleteNoteFromActiveGroup(noteId) {
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    if (!group) return;
    group.notes = (group.notes || []).filter(n => n.id !== noteId);
    this.saveGroups(allGroups);
    this.notify();
  }

  sendChatMessage({ text = '', quote = null, media = null }) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const group = allGroups.find(g => g.id === this.getActiveGroup()?.id);
    const cleanText = String(text || '').trim();
    if (!group || !user || (!cleanText && !media && !quote)) return null;

    let storedMedia = media || null;
    let uploadTask = null;

    // Sacar adjuntos Base64 pesados del JSON del grupo y de localStorage -> IndexedDB + /chat_media/
    if (storedMedia && typeof storedMedia.url === 'string' && storedMedia.url.startsWith('data:')) {
      const mediaId = storedMedia.id || Utils.generateId('cmed');
      const rawDataUrl = storedMedia.url;
      const meta = {
        id: mediaId,
        type: storedMedia.type || 'image',
        name: storedMedia.name || '',
        duration: storedMedia.duration || ''
      };
      storedMedia = meta;
      uploadTask = CloudSync.uploadChatMedia(group.id, mediaId, {
        ...meta,
        dataUrl: rawDataUrl,
        createdAt: Date.now()
      });
    }

    const msg = {
      id: Utils.generateId('msg'),
      senderId: user.id,
      senderName: user.name,
      senderAvatar: compactAvatar(user.avatar) || 'assets/ruma_icon_512.png',
      text: cleanText,
      timestamp: new Date().toISOString(),
      quote,
      media: storedMedia
    };

    group.messages = group.messages || [];
    group.messages.push(msg);
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { msg, uploadTask };
  }

  async sendChatMessageAsync(payload) {
    const res = this.sendChatMessage(payload);
    if (res?.uploadTask) {
      await res.uploadTask;
    }
    return res?.msg || null;
  }

  canDeleteChatMessage(group, msg, user = null) {
    const u = user || this.getCurrentUser();
    if (!group || !msg || !u) return false;
    return Entitlements.isGroupAdmin(group, u.id) || msg.senderId === u.id;
  }

  canEditChatMessage(group, msg, user = null) {
    const u = user || this.getCurrentUser();
    if (!group || !msg || !u) return false;
    return msg.senderId === u.id;
  }

  editChatMessage(messageId, newText) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no encontrado' };
    const msg = (group.messages || []).find(m => m.id === messageId);
    if (!msg) return { ok: false, error: 'Mensaje no encontrado' };
    if (!this.canEditChatMessage(group, msg, user)) {
      return { ok: false, error: 'Solo el autor puede editar su mensaje.' };
    }
    const cleanText = String(newText || '').trim();
    if (!cleanText && !msg.media && !msg.quote) {
      return { ok: false, error: 'El mensaje no puede quedar vacío.' };
    }
    msg.text = cleanText;
    msg.editedAt = new Date().toISOString();
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { ok: true, msg };
  }

  deleteChatMessage(messageId) {
    return this.deleteChatMessagesBulk([messageId]);
  }

  deleteChatMessagesBulk(messageIds = []) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no encontrado', deletedCount: 0 };

    const targetSet = new Set((Array.isArray(messageIds) ? messageIds : []).filter(Boolean));
    if (targetSet.size === 0) return { ok: false, error: 'No seleccionaste mensajes.', deletedCount: 0 };

    const currentMsgs = group.messages || [];
    const matched = currentMsgs.filter(m => targetSet.has(m.id));
    if (matched.length === 0) return { ok: false, error: 'Mensaje no encontrado.', deletedCount: 0 };

    const deletable = matched.filter(m => this.canDeleteChatMessage(group, m, user));
    if (deletable.length === 0) {
      return {
        ok: false,
        error: 'Solo puedes eliminar tus propios mensajes. Solo un administrador puede borrar mensajes de otros.',
        deletedCount: 0
      };
    }

    const nowIso = new Date().toISOString();
    const delIds = new Set(deletable.map(m => m.id));
    const nextDeleted = { ...(group.deletedMessages || {}) };

    deletable.forEach(msg => {
      if (msg.media?.id) {
        CloudSync.deleteChatMedia(group.id, msg.media.id).catch(() => {});
      }
      nextDeleted[msg.id] = nowIso;
    });

    group.deletedMessages = nextDeleted;
    group.messages = currentMsgs
      .filter(m => !delIds.has(m.id))
      .map(m => {
        if (m.quote?.type === 'message' && delIds.has(m.quote.itemId)) {
          return { ...m, quote: { ...m.quote, title: 'Mensaje eliminado', deleted: true } };
        }
        return m;
      });

    if (group.pinnedMessageId && delIds.has(group.pinnedMessageId)) {
      group.pinnedMessageId = null;
    }

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { ok: true, deletedCount: deletable.length };
  }

  clearGroupChat() {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no encontrado' };
    if (!Entitlements.isGroupAdmin(group, user.id)) {
      return { ok: false, error: 'Solo un administrador del grupo puede vaciar todo el chat.' };
    }

    const existing = group.messages || [];
    const nowIso = new Date().toISOString();
    const nextDeleted = { ...(group.deletedMessages || {}) };
    existing.forEach(msg => {
      if (msg.media?.id) {
        CloudSync.deleteChatMedia(group.id, msg.media.id).catch(() => {});
      }
      if (msg.id) nextDeleted[msg.id] = nowIso;
    });

    group.chatClearedAt = nowIso;
    group.deletedMessages = nextDeleted;
    group.messages = [];
    group.pinnedMessageId = null;

    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { ok: true, clearedCount: existing.length };
  }

  togglePinChatMessage(messageId) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user) return { ok: false, error: 'Grupo no encontrado' };
    if (!Entitlements.isGroupAdmin(group, user.id)) {
      return { ok: false, error: 'Solo un administrador puede fijar mensajes en el chat.' };
    }
    if (!messageId || group.pinnedMessageId === messageId) {
      group.pinnedMessageId = null;
      this.saveGroups(allGroups, true, [group.id]);
      this.notify();
      return { ok: true, pinned: false };
    }
    const exists = (group.messages || []).some(m => m.id === messageId);
    if (!exists) return { ok: false, error: 'Mensaje no encontrado' };
    group.pinnedMessageId = messageId;
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return { ok: true, pinned: true };
  }

  toggleChatMessageReaction(messageId, emoji) {
    const user = this.getCurrentUser();
    const allGroups = this.getGroups();
    const active = this.getActiveGroup();
    const group = allGroups.find(g => g.id === active?.id);
    if (!group || !user || !emoji) return false;
    const msg = (group.messages || []).find(m => m.id === messageId);
    if (!msg) return false;
    msg.reactions = msg.reactions && typeof msg.reactions === 'object' ? { ...msg.reactions } : {};
    const list = Array.isArray(msg.reactions[emoji]) ? [...msg.reactions[emoji]] : [];
    const idx = list.indexOf(user.id);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(user.id);
    if (list.length === 0) delete msg.reactions[emoji];
    else msg.reactions[emoji] = list;
    msg.reactionsUpdatedAt = new Date().toISOString();
    this.saveGroups(allGroups, true, [group.id]);
    this.notify();
    return true;
  }
}

export const store = new RumaStore();
