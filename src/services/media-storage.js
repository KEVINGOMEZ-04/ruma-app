/**
 * ruma 🌟 — Motor de Almacenamiento Binario Local (IndexedDB)
 *
 * Diseñado específicamente para:
 * 1. Fotografías pesadas de 100 MB o más (RAW, ProRAW, alta resolución)
 * 2. Videos de 1 GB o más (4K, 60fps) sin consumir memoria RAM del navegador
 * 3. Reproducción instantánea con streaming nativo de hardware (URL.createObjectURL)
 * 4. Extracción automática de fotogramas para miniaturas de video
 */

const DB_NAME = 'ruma_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'media_blobs';

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('groupId', 'groupId', { unique: false });
        store.createIndex('memoryId', 'memoryId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    req.onerror = (e) => {
      console.error('Error abriendo IndexedDB ruma_media_db:', e.target.error);
      reject(e.target.error);
    };
  });
}

export const MediaStorage = {
  /**
   * Guarda un archivo binario (File o Blob) en el disco del dispositivo sin cargarlo a RAM.
   * Soporta archivos de más de 1 GB.
   */
  async saveMedia(id, fileOrBlob, metadata = {}) {
    if (!id || !fileOrBlob) throw new Error('ID y archivo binario son obligatorios.');

    const db = await openDB();
    const isVideo = fileOrBlob.type ? fileOrBlob.type.startsWith('video/') : false;

    // Generar miniatura liviana para renderizado instantáneo en listas
    let thumbnailDataUrl = '';
    try {
      if (isVideo) {
        thumbnailDataUrl = await this.generateVideoThumbnail(fileOrBlob);
      } else if (fileOrBlob.type && fileOrBlob.type.startsWith('image/')) {
        thumbnailDataUrl = await this.generateImageThumbnail(fileOrBlob, 1200);
      }
    } catch (err) {
      console.warn('No se pudo generar miniatura previa:', err);
    }

    const record = {
      id,
      blob: fileOrBlob,
      name: metadata.name || fileOrBlob.name || 'archivo',
      type: fileOrBlob.type || (isVideo ? 'video/mp4' : 'application/octet-stream'),
      size: fileOrBlob.size || 0,
      isVideo,
      thumbnail: thumbnailDataUrl,
      groupId: metadata.groupId || '',
      memoryId: metadata.memoryId || '',
      createdAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve(record);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Obtiene el registro binario completo de un archivo por su ID
   */
  async getMedia(id) {
    if (!id) return null;
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Crea una URL de streaming directa para reproducir videos o ver fotos en alta definición
   * directamente desde el disco sin pasar por la memoria del navegador.
   */
  async createMediaStreamUrl(id) {
    const item = await this.getMedia(id);
    if (!item || !item.blob) return null;
    return URL.createObjectURL(item.blob);
  },

  async getObjectUrl(id) {
    return this.createMediaStreamUrl(id);
  },

  /**
   * Libera la URL de streaming de la memoria cuando se cierra el reproductor
   */
  revokeMediaStreamUrl(url) {
    if (url && typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  },

  /**
   * Elimina un archivo binario del almacenamiento local
   */
  async deleteMedia(id) {
    if (!id) return;
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * Elimina múltiples archivos locales en paralelo ignorando fallos puntuales.
   */
  async deleteMediaBatch(ids = []) {
    const clean = (ids || []).filter(Boolean);
    if (!clean.length) return;
    await Promise.allSettled(clean.map(id => this.deleteMedia(id)));
  },

  /**
   * Guarda un adjunto de chat (dataUrl o blob) en IndexedDB para no saturar localStorage.
   */
  async saveChatMedia(id, payload = {}) {
    if (!id || !payload.dataUrl) return null;
    try {
      const db = await openDB();
      const record = {
        id,
        dataUrl: payload.dataUrl,
        type: payload.type || 'image',
        name: payload.name || '',
        duration: payload.duration || '',
        groupId: payload.groupId || '',
        isChatMedia: true,
        createdAt: payload.createdAt || Date.now()
      };
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve(record);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.warn('No se pudo cachear adjunto del chat en IndexedDB:', err);
      return null;
    }
  },

  /**
   * Recupera un adjunto de chat cacheado localmente en IndexedDB.
   */
  async getChatMedia(id) {
    if (!id) return null;
    try {
      const item = await this.getMedia(id);
      return item && item.dataUrl ? item : null;
    } catch (_) {
      return null;
    }
  },

  /**
   * Extrae un fotograma del video en el segundo 0.5 para usarlo como póster de portada (compatible con iOS Safari)
   */
  generateVideoThumbnail(videoFile) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      const objUrl = URL.createObjectURL(videoFile);
      let settled = false;
      let timer = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        URL.revokeObjectURL(objUrl);
        video.removeAttribute('src');
        try { video.load(); } catch (_) {}
        resolve(result);
      };

      const seekToPreview = () => {
        if (settled) return;
        try {
          const target = Math.min(0.5, (video.duration && isFinite(video.duration)) ? video.duration / 2 : 0.2);
          if (Math.abs(video.currentTime - target) < 0.05) {
            captureFrame();
          } else {
            video.currentTime = target;
          }
        } catch (_) {
          captureFrame();
        }
      };

      const captureFrame = () => {
        if (settled) return;
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 800;
          let w = video.videoWidth || 640;
          let h = video.videoHeight || 360;

          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }

          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, w, h);
          finish(canvas.toDataURL('image/jpeg', 0.82));
        } catch (_) {
          finish('');
        }
      };

      video.onloadedmetadata = seekToPreview;
      video.onloadeddata = seekToPreview;
      video.onseeked = captureFrame;
      video.onerror = () => finish('');

      timer = setTimeout(() => finish(''), 4000);
      video.src = objUrl;
      try { video.load(); } catch (_) {}
    });
  },

  /**
   * Genera una miniatura comprimida para imágenes gigantes de 100 MB (optimizada para iPhone)
   */
  generateImageThumbnail(imageFile, maxDimension = 1200) {
    return new Promise((resolve) => {
      const img = new Image();
      const objUrl = URL.createObjectURL(imageFile);
      let settled = false;
      let timer = null;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        URL.revokeObjectURL(objUrl);
        resolve(result);
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;

          if (w > maxDimension || h > maxDimension) {
            if (w > h) {
              h = Math.round((h * maxDimension) / w);
              w = maxDimension;
            } else {
              w = Math.round((w * maxDimension) / h);
              h = maxDimension;
            }
          }

          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/jpeg', 0.84));
        } catch (_) {
          finish('');
        }
      };

      img.onerror = () => finish('');
      timer = setTimeout(() => finish(''), 4000);
      img.src = objUrl;
    });
  }
};
