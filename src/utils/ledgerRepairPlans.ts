import { BALANCE_ADJUSTMENT_CATEGORY, CREDIT_PAYMENT_CATEGORY } from '../config/constants';
import type { Transaction } from '../types/finance';
import { roundMoney } from './formatters';
import { normalizeLedgerAmount } from './ledgerMutation';
import type { LedgerReconciliationReport } from './ledgerReconciliation';

export type LedgerRepairPlanKind =
  | 'asset-adjustment'
  | 'credit-history-authority'
  | 'credit-persisted-authority'
  | 'link-repair'
  | 'recurring-deduplication';

export interface LedgerRepairTransactionCreate {
  entity: 'transaction';
  action: 'create';
  transactionId: string;
  data: Omit<Transaction, 'id'>;
}

export interface LedgerRepairTransactionUpdate {
  entity: 'transaction';
  action: 'update';
  transactionId: string;
  values: Record<string, unknown>;
  unset: string[];
}

export interface LedgerRepairAccountUpdate {
  entity: 'account';
  action: 'update';
  accountId: string;
  values: Record<string, unknown>;
}

export type LedgerRepairWrite =
  | LedgerRepairTransactionCreate
  | LedgerRepairTransactionUpdate
  | LedgerRepairAccountUpdate;

export interface LedgerRepairPlan {
  version: 1;
  kind: LedgerRepairPlanKind;
  title: string;
  sourceFingerprint: string;
  operationId: string;
  confirmationPhrase: string;
  riskSummary: string;
  affectedIds: string[];
  leaseAccountIds: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  writes: LedgerRepairWrite[];
}

interface ReportTarget {
  report: LedgerReconciliationReport;
}

interface TimedTarget extends ReportTarget {
  effectiveAt: Date;
}

const SAFE_SEGMENT = /[^A-Za-z0-9._-]+/g;

const safeSegment = (value: string): string => (
  value.replace(SAFE_SEGMENT, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'target'
);

const operationIdFor = (
  report: LedgerReconciliationReport,
  kind: LedgerRepairPlanKind,
  target: string,
): string => (
  `ledger-mutation:repair:${kind}:${safeSegment(target)}:${report.fingerprint.slice(-16)}`
);

const transactionIdFor = (operationId: string): string => (
  `repair-${safeSegment(operationId).slice(-80)}`
);

const completePlan = (
  plan: Omit<LedgerRepairPlan, 'version' | 'confirmationPhrase'>,
): LedgerRepairPlan => ({
  version: 1,
  ...plan,
  confirmationPhrase: `APLICAR ${plan.operationId}`,
});

const assertFiniteDate = (date: Date): Date => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error('La fecha efectiva del plan no es válida.');
  }
  return new Date(date);
};

const assertRepairAuthority = (report: LedgerReconciliationReport): void => {
  if (!report.complete || report.issues.some(item => item.code === 'incomplete')) {
    throw new Error('La autoridad del libro debe estar completa antes de crear un plan.');
  }
  if (report.issues.some(item => (
    item.code === 'invalid-record' || item.code === 'orphan-reference'
  ))) {
    throw new Error('La autoridad contiene registros inválidos o referencias huérfanas.');
  }
};

const accountReport = (report: LedgerReconciliationReport, accountId: string) => {
  const matches = report.accounts.filter(account => account.accountId === accountId);
  if (matches.length !== 1) throw new Error('El objetivo de cuenta es ambiguo o no existe.');
  return matches[0];
};

const adjustmentTransaction = ({
  operationId,
  transactionId,
  accountId,
  accountName,
  type,
  amount,
  effectiveAt,
  expectedBefore,
  targetBalance,
}: {
  operationId: string;
  transactionId: string;
  accountId: string;
  accountName: string;
  type: 'income' | 'expense';
  amount: number;
  effectiveAt: Date;
  expectedBefore: number;
  targetBalance: number;
}): LedgerRepairTransactionCreate => ({
  entity: 'transaction',
  action: 'create',
  transactionId,
  data: {
    type,
    amount: normalizeLedgerAmount(amount),
    category: BALANCE_ADJUSTMENT_CATEGORY,
    description: `Conciliación auditada de ${accountName}`,
    date: new Date(effectiveAt),
    createdAt: new Date(effectiveAt),
    paid: true,
    accountId,
    operationId,
    mutationKind: 'balance-adjustment',
    mutationSource: 'account',
    expectedBefore: roundMoney(expectedBefore),
    targetBalance: roundMoney(targetBalance),
  },
});

