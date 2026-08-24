import { LOAN_CATEGORY, LOAN_PAYMENT_CATEGORY } from '../config/constants';
import type { Account, Debt, RecurringPayment, Transaction } from '../types/finance';
import { getAccountReferenceIds } from './accountTransactions';
import { validateCreditPaymentPair } from './creditPaymentPairs';
import { reconcileUsedCredit } from './creditDeltas';
import { roundMoney } from './formatters';
import type { TransactionDecodeIssue } from './transactionDecoder';

export type LedgerReconciliationStatus =
  | 'ok'
  | 'incomplete'
  | 'invalid-record'
  | 'orphan-reference'
  | 'broken-link'
  | 'credit-divergence'
  | 'recurring-duplicate'
  | 'dependent-debt-mismatch'
  | 'negative-explained';

export type LedgerReconciliationIssueCode = Exclude<LedgerReconciliationStatus, 'ok'>;

export interface LedgerReconciliationIssue {
  id: string;
  code: LedgerReconciliationIssueCode;
  severity: 'blocking' | 'warning' | 'info';
  entityType: 'source' | 'account' | 'transaction' | 'debt' | 'recurring-cycle';
  entityId: string;
  message: string;
  reason?: string;
  accountId?: string;
  transactionIds?: string[];
}

export interface LedgerReconciliationMovement {
  transactionId: string;
  date: Date;
  kind: 'income' | 'expense' | 'transfer-in' | 'transfer-out' | 'transfer-net';
  signedAmount: number;
  runningBalance: number;
  crossesZero: boolean;
}

export interface LedgerReconciliationPendingRow {
  transactionId: string;
  date: Date;
  kind: LedgerReconciliationMovement['kind'];
  signedAmount: number;
}

export interface LedgerCreditAuthorityComparison {
  persistedUsedCredit: number | null;
  historicalUsedCredit: number;
  difference: number | null;
}

export interface LedgerAccountReconciliation {
  accountId: string;
  accountName: string;
  accountType: Account['type'];
  status: LedgerReconciliationStatus;
  initialBalance: number;
  paidIncome: number;
  paidExpense: number;
  incomingTransfers: number;
  outgoingTransfers: number;
  calculatedBalance: number;
  movements: LedgerReconciliationMovement[];
  pendingRows: LedgerReconciliationPendingRow[];
  crossingZeroTransactionIds: string[];
  creditAuthority?: LedgerCreditAuthorityComparison;
  issueIds: string[];
}

export interface LedgerReconciliationInput {
  source: 'server' | 'cache' | 'guest';
  complete: boolean;
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  transactionIssues?: readonly TransactionDecodeIssue[];
  debts?: readonly Debt[];
  recurringPayments?: readonly RecurringPayment[];
}

export interface LedgerReconciliationReport {
  source: LedgerReconciliationInput['source'];
  complete: boolean;
  status: LedgerReconciliationStatus;
  fingerprint: string;
  accounts: LedgerAccountReconciliation[];
  issues: LedgerReconciliationIssue[];
  sourceCounts: {
    accounts: number;
    transactions: number;
    invalidTransactions: number;
    debts: number;
    recurringPayments: number;
  };
}

const ISSUE_PRIORITY: Record<LedgerReconciliationIssueCode, number> = {
  incomplete: 0,
  'invalid-record': 1,
  'orphan-reference': 2,
  'broken-link': 3,
  'credit-divergence': 4,
  'recurring-duplicate': 5,
  'dependent-debt-mismatch': 6,
  'negative-explained': 7,
};

const issueSeverity = (
  code: LedgerReconciliationIssueCode,
): LedgerReconciliationIssue['severity'] => {
  if (code === 'negative-explained') return 'info';
  if (code === 'credit-divergence' || code === 'recurring-duplicate') return 'warning';
  return 'blocking';
};

const issue = (
  code: LedgerReconciliationIssueCode,
  entityType: LedgerReconciliationIssue['entityType'],
  entityId: string,
  message: string,
  details: Pick<
    LedgerReconciliationIssue,
    'reason' | 'accountId' | 'transactionIds'
  > = {},
): LedgerReconciliationIssue => ({
  id: `${code}:${entityType}:${entityId}${details.reason ? `:${details.reason}` : ''}`,
  code,
  severity: issueSeverity(code),
  entityType,
  entityId,
  message,
  ...details,
});

