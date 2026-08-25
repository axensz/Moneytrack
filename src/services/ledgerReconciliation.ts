import {
  collection,
  deleteField,
  doc,
  getDocsFromServer,
  type WriteBatch,
} from 'firebase/firestore';
import { executeAuthenticatedLedgerMutation } from '../hooks/firestore/ledgerMutationOrchestration';
import { publishTransactionCacheMutation } from '../hooks/firestore/transactionPaginationCache';
import { db } from '../lib/firebaseDb';
import type {
  Account,
  Debt,
  LedgerMutationIntent,
  RecurringPayment,
  Transaction,
} from '../types/finance';
import {
  buildLedgerReconciliationReport,
  type LedgerReconciliationInput,
  type LedgerReconciliationReport,
} from '../utils/ledgerReconciliation';
import type {
  LedgerRepairPlan,
  LedgerRepairTransactionUpdate,
} from '../utils/ledgerRepairPlans';
import { collectDecodedTransactions } from '../utils/transactionDecoder';

interface ServerReconciliationSnapshot {
  input: LedgerReconciliationInput;
  report: LedgerReconciliationReport;
}

export interface LedgerReconciliationBundle {
  report: LedgerReconciliationReport;
  transactions: Transaction[];
}

const optionalDate = (value: unknown): Date | undefined => {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new Date(value) : undefined;
  }
  if (
    value
    && typeof value === 'object'
    && typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const converted = (value as { toDate(): unknown }).toDate();
    return converted instanceof Date && Number.isFinite(converted.getTime())
      ? new Date(converted)
      : undefined;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const converted = new Date(value);
    return Number.isFinite(converted.getTime()) ? converted : undefined;
  }
  return undefined;
};

const decodeServerAccount = (
  id: string,
  raw: Record<string, unknown>,
): Account => ({
  ...raw,
  id,
  mergedAccountIds: Array.isArray(raw.mergedAccountIds)
    ? raw.mergedAccountIds.filter((value): value is string => typeof value === 'string')
    : undefined,
  createdAt: optionalDate(raw.createdAt),
} as Account);

const decodeServerDebt = (
  id: string,
  raw: Record<string, unknown>,
): Debt => ({
  ...raw,
  id,
  createdAt: optionalDate(raw.createdAt),
  lentDate: optionalDate(raw.lentDate),
  dueDate: optionalDate(raw.dueDate),
  nextPaymentDate: optionalDate(raw.nextPaymentDate),
  settledAt: optionalDate(raw.settledAt),
} as Debt);

const decodeServerRecurringPayment = (
  id: string,
  raw: Record<string, unknown>,
): RecurringPayment => ({
  ...raw,
  id,
  createdAt: optionalDate(raw.createdAt),
  lastPaidDate: optionalDate(raw.lastPaidDate),
} as RecurringPayment);

async function loadServerSnapshot(userId: string): Promise<ServerReconciliationSnapshot> {
  if (!userId) throw new Error('Se requiere un usuario autenticado para conciliar.');
  const base = `users/${userId}`;
  const [accountSnapshot, transactionSnapshot, debtSnapshot, recurringSnapshot] = (
    await Promise.all([
      getDocsFromServer(collection(db, `${base}/accounts`)),
      getDocsFromServer(collection(db, `${base}/transactions`)),
      getDocsFromServer(collection(db, `${base}/debts`)),
      getDocsFromServer(collection(db, `${base}/recurringPayments`)),
    ])
  );
  const decodedTransactions = collectDecodedTransactions(transactionSnapshot.docs);
  const input: LedgerReconciliationInput = {
    source: 'server',
    complete: true,
    accounts: accountSnapshot.docs.map(document => (
      decodeServerAccount(document.id, document.data())
    )),
    transactions: decodedTransactions.transactions,
    transactionIssues: decodedTransactions.issues,
    debts: debtSnapshot.docs.map(document => (
      decodeServerDebt(document.id, document.data())
    )),
    recurringPayments: recurringSnapshot.docs.map(document => (
      decodeServerRecurringPayment(document.id, document.data())
    )),
  };
  return {
    input,
    report: buildLedgerReconciliationReport(input),
  };
}

export async function loadServerLedgerReconciliation(
  userId: string,
): Promise<LedgerReconciliationReport> {
  return (await loadServerSnapshot(userId)).report;
}

export async function loadServerLedgerReconciliationBundle(
  userId: string,
): Promise<LedgerReconciliationBundle> {
  const snapshot = await loadServerSnapshot(userId);
  return {
    report: snapshot.report,
    transactions: [...snapshot.input.transactions],
  };
}

