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
  deleteDoc,
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
const INTRUDER_ID = 'intruder';
const CANDIDATE_ID = 'a'.repeat(64);
const TRANSACTION_ID = `ledger-mutation:android:${CANDIDATE_ID}`;
const LEASE_ID = 'ledger-mutation:lease-attempt-1';

let testEnv: RulesTestEnvironment;

const ownerDb = () => testEnv.authenticatedContext(OWNER_ID).firestore();
const intruderDb = () => testEnv.authenticatedContext(INTRUDER_ID).firestore();

const instrumentRef = (
  instrumentId: string,
  db = ownerDb(),
) => doc(db, 'users', OWNER_ID, 'paymentInstruments', instrumentId);

const candidateRef = (
  candidateId = CANDIDATE_ID,
  db = ownerDb(),
) => doc(db, 'users', OWNER_ID, 'transactionImportCandidates', candidateId);

const userRef = (db = ownerDb()) => doc(db, 'users', OWNER_ID);

const transactionRef = (transactionId = TRANSACTION_ID, db = ownerDb()) =>
  doc(db, 'users', OWNER_ID, 'transactions', transactionId);

const validInstrument = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  label: 'Visa del celular',
  accountId: 'account-1',
  kind: 'wallet-token',
  last4: '1234',
  network: 'visa',
  active: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...overrides,
});

const validPendingCandidate = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 1_234_567,
  currency: 'COP',
  merchant: 'Comercio de prueba',
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
  ...overrides,
});

const withoutLast4 = (value: Record<string, unknown>) => {
  const result = { ...value };
  delete result.last4;
  return result;
};

const validWalletCandidate = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  source: 'android-notification',
  sourcePackage: 'com.google.android.apps.walletnfcrel',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 260_000,
  currency: 'COP',
  merchant: 'OXXO EDS PORTAL DE NIQ',
  observedInstrumentLabel: 'Oro',
  parserId: 'google-wallet-purchase',
  parserVersion: 1,
  confidence: 'medium',
  status: 'pending',
  ...overrides,
});

const seedAccount = async (
  accountId = 'account-1',
  overrides: Record<string, unknown> = {},
) => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(
      doc(context.firestore(), 'users', OWNER_ID, 'accounts', accountId),
      {
        name: accountId,
        type: 'savings',
        isDefault: false,
        initialBalance: 100_000,
        ...overrides,
      },
    );
  });
};

const seedCandidate = async (
  candidateId = CANDIDATE_ID,
  overrides: Record<string, unknown> = {},
) => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(
      doc(
        context.firestore(),
        'users',
        OWNER_ID,
        'transactionImportCandidates',
        candidateId,
      ),
      validPendingCandidate(overrides),
    );
  });
};

const acquireLedgerLease = () => setDoc(
  userRef(),
  {
    accountOperationLock: {
      id: LEASE_ID,
      kind: 'ledger-mutation',
      acquiredAt: serverTimestamp(),
    },
  },
  { mergeFields: ['accountOperationLock'] },
);

