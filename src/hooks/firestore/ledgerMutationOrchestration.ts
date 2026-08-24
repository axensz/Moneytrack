import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  writeBatch,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebaseDb';
import type {
  Account,
  LedgerMutationIntent,
  LedgerTransactionEffect,
  Transaction,
} from '../../types/finance';
import { getAccountReferenceIds } from '../../utils/accountTransactions';
import { BalanceCalculator } from '../../utils/balanceCalculator';
import { creditDeltasByAccount } from '../../utils/creditDeltas';
import { ensureDate } from '../../utils/dateUtils';
import { roundMoney } from '../../utils/formatters';
import {
  LedgerMutationValidationError,
  normalizeLedgerAmount,
  planLedgerMutation,
  type LedgerAssetAuthority,
} from '../../utils/ledgerMutation';
import {
  acquireAccountOperationLock,
  assertAtomicBatchCapacity,
  createAccountOperationId,
  createAccountOperationRelease,
  releaseAccountOperationLock,
  renewAccountOperationLock,
} from './accountOrchestration';

interface ServerDocumentSnapshot {
  id: string;
  data(): Record<string, unknown>;
}

export interface LedgerServerContext {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  authorities: readonly LedgerAssetAuthority[];
  canonicalAccountId(referenceId: string): string;
}

export interface LedgerMutationPreparationTools {
  operationId: string;
  loadContext(accountIds: readonly string[]): Promise<LedgerServerContext>;
}

export interface LedgerMutationPreparation<TResult> {
  intent: LedgerMutationIntent;
  context: LedgerServerContext;
  writeCount: number;
  stage(batch: WriteBatch): void;
  result: TResult;
}

export interface AuthenticatedLedgerMutationOptions {
  operationId?: string;
}

