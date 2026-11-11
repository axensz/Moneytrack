import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { runMonthlyInterestPass } from '../../src/debts/monthlyInterestWorker.js';

const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const now = new Date('2026-03-31T05:00:00Z');
const uid = 'monthly-interest-test';
const debtPath = `users/${uid}/debts/loan`;
const seedDebt = {
  originalAmount: 1_000_000, remainingAmount: 500_000, totalInterestAmount: 20_000,
  isSettled: false, interestAccrual: 'monthly', interestMode: 'percentage',
  interestRate: 2, interestCutoffDay: 31, nextInterestDate: new Date('2026-01-31T05:00:00Z'),
};

describeWithEmulator('monthly interest worker (emulator)', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-moneytrack' }, `monthly-interest-${Date.now()}`);
    db = getFirestore(app);
  });
  afterEach(async () => { await db.recursiveDelete(db.doc(`users/${uid}`)); });
  afterAll(async () => { await deleteApp(app); });

  it('catches up every monthly cut without creating money or changing card usage', async () => {
    await db.doc(debtPath).set(seedDebt);
    await db.doc(`users/${uid}/accounts/card`).set({ usedCredit: 75_000 });
    await db.doc(`users/${uid}/transactions/origin`).set({ amount: 1_000_000 });
    const result = await runMonthlyInterestPass(db, now);
    expect(result.updated).toBe(1);
    const persisted = (await db.doc(debtPath).get()).data();
    expect(persisted?.remainingAmount).toBe(560_000);
    expect(persisted?.totalInterestAmount).toBe(80_000);
    expect(persisted?.nextInterestDate.toDate().toISOString()).toBe('2026-04-30T05:00:00.000Z');
    expect((await db.doc(`users/${uid}/accounts/card`).get()).data()).toEqual({ usedCredit: 75_000 });
    expect((await db.collection(`users/${uid}/transactions`).get()).docs.map(d => d.data())).toEqual([{ amount: 1_000_000 }]);
  });

  it('overlapping passes and retries apply each monthly charge exactly once', async () => {
    await db.doc(debtPath).set(seedDebt);
    await Promise.all([runMonthlyInterestPass(db, now), runMonthlyInterestPass(db, now)]);
    await runMonthlyInterestPass(db, now);
    expect((await db.doc(debtPath).get()).data()?.remainingAmount).toBe(560_000);
    expect((await db.doc(debtPath).get()).data()?.totalInterestAmount).toBe(80_000);
  });

  it('defers active payment leases then uses the payment balance on its next pass', async () => {
    await db.doc(debtPath).set(seedDebt);
    await db.doc(`users/${uid}`).set({ accountOperationLock: {
      id: 'payment-1', acquiredAt: new Date(now.getTime() - 60_000), kind: 'ledger-mutation',
    } });
    expect((await runMonthlyInterestPass(db, now)).updated).toBe(0);
    expect((await db.doc(debtPath).get()).data()?.remainingAmount).toBe(500_000);
    const batch = db.batch();
    batch.update(db.doc(debtPath), { remainingAmount: 100_000 });
    batch.update(db.doc(`users/${uid}`), { accountOperationLock: { id: 'payment-1', releasedAt: now } });
    await batch.commit();
    expect((await runMonthlyInterestPass(db, now)).updated).toBe(1);
    expect((await db.doc(debtPath).get()).data()?.remainingAmount).toBe(160_000);
  });

  it('supports legacy expiry leases and resumes expired modern leases', async () => {
    await db.doc(debtPath).set(seedDebt);
    await db.doc(`users/${uid}`).set({ accountOperationLock: { id: 'legacy', expiresAt: new Date(now.getTime() + 60_000) } });
    expect((await runMonthlyInterestPass(db, now)).updated).toBe(0);
    await db.doc(`users/${uid}`).set({ accountOperationLock: {
      id: 'expired', acquiredAt: new Date(now.getTime() - 300_001),
    } });
    expect((await runMonthlyInterestPass(db, now)).updated).toBe(1);
  });

  it('never accrues settled loans even if they remain in the due query', async () => {
    await db.doc(debtPath).set({ ...seedDebt, isSettled: true, remainingAmount: 0 });
    expect((await runMonthlyInterestPass(db, now)).updated).toBe(0);
    expect((await db.doc(debtPath).get()).data()?.totalInterestAmount).toBe(20_000);
  });

  it('paginates while due records move beyond the query range', async () => {
    await db.doc(debtPath).set(seedDebt);
    await db.doc(`users/${uid}/debts/second`).set(seedDebt);
    expect((await runMonthlyInterestPass(db, now, 1)).updated).toBe(2);
  });

  it('leaves an overflowed loan unchanged and continues processing the next loan', async () => {
    await db.doc(debtPath).set({ ...seedDebt, originalAmount: 999_000_000, totalInterestAmount: 0, remainingAmount: 1_000, interestRate: 1 });
    await db.doc(`users/${uid}/debts/second`).set(seedDebt);
    const result = await runMonthlyInterestPass(db, now, 1);
    expect(result).toEqual({ updated: 1, overLimit: 1 });
    const overflowed = (await db.doc(debtPath).get()).data();
    expect(overflowed?.remainingAmount).toBe(1_000);
    expect(overflowed?.totalInterestAmount).toBe(0);
    expect(overflowed?.nextInterestDate.toDate().toISOString()).toBe('2026-01-31T05:00:00.000Z');
    expect((await db.doc(`users/${uid}/debts/second`).get()).data()?.remainingAmount).toBe(560_000);
  });
});
