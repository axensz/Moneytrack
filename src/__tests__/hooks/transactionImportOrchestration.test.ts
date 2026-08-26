import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Account,
  Transaction,
} from '../../types/finance';
import type {
  PendingTransactionImportCandidate,
} from '../../types/transactionImport';

type StoredDocument = Record<string, unknown>;
type DocumentReference = { path: string; id: string };
type BatchWrite = {
  operation: 'set' | 'update' | 'release';
  reference: DocumentReference;
  data: StoredDocument;
};

const M = vi.hoisted(() => ({
  documents: new Map<string, StoredDocument>(),
  accounts: new Map<string, Account>(),
  reads: [] as string[],
  readCounts: new Map<string, number>(),
  beforeRead: undefined as undefined | ((path: string, count: number) => void),
  writerCalls: [] as Array<{ userId: string; operationId?: string; writeCount?: number }>,
  batches: [] as BatchWrite[][],
  commits: 0,
  nextAutoId: 0,
  maxAtomicWrites: 40,
  serverTime: { __serverTimestamp: true },
}));

const readDocument = (path: string): StoredDocument | undefined => {
  const count = (M.readCounts.get(path) ?? 0) + 1;
  M.readCounts.set(path, count);
  M.reads.push(path);
  M.beforeRead?.(path, count);
  return M.documents.get(path);
};

const applyWrite = (write: BatchWrite) => {
  if (write.operation === 'release') return;
  if (write.operation === 'set') {
    M.documents.set(write.reference.path, { ...write.data });
    return;
  }

  const current = M.documents.get(write.reference.path) ?? {};
  const updated = { ...current };
  Object.entries(write.data).forEach(([key, value]) => {
    if (
      value
      && typeof value === 'object'
      && '__increment' in value
      && typeof value.__increment === 'number'
    ) {
      updated[key] = Number(current[key] ?? 0) + value.__increment;
    } else {
      updated[key] = value;
    }
  });
  M.documents.set(write.reference.path, updated);
};

vi.mock('../../lib/firebaseDb', () => ({ db: { __db: true } }));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }),
  doc: (source: { path?: string }, ...segments: string[]) => {
    if (source?.path && segments.length === 0) {
      M.nextAutoId += 1;
      const id = `instrument-${M.nextAutoId}`;
      return { path: `${source.path}/${id}`, id };
    }
    const path = segments.join('/');
    return { path, id: segments.at(-1) ?? '' };
  },
  getDocFromServer: async (reference: DocumentReference) => {
    const data = readDocument(reference.path);
    return {
      id: reference.id,
      exists: () => Boolean(data),
      data: () => data ?? {},
    };
  },
  getDocsFromServer: async (reference: { path: string }) => ({
    docs: [...M.documents.entries()]
      .filter(([path]) => (
        path.startsWith(`${reference.path}/`)
        && !path.slice(reference.path.length + 1).includes('/')
      ))
      .map(([path, data]) => ({
        id: path.slice(reference.path.length + 1),
        data: () => data,
      })),
  }),
  increment: (value: number) => ({ __increment: value }),
  serverTimestamp: () => M.serverTime,
}));

