/**
 * Hook para importacion masiva de transacciones desde extracto bancario.
 * Usa writeBatch de Firestore para escrituras atomicas por lote.
 */

import { useCallback, useState } from 'react';
import { collection, doc, increment, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebaseDb';
import { logger } from '../utils/logger';
import { stripUndefined } from '../utils/firestoreHelpers';
import { setBatchImporting, registerImportedIds } from '../utils/importBatchFlag';
import { getCreditDelta } from '../utils/creditDeltas';
import { generateId } from '../utils/formatters';
import { useLocalStorage } from './useLocalStorage';
import type { Account, Transaction } from '../types/finance';

export interface ImportRow {
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  categorySource?: 'file' | 'rules';
  suggestedCategory?: string;
  accountId: string;
  toAccountId?: string;
  include: boolean;
  isDuplicate?: boolean;
  installments?: number;
  currentInstallment?: number;
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  needsExchangeRate?: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export type ImportStatus = 'idle' | 'importing' | 'done' | 'error';

const FIRESTORE_BATCH_LIMIT = 500;

function buildImportedTransaction(row: ImportRow): Omit<Transaction, 'id'> {
  const txData: Omit<Transaction, 'id'> = {
    type: row.type,
    amount: row.amount,
    category: row.category,
    description: row.description.trim(),
    date: row.date,
    paid: true,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    createdAt: row.date,
  };

  if (row.installments && row.installments > 1) {
    txData.installments = row.installments;
    txData.monthlyInstallmentAmount = Math.round((row.amount / row.installments) * 100) / 100;
  }

  if (row.originalCurrency && row.originalCurrency !== 'COP' && row.exchangeRate) {
    txData.currency = 'COP';
    txData.originalAmount = row.originalAmount;
    txData.originalCurrency = row.originalCurrency;
    txData.exchangeRate = row.exchangeRate;
  }

  return txData;
}

export function useImportTransactions(userId: string | null, accounts: Account[] = []) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [, setLocalTransactions] = useLocalStorage<Transaction[]>('transactions', []);

  const importTransactions = useCallback(
    async (rows: ImportRow[]): Promise<ImportResult> => {
      const selected = rows.filter(row => row.include);
      if (selected.length === 0) {
        const emptyResult: ImportResult = { imported: 0, skipped: rows.length, errors: [] };
        setResult(emptyResult);
        return emptyResult;
      }

      setStatus('importing');
      setProgress(0);
      setResult(null);
      setBatchImporting(true);

      const errors: string[] = [];
      let imported = 0;
      let invalidSkipped = 0;
      const importedDocIds: string[] = [];

      const accountIds = new Set(accounts.flatMap(account => account.id ? [account.id] : []));
      const accountsById = new Map(accounts.flatMap(account => account.id ? [[account.id, account] as const] : []));
      const creditAccounts = accounts.filter(account => account.type === 'credit' && account.id);

      const isValidRow = (row: ImportRow): boolean => {
        const sourceAccount = accountsById.get(row.accountId);

        if (row.type === 'transfer' && !row.toAccountId) {
          invalidSkipped++;
          errors.push(`Transferencia sin cuenta destino omitida: ${row.description}`);
          return false;
        }

        if (row.needsExchangeRate) {
          invalidSkipped++;
          errors.push(`Movimiento en ${row.originalCurrency ?? 'moneda extranjera'} sin TRM omitido: ${row.description}`);
          return false;
        }

        if (!Number.isFinite(row.amount) || row.amount <= 0) {
          invalidSkipped++;
          errors.push(`Monto invalido omitido: ${row.description || '(sin descripcion)'}`);
          return false;
        }

        if (!sourceAccount) {
          invalidSkipped++;
          errors.push(`Cuenta inexistente omitida: ${row.description || '(sin descripcion)'}`);
          return false;
        }

        if (row.type === 'transfer') {
          const destinationId = row.toAccountId ?? '';
          if (!accountIds.has(destinationId)) {
            invalidSkipped++;
            errors.push(`Cuenta destino inexistente omitida: ${row.description || '(sin descripcion)'}`);
            return false;
          }

          if (destinationId === row.accountId) {
            invalidSkipped++;
            errors.push(`Transferencia a la misma cuenta omitida: ${row.description || '(sin descripcion)'}`);
            return false;
          }

          if (sourceAccount.type === 'credit') {
            invalidSkipped++;
            errors.push(`Transferencia con origen de tarjeta omitida: ${row.description || '(sin descripcion)'}`);
            return false;
          }
        }

        return true;
      };

      try {
        if (!userId) {
          const validRows = selected.filter(isValidRow);
          const localImported = validRows.map(row => {
            const id = generateId();
            importedDocIds.push(id);
            return stripUndefined({
              ...buildImportedTransaction(row),
              id,
            } as Record<string, unknown>) as unknown as Transaction;
          });

          if (localImported.length > 0) {
            setLocalTransactions(previous => [...localImported, ...previous]);
          }

          imported = localImported.length;
          setProgress(100);
          const localResult: ImportResult = {
            imported,
            skipped: rows.length - selected.length + invalidSkipped,
            errors,
          };
          setResult(localResult);
          setStatus('done');
          registerImportedIds(importedDocIds);
          const delay = Math.max(10_000, Math.min(30_000, imported * 50));
          setTimeout(() => setBatchImporting(false), delay);
          return localResult;
        }

        const txCollection = collection(db, `users/${userId}/transactions`);
        const creditAccountWriteReserve = creditAccounts.length;
        const batchSize = Math.max(1, FIRESTORE_BATCH_LIMIT - creditAccountWriteReserve);

        for (let chunkStart = 0; chunkStart < selected.length; chunkStart += batchSize) {
          const chunk = selected.slice(chunkStart, chunkStart + batchSize);
          const validRows = chunk.filter(isValidRow);

          if (validRows.length === 0) {
            setProgress(Math.round(((chunkStart + chunk.length) / selected.length) * 100));
            continue;
          }

          const batch = writeBatch(db);
          const chunkDocIds: string[] = [];

          for (const row of validRows) {
            const txRef = doc(txCollection);
            chunkDocIds.push(txRef.id);
            const clean = stripUndefined(buildImportedTransaction(row) as Record<string, unknown>);
            batch.set(txRef, clean);
          }

          const creditDeltas = new Map<string, number>();
          validRows.forEach(row => {
            creditAccounts.forEach(account => {
              const delta = getCreditDelta(row, account.id!);
              if (delta !== 0) {
                creditDeltas.set(account.id!, (creditDeltas.get(account.id!) ?? 0) + delta);
              }
            });
          });

          creditDeltas.forEach((delta, accountId) => {
            batch.update(doc(db, `users/${userId}/accounts`, accountId), {
              usedCredit: increment(delta),
            });
          });

          await batch.commit();
          imported += validRows.length;
          importedDocIds.push(...chunkDocIds);
          setProgress(Math.round(((chunkStart + chunk.length) / selected.length) * 100));
          logger.info(`Import batch committed: ${chunkStart + chunk.length}/${selected.length}`);
        }

        const importResult: ImportResult = {
          imported,
          skipped: rows.length - selected.length + invalidSkipped,
          errors,
        };
        setResult(importResult);
        setStatus('done');
        registerImportedIds(importedDocIds);
        const delay = Math.max(10_000, Math.min(30_000, imported * 50));
        setTimeout(() => setBatchImporting(false), delay);
        return importResult;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido al importar';
        logger.error('Import failed', error);
        errors.push(msg);
        const importResult: ImportResult = { imported, skipped: rows.length - imported, errors };
        setResult(importResult);
        setStatus('error');
        if (importedDocIds.length > 0) registerImportedIds(importedDocIds);
        setBatchImporting(false);
        return importResult;
      }
    },
    [userId, accounts, setLocalTransactions]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
  }, []);

  return { importTransactions, status, progress, result, reset };
}
