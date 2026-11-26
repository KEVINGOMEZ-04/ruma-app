/**
 * ruma 🌟 — Utilidades Criptográficas para Autenticación Segura
 *
 * - Hash de contraseñas y códigos de recuperación con PBKDF2-SHA256 (Web Crypto API)
 *   + salt aleatorio de 16 bytes por credencial.
 * - Migración transparente desde cuentas legacy con contraseña en texto plano.
 * - Generación criptográfica de códigos de recuperación personales (RUMA-XXXX-XXXX).
 */

const PBKDF2_ITERATIONS = 100000;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '').trim();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function randomBytes(length = 16) {
  const buf = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return buf;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Fallback SHA-256 puro en JS para contextos HTTP no seguros (ej. pruebas locales por IP sin HTTPS)
function sha256FallbackHex(message) {
  const utf8 = unescape(encodeURIComponent(String(message)));
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  const rrot = (n, x) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[offset + i * 4] << 24) |
        (bytes[offset + i * 4 + 1] << 16) |
        (bytes[offset + i * 4 + 2] << 8) |
        (bytes[offset + i * 4 + 3]);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rrot(7, w[i - 15]) ^ rrot(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rrot(17, w[i - 2]) ^ rrot(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rrot(6, e) ^ rrot(11, e) ^ rrot(25, e);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rrot(2, a) ^ rrot(13, a) ^ rrot(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

async function derivePbkdf2Hex(plain, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(plain)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export const CryptoAuth = {
  /**
   * Genera un hash seguro con salt aleatorio para contraseñas o códigos de recuperación.
   */
  async hashSecret(plain) {
    const raw = String(plain || '');
    const salt = randomBytes(16);
    const saltHex = bytesToHex(salt);

    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      try {
        const hashHex = await derivePbkdf2Hex(raw, salt, PBKDF2_ITERATIONS);
        return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
      } catch (_) {
        // Fallback si el navegador restringe subtle en un contexto no seguro
      }
    }

    // Iteración ligera con SHA-256 fallback para contextos HTTP sin crypto.subtle
    let digest = sha256FallbackHex(`${saltHex}:${raw}`);
    for (let i = 0; i < 64; i++) {
      digest = sha256FallbackHex(`${saltHex}:${digest}:${raw}`);
    }
    return `sha256_v1$${saltHex}$${digest}`;
  },

  /**
   * Verifica un secreto en texto plano contra un hash almacenado.
   */
  async verifySecret(plain, storedHash) {
    if (!storedHash || typeof storedHash !== 'string') return false;
    const raw = String(plain || '');
    const parts = storedHash.split('$');

    if (parts[0] === 'pbkdf2_sha256' && parts.length === 4) {
      const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
      const saltHex = parts[2];
      const expectedHex = parts[3];
      if (typeof crypto === 'undefined' || !crypto.subtle) return false;
      try {
        const derived = await derivePbkdf2Hex(raw, hexToBytes(saltHex), iterations);
        return timingSafeEqualHex(derived, expectedHex);
      } catch (_) {
        return false;
      }
    }

    if (parts[0] === 'sha256_v1' && parts.length === 3) {
      const saltHex = parts[1];
      const expectedHex = parts[2];
      let digest = sha256FallbackHex(`${saltHex}:${raw}`);
      for (let i = 0; i < 64; i++) {
        digest = sha256FallbackHex(`${saltHex}:${digest}:${raw}`);
      }
      return timingSafeEqualHex(digest, expectedHex);
    }

    return false;
  },

  /**
   * Verifica la contraseña de una cuenta soportando migración automática desde formato legacy.
   */
  async verifyAccountPassword(plainPassword, account) {
    if (!account) return { valid: false, needsMigration: false };
    const candidate = String(plainPassword || '');

    if (account.passwordHash) {
      const valid = await this.verifySecret(candidate, account.passwordHash);
      return { valid, needsMigration: Boolean(valid && account.password !== undefined) };
    }

    // Compatibilidad temporal con cuentas antiguas creadas antes del hashing
    if (typeof account.password === 'string' && account.password.length > 0) {
      const valid = account.password === candidate;
      return { valid, needsMigration: valid };
    }

    return { valid: false, needsMigration: false };
  },

  /**
   * Genera un código de recuperación legible de 8 caracteres (ej. RUMA-4K9P-7M2X).
   */
  generateRecoveryCode() {
    const rnd = randomBytes(8);
    let chars = '';
    for (let i = 0; i < 8; i++) {
      chars += RECOVERY_ALPHABET[rnd[i] % RECOVERY_ALPHABET.length];
    }
    return `RUMA-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
  },

  normalizeRecoveryCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  },

  /**
   * Indica si el toggle libre de ruma Plus para pruebas está permitido en este entorno.
   */
  isBetaSelfUpgradeAllowed() {
    try {
      if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return true;
      return typeof localStorage !== 'undefined' && localStorage.getItem('ruma_dev_tools') === '1';
    } catch (_) {
      return false;
    }
  }
};
