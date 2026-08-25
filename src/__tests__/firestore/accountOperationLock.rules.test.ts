// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-moneytrack';
const OWNER_ID = 'owner';

let testEnv: RulesTestEnvironment;

const ownerUserRef = () =>
  doc(testEnv.authenticatedContext(OWNER_ID).firestore(), 'users', OWNER_ID);

const ownerAccountRef = (accountId: string) =>
  doc(
    testEnv.authenticatedContext(OWNER_ID).firestore(),
    'users',
    OWNER_ID,
    'accounts',
    accountId
  );

const ownerTransactionRef = (transactionId: string) =>
  doc(
    testEnv.authenticatedContext(OWNER_ID).firestore(),
    'users',
    OWNER_ID,
    'transactions',
    transactionId
  );

const seedAccount = async (
  accountId: string,
  overrides: Record<string, unknown> = {}
) => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(
      doc(context.firestore(), 'users', OWNER_ID, 'accounts', accountId),
      {
        name: accountId,
        type: 'savings',
        isDefault: false,
        initialBalance: 1_000,
        ...overrides,
      }
    );
  });
};

const acquire = (id: string, kind = 'delete-debt') =>
  setDoc(
    ownerUserRef(),
    { accountOperationLock: { id, kind, acquiredAt: serverTimestamp() } },
    { mergeFields: ['accountOperationLock'] }
  );

