/**
 * ruma 🌟 — Puente Nativo de Subida a Google Drive en 2.º Plano (Android Photo Picker + WorkManager)
 *
 * En Android APK:
 * - Abre el Android Photo Picker oficial (SIN pedir READ_MEDIA_IMAGES ni READ_MEDIA_VIDEO).
 * - Sube videos/fotos grandes en chunks de 5 MB leyendo directo desde `content://` mediante WorkManager
 *   con ForegroundService `dataSync` / User-Initiated Data Transfer Job, sobreviviendo al minimizar la app
 *   o apagar la pantalla y mostrando notificación de progreso cancelable.
 * En Web/iPhone Safari:
 * - Devuelve `isAvailable() === false` para continuar con `DriveResumableUploader` sin cambios.
 */

import { registerPlugin } from '@capacitor/core';
import { NativePlatform } from './native-platform.js';

const RumaDriveUpload = registerPlugin('RumaDriveUpload');

export const NativeDriveUploader = {
  isAvailable() {
    return NativePlatform.isAndroid();
  },

  /**
   * Abre el Android Photo Picker oficial (imágenes y videos) sin requerir permisos de almacenamiento.
   * Devuelve `{ files: [{ uri, name, mimeType, size, thumbnailDataUrl }] }`.
   */
  async pickMedia({ maxItems = 10 } = {}) {
    if (!this.isAvailable()) {
      throw new Error('Android Photo Picker solo está disponible en el APK Android.');
    }
    const res = await RumaDriveUpload.pickMedia({ maxItems });
    return Array.isArray(res?.files) ? res.files : [];
  },

  /**
   * Encola una subida en 2.º plano hacia Google Drive vía WorkManager (streaming 5 MB desde content:// URI).
   * @param {object} opts { accessToken, folderId, files: [{ uri, name, mimeType, size }], title, onProgress }
   */
  async uploadFilesInBackground({ accessToken, folderId, files = [], title = 'Recuerdo', onProgress = null }) {
    if (!this.isAvailable()) {
      throw new Error('La subida nativa en 2.º plano solo opera en Android.');
    }
    if (!accessToken || !folderId || !files.length) {
      return { uploaded: [], failed: [] };
    }

    let listenerHandle = null;
    if (typeof onProgress === 'function') {
      try {
        listenerHandle = await RumaDriveUpload.addListener('uploadProgress', (evt) => {
          onProgress({
            stage: 'drive_upload',
            percent: Number(evt?.percent) || 0,
            fileIndex: Number(evt?.fileIndex) || 1,
            totalFiles: Number(evt?.totalFiles) || files.length,
            fileName: evt?.fileName || '',
            workId: evt?.workId || ''
          });
        });
      } catch (_) {}
    }

    try {
      const result = await RumaDriveUpload.enqueueUpload({
        accessToken,
        folderId,
        title,
        files: files.map(f => ({
          uri: f.uri,
          name: f.name || 'archivo',
          mimeType: f.mimeType || 'application/octet-stream',
          size: Number(f.size) || 0
        }))
      });
      return {
        workId: result?.workId || '',
        uploaded: Array.isArray(result?.uploaded) ? result.uploaded : [],
        failed: Array.isArray(result?.failed) ? result.failed : []
      };
    } finally {
      try { await listenerHandle?.remove?.(); } catch (_) {}
    }
  },

  async cancelUpload(workId) {
    if (!this.isAvailable() || !workId) return;
    try {
      await RumaDriveUpload.cancelUpload({ workId });
    } catch (_) {}
  }
};
