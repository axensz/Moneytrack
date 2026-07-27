/**
 * Migración de datos del modo invitado (localStorage) → cuenta autenticada (Firestore).
 *
 * PROBLEMA (S1, P0):
 * En modo invitado los datos viven en localStorage. Al iniciar sesión los hooks
 * cambian a Firestore (vacío) y los datos locales quedan huérfanos: el usuario
 * que probó la app sin cuenta pierde todo de la vista al registrarse.
 *
 * ESTRATEGIA:
 * - Se PRESERVAN los IDs locales (generateId() produce IDs válidos como doc id de
 *   Firestore). Escribir con `set(doc(path/<localId>), data)` mantiene intactas las
 *   referencias cruzadas (transaction.accountId → account.id, debt.accountId, etc.).
 * - Por preservar IDs, la migración es IDEMPOTENTE: re-escribir el mismo doc id
 *   sobrescribe con datos idénticos, nunca duplica. Por eso un fallo parcial es
 *   seguro de reintentar.
 * - Las fechas en localStorage son strings (JSON no preserva Date). Se convierten a
 *   Date en los campos conocidos para que Firestore las guarde como Timestamp y las
 *   subscripciones (`.toDate()`) funcionen.
 *
 * Los datos locales solo se borran DESPUÉS de un commit exitoso.
 */

