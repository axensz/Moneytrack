/**
 * Integration test del pipeline de importación
 *
 * Pipeline completo: parse CSV fixture → route → dedup → importTransactions
 * con Firestore batch mockeado.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { parseCSV } from '../../utils/csvParser';
import { routeRows } from '../../hooks/useImportWizard';
import { useImportDedup } from '../../hooks/useImportDedup';
import { useImportTransactions } from '../../hooks/useImportTransactions';
import type { ImportRow } from '../../hooks/useImportTransactions';
import type { Account, Transaction } from '../../types/finance';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock firebase/firestore at module level
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);
const mockWriteBatch = vi.fn((..._args: unknown[]) => ({
  set: mockSet,
  update: mockUpdate,
  commit: mockCommit,
}));
const mockDoc = vi.fn((...args: unknown[]) => {
  const pathSegments = args.slice(1) as string[];
  return {
    id: `mock-doc-${pathSegments.join('-')}-${Math.random().toString(36).slice(2, 8)}`,
    path: pathSegments.join('/'),
  };
});
const mockCollection = vi.fn((...args: unknown[]) => ({ path: args[1] as string }));
const mockIncrement = vi.fn((value: number) => ({ __increment: value }));

vi.mock('firebase/firestore', () => ({
  writeBatch: (...args: unknown[]) => mockWriteBatch(...args),
  doc: (...args: unknown[]) => mockDoc(...args),
  collection: (...args: unknown[]) => mockCollection(...args),
  increment: (value: number) => mockIncrement(value),
}));

vi.mock('../../lib/firebase', () => ({
  db: { type: 'mock-firestore' },
  isFirebaseConfigured: true,
}));

vi.mock('../../utils/importBatchFlag', () => ({
  setBatchImporting: vi.fn(),
  registerImportedIds: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Fixtures ───────────────────────────────────────────────────────────────

const CSV_FIXTURE = `Fecha,Descripción,Débito,Crédito
2024-06-01,Compra supermercado Exito,85000,
2024-06-02,Nómina mensual,,3500000
2024-06-03,Netflix suscripción,45900,
2024-06-03,Netflix suscripción,45900,
2024-06-04,PAGO PSE NU,500000,
2024-06-05,Restaurante El Corral,32000,
2024-06-06,Compra USD sin TRM,150,`;

// Same as row 1: should be detected as DB duplicate
const EXISTING_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-existing-1',
    type: 'expense',
    amount: 85000,
    category: 'Alimentación',
    description: 'Compra supermercado Exito',
    date: new Date(2024, 5, 1), // June 1
    paid: true,
    accountId: 'savings-1',
  },
];

const ACCOUNTS: Account[] = [
  {
    id: 'savings-1',
    name: 'Bancolombia Ahorros',
    type: 'savings',
    isDefault: true,
    initialBalance: 5000000,
  },
  {
    id: 'credit-1',
    name: 'Nu Card',
    type: 'credit',
    isDefault: false,
    initialBalance: 0,
    creditLimit: 3000000,
    cutoffDay: 15,
    paymentDay: 5,
    bankAccountId: 'savings-1',
    usedCredit: 200000,
  },
];

const CATEGORY_OPTIONS = [
  'Alimentación', 'Entretenimiento', 'Transporte', 'Salud', 'Otros',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Simulates the full pipeline: parse → route → dedup, returning ImportRow[]
 * ready for importTransactions.
 */