const applyTransactionUpdate = (
  transaction: Transaction,
  update: LedgerRepairTransactionUpdate,
): Transaction => {
  const next = { ...transaction, ...update.values } as Transaction & Record<string, unknown>;
  update.unset.forEach(field => delete next[field]);
  return next;
};

const planIntent = (
  plan: LedgerRepairPlan,
  transactions: readonly Transaction[],
): LedgerMutationIntent => {
  const updateWrites = plan.writes.filter(
    (write): write is LedgerRepairTransactionUpdate => (
      write.entity === 'transaction' && write.action === 'update'
    ),
  );
  const before = updateWrites.map(write => {
    const matches = transactions.filter(item => item.id === write.transactionId);
    if (matches.length !== 1) {
      throw new Error(`La transacción ${write.transactionId} cambió o ya no existe.`);
    }
    return matches[0];
  });
  const afterUpdates = updateWrites.map((write, index) => (
    applyTransactionUpdate(before[index], write)
  ));
  const created = plan.writes
    .filter(write => write.entity === 'transaction' && write.action === 'create')
    .map(write => ({ id: write.transactionId, ...write.data } as Transaction));

  const kind = plan.kind === 'asset-adjustment'
    || plan.kind === 'credit-persisted-authority'
    ? 'balance-adjustment'
    : plan.kind === 'credit-history-authority'
      ? 'migration'
      : 'edit';
  return {
    kind,
    before,
    after: [...afterUpdates, ...created],
    metadata: {
      operationId: plan.operationId,
      mutationSource: plan.kind === 'credit-history-authority'
        ? 'migration'
        : 'account',
      ...(created[0]?.expectedBefore !== undefined
        ? { expectedBefore: created[0].expectedBefore }
        : {}),
      ...(created[0]?.targetBalance !== undefined
        ? { targetBalance: created[0].targetBalance }
        : {}),
    },
  };
};

const definedValues = (values: Record<string, unknown>): Record<string, unknown> => (
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined))
);

const stageRepairPlan = (
  batch: WriteBatch,
  userId: string,
  plan: LedgerRepairPlan,
): void => {
  plan.writes.forEach(write => {
    if (write.entity === 'account') {
      batch.update(
        doc(db, `users/${userId}/accounts`, write.accountId),
        definedValues(write.values),
      );
      return;
    }
    const reference = doc(db, `users/${userId}/transactions`, write.transactionId);
    if (write.action === 'create') {
      batch.set(reference, definedValues(write.data as Record<string, unknown>));
      return;
    }
    const values: Record<string, unknown> = definedValues(write.values);
    write.unset.forEach(field => {
      values[field] = deleteField();
    });
    batch.update(reference, values);
  });
};

export async function executeConfirmedLedgerRepair(
  userId: string,
  plan: LedgerRepairPlan,
  confirmation: string,
): Promise<LedgerReconciliationReport> {
  if (!userId) throw new Error('Se requiere un usuario autenticado para reparar.');
  if (confirmation !== plan.confirmationPhrase) {
    throw new Error('La confirmación exacta del plan no coincide. No se escribió ningún dato.');
  }

  await executeAuthenticatedLedgerMutation(
    userId,
    async ({ loadContext }) => {
      const fresh = await loadServerSnapshot(userId);
      if (fresh.report.fingerprint !== plan.sourceFingerprint) {
        throw new Error('El libro cambió y este plan quedó obsoleto. Genera y confirma uno nuevo.');
      }
      if (
        !fresh.report.complete
        || fresh.report.issues.some(item => (
          item.code === 'incomplete'
          || item.code === 'invalid-record'
          || item.code === 'orphan-reference'
        ))
      ) {
        throw new Error('La autoridad fresca ya no permite ejecutar este plan.');
      }
      const context = await loadContext(plan.leaseAccountIds);
      const intent = planIntent(plan, context.transactions);
      return {
        intent,
        context,
        writeCount: plan.writes.length,
        stage: batch => stageRepairPlan(batch, userId, plan),
        result: undefined,
      };
    },
    { operationId: plan.operationId },
  );

  const after = await loadServerSnapshot(userId);
  const affectedTransactionIds = new Set(
    plan.writes
      .filter(write => write.entity === 'transaction')
      .map(write => write.transactionId),
  );
  const cacheTransactions = after.input.transactions.filter(transaction => (
    Boolean(transaction.id && affectedTransactionIds.has(transaction.id))
  ));
  if (cacheTransactions.length > 0) {
    publishTransactionCacheMutation({
      userId,
      type: 'update',
      transactions: cacheTransactions,
    });
  }
  return after.report;
}
