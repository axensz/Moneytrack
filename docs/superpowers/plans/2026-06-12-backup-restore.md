# HU-01 Backup y restauración segura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cablear backup/restore a la UI con motor v2.0: export completo vía `getDocs` (7 colecciones + planConfig), import con remap de IDs y swap seguro, modal con gate de export forzado antes de replace.

**Architecture:** El motor vive en `src/hooks/useBackup.ts` (ya tiene swap write-then-delete + rollback, test en `backupReplaceAtomic.test.ts`). Se amplía a 7 colecciones con remap `accountId`/`debtId`, export desde Firestore (no desde arrays paginados en memoria), y manejo de `planConfig` (doc singleton `users/{uid}/settings/planConfig`; el doc `users/{uid}/settings/ai` con la API key JAMÁS se toca). La UI es un modal nuevo (`BackupModal`) sobre `BaseModal`, abierto desde el menú de ajustes del Header. Solo usuarios logueados.

**Tech Stack:** Next.js + React 18, Firebase Firestore (web SDK v12), Vitest + @testing-library/react (renderHook y render), lucide-react, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-12-backup-restore-design.md`

**Reglas del repo:** tests en `src/__tests__/`, mensajes de commit en español estilo Conventional Commits (`fix(transacciones): ...`), `npm run typecheck` y `npm run test:run` deben pasar antes de cada commit (hay pre-commit hook).

---

## Estructura de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `src/types/finance.ts` | Modificar (líneas 162-171) | `BackupData` v2.0 |
| `src/hooks/useBackup.ts` | Reescribir parcialmente | Motor: `fetchBackupData`, `parseBackupFile`, import v2 con remap |
| `src/__tests__/hooks/useBackupV2.test.ts` | Crear | Tests del motor v2 |
| `src/__tests__/hooks/backupReplaceAtomic.test.ts` | Modificar | Fixture v2.0 + mocks nuevos (los tests de replace con v1.0 pasan a ser inválidos) |
| `src/components/modals/BackupModal.tsx` | Crear | UI export/restore |
| `src/__tests__/components/BackupModal.test.tsx` | Crear | Test del gate de replace |
| `src/components/layout/Header.tsx` | Modificar | Ítem de menú "Respaldo de datos" |
| `src/finance-tracker.tsx` | Modificar | Estado + montaje del modal |

Datos clave del codebase (verificados):

- Colecciones por usuario: `transactions`, `accounts`, `categories` (docs `{type: 'expense'|'income', name}`), `budgets`, `debts`, `savingsGoals`, `recurringPayments`. Además docs singleton en `settings`: `planConfig` (`{startMonth: string, declaredIncome: number}`) y `ai` (API key — excluido).
- Referencias a remapear: `transaction.accountId/toAccountId/debtId`, `debt.accountId`, `savingsGoal.accountId`, `recurringPayment.accountId`. Budgets referencian categorías por nombre (sin remap).
- Las suscripciones (`useFirestoreSubscriptions`) son `onSnapshot` en vivo → tras importar, la UI se actualiza sola. El callback `refreshData` del hook se elimina.
- `doc.data()` devuelve `Timestamp` de Firestore → el export debe serializarlos a ISO (helper recursivo `serializeTimestamps`). El import revive fechas con `new Date(...)` por campo conocido.
- Los datos importados vienen de `JSON.parse` → no pueden contener `undefined`, no hace falta strip.

---

### Task 1: Tipos — `BackupData` v2.0

**Files:**
- Modify: `src/types/finance.ts:162-171`

- [ ] **Step 1: Ampliar el tipo**

Reemplazar la interfaz actual:

```ts
export interface BackupData {
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  debts?: Debt[];
  budgets?: Budget[];
  savingsGoals?: SavingsGoal[];
  exportDate: string;
  version: string;
}
```

por:

```ts
/** Config del plan financiero tal como se persiste (users/{uid}/settings/planConfig). */
export interface BackupPlanConfig {
  startMonth: string;
  declaredIncome: number;
}

/**
 * Formato del archivo de respaldo.
 * v1.0: solo transactions/accounts/categories (los demás campos ausentes).
 * v2.0: todo lo financiero. La API key de Gemini (settings/ai), las notificaciones
 * y las preferencias se EXCLUYEN deliberadamente.
 */
export interface BackupData {
  version: string; // '1.0' | '2.0'
  exportDate: string;
  transactions: Transaction[];
  accounts: Account[];
  categories: Categories;
  budgets?: Budget[];
  debts?: Debt[];
  savingsGoals?: SavingsGoal[];
  recurringPayments?: RecurringPayment[];
  planConfig?: BackupPlanConfig | null;
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run typecheck`
Expected: PASS (campos nuevos son opcionales, nada se rompe)

- [ ] **Step 3: Commit**

```bash
git add src/types/finance.ts
git commit -m "feat(backup): tipo BackupData v2.0 con todas las colecciones financieras"
```

---

### Task 2: Motor — export completo vía `getDocs` (`fetchBackupData`)

El export actual serializa el prop `transactions` (array paginado ~500) → backup truncado silencioso. `fetchBackupData` lee TODO desde Firestore.

**Files:**
- Modify: `src/hooks/useBackup.ts`
- Create: `src/__tests__/hooks/useBackupV2.test.ts`

- [ ] **Step 1: Crear el test que falla**

Crear `src/__tests__/hooks/useBackupV2.test.ts`:

```ts
/**
 * Motor de backup v2.0 — export completo vía getDocs (nunca arrays paginados
 * en memoria), import con remap accountId/debtId, planConfig, y retry del
 * borrado de viejos. Complementa backupReplaceAtomic.test.ts (swap/rollback).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- Estado compartido entre mocks y tests ---------------------------------
/** Fixtures por path de colección que getDocs devuelve. */
let collectionFixtures: Record<string, Array<{ id: string; data: Record<string, unknown> }>> = {};
/** Registro de sets: path de colección, id nuevo, payload. */
const setLog: Array<{ path: string; id: string; data: Record<string, unknown> }> = [];
/** Registro de deletes de batch (ids). */
const deleteLog: string[] = [];
/** Paths leídos con getDoc (debe ser SOLO settings/planConfig). */
const getDocPaths: string[] = [];
/** planConfig existente en Firestore (null = no existe). */
let existingPlanConfig: Record<string, unknown> | null = null;
/** setDoc/deleteDoc directos (planConfig). */
const setDocLog: Array<{ path: string; data: Record<string, unknown> }> = [];
const deleteDocLog: string[] = [];
/** Si > 0, los próximos N commits que contengan deletes fallan (retry test). */
let failDeleteCommits = 0;

vi.mock('../../lib/firebase', () => ({ db: {} }));
vi.mock('../../utils/toastHelpers', () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('firebase/firestore', () => {
  const collection = (_db: unknown, path: string) => ({ path });
  let autoId = 0;
  const doc = (...args: unknown[]) => {
    if (args.length >= 3) {
      // doc(db, path, id)
      return { id: args[2] as string, path: `${args[1]}/${args[2]}` };
    }
    if (typeof args[1] === 'string') {
      // doc(db, 'users/u1/settings/planConfig')
      return { id: 'planConfig', path: args[1] as string };
    }
    // doc(collectionRef) -> id nuevo
    autoId += 1;
    const parent = args[0] as { path: string };
    return { id: `new-${autoId}`, path: `${parent.path}/new-${autoId}` };
  };

  const getDocs = vi.fn(async (ref: { path: string }) => {
    const fixtures = collectionFixtures[ref.path] ?? [];
    return { docs: fixtures.map(f => ({ id: f.id, data: () => f.data })) };
  });

  const getDoc = vi.fn(async (ref: { path: string }) => {
    getDocPaths.push(ref.path);
    return {
      exists: () => existingPlanConfig !== null,
      data: () => existingPlanConfig ?? undefined,
    };
  });

  const setDoc = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    setDocLog.push({ path: ref.path, data });
  });

  const deleteDoc = vi.fn(async (ref: { path: string }) => {
    deleteDocLog.push(ref.path);
  });

  const writeBatch = () => {
    const pendingSets: Array<{ path: string; id: string; data: Record<string, unknown> }> = [];
    const pendingDeletes: string[] = [];
    return {
      set: (ref: { id: string; path: string }, data: Record<string, unknown>) => {
        // path del doc es `${collectionPath}/${id}` → recorta al path de colección
        const collectionPath = ref.path.slice(0, ref.path.lastIndexOf('/'));
        pendingSets.push({ path: collectionPath, id: ref.id, data });
      },
      delete: (ref: { id: string }) => {
        pendingDeletes.push(ref.id);
      },
      commit: async () => {
        if (pendingDeletes.length > 0 && failDeleteCommits > 0) {
          failDeleteCommits -= 1;
          throw new Error('Simulated delete-batch failure');
        }
        setLog.push(...pendingSets);
        deleteLog.push(...pendingDeletes);
      },
    };
  };

  return { collection, doc, getDocs, getDoc, setDoc, deleteDoc, writeBatch };
});

