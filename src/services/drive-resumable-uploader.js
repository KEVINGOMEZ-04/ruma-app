/**
 * ruma 🌟 — Motor Oficial de Subida Resumible a Google Drive (Google Drive API v3)
 *
 * Cumple con la especificación de Google para archivos gigantes:
 * - Soporta fotos de 100 MB y videos de más de 1 GB
 * - Fragmentación en bloques (chunks de 5 MB) requeridos por Google
 * - Si se corta la conexión, reanuda desde el último byte recibido
 * - Creación automática de subcarpetas "[Nombre] - [Día y Fecha en español]"
 */

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB por fragmento (múltiplo de 256 KB requerido por Google)

export const DriveResumableUploader = {
  /**
   * Crea una subcarpeta dentro de la carpeta principal de Google Drive del grupo
   */
  async createSubfolder(accessToken, parentFolderId, folderName) {
    if (!accessToken) throw new Error('Token de acceso a Google Drive no proporcionado.');
    if (!folderName) throw new Error('Nombre de subcarpeta no válido.');

    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentFolderId ? [parentFolderId] : []
    };

    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Error al crear la subcarpeta en Google Drive.');
    }

    const data = await res.json();
    return {
      id: data.id,
      name: data.name,
      webViewLink: `https://drive.google.com/drive/folders/${data.id}`
    };
  },

  /**
   * Sube un archivo de cualquier tamaño (100 MB a varios GB) mediante el protocolo Resumible oficial
   * @param {string} accessToken - Token de autorización OAuth 2.0 (drive.file)
   * @param {string} folderId - ID de la carpeta donde se guardará
   * @param {File|Blob} file - Archivo binario pesado
   * @param {Function} onProgress - Callback con porcentaje y bytes subidos
   */
  async uploadLargeFile(accessToken, folderId, file, onProgress = null) {
    if (!accessToken) throw new Error('Token de acceso requerido.');
    if (!file) throw new Error('Archivo no válido.');

    const fileSize = file.size;
    const fileMime = file.type || 'application/octet-stream';
    const fileName = file.name || `archivo_${Date.now()}`;

    // 1. Iniciar la sesión de subida resumible en Google
    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': fileMime,
        'X-Upload-Content-Length': String(fileSize)
      },
      body: JSON.stringify({
        name: fileName,
        parents: folderId ? [folderId] : []
      })
    });

    if (!initRes.ok) {
      const err = await initRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'No se pudo iniciar la sesión de subida con Google Drive.');
    }

    // La URL de subida resumible devuelta por Google en el header Location
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error('Google no devolvió la URL de subida resumible.');

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

      // 308 Resume Incomplete significa que Google recibió el fragmento y espera el siguiente
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
        // Subida completada con éxito (código 200 o 201)
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
        // En caso de corte, consultar a Google cuántos bytes recibió para reanudar
        const resumeStatus = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes */${fileSize}`
          }
        });

        if (resumeStatus.status === 308) {
          const rangeHeader = resumeStatus.headers.get('Range');
          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=0-(\d+)/);
            if (match && match[1]) {
              startByte = parseInt(match[1], 10) + 1;
              continue;
            }
          }
        }

        const errData = await chunkRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Error durante la transferencia del archivo a Google Drive.');
      }
    }
  }
};