const stageCandidateConfirmation = (
  includeTransaction: boolean,
  transactionOperationId = TRANSACTION_ID,
) => {
  const db = ownerDb();
  const batch = writeBatch(db);

  if (includeTransaction) {
    batch.set(transactionRef(TRANSACTION_ID, db), {
      type: 'expense',
      amount: 12_345.67,
      category: 'Mercado',
      description: 'Comercio revisado',
      date: new Date('2026-08-25T13:00:00.000Z'),
      createdAt: serverTimestamp(),
      paid: true,
      accountId: 'account-1',
      operationId: transactionOperationId,
      mutationKind: 'create',
      mutationSource: 'android',
    });
  }

  batch.update(candidateRef(CANDIDATE_ID, db), {
    status: 'confirmed',
    transactionId: TRANSACTION_ID,
    confirmedAt: serverTimestamp(),
  });
  batch.set(
    userRef(db),
    {
      accountOperationLock: {
        id: LEASE_ID,
        kind: 'ledger-mutation',
        releasedAt: serverTimestamp(),
      },
    },
    { mergeFields: ['accountOperationLock'] },
  );

  return batch.commit();
};

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeWithFirestoreEmulator('Android transaction import rules contract', () => {
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

  it('allows only the owner to read payment instruments and candidates', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(
        instrumentRef('instrument-1', context.firestore()),
        {
          ...validInstrument(),
          createdAt: new Date('2026-08-25T12:00:00.000Z'),
          updatedAt: new Date('2026-08-25T12:00:00.000Z'),
        },
      );
      await setDoc(candidateRef(CANDIDATE_ID, context.firestore()), validPendingCandidate());
    });

    await assertSucceeds(getDoc(instrumentRef('instrument-1')));
    await assertSucceeds(getDoc(candidateRef()));
    await assertFails(getDoc(instrumentRef('instrument-1', intruderDb())));
    await assertFails(getDoc(candidateRef(CANDIDATE_ID, intruderDb())));
  });

  it('creates, updates and deletes an exact payment-instrument shape', async () => {
    await seedAccount();

    await assertSucceeds(setDoc(instrumentRef('instrument-1'), validInstrument()));
    await assertSucceeds(updateDoc(instrumentRef('instrument-1'), {
      label: 'Visa principal',
      active: false,
      updatedAt: serverTimestamp(),
    }));
    await assertSucceeds(deleteDoc(instrumentRef('instrument-1')));
  });

  it('allows a v2 Wallet token identified only by its nickname', async () => {
    await seedAccount();
    const wallet = withoutLast4(validInstrument({
      schemaVersion: 2,
      label: 'Oro',
    }));

    await assertSucceeds(setDoc(instrumentRef('wallet-alias'), wallet));
  });

  it('requires last four for v1 and physical-card instruments', async () => {
    await seedAccount();
    const legacy = withoutLast4(validInstrument());
    const physical = withoutLast4(validInstrument({
      schemaVersion: 2,
      kind: 'physical-card',
    }));

    await assertFails(setDoc(instrumentRef('legacy-no-last4'), legacy));
    await assertFails(setDoc(instrumentRef('physical-no-last4'), physical));
  });

  it.each([
    ['missing account', { accountId: 'absent' }],
    ['invalid digits', { last4: '12a4' }],
    ['unknown kind', { kind: 'virtual-card' }],
    ['unknown network', { network: 'diners' }],
    ['client timestamp', {
      createdAt: new Date('2026-08-25T12:00:00.000Z'),
      updatedAt: new Date('2026-08-25T12:00:00.000Z'),
    }],
    ['PAN', { pan: '4111111111111111' }],
    ['CVV', { cvv: '123' }],
    ['raw payload', { rawPayload: 'raw notification' }],
    ['unknown key', { unexpected: true }],
  ])('rejects an instrument with %s', async (_caseName, overrides) => {
    await seedAccount();
    await assertFails(
      setDoc(instrumentRef('instrument-invalid'), validInstrument(overrides)),
    );
  });

  it('rejects foreign payment-instrument writes', async () => {
    await seedAccount();
    await assertFails(
      setDoc(
        instrumentRef('instrument-foreign', intruderDb()),
        validInstrument(),
      ),
    );
  });

  it('creates an exact pending candidate and permits a deterministic no-op', async () => {
    const firstPostTime = new Date('2026-08-25T13:00:00.000Z');
    const updatedPostTime = new Date('2026-08-25T13:00:05.000Z');
    const anchoredPayload = validPendingCandidate({ occurredAt: firstPostTime });

    await assertSucceeds(setDoc(candidateRef(), anchoredPayload));
    await assertSucceeds(setDoc(candidateRef(), anchoredPayload));
    await assertFails(setDoc(
      candidateRef(),
      validPendingCandidate({ occurredAt: updatedPostTime }),
    ));
  });

  it('creates an exact Wallet v2 candidate without granting nickname authority', async () => {
    await assertSucceeds(setDoc(candidateRef(), validWalletCandidate()));
    await assertSucceeds(setDoc(candidateRef(), validWalletCandidate()));
  });

  it.each([
    ['legacy schema with Wallet parser', validPendingCandidate({
      parserId: 'google-wallet-purchase',
    })],
    ['Wallet schema with generic parser', validWalletCandidate({
      parserId: 'strict-cop-purchase',
    })],
    ['Wallet schema with another package', validWalletCandidate({
      sourcePackage: 'com.example.wallet',
    })],
    ['overlong observed nickname', validWalletCandidate({
      observedInstrumentLabel: 'a'.repeat(25),
    })],
    ['raw notification text', validWalletCandidate({ text: 'raw' })],
  ])('rejects an invalid v1 or v2 candidate contract: %s', async (_name, data) => {
    await assertFails(setDoc(candidateRef(), data));
  });

  it.each([
    ['non-pending state', { status: 'confirmed' }],
    ['unknown schema', { schemaVersion: 3 }],
    ['invalid amount', { amountMinor: 0 }],
    ['fractional amount', { amountMinor: 1.5 }],
    ['other currency', { currency: 'USD' }],
    ['low confidence', { confidence: 'low' }],
    ['invalid candidate id', {}, 'candidate-not-a-sha256'],
    ['title', { title: 'Compra' }],
    ['text', { text: 'Compra por COP 1.000' }],
    ['big text', { bigText: 'raw' }],
    ['sub text', { subText: 'raw' }],
    ['raw payload', { rawPayload: 'raw' }],
    ['PAN', { pan: '4111111111111111' }],
    ['CVV', { cvv: '123' }],
    ['OTP', { otp: '999999' }],
    ['unknown key', { unexpected: true }],
  ] as const)(
    'rejects a candidate create with %s',
    async (
      _caseName: string,
      overrides: Record<string, unknown>,
      candidateId: string = CANDIDATE_ID,
    ) => {
      await assertFails(
        setDoc(candidateRef(candidateId), validPendingCandidate(overrides)),
      );
    },
  );

  it('rejects a foreign candidate create', async () => {
    await assertFails(
      setDoc(
        candidateRef(CANDIDATE_ID, intruderDb()),
        validPendingCandidate(),
      ),
    );
  });

  it('allows pending to become dismissed and never reopens it', async () => {
    await assertSucceeds(setDoc(candidateRef(), validPendingCandidate()));
    await assertSucceeds(updateDoc(candidateRef(), {
      status: 'dismissed',
      dismissedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(candidateRef(), {
      status: 'pending',
      dismissedAt: null,
    }));
    await assertFails(updateDoc(candidateRef(), {
      status: 'confirmed',
      transactionId: TRANSACTION_ID,
      confirmedAt: serverTimestamp(),
    }));
  });

  it('confirms only with the matching transaction and ledger lease release', async () => {
    await seedAccount();
    await seedCandidate();
    await assertSucceeds(acquireLedgerLease());

    await assertSucceeds(stageCandidateConfirmation(true));

    const candidate = await getDoc(candidateRef());
    expect(candidate.data()).toEqual(expect.objectContaining({
      status: 'confirmed',
      transactionId: TRANSACTION_ID,
    }));
    expect((await getDoc(transactionRef())).exists()).toBe(true);
  });

  it('rejects confirmation without an active matching lease', async () => {
    await seedAccount();
    await seedCandidate();

    await assertFails(stageCandidateConfirmation(true));
    expect((await getDoc(transactionRef())).exists()).toBe(false);
    expect((await getDoc(candidateRef())).data()?.status).toBe('pending');
  });

  it('rejects confirmation without its transaction in the same commit', async () => {
    await seedAccount();
    await seedCandidate();
    await assertSucceeds(acquireLedgerLease());

    await assertFails(stageCandidateConfirmation(false));
    expect((await getDoc(candidateRef())).data()?.status).toBe('pending');
  });

  it('rejects confirmation when the transaction operation identity differs', async () => {
    await seedAccount();
    await seedCandidate();
    await assertSucceeds(acquireLedgerLease());

    await assertFails(stageCandidateConfirmation(true, 'ledger-mutation:manual:other'));
    expect((await getDoc(transactionRef())).exists()).toBe(false);
    expect((await getDoc(candidateRef())).data()?.status).toBe('pending');
  });
});
