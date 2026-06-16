/**
 * Hook para importación masiva de transacciones desde extracto bancario
 * Usa writeBatch de Firestore para escrituras atómicas en lotes de 499
 */

import { useCallback, useState } from 'react';
import { collection, doc, increment, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logger } from '../utils/logger';
import { stripUndefined } from '../utils/firestoreHelpers';
import { setBatchImporting, registerImportedIds } from '../utils/importBatchFlag';
import type { Account, Transaction } from '../types/finance';

export interface ImportRow {
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  categorySource?: 'file' | 'rules';
  accountId: string;
  toAccountId?: string;
  include: boolean;    // si el usuario la marcó para importar
  isDuplicate?: boolean; // posible duplicado detectado contra transacciones existentes
  installments?: number;
  currentInstallment?: number;
  // Multimoneda (opcional)
  currency?: string;
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  needsExchangeRate?: boolean; // moneda extranjera sin TRM
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export type ImportStatus = 'idle' | 'importing' | 'done' | 'error';

const FIRESTORE_BATCH_LIMIT = 500;

function getCreditDelta(
  row: Pick<ImportRow, 'type' | 'amount' | 'accountId' | 'toAccountId'>,
  accountId: string
): number {
  if (row.type === 'expense' && row.accountId === accountId) return row.amount;
  if (row.type === 'income' && row.accountId === accountId) return -row.amount;
  if (row.type === 'transfer' && row.toAccountId === accountId) return -row.amount;
  return 0;
}

export function useImportTransactions(userId: string | null, accounts: Account[] = []) {
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [progress, setProgress] = useState(0); // 0-100
  const [result, setResult] = useState<ImportResult | null>(null);

  const importTransactions = useCallback(
    async (rows: ImportRow[]): Promise<ImportResult> => {
      if (!userId) {
        const r: ImportResult = { imported: 0, skipped: 0, errors: ['Usuario no autenticado'] };
        setResult(r);
        return r;
      }

      const selected = rows.filter(r => r.include);
      if (selected.length === 0) {
        const r: ImportResult = { imported: 0, skipped: rows.length, errors: [] };
        setResult(r);
        return r;
      }

      setStatus('importing');
      setProgress(0);
      setResult(null);

      // Suppress individual notifications during batch import
      setBatchImporting(true);

      const errors: string[] = [];
      let imported = 0;
      let invalidSkipped = 0;
      const importedDocIds: string[] = [];

      const accountIds = new Set(accounts.filter(a => a.id).map(a => a.id));

      try {
        const txCollection = collection(db, `users/${userId}/transactions`);
        const creditAccountWriteReserve = accounts.filter(account => account.type === 'credit' && account.id).length;
        const batchSize = Math.max(1, FIRESTORE_BATCH_LIMIT - creditAccountWriteReserve);

        // ponytail: el commit NO es atómico entre chunks (Firestore tope 500 ops
        // por batch). Un fallo a mitad deja los chunks ya commiteados escritos —
        // estado consistente, porque las tx y su increment de usedCredit van en el
        // mismo batch. El reintento es seguro: el dedup compara contra el historial
        // completo (balanceTransactions), así que las filas ya escritas se marcan
        // duplicado y se excluyen → ni se reescriben ni vuelven a incrementar el
        // cupo. Atomicidad total exigiría doc-id determinista + reconciliación;
        // innecesario mientras el dedup sea correcto.
        // Dividir en chunks de BATCH_SIZE
        for (let chunkStart = 0; chunkStart < selected.length; chunkStart += batchSize) {
          const chunk = selected.slice(chunkStart, chunkStart + batchSize);

          // Validar una sola vez: la fila inválida se omite TANTO de la escritura
          // como del cálculo de usedCredit. Filtrar aquí evita que el delta de crédito
          // de una fila NO escrita (p.ej. sin TRM) igual incremente usedCredit, y que
          // un amount NaN/≤0 meta increment(NaN) y corrompa el cupo de forma persistente.
          const validRows = chunk.filter(row => {
            if (row.type === 'transfer' && !row.toAccountId) {
              invalidSkipped++;
              errors.push(`Transferencia sin cuenta destino omitida: ${row.description}`);
              return false;
            }
            // Moneda extranjera sin TRM: no se puede convertir a COP de forma segura.
            if (row.needsExchangeRate) {
              invalidSkipped++;
              errors.push(`Movimiento en ${row.originalCurrency ?? 'moneda extranjera'} sin TRM omitido: ${row.description}`);
              return false;
            }
            if (!Number.isFinite(row.amount) || row.amount <= 0) {
              invalidSkipped++;
              errors.push(`Monto inválido omitido: ${row.description || '(sin descripción)'}`);
              return false;
            }
            if (!accountIds.has(row.accountId)) {
              invalidSkipped++;
              errors.push(`Cuenta inexistente omitida: ${row.description || '(sin descripción)'}`);
              return false;
            }
            if (row.type === 'transfer' && !accountIds.has(row.toAccountId)) {
              invalidSkipped++;
              errors.push(`Cuenta destino inexistente omitida: ${row.description || '(sin descripción)'}`);
              return false;
            }
            return true;
          });

          const batch = writeBatch(db);

          for (const row of validRows) {
            const txRef = doc(txCollection);
            importedDocIds.push(txRef.id);
            const txData: Omit<Transaction, 'id'> = {
              type: row.type,
              amount: row.amount,
              category: row.category,
              description: row.description.trim(),
              date: row.date,
              paid: true,
              accountId: row.accountId,
              toAccountId: row.toAccountId,
              createdAt: new Date(),
            };
            if (row.installments && row.installments > 1) {
              txData.installments = row.installments;
              txData.monthlyInstallmentAmount = Math.round((row.amount / row.installments) * 100) / 100;
            }
            // Metadatos de moneda original (solo si hubo conversión)
            if (row.originalCurrency && row.originalCurrency !== 'COP' && row.exchangeRate) {
              txData.currency = 'COP';
              txData.originalAmount = row.originalAmount;
              txData.originalCurrency = row.originalCurrency;
              txData.exchangeRate = row.exchangeRate;
            }
            // Eliminar undefined antes de escribir
            const clean = stripUndefined(txData as Record<string, unknown>);
            batch.set(txRef, clean);
            imported++;
          }

          const creditDeltas = new Map<string, number>();
          validRows.forEach(row => {
            accounts
              .filter(account => account.type === 'credit' && account.id)
              .forEach(account => {
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
          setProgress(Math.round(((chunkStart + chunk.length) / selected.length) * 100));
          logger.info(`Import batch committed: ${chunkStart + chunk.length}/${selected.length}`);
        }

        const r: ImportResult = { imported, skipped: rows.length - selected.length + invalidSkipped, errors };
        setResult(r);
        setStatus('done');
        // Register imported IDs so notifications are suppressed even after flag clears
        registerImportedIds(importedDocIds);
        // Re-enable notifications after a longer delay proportional to import size
        const delay = Math.max(10_000, Math.min(30_000, imported * 50));
        setTimeout(() => setBatchImporting(false), delay);
        return r;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido al importar';
        logger.error('Import failed', error);
        errors.push(msg);
        const r: ImportResult = { imported, skipped: rows.length - imported, errors };
        setResult(r);
        setStatus('error');
        setBatchImporting(false);
        return r;
      }
    },
    [userId, accounts]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
  }, []);

  return { importTransactions, status, progress, result, reset };
}