import { doc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { generateId } from './formatters';
import { clearGuestFinanceData } from './localData';
import { DEFAULT_CATEGORIES } from '../config/constants';
import type {
  Account,
  Transaction,
  Debt,
  RecurringPayment,
  Budget,
  SavingsGoal,
  Categories,
} from '../types/finance';
import {
  RULE_SAFE_COMPLEX_WRITE_LIMIT,
  RULE_SAFE_REFERENCE_LIMIT,
} from '../config/firestoreLimits';

/** Config del plan financiero guardada en local (key 'financialPlanConfig'). */
interface StoredPlanConfig {
  startMonth: string;
  declaredIncome: number;
}

export interface GuestData {
  accounts: Account[];
  transactions: Transaction[];
  recurringPayments: RecurringPayment[];
  debts: Debt[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  categories: Categories | null;
  planConfig: StoredPlanConfig | null;
}

/** Conteo de las entidades financieras principales (lo que se muestra en el prompt). */
export interface GuestDataCounts {
  accounts: number;
  transactions: number;
  recurringPayments: number;
  debts: number;
  budgets: number;
  savingsGoals: number;
  /** Suma de las 6 entidades anteriores. */
  total: number;
}

/** Una escritura a Firestore: ruta completa del documento + datos. */
export interface WriteOp {
  /** Ruta completa del doc (nº par de segmentos), ej. users/uid/accounts/<id>. */
  path: string;
  data: Record<string, unknown>;
}

export interface MigrationDeps {
  read?: () => GuestData;
  commit?: (writes: WriteOp[]) => Promise<void>;
  clear?: () => void;
  /** ¿La cuenta YA tiene un plan financiero? Para no pisarlo al migrar (#guest-plan). */
  planConfigExists?: (userId: string) => Promise<boolean>;
}

export interface MigrationResult {
  migrated: boolean;
  counts: GuestDataCounts;
  writeCount: number;
}

/** Campos de fecha por colección (string → Date al migrar). */
const DATE_FIELDS: Record<string, readonly string[]> = {
  accounts: ['createdAt'],
  transactions: ['date', 'createdAt'],
  recurringPayments: ['createdAt', 'lastPaidDate'],
  debts: ['createdAt', 'settledAt', 'lentDate', 'dueDate', 'nextPaymentDate'],
  budgets: ['createdAt'],
  savingsGoals: ['targetDate', 'createdAt', 'completedAt'],
};

// El límite bruto de Firestore es 500 escrituras, pero las reglas también
// permiten como máximo 1.000 expresiones evaluadas por solicitud. Esta cota
// conservadora deja margen a las validaciones de cada entidad.
// Las reglas permiten 20 accesos a documentos por batch. Cada escritura de una
// relación consulta el root y las cuentas/deudas referenciadas.

function emptyGuestData(): GuestData {
  return {
    accounts: [],
    transactions: [],
    recurringPayments: [],
    debts: [],
    budgets: [],
    savingsGoals: [],
    categories: null,
    planConfig: null,
  };
}

function readArrayKey<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readObjectKey<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/** Lee todos los datos del modo invitado desde localStorage. */
export function readGuestData(): GuestData {
  if (typeof localStorage === 'undefined') return emptyGuestData();
  return {
    accounts: readArrayKey<Account>('accounts'),
    transactions: readArrayKey<Transaction>('transactions'),
    recurringPayments: readArrayKey<RecurringPayment>('recurringPayments'),
    debts: readArrayKey<Debt>('debts'),
    budgets: readArrayKey<Budget>('budgets'),
    savingsGoals: readArrayKey<SavingsGoal>('savingsGoals'),
    categories: readObjectKey<Categories>('financeCategories'),
    planConfig: readObjectKey<StoredPlanConfig>('financialPlanConfig'),
  };
}

export function countGuestData(data: GuestData): GuestDataCounts {
  const accounts = data.accounts.length;
  const transactions = data.transactions.length;
  const recurringPayments = data.recurringPayments.length;
  const debts = data.debts.length;
  const budgets = data.budgets.length;
  const savingsGoals = data.savingsGoals.length;
  return {
    accounts,
    transactions,
    recurringPayments,
    debts,
    budgets,
    savingsGoals,
    total: accounts + transactions + recurringPayments + debts + budgets + savingsGoals,
  };
}

/** Hay algo que migrar si existe al menos una entidad financiera principal. */
export function hasGuestData(data: GuestData): boolean {
  return countGuestData(data).total > 0;
}

/** Convierte un valor a Date válido, o undefined si no es una fecha utilizable. */
function toDateValue(value: unknown): Date | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/**
 * Limpia una entidad para Firestore: quita `id` y `undefined`, y convierte los
 * campos de fecha conocidos de string a Date.
 */
function cleanEntity(
  entity: Record<string, unknown>,
  dateFields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entity)) {
    if (key === 'id') continue;
    if (value === undefined) continue;
    if (dateFields.includes(key)) {
      const d = toDateValue(value);
      if (d !== undefined) out[key] = d;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Hash determinista (djb2) → base36, para IDs de categoría estables/idempotentes. */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function buildCollectionWrites<T extends { id?: string }>(
  userId: string,
  collectionName: string,
  items: T[]
): WriteOp[] {
  const dateFields = DATE_FIELDS[collectionName] ?? [];
  return items.map((item) => {
    const id = item.id || generateId();
    return {
      path: `users/${userId}/${collectionName}/${id}`,
      data: cleanEntity(item as Record<string, unknown>, dateFields),
    };
  });
}

/**
 * Construye la lista completa de escrituras para migrar los datos de invitado.
 * Función pura: no toca Firestore ni localStorage (fácil de testear).
 */
export function buildMigrationWrites(data: GuestData, userId: string): WriteOp[] {
  const writes: WriteOp[] = [
    ...buildCollectionWrites(userId, 'accounts', data.accounts),
    ...buildCollectionWrites(userId, 'transactions', data.transactions),
    ...buildCollectionWrites(userId, 'recurringPayments', data.recurringPayments),
    ...buildCollectionWrites(userId, 'debts', data.debts),
    ...buildCollectionWrites(userId, 'budgets', data.budgets),
    ...buildCollectionWrites(userId, 'savingsGoals', data.savingsGoals),
  ];

  // Categorías personalizadas (las que NO son default). Las usadas por transacciones
  // ya aparecen solas en la UI; estas cubren categorías creadas sin transacciones aún.
  if (data.categories) {
    (['expense', 'income'] as const).forEach((type) => {
      const names = data.categories?.[type] ?? [];
      const defaults = new Set<string>(DEFAULT_CATEGORIES[type]);
      names.forEach((name) => {
        if (!name || defaults.has(name)) return;
        const id = `cat_${type}_${stableHash(name)}`;
        writes.push({
          path: `users/${userId}/categories/${id}`,
          data: { type, name },
        });
      });
    });
  }

  // Config del plan financiero (documento singleton).
  if (
    data.planConfig &&
    (typeof data.planConfig.startMonth === 'string' ||
      typeof data.planConfig.declaredIncome === 'number')
  ) {
    writes.push({
      path: `users/${userId}/settings/planConfig`,
      data: {
        startMonth: data.planConfig.startMonth,
        declaredIncome: data.planConfig.declaredIncome,
      },
    });
  }

  return writes;
}

/** ¿La cuenta ya tiene un plan financiero persistido? (lectura real a Firestore). */
async function defaultPlanConfigExists(userId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, `users/${userId}/settings/planConfig`));
  return snap.exists();
}

const referencedDocumentKeys = (write: WriteOp): string[] => {
  const references = [write.data.accountId, write.data.toAccountId]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(accountId => `account:${accountId}`);

  if (
    write.path.includes('/transactions/')
    && typeof write.data.debtId === 'string'
    && write.data.debtId.length > 0
  ) {
    references.push(`debt:${write.data.debtId}`);
  }

  return references;
};

/**
 * Separa primero las cuentas y limita las referencias distintas de los batches
 * posteriores. Esto mantiene `existsAfter(account)` dentro del tope de accesos
 * de las reglas incluso en migraciones con muchas cuentas.
 */
export function planMigrationWriteBatches(writes: WriteOp[]): WriteOp[][] {
  const accountWrites = writes.filter(write => write.path.includes('/accounts/'));
  const debtWrites = writes.filter(write => write.path.includes('/debts/'));
  const remainingWrites = writes.filter(
    write => !write.path.includes('/accounts/') && !write.path.includes('/debts/')
  );
  const batches: WriteOp[][] = [];

  for (
    let index = 0;
    index < accountWrites.length;
    index += RULE_SAFE_COMPLEX_WRITE_LIMIT
  ) {
    batches.push(
      accountWrites.slice(index, index + RULE_SAFE_COMPLEX_WRITE_LIMIT)
    );
  }

  let currentBatch: WriteOp[] = [];
  let currentDocumentReferences = new Set<string>();
  const flush = () => {
    if (currentBatch.length === 0) return;
    batches.push(currentBatch);
    currentBatch = [];
    currentDocumentReferences = new Set<string>();
  };

  const appendReferenceAwareWrites = (group: WriteOp[]) => {
    group.forEach(write => {
      const nextReferences = referencedDocumentKeys(write);
      const combinedReferences = new Set([
        ...currentDocumentReferences,
        ...nextReferences,
      ]);
      if (
        currentBatch.length >= RULE_SAFE_COMPLEX_WRITE_LIMIT ||
        (
          currentBatch.length > 0 &&
          combinedReferences.size > RULE_SAFE_REFERENCE_LIMIT
        )
      ) {
        flush();
      }

      currentBatch.push(write);
      nextReferences.forEach(reference => currentDocumentReferences.add(reference));
    });
  };

  // Las deudas deben existir antes de crear transacciones que las referencien.
  appendReferenceAwareWrites(debtWrites);
  flush();
  appendReferenceAwareWrites(remainingWrites);
  flush();

  return batches;
}

/** Commit real a Firestore en batches compatibles con límites de escritura y reglas. */
export async function commitWrites(writes: WriteOp[]): Promise<void> {
  for (const writeGroup of planMigrationWriteBatches(writes)) {
    const batch = writeBatch(db);
    for (const write of writeGroup) {
      batch.set(doc(db, write.path), write.data);
    }
    await batch.commit();
  }
}

/**
 * Migra los datos de invitado a la cuenta del usuario.
 *
 * Idempotente (preserva IDs). Solo borra los datos locales tras un commit exitoso;
 * si el commit falla, los datos locales se conservan para poder reintentar.
 */
export async function migrateGuestData(
  userId: string,
  deps: MigrationDeps = {}
): Promise<MigrationResult> {
  if (!userId) throw new Error('migrateGuestData requiere un userId');

  const {
    read = readGuestData,
    commit = commitWrites,
    clear = clearGuestFinanceData,
    planConfigExists = defaultPlanConfigExists,
  } = deps;

  const data = read();
  const counts = countGuestData(data);
  let writes = buildMigrationWrites(data, userId);

  // No pisar un plan financiero YA existente en la cuenta: las entidades usan ids
  // aleatorios (se SUMAN, no sobrescriben), pero planConfig es un doc singleton y
  // `set` reemplaza → un usuario que regresa (plan en la cuenta + plan de invitado)
  // perdería el suyo. Solo migramos el plan del invitado si la cuenta no tiene uno.
  const planPath = `users/${userId}/settings/planConfig`;
  if (writes.some((w) => w.path === planPath) && (await planConfigExists(userId))) {
    writes = writes.filter((w) => w.path !== planPath);
  }

  if (writes.length === 0) {
    return { migrated: false, counts, writeCount: 0 };
  }

  await commit(writes);
  clear();

  return { migrated: true, counts, writeCount: writes.length };
}
