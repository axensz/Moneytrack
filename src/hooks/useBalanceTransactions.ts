/**
 * C-FIX (paginación + saldos): fuente COMPLETA de transacciones para el cálculo
 * de saldos de cuentas.
 *
 * PROBLEMA (corrupción de saldos, jun-2026):
 * El listener principal (useFirestoreSubscriptions) limita las transacciones en
 * memoria a las 500 más recientes sobre TODAS las cuentas. El saldo de cuentas
 * de ahorro/efectivo se deriva como initialBalance + Σ(transacciones en memoria)
 * (SavingsAccountStrategy), así que con ≥500 transacciones:
 *
 *  1. El saldo mostrado omite el efecto de las transacciones antiguas fuera de
 *     la ventana.
 *  2. Cada transacción NUEVA (incluida la de "Ajuste de saldo") entra por el
 *     tope de la ventana y EXPULSA a la más antigua → el saldo calculado salta
 *     por el monto de la expulsada. Es el mecanismo exacto detrás del reporte
 *     "fijé el saldo en X y quedó en X ± monto-fantasma".
 *
 * SOLUCIÓN:
 * Alimentar los cálculos de saldo con el historial COMPLETO mediante
 * useAllTransactions. Estadísticas reutiliza esta misma fuente desde el provider
 * y el snapshot completo del servidor queda como autoridad tras asentarse.
 *
 * COSTO: la suscripción completa se activa cuando la ventana está saturada o ya
 * cargó al menos 500 filas. Hace una carga inicial completa y luego recibe deltas
 * realtime. Con menos de 500, el listener principal ya contiene el historial.
 */

import { useAllTransactionsWithStatus } from './useAllTransactions';
import { TRANSACTION_PAGE_SIZE } from './firestore/transactionPaginationCache';
import type { Transaction } from '../types/finance';

export interface BalanceTransactionsResult {
  /** Conjunto de transacciones para derivar saldos (historial completo si aplica). */
  transactions: Transaction[];
  /**
   * false hasta recibir el primer snapshot completo confirmado por el servidor.
   * Antes de eso los saldos pueden provenir solo de la ventana paginada o de una
   * caché parcial. La UI debe mostrar "calculando" y bloquear ajustes.
   */
  ready: boolean;
}

export function useBalanceTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
  hasMoreTransactions: boolean,
  transactionsServerSettled = !userId,
): BalanceTransactionsResult {
  // Al llegar al final de las páginas, hasMore pasa a false aunque la colección
  // siga siendo grande. Mantener el listener si ya hay un head completo evita
  // dejar obsoletas ediciones o eliminaciones remotas antiguas.
  const requiresFullHistory =
    hasMoreTransactions || liveTransactions.length >= TRANSACTION_PAGE_SIZE;
  const { transactions, settled } = useAllTransactionsWithStatus(
    requiresFullHistory ? userId : null,
    liveTransactions,
  );
  return {
    transactions,
    ready: !userId || (requiresFullHistory ? settled : transactionsServerSettled),
  };
}
