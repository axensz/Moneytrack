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
import { transferImportKey, importDayKey, importDescKey } from '../utils/importDuplicates';
import type { ImportRow } from './useImportTransactions';
import type { Transaction } from '../types/finance';

export interface UseImportDedupArgs {
  existingTransactions: Transaction[];
}

export interface UseImportDedupReturn {
  markDuplicates: (
    rows: ImportRow[],
    accountId: string,
    options?: { preserveIncludes?: boolean }
  ) => ImportRow[];
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
    (rows: ImportRow[], accountId: string, options?: { preserveIncludes?: boolean }): ImportRow[] => {
      // Construir sets de keys desde las transacciones existentes.
      // La cuenta se pega a la key normal porque el wizard puede re-rutar filas
      // individuales (ej. pago TC base -> tarjeta) sin cambiar la cuenta global.
      const existingAccountKeys = new Set<string>();
      const existingTransferKeys = new Set<string>();

      existingTransactions.forEach(tx => {
        const d = toDate(tx.date);
        if (isNaN(d.getTime())) return;

        // Exact key para movimientos normales, scoped por cuenta.
        if (tx.accountId) {
          existingAccountKeys.add(`${tx.accountId}|${buildExactKey(tx.type, d, tx.amount, tx.description)}`);
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
          : existingAccountKeys.has(`${row.accountId || accountId}|${key}`);

        const duplicateInFile = seenInFile.has(key);
        if (!duplicateInFile) seenInFile.add(key);

        const isDuplicate = duplicateInDB || duplicateInFile;
        const wasDuplicate = !!row.isDuplicate;
        const defaultInclude = !isDuplicate && !isTransfer && !row.needsExchangeRate;
        const include = options?.preserveIncludes
          ? !isDuplicate && !row.needsExchangeRate && (row.include || (wasDuplicate && !isTransfer))
          : defaultInclude;

        return {
          ...row,
          isDuplicate,
          // Excluir por defecto: duplicados, transferencias internas y filas sin TRM.
          // En recálculos posteriores preservamos la selección manual.
          include,
        };
      });
    },
    [existingTransactions]
  );

  return { markDuplicates };
}
