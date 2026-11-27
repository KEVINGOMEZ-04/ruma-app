#!/usr/bin/env node
/**
 * ruma — Script de Contención (Fase 0): Respaldo local y purga de contraseñas en texto plano en Firebase RTDB
 *
 * Uso seguro:
 *   node scripts/purge-plaintext-passwords.mjs                  # Modo simulación (--dry-run), no modifica nada
 *   node scripts/purge-plaintext-passwords.mjs --apply          # Crea respaldo local cifrado/JSON y purga campo `password`
 *
 * Opcional (recomendado cuando las reglas ya estén cerradas):
 *   FIREBASE_RTDB_AUTH=<token_admin_o_oauth> node scripts/purge-plaintext-passwords.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DB_URL = (process.env.FIREBASE_DATABASE_URL || 'https://luma-f53ee-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const ROOT_PATH = (process.env.FIREBASE_ROOT_PATH || 'ruma_cloud_v1').replace(/^\/+|\/+$/g, '');
const AUTH_TOKEN = (process.env.FIREBASE_RTDB_AUTH || '').trim();
const APPLY = process.argv.includes('--apply');

function buildUrl(subPath) {
  const clean = subPath.startsWith('/') ? subPath : `/${subPath}`;
  const qs = AUTH_TOKEN ? `?access_token=${encodeURIComponent(AUTH_TOKEN)}` : '';
  return `${DB_URL}/${ROOT_PATH}${clean}${qs}`;
}

function hashPbkdf2(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(String(plain), salt, 120000, 32, 'sha256');
  return `pbkdf2_sha256$120000$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function main() {
  console.log(`\n[ruma Fase 0] Conectando a ${DB_URL}/${ROOT_PATH} (${APPLY ? 'APLICAR CAMBIOS' : 'SIMULACIÓN --dry-run'})`);

  const res = await fetch(buildUrl('/accounts.json'));
  if (!res.ok) {
    console.error(`Error leyendo /accounts.json: HTTP ${res.status}`);
    process.exit(1);
  }
  const accountsMap = await res.json();
  if (!accountsMap || typeof accountsMap !== 'object') {
    console.log('No se encontraron cuentas en /accounts.');
    return;
  }

  const entries = Object.entries(accountsMap);
  const affected = entries.filter(([, acc]) => acc && typeof acc.password === 'string' && acc.password.length > 0);

  console.log(`Total de cuentas analizadas: ${entries.length}`);
  console.log(`Cuentas con contraseña en texto plano detectadas: ${affected.length}`);

  if (affected.length === 0) {
    console.log('✅ No quedan contraseñas en texto plano en /accounts.');
    return;
  }

  if (!APPLY) {
    console.log('\nIDs afectados (sin imprimir contraseñas ni PII):');
    affected.forEach(([key]) => console.log(`  - ${key}`));
    console.log('\nPara respaldar y purgar definitivamente el campo `password`, ejecuta:');
    console.log('  node scripts/purge-plaintext-passwords.mjs --apply\n');
    return;
  }

  // Respaldo local fuera de Git (carpeta .backups ignorada)
  const backupDir = path.resolve(process.cwd(), '.backups');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `accounts-pre-purge-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(accountsMap, null, 2), { mode: 0o600 });
  console.log(`💾 Respaldo guardado localmente (permisos 0600): ${backupPath}`);

  let migrated = 0;
  for (const [key, acc] of affected) {
    const patch = {
      password: null, // DELETE en RTDB PATCH
      passwordHash: acc.passwordHash || hashPbkdf2(acc.password),
      requiresPasswordReset: true,
      updatedAt: new Date().toISOString()
    };

    const patchRes = await fetch(buildUrl(`/accounts/${encodeURIComponent(key)}.json`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });

    if (!patchRes.ok) {
      console.error(`❌ Error purgando cuenta ${key}: HTTP ${patchRes.status}`);
    } else {
      migrated += 1;
      console.log(`✅ Purgado campo password en ${key} (hash PBKDF2 aplicado)`);
    }
  }

  console.log(`\nResultado: ${migrated}/${affected.length} cuentas saneadas.`);
  console.log('⚠️ Siguiente paso obligatorio: desplegar `database.rules.json` en Firebase Console para cerrar el acceso público.\n');
}

main().catch((err) => {
  console.error('Fallo inesperado:', err);
  process.exit(1);
});