const release = (id: string, kind = 'delete-debt') =>
  setDoc(
    ownerUserRef(),
    { accountOperationLock: { id, kind, releasedAt: serverTimestamp() } },
    { mergeFields: ['accountOperationLock'] }
  );

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeWithFirestoreEmulator('accountOperationLock rules contract', () => {
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

  it('acquires, renews, releases, and reacquires with exact map states', async () => {
    await assertSucceeds(acquire('delete-debt:first'));
    await assertSucceeds(acquire('delete-debt:first'));
    await assertSucceeds(release('delete-debt:first'));

    const releasedSnapshot = await getDoc(ownerUserRef());
    expect(Object.keys(releasedSnapshot.data()?.accountOperationLock ?? {}).sort()).toEqual([
      'id',
      'kind',
      'releasedAt',
    ]);

    await assertSucceeds(acquire('delete-debt:second'));
    const acquiredSnapshot = await getDoc(ownerUserRef());
    expect(Object.keys(acquiredSnapshot.data()?.accountOperationLock ?? {}).sort()).toEqual([
      'acquiredAt',
      'id',
      'kind',
    ]);
  });

  it('rejects the nested merge that retains acquiredAt during release', async () => {
    await assertSucceeds(acquire('delete-debt:merged'));
    await assertFails(
      setDoc(
        ownerUserRef(),
        {
          accountOperationLock: {
            id: 'delete-debt:merged',
            kind: 'delete-debt',
            releasedAt: serverTimestamp(),
          },
        },
        { merge: true }
      )
    );
  });

  it('rejects a non-owner lock transition', async () => {
    const intruderRef = doc(
      testEnv.authenticatedContext('intruder').firestore(),
      'users',
      OWNER_ID
    );
    await assertFails(
      setDoc(
        intruderRef,
        {
          accountOperationLock: {
            id: 'delete-debt:intruder',
            kind: 'delete-debt',
            acquiredAt: serverTimestamp(),
          },
        },
        { mergeFields: ['accountOperationLock'] }
      )
    );
  });

  it('accepts the reassign-debt-account operation kind', async () => {
    await assertSucceeds(
      acquire('reassign-debt-account:first', 'reassign-debt-account')
    );
    await assertSucceeds(
      release('reassign-debt-account:first', 'reassign-debt-account')
    );
  });

  it('accepts the ledger-mutation operation kind', async () => {
    await assertSucceeds(
      acquire('ledger-mutation:first', 'ledger-mutation')
    );
    await assertSucceeds(
      release('ledger-mutation:first', 'ledger-mutation')
    );
  });

  it('releases and reacquires a ledger-mutation lease with a new identity', async () => {
    await assertSucceeds(acquire('ledger-mutation:first', 'ledger-mutation'));
    await assertSucceeds(release('ledger-mutation:first', 'ledger-mutation'));
    await assertSucceeds(acquire('ledger-mutation:second', 'ledger-mutation'));
    await assertSucceeds(release('ledger-mutation:second', 'ledger-mutation'));
  });

  it('rejects a mismatched ledger release tombstone', async () => {
    await assertSucceeds(acquire('ledger-mutation:current', 'ledger-mutation'));
    await assertFails(release('ledger-mutation:stale', 'ledger-mutation'));

    const snapshot = await getDoc(ownerUserRef());
    expect(snapshot.data()?.accountOperationLock.id).toBe('ledger-mutation:current');
    expect(snapshot.data()?.accountOperationLock.releasedAt).toBeUndefined();
  });

  it('requires a finite in-range usedCredit authority on every credit account write', async () => {
    const baseCard = {
      name: 'Visa',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
    };

    await assertFails(setDoc(ownerAccountRef('missing'), baseCard));
    await assertFails(setDoc(ownerAccountRef('null'), { ...baseCard, usedCredit: null }));
    await assertFails(setDoc(ownerAccountRef('negative'), { ...baseCard, usedCredit: -1 }));
    await assertFails(setDoc(ownerAccountRef('nan'), { ...baseCard, usedCredit: Number.NaN }));
    await assertFails(setDoc(ownerAccountRef('infinite'), { ...baseCard, usedCredit: Infinity }));
    await assertFails(setDoc(ownerAccountRef('too-large'), {
      ...baseCard,
      usedCredit: 1_000_000_000.01,
    }));
    await assertSucceeds(setDoc(ownerAccountRef('valid'), { ...baseCard, usedCredit: 0 }));

    await assertFails(updateDoc(ownerAccountRef('valid'), { usedCredit: -1 }));
    await assertSucceeds(updateDoc(ownerAccountRef('valid'), { usedCredit: 250 }));
  });

  it.each([
    ['missing destination', undefined],
    ['same source and destination', 'source'],
    ['missing account', 'absent'],
  ])('rejects a transfer with %s', async (_caseName, toAccountId) => {
    await seedAccount('source');
    const transfer = {
      type: 'transfer',
      amount: 100,
      description: 'Transferencia inválida',
      category: 'Transferencia',
      paid: true,
      accountId: 'source',
      date: new Date('2026-08-24T12:00:00.000Z'),
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
      ...(toAccountId ? { toAccountId } : {}),
    };

    await assertFails(setDoc(ownerTransactionRef(`invalid-${toAccountId ?? 'missing'}`), transfer));
  });

  it('rejects a transfer whose source is a credit card', async () => {
    await seedAccount('card', { type: 'credit', initialBalance: 0, usedCredit: 0 });
    await seedAccount('destination');

    await assertFails(setDoc(ownerTransactionRef('credit-source'), {
      type: 'transfer',
      amount: 100,
      description: 'Transferencia inválida',
      category: 'Transferencia',
      paid: true,
      accountId: 'card',
      toAccountId: 'destination',
      date: new Date('2026-08-24T12:00:00.000Z'),
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
    }));
  });

  it('allows a repair batch only when its domain write and exact release commit together', async () => {
    await seedAccount('card', { type: 'credit', initialBalance: 0, usedCredit: 100 });
    await assertSucceeds(acquire('ledger-mutation:repair', 'ledger-mutation'));

    await assertFails(updateDoc(ownerAccountRef('card'), { usedCredit: 250 }));

    const ownerDb = testEnv.authenticatedContext(OWNER_ID).firestore();
    const batch = writeBatch(ownerDb);
    batch.update(doc(ownerDb, 'users', OWNER_ID, 'accounts', 'card'), { usedCredit: 250 });
    batch.set(
      doc(ownerDb, 'users', OWNER_ID),
      {
        accountOperationLock: {
          id: 'ledger-mutation:repair',
          kind: 'ledger-mutation',
          releasedAt: serverTimestamp(),
        },
      },
      { mergeFields: ['accountOperationLock'] }
    );

    await assertSucceeds(batch.commit());
    expect((await getDoc(ownerAccountRef('card'))).data()?.usedCredit).toBe(250);
  });

  it('rejects the complete repair batch when one transfer reference is invalid', async () => {
    await seedAccount('card', { type: 'credit', initialBalance: 0, usedCredit: 100 });
    await seedAccount('source');
    await assertSucceeds(acquire('ledger-mutation:atomic', 'ledger-mutation'));

    const ownerDb = testEnv.authenticatedContext(OWNER_ID).firestore();
    const batch = writeBatch(ownerDb);
    batch.update(doc(ownerDb, 'users', OWNER_ID, 'accounts', 'card'), { usedCredit: 250 });
    batch.set(doc(ownerDb, 'users', OWNER_ID, 'transactions', 'invalid-transfer'), {
      type: 'transfer',
      amount: 100,
      description: 'Transferencia inválida',
      category: 'Transferencia',
      paid: true,
      accountId: 'source',
      toAccountId: 'source',
      date: new Date('2026-08-24T12:00:00.000Z'),
      createdAt: new Date('2026-08-24T12:00:00.000Z'),
    });
    batch.set(
      doc(ownerDb, 'users', OWNER_ID),
      {
        accountOperationLock: {
          id: 'ledger-mutation:atomic',
          kind: 'ledger-mutation',
          releasedAt: serverTimestamp(),
        },
      },
      { mergeFields: ['accountOperationLock'] }
    );

    await assertFails(batch.commit());
    expect((await getDoc(ownerAccountRef('card'))).data()?.usedCredit).toBe(100);
    expect((await getDoc(ownerTransactionRef('invalid-transfer'))).exists()).toBe(false);
    expect((await getDoc(ownerUserRef())).data()?.accountOperationLock.releasedAt).toBeUndefined();
  });
});
