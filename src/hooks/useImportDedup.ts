'use client';

/**
 * useImportDedup — detección de duplicados para el wizard de importación.
 *
 * Compara filas importadas contra transacciones existentes en memoria (cero
 * reads a Firestore) usando dos estrategias de key:
 * - Movimientos normales: `type|day|amount|desc(20chars)` (exact key).
 * - Transferencias: `day|amount` (sin descripción, que varía entre bancos).
 *
 * Marca duplicados con `isDuplicate: true` + `include: false`. También excluye
 * transferencias internas y filas con `needsExchangeRate: true`.
 */

import { useCallback } from 'react';
import { isInternalTransferDescription } from '../utils/csvParser';
import { transferImportKey, exactImportKey, importDayKey, importDescKey } from '../utils/importDuplicates';
import type { ImportRow } from './useImportTransactions';
import type { Transaction } from '../types/finance';

export interface UseImportDedupArgs {
  existingTransactions: Transaction[];
}

export interface UseImportDedupReturn {
  markDuplicates: (rows: ImportRow[], accountId: string) => ImportRow[];
}

/**
 * Convierte un valor de fecha flexible (Date, Firestore Timestamp, string) a Date.
 */
const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string | number);
};

/**
 * Genera la exact key para un movimiento normal (incluye descripción truncada a 20 chars).
 * Replica la lógica interna de useImportWizard.markDuplicates para compatibilidad.
 */
const buildExactKey = (type: string, date: Date, amount: number, description: string): string =>
  `${type}|${importDayKey(date)}|${amount.toFixed(2)}|${importDescKey(description)}`;

export function useImportDedup({ existingTransactions }: UseImportDedupArgs): UseImportDedupReturn {
  const markDuplicates = useCallback(
    (rows: ImportRow[], accountId: string): ImportRow[] => {
      // Construir sets de keys desde las transacciones existentes para el accountId dado.
      const existingAccountKeys = new Set<string>();
      const existingTransferKeys = new Set<string>();

      existingTransactions.forEach(tx => {
        const d = toDate(tx.date);
        if (isNaN(d.getTime())) return;

        // Exact key para movimientos de la misma cuenta
        if (tx.accountId === accountId) {
          existingAccountKeys.add(buildExactKey(tx.type, d, tx.amount, tx.description));
        }

        // Transfer key solo desde transacciones que SON transferencia/pago interno
        if (tx.type === 'transfer' || isInternalTransferDescription(tx.description)) {
          existingTransferKeys.add(transferImportKey(d, tx.amount));
        }
      });

      // Detectar duplicados intra-archivo (same-file) y contra DB
      const seenInFile = new Set<string>();

      return rows.map(row => {
        const isTransfer = row.type === 'transfer' || isInternalTransferDescription(row.description);

        const key = isTransfer
          ? transferImportKey(row.date, row.amount)
          : buildExactKey(row.type, row.date, row.amount, row.description);

        const duplicateInDB = isTransfer
          ? existingTransferKeys.has(key)
          : existingAccountKeys.has(key);

        const duplicateInFile = seenInFile.has(key);
        if (!duplicateInFile) seenInFile.add(key);

        const isDuplicate = duplicateInDB || duplicateInFile;

        return {
          ...row,
          isDuplicate,
          // Excluir: duplicados, transferencias internas y filas con needsExchangeRate
          include: !isDuplicate && !isTransfer && !row.needsExchangeRate,
        };
      });
    },
    [existingTransactions]
  );

  return { markDuplicates };
}