vi.mock('../../hooks/firestore/ledgerMutationOrchestration', async importOriginal => {
  const actual = await importOriginal<
    typeof import('../../hooks/firestore/ledgerMutationOrchestration')
  >();

  return {
    ...actual,
    loadServerLedgerTransaction: async (userId: string, transactionId: string) => {
      const path = `users/${userId}/transactions/${transactionId}`;
      const data = readDocument(path);
      return data ? { ...data, id: transactionId } as Transaction : null;
    },
    executeAuthenticatedLedgerMutation: async (
      userId: string,
      prepare: (tools: {
        operationId: string;
        loadContext(accountIds: readonly string[]): Promise<{
          accounts: Account[];
          transactions: Transaction[];
          authorities: Array<{
            account: { id?: string; type: Account['type'] };
            currentBalance: number;
          }>;
          canonicalAccountId(referenceId: string): string;
        }>;
      }) => Promise<{
        writeCount: number;
        stage(batch: {
          set(reference: DocumentReference, data: StoredDocument): void;
          update(reference: DocumentReference, data: StoredDocument): void;
        }): void;
        result: unknown;
      }>,
      options: { operationId?: string } = {},
    ) => {
      M.writerCalls.push({ userId, operationId: options.operationId });
      const operationId = actual.validateLedgerMutationOperationId(
        options.operationId ?? 'ledger-mutation:test',
      );
      const preparation = await prepare({
        operationId,
        loadContext: async accountIds => {
          const accounts = [...new Set(accountIds)].map(accountId => {
            const account = M.accounts.get(accountId);
            if (!account) throw new Error(`La cuenta ${accountId} no existe`);
            return account;
          });
          return {
            accounts,
            transactions: [],
            authorities: accounts.map(account => ({
              account: { id: account.id, type: account.type },
              currentBalance: account.type === 'credit' ? 0 : 1_000_000,
            })),
            canonicalAccountId: referenceId => {
              if (!M.accounts.has(referenceId)) {
                throw new Error(`La cuenta ${referenceId} no existe`);
              }
              return referenceId;
            },
          };
        },
      });
      M.writerCalls.at(-1)!.writeCount = preparation.writeCount;
      if (preparation.writeCount + 1 > M.maxAtomicWrites) {
        throw new Error('límite atómico');
      }

      const writes: BatchWrite[] = [];
      const batch = {
        set: (reference: DocumentReference, data: StoredDocument) => {
          writes.push({ operation: 'set', reference, data });
        },
        update: (reference: DocumentReference, data: StoredDocument) => {
          writes.push({ operation: 'update', reference, data });
        },
      };
      preparation.stage(batch);
      writes.push({
        operation: 'release',
        reference: { path: `users/${userId}`, id: userId },
        data: { accountOperationLock: 'released' },
      });
      writes.forEach(applyWrite);
      M.batches.push(writes);
      M.commits += 1;
      return preparation.result;
    },
  };
});

import {
  confirmTransactionImport,
  type ReviewedTransactionImportExpense,
} from '../../hooks/firestore/transactionImportOrchestration';

const UID = 'owner';
const CANDIDATE_ID = 'a'.repeat(64);
const OPERATION_ID = `ledger-mutation:android:${CANDIDATE_ID}`;
const candidatePath = (candidateId = CANDIDATE_ID) => (
  `users/${UID}/transactionImportCandidates/${candidateId}`
);
const transactionPath = (transactionId = OPERATION_ID) => (
  `users/${UID}/transactions/${transactionId}`
);
const accountPath = (accountId: string) => `users/${UID}/accounts/${accountId}`;

const candidate = (
  overrides: Partial<PendingTransactionImportCandidate> = {},
): PendingTransactionImportCandidate => ({
  id: CANDIDATE_ID,
  schemaVersion: 1,
  source: 'android-notification',
  sourcePackage: 'com.example.bank',
  occurredAt: new Date('2026-08-25T13:00:00.000Z'),
  amountMinor: 12_345,
  currency: 'COP',
  merchant: 'Comercio original',
  cardLast4: '1234',
  parserId: 'strict-cop-purchase',
  parserVersion: 1,
  confidence: 'high',
  status: 'pending',
  ...overrides,
});

const storedCandidate = (
  value: PendingTransactionImportCandidate = candidate(),
): StoredDocument => {
  const document: StoredDocument = { ...value };
  delete document.id;
  return document;
};

const reviewed = (
  overrides: Partial<ReviewedTransactionImportExpense> = {},
): ReviewedTransactionImportExpense => ({
  expectedCandidate: candidate(),
  accountId: 'savings',
  category: 'Alimentación',
  amount: 123.45,
  merchant: 'Comercio corregido',
  occurredAt: new Date('2026-08-25T13:05:00.000Z'),
  hasInterest: false,
  installments: 1,
  rememberInstrument: false,
  ...overrides,
});