const dateTime = (value: Date | undefined): number => value?.getTime() ?? 0;
const transactionIdentity = (transaction: Transaction, index: number): string => (
  transaction.id ?? `sin-id-${index}`
);

const compareTransactions = (
  left: { transaction: Transaction; id: string },
  right: { transaction: Transaction; id: string },
): number => (
  dateTime(left.transaction.date) - dateTime(right.transaction.date)
  || dateTime(left.transaction.createdAt) - dateTime(right.transaction.createdAt)
  || left.id.localeCompare(right.id)
);

const signedEffect = (
  transaction: Transaction,
  references: ReadonlySet<string>,
): {
  kind: LedgerReconciliationMovement['kind'];
  signedAmount: number;
  income: number;
  expense: number;
  incoming: number;
  outgoing: number;
} | null => {
  if (transaction.type === 'income' && references.has(transaction.accountId)) {
    return {
      kind: 'income',
      signedAmount: transaction.amount,
      income: transaction.amount,
      expense: 0,
      incoming: 0,
      outgoing: 0,
    };
  }
  if (transaction.type === 'expense' && references.has(transaction.accountId)) {
    return {
      kind: 'expense',
      signedAmount: -transaction.amount,
      income: 0,
      expense: transaction.amount,
      incoming: 0,
      outgoing: 0,
    };
  }
  if (transaction.type !== 'transfer') return null;

  const outgoing = references.has(transaction.accountId) ? transaction.amount : 0;
  const incoming = transaction.toAccountId && references.has(transaction.toAccountId)
    ? transaction.amount
    : 0;
  if (incoming === 0 && outgoing === 0) return null;
  return {
    kind: incoming > 0 && outgoing > 0
      ? 'transfer-net'
      : incoming > 0 ? 'transfer-in' : 'transfer-out',
    signedAmount: roundMoney(incoming - outgoing),
    income: 0,
    expense: 0,
    incoming,
    outgoing,
  };
};

const crossesZero = (before: number, after: number): boolean => (
  (before >= 0 && after < 0) || (before < 0 && after >= 0)
);

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
};

const stableSortByContent = <T>(values: readonly T[]): unknown[] => (
  values
    .map(value => canonicalize(value))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
);

const hashSource = (source: string): string => {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  return seeds.map(seed => {
    let hash = seed;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }).join('');
};

export const ledgerReconciliationFingerprint = (
  input: LedgerReconciliationInput,
): string => {
  const serialized = JSON.stringify(canonicalize({
    version: 1,
    source: input.source,
    complete: input.complete,
    accounts: stableSortByContent(input.accounts.map(accountValue => ({
      id: accountValue.id,
      type: accountValue.type,
      initialBalance: accountValue.initialBalance,
      creditLimit: accountValue.creditLimit,
      usedCredit: accountValue.usedCredit,
      mergedAccountIds: [...(accountValue.mergedAccountIds ?? [])].sort(),
      bankAccountId: accountValue.bankAccountId,
      creditDebtModelVersion: accountValue.creditDebtModelVersion,
      paymentPairModelVersion: accountValue.paymentPairModelVersion,
    }))),
    transactions: stableSortByContent(input.transactions.map(transactionValue => ({
      id: transactionValue.id,
      type: transactionValue.type,
      amount: transactionValue.amount,
      totalInterestAmount: transactionValue.totalInterestAmount,
      paid: transactionValue.paid,
      accountId: transactionValue.accountId,
      toAccountId: transactionValue.toAccountId,
      date: transactionValue.date,
      createdAt: transactionValue.createdAt,
      category: transactionValue.category,
      description: transactionValue.description,
      linkedTransactionId: transactionValue.linkedTransactionId,
      recurringPaymentId: transactionValue.recurringPaymentId,
      recurringCycle: transactionValue.recurringCycle,
      debtId: transactionValue.debtId,
      operationId: transactionValue.operationId,
      mutationKind: transactionValue.mutationKind,
      mutationSource: transactionValue.mutationSource,
    }))),
    transactionIssues: stableSortByContent(input.transactionIssues ?? []),
    debts: stableSortByContent(input.debts ?? []),
    recurringPayments: stableSortByContent(input.recurringPayments ?? []),
  }));
  return `ledger-v1-${hashSource(serialized)}`;
};