export function buildAssetAdjustmentPlan({
  report,
  accountId,
  targetBalance,
  effectiveAt,
}: TimedTarget & {
  accountId: string;
  targetBalance: number;
}): LedgerRepairPlan {
  assertRepairAuthority(report);
  const account = accountReport(report, accountId);
  if (account.accountType === 'credit') {
    throw new Error('Una tarjeta requiere elegir explícitamente su autoridad de crédito.');
  }
  if (!Number.isFinite(targetBalance)) throw new Error('El saldo objetivo no es válido.');
  const normalizedTarget = roundMoney(targetBalance);
  const difference = roundMoney(normalizedTarget - account.calculatedBalance);
  if (difference === 0) throw new Error('La cuenta ya coincide con el saldo objetivo.');
  const date = assertFiniteDate(effectiveAt);
  const operationId = operationIdFor(report, 'asset-adjustment', accountId);
  const transactionId = transactionIdFor(operationId);

  return completePlan({
    kind: 'asset-adjustment',
    title: `Ajustar ${account.accountName} a ${normalizedTarget}`,
    sourceFingerprint: report.fingerprint,
    operationId,
    riskSummary: 'Crea una transacción de ajuste visible; no reescribe el historial existente.',
    affectedIds: [accountId],
    leaseAccountIds: [accountId],
    before: { calculatedBalance: account.calculatedBalance },
    after: { calculatedBalance: normalizedTarget },
    writes: [adjustmentTransaction({
      operationId,
      transactionId,
      accountId,
      accountName: account.accountName,
      type: difference > 0 ? 'income' : 'expense',
      amount: Math.abs(difference),
      effectiveAt: date,
      expectedBefore: account.calculatedBalance,
      targetBalance: normalizedTarget,
    })],
  });
}

const creditTarget = (report: LedgerReconciliationReport, accountId: string) => {
  assertRepairAuthority(report);
  const account = accountReport(report, accountId);
  if (account.accountType !== 'credit' || !account.creditAuthority) {
    throw new Error('El objetivo no es una tarjeta conciliable.');
  }
  const { persistedUsedCredit, historicalUsedCredit, difference } = account.creditAuthority;
  if (persistedUsedCredit === null || difference === null) {
    throw new Error('La tarjeta no tiene una autoridad persistida válida.');
  }
  if (difference === 0) throw new Error('La tarjeta no presenta divergencia de crédito.');
  const matchingIssues = report.issues.filter(item => (
    item.code === 'credit-divergence' && item.accountId === accountId
  ));
  if (matchingIssues.length !== 1) {
    throw new Error('La divergencia de crédito es ambigua o ya no existe.');
  }
  return { account, persistedUsedCredit, historicalUsedCredit, difference };
};

export function buildCreditHistoryAuthorityPlan({
  report,
  accountId,
}: ReportTarget & { accountId: string }): LedgerRepairPlan {
  const { account, persistedUsedCredit, historicalUsedCredit } = creditTarget(
    report,
    accountId,
  );
  const operationId = operationIdFor(report, 'credit-history-authority', accountId);
  return completePlan({
    kind: 'credit-history-authority',
    title: `Usar el historial para ${account.accountName}`,
    sourceFingerprint: report.fingerprint,
    operationId,
    riskSummary: 'Actualiza usedCredit a la deuda explicada por el historial completo.',
    affectedIds: [accountId],
    leaseAccountIds: [accountId],
    before: { persistedUsedCredit, historicalUsedCredit },
    after: {
      persistedUsedCredit: historicalUsedCredit,
      historicalUsedCredit,
    },
    writes: [{
      entity: 'account',
      action: 'update',
      accountId,
      values: { usedCredit: historicalUsedCredit },
    }],
  });
}

export function buildCreditPersistedAuthorityPlan({
  report,
  accountId,
  effectiveAt,
}: TimedTarget & { accountId: string }): LedgerRepairPlan {
  const {
    account,
    persistedUsedCredit,
    historicalUsedCredit,
    difference,
  } = creditTarget(report, accountId);
  const date = assertFiniteDate(effectiveAt);
  const operationId = operationIdFor(report, 'credit-persisted-authority', accountId);
  const transactionId = transactionIdFor(operationId);
  return completePlan({
    kind: 'credit-persisted-authority',
    title: `Usar usedCredit para ${account.accountName}`,
    sourceFingerprint: report.fingerprint,
    operationId,
    riskSummary: 'Conserva usedCredit y agrega una fila auditable que alinea el historial.',
    affectedIds: [accountId],
    leaseAccountIds: [accountId],
    before: { persistedUsedCredit, historicalUsedCredit },
    after: {
      persistedUsedCredit,
      historicalUsedCredit: persistedUsedCredit,
    },
    writes: [adjustmentTransaction({
      operationId,
      transactionId,
      accountId,
      accountName: account.accountName,
      type: difference > 0 ? 'expense' : 'income',
      amount: Math.abs(difference),
      effectiveAt: date,
      expectedBefore: historicalUsedCredit,
      targetBalance: persistedUsedCredit,
    })],
  });
}