import { useBackup, fetchBackupData } from '../../hooks/useBackup';
import type { BackupData } from '../../types/finance';

const UID = 'u1';
const COL = (name: string) => `users/${UID}/${name}`;

/** Timestamp falso de Firestore. */
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

function makeFile(data: unknown): File {
  return { text: async () => JSON.stringify(data) } as unknown as File;
}

const hookProps = {
  categories: { expense: ['Comida'], income: ['Salario'] },
  userId: UID,
};

const V2_BACKUP: BackupData = {
  version: '2.0',
  exportDate: '2026-06-01T00:00:00.000Z',
  accounts: [
    // @ts-expect-error tipo simplificado para el test
    { id: 'a1', name: 'Cuenta', type: 'cash', balance: 0, currency: 'COP', color: '#000' },
  ],
  categories: { expense: ['Comida'], income: ['Salario'] },
  // @ts-expect-error tipo simplificado
  debts: [{ id: 'd1', personName: 'Ana', type: 'lent', originalAmount: 100, remainingAmount: 50, isSettled: false, accountId: 'a1' }],
  // @ts-expect-error tipo simplificado
  savingsGoals: [{ id: 'g1', name: 'Viaje', targetAmount: 500, currentAmount: 0, isCompleted: false, accountId: 'a1' }],
  // @ts-expect-error tipo simplificado
  recurringPayments: [{ id: 'r1', name: 'Netflix', amount: 10, category: 'Comida', dueDay: 5, frequency: 'monthly', isActive: true, accountId: 'a1' }],
  // @ts-expect-error tipo simplificado
  budgets: [{ id: 'b1', category: 'Comida', monthlyLimit: 300, isActive: true }],
  transactions: [
    {
      // @ts-expect-error tipo simplificado
      id: 't1', type: 'expense', amount: 100, category: 'Comida', description: 'Café',
      date: '2026-01-01T00:00:00.000Z', paid: true, accountId: 'a1', debtId: 'd1',
    },
  ],
  planConfig: { startMonth: '2026-01', declaredIncome: 1000 },
};

beforeEach(() => {
  collectionFixtures = {};
  setLog.length = 0;
  deleteLog.length = 0;
  getDocPaths.length = 0;
  setDocLog.length = 0;
  deleteDocLog.length = 0;
  existingPlanConfig = null;
  failDeleteCommits = 0;
  vi.clearAllMocks();
});

describe('fetchBackupData — export completo desde Firestore', () => {
  it('lee las 7 colecciones con getDocs y serializa Timestamps a ISO', async () => {
    collectionFixtures = {
      [COL('transactions')]: [
        { id: 't1', data: { type: 'expense', amount: 1, accountId: 'a1', category: 'Comida', description: 'x', paid: true, date: ts('2026-02-01T05:00:00.000Z'), createdAt: ts('2026-02-01T05:00:00.000Z') } },
      ],
      [COL('accounts')]: [{ id: 'a1', data: { name: 'Cuenta', type: 'cash', balance: 1, currency: 'COP', color: '#000' } }],
      [COL('categories')]: [
        { id: 'c1', data: { type: 'expense', name: 'Mascotas' } },
        { id: 'c2', data: { type: 'income', name: 'Ventas' } },
      ],
      [COL('budgets')]: [{ id: 'b1', data: { category: 'Comida', monthlyLimit: 100, isActive: true } }],
      [COL('debts')]: [{ id: 'd1', data: { personName: 'Ana', type: 'lent', originalAmount: 10, remainingAmount: 5, isSettled: false, lentDate: ts('2026-03-01T05:00:00.000Z') } }],
      [COL('savingsGoals')]: [{ id: 'g1', data: { name: 'Viaje', targetAmount: 5, currentAmount: 0, isCompleted: false } }],
      [COL('recurringPayments')]: [{ id: 'r1', data: { name: 'Netflix', amount: 1, category: 'Comida', dueDay: 5, frequency: 'monthly', isActive: true } }],
    };
    existingPlanConfig = { startMonth: '2026-01', declaredIncome: 1000 };

    const data = await fetchBackupData(UID);

    expect(data.version).toBe('2.0');
    expect(data.transactions).toHaveLength(1);
    expect(data.transactions[0].date).toBe('2026-02-01T05:00:00.000Z'); // Timestamp → ISO
    expect(data.accounts).toHaveLength(1);
    expect(data.categories).toEqual({ expense: ['Mascotas'], income: ['Ventas'] });
    expect(data.budgets).toHaveLength(1);
    expect(data.debts?.[0].lentDate).toBe('2026-03-01T05:00:00.000Z');
    expect(data.savingsGoals).toHaveLength(1);
    expect(data.recurringPayments).toHaveLength(1);
    expect(data.planConfig).toEqual({ startMonth: '2026-01', declaredIncome: 1000 });
  });

  it('NUNCA lee settings/ai (la API key no entra al backup)', async () => {
    await fetchBackupData(UID);
    expect(getDocPaths).toEqual([`users/${UID}/settings/planConfig`]);
  });

  it('planConfig ausente → null', async () => {
    existingPlanConfig = null;
    const data = await fetchBackupData(UID);
    expect(data.planConfig).toBeNull();
  });
});