const buildAccountReport = (
  accountValue: Account,
  transactions: readonly Transaction[],
): LedgerAccountReconciliation => {
  const accountId = accountValue.id!;
  const references = new Set(getAccountReferenceIds(accountValue));
  const related = transactions
    .map((transaction, index) => ({
      transaction,
      id: transactionIdentity(transaction, index),
      effect: signedEffect(transaction, references),
    }))
    .filter((item): item is typeof item & { effect: NonNullable<typeof item.effect> } => (
      item.effect !== null
    ))
    .sort(compareTransactions);

  let paidIncome = 0;
  let paidExpense = 0;
  let incomingTransfers = 0;
  let outgoingTransfers = 0;
  let runningBalance = roundMoney(accountValue.initialBalance);
  const movements: LedgerReconciliationMovement[] = [];
  const pendingRows: LedgerReconciliationPendingRow[] = [];

  related.forEach(({ transaction, id, effect }) => {
    if (!transaction.paid) {
      pendingRows.push({
        transactionId: id,
        date: new Date(transaction.date),
        kind: effect.kind,
        signedAmount: roundMoney(effect.signedAmount),
      });
      return;
    }

    paidIncome = roundMoney(paidIncome + effect.income);
    paidExpense = roundMoney(paidExpense + effect.expense);
    incomingTransfers = roundMoney(incomingTransfers + effect.incoming);
    outgoingTransfers = roundMoney(outgoingTransfers + effect.outgoing);
    const before = runningBalance;
    runningBalance = roundMoney(runningBalance + effect.signedAmount);
    movements.push({
      transactionId: id,
      date: new Date(transaction.date),
      kind: effect.kind,
      signedAmount: roundMoney(effect.signedAmount),
      runningBalance,
      crossesZero: crossesZero(before, runningBalance),
    });
  });

  const report: LedgerAccountReconciliation = {
    accountId,
    accountName: accountValue.name,
    accountType: accountValue.type,
    status: 'ok',
    initialBalance: roundMoney(accountValue.initialBalance),
    paidIncome,
    paidExpense,
    incomingTransfers,
    outgoingTransfers,
    calculatedBalance: runningBalance,
    movements,
    pendingRows,
    crossingZeroTransactionIds: movements
      .filter(movement => movement.crossesZero)
      .map(movement => movement.transactionId),
    issueIds: [],
  };

  if (accountValue.type === 'credit') {
    const historicalUsedCredit = reconcileUsedCredit(
      getAccountReferenceIds(accountValue),
      transactions,
    );
    const persistedUsedCredit = typeof accountValue.usedCredit === 'number'
      && Number.isFinite(accountValue.usedCredit)
      && accountValue.usedCredit >= 0
      ? roundMoney(accountValue.usedCredit)
      : null;
    report.creditAuthority = {
      persistedUsedCredit,
      historicalUsedCredit,
      difference: persistedUsedCredit === null
        ? null
        : roundMoney(persistedUsedCredit - historicalUsedCredit),
    };
  }

  return report;
};

