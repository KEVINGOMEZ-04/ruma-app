/**
 * ruma 🌟 — Motor Oficial de Subida a Google Drive (Google Drive API v3)
 *
 * - Para archivos <= 4.5 MB usa subida Multipart directa (evita bloqueos CORS y es instantánea).
 * - Para archivos pesados (> 4.5 MB, hasta 1 GB+) usa el protocolo Resumible en fragmentos de 5 MB
 *   con respaldo automático a subida directa si el navegador restringe cabeceras de sesión.
 * - Incluye soporte para Unidades Compartidas (supportsAllDrives=true).
 */

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB por fragmento (múltiplo de 256 KB requerido por Google)
const MULTIPART_THRESHOLD = 4.5 * 1024 * 1024; // 4.5 MB

export const DriveResumableUploader = {
  /**
   * Verifica que la carpeta exista y que la cuenta de Google conectada tenga acceso a ella
   */
  async verifyFolderAccess(accessToken, folderId) {
    if (!accessToken) throw new Error('Inicia sesión con tu cuenta de Google primero.');
    if (!folderId) throw new Error('ID de carpeta de Google Drive no válido.');

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,webViewLink,capabilities&supportsAllDrives=true`,
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
   * Crea una carpeta nueva en la raíz de Google Drive del usuario si aún no tiene una
   */
  async createRootGroupFolder(accessToken, groupName = 'ruma') {
    const folderName = `ruma 🌟 — ${groupName}`;
    return this.createSubfolder(accessToken, '', folderName);
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

    const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,webViewLink', {
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
   * Subida Multipart directa en 1 petición (rápida y sin preflight complejo para fotos y videos medianos)
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

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file, fileName);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      }
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
   * - Si pesa <= 4.5 MB, usa Multipart directo
   * - Si pesa > 4.5 MB, usa protocolo Resumible por chunks de 5 MB (con fallback a Multipart)
   */
  async uploadLargeFile(accessToken, folderId, file, onProgress = null) {
    if (!accessToken) throw new Error('Token de acceso requerido.');
    if (!file) throw new Error('Archivo no válido.');

    const fileSize = file.size || 0;
    if (fileSize <= MULTIPART_THRESHOLD) {
      return this.uploadMultipartFile(accessToken, folderId, file, onProgress);
    }

    const fileMime = file.type || 'application/octet-stream';
    const fileName = file.name || `archivo_${Date.now()}`;

    try {
      // 1. Iniciar la sesión de subida resumible en Google
      const initRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
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
        throw new Error(err.error?.message || 'No se pudo iniciar la sesión de subida con Google Drive.');
      }

      const uploadUrl = initRes.headers.get('Location');
      if (!uploadUrl) {
        return this.uploadMultipartFile(accessToken, folderId, file, onProgress);
      }

      // 2. Subir el archivo en fragmentos (chunks)
      let startByte = 0;

      while (startByte < fileSize) {
        const endByte = Math.min(startByte + CHUNK_SIZE, fileSize);
        const chunk = file.slice(startByte, endByte);

        const chunkRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${startByte}-${endByte - 1}/${fileSize}`
          },
          body: chunk
        });

        if (chunkRes.status === 308) {
          startByte = endByte;
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
            name: finalData.name,
            size: fileSize,
            webViewLink: `https://drive.google.com/file/d/${finalData.id}/view`
          };
        } else {
          const errData = await chunkRes.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Error durante la transferencia del archivo a Google Drive.');
        }
      }
    } catch (resumableErr) {
      console.warn('Reintentando subida mediante Multipart directo:', resumableErr);
      return this.uploadMultipartFile(accessToken, folderId, file, onProgress);
    }
  }
};