describe('import v2 — remap de IDs', () => {
  it('remapea accountId/debtId en todo el grafo y escribe transactions al final', async () => {
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    await act(async () => {
      await result.current.importData(makeFile(V2_BACKUP), 'merge');
    });

    const byPath = (name: string) => setLog.filter(s => s.path === COL(name));

    const newAccountId = byPath('accounts')[0].id;
    const newDebtId = byPath('debts')[0].id;

    expect(byPath('debts')[0].data.accountId).toBe(newAccountId);
    expect(byPath('savingsGoals')[0].data.accountId).toBe(newAccountId);
    expect(byPath('recurringPayments')[0].data.accountId).toBe(newAccountId);
    expect(byPath('budgets')).toHaveLength(1);

    const tx = byPath('transactions')[0];
    expect(tx.data.accountId).toBe(newAccountId);
    expect(tx.data.debtId).toBe(newDebtId);

    // transactions es lo último que se escribe
    const lastSet = setLog[setLog.length - 1];
    expect(lastSet.path).toBe(COL('transactions'));
  });

  it('v1.0 en modo merge importa sin error (colecciones ausentes = vacías)', async () => {
    const v1 = {
      version: '1.0',
      exportDate: '2026-01-01T00:00:00.000Z',
      accounts: V2_BACKUP.accounts,
      categories: V2_BACKUP.categories,
      transactions: [{ ...V2_BACKUP.transactions[0], debtId: undefined }],
    };
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    let ok = false;
    await act(async () => {
      ok = await result.current.importData(makeFile(v1), 'merge');
    });
    expect(ok).toBe(true);
    expect(setLog.some(s => s.path === COL('accounts'))).toBe(true);
  });

  it('v1.0 en modo replace se RECHAZA antes de escribir nada', async () => {
    const v1 = {
      version: '1.0',
      exportDate: '2026-01-01T00:00:00.000Z',
      accounts: V2_BACKUP.accounts,
      categories: V2_BACKUP.categories,
      transactions: [],
    };
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    let ok = true;
    await act(async () => {
      ok = await result.current.importData(makeFile(v1), 'replace');
    });
    expect(ok).toBe(false);
    expect(setLog).toHaveLength(0);
    expect(deleteLog).toHaveLength(0);
  });

  it('transaction.debtId que no existe en debts del backup v2 → error sin escrituras', async () => {
    const roto = { ...V2_BACKUP, debts: [] };
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    let ok = true;
    await act(async () => {
      ok = await result.current.importData(makeFile(roto), 'merge');
    });
    expect(ok).toBe(false);
    expect(setLog).toHaveLength(0);
  });
});

describe('planConfig', () => {
  it('merge: respeta el planConfig existente', async () => {
    existingPlanConfig = { startMonth: '2025-01', declaredIncome: 500 };
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    await act(async () => {
      await result.current.importData(makeFile(V2_BACKUP), 'merge');
    });
    expect(setDocLog).toHaveLength(0);
  });

  it('merge: escribe planConfig si no existe', async () => {
    existingPlanConfig = null;
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    await act(async () => {
      await result.current.importData(makeFile(V2_BACKUP), 'merge');
    });
    expect(setDocLog).toEqual([
      { path: `users/${UID}/settings/planConfig`, data: { startMonth: '2026-01', declaredIncome: 1000 } },
    ]);
  });

  it('replace: sobrescribe planConfig; sin planConfig en backup lo borra', async () => {
    existingPlanConfig = { startMonth: '2025-01', declaredIncome: 500 };
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    await act(async () => {
      await result.current.importData(makeFile(V2_BACKUP), 'replace');
    });
    expect(setDocLog[0].data).toEqual({ startMonth: '2026-01', declaredIncome: 1000 });

    setDocLog.length = 0;
    const sinPlan = { ...V2_BACKUP, planConfig: null };
    await act(async () => {
      await result.current.importData(makeFile(sinPlan), 'replace');
    });
    expect(deleteDocLog).toContain(`users/${UID}/settings/planConfig`);
  });

  it('jamás escribe en settings/ai', async () => {
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    await act(async () => {
      await result.current.importData(makeFile(V2_BACKUP), 'replace');
    });
    expect(setDocLog.every(s => !s.path.endsWith('/ai'))).toBe(true);
    expect(deleteDocLog.every(p => !p.endsWith('/ai'))).toBe(true);
  });
});

describe('replace — borrado de viejos con retry', () => {
  it('si el primer intento de borrar viejos falla, reintenta una vez y termina OK', async () => {
    collectionFixtures = {
      [COL('transactions')]: [{ id: 'old-t', data: {} }],
      [COL('accounts')]: [{ id: 'old-a', data: {} }],
    };
    failDeleteCommits = 1; // primer commit con deletes falla, el retry pasa
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    let ok = false;
    await act(async () => {
      ok = await result.current.importData(makeFile(V2_BACKUP), 'replace');
    });
    expect(ok).toBe(true);
    expect(deleteLog).toContain('old-t');
  });

  it('si el retry también falla, el import sigue siendo exitoso (datos nuevos completos) con aviso', async () => {
    collectionFixtures = {
      [COL('transactions')]: [{ id: 'old-t', data: {} }],
    };
    failDeleteCommits = 99; // todos los commits con deletes fallan
    const { result } = renderHook(() => useBackup({ ...hookProps }));
    let ok = false;
    await act(async () => {
      ok = await result.current.importData(makeFile(V2_BACKUP), 'replace');
    });
    expect(ok).toBe(true); // los datos nuevos quedaron escritos
    expect(deleteLog).not.toContain('old-t'); // la limpieza no se logró
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/__tests__/hooks/useBackupV2.test.ts`
Expected: FAIL — `fetchBackupData` no existe (export missing), `importData` no devuelve boolean, etc.

- [ ] **Step 3: Reescribir el motor en `src/hooks/useBackup.ts`**

Contenido completo del archivo:

```ts
import { useCallback, useState } from 'react';
import {
  collection, writeBatch, doc, getDocs, getDoc, setDoc, deleteDoc,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { showToast } from '../utils/toastHelpers';
import { logger } from '../utils/logger';
import type {
  Transaction, Account, Categories, BackupData, BackupPlanConfig,
  Budget, Debt, SavingsGoal, RecurringPayment,
} from '../types/finance';
import { TRANSFER_CATEGORY } from '../config/constants';

interface UseBackupProps {
  /** Categorías actuales en la app (para el filtro de merge). */
  categories: Categories;
  userId: string | null;
}

type ImportStrategy = 'merge' | 'replace';

const SUPPORTED_VERSIONS = ['1.0', '2.0'];

/** Colecciones de usuario cubiertas por el backup v2 (settings va aparte). */
const BACKUP_COLLECTIONS = [
  'transactions', 'accounts', 'categories', 'budgets', 'debts',
  'savingsGoals', 'recurringPayments',
] as const;

/**
 * Convierte recursivamente Timestamps de Firestore (cualquier valor con
 * .toDate()) a strings ISO, para que el backup sea JSON puro.
 */
const serializeTimestamps = (value: unknown): unknown => {
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serializeTimestamps);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, serializeTimestamps(v)])
    );
  }
  return value;
};

/** Revive a Date los campos de fecha presentes (vienen como ISO del JSON). */
const reviveDates = <T extends Record<string, unknown>>(obj: T, fields: string[]): T => {
  const out: Record<string, unknown> = { ...obj };
  for (const f of fields) {
    if (out[f]) out[f] = new Date(out[f] as string);
  }
  return out as T;
};

/**
 * Lee TODOS los datos del usuario desde Firestore para exportar.
 * NUNCA usa los arrays en memoria de la app: el de transacciones está
 * paginado (~500) y produciría un backup truncado silencioso (mismo
 * patrón que el hallazgo C2 de balances).
 * Solo lee settings/planConfig — settings/ai (API key) queda fuera.
 */
