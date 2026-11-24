/**
 * ruma 🌟 — Puente Oficial con Google Drive + Almacenamiento Local IndexedDB
 *
 * Reglas de Arquitectura:
 * 1. Soporta archivos gigantes (fotos de 100 MB y videos de más de 1 GB) sin desbordar memoria.
 * 2. Guarda el archivo binario real en IndexedDB localmente para reproducción y visualización inmediata.
 * 3. Crea automáticamente en Google Drive la subcarpeta con formato:
 *    "[Nombre del Recuerdo] - [Día y Fecha en español]" (ej: "Paseo al Mirador - Domingo 15 de noviembre de 2026")
 * 4. Sube mediante el protocolo Resumible oficial de Google en fragmentos de 5 MB con reporte de progreso.
 * 5. Solo los usuarios con rol de Administrador pueden autorizar y cambiar la carpeta de Google Drive.
 */

import { CONFIG } from '../core/config.js';
import { Utils } from '../core/utils.js';
import { MediaStorage } from './media-storage.js';
import { DriveResumableUploader } from './drive-resumable-uploader.js';
import { GoogleAuth } from './google-auth.js';

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

  /**
   * Sincroniza un recuerdo completo con fotos/videos pesados:
   * 1. Guarda en IndexedDB para disponibilidad instantánea y offline
   * 2. Si Google Drive está vinculado, sube en segundo plano mediante subida resumible
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

    // 2. Si hay conexión activa con Google Drive, subir mediante protocolo Resumible
    let driveSubfolder = null;
    const token = GoogleAuth.getAccessToken() || group.driveAccessToken;
    const parentFolderId = this.extractFolderId(group.driveFolderUrl || group.driveFolderId);

    if (token && parentFolderId && !token.startsWith('demo_')) {
      try {
        // Crear la subcarpeta "[Nombre] - [Fecha]" en Google Drive
        driveSubfolder = await DriveResumableUploader.createSubfolder(token, parentFolderId, subfolderName);

        // Subir cada archivo a la subcarpeta en chunks
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
      } catch (uploadErr) {
        console.warn('Sincronización con Google Drive diferida:', uploadErr);
      }
    }

    // Portada del recuerdo: usar la miniatura de la primera foto/video
    const coverThumbnail = processedFiles.find(f => f.thumbnail)?.thumbnail || '';

    // Registro del recuerdo listo para el almacén (sin objetos pesados en JSON)
    const memoryRecord = {
      id: memoryId,
      groupId: group.id,
      title: memoryPayload.title,
      date: memoryPayload.date,
      fullDateLabel: Utils.formatFullSpanishDate(memoryPayload.date),
      description: memoryPayload.description || '',
      authorId: memoryPayload.authorId,
      authorName: memoryPayload.authorName,
      subfolderName,
      driveSubfolderUrl: driveSubfolder?.webViewLink || '',
      coverThumbnail,
      files: processedFiles.map(f => ({
        id: f.id,
        name: f.name,
        type: f.type,
        size: f.size,
        isVideo: f.isVideo,
        thumbnail: f.thumbnail,
        driveViewLink: f.driveViewLink || ''
      })),
      createdAt: new Date().toISOString()
    };

    return memoryRecord;
  }
};