const LEDGER_OPERATION_ID_PATTERN = /^ledger-mutation:[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const validateLedgerMutationOperationId = (operationId: string): string => {
  if (
    operationId.length > 200 ||
    !LEDGER_OPERATION_ID_PATTERN.test(operationId)
  ) {
    throw new Error('El identificador de la operación del libro no es válido.');
  }
  return operationId;
};

export interface CreditAuthorityChange {
  accountId: string;
  delta: number;
  beforeUsedCredit: number;
  afterUsedCredit: number;
}

const invalidRecord = (message: string): never => {
  throw new LedgerMutationValidationError('INVALID_ACCOUNT_AUTHORITY', message);
};

const decodeAccount = (snapshot: ServerDocumentSnapshot): Account => {
  const data = snapshot.data();
  const type = data.type;
  if (type !== 'savings' && type !== 'cash' && type !== 'credit') {
    return invalidRecord(`La cuenta ${snapshot.id} tiene un tipo inválido`);
  }
  if (typeof data.name !== 'string' || typeof data.isDefault !== 'boolean') {
    return invalidRecord(`La cuenta ${snapshot.id} no tiene una estructura válida`);
  }
  if (typeof data.initialBalance !== 'number' || !Number.isFinite(data.initialBalance)) {
    return invalidRecord(`La cuenta ${snapshot.id} no tiene un saldo inicial válido`);
  }

  return {
    ...data,
    id: snapshot.id,
    type,
    name: data.name,
    isDefault: data.isDefault,
    initialBalance: data.initialBalance,
  } as Account;
};

const decodeTransaction = (snapshot: ServerDocumentSnapshot): Transaction => {
  const data = snapshot.data();
  const type = data.type;
  if (type !== 'income' && type !== 'expense' && type !== 'transfer') {
    return invalidRecord(`La transacción ${snapshot.id} tiene un tipo inválido`);
  }
  if (typeof data.amount !== 'number') {
    return invalidRecord(`La transacción ${snapshot.id} tiene un monto inválido`);
  }

  let amount: number;
  try {
    amount = normalizeLedgerAmount(data.amount);
  } catch {
    return invalidRecord(`La transacción ${snapshot.id} tiene un monto inválido`);
  }
  if (typeof data.paid !== 'boolean') {
    return invalidRecord(`La transacción ${snapshot.id} tiene un estado de pago inválido`);
  }
  if (typeof data.accountId !== 'string' || data.accountId.length === 0) {
    return invalidRecord(`La transacción ${snapshot.id} tiene una cuenta inválida`);
  }
  if (
    type === 'transfer' &&
    (typeof data.toAccountId !== 'string' || data.toAccountId.length === 0)
  ) {
    return invalidRecord(`La transferencia ${snapshot.id} tiene un destino inválido`);
  }

  const date = ensureDate(data.date);
  if (!Number.isFinite(date.getTime())) {
    return invalidRecord(`La transacción ${snapshot.id} tiene una fecha inválida`);
  }
  const createdAt = data.createdAt === undefined ? undefined : ensureDate(data.createdAt);
  if (createdAt && !Number.isFinite(createdAt.getTime())) {
    return invalidRecord(`La transacción ${snapshot.id} tiene una fecha de creación inválida`);
  }

  return {
    ...data,
    id: snapshot.id,
    type,
    amount,
    paid: data.paid,
    accountId: data.accountId,
    toAccountId: typeof data.toAccountId === 'string' ? data.toAccountId : undefined,
    category: typeof data.category === 'string' ? data.category : '',
    description: typeof data.description === 'string' ? data.description : '',
    date,
    createdAt,
  } as Transaction;
};

export async function loadServerLedgerTransaction(
  userId: string,
  transactionId: string
): Promise<Transaction | null> {
  const snapshot = await getDocFromServer(
    doc(db, `users/${userId}/transactions`, transactionId)
  );
  if (!snapshot.exists()) return null;
  return decodeTransaction(snapshot as unknown as ServerDocumentSnapshot);
}

export async function loadServerLedgerTransactions(
  userId: string
): Promise<Transaction[]> {
  const snapshot = await getDocsFromServer(
    collection(db, `users/${userId}/transactions`)
  );
  return snapshot.docs.map(document =>
    decodeTransaction(document as unknown as ServerDocumentSnapshot)
  );
}

export const collectLedgerMutationAccountIds = (
  intent: LedgerMutationIntent
): string[] => [...new Set(
  [...intent.before, ...intent.after].flatMap(effect => [
    effect.accountId,
    effect.toAccountId,
  ].filter((accountId): accountId is string => Boolean(accountId)))
)].sort();

const normalizeEffectReferences = (
  effect: LedgerTransactionEffect,
  canonicalAccountId: (referenceId: string) => string
): LedgerTransactionEffect => ({
  ...effect,
  accountId: canonicalAccountId(effect.accountId),
  toAccountId: effect.toAccountId
    ? canonicalAccountId(effect.toAccountId)
    : undefined,
});

export const normalizeLedgerIntentAccountReferences = (
  intent: LedgerMutationIntent,
  canonicalAccountId: (referenceId: string) => string
): LedgerMutationIntent => ({
  ...intent,
  before: intent.before.map(effect => normalizeEffectReferences(effect, canonicalAccountId)),
  after: intent.after.map(effect => normalizeEffectReferences(effect, canonicalAccountId)),
});

export async function loadServerLedgerContext(
  userId: string,
  requestedAccountIds: readonly string[]
): Promise<LedgerServerContext> {
  const requestedIds = [...new Set(requestedAccountIds.filter(Boolean))];
  if (requestedIds.length === 0) {
    return {
      accounts: [],
      transactions: [],
      authorities: [],
      canonicalAccountId: referenceId => referenceId,
    };
  }

  const accountSnapshot = await getDocsFromServer(
    collection(db, `users/${userId}/accounts`)
  );
  const allAccounts = accountSnapshot.docs.map(snapshot =>
    decodeAccount(snapshot as ServerDocumentSnapshot)
  );
  const referenceToAccount = new Map<string, Account>();
  allAccounts.forEach(account => {
    getAccountReferenceIds(account).forEach(referenceId => {
      const existing = referenceToAccount.get(referenceId);
      if (existing && existing.id !== account.id) {
        invalidRecord(`La referencia de cuenta ${referenceId} es ambigua`);
      }
      referenceToAccount.set(referenceId, account);
    });
  });

  const canonicalAccountId = (referenceId: string): string => {
    const account = referenceToAccount.get(referenceId);
    if (!account?.id) {
      return invalidRecord(`La cuenta ${referenceId} no existe`);
    }
    return account.id;
  };

  const affectedById = new Map<string, Account>();
  requestedIds.forEach(referenceId => {
    const account = referenceToAccount.get(referenceId);
    const accountId = account?.id;
    if (!account || !accountId) {
      throw new LedgerMutationValidationError(
        'INVALID_ACCOUNT_AUTHORITY',
        `La cuenta ${referenceId} no existe`
      );
    }
    affectedById.set(accountId, account);
  });
  const accounts = [...affectedById.values()].sort((left, right) =>
    left.id!.localeCompare(right.id!)
  );
  const referenceIds = [...new Set(accounts.flatMap(getAccountReferenceIds))];
  const transactionsRef = collection(db, `users/${userId}/transactions`);
  const snapshots = await Promise.all(
    referenceIds.flatMap(referenceId => [
      getDocsFromServer(query(transactionsRef, where('accountId', '==', referenceId))),
      getDocsFromServer(query(transactionsRef, where('toAccountId', '==', referenceId))),
    ])
  );

  const transactionById = new Map<string, Transaction>();
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(document => {
      if (transactionById.has(document.id)) return;
      const decoded = decodeTransaction(document as ServerDocumentSnapshot);
      canonicalAccountId(decoded.accountId);
      if (decoded.toAccountId) canonicalAccountId(decoded.toAccountId);
      transactionById.set(document.id, decoded);
    });
  });
  const transactions = [...transactionById.values()];
  const authorities = accounts.map(account => {
    const currentBalance = roundMoney(
      BalanceCalculator.calculateAccountBalance(account, transactions)
    );
    if (!Number.isFinite(currentBalance)) {
      invalidRecord(`No se pudo calcular una autoridad de saldo válida para ${account.id}`);
    }
    return {
      account: { id: account.id, type: account.type },
      currentBalance,
    } satisfies LedgerAssetAuthority;
  });

  return {
    accounts,
    transactions,
    authorities,
    canonicalAccountId,
  };
}

