import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildCommitWrites,
  decodeFirestoreFields,
} from './import-nu-statement.mjs';

// ---------------------------------------------------------------------------
// Constantes del proyecto (verificadas por el orquestador, no re-descubrir).
// ---------------------------------------------------------------------------
const PROJECT_ID = 'moneytrack-889fe';
const USER_ID = 'odx26xxngwSK3fDQr74bO6m5d273';
const NU_ACCOUNT_ID = 'fypW7v10sCLqYR8hNbCc';
const NU_ACCOUNT_NAME = 'Nu Crédito';
const NU_INTEREST_RATE = 23.99;
const EXPECTED_CURRENT_USED_CREDIT = 3_334_656.70;
const EXPECTED_RESULTING_USED_CREDIT = 2_846_136.70;

// ---------------------------------------------------------------------------
// Tabla de categorías EDITABLE. Ajusta aquí si cambia el criterio del usuario.
// El criterio sigue el historial ya cargado del usuario.
// ---------------------------------------------------------------------------
const CATEGORIES = {
  transporte: 'Transporte',
  alimentacion: 'Alimentación',
  salud: 'Salud',
  servicios: 'Servicios',
  entretenimiento: 'Entretenimiento',
  educacion: 'Educación',
  comprasPersonales: 'Compras Personales',
  pagoCredito: 'Pago Crédito',
};

// ---------------------------------------------------------------------------
// Los 39 movimientos del extracto de octubre 2026 (tarjeta Nu Crédito).
// [fecha, descripcion, monto COP total, categoria, tipo, cuotas]
// tipo por defecto 'expense'; cuotas por defecto 1. amount es el VALOR TOTAL.
// ---------------------------------------------------------------------------
const C = CATEGORIES;
const OCT_MOVEMENTS = [
  ['2026-10-27', 'Gracias por tu pago', 1_700_000, C.pagoCredito, 'income'],
  ['2026-10-26', 'Uber Rides*Dl', 3_918, C.transporte],
  ['2026-10-26', 'Uber Rides*Dl', 3_909, C.transporte],
  ['2026-10-25', 'Uber Rides*Dl', 23_944, C.transporte],
  ['2026-10-25', 'Uber Rides', 6_955, C.transporte],
  ['2026-10-24', 'Bold Sa*Dolcesal', 96_000, C.alimentacion],
  ['2026-10-23', 'Uber Rides*Dl', 10_954, C.transporte],
  ['2026-10-23', 'Uber Rides', 5_011, C.transporte],
  ['2026-10-22', 'Uber Rides', 5_953, C.transporte],
  ['2026-10-20', 'Supermercado la Chinca', 7_800, C.alimentacion],
  ['2026-10-17', 'Uber Rides*Dl', 21_946, C.transporte],
  ['2026-10-17', 'Uber Rides*Dl', 14_931, C.transporte],
  ['2026-10-17', 'Sr Wok Plaza Fabricato', 52_900, C.alimentacion],
  ['2026-10-16', 'Uber Rides*Dl', 3_917, C.transporte],
  ['2026-10-15', 'Drogueria Cruz', 17_900, C.salud],
  ['2026-10-15', 'Gomez Y Corrales', 130_000, C.comprasPersonales],
  ['2026-10-15', 'Euro Supermercado Niqu', 5_900, C.alimentacion],
  ['2026-10-14', 'Uber Rides', 3_903, C.transporte],
  ['2026-10-14', 'Comcel Pago de Factura', 102_993, C.servicios],
  ['2026-10-14', 'Google Play Youtube', 20_000, C.entretenimiento],
  ['2026-10-14', 'Rebaja Plus No 3 Bell', 10_700, C.salud],
  ['2026-10-13', 'Openai Chatgpt Subscr', 99_900, C.educacion, 'expense', 24],
  ['2026-10-12', 'Exito Bello', 10_000, C.alimentacion],
  ['2026-10-12', 'Uber Rides', 2_917, C.transporte],
  ['2026-10-11', 'Tiendas Ara', 58_240, C.alimentacion],
  ['2026-10-11', 'Amazon.Com', 106_932, C.comprasPersonales],
  ['2026-10-10', 'Crepes Y Waffles Unice', 15_800, C.alimentacion],
  ['2026-10-10', 'Uber Rides', 26_939, C.transporte],
  ['2026-10-09', 'Uber Rides*Dl', 25_934, C.transporte],
  ['2026-10-09', 'Uber Rides*Dl', 4_908, C.transporte],
  ['2026-10-09', 'Uber Rides', 2_915, C.transporte],
  ['2026-10-09', 'Amazon.Com', 85_128, C.comprasPersonales],
  ['2026-10-08', 'Drogueria Cruz Verde V', 9_073, C.salud],
  ['2026-10-08', 'Inversiones Pigasus', 80_743, C.comprasPersonales],
  ['2026-10-07', 'Didi Rides*Dl', 11_100, C.transporte],
  ['2026-10-07', 'Uber Rides', 3_905, C.transporte],
  ['2026-10-05', 'Payu Distribuidora P', 73_172, C.transporte],
  ['2026-10-02', 'Tienda D1 Estacion Niq', 41_640, C.alimentacion],
  ['2026-09-30', 'Oxxo Eds Portal de Niq', 2_700, C.alimentacion],
];