const addReferenceIssues = (
  input: LedgerReconciliationInput,
  resolveAccount: (reference: string | undefined) => Account | undefined,
  issues: LedgerReconciliationIssue[],
): void => {
  const debtIds = new Set((input.debts ?? []).map(item => item.id).filter(Boolean));
  const recurringIds = new Set(
    (input.recurringPayments ?? []).map(item => item.id).filter(Boolean),
  );

  input.transactions.forEach((transaction, index) => {
    const transactionId = transactionIdentity(transaction, index);
    const sourceAccount = resolveAccount(transaction.accountId);
    if (!sourceAccount) {
      issues.push(issue(
        'orphan-reference',
        'transaction',
        transactionId,
        `La transacción ${transactionId} referencia la cuenta inexistente ${transaction.accountId}.`,
        { reason: `account:${transaction.accountId}`, transactionIds: [transactionId] },
      ));
    }
    if (transaction.type === 'transfer' && !resolveAccount(transaction.toAccountId)) {
      issues.push(issue(
        'orphan-reference',
        'transaction',
        transactionId,
        `La transferencia ${transactionId} referencia un destino inexistente.`,
        { reason: `account:${transaction.toAccountId ?? 'missing'}`, transactionIds: [transactionId] },
      ));
    }
    if (transaction.debtId && !debtIds.has(transaction.debtId)) {
      issues.push(issue(
        'orphan-reference',
        'transaction',
        transactionId,
        `La transacción ${transactionId} referencia la deuda inexistente ${transaction.debtId}.`,
        {
          reason: `debt:${transaction.debtId}`,
          accountId: sourceAccount?.id,
          transactionIds: [transactionId],
        },
      ));
    }
    if (transaction.recurringPaymentId && !recurringIds.has(transaction.recurringPaymentId)) {
      issues.push(issue(
        'orphan-reference',
        'transaction',
        transactionId,
        `La transacción ${transactionId} referencia un pago periódico inexistente.`,
        {
          reason: `recurring:${transaction.recurringPaymentId}`,
          accountId: sourceAccount?.id,
          transactionIds: [transactionId],
        },
      ));
    }
  });

  (input.debts ?? []).forEach((debtValue, index) => {
    if (!debtValue.accountId || resolveAccount(debtValue.accountId)) return;
    const debtId = debtValue.id ?? `sin-id-${index}`;
    issues.push(issue(
      'orphan-reference',
      'debt',
      debtId,
      `La deuda ${debtId} referencia una cuenta inexistente.`,
      { reason: `account:${debtValue.accountId}` },
    ));
  });
};

const addBrokenLinkIssues = (
  input: LedgerReconciliationInput,
  resolveAccount: (reference: string | undefined) => Account | undefined,
  issues: LedgerReconciliationIssue[],
): void => {
  const byId = new Map(
    input.transactions
      .filter(transaction => Boolean(transaction.id))
      .map(transaction => [transaction.id!, transaction]),
  );
  const visited = new Set<string>();

  input.transactions.forEach((transaction, index) => {
    if (!transaction.linkedTransactionId) return;
    const transactionId = transactionIdentity(transaction, index);
    const pairId = [transactionId, transaction.linkedTransactionId].sort().join('|');
    if (visited.has(pairId)) return;
    visited.add(pairId);

    const counterpart = byId.get(transaction.linkedTransactionId);
    const candidates = [transaction, counterpart].filter(
      (candidate): candidate is Transaction => Boolean(candidate),
    );
    const creditTransaction = candidates.find(candidate => (
      candidate.type === 'income'
      && resolveAccount(candidate.accountId)?.type === 'credit'
    ));
    const creditAccount = creditTransaction
      ? resolveAccount(creditTransaction.accountId)
      : undefined;
    const sourceTransaction = creditTransaction === transaction ? counterpart : transaction;
    const validation = creditTransaction && creditAccount
      ? validateCreditPaymentPair(creditTransaction, sourceTransaction, creditAccount)
      : { valid: false as const, reason: 'WRONG_ROLE' as const };
    if (validation.valid) return;

    issues.push(issue(
      'broken-link',
      'transaction',
      pairId,
      `El vínculo ${pairId} no forma un pago de tarjeta recíproco y válido.`,
      {
        reason: validation.reason,
        accountId: creditAccount?.id,
        transactionIds: candidates
          .map(candidate => candidate.id)
          .filter((id): id is string => Boolean(id))
          .sort(),
      },
    ));
  });
};

const addRecurringDuplicateIssues = (
  transactions: readonly Transaction[],
  issues: LedgerReconciliationIssue[],
): void => {
  const cycles = new Map<string, string[]>();
  transactions.forEach((transaction, index) => {
    if (!transaction.paid || !transaction.recurringPaymentId || !transaction.recurringCycle) {
      return;
    }
    const cycleId = `${transaction.recurringPaymentId}:${transaction.recurringCycle}`;
    cycles.set(cycleId, [
      ...(cycles.get(cycleId) ?? []),
      transactionIdentity(transaction, index),
    ]);
  });
  cycles.forEach((transactionIds, cycleId) => {
    if (transactionIds.length < 2) return;
    const sortedIds = [...transactionIds].sort();
    issues.push(issue(
      'recurring-duplicate',
      'recurring-cycle',
      cycleId,
      `El ciclo ${cycleId} tiene ${transactionIds.length} transacciones pagadas.`,
      { transactionIds: sortedIds },
    ));
  });
};

