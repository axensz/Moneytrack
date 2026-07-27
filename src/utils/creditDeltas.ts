/**
 * Cálculo de deltas de usedCredit (deuda de tarjeta de crédito).
 *
 * usedCredit es el campo autoritativo sobre la deuda de una TC. Estas funciones
 * derivan, a partir de una transacción, cuánto debe sumarse o restarse a ese
 * campo en cada cuenta afectada. Se mantienen puras y aisladas para poder
 * reusarlas atómicamente (runTransaction) en alta/baja/edición y en la cascada
 * de borrado de cuentas.
 */
import type { Account } from '../types/finance';
import { findAccountForTransaction } from './accountTransactions';
import { roundMoney } from './formatters';

export const CURRENT_CREDIT_DEBT_MODEL_VERSION = 2;

export type CreditEffect = {
  type: string;
  amount: number;
  accountId: string;
  toAccountId?: string;
  totalInterestAmount?: number;
};

/** Deuda contractual que origina una compra financiada (principal + interés). */
export function getCreditChargeAmount(tx: Pick<CreditEffect, 'amount' | 'totalInterestAmount'>): number {
  return roundMoney(tx.amount + Math.max(0, tx.totalInterestAmount ?? 0));
}

/**
 * Calcula el delta de usedCredit que una transacción aporta a una cuenta TC.
 * Positivo = aumenta deuda, Negativo = reduce deuda.
 *
 * Modelo de negocio: una compra ocupa el cupo por su monto completo (también las
 * compras a cuotas); el cupo se libera con cada pago, no por cuota vencida.
 */
export function getCreditDelta(tx: CreditEffect, accountId: string): number {
  if (tx.type === 'expense' && tx.accountId === accountId) return getCreditChargeAmount(tx);
  if (tx.type === 'income' && tx.accountId === accountId) return -tx.amount;
  if (tx.type === 'transfer' && tx.toAccountId === accountId) return -tx.amount;
  return 0;
}

/**
 * Devuelve el efecto de una transacción sobre el usedCredit, agrupado por id de
 * cuenta — SOLO para cuentas de tipo crédito. Esto evita escribir un campo
 * `usedCredit` espurio en cuentas de ahorro/efectivo y cubre tanto la cuenta
 * origen (gasto/ingreso) como la destino (transferencia hacia una TC).
 */
export function creditDeltasByAccount(tx: CreditEffect, accounts: Account[]): Map<string, number> {
  const deltas = new Map<string, number>();
  const addEffect = (accountId: string | undefined, delta: number) => {
    if (!accountId || delta === 0) return;
    const account = findAccountForTransaction(accounts, accountId);
    if (!account || account.type !== 'credit' || !account.id) return;
    deltas.set(account.id, (deltas.get(account.id) ?? 0) + delta);
  };

  if (tx.type === 'expense') addEffect(tx.accountId, getCreditChargeAmount(tx));
  else if (tx.type === 'income') addEffect(tx.accountId, -tx.amount);
  else if (tx.type === 'transfer') addEffect(tx.toAccountId, -tx.amount);

  return deltas;
}

/**
 * Recalcula (reconcilia) el usedCredit de una TC desde sus transacciones
 * sobrevivientes, sumando getCreditDelta sobre TODAS las referencias de la
 * tarjeta (su id + sus mergedAccountIds — ver getAccountReferenceIds). Probar
 * cada referencia cubre las transacciones que apuntan a la TC por un id fusionado.
 *
 * Es idempotente: el resultado no depende del valor previo del campo, así que
 * reejecutarla siempre converge al mismo valor. Las operaciones destructivas la
 * calculan antes de escribir y guardan ese SET dentro del mismo batch atómico;
 * así un reintento tampoco puede duplicar un incremento.
 *
 * @param referenceIds  id de la TC + sus mergedAccountIds
 * @param survivors     transacciones que siguen existiendo tras el borrado
 * @returns usedCredit recomputado, clampeado a >= 0 y redondeado a centavos
 */
export function reconcileUsedCredit(
  referenceIds: string[],
  survivors: ReadonlyArray<CreditEffect>
): number {
  const referenceIdSet = new Set(referenceIds);
  let usedCredit = 0;
  for (const tx of survivors) {
    // getCreditDelta espera el id concreto referenciado por la transacción
    // (origen para gasto/ingreso, destino para transferencia). Probamos ambas
    // referencias para sumar el delta correcto aunque la tx use un id fusionado.
    if (tx.accountId && referenceIdSet.has(tx.accountId)) {
      usedCredit += getCreditDelta(tx, tx.accountId);
    }
    if (tx.toAccountId && referenceIdSet.has(tx.toAccountId)) {
      usedCredit += getCreditDelta(tx, tx.toAccountId);
    }
  }
  // La suma de deltas float puede dejar residuos IEEE-754.
  return Math.max(0, roundMoney(usedCredit));
}