function runPipeline(
  csvText: string,
  accountId: string,
  existingTransactions: Transaction[],
  accounts: Account[],
): ImportRow[] {
  // Step 1: PARSE
  const parseResult = parseCSV(csvText);
  const parsedRows: ImportRow[] = parseResult.rows.map(r => ({
    date: r.date,
    description: r.description,
    amount: r.amount,
    type: r.type,
    category: r.suggestedCategory,
    suggestedCategory: r.suggestedCategory,
    categorySource: r.categorySource,
    accountId: '',
    include: true,
    isDuplicate: false,
    installments: r.installments,
    currentInstallment: r.currentInstallment,
    currency: r.currency,
    originalAmount: r.originalAmount,
    originalCurrency: r.originalCurrency,
    exchangeRate: r.exchangeRate,
    needsExchangeRate: r.needsExchangeRate,
  }));

  // Step 2: ROUTE
  const routed = routeRows(parsedRows, accountId, [], accounts, CATEGORY_OPTIONS);

  // Step 3: DEDUP (using hook)
  const { result } = renderHook(() => useImportDedup({ existingTransactions }));
  return result.current.markDuplicates(routed, accountId);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Import Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset doc mock to produce sequential IDs
    let docCounter = 0;
    mockDoc.mockImplementation((...args: unknown[]) => {
      const pathSegments = args.slice(1) as string[];
      return { id: `doc-${++docCounter}`, path: pathSegments.join('/') };
    });
  });

  describe('Requirement 8.1 — full pipeline parse → dedup → import', () => {
    it('parses CSV, routes, deduplicates, and imports to Firestore', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // Should have parsed all rows
      expect(rows.length).toBeGreaterThan(0);

      // Use importTransactions with the pipeline result
      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      const importResult = await result.current.importTransactions(rows);

      // Should have imported some rows and committed the batch
      expect(importResult.imported).toBeGreaterThan(0);
      expect(mockCommit).toHaveBeenCalled();
    });
  });

  describe('Requirement 8.2 — duplicate rows marked and excluded', () => {
    it('marks rows matching existing transactions as isDuplicate and excludes them', () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // Row 1: "Compra supermercado Exito" on June 1 for 85000 exists in DB
      const supermarketRow = rows.find(
        r => r.description === 'Compra supermercado Exito' && r.amount === 85000
      );
      expect(supermarketRow).toBeDefined();
      expect(supermarketRow!.isDuplicate).toBe(true);
      expect(supermarketRow!.include).toBe(false);
    });

    it('marks same-file duplicate rows (second occurrence) as isDuplicate', () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // Two identical "Netflix suscripción" rows: first should be included (but it's
      // a normal expense), second should be duplicate
      const netflixRows = rows.filter(
        r => r.description === 'Netflix suscripción' && r.amount === 45900
      );
      expect(netflixRows).toHaveLength(2);
      // First occurrence: NOT a duplicate
      expect(netflixRows[0].isDuplicate).toBe(false);
      // Second occurrence: IS a duplicate (same-file)
      expect(netflixRows[1].isDuplicate).toBe(true);
      expect(netflixRows[1].include).toBe(false);
    });

    it('excludes duplicates from Firestore writes', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(rows);

      // Verify that batch.set was NOT called for excluded rows
      const includedCount = rows.filter(r => r.include).length;
      expect(mockSet).toHaveBeenCalledTimes(includedCount);
    });
  });

  describe('Requirement 8.3 — transfers marked include: false', () => {
    it('marks internal transfer rows as include: false', () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // "PAGO PSE NU" is an internal transfer keyword
      const transferRow = rows.find(r => r.description === 'PAGO PSE NU');
      expect(transferRow).toBeDefined();
      expect(transferRow!.include).toBe(false);
    });

    it('routes transfer rows with correct toAccountId', () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // "PAGO PSE NU" should have been routed: accountId = savings-1, toAccountId = credit-1
      // (because credit-1 has bankAccountId = savings-1, making it the single linked card)
      const transferRow = rows.find(r => r.description === 'PAGO PSE NU');
      expect(transferRow).toBeDefined();
      expect(transferRow!.accountId).toBe('savings-1');
      expect(transferRow!.toAccountId).toBe('credit-1');
    });

    it('does not write transfer rows to Firestore', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(rows);

      // Verify none of the batch.set calls include a transfer description
      const setCalls = mockSet.mock.calls;
      for (const call of setCalls) {
        const data = call[1] as Record<string, unknown>;
        expect(data.description).not.toBe('PAGO PSE NU');
      }
    });
  });

  describe('Requirement 8.4 — writeBatch.set called for included rows, commit invoked', () => {
    it('calls batch.set once per included row', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(rows);

      const includedRows = rows.filter(r => r.include);
      expect(mockSet).toHaveBeenCalledTimes(includedRows.length);
    });

    it('calls batch.commit after writing all rows', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(rows);

      expect(mockCommit).toHaveBeenCalled();
    });

    it('writes correct transaction data to Firestore', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(rows);

      // Verify at least one set call has proper transaction structure
      expect(mockSet).toHaveBeenCalled();
      const firstSetCall = mockSet.mock.calls[0];
      const txData = firstSetCall[1] as Record<string, unknown>;
      expect(txData).toHaveProperty('type');
      expect(txData).toHaveProperty('amount');
      expect(txData).toHaveProperty('description');
      expect(txData).toHaveProperty('date');
      expect(txData).toHaveProperty('accountId');
      expect(txData).toHaveProperty('paid', true);
    });
  });

  describe('Requirement 8.5 — usedCredit incremented for credit card accounts', () => {
    it('increments usedCredit when importing expenses to a credit card', async () => {
      // Create rows directly assigned to a credit card account
      const creditCardRows: ImportRow[] = [
        {
          date: new Date(2024, 5, 10),
          description: 'Compra online',
          amount: 120000,
          type: 'expense',
          category: 'Entretenimiento',
          accountId: 'credit-1',
          include: true,
          isDuplicate: false,
        },
        {
          date: new Date(2024, 5, 11),
          description: 'Restaurante',
          amount: 65000,
          type: 'expense',
          category: 'Alimentación',
          accountId: 'credit-1',
          include: true,
          isDuplicate: false,
        },
      ];

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(creditCardRows);

      // Verify batch.update was called with increment for credit-1
      expect(mockUpdate).toHaveBeenCalled();

      // Find the update call for usedCredit
      const updateCalls = mockUpdate.mock.calls;
      const creditUpdate = updateCalls.find(call => {
        const data = call[1] as Record<string, unknown>;
        return data.usedCredit !== undefined;
      });

      expect(creditUpdate).toBeDefined();

      // The increment should be the sum of both expenses: 120000 + 65000 = 185000
      expect(mockIncrement).toHaveBeenCalledWith(185000);
    });

    it('decrements usedCredit when importing income (payments) to a credit card', async () => {
      const paymentRows: ImportRow[] = [
        {
          date: new Date(2024, 5, 15),
          description: 'Pago mínimo TC',
          amount: 200000,
          type: 'income',
          category: 'Pago Tarjeta',
          accountId: 'credit-1',
          include: true,
          isDuplicate: false,
        },
      ];

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(paymentRows);

      // Income on a credit card reduces usedCredit (negative delta)
      expect(mockIncrement).toHaveBeenCalledWith(-200000);
    });

    it('decrements usedCredit for transfers TO a credit card', async () => {
      const transferRows: ImportRow[] = [
        {
          date: new Date(2024, 5, 20),
          description: 'Pago TC desde ahorros',
          amount: 300000,
          type: 'transfer',
          category: 'Pago Tarjeta',
          accountId: 'savings-1',
          toAccountId: 'credit-1',
          include: true,
          isDuplicate: false,
        },
      ];

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      await result.current.importTransactions(transferRows);

      // Transfer to credit card reduces its usedCredit
      expect(mockIncrement).toHaveBeenCalledWith(-300000);
    });
  });

  describe('Requirement 8.6 — deterministic fixture data, no network calls', () => {
    it('completes import without any real network calls', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      const importResult = await result.current.importTransactions(rows);

      // All operations use mocked Firestore — no real network calls
      expect(importResult.errors).toHaveLength(0);
      expect(mockWriteBatch).toHaveBeenCalled();
      expect(mockCommit).toHaveBeenCalled();
    });

    it('produces consistent results across runs with the same fixture', () => {
      const rows1 = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);
      const rows2 = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // Same input → same output (deterministic)
      expect(rows1.length).toBe(rows2.length);
      rows1.forEach((row, idx) => {
        expect(row.isDuplicate).toBe(rows2[idx].isDuplicate);
        expect(row.include).toBe(rows2[idx].include);
        expect(row.description).toBe(rows2[idx].description);
        expect(row.amount).toBe(rows2[idx].amount);
      });
    });

    it('skips rows with needsExchangeRate during import', async () => {
      // The CSV fixture has a row "Compra USD sin TRM" which should have needsExchangeRate
      // due to unrecognized currency. However, parseCSV won't set that without currency column.
      // So we test with an explicit row:
      const rowsWithForeignCurrency: ImportRow[] = [
        {
          date: new Date(2024, 5, 6),
          description: 'Compra en USD sin TRM',
          amount: 150,
          type: 'expense',
          category: 'Otros',
          accountId: 'savings-1',
          include: true,
          isDuplicate: false,
          needsExchangeRate: true,
          originalCurrency: 'USD',
        },
        {
          date: new Date(2024, 5, 7),
          description: 'Compra normal en COP',
          amount: 50000,
          type: 'expense',
          category: 'Alimentación',
          accountId: 'savings-1',
          include: true,
          isDuplicate: false,
        },
      ];

      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      const importResult = await result.current.importTransactions(rowsWithForeignCurrency);

      // Only the COP row should be written; USD row skipped due to needsExchangeRate
      expect(mockSet).toHaveBeenCalledTimes(1);
      expect(importResult.imported).toBe(1);
    });
  });

  describe('Pipeline end-to-end summary', () => {
    it('full pipeline: parse → route → dedup → import with correct counts', async () => {
      const rows = runPipeline(CSV_FIXTURE, 'savings-1', EXISTING_TRANSACTIONS, ACCOUNTS);

      // Expected breakdown from fixture:
      // 1. "Compra supermercado Exito" - duplicate (exists in DB) → include: false
      // 2. "Nómina mensual" - income → include: true
      // 3. "Netflix suscripción" (first) - expense → include: true
      // 4. "Netflix suscripción" (second) - same-file duplicate → include: false
      // 5. "PAGO PSE NU" - internal transfer → include: false
      // 6. "Restaurante El Corral" - expense → include: true
      // 7. "Compra USD sin TRM" - parsed as expense (no currency column detected)

      const included = rows.filter(r => r.include);
      const excluded = rows.filter(r => !r.include);

      // At least 3 duplicates/transfers excluded
      expect(excluded.length).toBeGreaterThanOrEqual(3);
      // At least 3 rows included for import
      expect(included.length).toBeGreaterThanOrEqual(3);

      // Import the included rows
      const { result } = renderHook(() =>
        useImportTransactions('user-123', ACCOUNTS)
      );

      const importResult = await result.current.importTransactions(rows);
      expect(importResult.imported).toBe(included.length);
      expect(mockSet).toHaveBeenCalledTimes(included.length);
      expect(mockCommit).toHaveBeenCalledTimes(1);
    });
  });
});
