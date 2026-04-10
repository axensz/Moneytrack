/**
 * Hook para importación masiva de transacciones desde extracto bancario
 * Usa writeBatch de Firestore para escrituras atómicas en lotes de 499
 */

import { useCallback, useState } from 'react';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { logger } from '../utils/logger';
import type { Transaction } from '../types/finance';

export interface ImportRow {
  date: Date;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  accountId: string;
  include: boolean; // si el usuario la marcó para importar
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export type ImportStatus = 'idle' | 'importing' | 'done' | 'error';

const BATCH_SIZE = 499;

export function useImportTransactions(userId: string | null) {
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

      const errors: string[] = [];
      let imported = 0;

      try {
        const txCollection = collection(db, `users/${userId}/transactions`);

        // Dividir en chunks de BATCH_SIZE
        for (let chunkStart = 0; chunkStart < selected.length; chunkStart += BATCH_SIZE) {
          const chunk = selected.slice(chunkStart, chunkStart + BATCH_SIZE);
          const batch = writeBatch(db);

          for (const row of chunk) {
            const txRef = doc(txCollection);
            const txData: Omit<Transaction, 'id'> = {
              type: row.type,
              amount: row.amount,
              category: row.category,
              description: row.description.trim(),
              date: row.date,
              paid: true,
              accountId: row.accountId,
              createdAt: new Date(),
            };
            // Eliminar undefined antes de escribir
            const clean = Object.fromEntries(
              Object.entries(txData).filter(([, v]) => v !== undefined)
            );
            batch.set(txRef, clean);
            imported++;
          }

          await batch.commit();
          setProgress(Math.round(((chunkStart + chunk.length) / selected.length) * 100));
          logger.info(`Import batch committed: ${chunkStart + chunk.length}/${selected.length}`);
        }

        const r: ImportResult = { imported, skipped: rows.length - selected.length, errors };
        setResult(r);
        setStatus('done');
        return r;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Error desconocido al importar';
        logger.error('Import failed', error);
        errors.push(msg);
        const r: ImportResult = { imported, skipped: rows.length - imported, errors };
        setResult(r);
        setStatus('error');
        return r;
      }
    },
    [userId]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setProgress(0);
    setResult(null);
  }, []);

  return { importTransactions, status, progress, result, reset };
}