export async function fetchBackupData(uid: string): Promise<BackupData> {
  const [txSnap, accSnap, catSnap, budSnap, debtSnap, goalSnap, recSnap, planSnap] =
    await Promise.all([
      getDocs(collection(db, `users/${uid}/transactions`)),
      getDocs(collection(db, `users/${uid}/accounts`)),
      getDocs(collection(db, `users/${uid}/categories`)),
      getDocs(collection(db, `users/${uid}/budgets`)),
      getDocs(collection(db, `users/${uid}/debts`)),
      getDocs(collection(db, `users/${uid}/savingsGoals`)),
      getDocs(collection(db, `users/${uid}/recurringPayments`)),
      getDoc(doc(db, `users/${uid}/settings/planConfig`)),
    ]);

  const docsOf = <T,>(snap: { docs: Array<{ id: string; data: () => unknown }> }): T[] =>
    snap.docs.map(d => serializeTimestamps({ id: d.id, ...(d.data() as Record<string, unknown>) }) as T);

  const categoryDocs = catSnap.docs.map(d => d.data() as { type: string; name: string });

  return {
    version: '2.0',
    exportDate: new Date().toISOString(),
    transactions: docsOf<Transaction>(txSnap),
    accounts: docsOf<Account>(accSnap),
    categories: {
      expense: categoryDocs.filter(c => c.type === 'expense').map(c => c.name),
      income: categoryDocs.filter(c => c.type === 'income').map(c => c.name),
    },
    budgets: docsOf<Budget>(budSnap),
    debts: docsOf<Debt>(debtSnap),
    savingsGoals: docsOf<SavingsGoal>(goalSnap),
    recurringPayments: docsOf<RecurringPayment>(recSnap),
    planConfig: planSnap.exists() ? (planSnap.data() as BackupPlanConfig) : null,
  };
}

/** Parsea y valida un archivo de backup. Lanza con mensaje legible si es inválido. */
export async function parseBackupFile(file: File): Promise<BackupData> {
  const content = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error('El archivo no es un JSON válido');
  }
  validateBackupStructure(data);
  return data as BackupData;
}

function validateBackupStructure(data: unknown): asserts data is BackupData {
  if (!data || typeof data !== 'object') {
    throw new Error('Archivo de respaldo inválido');
  }
  const record = data as Record<string, unknown>;
  if (typeof record.version !== 'string' || !SUPPORTED_VERSIONS.includes(record.version)) {
    throw new Error('Versión de respaldo no compatible (se admite 1.0 y 2.0)');
  }
  if (!Array.isArray(record.transactions) || !Array.isArray(record.accounts)) {
    throw new Error('Estructura de datos inválida');
  }
  const cats = record.categories as Record<string, unknown> | undefined;
  if (!cats || !Array.isArray(cats.expense) || !Array.isArray(cats.income)) {
    throw new Error('Categorías inválidas');
  }
  for (const key of ['budgets', 'debts', 'savingsGoals', 'recurringPayments'] as const) {
    if (record[key] !== undefined && !Array.isArray(record[key])) {
      throw new Error(`Estructura de datos inválida (${key})`);
    }
  }
}

/** Integridad referencial dentro del archivo, antes de escribir nada. */
function validateReferentialIntegrity(backupData: BackupData): void {
  const accountIds = new Set(backupData.accounts.map(a => a.id).filter(Boolean));
  const debtIds = new Set((backupData.debts ?? []).map(d => d.id).filter(Boolean));
  const allCategories = [
    ...backupData.categories.expense,
    ...backupData.categories.income,
    TRANSFER_CATEGORY,
  ];

  for (const transaction of backupData.transactions) {
    if (!accountIds.has(transaction.accountId)) {
      throw new Error(
        `Transacción "${transaction.description}" referencia una cuenta inexistente (${transaction.accountId})`
      );
    }
    if (transaction.toAccountId && !accountIds.has(transaction.toAccountId)) {
      throw new Error(
        `Transferencia "${transaction.description}" referencia una cuenta destino inexistente`
      );
    }
    if (backupData.version === '2.0' && transaction.debtId && !debtIds.has(transaction.debtId)) {
      throw new Error(
        `Transacción "${transaction.description}" referencia una deuda inexistente (${transaction.debtId})`
      );
    }
    if (!allCategories.includes(transaction.category)) {
      logger.warn('Transaction with unknown category', {
        category: transaction.category,
        transaction: transaction.description,
      });
    }
  }

  // accountId opcional en debts/goals/recurring: si no está en el backup, warning
  // (se importa sin remap; el campo es opcional y la app lo tolera).
  for (const d of backupData.debts ?? []) {
    if (d.accountId && !accountIds.has(d.accountId)) {
      logger.warn('Debt references account not in backup', { debt: d.personName });
    }
  }
  for (const g of backupData.savingsGoals ?? []) {
    if (g.accountId && !accountIds.has(g.accountId)) {
      logger.warn('Goal references account not in backup', { goal: g.name });
    }
  }
  for (const r of backupData.recurringPayments ?? []) {
    if (r.accountId && !accountIds.has(r.accountId)) {
      logger.warn('Recurring references account not in backup', { recurring: r.name });
    }
  }
}