// ---------------------------------------------------------------------------
// Helpers replicados de import-nu-statement.mjs para dejar el script legible
// y autocontenido (encode/commit se reutilizan vía import).
// ---------------------------------------------------------------------------
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeText = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Medianoche de Bogotá (America/Bogota, UTC-5) -> 05:00:00Z, patrón statementDate.
const statementDate = (yyyyMmDd) => new Date(`${yyyyMmDd}T05:00:00.000Z`);

const deterministicDocumentId = (importKey, prefix = 'nuStmt') => (
  `${prefix}_${createHash('sha256').update(importKey).digest('hex').slice(0, 16)}`
);

const firestoreBase = (projectId) => (
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`
);

const documentId = (name) => name.split('/').at(-1);

const decodeDocument = (document) => ({
  id: documentId(document.name),
  ...decodeFirestoreFields(document.fields),
  _updateTime: document.updateTime,
  _raw: document,
});

async function readFirebaseCliAccessToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (!config.tokens?.access_token || Number(config.tokens.expires_at) <= Date.now() + 60_000) {
    throw new Error('La sesión de Firebase CLI expiró. Ejecuta firebase projects:list y vuelve a intentar.');
  }
  return config.tokens.access_token;
}

async function fetchJson(url, token, options = {}) {
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

async function listCollection(projectId, uid, collectionId, token) {
  const documents = [];
  let pageToken = null;
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const url = `${firestoreBase(projectId)}/users/${uid}/${collectionId}?${query}`;
    const page = await fetchJson(url, token);
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? null;
  } while (pageToken);
  return documents.map(decodeDocument);
}

async function loadLiveState(projectId, uid, token) {
  const [accounts, transactions] = await Promise.all([
    listCollection(projectId, uid, 'accounts', token),
    listCollection(projectId, uid, 'transactions', token),
  ]);
  return { accounts, transactions };
}

async function writeBackupFile(account, transactionChanges, label = 'nu-oct-2026-import') {
  const backupPath = join(
    process.cwd(),
    '.tmp',
    `${label}-backup-${new Date().toISOString().replaceAll(':', '-')}.json`,
  );
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, JSON.stringify({
    createdAt: new Date().toISOString(),
    account: account._raw,
    plannedCreates: transactionChanges.map(({ id, after }) => ({ id, after })),
  }, null, 2));
  return backupPath;
}

// ---------------------------------------------------------------------------
// Construcción determinista de las transacciones objetivo.
// ---------------------------------------------------------------------------
const buildImportKey = (date, description, amount) => (
  `nu-oct-${date}-${normalizeText(description).replaceAll(' ', '-')}-${String(amount).replace('.', '-')}`
);

function buildTargets(now) {
  return OCT_MOVEMENTS.map(([date, description, rawAmount, category, type = 'expense', installments = 1]) => {
    const amount = roundMoney(rawAmount);
    const importKey = buildImportKey(date, description, rawAmount);
    const base = {
      type,
      amount,
      category,
      description,
      date: statementDate(date),
      createdAt: now,
      paid: true,
      accountId: NU_ACCOUNT_ID,
      importKey,
    };
    if (type === 'expense' && installments > 1) {
      return {
        importKey,
        after: {
          ...base,
          installments,
          hasInterest: false,
          interestRate: NU_INTEREST_RATE,
          totalInterestAmount: 0,
          monthlyInstallmentAmount: roundMoney(amount / installments),
        },
      };
    }
    if (type === 'expense') {
      return { importKey, after: { ...base, installments: 1 } };
    }
    // income (pago): sin campos de cuotas.
    return { importKey, after: base };
  });
}

// Modelo de deuda TC: gasto -> +(amount + max(0, totalInterestAmount));
// ingreso (pago) -> -amount. Ver src/utils/creditDeltas.ts.
const creditDelta = (transaction) => {
  if (transaction.type === 'expense') {
    return roundMoney(Number(transaction.amount) + Math.max(0, Number(transaction.totalInterestAmount ?? 0)));
  }
  if (transaction.type === 'income') return -roundMoney(transaction.amount);
  return 0;
};

async function run() {
  const apply = process.argv.includes('--apply');
  const token = await readFirebaseCliAccessToken();
  const now = new Date();
  const { accounts, transactions } = await loadLiveState(PROJECT_ID, USER_ID, token);

  const nuAccount = accounts.find(({ id }) => id === NU_ACCOUNT_ID)
    ?? accounts.find(({ name }) => name === NU_ACCOUNT_NAME);
  if (!nuAccount) throw new Error('No se encontró la cuenta Nu Crédito');
  if (nuAccount.type !== 'credit') throw new Error('Nu Crédito no es una cuenta de crédito');
  if (!Number.isFinite(nuAccount.usedCredit)) throw new Error('Nu Crédito no tiene usedCredit autoritativo');

  const currentUsedCredit = roundMoney(nuAccount.usedCredit);
  if (currentUsedCredit !== EXPECTED_CURRENT_USED_CREDIT) {
    throw new Error(
      `La deuda actual de Nu cambió: esperado ${EXPECTED_CURRENT_USED_CREDIT}, leído ${currentUsedCredit}. Revisión manual requerida.`,
    );
  }

  const targets = buildTargets(now);

  // Idempotencia: doc-id derivado por sha256 del importKey; currentDocument.exists=false.
  // Solo se crean los movimientos que aún no existen (por importKey).
  const existingKeys = new Set(
    transactions
      .filter(({ accountId }) => accountId === nuAccount.id)
      .map(({ importKey }) => importKey)
      .filter(Boolean),
  );
  const creates = targets
    .filter((target) => !existingKeys.has(target.importKey))
    .map((target) => ({
      id: deterministicDocumentId(target.importKey),
      before: null,
      after: target.after,
      changedPaths: Object.keys(target.after),
    }));

  const netDelta = roundMoney(
    targets.reduce((sum, { after }) => sum + creditDelta(after), 0),
  );
  const resultingUsedCredit = roundMoney(currentUsedCredit + netDelta);

  // --- Impresión del plan (dry-run) ---
  console.log('IMPORTACIÓN NU CRÉDITO · EXTRACTO OCTUBRE 2026');
  console.log(`- Movimientos del extracto: ${targets.length}`);
  console.log(`- Nuevos a crear: ${creates.length}`);
  console.log(`- Ya existentes (omitidos por idempotencia): ${targets.length - creates.length}`);
  console.log('');
  console.log('  fecha      | tipo    | $monto            | categoría            | descripción');
  for (const { after } of targets) {
    const date = after.date.toISOString().slice(0, 10);
    const type = after.type.padEnd(7);
    const money = `$${after.amount.toLocaleString('es-CO')}`.padEnd(17);
    const category = (after.category ?? '').padEnd(20);
    console.log(`  ${date} | ${type} | ${money} | ${category} | ${after.description}`);
  }
  console.log('');
  console.log(`- Delta neto a la deuda (gastos +, pago -): $${netDelta.toLocaleString('es-CO')}`);
  console.log(`- usedCredit actual:     $${currentUsedCredit.toLocaleString('es-CO')}`);
  console.log(`- usedCredit resultante: $${resultingUsedCredit.toLocaleString('es-CO')}`);

  if (resultingUsedCredit !== EXPECTED_RESULTING_USED_CREDIT) {
    throw new Error(
      `El usedCredit resultante calculado (${resultingUsedCredit}) no coincide con el esperado (${EXPECTED_RESULTING_USED_CREDIT}).`,
    );
  }

  const hasChanges = creates.length > 0 || currentUsedCredit !== resultingUsedCredit;
  const writes = hasChanges
    ? buildCommitWrites({
      projectId: PROJECT_ID,
      uid: USER_ID,
      transactionUpdates: [],
      transactionCreates: creates,
      account: nuAccount,
      targetUsedCredit: resultingUsedCredit,
    })
    : [];
  console.log(`- Escrituras atómicas previstas: ${writes.length}`);

  if (!apply) {
    console.log('\nDRY RUN: no se escribió nada. Usa --apply para ejecutar.');
    return;
  }

  if (!hasChanges) {
    console.log('\nSin cambios: los 39 movimientos ya están cargados y la deuda está conciliada.');
    return;
  }

  const backupPath = await writeBackupFile(nuAccount, creates);
  console.log(`\nRespaldo: ${backupPath}`);
  await fetchJson(`${firestoreBase(PROJECT_ID)}:commit`, token, {
    method: 'POST',
    body: JSON.stringify({ writes }),
  });

  // --- Verificación post-escritura releyendo el estado ---
  const after = await loadLiveState(PROJECT_ID, USER_ID, token);
  const verifiedNu = after.accounts.find(({ id }) => id === nuAccount.id);
  if (roundMoney(verifiedNu?.usedCredit) !== EXPECTED_RESULTING_USED_CREDIT) {
    throw new Error(`Verificación de deuda falló: ${verifiedNu?.usedCredit}`);
  }
  for (const target of targets) {
    const matches = after.transactions.filter(({ importKey }) => importKey === target.importKey);
    if (matches.length !== 1) {
      throw new Error(`Verificación final falló para ${target.importKey}: ${matches.length} documentos`);
    }
    const [match] = matches;
    if (
      match.accountId !== nuAccount.id
      || match.type !== target.after.type
      || roundMoney(match.amount) !== roundMoney(target.after.amount)
    ) {
      throw new Error(`Verificación de campos falló para ${target.importKey}`);
    }
  }
  console.log(`\nAPLICADO Y VERIFICADO: ${targets.length} movimientos; deuda Nu Crédito $${roundMoney(verifiedNu.usedCredit).toLocaleString('es-CO')}.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  run().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