const addDebtMismatchIssues = (
  input: LedgerReconciliationInput,
  issues: LedgerReconciliationIssue[],
): void => {
  (input.debts ?? []).forEach((debtValue, index) => {
    if (!debtValue.accountId) return;
    const debtId = debtValue.id ?? `sin-id-${index}`;
    const related = input.transactions.filter(transaction => transaction.debtId === debtValue.id);
    const principals = related.filter(transaction => transaction.category === LOAN_CATEGORY);
    const payments = related.filter(transaction => (
      transaction.category === LOAN_PAYMENT_CATEGORY && transaction.paid
    ));
    const expectedPrincipalType = debtValue.type === 'lent' ? 'expense' : 'income';
    const expectedPaymentType = debtValue.type === 'lent' ? 'income' : 'expense';
    const principalIsValid = principals.length === 1
      && principals[0].type === expectedPrincipalType
      && principals[0].accountId === debtValue.accountId
      && roundMoney(principals[0].amount) === roundMoney(debtValue.originalAmount);
    const paymentsAreValid = payments.every(transaction => (
      transaction.type === expectedPaymentType
      && transaction.accountId === debtValue.accountId
    ));
    const expectedRemaining = Math.max(0, roundMoney(
      debtValue.originalAmount
      - payments.reduce((sum, transaction) => sum + transaction.amount, 0),
    ));
    const settledShouldBe = expectedRemaining === 0;
    const authorityMatches = roundMoney(debtValue.remainingAmount) === expectedRemaining
      && debtValue.isSettled === settledShouldBe;
    if (principalIsValid && paymentsAreValid && authorityMatches) return;

    issues.push(issue(
      'dependent-debt-mismatch',
      'debt',
      debtId,
      `La deuda ${debtId} no coincide con su principal, pagos o saldo dependiente.`,
      {
        reason: `expected-remaining:${expectedRemaining}`,
        accountId: debtValue.accountId,
        transactionIds: related
          .map(transaction => transaction.id)
          .filter((id): id is string => Boolean(id))
          .sort(),
      },
    ));
  });
};

const sortIssues = (
  issues: readonly LedgerReconciliationIssue[],
): LedgerReconciliationIssue[] => [...issues].sort((left, right) => (
  ISSUE_PRIORITY[left.code] - ISSUE_PRIORITY[right.code]
  || left.entityType.localeCompare(right.entityType)
  || left.entityId.localeCompare(right.entityId)
  || left.id.localeCompare(right.id)
));

