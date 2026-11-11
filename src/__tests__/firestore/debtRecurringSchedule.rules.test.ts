// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-moneytrack';
const OWNER_ID = 'owner';

let testEnv: RulesTestEnvironment;

const ownerDebtRef = (debtId: string) =>
  doc(
    testEnv.authenticatedContext(OWNER_ID).firestore(),
    'users',
    OWNER_ID,
    'debts',
    debtId
  );

const baseDebt = (overrides: Record<string, unknown> = {}) => ({
  personName: 'Isabella',
  type: 'borrowed',
  originalAmount: 1_000_000,
  remainingAmount: 1_000_000,
  isSettled: false,
  createdAt: new Date('2026-01-01'),
  expectedPaymentDay: 15,
  ...overrides,
});

const seedDebt = async (debtId: string, overrides: Record<string, unknown> = {}) => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(
      doc(context.firestore(), 'users', OWNER_ID, 'debts', debtId),
      baseDebt(overrides)
    );
  });
};

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeWithFirestoreEmulator('debts recurring payment schedule rules contract', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(process.env.MONEYTRACK_FIRESTORE_RULES_TEST_FILE ?? resolve(process.cwd(), 'firestore.rules'), 'utf8'),
      },
    });
  });

  afterEach(async () => {
    await testEnv.clearFirestore();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('permite crear una deuda con cuota periódica válida (isRecurringPayment + recurringPaymentAmount)', async () => {
    await assertSucceeds(
      setDoc(
        ownerDebtRef('loan-recurring'),
        baseDebt({ isRecurringPayment: true, recurringPaymentAmount: 300_000 })
      )
    );
  });

  it('permite capital más interés como saldo pendiente y pagos sobre ese total', async () => {
    await assertSucceeds(setDoc(ownerDebtRef('interest'), baseDebt({ totalInterestAmount: 100_000, interestMode: 'fixed', remainingAmount: 1_100_000 })));
    await assertSucceeds(updateDoc(ownerDebtRef('interest'), { remainingAmount: 50_000 }));
  });

  it.each([
    ['lent', 0], ['lent', 50_000], ['borrowed', 0], ['borrowed', 50_000],
  ] as const)('asocia la transacción original sin duplicar dinero y libera el bloqueo (%s, interés %s)', async (type, interest) => {
    const db = testEnv.authenticatedContext(OWNER_ID).firestore();
    const accountRef = doc(db, 'users', OWNER_ID, 'accounts', 'card');
    const transactionRef = doc(db, 'users', OWNER_ID, 'transactions', 'purchase');
    const debtRef = doc(db, 'users', OWNER_ID, 'debts', 'linked-debt');
    const userRef = doc(db, 'users', OWNER_ID);
    const usedCredit = type === 'lent' ? 1_000_000 + interest : 0;
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), accountRef.path), { name: 'Nu', type: 'credit', initialBalance: 0, isDefault: false, usedCredit, creditLimit: 5_000_000, creditDebtModelVersion: 2 });
      await setDoc(doc(context.firestore(), transactionRef.path), {
        type: type === 'lent' ? 'expense' : 'income', amount: 1_000_000,
        category: 'Otros', description: 'Compra original', accountId: 'card', paid: true,
        createdAt: new Date(), date: new Date(),
        ...(type === 'lent' && interest > 0 ? { hasInterest: true, installments: 3, totalInterestAmount: interest, interestRate: 24, monthlyInstallmentAmount: 350_000 } : {}),
      });
    });
    const leaseId = 'ledger-mutation:associate-loan';
    await assertSucceeds(setDoc(userRef, { accountOperationLock: { id: leaseId, kind: 'ledger-mutation', acquiredAt: serverTimestamp() } }, { mergeFields: ['accountOperationLock'] }));
    const batch = writeBatch(db);
    batch.set(debtRef, baseDebt({ type, accountId: 'card', totalInterestAmount: interest, interestMode: 'fixed', remainingAmount: 1_000_000 + interest, creationOperationId: 'ledger-mutation:create-loan' }));
    batch.update(transactionRef, { debtId: 'linked-debt', category: 'Préstamo' });
    batch.set(userRef, { accountOperationLock: { id: leaseId, kind: 'ledger-mutation', releasedAt: serverTimestamp() } }, { mergeFields: ['accountOperationLock'] });
    await assertSucceeds(batch.commit());
    expect((await getDoc(debtRef)).data()?.remainingAmount).toBe(1_000_000 + interest);
    expect((await getDoc(transactionRef)).data()).toMatchObject({ amount: 1_000_000, debtId: 'linked-debt', category: 'Préstamo' });
    expect((await getDoc(accountRef)).data()?.usedCredit).toBe(usedCredit);
    expect((await getDoc(userRef)).data()?.accountOperationLock.releasedAt).toBeDefined();
  });

  it.each([
    { totalInterestAmount: -1 }, { totalInterestAmount: '100' }, { interestRate: 201 },
    { installments: 1.5 }, { interestMode: 'monthly' }, { remainingAmount: 1_100_001, totalInterestAmount: 100_000 },
  ])('rechaza datos de interés inválidos: %j', async invalid => {
    await assertFails(setDoc(ownerDebtRef('invalid-interest'), baseDebt(invalid)));
  });

  it('permite interés mensual y agregar un corte validado sin alterar el capital', async () => {
    await assertSucceeds(setDoc(ownerDebtRef('monthly'), baseDebt({ interestAccrual: 'monthly', interestMode: 'percentage', interestRate: 2, interestCutoffDay: 10, nextInterestDate: new Date('2026-12-10T05:00:00Z'), totalInterestAmount: 0 })));
    await assertSucceeds(updateDoc(ownerDebtRef('monthly'), { totalInterestAmount: 20_000, remainingAmount: 1_020_000, nextInterestDate: new Date('2027-01-10T05:00:00Z') }));
  });

  it.each([
    { interestCutoffDay: 0 }, { interestCutoffDay: 32 }, { interestCutoffDay: 1.5 },
    { nextInterestDate: '2026-12-10' }, { interestAccrual: 'daily' },
    { interestAccrual: 'monthly' },
    { interestAccrual: 'monthly', interestMode: 'fixed', interestRate: 10, interestCutoffDay: 10, nextInterestDate: new Date() },
  ])('rechaza una programación de interés inválida: %j', async invalid => {
    await assertFails(setDoc(ownerDebtRef('monthly-invalid'), baseDebt(invalid)));
  });

  it('permite activar la cuota periódica en un update', async () => {
    await seedDebt('loan-recurring');
    await assertSucceeds(
      updateDoc(ownerDebtRef('loan-recurring'), {
        isRecurringPayment: true,
        recurringPaymentAmount: 250_000,
      })
    );
  });

  it('rechaza isRecurringPayment con un valor no booleano', async () => {
    await seedDebt('loan-recurring');
    await assertFails(
      updateDoc(ownerDebtRef('loan-recurring'), { isRecurringPayment: 'si' })
    );
  });

  it('rechaza recurringPaymentAmount <= 0', async () => {
    await seedDebt('loan-recurring');
    await assertFails(
      updateDoc(ownerDebtRef('loan-recurring'), {
        isRecurringPayment: true,
        recurringPaymentAmount: 0,
      })
    );
  });

  it('rechaza recurringPaymentAmount que no es número', async () => {
    await seedDebt('loan-recurring');
    await assertFails(
      updateDoc(ownerDebtRef('loan-recurring'), { recurringPaymentAmount: '300000' })
    );
  });

  it('no afloja las validaciones existentes: sigue rechazando cambiar el type', async () => {
    await seedDebt('loan-recurring', { type: 'borrowed' });
    await assertFails(
      updateDoc(ownerDebtRef('loan-recurring'), {
        type: 'lent',
        isRecurringPayment: true,
        recurringPaymentAmount: 300_000,
      })
    );
  });

  it('retrocompatible: una deuda sin los campos nuevos sigue siendo válida', async () => {
    await assertSucceeds(
      setDoc(ownerDebtRef('loan-plain'), baseDebt())
    );
  });
});
