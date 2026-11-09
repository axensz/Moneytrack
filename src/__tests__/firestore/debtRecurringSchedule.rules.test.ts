// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

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
        rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
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
