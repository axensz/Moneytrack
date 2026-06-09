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

import { useAllTransactions } from './useAllTransactions';
import type { Transaction } from '../types/finance';

export function useBalanceTransactions(
  userId: string | null,
  liveTransactions: Transaction[],
  hasMoreTransactions: boolean,
): Transaction[] {
  // Gate: pasar userId=null desactiva el fetch en useAllTransactions y devuelve
  // el array live tal cual (que en ese caso es el historial completo).
  return useAllTransactions(hasMoreTransactions ? userId : null, liveTransactions);
}
