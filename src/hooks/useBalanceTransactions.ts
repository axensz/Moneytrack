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
 * Alimentar los cálculos de saldo con el historial COMPLETO (useAllTransactions,
 * el mismo patrón ya usado por Estadísticas y por las TC vía
 * useCreditCardTransactions), fusionado con el array live para reflejar cambios
 * recientes al instante.
 *
 * COSTO: el fetch completo solo se activa cuando la ventana está saturada
 * (hasMoreTransactions === true). Con <500 transacciones el array live YA es el
 * historial completo y no se lee nada extra. En modo invitado (localStorage)
 * tampoco: el array local es completo por construcción.
 */

import { useAllTransactionsWithStatus } from './useAllTransactions';
import type { Transaction } from '../types/finance';

export interface BalanceTransactionsResult {
  /** Conjunto de transacciones para derivar saldos (historial completo si aplica). */
  transactions: Transaction[];
  /**
   * false mientras el primer fetch del historial completo está en vuelo: en ese
   * estado los saldos derivados provienen solo de la ventana paginada y pueden
   * ser incorrectos (flash al recargar). La UI debe mostrar "calculando" y el
   * ajuste de saldo debe bloquearse hasta que sea true.
   */
  ready: boolean;
}

export function useBalanceTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
  hasMoreTransactions: boolean,
): BalanceTransactionsResult {
  // Gate: pasar userId=null desactiva el fetch en useAllTransactions y devuelve
  // el array live tal cual (que en ese caso es el historial completo).
  const { transactions, settled } = useAllTransactionsWithStatus(
    hasMoreTransactions ? userId : null,
    liveTransactions,
  );
  return { transactions, ready: settled };
}
