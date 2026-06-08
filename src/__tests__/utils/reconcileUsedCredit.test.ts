import { describe, it, expect } from 'vitest';
import { reconcileUsedCredit, type CreditEffect } from '../../utils/creditDeltas';

/**
 * Cubre la matemática de reconciliación de usedCredit que usa deleteAccount
 * (FASE 2) para revertir la deuda de las TC afectadas de forma idempotente.
 * Escenario clave (#C.2): una TC FUSIONADA cuyas transacciones la referencian
 * tanto por su id como por un mergedAccountId.
 */
describe('reconcileUsedCredit', () => {
  const tx = (t: Partial<CreditEffect> & { type: string; amount: number; accountId: string }): CreditEffect => t;

  it('suma gastos de la tarjeta y resta sus pagos (transfer-in / income)', () => {
    const survivors: CreditEffect[] = [
      tx({ type: 'expense', amount: 300000, accountId: 'tc1' }),
      tx({ type: 'expense', amount: 200000, accountId: 'tc1' }),
      tx({ type: 'transfer', amount: 150000, accountId: 'ahorro', toAccountId: 'tc1' }), // pago
      tx({ type: 'income', amount: 50000, accountId: 'tc1' }), // pago/abono directo
    ];
    // 300k + 200k - 150k - 50k = 300k
    expect(reconcileUsedCredit(['tc1'], survivors)).toBe(300000);
  });

  it('cuenta transacciones que referencian la TC por un mergedAccountId', () => {
    const referenceIds = ['tcDestino', 'tcViejaFusionada'];
    const survivors: CreditEffect[] = [
      tx({ type: 'expense', amount: 100000, accountId: 'tcDestino' }),
      tx({ type: 'expense', amount: 80000, accountId: 'tcViejaFusionada' }), // id histórico
      tx({ type: 'transfer', amount: 30000, accountId: 'ahorro', toAccountId: 'tcViejaFusionada' }), // pago a la fusionada
    ];
    // 100k + 80k - 30k = 150k
    expect(reconcileUsedCredit(referenceIds, survivors)).toBe(150000);
  });

  it('ignora transacciones de otras cuentas no referenciadas', () => {
    const survivors: CreditEffect[] = [
      tx({ type: 'expense', amount: 100000, accountId: 'tc1' }),
      tx({ type: 'expense', amount: 999999, accountId: 'otraTC' }), // no es referencia
      tx({ type: 'transfer', amount: 40000, accountId: 'ahorro', toAccountId: 'otraTC' }),
    ];
    expect(reconcileUsedCredit(['tc1'], survivors)).toBe(100000);
  });

  it('clampea a 0 cuando los pagos superan la deuda', () => {
    const survivors: CreditEffect[] = [
      tx({ type: 'expense', amount: 100000, accountId: 'tc1' }),
      tx({ type: 'income', amount: 250000, accountId: 'tc1' }), // sobrepago
    ];
    expect(reconcileUsedCredit(['tc1'], survivors)).toBe(0);
  });

  it('devuelve 0 sin transacciones sobrevivientes (tarjeta totalmente saldada/borrada)', () => {
    expect(reconcileUsedCredit(['tc1'], [])).toBe(0);
  });

  it('redondea residuos IEEE-754 a centavos', () => {
    const survivors: CreditEffect[] = [
      tx({ type: 'expense', amount: 0.1, accountId: 'tc1' }),
      tx({ type: 'expense', amount: 0.2, accountId: 'tc1' }),
    ];
    // 0.1 + 0.2 = 0.30000000000000004 → 0.3
    expect(reconcileUsedCredit(['tc1'], survivors)).toBe(0.3);
  });

  it('es idempotente: el resultado no depende de un estado previo', () => {
    const survivors: CreditEffect[] = [
      tx({ type: 'expense', amount: 120000, accountId: 'tc1' }),
      tx({ type: 'transfer', amount: 20000, accountId: 'ahorro', toAccountId: 'tc1' }),
    ];
    const first = reconcileUsedCredit(['tc1'], survivors);
    const second = reconcileUsedCredit(['tc1'], survivors);
    expect(first).toBe(100000);
    expect(second).toBe(first);
  });
});
