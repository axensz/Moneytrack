import type { Transaction } from '../types/finance';

/**
 * Fusiona dos listas de transacciones deduplicando por id. La lista PRIMARIA gana
 * ante coincidencias (p. ej. el array live refleja ediciones recientes); la
 * SECUNDARIA aporta la cola que falte (historial fuera de la paginación de 500).
 */
export function mergeTransactionsById(
  primary: Transaction[],
  secondary: Transaction[],
): Transaction[] {
  if (secondary.length === 0) return primary;
  const byId = new Map<string, Transaction>();
  for (const t of primary) {
    if (t.id) byId.set(t.id, t);
  }
  for (const t of secondary) {
    if (t.id && !byId.has(t.id)) byId.set(t.id, t);
  }
  return Array.from(byId.values());
}

/** @deprecated Alias por compatibilidad — usa mergeTransactionsById. */
export const mergeCreditTransactions = mergeTransactionsById;
