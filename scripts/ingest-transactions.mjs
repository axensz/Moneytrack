/**
 * Ingesta local de transacciones como candidatos pendientes (Opción C).
 *
 * En vez de una API HTTP en Cloud Functions (que requiere plan Blaze), este
 * script corre en tu máquina con el token del CLI de Firebase ya logueado y
 * escribe candidatos directo en Firestore por REST. Reutiliza la lógica pura
 * de functions/lib/src/ingest/ingestCore.js (misma validación, conversión
 * pesos→minor, resolución de cuenta por nombre, idempotencia y shape EXACTO del
 * candidato android-shortcut que tu inbox ya sabe revisar y confirmar).
 *
 * NO mueve saldos: solo crea candidatos "pending". La confirmación manual en la
 * app sigue siendo el único paso que crea la transacción real.
 *
 * Uso:
 *   node scripts/ingest-transactions.mjs <lote.json>            # DRY RUN (no escribe)
 *   node scripts/ingest-transactions.mjs <lote.json> --apply    # escribe de verdad
 *
 * El <lote.json> tiene el mismo cuerpo del contrato OpenAPI, por ejemplo:
 *   {
 *     "batch": { "idempotencyKey": "2026-11-07-nu", "source": "api", "defaultCurrency": "COP" },
 *     "transactions": [
 *       { "type": "expense", "amount": 25990, "merchant": "Rappi",
 *         "occurredAt": "2026-11-05T14:30:00-05:00",
 *         "suggestedCategory": "Domicilios", "suggestedAccountName": "Nu",
 *         "externalId": "nu-txn-8842" }
 *     ]
 *   }
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  parseIngestRequest,
  ingestBatchCore,
} from '../functions/lib/src/ingest/ingestCore.js';

// Tu proyecto y usuario reales (mismos que usa scripts/import-nu-statement.mjs).
const PROJECT_ID = 'moneytrack-889fe';
const USER_ID = 'odx26xxngwSK3fDQr74bO6m5d273';

const firestoreBase = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

const documentId = (name) => name.split('/').at(-1);

// ── Auth: reutiliza la sesión del CLI de Firebase (firebase login) ──────────
async function readFirebaseCliAccessToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!config.tokens?.access_token || Number(config.tokens.expires_at) <= Date.now() + 60_000) {
    throw new Error('La sesión de Firebase CLI expiró. Ejecuta `firebase projects:list` y reintenta.');
  }
  return config.tokens.access_token;
}

async function firestoreFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Firestore ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// ── Lectura de cuentas (para resolver suggestedAccountName -> id) ───────────
async function listAccounts(token) {
  const accounts = [];
  let pageToken = null;
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const url = `${firestoreBase(PROJECT_ID)}/users/${USER_ID}/accounts?${query}`;
    const page = await firestoreFetch(url, token);
    for (const doc of page.documents ?? []) {
      const name = doc.fields?.name?.stringValue ?? '';
      if (name) accounts.push({ id: documentId(doc.name), name });
    }
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);
  return accounts;
}

// ── Deps inyectables para ingestBatchCore ───────────────────────────────────
const buildAccountLookup = (accounts) => ({
  async list() {
    return accounts;
  },
});

const candidatePath = (candidateId) =>
  `users/${USER_ID}/transactionImportCandidates/${candidateId}`;

// Escribe el candidato con el shape EXACTO android-shortcut (schemaVersion 3).
// createdAt se fija al momento del commit (equivalente al server timestamp para
// un candidato ya aceptado por el decoder). currentDocument.exists=false => no
// sobreescribe duplicados a nivel servidor.
const buildCandidateStore = (token, dryRun, plannedWrites) => ({
  async exists(candidateId) {
    const url = `${firestoreBase(PROJECT_ID)}/${candidatePath(candidateId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`Firestore ${res.status}: ${await res.text()}`);
    return true;
  },
  async create(candidateId, candidate, createdAt) {
    const fields = {
      schemaVersion: { integerValue: String(candidate.schemaVersion) },
      source: { stringValue: candidate.source },
      occurredAt: { timestampValue: candidate.occurredAt.toISOString() },
      amountMinor: { integerValue: String(candidate.amountMinor) },
      currency: { stringValue: candidate.currency },
      merchant: { stringValue: candidate.merchant },
      suggestedAccountId: { stringValue: candidate.suggestedAccountId },
      suggestedCategory: { stringValue: candidate.suggestedCategory },
      status: { stringValue: candidate.status },
      createdAt: { timestampValue: createdAt.toISOString() },
    };
    plannedWrites.push({
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/${candidatePath(candidateId)}`,
        fields,
      },
      currentDocument: { exists: false },
    });
  },
});

const clock = { now: () => new Date() };

// ── Entry point ──────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const file = argv.find((arg) => !arg.startsWith('--'));
  if (!file) {
    throw new Error('Falta el archivo de lote. Uso: node scripts/ingest-transactions.mjs <lote.json> [--apply]');
  }

  const raw = JSON.parse(await readFile(file, 'utf8'));
  // Valida el body con el MISMO parser del core (1..100 ítems, claves exactas).
  const request = parseIngestRequest(raw);

  const token = await readFirebaseCliAccessToken();
  const accounts = await listAccounts(token);

  const plannedWrites = [];
  const result = await ingestBatchCore(
    request,
    {
      accounts: buildAccountLookup(accounts),
      store: buildCandidateStore(token, !apply, plannedWrites),
      clock,
    },
    USER_ID,
  );

  // Resumen (igual que la respuesta de la API).
  console.log(`\nLote: ${result.batchId}`);
  console.log(`Recibidos: ${result.received} | Creados: ${result.created} | Omitidos (dup): ${result.skipped} | Rechazados: ${result.failed}`);
  for (const c of result.candidates) {
    console.log(`  CREAR  ${c.occurredAt.toISOString().slice(0, 10)} | $${(c.amountMinor / 100).toLocaleString('es-CO')} | ${c.merchant} | ${c.suggestedCategory} | cuenta=${c.suggestedAccountId} | id=${c.id.slice(0, 12)}…`);
  }
  for (const w of result.warnings) {
    console.log(`  WARN   [#${w.index}${w.externalId ? ` ${w.externalId}` : ''}] ${w.code}: ${w.message}`);
  }

  if (!apply) {
    console.log(`\nDRY RUN: no se escribió nada. ${plannedWrites.length} candidato(s) listo(s) para crear.`);
    console.log('Vuelve a correr con --apply para escribirlos en Firestore.');
    return;
  }

  if (plannedWrites.length === 0) {
    console.log('\nNada que escribir (todo omitido o rechazado).');
    return;
  }

  // Commit atómico por REST (:commit), mismo endpoint que import-nu-statement.
  await firestoreFetch(`${firestoreBase(PROJECT_ID)}:commit`, token, {
    method: 'POST',
    body: JSON.stringify({ writes: plannedWrites }),
  });
  console.log(`\nAPLICADO: ${plannedWrites.length} candidato(s) creado(s). Revísalos en la app (bandeja de importación) para confirmarlos.`);
}

// Solo corre como script, no al importarlo (para poder testear las funciones).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
