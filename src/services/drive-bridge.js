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
   * Obtiene un token OAuth con permiso de Google Drive (`drive.file`);
   * si no hay sesión o expiró y forceInteractive=true, abre el flujo OAuth de Google.
   */
  async ensureAccessToken(group = null, forceInteractive = false) {
    let token = GoogleAuth.getDriveAccessToken();
    if (token && !token.startsWith('demo_')) return token;

    if (forceInteractive && GoogleAuth.hasValidClientId(group)) {
      const session = await GoogleAuth.requestDriveAccess('', group);
      return session?.hasDriveScope ? (session.accessToken || null) : null;
    }

    return null;
  },

  /**
   * Verifica la conexión real con la carpeta de Google Drive configurada en el grupo
   */
  async testFolderConnection(folderUrlOrId, group = null) {
    const folderId = this.extractFolderId(folderUrlOrId);
    if (!folderId || DEMO_FOLDER_IDS.has(folderId)) {
      throw new Error('Vincula primero la carpeta Ruma 🌷 con el botón «Crear / vincular carpeta Ruma 🌷».');
    }

    const token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Conecta tu cuenta de Google Drive para verificar la carpeta.');
    }

    return DriveResumableUploader.verifyFolderAccess(token, folderId);
  },

  /**
   * Busca o crea la carpeta principal `Ruma 🌷` en el Google Drive del usuario conectado
   */
  async createGroupFolderInDrive(group) {
    const token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Conecta tu cuenta de Google Drive primero.');
    }
    return DriveResumableUploader.createRootGroupFolder(token);
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
   * Resuelve un archivo de recuerdo para cualquier miembro del grupo:
   * 1) Si existe localmente en IndexedDB, devuelve su objectURL al instante.
   * 2) Si falta localmente pero tiene `driveFileId` y el usuario tiene Google Drive conectado,
   *    descarga el original desde Drive, lo guarda en IndexedDB y devuelve el objectURL HD/vídeo.
   * 3) Si aún no conecta Drive, devuelve la miniatura como respaldo indicando `needsDriveConnect`.
   */
  async resolveMemoryFileMedia(fileMeta, group = null) {
    if (!fileMeta) return null;
    const localUrl = await MediaStorage.getObjectUrl(fileMeta.id);
    if (localUrl) {
      return {
        url: localUrl,
        isVideo: Boolean(fileMeta.isVideo),
        name: fileMeta.name || 'Archivo',
        source: 'local',
        driveFileId: fileMeta.driveFileId || '',
        driveViewLink: fileMeta.driveViewLink || '',
        needsDriveConnect: false
      };
    }

    if (fileMeta.driveFileId) {
      const token = GoogleAuth.getDriveAccessToken();
      if (token) {
        try {
          const blob = await DriveResumableUploader.downloadFileBlob(token, fileMeta.driveFileId);
          const typedBlob = blob.type
            ? blob
            : new Blob([blob], { type: fileMeta.type || (fileMeta.isVideo ? 'video/mp4' : 'image/jpeg') });
          await MediaStorage.saveMedia(fileMeta.id, typedBlob, {
            groupId: group?.id || '',
            name: fileMeta.name || 'Archivo'
          }).catch(() => {});
          const objUrl = URL.createObjectURL(typedBlob);
          return {
            url: objUrl,
            isVideo: Boolean(fileMeta.isVideo),
            name: fileMeta.name || 'Archivo',
            source: 'drive',
            driveFileId: fileMeta.driveFileId,
            driveViewLink: fileMeta.driveViewLink || `https://drive.google.com/file/d/${fileMeta.driveFileId}/view`,
            needsDriveConnect: false
          };
        } catch (_) {
          // Si el usuario actual no tiene permiso sobre ese archivo específico o falló la red, caer a miniatura + enlace Drive
        }
      }
    }

    if (fileMeta.thumbnail) {
      return {
        url: fileMeta.thumbnail,
        isVideo: false,
        originalIsVideo: Boolean(fileMeta.isVideo),
        name: fileMeta.name || 'Archivo',
        source: 'thumbnail',
        driveFileId: fileMeta.driveFileId || '',
        driveViewLink: fileMeta.driveViewLink || (fileMeta.driveFileId ? `https://drive.google.com/file/d/${fileMeta.driveFileId}/view` : ''),
        needsDriveConnect: Boolean(fileMeta.driveFileId)
      };
    }

    return null;
  },

  /**
   * Sincroniza un recuerdo completo con fotos/videos pesados:
   * 1. Guarda en IndexedDB para disponibilidad instantánea y offline
   * 2. Si Google Drive ya está conectado (sin abrir popup tras `await` en iOS Safari),
   *    asegura la carpeta `Ruma 🌷`, crea la subcarpeta del recuerdo y sube cada archivo.
   */
  async syncMemoryToDrive(group, memoryPayload, files = [], onProgress = null, options = {}) {
    return this.syncMemory(group, memoryPayload, files, onProgress, options);
  },

  async syncMemory(group, memoryPayload, files = [], onProgress = null, options = {}) {
    if (!group) throw new Error('Grupo no especificado.');
    const allowCreateRootFolder = options.allowCreateRootFolder !== false;
    const allowDriveUpload = options.allowDriveUpload !== false;

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

    // 2. Subir a Google Drive si el creador del grupo tiene token activo de `drive.file`
    // (No abrir popup tras `await` para evitar bloqueos de Safari iOS)
    let driveSubfolder = null;
    let rootDriveFolderUrl = '';
    let driveSyncStatus = 'local_only'; // 'synced' | 'local_only' | 'error'
    let driveSyncError = '';

    const rawFolderUrl = group.driveFolderUrl || group.driveFolderId || '';
    const hasRealFolder = this.isRealFolderConfigured(rawFolderUrl);
    let parentFolderId = hasRealFolder ? this.extractFolderId(rawFolderUrl) : '';

    let token = allowDriveUpload ? GoogleAuth.getDriveAccessToken() : null;
    if (token && token.startsWith('demo_')) token = null;

    if (allowDriveUpload && token && (parentFolderId || allowCreateRootFolder)) {
      try {
        if (typeof onProgress === 'function') {
          onProgress({
            stage: 'drive_folder',
            percent: 10,
            fileName: subfolderName
          });
        }

        // Si había una carpeta configurada pero fue borrada o no fue creada por esta app (`drive.file`),
        // verificarla primero y, si el creador tiene permiso, re-vincular automáticamente con `Ruma 🌷`
        if (parentFolderId) {
          try {
            await DriveResumableUploader.verifyFolderAccess(token, parentFolderId);
          } catch (_) {
            if (allowCreateRootFolder) {
              parentFolderId = '';
            }
          }
        }

        // Si el grupo aún no tenía carpeta vinculada, solo el creador del grupo puede buscar/crear `Ruma 🌷`
        if (!parentFolderId) {
          const rootFolder = await DriveResumableUploader.createRootGroupFolder(token);
          parentFolderId = rootFolder.id;
          rootDriveFolderUrl = rootFolder.webViewLink;
        }

        driveSubfolder = await DriveResumableUploader.createSubfolder(token, parentFolderId, subfolderName);

        // Subir cada foto/video a la subcarpeta del recuerdo dentro de `Ruma 🌷`
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
            const voiceUp = await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, voiceFile).catch(() => null);
            if (voiceUp?.id) {
              memoryPayload.driveVoiceFileId = voiceUp.id;
            }
          }
        }

        // Guardar siempre una ficha de texto con la historia, fecha y ubicación dentro de la subcarpeta del recuerdo
        if (memoryPayload.description || memoryPayload.title) {
          const summaryLines = [
            `Recuerdo: ${memoryPayload.title || 'Recuerdo'}`,
            `Fecha: ${Utils.formatFullSpanishDate(memoryPayload.date)} (${memoryPayload.date || ''})`,
            memoryPayload.authorName ? `Autor: ${memoryPayload.authorName}` : '',
            '',
            memoryPayload.description || ''
          ].filter((l, idx) => idx >= 3 || Boolean(l)).join('\n');
          const noteBlob = new Blob([summaryLines], { type: 'text/plain;charset=utf-8' });
          const noteFile = new File([noteBlob], 'Historia_del_Recuerdo.txt', { type: 'text/plain;charset=utf-8' });
          await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, noteFile).catch(() => {});
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
      rootDriveFolderUrl,
      driveSubfolderId: driveSubfolder?.id || '',
      driveSubfolderUrl: driveSubfolder?.webViewLink || '',
      driveVoiceFileId: memoryPayload.driveVoiceFileId || '',
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
  async syncExistingMemoryToDrive(group, memory, onProgress = null, options = {}) {
    if (!group || !memory) throw new Error('Recuerdo o grupo no válido.');
    const allowCreateRootFolder = options.allowCreateRootFolder !== false;

    const token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Debes iniciar sesión con Google primero para subir a Drive.');
    }

    const rawFolderUrl = group.driveFolderUrl || group.driveFolderId || '';
    let parentFolderId = this.isRealFolderConfigured(rawFolderUrl) ? this.extractFolderId(rawFolderUrl) : '';
    let rootDriveFolderUrl = '';
    const subfolderName = memory.subfolderName || Utils.buildDriveSubfolderName(memory.title, memory.date);

    if (typeof onProgress === 'function') {
      onProgress({ stage: 'drive_folder', percent: 15, fileName: subfolderName });
    }

    // Reutilizar la subcarpeta de Drive ya creada si es un reintento idempotente
    let driveSubfolder = null;
    if (memory.driveSubfolderId) {
      try {
        const verified = await DriveResumableUploader.verifyFolderAccess(token, memory.driveSubfolderId);
        driveSubfolder = {
          id: verified.id,
          name: verified.name || subfolderName,
          webViewLink: verified.webViewLink || memory.driveUrl || `https://drive.google.com/drive/folders/${verified.id}`
        };
      } catch (_) {
        driveSubfolder = null;
      }
    }
    if (!driveSubfolder) {
      if (parentFolderId) {
        try {
          driveSubfolder = await DriveResumableUploader.createSubfolder(token, parentFolderId, subfolderName);
        } catch (subErr) {
          if (!allowCreateRootFolder) throw subErr;
          parentFolderId = '';
        }
      }
      if (!driveSubfolder) {
        if (!allowCreateRootFolder) {
          throw new Error('Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar o crear la carpeta Ruma 🌷.');
        }
        const rootFolder = await DriveResumableUploader.createRootGroupFolder(token);
        parentFolderId = rootFolder.id;
        rootDriveFolderUrl = rootFolder.webViewLink;
        driveSubfolder = await DriveResumableUploader.createSubfolder(token, parentFolderId, subfolderName);
      }
    }

    const updatedFiles = [...(memory.files || [])];
    let uploadedOrAlreadySyncedCount = 0;
    let missingOriginalCount = 0;

    // 1. Si hay archivos en IndexedDB, subir solo los que aún no tienen driveFileId
    if (updatedFiles.length > 0) {
      for (let i = 0; i < updatedFiles.length; i++) {
        const fMeta = updatedFiles[i];
        if (fMeta?.driveFileId) {
          uploadedOrAlreadySyncedCount++;
          continue;
        }
        const record = await MediaStorage.getMedia(fMeta.id);
        let fileObj = null;
        if (record?.blob) {
          fileObj = record.blob instanceof File
            ? record.blob
            : new File([record.blob], fMeta.name || `Archivo_${i + 1}`, { type: fMeta.type || record.blob.type || 'application/octet-stream' });
        } else if (fMeta.thumbnail && !fMeta.isVideo) {
          // Solo usar miniatura como respaldo para imágenes (nunca disfrazar un JPEG como vídeo .mp4)
          const thumbBlob = this.dataUrlToBlob(fMeta.thumbnail);
          if (thumbBlob) {
            const safeBaseName = String(fMeta.name || `Foto_${i + 1}`).replace(/\.[^.]+$/, '');
            const ext = (thumbBlob.type || '').includes('png') ? 'png' : 'jpg';
            fileObj = new File([thumbBlob], `${safeBaseName}.${ext}`, { type: thumbBlob.type || 'image/jpeg' });
          }
        }

        if (!fileObj) {
          missingOriginalCount++;
          continue;
        }

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
        uploadedOrAlreadySyncedCount++;
      }

      if (uploadedOrAlreadySyncedCount === 0 && missingOriginalCount > 0) {
        throw new Error('Los archivos originales de este recuerdo solo existen en el dispositivo donde se subieron y no están disponibles localmente para enviarlos a Drive.');
      }
    } else if (Array.isArray(memory.photos) && memory.photos.length > 0) {
      // 2. Si solo hay fotos base64 en memory.photos, subirlas
      for (let i = 0; i < memory.photos.length; i++) {
        const photoStr = memory.photos[i];
        const blob = this.dataUrlToBlob(photoStr);
        if (blob) {
          const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
          const fileObj = new File([blob], `Foto_${i + 1}.${ext}`, { type: blob.type || 'image/jpeg' });
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

    if (memory.voiceNote && !memory.driveVoiceFileId) {
      const voiceBlob = this.dataUrlToBlob(memory.voiceNote);
      if (voiceBlob) {
        const mime = voiceBlob.type || 'audio/mp4';
        const ext = mime.includes('mp4') || mime.includes('aac') ? 'm4a' : (mime.includes('ogg') ? 'ogg' : 'webm');
        const voiceFile = new File([voiceBlob], `Nota_de_Voz.${ext}`, { type: mime });
        const voiceUp = await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, voiceFile).catch(() => null);
        if (voiceUp?.id) {
          memory.driveVoiceFileId = voiceUp.id;
        }
      }
    }

    return {
      subfolderName,
      rootDriveFolderUrl,
      driveSubfolderId: driveSubfolder.id,
      driveUrl: driveSubfolder.webViewLink,
      driveSyncStatus: 'synced',
      driveSyncError: '',
      files: updatedFiles
    };
  }
};
