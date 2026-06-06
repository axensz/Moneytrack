#!/usr/bin/env node
/**
 * Inyecta la versión del build en public/sw.js (S9).
 *
 * El Service Worker usa CACHE_VERSION para nombrar sus cachés y limpiar los viejos
 * en el evento 'activate'. Si la versión es estática, un deploy nuevo puede seguir
 * sirviendo assets del build anterior hasta que el usuario vacíe la caché.
 *
 * Fuentes de versión (en orden de prioridad):
 *   1. Variable de entorno BUILD_HASH  → inyectada por CI con $GITHUB_SHA (40 chars; se corta a 7)
 *   2. `git rev-parse --short HEAD`    → entorno local con git disponible
 *   3. Timestamp ISO                   → fallback sin git
 *
 * El script reemplaza la línea `const CACHE_VERSION = '...'` en public/sw.js con el
 * nuevo valor `v3-<hash>`. Es idempotente: ejecutarlo dos veces con el mismo commit
 * produce el mismo resultado.
 *
 * Uso:
 *   node scripts/inject-sw-version.mjs            # local
 *   BUILD_HASH=$GITHUB_SHA node scripts/inject-sw-version.mjs  # CI
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SW_PATH = join(__dirname, '..', 'public', 'sw.js');
const VERSION_RE = /const CACHE_VERSION = '[^']+'/;

// 1. BUILD_HASH env var (CI)
let hash = process.env.BUILD_HASH
  ? process.env.BUILD_HASH.slice(0, 7)
  : null;

// 2. git short hash (local dev)
if (!hash) {
  try {
    hash = execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // 3. Timestamp fallback
    hash = new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 14);
  }
}

const version = `v3-${hash}`;

const sw = readFileSync(SW_PATH, 'utf-8');

if (!VERSION_RE.test(sw)) {
  console.error(
    `[inject-sw-version] ERROR: 'const CACHE_VERSION' not found in ${SW_PATH}`,
  );
  process.exit(1);
}

const updated = sw.replace(VERSION_RE, `const CACHE_VERSION = '${version}'`);
writeFileSync(SW_PATH, updated, 'utf-8');
console.log(`[inject-sw-version] CACHE_VERSION → ${version}`);