export function buildLedgerReconciliationReport(
  input: LedgerReconciliationInput,
): LedgerReconciliationReport {
  const issues: LedgerReconciliationIssue[] = [];
  if (!input.complete) {
    issues.push(issue(
      'incomplete',
      'source',
      input.source,
      'La autoridad del libro todavía no es completa.',
    ));
  }

  (input.transactionIssues ?? []).forEach(transactionIssue => {
    issues.push(issue(
      'invalid-record',
      'transaction',
      transactionIssue.transactionId,
      transactionIssue.message,
      {
        reason: transactionIssue.code,
        transactionIds: [transactionIssue.transactionId],
      },
    ));
  });

  const accountReferences = new Map<string, Account[]>();
  input.accounts.forEach((accountValue, index) => {
    if (
      !accountValue.id
      || !Number.isFinite(accountValue.initialBalance)
      || !['savings', 'cash', 'credit'].includes(accountValue.type)
    ) {
      const accountId = accountValue.id ?? `sin-id-${index}`;
      issues.push(issue(
        'invalid-record',
        'account',
        accountId,
        `La cuenta ${accountId} no tiene una autoridad válida.`,
        { accountId: accountValue.id },
      ));
      return;
    }
    getAccountReferenceIds(accountValue).forEach(reference => {
      accountReferences.set(reference, [
        ...(accountReferences.get(reference) ?? []),
        accountValue,
      ]);
    });
  });
  const resolveAccount = (reference: string | undefined): Account | undefined => {
    if (!reference) return undefined;
    const candidates = accountReferences.get(reference) ?? [];
    return candidates.length === 1 ? candidates[0] : undefined;
  };

  accountReferences.forEach((candidates, reference) => {
    if (candidates.length < 2) return;
    issues.push(issue(
      'invalid-record',
      'account',
      reference,
      `La referencia ${reference} pertenece a más de una cuenta.`,
      { reason: 'ambiguous-reference' },
    ));
  });

  addReferenceIssues(input, resolveAccount, issues);
  addBrokenLinkIssues(input, resolveAccount, issues);
  addRecurringDuplicateIssues(input.transactions, issues);
  addDebtMismatchIssues(input, issues);

  let accountReports = input.accounts
    .filter((accountValue): accountValue is Account & { id: string } => (
      Boolean(accountValue.id) && Number.isFinite(accountValue.initialBalance)
    ))
    .map(accountValue => buildAccountReport(accountValue, input.transactions))
    .sort((left, right) => left.accountId.localeCompare(right.accountId));

  accountReports.forEach(accountReport => {
    if (!accountReport.creditAuthority) return;
    const { persistedUsedCredit, historicalUsedCredit, difference } = (
      accountReport.creditAuthority
    );
    if (persistedUsedCredit === null) {
      issues.push(issue(
        'incomplete',
        'account',
        accountReport.accountId,
        `La tarjeta ${accountReport.accountName} no tiene usedCredit válido.`,
        { accountId: accountReport.accountId, reason: 'missing-used-credit' },
      ));
    } else if (difference !== null && Math.abs(difference) >= 0.01) {
      issues.push(issue(
        'credit-divergence',
        'account',
        accountReport.accountId,
        `La tarjeta ${accountReport.accountName} persiste ${persistedUsedCredit} y el historial explica ${historicalUsedCredit}.`,
        { accountId: accountReport.accountId },
      ));
    }
  });

  const hasUnknownInvalidTransaction = issues.some(item => (
    item.code === 'invalid-record' && item.entityType === 'transaction'
  ));
  accountReports.forEach(accountReport => {
    if (accountReport.accountType === 'credit' || accountReport.calculatedBalance >= 0) return;
    const accountHasBlockingIssue = issues.some(item => (
      item.code !== 'negative-explained'
      && (
        item.code === 'incomplete'
        || item.accountId === accountReport.accountId
      )
    ));
    if (!input.complete || hasUnknownInvalidTransaction || accountHasBlockingIssue) return;
    issues.push(issue(
      'negative-explained',
      'account',
      accountReport.accountId,
      `La ecuación completa de ${accountReport.accountName} explica el saldo negativo ${accountReport.calculatedBalance}.`,
      {
        accountId: accountReport.accountId,
        transactionIds: accountReport.crossingZeroTransactionIds,
      },
    ));
  });

  const orderedIssues = sortIssues(issues);
  accountReports = accountReports.map(accountReport => {
    const applicableIssues = orderedIssues.filter(item => (
      item.accountId === accountReport.accountId
      || (item.entityType === 'source' && item.code === 'incomplete')
      || (item.entityType === 'transaction' && item.code === 'invalid-record')
    ));
    return {
      ...accountReport,
      status: applicableIssues[0]?.code ?? 'ok',
      issueIds: applicableIssues.map(item => item.id),
    };
  });

  return {
    source: input.source,
    complete: input.complete,
    status: orderedIssues[0]?.code ?? 'ok',
    fingerprint: ledgerReconciliationFingerprint(input),
    accounts: accountReports,
    issues: orderedIssues,
    sourceCounts: {
      accounts: input.accounts.length,
      transactions: input.transactions.length,
      invalidTransactions: input.transactionIssues?.length ?? 0,
      debts: input.debts?.length ?? 0,
      recurringPayments: input.recurringPayments?.length ?? 0,
    },
  };
}