export const useBackup = ({ categories, userId }: UseBackupProps) => {
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  /** Exporta todos los datos del usuario (leídos de Firestore) a un JSON. */
  const exportData = useCallback(async (): Promise<boolean> => {
    if (!userId) {
      showToast.error('Debes iniciar sesión para exportar datos');
      return false;
    }
    setIsExporting(true);
    try {
      const data = await fetchBackupData(userId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `moneytrack_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast.success('Datos exportados correctamente');
      logger.info('Backup exported successfully', {
        transactionsCount: data.transactions.length,
        accountsCount: data.accounts.length,
      });
      return true;
    } catch (error) {
      logger.error('Error exporting backup', error);
      showToast.error('Error al exportar datos');
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [userId]);

  /**
   * Captura (SOLO LECTURA) las refs de todos los docs existentes del usuario en
   * las colecciones del backup, sin borrar nada. Estrategia "replace": se borran
   * DESPUÉS de escribir lo nuevo (write-then-delete). Audit C1.
   */
  const snapshotExistingRefs = async (uid: string): Promise<DocumentReference[]> => {
    const snapshots = await Promise.all(
      BACKUP_COLLECTIONS.map(name => getDocs(collection(db, `users/${uid}/${name}`)))
    );
    return snapshots.flatMap((snap, i) =>
      snap.docs.map(d => doc(db, `users/${uid}/${BACKUP_COLLECTIONS[i]}`, d.id))
    );
  };

  /** Borra en batches (límite 500 de Firestore) refs ya capturadas. */
  const deleteRefsInBatches = async (refs: DocumentReference[]): Promise<void> => {
    for (let i = 0; i < refs.length; i += 499) {
      const batch = writeBatch(db);
      refs.slice(i, i + 499).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  };

  /** Importa datos con batch writes. Orden: accounts → debts → goals/recurring/budgets/categories → transactions. */
  const importDataToFirestore = async (
    uid: string,
    backupData: BackupData,
    strategy: ImportStrategy
  ): Promise<void> => {
    logger.info('Starting data import', { strategy, itemsCount: backupData.transactions.length });

    // SWAP SEGURO (write-then-delete + rollback), ver test backupReplaceAtomic. Audit C1.
    let oldRefs: DocumentReference[] = [];
    if (strategy === 'replace') {
      logger.info('Replace: snapshotting existing data before import (no deletion yet)');
      oldRefs = await snapshotExistingRefs(uid);
    }

    setImportProgress(20);

    const BATCH_SIZE = 500;
    let batch = writeBatch(db);
    let operationCount = 0;
    const writtenRefs: DocumentReference[] = [];

    const commitIfNeeded = async () => {
      if (operationCount >= BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    };
    const flushBatch = async () => {
      if (operationCount > 0) {
        await batch.commit();
        batch = writeBatch(db);
        operationCount = 0;
      }
    };
    const setInBatch = (collectionPath: string, data: Record<string, unknown>): string => {
      const ref = doc(collection(db, collectionPath));
      writtenRefs.push(ref);
      batch.set(ref, data);
      operationCount++;
      return ref.id;
    };

    try {
      // 1. Cuentas → accountIdMap (viejo → nuevo)
      const accountIdMap = new Map<string, string>();
      for (const account of backupData.accounts) {
        const { id: oldId, ...accountData } = account;
        const newId = setInBatch(`users/${uid}/accounts`, {
          ...accountData,
          createdAt: accountData.createdAt ? new Date(accountData.createdAt) : new Date(),
        });
        if (oldId) accountIdMap.set(oldId, newId);
        await commitIfNeeded();
      }
      await flushBatch();
      setImportProgress(35);

      const remapAccount = (id: string | undefined): string | undefined =>
        id ? (accountIdMap.get(id) ?? id) : undefined;

      // 2. Deudas → debtIdMap; remap accountId
      const debtIdMap = new Map<string, string>();
      for (const debt of backupData.debts ?? []) {
        const { id: oldId, ...debtData } = reviveDates(
          debt as unknown as Record<string, unknown>,
          ['lentDate', 'dueDate', 'createdAt', 'settledAt']
        ) as Debt;
        const mappedAccountId = remapAccount(debtData.accountId);
        const newId = setInBatch(`users/${uid}/debts`, {
          ...debtData,
          ...(mappedAccountId !== undefined && { accountId: mappedAccountId }),
        });
        if (oldId) debtIdMap.set(oldId, newId);
        await commitIfNeeded();
      }
      await flushBatch();
      setImportProgress(45);

      // 3. Metas, recurrentes, presupuestos (remap accountId donde aplica)
      for (const goal of backupData.savingsGoals ?? []) {
        const { id: _id, ...goalData } = reviveDates(
          goal as unknown as Record<string, unknown>,
          ['targetDate', 'createdAt', 'completedAt']
        ) as SavingsGoal;
        const mappedAccountId = remapAccount(goalData.accountId);
        setInBatch(`users/${uid}/savingsGoals`, {
          ...goalData,
          ...(mappedAccountId !== undefined && { accountId: mappedAccountId }),
        });
        await commitIfNeeded();
      }
      for (const recurring of backupData.recurringPayments ?? []) {
        const { id: _id, ...recData } = reviveDates(
          recurring as unknown as Record<string, unknown>,
          ['createdAt', 'lastPaidDate']
        ) as RecurringPayment;
        const mappedAccountId = remapAccount(recData.accountId);
        setInBatch(`users/${uid}/recurringPayments`, {
          ...recData,
          ...(mappedAccountId !== undefined && { accountId: mappedAccountId }),
        });
        await commitIfNeeded();
      }
      for (const budget of backupData.budgets ?? []) {
        const { id: _id, ...budgetData } = reviveDates(
          budget as unknown as Record<string, unknown>,
          ['createdAt']
        ) as Budget;
        setInBatch(`users/${uid}/budgets`, { ...budgetData });
        await commitIfNeeded();
      }
      await flushBatch();
      setImportProgress(55);

      // 4. Categorías personalizadas
      //    - replace: TODAS las del backup (las viejas se borran al final).
      //    - merge: solo las que no existan ya en la app.
      const existingCategories = new Set([...categories.expense, ...categories.income]);
      const shouldImportCategory = (cat: string): boolean =>
        strategy === 'replace' || !existingCategories.has(cat);

      for (const category of backupData.categories.expense.filter(shouldImportCategory)) {
        setInBatch(`users/${uid}/categories`, { type: 'expense', name: category });
        await commitIfNeeded();
      }
      for (const category of backupData.categories.income.filter(shouldImportCategory)) {
        setInBatch(`users/${uid}/categories`, { type: 'income', name: category });
        await commitIfNeeded();
      }
      await flushBatch();
      setImportProgress(65);

      // 5. Transacciones AL FINAL (necesitan accountIdMap y debtIdMap completos)
      for (const transaction of backupData.transactions) {
        const { id: _id, ...transactionData } = transaction;
        const mappedAccountId = accountIdMap.get(transactionData.accountId) ?? transactionData.accountId;
        const mappedToAccountId = transactionData.toAccountId
          ? (accountIdMap.get(transactionData.toAccountId) ?? transactionData.toAccountId)
          : undefined;
        const mappedDebtId = transactionData.debtId
          ? (debtIdMap.get(transactionData.debtId) ?? transactionData.debtId)
          : undefined;
        setInBatch(`users/${uid}/transactions`, {
          ...transactionData,
          accountId: mappedAccountId,
          ...(mappedToAccountId !== undefined && { toAccountId: mappedToAccountId }),
          ...(mappedDebtId !== undefined && { debtId: mappedDebtId }),
          date: transactionData.date ? new Date(transactionData.date) : new Date(),
          createdAt: transactionData.createdAt ? new Date(transactionData.createdAt) : new Date(),
        });
        await commitIfNeeded();
      }
      await flushBatch();
      setImportProgress(80);

      // 6. planConfig (doc singleton en settings; settings/ai JAMÁS se toca).
      //    Último write dentro del try: si falla, no se ha sobrescrito nada de él
      //    (setDoc/deleteDoc son atómicos por doc) y el rollback de colecciones aplica.
      const planConfigRef = doc(db, `users/${uid}/settings/planConfig`);
      if (strategy === 'replace') {
        if (backupData.planConfig) {
          await setDoc(planConfigRef, backupData.planConfig);
        } else {
          await deleteDoc(planConfigRef);
        }
      } else if (backupData.planConfig) {
        const existing = await getDoc(planConfigRef);
        if (!existing.exists()) {
          await setDoc(planConfigRef, backupData.planConfig);
        }
      }
      setImportProgress(85);
    } catch (error) {
      // ROLLBACK: borrar los docs nuevos ya escritos. Los viejos nunca se tocaron. Audit C1.
      logger.error('Import write phase failed — rolling back partial writes', error, { written: writtenRefs.length });
      try {
        await deleteRefsInBatches(writtenRefs);
      } catch (rollbackError) {
        logger.error('Rollback of partial import also failed; some new docs may remain', rollbackError);
      }
      throw error;
    }

    // 7. REPLACE: borrar lo viejo solo tras éxito total. Un fallo aquí NO pierde datos
    //    (lo nuevo está completo): 1 retry y, si persiste, aviso de duplicados.
    if (strategy === 'replace' && oldRefs.length > 0) {
      logger.info('Replace: deleting previous data after successful import', { count: oldRefs.length });
      setImportProgress(90);
      try {
        await deleteRefsInBatches(oldRefs);
      } catch (firstError) {
        logger.warn('Old-data cleanup failed, retrying once', { error: String(firstError) });
        try {
          await deleteRefsInBatches(oldRefs);
        } catch (retryError) {
          logger.error('Old-data cleanup failed after retry', retryError);
          showToast.error(
            'Restauración completa, pero la limpieza de datos antiguos quedó parcial: pueden verse duplicados.'
          );
        }
      }
    }

    setImportProgress(100);
    logger.info('Data import completed successfully');
  };

  /** Importa desde un archivo JSON. Devuelve true si terminó con éxito. */
  const importData = useCallback(
    async (file: File, strategy: ImportStrategy = 'merge'): Promise<boolean> => {
      if (!userId) {
        showToast.error('Debes iniciar sesión para importar datos');
        return false;
      }

      setIsImporting(true);
      setImportProgress(0);

      try {
        const backupData = await parseBackupFile(file);

        if (backupData.version === '1.0' && strategy === 'replace') {
          throw new Error(
            'Un respaldo v1.0 solo puede importarse en modo combinar: el formato viejo no incluye deudas, metas ni recurrentes, y reemplazar borraría esos datos.'
          );
        }
        setImportProgress(10);

        validateReferentialIntegrity(backupData);

        await importDataToFirestore(userId, backupData, strategy);

        showToast.success(
          `Datos importados correctamente (${backupData.transactions.length} transacciones, ${backupData.accounts.length} cuentas)`
        );
        logger.info('Import completed successfully', {
          transactions: backupData.transactions.length,
          accounts: backupData.accounts.length,
          strategy,
        });
        return true;
      } catch (error) {
        logger.error('Error importing data', error);
        showToast.error(
          error instanceof Error ? error.message : 'Error al importar datos'
        );
        return false;
      } finally {
        setIsImporting(false);
        setImportProgress(0);
      }
    },
    [userId, categories]
  );

  return {
    exportData,
    importData,
    isImporting,
    isExporting,
    importProgress,
  };
};
```

Nota: el campo `paid` y demás campos de `Transaction` pasan por el spread tal cual; los datos vienen de `JSON.parse` así que no pueden contener `undefined` (no hace falta strip).

- [ ] **Step 4: Correr el test nuevo**

Run: `npx vitest run src/__tests__/hooks/useBackupV2.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Actualizar el test legacy**

`src/__tests__/hooks/backupReplaceAtomic.test.ts` rompe por tres motivos: (a) `replace` con v1.0 ahora se rechaza, (b) `UseBackupProps` ya no recibe `transactions`/`accounts`/`refreshData`, (c) el mock de `firebase/firestore` no expone `getDoc`/`setDoc`/`deleteDoc`.

Cambios:

1. Al `vi.mock('firebase/firestore', ...)` agregar al objeto retornado:

```ts
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
    setDoc: vi.fn(async () => {}),
    deleteDoc: vi.fn(async () => {}),
```

2. Reemplazar `hookProps` por:

```ts
const hookProps = {
  categories: { expense: [], income: [] },
  userId: 'user-1',
};
```

3. Cambiar el fixture `BACKUP` a versión 2.0 (los 4 tests del archivo lo usan; con v1.0 los de replace serían rechazados antes de escribir):

```ts
const BACKUP: BackupData = {
  version: '2.0',
  exportDate: '2026-01-01T00:00:00.000Z',
  accounts: [
    // @ts-expect-error tipo simplificado para el test
    { id: 'a1', name: 'Cuenta', type: 'cash', balance: 0, currency: 'COP', color: '#000' },
  ],
  categories: {
    expense: ['Comida', 'Transporte'],
    income: ['Salario'],
  },
  transactions: [
    {
      // @ts-expect-error tipo simplificado para el test
      id: 't1',
      type: 'expense',
      amount: 100,
      category: 'Comida',
      description: 'Café',
      date: new Date('2026-01-01'),
      paid: true,
      accountId: 'a1',
    },
  ],
};
```

4. El mock de `getDocs` del archivo legacy genera ids `old-tx`/`old-acc`/`old-cat` según el path; con 7 colecciones el fallback `old-cat` cubre las nuevas — los asserts por prefijo `old-`/`auto-` siguen válidos. El mock de `doc(...)` con 2 args (`doc(db, 'users/.../settings/planConfig')`) debe devolver `{ id: 'planConfig' }`; ajustar el mock:

```ts
  const doc = (...args: unknown[]) => {
    if (args.length >= 3) {
      return { id: args[2] as string };
    }
    if (typeof args[1] === 'string') {
      return { id: 'planConfig' };
    }
    autoId += 1;
    return { id: `auto-${autoId}` };
  };
```

- [ ] **Step 6: Correr ambos archivos**

Run: `npx vitest run src/__tests__/hooks/useBackupV2.test.ts src/__tests__/hooks/backupReplaceAtomic.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck + suite completa**

Run: `npm run typecheck; if ($?) { npm run test:run }`
Expected: PASS (ningún otro archivo importa `useBackup`)

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useBackup.ts src/__tests__/hooks/useBackupV2.test.ts src/__tests__/hooks/backupReplaceAtomic.test.ts
git commit -m "feat(backup): motor v2.0 — export completo via getDocs, import 7 colecciones con remap"
```

---

### Task 3: UI — `BackupModal`

**Files:**
- Create: `src/components/modals/BackupModal.tsx`
- Test: `src/__tests__/components/BackupModal.test.tsx`

- [ ] **Step 1: Test del gate de replace (falla)**

Crear `src/__tests__/components/BackupModal.test.tsx`:

```tsx
/**
 * Gate de seguridad del restore "replace": el botón Restaurar queda
 * deshabilitado hasta descargar un respaldo del estado actual, y el gate
 * se resetea al cambiar el archivo seleccionado.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const exportDataMock = vi.fn(async () => true);
const importDataMock = vi.fn(async () => true);

vi.mock('../../hooks/useBackup', () => ({
  useBackup: () => ({
    exportData: exportDataMock,
    importData: importDataMock,
    isImporting: false,
    isExporting: false,
    importProgress: 0,
  }),
  parseBackupFile: vi.fn(async () => ({
    version: '2.0',
    exportDate: '2026-06-01T00:00:00.000Z',
    transactions: [{}, {}],
    accounts: [{}],
    categories: { expense: ['Comida'], income: [] },
    budgets: [],
    debts: [],
    savingsGoals: [],
    recurringPayments: [],
    planConfig: null,
  })),
}));

import { BackupModal } from '../../components/modals/BackupModal';

function selectFile() {
  const input = screen.getByLabelText(/seleccionar archivo/i) as HTMLInputElement;
  const file = new File(['{}'], 'backup.json', { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
}

describe('BackupModal — gate de replace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal() {
    return render(
      <BackupModal
        isOpen={true}
        onClose={() => {}}
        userId="u1"
        categories={{ expense: [], income: [] }}
      />
    );
  }

  it('merge: Restaurar se habilita sin gate', async () => {
    renderModal();
    selectFile();
    await waitFor(() => screen.getByText(/2 transacciones/i));
    expect(screen.getByRole('button', { name: /restaurar/i })).toBeEnabled();
  });

  it('replace: Restaurar deshabilitado hasta descargar el respaldo actual', async () => {
    renderModal();
    selectFile();
    await waitFor(() => screen.getByText(/2 transacciones/i));

    fireEvent.click(screen.getByLabelText(/reemplazar/i));
    expect(screen.getByRole('button', { name: /restaurar/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /descargar respaldo actual/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /restaurar/i })).toBeEnabled()
    );
    expect(exportDataMock).toHaveBeenCalled();
  });

  it('el gate se resetea al cambiar el archivo', async () => {
    renderModal();
    selectFile();
    await waitFor(() => screen.getByText(/2 transacciones/i));
    fireEvent.click(screen.getByLabelText(/reemplazar/i));
    fireEvent.click(screen.getByRole('button', { name: /descargar respaldo actual/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /restaurar/i })).toBeEnabled()
    );

    selectFile(); // nuevo archivo → gate cae
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /restaurar/i })).toBeDisabled()
    );
  });

  it('v1.0 deshabilita la opción reemplazar', async () => {
    const { parseBackupFile } = await import('../../hooks/useBackup');
    (parseBackupFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      version: '1.0',
      exportDate: '2026-06-01T00:00:00.000Z',
      transactions: [],
      accounts: [],
      categories: { expense: [], income: [] },
    });
    renderModal();
    selectFile();
    await waitFor(() => screen.getByText(/v1\.0/i));
    expect(screen.getByLabelText(/reemplazar/i)).toBeDisabled();
  });
});
```

Si `toBeEnabled`/`toBeDisabled` no existen (falta `@testing-library/jest-dom`), revisar `src/__tests__` o `vitest.setup` por el patrón usado en el repo; alternativa sin jest-dom: `expect((btn as HTMLButtonElement).disabled).toBe(true)`.

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/__tests__/components/BackupModal.test.tsx`
Expected: FAIL — `BackupModal` no existe

- [ ] **Step 3: Implementar `src/components/modals/BackupModal.tsx`**

```tsx
'use client';

/**
 * BackupModal — Exportar y restaurar todos los datos del usuario.
 *
 * Seguridad del restore (HU-01 / audit C1):
 * - merge por defecto; replace exige descargar primero un respaldo del estado actual.
 * - Un respaldo v1.0 solo admite merge (el formato viejo no cubre deudas/metas/recurrentes).
 * - Durante el import el modal no se puede cerrar y beforeunload avisa al usuario.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle2, FileJson } from 'lucide-react';
import { BaseModal } from './BaseModal';
import { useBackup, parseBackupFile } from '../../hooks/useBackup';
import type { BackupData, Categories } from '../../types/finance';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  categories: Categories;
}

type Strategy = 'merge' | 'replace';

interface ImportSummary {
  transactions: number;
  accounts: number;
}

export function BackupModal({ isOpen, onClose, userId, categories }: BackupModalProps) {
  const { exportData, importData, isImporting, isExporting, importProgress } = useBackup({
    categories,
    userId,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<BackupData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Strategy>('merge');
  const [hasCurrentBackup, setHasCurrentBackup] = useState(false);
  const [doneSummary, setDoneSummary] = useState<ImportSummary | null>(null);

  const isV1 = parsed?.version === '1.0';

  // Aviso del navegador si cierran la pestaña a mitad de restore.
  useEffect(() => {
    if (!isImporting) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isImporting]);

  const resetFileState = useCallback(() => {
    setParsed(null);
    setParseError(null);
    setStrategy('merge');
    setHasCurrentBackup(false);
    setDoneSummary(null);
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setSelectedFile(file);
      resetFileState();
      if (!file) return;
      try {
        const data = await parseBackupFile(file);
        setParsed(data);
      } catch (error) {
        setParseError(error instanceof Error ? error.message : 'Archivo inválido');
      }
    },
    [resetFileState]
  );

  const handleDownloadCurrent = useCallback(async () => {
    const ok = await exportData();
    if (ok) setHasCurrentBackup(true);
  }, [exportData]);

  const handleRestore = useCallback(async () => {
    if (!selectedFile || !parsed) return;
    const ok = await importData(selectedFile, strategy);
    if (ok) {
      setDoneSummary({
        transactions: parsed.transactions.length,
        accounts: parsed.accounts.length,
      });
    }
  }, [selectedFile, parsed, strategy, importData]);

  const restoreDisabled =
    !parsed || isImporting || (strategy === 'replace' && !hasCurrentBackup);

  const handleClose = useCallback(() => {
    if (isImporting) return; // no cerrable durante el import
    onClose();
  }, [isImporting, onClose]);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Respaldo de datos"
      titleIcon={<FileJson size={20} className="text-purple-600" aria-hidden="true" />}
      maxWidth="max-w-lg"
      showCloseButton={!isImporting}
      closeOnBackdrop={!isImporting}
      closeOnEscape={!isImporting}
    >
      <div className="space-y-6">
        {/* ── Exportar ─────────────────────────────────────────────── */}
        <section aria-labelledby="backup-export-title">
          <h4 id="backup-export-title" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Exportar
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Descarga un archivo con todas tus transacciones, cuentas, categorías,
            presupuestos, deudas, metas, pagos recurrentes y plan financiero.
            La clave de IA y las notificaciones no se incluyen.
          </p>
          <button
            onClick={() => void exportData()}
            disabled={isExporting || isImporting}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Download size={16} aria-hidden="true" />
            {isExporting ? 'Preparando…' : 'Descargar respaldo (.json)'}
          </button>
        </section>

        <hr className="border-gray-100 dark:border-gray-700" />

        {/* ── Restaurar ────────────────────────────────────────────── */}
        <section aria-labelledby="backup-restore-title">
          <h4 id="backup-restore-title" className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Restaurar
          </h4>

          {doneSummary ? (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-sm text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium">Restauración completa</p>
                <p>
                  {doneSummary.transactions} transacciones y {doneSummary.accounts} cuentas importadas.
                </p>
              </div>
            </div>
          ) : (
            <>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                Seleccionar archivo
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileChange}
                  disabled={isImporting}
                  className="block w-full mt-1 text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-700 file:text-gray-700 dark:file:text-gray-200 file:text-sm file:font-medium hover:file:bg-gray-200 dark:hover:file:bg-gray-600 file:cursor-pointer"
                />
              </label>

              {parseError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-sm text-rose-700 dark:text-rose-300" role="alert">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{parseError}</span>
                </div>
              )}

              {parsed && (
                <div className="space-y-4 mt-3">
                  {/* Resumen previo */}
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/40 text-sm text-gray-700 dark:text-gray-300">
                    <p className="font-medium mb-1">
                      Respaldo v{parsed.version} · {new Date(parsed.exportDate).toLocaleDateString('es-CO')}
                    </p>
                    <p>
                      {parsed.transactions.length} transacciones · {parsed.accounts.length} cuentas
                      {parsed.debts ? ` · ${parsed.debts.length} deudas` : ''}
                      {parsed.savingsGoals ? ` · ${parsed.savingsGoals.length} metas` : ''}
                      {parsed.recurringPayments ? ` · ${parsed.recurringPayments.length} recurrentes` : ''}
                      {parsed.budgets ? ` · ${parsed.budgets.length} presupuestos` : ''}
                    </p>
                  </div>

                  {/* Estrategia */}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-gray-900 dark:text-white">Estrategia</legend>
                    <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="radio"
                        name="backup-strategy"
                        checked={strategy === 'merge'}
                        onChange={() => setStrategy('merge')}
                        disabled={isImporting}
                        className="mt-0.5"
                        aria-label="Combinar"
                      />
                      <span>
                        <strong>Combinar</strong> — agrega lo del respaldo a tus datos actuales.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="radio"
                        name="backup-strategy"
                        checked={strategy === 'replace'}
                        onChange={() => setStrategy('replace')}
                        disabled={isImporting || isV1}
                        className="mt-0.5"
                        aria-label="Reemplazar"
                      />
                      <span>
                        <strong>Reemplazar</strong> — borra tus datos actuales y deja solo lo del respaldo.
                        {isV1 && (
                          <span className="block text-xs text-amber-600 dark:text-amber-400">
                            No disponible para respaldos v1.0 (no incluyen deudas, metas ni recurrentes).
                          </span>
                        )}
                      </span>
                    </label>
                  </fieldset>

                  {/* Gate de replace */}
                  {strategy === 'replace' && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-200 space-y-2">
                      <p className="flex items-start gap-2">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                        <span>
                          Reemplazar borra todos tus datos actuales. Descarga primero un respaldo
                          del estado actual para poder volver atrás.
                        </span>
                      </p>
                      <button
                        onClick={() => void handleDownloadCurrent()}
                        disabled={isExporting || isImporting}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <Download size={14} aria-hidden="true" />
                        {hasCurrentBackup ? 'Respaldo actual descargado ✓' : 'Descargar respaldo actual'}
                      </button>
                    </div>
                  )}

                  {/* Progreso */}
                  {isImporting && (
                    <div>
                      <div
                        className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
                        role="progressbar"
                        aria-valuenow={importProgress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Progreso de la restauración"
                      >
                        <div
                          className="h-full bg-purple-600 transition-all duration-300"
                          style={{ width: `${importProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Restaurando… no cierres esta pestaña.
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => void handleRestore()}
                    disabled={restoreDisabled}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  >
                    <Upload size={16} aria-hidden="true" />
                    {isImporting ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </BaseModal>
  );
}
```

- [ ] **Step 4: Correr el test**

Run: `npx vitest run src/__tests__/components/BackupModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/BackupModal.tsx src/__tests__/components/BackupModal.test.tsx
git commit -m "feat(backup): modal de respaldo con gate de export forzado antes de replace"
```

---

### Task 4: Cableado — Header + finance-tracker

**Files:**
- Modify: `src/components/layout/Header.tsx` (props ~líneas 10-42; menú ~línea 261)
- Modify: `src/finance-tracker.tsx` (imports ~línea 15; estados ~línea 185; handlers ~línea 317; render modales ~línea 512; props del Header ~línea 534)

- [ ] **Step 1: Header — prop e ítem de menú**

En `HeaderProps` agregar después de `onOpenNotificationPreferences`:

```ts
  onOpenBackup: () => void;
```

Agregar `onOpenBackup` al destructuring del componente (junto a `onOpenNotificationPreferences`).

En el import de lucide-react agregar `DatabaseBackup`:

```ts
import { LogIn, LogOut, User as UserIcon, Settings, HelpCircle, Tag, Bell, Sparkles, DatabaseBackup } from 'lucide-react';
```

Insertar tras el bloque del ítem "Notificaciones" (después de la línea 261, dentro del mismo `{user && ...}` no — es un bloque aparte, mismo patrón):

```tsx
                  {user && (
                    <button
                      onClick={() => {
                        onOpenBackup();
                        setShowSettingsMenu(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      role="menuitem"
                    >
                      <DatabaseBackup size={18} aria-hidden="true" />
                      <span>Respaldo de datos</span>
                    </button>
                  )}
```

- [ ] **Step 2: finance-tracker — estado, handlers, montaje**

Import (junto a los otros modales, ~línea 15):

```ts
import { BackupModal } from './components/modals/BackupModal';
```

Estado (junto a `showCategoriesModal`, ~línea 183):

```ts
  const [showBackupModal, setShowBackupModal] = useState(false);
```

Handlers (junto a `handleOpenCategories`, ~línea 317):

```ts
  const handleOpenBackup = useCallback(() => setShowBackupModal(true), []);
  const handleCloseBackup = useCallback(() => setShowBackupModal(false), []);
```

Montaje (tras `NotificationPreferencesModal`, ~línea 512; `user`, `categories` ya están en scope vía `useFinance()`):

```tsx
      {user && (
        <BackupModal
          isOpen={showBackupModal}
          onClose={handleCloseBackup}
          userId={user.uid}
          categories={categories}
        />
      )}
```

Prop al Header (~línea 534, junto a `onOpenNotificationPreferences`):

```tsx
        onOpenBackup={handleOpenBackup}
```

Nota: NO agregar `setShowBackupModal(false)` al atajo Escape global de la línea 264 — ese handler cierra modales sin pasar por la guarda de `isImporting`; el cierre del BackupModal lo gobierna su propio `handleClose` vía BaseModal.

- [ ] **Step 3: Typecheck + suite + build**

Run: `npm run typecheck; if ($?) { npm run test:run }`
Expected: PASS

- [ ] **Step 4: Verificación manual (smoke)**

Run: `npm run dev` y abrir la app logueado.
Verificar: menú ajustes muestra "Respaldo de datos" → modal abre → "Descargar respaldo (.json)" descarga archivo con las 7 colecciones → seleccionar ese archivo muestra resumen → "Reemplazar" deshabilita Restaurar hasta descargar respaldo actual → restore merge funciona y la UI se actualiza sola (onSnapshot).
Como invitado: el ítem NO aparece.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Header.tsx src/finance-tracker.tsx
git commit -m "feat(backup): entrada de respaldo en menu ajustes y montaje del modal"
```

---

### Task 5: Cierre — auditoría y memoria

**Files:**
- Modify: `docs/AUDITORIA-PROFUNDA.md` (sección C1, línea ~28)

- [ ] **Step 1: Marcar C1/M-prod-backup como resuelto**

En `docs/AUDITORIA-PROFUNDA.md`, en el encabezado de C1 agregar al final del título: ` — ✅ RESUELTO (motor con swap seguro + UI cableada con gate de export, ver docs/superpowers/specs/2026-06-12-backup-restore-design.md)`. Si existe la entrada M-prod-backup en hallazgos medios, marcarla igual.

- [ ] **Step 2: Commit final**

```bash
git add docs/AUDITORIA-PROFUNDA.md
git commit -m "docs(auditoria): C1 backup resuelto — motor v2 + UI con gate"
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de spec:** export getDocs (Task 2), 7 colecciones + planConfig (Task 2), remap completo (Task 2), v1.0 solo merge (Task 2 motor + Task 3 UI), gate de export forzado (Task 3), no-cerrable + beforeunload (Task 3), retry de limpieza con aviso (Task 2), settings/ai intocable (Task 2 tests), menú solo logueados (Task 4), resumen previo y final (Task 3). Mensajes de error de la spec: integrados en motor y modal.
- **Placeholders:** ninguno; todo el código está completo.
- **Consistencia de tipos:** `UseBackupProps {categories, userId}` usado igual en tests legacy actualizados, test v2 y BackupModal; `exportData(): Promise<boolean>`, `importData(): Promise<boolean>` consistentes entre motor, mocks del test de UI y modal; `BackupPlanConfig` definido en Task 1 y usado en Task 2.
