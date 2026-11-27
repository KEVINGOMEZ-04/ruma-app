/**
 * ruma 🌟 — Motor Oficial de Subida a Google Drive (Google Drive API v3)
 *
 * - Para archivos <= 4.5 MB usa subida Multipart directa (evita bloqueos CORS y es instantánea).
 * - Para archivos pesados (> 4.5 MB, hasta 1 GB+) usa el protocolo Resumible en fragmentos de 5 MB
 *   con respaldo automático a subida directa si el navegador restringe cabeceras de sesión.
 * - Incluye soporte para Unidades Compartidas (supportsAllDrives=true).
 */

import { CONFIG } from '../core/config.js';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB por fragmento (múltiplo de 256 KB requerido por Google)
const MULTIPART_THRESHOLD = 4.5 * 1024 * 1024; // 4.5 MB
const DEFAULT_TIMEOUT_MS = 45000;
const CHUNK_TIMEOUT_MS = 120000;

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al conectar con Google Drive. Verifica tu conexión e inténtalo de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const DriveResumableUploader = {
  /**
   * Verifica que la carpeta exista y que la cuenta de Google conectada tenga acceso a ella
   */
  async verifyFolderAccess(accessToken, folderId) {
    if (!accessToken) throw new Error('Inicia sesión con tu cuenta de Google primero.');
    if (!folderId) throw new Error('ID de carpeta de Google Drive no válido.');

    const res = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,webViewLink,capabilities&supportsAllDrives=true`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `Código ${res.status}`;
      if (res.status === 404) {
        throw new Error('No se encontró la carpeta en Google Drive. Verifica que el enlace sea correcto y que tu cuenta de Google tenga acceso a esa carpeta.');
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Permiso denegado en Google Drive (${msg}). Vuelve a conectar tu cuenta de Google o verifica permisos de Editor en la carpeta.`);
      }
      throw new Error(`Error verificando carpeta de Drive: ${msg}`);
    }

    const data = await res.json();
    if (data.trashed) {
      throw new Error(`La carpeta "${data.name || folderId}" está en la papelera de Google Drive.`);
    }
    if (data.mimeType && data.mimeType !== 'application/vnd.google-apps.folder') {
      throw new Error(`El enlace proporcionado no corresponde a una carpeta de Google Drive ("${data.name || folderId}").`);
    }
    if (data.capabilities && data.capabilities.canAddChildren === false) {
      throw new Error(`Tu cuenta tiene acceso de solo lectura a la carpeta "${data.name}". Necesitas permisos de Editor para subir recuerdos.`);
    }

    return {
      id: data.id,
      name: data.name || 'Carpeta de Google Drive',
      webViewLink: data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`
    };
  },

  /**
   * Busca o crea la carpeta principal `Ruma 🌷` en la raíz del Google Drive del usuario
   * (compatible con el scope mínimo `drive.file`, sin duplicar carpetas).
   */
  async createRootGroupFolder(accessToken) {
    if (!accessToken) throw new Error('Inicia sesión con tu cuenta de Google primero.');
    const folderName = CONFIG.googleDrive?.rootFolderName || 'Ruma 🌷';
    const escapedName = folderName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = encodeURIComponent(`name = '${escapedName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);

    try {
      const searchRes = await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=5&supportsAllDrives=true&includeItemsFromAllDrives=true`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
      if (searchRes.ok) {
        const listData = await searchRes.json();
        const existing = Array.isArray(listData.files) && listData.files[0];
        if (existing?.id) {
          return {
            id: existing.id,
            name: existing.name || folderName,
            webViewLink: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`
          };
        }
      }
    } catch (_) {
      // Si la búsqueda falla de forma transitoria, continuar creando la carpeta
    }

    return this.createSubfolder(accessToken, '', folderName);
  },

  /**
   * Descarga el binario original (foto HD o vídeo) de un archivo guardado en Google Drive
   */
  async downloadFileBlob(accessToken, fileId) {
    if (!accessToken) throw new Error('Token de acceso a Google Drive requerido.');
    if (!fileId) throw new Error('ID de archivo de Google Drive no válido.');

    const res = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      },
      CHUNK_TIMEOUT_MS
    );

    if (!res.ok) {
      throw new Error(`No se pudo descargar el archivo desde Google Drive (HTTP ${res.status}).`);
    }

    return res.blob();
  },

  /**
   * Crea una subcarpeta dentro de la carpeta principal de Google Drive del grupo
   */
  async createSubfolder(accessToken, parentFolderId, folderName) {
    if (!accessToken) throw new Error('Token de acceso a Google Drive no proporcionado.');
    if (!folderName) throw new Error('Nombre de subcarpeta no válido.');

    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    };
    if (parentFolderId) {
      metadata.parents = [parentFolderId];
    }

    const res = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `No se pudo crear la subcarpeta en Google Drive (HTTP ${res.status}). Verifica que la carpeta exista y tengas permiso de Editor.`);
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      webViewLink: data.webViewLink || `https://drive.google.com/drive/folders/${data.id}`
    };
  },

  /**
   * Subida Multipart directa conforme al estándar `multipart/related` de Google Drive API v3 (archivos <= 4.5 MB)
   */
  async uploadMultipartFile(accessToken, folderId, file, onProgress = null) {
    const fileName = file.name || `archivo_${Date.now()}`;
    const fileMime = file.type || 'application/octet-stream';
    const fileSize = file.size || 0;

    if (typeof onProgress === 'function') {
      onProgress({ uploadedBytes: 0, totalBytes: fileSize, percent: 10, fileName });
    }

    const metadata = {
      name: fileName,
      parents: folderId ? [folderId] : []
    };

    const boundary = `ruma_drive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: ${fileMime}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`
    ], { type: `multipart/related; boundary=${boundary}` });

    const res = await fetchWithTimeout(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      },
      CHUNK_TIMEOUT_MS
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error subiendo "${fileName}" a Google Drive (HTTP ${res.status}).`);
    }

    const data = await res.json();
    if (typeof onProgress === 'function') {
      onProgress({ uploadedBytes: fileSize, totalBytes: fileSize, percent: 100, fileName });
    }

    return {
      id: data.id,
      name: data.name || fileName,
      size: fileSize,
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`
    };
  },

  /**
   * Sube un archivo de cualquier tamaño:
   * - Si pesa <= 4.5 MB, usa Multipart directo (`multipart/related`)
   * - Si pesa > 4.5 MB, usa protocolo Resumible por chunks de 5 MB con capacidad de pausa/reanudación
   *   desde el último byte confirmado (cabecera Range) si se cae el internet.
   */
  async uploadLargeFile(accessToken, folderId, file, onProgress = null, options = {}) {
    if (!accessToken) throw new Error('Token de acceso requerido.');
    if (!file) throw new Error('Archivo no válido.');

    const fileSize = file.size || 0;
    if (fileSize <= MULTIPART_THRESHOLD) {
      return this.uploadMultipartFile(accessToken, folderId, file, onProgress);
    }

    const fileMime = file.type || 'application/octet-stream';
    const fileName = file.name || `archivo_${Date.now()}`;
    let uploadUrl = options.resumeUrl || '';
    let startByte = 0;

    // Si existía una sesión resumible previa (por corte de internet), consultar en qué byte quedó
    if (uploadUrl) {
      try {
        const probeRes = await fetchWithTimeout(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes */${fileSize}`
          }
        });
        if (probeRes.status === 308) {
          const rangeHeader = probeRes.headers?.get?.('Range') || '';
          const match = rangeHeader.match(/bytes=0-(\d+)/i);
          startByte = match ? Math.min(fileSize, Number(match[1]) + 1) : 0;
        } else if (probeRes.ok) {
          const doneData = await probeRes.json();
          return {
            id: doneData.id,
            name: doneData.name || fileName,
            size: fileSize,
            webViewLink: doneData.webViewLink || `https://drive.google.com/file/d/${doneData.id}/view`
          };
        } else {
          // Sesión expirada o inválida -> iniciar sesión nueva desde 0
          uploadUrl = '';
          startByte = 0;
        }
      } catch (_) {
        // Si falla la red durante la sonda, propagar para pausar y reanudar cuando vuelva internet
        throw new Error('Conexión interrumpida. La carga se reanudará automáticamente cuando vuelva internet.');
      }
    }

    // 1. Iniciar la sesión de subida resumible en Google si no hay una sesión activa reutilizable
    if (!uploadUrl) {
      const initRes = await fetchWithTimeout(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': fileMime,
            'X-Upload-Content-Length': String(fileSize)
          },
          body: JSON.stringify({
            name: fileName,
            parents: folderId ? [folderId] : []
          })
        }
      );

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(err.error?.message || `No se pudo iniciar la sesión de subida con Google Drive (HTTP ${initRes.status}).`);
      }

      uploadUrl = initRes.headers.get('Location') || '';
      if (!uploadUrl) {
        throw new Error('Google Drive no devolvió la URL de sesión resumible para este archivo grande.');
      }
      if (typeof options.onSessionUrl === 'function') {
        try { options.onSessionUrl(uploadUrl); } catch (_) {}
      }
    }

    // 2. Subir el archivo en fragmentos (chunks) desde startByte
    while (startByte < fileSize) {
      const endByte = Math.min(startByte + CHUNK_SIZE, fileSize);
      const chunk = file.slice(startByte, endByte);

      const chunkRes = await fetchWithTimeout(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes ${startByte}-${endByte - 1}/${fileSize}`
        },
        body: chunk
      }, CHUNK_TIMEOUT_MS);

      if (chunkRes.status === 308) {
        const rangeHeader = chunkRes.headers?.get?.('Range') || '';
        const match = rangeHeader.match(/bytes=0-(\d+)/i);
        const acknowledgedNext = match ? Number(match[1]) + 1 : endByte;
        startByte = Math.max(startByte + 1, Math.min(fileSize, acknowledgedNext));
        if (typeof onProgress === 'function') {
          const percent = Math.round((startByte / fileSize) * 100);
          onProgress({
            uploadedBytes: startByte,
            totalBytes: fileSize,
            percent,
            fileName
          });
        }
      } else if (chunkRes.ok) {
        if (typeof options.onSessionUrl === 'function') {
          try { options.onSessionUrl(''); } catch (_) {}
        }
        const finalData = await chunkRes.json();
        if (typeof onProgress === 'function') {
          onProgress({
            uploadedBytes: fileSize,
            totalBytes: fileSize,
            percent: 100,
            fileName
          });
        }
        return {
          id: finalData.id,
          name: finalData.name || fileName,
          size: fileSize,
          webViewLink: finalData.webViewLink || `https://drive.google.com/file/d/${finalData.id}/view`
        };
      } else {
        const errData = await chunkRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Error durante la transferencia del archivo a Google Drive (HTTP ${chunkRes.status}).`);
      }
    }

    throw new Error('La subida resumible a Google Drive terminó sin confirmación del servidor.');
  }
};