const creditDeltasFor = (
  effects: readonly LedgerTransactionEffect[],
  accounts: readonly Account[]
): Map<string, number> => {
  const deltas = new Map<string, number>();
  effects.forEach(effect => {
    creditDeltasByAccount(effect as Transaction, accounts as Account[])
      .forEach((delta, accountId) => {
        deltas.set(accountId, roundMoney((deltas.get(accountId) ?? 0) + delta));
      });
  });
  return deltas;
};

export const planCreditAuthorityChanges = (
  intent: LedgerMutationIntent,
  context: LedgerServerContext
): CreditAuthorityChange[] => {
  const normalizedIntent = normalizeLedgerIntentAccountReferences(
    intent,
    context.canonicalAccountId
  );
  const beforeDeltas = creditDeltasFor(normalizedIntent.before, context.accounts);
  const afterDeltas = creditDeltasFor(normalizedIntent.after, context.accounts);
  const accountIds = [...new Set([...beforeDeltas.keys(), ...afterDeltas.keys()])].sort();

  return accountIds.flatMap(accountId => {
    const delta = roundMoney(
      (afterDeltas.get(accountId) ?? 0) - (beforeDeltas.get(accountId) ?? 0)
    );
    if (delta === 0) return [];

    const account = context.accounts.find(candidate => candidate.id === accountId);
    const usedCredit = account?.usedCredit;
    if (
      account?.type !== 'credit' ||
      typeof usedCredit !== 'number' ||
      !Number.isFinite(usedCredit) ||
      usedCredit < 0
    ) {
      throw new LedgerMutationValidationError(
        'INVALID_ACCOUNT_AUTHORITY',
        `No se pudo validar la deuda persistida de la tarjeta ${accountId}`,
        accountId
      );
    }

    const beforeUsedCredit = roundMoney(usedCredit);
    const afterUsedCredit = roundMoney(beforeUsedCredit + delta);
    if (afterUsedCredit < 0) {
      throw new LedgerMutationValidationError(
        'INSUFFICIENT_FUNDS',
        'No puedes pagar más de lo que debes en la tarjeta',
        accountId
      );
    }

    return [{ accountId, delta, beforeUsedCredit, afterUsedCredit }];
  });
};

export async function executeAuthenticatedLedgerMutation<TResult>(
  userId: string,
  prepare: (
    tools: LedgerMutationPreparationTools
  ) => Promise<LedgerMutationPreparation<TResult>>,
  options: AuthenticatedLedgerMutationOptions = {}
): Promise<TResult> {
  const kind = 'ledger-mutation' as const;
  const operationId = options.operationId
    ? validateLedgerMutationOperationId(options.operationId)
    : createAccountOperationId(kind);
  // El lease representa un intento, mientras operationId representa la intención
  // financiera. Un reintento confirmado conserva su operationId, pero necesita
  // un lease nuevo porque Firestore deja un tombstone por cada intento finalizado.
  const leaseOperationId = options.operationId
    ? createAccountOperationId(kind)
    : operationId;
  await acquireAccountOperationLock(userId, leaseOperationId, kind);

  try {
    const preparation = await prepare({
      operationId,
      loadContext: accountIds => loadServerLedgerContext(userId, accountIds),
    });
    const normalizedIntent = normalizeLedgerIntentAccountReferences(
      preparation.intent,
      preparation.context.canonicalAccountId
    );
    planLedgerMutation(normalizedIntent, preparation.context.authorities);
    assertAtomicBatchCapacity(
      'confirmar esta mutación del libro',
      preparation.writeCount + 1
    );
    await renewAccountOperationLock(userId, leaseOperationId, kind);

    const batch = writeBatch(db);
    preparation.stage(batch);
    batch.set(
      doc(db, 'users', userId),
      createAccountOperationRelease(leaseOperationId, kind),
      { mergeFields: ['accountOperationLock'] }
    );
    await batch.commit();
    return preparation.result;
  } catch (error) {
    try {
      await releaseAccountOperationLock(userId, leaseOperationId, kind);
    } catch {
      // Conservar el error financiero/commit original. El lease expira en servidor.
    }
    throw error;
  }
}
