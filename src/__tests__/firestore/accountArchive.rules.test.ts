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

const ownerAccountRef = (accountId: string) =>
  doc(
    testEnv.authenticatedContext(OWNER_ID).firestore(),
    'users',
    OWNER_ID,
    'accounts',
    accountId
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

const describeWithFirestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST
  ? describe
  : describe.skip;

describeWithFirestoreEmulator('accounts archive rules contract', () => {
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

  it('permite archivar: update con archived=true y archivedAt timestamp', async () => {
    await seedAccount('gold');
    await assertSucceeds(
      updateDoc(ownerAccountRef('gold'), {
        archived: true,
        archivedAt: new Date('2026-01-01'),
      })
    );
  });

  it('permite desarchivar: update con archived=false', async () => {
    await seedAccount('gold', { archived: true });
    await assertSucceeds(
      updateDoc(ownerAccountRef('gold'), { archived: false })
    );
  });

  it('rechaza archived con un valor no booleano', async () => {
    await seedAccount('gold');
    await assertFails(
      updateDoc(ownerAccountRef('gold'), { archived: 'si' })
    );
  });

  it('rechaza archivedAt con un valor que no es timestamp', async () => {
    await seedAccount('gold');
    await assertFails(
      updateDoc(ownerAccountRef('gold'), { archived: true, archivedAt: 'ayer' })
    );
  });

  it('no afloja las validaciones existentes: sigue rechazando cambiar el type', async () => {
    await seedAccount('gold', { type: 'savings' });
    await assertFails(
      updateDoc(ownerAccountRef('gold'), { type: 'credit', archived: true })
    );
  });
});
