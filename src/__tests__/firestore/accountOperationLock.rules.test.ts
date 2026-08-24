// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-moneytrack';
const OWNER_ID = 'owner';

let testEnv: RulesTestEnvironment;

const ownerUserRef = () =>
  doc(testEnv.authenticatedContext(OWNER_ID).firestore(), 'users', OWNER_ID);

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
});