const normalizedText = (value: string | undefined): string => (
  (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
);

const isPaymentCategory = (category: string): boolean => (
  category === CREDIT_PAYMENT_CATEGORY || category === 'Pago TC'
);

export function buildLinkRepairPlan({
  report,
  transactions,
  creditTransactionId,
  sourceTransactionId,
}: ReportTarget & {
  transactions: readonly Transaction[];
  creditTransactionId: string;
  sourceTransactionId: string;
}): LedgerRepairPlan {
  assertRepairAuthority(report);
  if (creditTransactionId === sourceTransactionId) {
    throw new Error('El objetivo del vínculo es ambiguo.');
  }
  const creditMatches = transactions.filter(item => item.id === creditTransactionId);
  const sourceMatches = transactions.filter(item => item.id === sourceTransactionId);
  if (creditMatches.length !== 1 || sourceMatches.length !== 1) {
    throw new Error('El objetivo del vínculo es ambiguo o no existe.');
  }
  const [credit] = creditMatches;
  const [source] = sourceMatches;
  const creditAccount = accountReport(report, credit.accountId);
  const semanticMatch = creditAccount.accountType === 'credit'
    && credit.type === 'income'
    && source.type === 'expense'
    && credit.accountId !== source.accountId
    && isPaymentCategory(credit.category)
    && isPaymentCategory(source.category)
    && roundMoney(credit.amount) === roundMoney(source.amount)
    && credit.date.getTime() === source.date.getTime()
    && credit.paid === source.paid
    && normalizedText(credit.beneficiary) === normalizedText(source.beneficiary);
  if (!semanticMatch) {
    throw new Error('Las filas no tienen semántica inequívoca de pago de tarjeta.');
  }
  const matchingIssues = report.issues.filter(item => (
    item.code === 'broken-link'
    && item.transactionIds?.includes(creditTransactionId)
    && item.transactionIds.includes(sourceTransactionId)
  ));
  if (matchingIssues.length !== 1) {
    throw new Error('El vínculo roto es ambiguo o ya no existe.');
  }
  const operationId = operationIdFor(
    report,
    'link-repair',
    `${creditTransactionId}-${sourceTransactionId}`,
  );
  return completePlan({
    kind: 'link-repair',
    title: 'Restablecer vínculo recíproco del pago',
    sourceFingerprint: report.fingerprint,
    operationId,
    riskSummary: 'Solo modifica linkedTransactionId; monto, fecha y cuentas permanecen intactos.',
    affectedIds: [creditTransactionId, sourceTransactionId].sort(),
    leaseAccountIds: [credit.accountId, source.accountId].sort(),
    before: {
      [creditTransactionId]: credit.linkedTransactionId ?? null,
      [sourceTransactionId]: source.linkedTransactionId ?? null,
    },
    after: {
      [creditTransactionId]: sourceTransactionId,
      [sourceTransactionId]: creditTransactionId,
    },
    writes: [
      {
        entity: 'transaction',
        action: 'update',
        transactionId: creditTransactionId,
        values: { linkedTransactionId: sourceTransactionId },
        unset: [],
      },
      {
        entity: 'transaction',
        action: 'update',
        transactionId: sourceTransactionId,
        values: { linkedTransactionId: creditTransactionId },
        unset: [],
      },
    ],
  });
}

export function buildRecurringDeduplicationPlan({
  report,
  transactions,
  recurringPaymentId,
  recurringCycle,
  keepTransactionId,
}: ReportTarget & {
  transactions: readonly Transaction[];
  recurringPaymentId: string;
  recurringCycle: string;
  keepTransactionId: string;
}): LedgerRepairPlan {
  assertRepairAuthority(report);
  const cycleId = `${recurringPaymentId}:${recurringCycle}`;
  const matchingIssues = report.issues.filter(item => (
    item.code === 'recurring-duplicate' && item.entityId === cycleId
  ));
  const duplicates = transactions.filter(transaction => (
    transaction.id
    && transaction.paid
    && transaction.recurringPaymentId === recurringPaymentId
    && transaction.recurringCycle === recurringCycle
  ));
  if (
    matchingIssues.length !== 1
    || duplicates.length < 2
    || duplicates.filter(item => item.id === keepTransactionId).length !== 1
  ) {
    throw new Error('El ciclo duplicado u objetivo de conservación es ambiguo.');
  }
  const duplicateIds = duplicates
    .map(transaction => transaction.id!)
    .sort();
  const operationId = operationIdFor(report, 'recurring-deduplication', cycleId);
  const leaseAccountIds = [...new Set(duplicates.map(item => item.accountId))].sort();
  const writes: LedgerRepairTransactionUpdate[] = duplicateIds
    .filter(transactionId => transactionId !== keepTransactionId)
    .map(transactionId => ({
      entity: 'transaction',
      action: 'update',
      transactionId,
      values: {},
      unset: ['recurringCycle', 'recurringPaymentId'],
    }));
  return completePlan({
    kind: 'recurring-deduplication',
    title: `Conservar ${keepTransactionId} como identidad del ciclo`,
    sourceFingerprint: report.fingerprint,
    operationId,
    riskSummary: 'Conserva todas las filas financieras y retira solo metadatos duplicados.',
    affectedIds: duplicateIds,
    leaseAccountIds,
    before: Object.fromEntries(duplicateIds.map(transactionId => [transactionId, {
      recurringPaymentId,
      recurringCycle,
    }])),
    after: Object.fromEntries(duplicateIds.map(transactionId => [transactionId, (
      transactionId === keepTransactionId
        ? { recurringPaymentId, recurringCycle }
        : { recurringPaymentId: null, recurringCycle: null }
    )])),
    writes,
  });
}