const account = (overrides: Partial<Account> = {}): Account => ({
  id: 'savings',
  name: 'Ahorros',
  type: 'savings',
  isDefault: true,
  initialBalance: 10_000,
  ...overrides,
});

beforeEach(() => {
  M.documents.clear();
  M.accounts.clear();
  M.reads.length = 0;
  M.readCounts.clear();
  M.beforeRead = undefined;
  M.writerCalls.length = 0;
  M.batches.length = 0;
  M.commits = 0;
  M.nextAutoId = 0;
  M.maxAtomicWrites = 40;
  M.documents.set(candidatePath(), storedCandidate());
  M.accounts.set('savings', account());
  M.documents.set(accountPath('savings'), { ...account() });
});

describe('confirmTransactionImport', () => {
  it('reloads the candidate and creates one deterministic savings expense batch', async () => {
    const result = await confirmTransactionImport(
      UID,
      CANDIDATE_ID,
      reviewed(),
    );

    expect(M.readCounts.get(candidatePath())).toBe(2);
    expect(M.writerCalls).toEqual([{
      userId: UID,
      operationId: OPERATION_ID,
      writeCount: 2,
    }]);
    expect(M.commits).toBe(1);
    expect(result).toEqual(expect.objectContaining({
      id: OPERATION_ID,
      type: 'expense',
      amount: 123.45,
      category: 'Alimentación',
      description: 'Comercio corregido',
      date: new Date('2026-08-25T13:05:00.000Z'),
      paid: true,
      accountId: 'savings',
      operationId: OPERATION_ID,
      mutationKind: 'create',
      mutationSource: 'android',
    }));
    expect(M.documents.get(transactionPath())).toEqual(expect.objectContaining({
      operationId: OPERATION_ID,
      mutationSource: 'android',
    }));
    expect(M.documents.get(candidatePath())).toEqual(expect.objectContaining({
      status: 'confirmed',
      transactionId: OPERATION_ID,
      confirmedAt: M.serverTime,
    }));
    expect(M.batches[0].map(write => write.operation)).toEqual([
      'set',
      'update',
      'release',
    ]);
  });

  it('updates persisted credit authority and remembers a card in schema v2', async () => {
    const credit = account({
      id: 'card',
      name: 'Visa',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      creditLimit: 5_000,
      usedCredit: 50,
      interestRate: 24,
    });
    M.accounts.set('card', credit);
    M.documents.set(accountPath('card'), { ...credit });

    await confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      accountId: 'card',
      installments: 3,
      rememberInstrument: true,
    }));

    expect(M.writerCalls[0].writeCount).toBe(4);
    expect(M.documents.get(accountPath('card'))?.usedCredit).toBe(173.45);
    expect(M.documents.get(
      `users/${UID}/paymentInstruments/instrument-1`,
    )).toEqual({
      schemaVersion: 2,
      label: 'Tarjeta •••• 1234',
      accountId: 'card',
      kind: 'wallet-token',
      last4: '1234',
      network: 'unknown',
      active: true,
      createdAt: M.serverTime,
      updatedAt: M.serverTime,
    });
    expect(M.commits).toBe(1);
  });

  it('remembers an alias-only Wallet instrument only after explicit confirmation', async () => {
    const walletCandidate = candidate({
      schemaVersion: 2,
      sourcePackage: 'com.google.android.apps.walletnfcrel',
      cardLast4: undefined,
      observedInstrumentLabel: 'MamáDébito',
      parserId: 'google-wallet-purchase',
      confidence: 'medium',
    });
    M.documents.set(candidatePath(), storedCandidate(walletCandidate));

    await confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      expectedCandidate: walletCandidate,
      rememberInstrument: true,
    }));

    expect(M.documents.get(
      `users/${UID}/paymentInstruments/instrument-1`,
    )).toEqual({
      schemaVersion: 2,
      label: 'MamáDébito',
      accountId: 'savings',
      kind: 'wallet-token',
      network: 'unknown',
      active: true,
      createdAt: M.serverTime,
      updatedAt: M.serverTime,
    });
    expect(M.writerCalls[0].writeCount).toBe(3);
  });

  it('does not create an instrument for unknown Wallet evidence unless requested', async () => {
    const walletCandidate = candidate({
      schemaVersion: 2,
      sourcePackage: 'com.google.android.apps.walletnfcrel',
      cardLast4: undefined,
      observedInstrumentLabel: 'Oro',
      parserId: 'google-wallet-purchase',
      confidence: 'medium',
    });
    M.documents.set(candidatePath(), storedCandidate(walletCandidate));

    await confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      expectedCandidate: walletCandidate,
    }));

    expect([...M.documents.keys()].filter(path => path.includes('/paymentInstruments/')))
      .toEqual([]);
    expect(M.writerCalls[0].writeCount).toBe(2);
  });

  it('rejects a selected instrument when current Wallet evidence no longer converges', async () => {
    const walletCandidate = candidate({
      schemaVersion: 2,
      sourcePackage: 'com.google.android.apps.walletnfcrel',
      observedInstrumentLabel: 'Oro',
      parserId: 'google-wallet-purchase',
      confidence: 'medium',
    });
    M.documents.set(candidatePath(), storedCandidate(walletCandidate));
    M.documents.set(`users/${UID}/paymentInstruments/instrument-7`, {
      schemaVersion: 2,
      label: 'Nu',
      accountId: 'savings',
      kind: 'wallet-token',
      last4: '1234',
      network: 'mastercard',
      active: true,
      createdAt: new Date('2026-08-01T12:00:00.000Z'),
      updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    });

    await expect(confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      expectedCandidate: walletCandidate,
      paymentInstrumentId: 'instrument-7',
    }))).rejects.toThrow(/ya no coincide/i);
    expect(M.commits).toBe(0);
  });

  it('rejects a stale suggestion when another current instrument makes it ambiguous', async () => {
    const storedInstrument = {
      schemaVersion: 1,
      label: 'Visa',
      accountId: 'savings',
      kind: 'wallet-token',
      last4: '1234',
      network: 'visa',
      active: true,
      createdAt: new Date('2026-08-01T12:00:00.000Z'),
      updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    };
    M.documents.set(
      `users/${UID}/paymentInstruments/instrument-7`,
      storedInstrument,
    );
    M.documents.set(
      `users/${UID}/paymentInstruments/instrument-8`,
      { ...storedInstrument, label: 'Visa duplicada' },
    );

    await expect(confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      paymentInstrumentId: 'instrument-7',
    }))).rejects.toThrow(/ya no coincide/i);

    expect(M.commits).toBe(0);
  });

  it('returns the committed transaction on retry without a second ledger write', async () => {
    const first = await confirmTransactionImport(UID, CANDIDATE_ID, reviewed());
    const committedCandidate = M.documents.get(candidatePath())!;
    committedCandidate.confirmedAt = new Date('2026-08-25T13:06:00.000Z');

    const second = await confirmTransactionImport(UID, CANDIDATE_ID, reviewed());

    expect(second).toEqual(expect.objectContaining({
      id: OPERATION_ID,
      operationId: OPERATION_ID,
      mutationKind: 'create',
      mutationSource: 'android',
    }));
    expect(second).toEqual(expect.objectContaining({ amount: first.amount }));
    expect(M.writerCalls).toHaveLength(1);
    expect(M.commits).toBe(1);
  });

  it.each([
    ['dismissed', {
      ...storedCandidate(),
      status: 'dismissed',
      dismissedAt: new Date('2026-08-25T13:06:00.000Z'),
    }],
    ['confirmed with another identity', {
      ...storedCandidate(),
      status: 'confirmed',
      transactionId: 'ledger-mutation:android:other',
      confirmedAt: new Date('2026-08-25T13:06:00.000Z'),
    }],
  ])('rejects a terminal candidate that is %s', async (_name, document) => {
    M.documents.set(candidatePath(), document);

    await expect(confirmTransactionImport(
      UID,
      CANDIDATE_ID,
      reviewed(),
    )).rejects.toThrow(/candidato|identidad/i);

    expect(M.writerCalls).toHaveLength(0);
    expect(M.commits).toBe(0);
  });

  it('rejects a missing account and a missing or inactive selected instrument', async () => {
    await expect(confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      accountId: 'missing',
    }))).rejects.toThrow(/cuenta missing no existe/i);

    const instrumentReview = reviewed({ paymentInstrumentId: 'instrument-7' });
    await expect(confirmTransactionImport(
      UID,
      CANDIDATE_ID,
      instrumentReview,
    )).rejects.toThrow(/medio de pago/i);

    M.documents.set(`users/${UID}/paymentInstruments/instrument-7`, {
      schemaVersion: 1,
      label: 'Visa',
      accountId: 'savings',
      kind: 'wallet-token',
      last4: '1234',
      network: 'visa',
      active: false,
      createdAt: new Date('2026-08-01T12:00:00.000Z'),
      updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    });
    await expect(confirmTransactionImport(
      UID,
      CANDIDATE_ID,
      instrumentReview,
    )).rejects.toThrow(/inactivo/i);

    expect(M.commits).toBe(0);
  });

  it('blocks when the server candidate changed after the review was opened', async () => {
    M.beforeRead = (path, count) => {
      if (path === candidatePath() && count === 2) {
        M.documents.set(path, {
          ...storedCandidate(),
          merchant: 'Otro comercio',
        });
      }
    };

    await expect(confirmTransactionImport(
      UID,
      CANDIDATE_ID,
      reviewed(),
    )).rejects.toThrow(/cambió/i);

    expect(M.commits).toBe(0);
  });

  it('blocks when the observed Wallet nickname changed after review opened', async () => {
    const walletCandidate = candidate({
      schemaVersion: 2,
      sourcePackage: 'com.google.android.apps.walletnfcrel',
      cardLast4: undefined,
      observedInstrumentLabel: 'Oro',
      parserId: 'google-wallet-purchase',
      confidence: 'medium',
    });
    M.documents.set(candidatePath(), storedCandidate(walletCandidate));
    M.beforeRead = (path, count) => {
      if (path === candidatePath() && count === 2) {
        M.documents.set(path, {
          ...storedCandidate(walletCandidate),
          observedInstrumentLabel: 'Nu',
        });
      }
    };

    await expect(confirmTransactionImport(
      UID,
      CANDIDATE_ID,
      reviewed({ expectedCandidate: walletCandidate }),
    )).rejects.toThrow(/cambió/i);

    expect(M.commits).toBe(0);
  });

  it('counts transaction, authority, instrument, candidate and release capacity', async () => {
    const credit = account({
      id: 'card',
      type: 'credit',
      isDefault: false,
      initialBalance: 0,
      creditLimit: 5_000,
      usedCredit: 0,
    });
    M.accounts.set('card', credit);
    M.documents.set(accountPath('card'), { ...credit });
    M.maxAtomicWrites = 4;

    await expect(confirmTransactionImport(UID, CANDIDATE_ID, reviewed({
      accountId: 'card',
      rememberInstrument: true,
    }))).rejects.toThrow(/límite atómico/i);

    expect(M.writerCalls[0].writeCount).toBe(4);
    expect(M.commits).toBe(0);
    expect(M.documents.has(transactionPath())).toBe(false);
    expect(M.documents.get(candidatePath())?.status).toBe('pending');
  });
});
