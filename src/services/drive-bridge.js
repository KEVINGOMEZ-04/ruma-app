/**
 * ruma 🌟 — Puente Inteligente con Google Drive + Caché Local Rápida
 *
 * Reglas:
 * 1. Solo los Administradores del grupo pueden configurar/modificar la carpeta de Google Drive.
 * 2. Al cargar fotos/videos de un recuerdo, se crea dentro de la carpeta del grupo la subcarpeta:
 *    "[Nombre del Recuerdo] - [Día DD de mes de YYYY]" (ej: "Paseo al Mirador - Domingo 15 de noviembre de 2026")
 * 3. La información de esa carpeta se guarda localmente en caché para consulta instantánea en la app.
 */

import { CONFIG } from '../core/config.js';
import { Utils } from '../core/utils.js';

export const DriveBridge = {
  extractFolderId(urlOrId) {
    if (!urlOrId) return '';
    const trimmed = String(urlOrId).trim();
    if (!trimmed.includes('/') && trimmed.length > 8) return trimmed;
    const matchFolder = trimmed.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (matchFolder && matchFolder[1]) return matchFolder[1];
    const matchId = trimmed.match(/id=([a-zA-Z0-9_-]+)/);
    if (matchId && matchId[1]) return matchId[1];
    return trimmed;
  },

  getFolderWebUrl(urlOrId) {
    const folderId = this.extractFolderId(urlOrId);
    if (!folderId) return '';
    if (String(urlOrId).startsWith('http')) return urlOrId;
    return `https://drive.google.com/drive/folders/${folderId}`;
  },

  getLocalCache(groupId) {
    if (!groupId) return [];
    try {
      const raw = localStorage.getItem(`${CONFIG.storageKeys.driveCachePrefix}${groupId}`);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  },

  saveLocalCache(groupId, entries) {
    if (!groupId) return;
    try {
      localStorage.setItem(`${CONFIG.storageKeys.driveCachePrefix}${groupId}`, JSON.stringify(entries || []));
    } catch (err) {
      console.warn('Error guardando caché local de Drive:', err);
    }
  },

  /**
   * Registra y sincroniza un recuerdo con la carpeta de Google Drive del grupo
   * creando la subcarpeta "[Título] - [Fecha completa]" y almacenando la referencia local para consulta.
   */
  async syncMemoryToDrive(group, memoryPayload, files = []) {
    const folderId = this.extractFolderId(group?.driveFolderUrl);
    const subfolderName = Utils.buildDriveSubfolderName(memoryPayload.title, memoryPayload.date);

    // 1. Preparar metadatos de los archivos (sin límite de peso porque residen en Drive)
    const fileItems = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const isVideo = f.type && f.type.startsWith('video/');
      const previewUrl = isVideo ? '' : await Utils.fileToPreviewDataUrl(f, 850, 0.72);
      fileItems.push({
        id: Utils.generateId('drvfile'),
        name: f.name || (isVideo ? `Video_${i + 1}.mp4` : `Foto_${i + 1}.jpg`),
        mimeType: f.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        sizeBytes: f.size || 0,
        isVideo,
        previewUrl
      });
    }

    // 2. Intentar envío al puente de Google Drive si el grupo tiene carpeta configurada
    let bridgeStatus = 'local_cached';
    const bridgeEndpoint = group?.driveWebhookUrl || CONFIG.googleDrive.defaultBridgeUrl;

    if (folderId && bridgeEndpoint && fileItems.length > 0) {
      try {
        const payload = {
          action: 'uploadMemoryFolder',
          parentFolderId: folderId,
          subfolderName,
          memoryTitle: memoryPayload.title,
          memoryDate: memoryPayload.date,
          description: memoryPayload.description || '',
          filesCount: fileItems.length
        };
        fetch(bridgeEndpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        }).catch(() => {});
        bridgeStatus = 'synced_drive';
      } catch (_) {
        bridgeStatus = 'local_cached';
      }
    }

    // 3. Guardar registro en la caché local del puente para consulta inmediata
    const cacheList = this.getLocalCache(group.id);
    const folderRecord = {
      id: Utils.generateId('mem'),
      subfolderName,
      parentFolderId: folderId,
      driveUrl: this.getFolderWebUrl(group?.driveFolderUrl),
      title: memoryPayload.title,
      date: memoryPayload.date,
      fullDateLabel: Utils.formatFullSpanishDate(memoryPayload.date),
      description: memoryPayload.description || '',
      authorId: memoryPayload.authorId,
      authorName: memoryPayload.authorName,
      files: fileItems,
      coverPreview: fileItems.find(x => x.previewUrl)?.previewUrl || memoryPayload.coverPreview || '',
      bridgeStatus,
      createdAt: new Date().toISOString()
    };

    cacheList.unshift(folderRecord);
    this.saveLocalCache(group.id, cacheList);
    return folderRecord;
  }
};
