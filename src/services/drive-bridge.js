/**
 * ruma 🌟 — Puente Oficial con Google Drive (OAuth 2.0) + Almacenamiento Local IndexedDB
 *
 * Reglas de Arquitectura:
 * 1. Soporta archivos gigantes (fotos de 100 MB y videos de más de 1 GB) sin desbordar memoria.
 * 2. Guarda el archivo binario real en IndexedDB localmente para reproducción y visualización inmediata.
 * 3. Crea automáticamente en Google Drive la subcarpeta con formato:
 *    "[Nombre del Recuerdo] - [Día y Fecha en español]" (ej: "Paseo al Mirador - Domingo 15 de noviembre de 2026")
 * 4. Sube mediante Google Drive API v3 (OAuth 2.0) con reporte de progreso en vivo.
 * 5. Permite reintentar / sincronizar en cualquier momento recuerdos guardados localmente.
 */

import { Utils } from '../core/utils.js';
import { MediaStorage } from './media-storage.js';
import { DriveResumableUploader } from './drive-resumable-uploader.js';
import { GoogleAuth } from './google-auth.js';

const DEMO_FOLDER_IDS = new Set([
  '1RumaDemoFolderPublicEditor',
  '1ClubCineSharedDriveFolder'
]);

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

  isRealFolderConfigured(urlOrId) {
    const id = this.extractFolderId(urlOrId);
    return Boolean(id && !DEMO_FOLDER_IDS.has(id));
  },

  getFolderWebUrl(urlOrId) {
    const folderId = this.extractFolderId(urlOrId);
    if (!folderId) return '';
    if (String(urlOrId).startsWith('http')) return urlOrId;
    return `https://drive.google.com/drive/folders/${folderId}`;
  },

  /**
   * Obtiene un token OAuth activo; si no hay sesión o expiró y forceInteractive=true,
   * abre el popup de inicio de sesión de Google.
   */
  async ensureAccessToken(group = null, forceInteractive = false) {
    let token = GoogleAuth.getAccessToken();
    if (token && !token.startsWith('demo_')) return token;

    if (forceInteractive && GoogleAuth.hasValidClientId(group)) {
      const session = await GoogleAuth.requestDriveAccess('', group);
      return session?.accessToken || null;
    }

    return null;
  },

  /**
   * Verifica la conexión real con la carpeta de Google Drive configurada en el grupo
   */
  async testFolderConnection(folderUrlOrId, group = null) {
    const folderId = this.extractFolderId(folderUrlOrId);
    if (!folderId || DEMO_FOLDER_IDS.has(folderId)) {
      throw new Error('Pega el enlace real de tu carpeta de Google Drive (o usa el botón «Crear carpeta automática en mi Drive»).');
    }

    const token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Inicia sesión con tu cuenta de Google para verificar la carpeta.');
    }

    return DriveResumableUploader.verifyFolderAccess(token, folderId);
  },

  /**
   * Crea una carpeta principal para el grupo en el Google Drive del usuario conectado
   */
  async createGroupFolderInDrive(group) {
    const token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Inicia sesión con tu cuenta de Google primero.');
    }
    return DriveResumableUploader.createRootGroupFolder(token, group?.name || 'Mi Grupo');
  },

  /**
   * Convierte un dataURL (por ejemplo, una nota de voz grabada) en un Blob para subirlo también a Drive
   */
  dataUrlToBlob(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.includes(',')) return null;
    try {
      const [header, base64] = dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : 'audio/webm';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch (_) {
      return null;
    }
  },

  /**
   * Sincroniza un recuerdo completo con fotos/videos pesados:
   * 1. Guarda en IndexedDB para disponibilidad instantánea y offline
   * 2. Si Google Drive está vinculado, crea la subcarpeta y sube cada archivo
   */
  async syncMemoryToDrive(group, memoryPayload, files = [], onProgress = null) {
    return this.syncMemory(group, memoryPayload, files, onProgress);
  },

  async syncMemory(group, memoryPayload, files = [], onProgress = null) {
    if (!group) throw new Error('Grupo no especificado.');

    const subfolderName = Utils.buildDriveSubfolderName(memoryPayload.title, memoryPayload.date);
    const memoryId = memoryPayload.id || Utils.generateId('mem');

    const processedFiles = [];

    // 1. Guardar cada archivo binario en IndexedDB (soporta 100 MB y 1 GB+)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = Utils.generateId('blob');
      const isVideo = file.type ? file.type.startsWith('video/') : false;

      if (typeof onProgress === 'function') {
        onProgress({
          stage: 'local',
          fileIndex: i + 1,
          totalFiles: files.length,
          percent: Math.round(((i + 0.5) / Math.max(files.length, 1)) * 100),
          fileName: file.name || `Archivo ${i + 1}`
        });
      }

      const mediaRecord = await MediaStorage.saveMedia(fileId, file, {
        groupId: group.id,
        memoryId,
        name: file.name || (isVideo ? `Video_${i + 1}.mp4` : `Foto_${i + 1}.jpg`)
      });

      processedFiles.push({
        id: fileId,
        name: mediaRecord.name,
        type: mediaRecord.type,
        size: mediaRecord.size,
        isVideo: mediaRecord.isVideo,
        thumbnail: mediaRecord.thumbnail,
        originalFile: file
      });
    }

    // 2. Subir a Google Drive si hay carpeta real y cuenta Google conectada (o si se puede solicitar token)
    let driveSubfolder = null;
    let driveSyncStatus = 'local_only'; // 'synced' | 'local_only' | 'error'
    let driveSyncError = '';

    const rawFolderUrl = group.driveFolderUrl || group.driveFolderId || '';
    const hasRealFolder = this.isRealFolderConfigured(rawFolderUrl);
    const parentFolderId = hasRealFolder ? this.extractFolderId(rawFolderUrl) : '';

    // Intentar obtener token activo (o pedir login si el Client ID ya está configurado y hay carpeta o cuenta)
    let token = GoogleAuth.getAccessToken();
    if (token && token.startsWith('demo_')) token = null;

    if (!token && hasRealFolder && GoogleAuth.hasValidClientId(group)) {
      try {
        token = await this.ensureAccessToken(group, true);
      } catch (authErr) {
        driveSyncStatus = 'error';
        driveSyncError = authErr.message || 'No se autorizó el inicio de sesión con Google.';
      }
    }

    if (token && (parentFolderId || GoogleAuth.isConnected())) {
      try {
        if (typeof onProgress === 'function') {
          onProgress({
            stage: 'drive_folder',
            percent: 10,
            fileName: subfolderName
          });
        }

        // Si el grupo no tenía una carpeta real configurada (o tenía la de demo), crear la subcarpeta en la raíz o carpeta padre
        driveSubfolder = await DriveResumableUploader.createSubfolder(token, parentFolderId, subfolderName);

        // Subir cada foto/video a la subcarpeta de Google Drive
        for (let i = 0; i < processedFiles.length; i++) {
          const item = processedFiles[i];
          if (item.originalFile) {
            const driveResult = await DriveResumableUploader.uploadLargeFile(
              token,
              driveSubfolder.id,
              item.originalFile,
              (p) => {
                if (typeof onProgress === 'function') {
                  onProgress({
                    stage: 'drive_upload',
                    fileIndex: i + 1,
                    totalFiles: processedFiles.length,
                    ...p
                  });
                }
              }
            );
            item.driveFileId = driveResult.id;
            item.driveViewLink = driveResult.webViewLink;
          }
        }

        // Si el recuerdo incluye nota de voz, subirla también a la subcarpeta
        if (memoryPayload.voiceNote) {
          const voiceBlob = this.dataUrlToBlob(memoryPayload.voiceNote);
          if (voiceBlob) {
            const mime = voiceBlob.type || 'audio/mp4';
            const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : (mime.includes('ogg') ? 'ogg' : 'webm');
            const voiceFile = new File([voiceBlob], `Nota_de_Voz.${ext}`, { type: mime });
            await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, voiceFile).catch(() => {});
          }
        }

        driveSyncStatus = 'synced';
      } catch (uploadErr) {
        console.warn('Error sincronizando con Google Drive:', uploadErr);
        driveSyncStatus = 'error';
        driveSyncError = uploadErr.message || 'Error al subir a Google Drive.';
      }
    }

    const coverThumbnail = processedFiles.find(f => f.thumbnail)?.thumbnail || '';

    return {
      id: memoryId,
      groupId: group.id,
      title: memoryPayload.title,
      date: memoryPayload.date,
      fullDateLabel: Utils.formatFullSpanishDate(memoryPayload.date),
      description: memoryPayload.description || '',
      authorId: memoryPayload.authorId,
      authorName: memoryPayload.authorName,
      subfolderName,
      driveSubfolderId: driveSubfolder?.id || '',
      driveSubfolderUrl: driveSubfolder?.webViewLink || '',
      driveSyncStatus,
      driveSyncError,
      coverThumbnail,
      files: processedFiles.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        isVideo: f.isVideo,
        thumbnail: f.thumbnail,
        driveFileId: f.driveFileId || '',
        driveViewLink: f.driveViewLink || ''
      })),
      createdAt: new Date().toISOString()
    };
  },

  /**
   * Permite subir a Google Drive un recuerdo que ya estaba guardado localmente en IndexedDB
   */
  async syncExistingMemoryToDrive(group, memory, onProgress = null) {
    if (!group || !memory) throw new Error('Recuerdo o grupo no válido.');

    const token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Debes iniciar sesión con Google primero para subir a Drive.');
    }

    const rawFolderUrl = group.driveFolderUrl || group.driveFolderId || '';
    const parentFolderId = this.isRealFolderConfigured(rawFolderUrl) ? this.extractFolderId(rawFolderUrl) : '';
    const subfolderName = memory.subfolderName || Utils.buildDriveSubfolderName(memory.title, memory.date);

    if (typeof onProgress === 'function') {
      onProgress({ stage: 'drive_folder', percent: 15, fileName: subfolderName });
    }

    const driveSubfolder = await DriveResumableUploader.createSubfolder(token, parentFolderId, subfolderName);
    const updatedFiles = [...(memory.files || [])];

    // 1. Si hay archivos en IndexedDB, subirlos con su calidad original
    if (updatedFiles.length > 0) {
      for (let i = 0; i < updatedFiles.length; i++) {
        const fMeta = updatedFiles[i];
        const record = await MediaStorage.getMedia(fMeta.id);
        const blobToUpload = record?.blob || (fMeta.thumbnail ? this.dataUrlToBlob(fMeta.thumbnail) : null);
        if (blobToUpload) {
          const fileObj = blobToUpload instanceof File
            ? blobToUpload
            : new File([blobToUpload], fMeta.name || `Foto_${i + 1}.jpg`, { type: fMeta.type || blobToUpload.type || 'image/jpeg' });
          const uploaded = await DriveResumableUploader.uploadLargeFile(token, driveSubfolder.id, fileObj, (p) => {
            if (typeof onProgress === 'function') {
              onProgress({
                stage: 'drive_upload',
                fileIndex: i + 1,
                totalFiles: updatedFiles.length,
                ...p
              });
            }
          });
          updatedFiles[i] = {
            ...fMeta,
            driveFileId: uploaded.id,
            driveViewLink: uploaded.webViewLink
          };
        }
      }
    } else if (Array.isArray(memory.photos) && memory.photos.length > 0) {
      // 2. Si solo hay fotos base64 en memory.photos, subirlas
      for (let i = 0; i < memory.photos.length; i++) {
        const photoStr = memory.photos[i];
        const blob = this.dataUrlToBlob(photoStr);
        if (blob) {
          const fileObj = new File([blob], `Foto_${i + 1}.jpg`, { type: blob.type || 'image/jpeg' });
          const uploaded = await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, fileObj);
          updatedFiles.push({
            id: Utils.generateId('blob'),
            name: fileObj.name,
            type: fileObj.type,
            size: fileObj.size,
            isVideo: false,
            thumbnail: photoStr,
            driveFileId: uploaded.id,
            driveViewLink: uploaded.webViewLink
          });
        }
      }
    }

    if (memory.voiceNote) {
      const voiceBlob = this.dataUrlToBlob(memory.voiceNote);
      if (voiceBlob) {
        const mime = voiceBlob.type || 'audio/mp4';
        const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : (mime.includes('ogg') ? 'ogg' : 'webm');
        const voiceFile = new File([voiceBlob], `Nota_de_Voz.${ext}`, { type: mime });
        await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, voiceFile).catch(() => {});
      }
    }

    return {
      subfolderName,
      driveSubfolderId: driveSubfolder.id,
      driveUrl: driveSubfolder.webViewLink,
      driveSyncStatus: 'synced',
      driveSyncError: '',
      files: updatedFiles
    };
  }
};
