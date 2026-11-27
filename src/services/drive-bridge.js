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
import { NativeDriveUploader } from './native-drive-uploader.js';
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
    const allowDriveUpload = options.allowDriveUpload !== false && !options.localOnly;

    const subfolderName = Utils.buildDriveSubfolderName(memoryPayload.title, memoryPayload.date);
    const memoryId = memoryPayload.id || Utils.generateId('mem');

    const processedFiles = [];

    // 1. Preparar archivos: en Android Photo Picker (`nativeUri`) no cargamos el binario a RAM/IndexedDB;
    // en Web/iOS guardamos en IndexedDB para reproducción offline inmediata.
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = Utils.generateId('blob');
      const isNativeUri = Boolean(file && typeof file === 'object' && file.nativeUri);
      const mime = file?.mimeType || file?.type || '';
      const isVideo = mime ? mime.startsWith('video/') : false;

      if (typeof onProgress === 'function') {
        onProgress({
          stage: 'local',
          fileIndex: i + 1,
          totalFiles: files.length,
          percent: Math.round(((i + 0.5) / Math.max(files.length, 1)) * 100),
          fileName: file?.name || `Archivo ${i + 1}`
        });
      }

      if (isNativeUri) {
        processedFiles.push({
          id: fileId,
          name: file.name || (isVideo ? `Video_${i + 1}.mp4` : `Foto_${i + 1}.jpg`),
          type: mime || (isVideo ? 'video/mp4' : 'image/jpeg'),
          size: Number(file.size) || 0,
          isVideo,
          thumbnail: file.thumbnailDataUrl || '',
          nativeUri: file.nativeUri,
          originalFile: null
        });
        continue;
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

    // 2. Subir a Google Drive si el usuario es el creador del grupo (propietario de la carpeta `Ruma 🌷`)
    let driveSubfolder = null;
    let rootDriveFolderUrl = '';
    let driveSyncStatus = 'local_only'; // 'synced' | 'local_only' | 'error'
    let driveSyncError = '';

    const rawFolderUrl = group.driveFolderUrl || group.driveFolderId || options.userDriveFolderUrl || '';
    const hasRealFolder = this.isRealFolderConfigured(rawFolderUrl);
    let parentFolderId = hasRealFolder ? this.extractFolderId(rawFolderUrl) : '';

    let token = allowDriveUpload ? GoogleAuth.getDriveAccessToken() : null;
    if (token && token.startsWith('demo_')) token = null;
    if (!token && allowDriveUpload) {
      try {
        token = await this.ensureAccessToken(group, true);
      } catch (authErr) {
        driveSyncStatus = 'error';
        driveSyncError = authErr?.message || 'No se pudo autorizar Google Drive.';
      }
    }

    if (allowDriveUpload && token && (parentFolderId || allowCreateRootFolder)) {
      try {
        if (typeof onProgress === 'function') {
          onProgress({
            stage: 'drive_folder',
            percent: 10,
            fileName: subfolderName
          });
        }

        const resolveDriveFolders = async (activeToken) => {
          // Si había una carpeta configurada pero fue borrada o no fue creada por esta app (`drive.file`),
          // verificarla primero y, si el creador tiene permiso, re-vincular automáticamente con `Ruma 🌷`
          if (parentFolderId) {
            try {
              await DriveResumableUploader.verifyFolderAccess(activeToken, parentFolderId);
            } catch (verifyErr) {
              if (verifyErr?.status === 401) throw verifyErr;
              if (allowCreateRootFolder) {
                parentFolderId = '';
              }
            }
          }

          // Si el grupo aún no tenía carpeta vinculada, buscar o crear `Ruma 🌷`
          if (!parentFolderId) {
            const rootFolder = await DriveResumableUploader.createRootGroupFolder(activeToken);
            parentFolderId = rootFolder.id;
            rootDriveFolderUrl = rootFolder.webViewLink;
          } else if (!group.driveFolderUrl && rawFolderUrl) {
            rootDriveFolderUrl = this.getFolderWebUrl(rawFolderUrl);
          }

          return DriveResumableUploader.createSubfolder(activeToken, parentFolderId, subfolderName);
        };

        try {
          driveSubfolder = await resolveDriveFolders(token);
        } catch (folderErr) {
          if (folderErr?.status !== 401) throw folderErr;
          // Token caducado: renovar una sola vez y reintentar
          try { GoogleAuth.clearToken(); } catch (_) {}
          token = await this.ensureAccessToken(group, true);
          if (!token) throw folderErr;
          driveSubfolder = await resolveDriveFolders(token);
        }

        // 2a. Subida nativa en 2.º plano (Android WorkManager + UIDT/FGS dataSync) para URIs de Photo Picker
        const nativeItems = processedFiles.filter(item => item.nativeUri);
        if (nativeItems.length > 0 && NativeDriveUploader.isAvailable()) {
          const bgResult = await NativeDriveUploader.uploadFilesInBackground({
            accessToken: token,
            folderId: driveSubfolder.id,
            title: memoryPayload.title || 'Recuerdo',
            files: nativeItems.map(item => ({
              uri: item.nativeUri,
              name: item.name,
              mimeType: item.type,
              size: item.size
            })),
            onProgress
          });
          const uploadedArr = Array.isArray(bgResult?.uploaded) ? bgResult.uploaded : [];
          const failedArr = Array.isArray(bgResult?.failed) ? bgResult.failed : [];
          uploadedArr.forEach((u, idx) => {
            const matchIdx = Number.isInteger(u?.index) ? u.index : idx;
            const target = nativeItems[matchIdx];
            if (target && u?.id) {
              target.driveFileId = u.id;
              target.driveViewLink = u.webViewLink || `https://drive.google.com/file/d/${u.id}/view`;
            }
          });
          if (failedArr.length > 0 || uploadedArr.length === 0) {
            throw new Error(failedArr[0]?.error || 'No se pudieron transferir los archivos seleccionados a Google Drive.');
          }
        }

        // 2b. Subida resumable web/iOS para objetos File/Blob estándar
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
      files: processedFiles.map((f, idx) => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        isVideo: f.isVideo,
        isCover: Boolean(f.originalFile?.isCoverFile || (options.hasExplicitCover && idx === 0)),
        thumbnail: f.thumbnail,
        driveFileId: f.driveFileId || '',
        driveViewLink: f.driveViewLink || '',
        ...(f.nativeUri && !f.driveFileId ? { nativeUri: f.nativeUri } : {})
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

    let token = await this.ensureAccessToken(group, true);
    if (!token) {
      throw new Error('Debes iniciar sesión con Google primero para subir a Drive.');
    }

    const rawFolderUrl = group.driveFolderUrl || group.driveFolderId || options.userDriveFolderUrl || '';
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
    const resolveSubfolder = async (activeToken) => {
      let created = null;
      if (parentFolderId) {
        try {
          created = await DriveResumableUploader.createSubfolder(activeToken, parentFolderId, subfolderName);
        } catch (subErr) {
          if (subErr?.status === 401) throw subErr;
          if (!allowCreateRootFolder) throw subErr;
          parentFolderId = '';
        }
      }
      if (!created) {
        if (!allowCreateRootFolder) {
          throw new Error('Solo el creador del grupo (dueño de la carpeta en Google Drive) puede activar o crear la carpeta Ruma 🌷.');
        }
        const rootFolder = await DriveResumableUploader.createRootGroupFolder(activeToken);
        parentFolderId = rootFolder.id;
        rootDriveFolderUrl = rootFolder.webViewLink;
        created = await DriveResumableUploader.createSubfolder(activeToken, parentFolderId, subfolderName);
      }
      return created;
    };
    if (!driveSubfolder) {
      try {
        driveSubfolder = await resolveSubfolder(token);
      } catch (folderErr) {
        if (folderErr?.status !== 401) throw folderErr;
        try { GoogleAuth.clearToken(); } catch (_) {}
        token = await this.ensureAccessToken(group, true);
        if (!token) throw folderErr;
        driveSubfolder = await resolveSubfolder(token);
      }
    }

    const updatedFiles = [...(memory.files || [])];
    const emitCheckpoint = () => {
      if (typeof options.onCheckpoint === 'function') {
        try {
          options.onCheckpoint({
            subfolderName,
            rootDriveFolderUrl,
            driveSubfolderId: driveSubfolder?.id || memory.driveSubfolderId || '',
            driveUrl: driveSubfolder?.webViewLink || memory.driveUrl || '',
            files: updatedFiles
          });
        } catch (_) {}
      }
    };
    emitCheckpoint();

    let uploadedOrAlreadySyncedCount = 0;
    let missingOriginalCount = 0;

    const cleanMemTitle = String(memory.title || 'Recuerdo')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim() || 'Recuerdo';

    // 1. Si hay archivos en IndexedDB, subir solo los que aún no tienen driveFileId (reanudando desde el punto exacto)
    if (updatedFiles.length > 0) {
      let linkedSeq = 0;
      for (let i = 0; i < updatedFiles.length; i++) {
        const fMeta = updatedFiles[i];
        const isCoverItem = Boolean(fMeta?.isCover || /^Portada(\.|_)/i.test(String(fMeta?.name || '')));
        if (!isCoverItem) linkedSeq++;
        if (fMeta?.driveFileId) {
          uploadedOrAlreadySyncedCount++;
          if (typeof onProgress === 'function') {
            onProgress({
              stage: 'drive_upload',
              fileIndex: i + 1,
              totalFiles: updatedFiles.length,
              percent: Math.round(((i + 1) / Math.max(updatedFiles.length, 1)) * 100),
              fileName: fMeta.name || ''
            });
          }
          continue;
        }
        const rawExtMatch = String(fMeta?.name || '').match(/\.([a-zA-Z0-9]+)$/);
        const ext = rawExtMatch ? rawExtMatch[1] : (fMeta?.isVideo ? 'mp4' : 'jpg');
        const targetFileName = isCoverItem
          ? `Portada.${ext}`
          : `${cleanMemTitle} ${linkedSeq}.${ext}`;

        if (fMeta?.nativeUri && NativeDriveUploader.isAvailable()) {
          const bgRes = await NativeDriveUploader.uploadFilesInBackground({
            accessToken: token,
            folderId: driveSubfolder.id,
            title: memory.title || 'Recuerdo',
            files: [{
              uri: fMeta.nativeUri,
              name: targetFileName,
              mimeType: fMeta.type || 'application/octet-stream',
              size: fMeta.size || 0
            }],
            onProgress
          });
          const uploadedNative = Array.isArray(bgRes?.uploaded) ? bgRes.uploaded[0] : null;
          if (!uploadedNative?.id) {
            throw new Error(bgRes?.failed?.[0]?.error || 'No se pudo subir el archivo a Google Drive desde el dispositivo.');
          }
          const { nativeUri: _doneUri, ...restMeta } = fMeta;
          updatedFiles[i] = {
            ...restMeta,
            name: targetFileName,
            driveFileId: uploadedNative.id,
            driveViewLink: uploadedNative.webViewLink || `https://drive.google.com/file/d/${uploadedNative.id}/view`,
            driveResumeUrl: ''
          };
          uploadedOrAlreadySyncedCount++;
          emitCheckpoint();
          continue;
        }

        const record = await MediaStorage.getMedia(fMeta.id);
        let fileObj = null;
        if (record?.blob) {
          fileObj = new File([record.blob], targetFileName, {
            type: fMeta.type || record.blob.type || 'application/octet-stream'
          });
        } else if (fMeta.thumbnail && !fMeta.isVideo) {
          // Solo usar miniatura como respaldo para imágenes (nunca disfrazar un JPEG como vídeo .mp4)
          const thumbBlob = this.dataUrlToBlob(fMeta.thumbnail);
          if (thumbBlob) {
            const thumbExt = (thumbBlob.type || '').includes('png') ? 'png' : 'jpg';
            const thumbName = isCoverItem ? `Portada.${thumbExt}` : `${cleanMemTitle} ${linkedSeq}.${thumbExt}`;
            fileObj = new File([thumbBlob], thumbName, { type: thumbBlob.type || 'image/jpeg' });
          }
        }

        if (!fileObj) {
          missingOriginalCount++;
          continue;
        }

        const uploaded = await DriveResumableUploader.uploadLargeFile(
          token,
          driveSubfolder.id,
          fileObj,
          (p) => {
            if (typeof onProgress === 'function') {
              const fileWeight = 1 / Math.max(updatedFiles.length, 1);
              const overallPct = Math.min(99, Math.max(15, Math.round((i * fileWeight + ((Number(p.percent) || 0) / 100) * fileWeight) * 100)));
              onProgress({
                stage: 'drive_upload',
                fileIndex: i + 1,
                totalFiles: updatedFiles.length,
                ...p,
                percent: overallPct
              });
            }
          },
          {
            resumeUrl: fMeta.driveResumeUrl || '',
            onSessionUrl: (sessionUrl) => {
              updatedFiles[i] = { ...updatedFiles[i], driveResumeUrl: sessionUrl || '' };
              emitCheckpoint();
            }
          }
        );
        updatedFiles[i] = {
          ...fMeta,
          name: fileObj.name,
          driveFileId: uploaded.id,
          driveViewLink: uploaded.webViewLink,
          driveResumeUrl: ''
        };
        uploadedOrAlreadySyncedCount++;
        emitCheckpoint();
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
          const photoName = i === 0 && memory.photos.length > 1
            ? `Portada.${ext}`
            : `${cleanMemTitle} ${i + 1}.${ext}`;
          const fileObj = new File([blob], photoName, { type: blob.type || 'image/jpeg' });
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
          emitCheckpoint();
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

    if ((memory.description || memory.title) && !memory.driveNoteUploaded) {
      const summaryLines = [
        `Recuerdo: ${memory.title || 'Recuerdo'}`,
        `Fecha: ${Utils.formatFullSpanishDate(memory.date)} (${memory.date || ''})`,
        memory.authorName ? `Autor: ${memory.authorName}` : '',
        '',
        memory.description || ''
      ].filter((l, idx) => idx >= 3 || Boolean(l)).join('\n');
      const noteBlob = new Blob([summaryLines], { type: 'text/plain;charset=utf-8' });
      const noteFile = new File([noteBlob], 'Historia_del_Recuerdo.txt', { type: 'text/plain;charset=utf-8' });
      const noteUp = await DriveResumableUploader.uploadMultipartFile(token, driveSubfolder.id, noteFile).catch(() => null);
      if (noteUp?.id) {
        memory.driveNoteUploaded = true;
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
