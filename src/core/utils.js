/**
 * ruma 🌟 — Utilidades de Formato, Compresión y Fechas para Google Drive
 */

export const Utils = {
  generateId(prefix = 'ruma') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  },

  generateGroupCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  sanitize(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  /**
   * Genera el formato exacto de fecha en español para la carpeta de Google Drive:
   * Ej: "Domingo 15 de noviembre de 2026"
   */
  formatFullSpanishDate(dateInput) {
    const d = dateInput ? new Date(dateInput.includes('T') ? dateInput : `${dateInput}T12:00:00`) : new Date();
    if (isNaN(d.getTime())) return String(dateInput || '');
    const formatted = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(d);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1).replace(',', '');
  },

  /**
   * Construye el nombre oficial de la subcarpeta en Google Drive:
   * "[Nombre del Recuerdo] - [Día DD de mes de YYYY]"
   */
  buildDriveSubfolderName(memoryTitle, dateInput) {
    const cleanTitle = (memoryTitle || 'Recuerdo').trim();
    const fullDate = this.formatFullSpanishDate(dateInput);
    return `${cleanTitle} - ${fullDate}`;
  },

  formatShortDate(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  },

  formatTime(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  },

  async fileToPreviewDataUrl(file, maxDimension = 900, quality = 0.72) {
    if (!file) return '';
    if (!file.type || !file.type.startsWith('image/')) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(e.target.result || '');
        img.src = e.target.result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }
};
