'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { useUIPreferences } from '../../contexts/UIPreferencesContext';
import { useLedgerReconciliation } from '../../hooks/useLedgerReconciliation';
import type { Transaction } from '../../types/finance';
import { formatCurrency } from '../../utils/formatters';
import type {
  LedgerAccountReconciliation,
  LedgerReconciliationIssue,
  LedgerReconciliationIssueCode,
} from '../../utils/ledgerReconciliation';
import {
  buildAssetAdjustmentPlan,
  buildCreditHistoryAuthorityPlan,
  buildCreditPersistedAuthorityPlan,
  buildLinkRepairPlan,
  buildRecurringDeduplicationPlan,
  type LedgerRepairPlan,
} from '../../utils/ledgerRepairPlans';
import { BaseModal } from './BaseModal';

interface LedgerReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
}

const ISSUE_LABELS: Record<LedgerReconciliationIssueCode, string> = {
  incomplete: 'Autoridad incompleta',
  'invalid-record': 'Registro inválido',
  'orphan-reference': 'Referencia huérfana',
  'broken-link': 'Vínculo roto',
  'credit-divergence': 'Divergencia de crédito',
  'recurring-duplicate': 'Ciclo periódico duplicado',
  'dependent-debt-mismatch': 'Deuda dependiente inconsistente',
  'negative-explained': 'Negativo explicado',
};

const issueTone = (code: LedgerReconciliationIssueCode): string => {
  if (code === 'negative-explained' || code === 'credit-divergence' || code === 'recurring-duplicate') {
    return 'border-warning/40 bg-warning-muted text-warning';
  }
  return 'border-destructive/40 bg-destructive-muted text-destructive';
};

const maskedEvidence = (value: unknown, hidden: boolean): unknown => {
  if (hidden && typeof value === 'number') return '••••••';
  if (Array.isArray(value)) return value.map(item => maskedEvidence(item, hidden));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, maskedEvidence(item, hidden)]),
    );
  }
  return value;
};

const visibleIssueMessage = (
  reconciliationIssue: LedgerReconciliationIssue,
  hidden: boolean,
): string => {
  if (!hidden) return reconciliationIssue.message;
  if (reconciliationIssue.code === 'credit-divergence') {
    return 'La autoridad persistida y el historial completo no coinciden.';
  }
  if (reconciliationIssue.code === 'negative-explained') {
    return 'La ecuación completa explica un saldo negativo oculto.';
  }
  return reconciliationIssue.message;
};

const visiblePlanTitle = (plan: LedgerRepairPlan, hidden: boolean): string => (
  hidden && plan.kind === 'asset-adjustment' ? 'Ajuste de saldo' : plan.title
);

const accountForTransaction = (
  accounts: readonly LedgerAccountReconciliation[],
  transaction: Transaction,
) => accounts.find(account => account.accountId === transaction.accountId);

export function LedgerReconciliationModal({
  isOpen,
  onClose,
  userId,
}: LedgerReconciliationModalProps) {
  const { hideBalances } = useUIPreferences();
  const {
    report,
    transactions,
    status,
    refreshing,
    executing,
    error,
    refresh,
    executePlan,
  } = useLedgerReconciliation({ userId, isOpen });
  const [selectedPlan, setSelectedPlan] = useState<LedgerRepairPlan | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [planError, setPlanError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (
      selectedPlan
      && report
      && selectedPlan.sourceFingerprint !== report.fingerprint
    ) {
      setSelectedPlan(null);
      setConfirmation('');
    }
  }, [report, selectedPlan]);

  const amount = (value: number) => hideBalances ? '••••••' : formatCurrency(value);
  const canBuildPlans = Boolean(userId && report?.complete && status === 'ready');

  const preparePlan = (builder: () => LedgerRepairPlan) => {
    try {
      const plan = builder();
      setSelectedPlan(plan);
      setConfirmation('');
      setPlanError(null);
      setSuccessMessage(null);
    } catch (planBuildError) {
      setPlanError(
        planBuildError instanceof Error
          ? planBuildError.message
          : 'No se pudo preparar el plan.',
      );
    }
  };

  const prepareLinkRepair = (reconciliationIssue: LedgerReconciliationIssue) => {
    if (!report || !reconciliationIssue.transactionIds) return;
    const candidates = reconciliationIssue.transactionIds
      .map(id => transactions.find(transaction => transaction.id === id))
      .filter((transaction): transaction is Transaction => Boolean(transaction));
    const credit = candidates.find(transaction => (
      transaction.type === 'income'
      && accountForTransaction(report.accounts, transaction)?.accountType === 'credit'
    ));
    const source = candidates.find(transaction => transaction.id !== credit?.id);
    if (!credit?.id || !source?.id) {
      setPlanError('El vínculo no tiene dos roles inequívocos para preparar una reparación.');
      return;
    }
    preparePlan(() => buildLinkRepairPlan({
      report,
      transactions,
      creditTransactionId: credit.id!,
      sourceTransactionId: source.id!,
    }));
  };

  const prepareRecurringRepair = (reconciliationIssue: LedgerReconciliationIssue) => {
    if (!report || !reconciliationIssue.transactionIds?.length) return;
    const separator = reconciliationIssue.entityId.indexOf(':');
    if (separator < 1) {
      setPlanError('La identidad del ciclo periódico no es válida.');
      return;
    }
    preparePlan(() => buildRecurringDeduplicationPlan({
      report,
      transactions,
      recurringPaymentId: reconciliationIssue.entityId.slice(0, separator),
      recurringCycle: reconciliationIssue.entityId.slice(separator + 1),
      keepTransactionId: [...reconciliationIssue.transactionIds!].sort()[0],
    }));
  };

  const applyPlan = async () => {
    if (!selectedPlan) return;
    try {
      await executePlan(selectedPlan, confirmation);
      setSuccessMessage('Plan aplicado. La conciliación fresca ya está visible.');
      setSelectedPlan(null);
      setConfirmation('');
      setPlanError(null);
    } catch (executionError) {
      setPlanError(
        executionError instanceof Error
          ? executionError.message
          : 'No se pudo ejecutar el plan.',
      );
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Integridad del libro"
      titleIcon={<ShieldCheck size={22} className="text-primary" aria-hidden="true" />}
      maxWidth="max-w-5xl"
      className="h-[min(92dvh,960px)]"
      scrollAreaClassName="flex h-full min-h-0 flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
    >
      <div className="space-y-5">
        {status === 'guest' && (
          <div className="rounded-xl border border-warning/40 bg-warning-muted p-4 text-warning">
            <p className="font-semibold">Inicia sesión para conciliar el libro completo.</p>
            <p className="mt-1 text-sm">
              El modo invitado no puede ejecutar reparaciones autenticadas ni afirmar que la fuente remota está completa.
            </p>
          </div>
        )}

        {status === 'loading' && (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="status">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold text-foreground">Leyendo la autoridad completa del servidor</p>
              <p className="mt-1 text-sm text-muted-foreground">Las acciones permanecen deshabilitadas mientras se concilia.</p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-destructive/40 bg-destructive-muted p-4 text-destructive">
            <p className="font-semibold">No se pudo cargar la conciliación</p>
            <p className="mt-1 text-sm">{error?.message}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="control-target-44 mt-3 rounded-lg border border-destructive px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Reintentar
            </button>
          </div>
        )}

        {report && (
          <>
            <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="ledger-source-title">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h4 id="ledger-source-title" className="font-semibold text-foreground">Fuente y completitud</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Servidor · {report.complete ? 'autoridad completa' : 'autoridad incompleta'} · {report.sourceCounts.transactions} filas válidas · {report.sourceCounts.invalidTransactions} inválidas
                  </p>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                    Huella: {report.fingerprint}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={refreshing || executing}
                  className="control-target-44 inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Actualizar conciliación"
                >
                  <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                  {refreshing ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>
            </section>

            {report.issues.length === 0 ? (
              <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success-muted p-4 text-success">
                <CheckCircle2 className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                <div>
                  <p className="font-semibold">Libro conciliado</p>
                  <p className="mt-1 text-sm">No se encontraron inconsistencias en la fuente completa.</p>
                </div>
              </div>
            ) : (
              <section aria-labelledby="ledger-issues-title">
                <h4 id="ledger-issues-title" className="mb-3 font-semibold text-foreground">
                  Clasificaciones ({report.issues.length})
                </h4>
                <div className="space-y-2">
                  {report.issues.map(reconciliationIssue => (
                    <div
                      key={reconciliationIssue.id}
                      className={`rounded-xl border p-3 ${issueTone(reconciliationIssue.code)}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold">
                            {ISSUE_LABELS[reconciliationIssue.code]}
                          </p>
                          <p className="mt-1 break-words text-sm">
                            {visibleIssueMessage(reconciliationIssue, hideBalances)}
                          </p>
                          <p className="mt-1 break-all font-mono text-xs opacity-80">
                            {reconciliationIssue.entityId}
                          </p>
                        </div>
                        {canBuildPlans && reconciliationIssue.code === 'broken-link' && (
                          <button
                            type="button"
                            onClick={() => prepareLinkRepair(reconciliationIssue)}
                            className="control-target-44 shrink-0 rounded-lg border border-current px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            Preparar vínculo
                          </button>
                        )}
                        {canBuildPlans && reconciliationIssue.code === 'recurring-duplicate' && (
                          <button
                            type="button"
                            onClick={() => prepareRecurringRepair(reconciliationIssue)}
                            className="control-target-44 shrink-0 rounded-lg border border-current px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            Preparar desduplicación
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="ledger-accounts-title">
              <h4 id="ledger-accounts-title" className="mb-3 font-semibold text-foreground">
                Ecuación por cuenta
              </h4>
              <div
                data-testid="ledger-account-grid"
                className="grid grid-cols-1 gap-4 xl:grid-cols-2"
              >
                {report.accounts.map(accountReport => (
                  <article
                    key={accountReport.accountId}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h5 className="font-semibold text-foreground">{accountReport.accountName}</h5>
                        <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
                          {accountReport.accountType}
                        </p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        accountReport.status === 'ok'
                          ? 'bg-success-muted text-success'
                          : accountReport.status === 'negative-explained'
                            ? 'bg-warning-muted text-warning'
                            : 'bg-destructive-muted text-destructive'
                      }`}>
                        {accountReport.status === 'ok'
                          ? 'Conciliada'
                          : ISSUE_LABELS[accountReport.status as LedgerReconciliationIssueCode]}
                      </span>
                    </div>

                    <div
                      data-testid={`account-equation-${accountReport.accountId}`}
                      className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3"
                    >
                      <Metric label="Inicial" value={amount(accountReport.initialBalance)} />
                      <Metric label="Ingresos" value={amount(accountReport.paidIncome)} />
                      <Metric label="Gastos" value={amount(accountReport.paidExpense)} />
                      <Metric label="Transferencias +" value={amount(accountReport.incomingTransfers)} />
                      <Metric label="Transferencias −" value={amount(accountReport.outgoingTransfers)} />
                      <Metric label="Calculado" value={amount(accountReport.calculatedBalance)} emphasized />
                    </div>

                    {accountReport.creditAuthority && (
                      <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                        <p className="font-medium text-foreground">Autoridad de tarjeta</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <Metric
                            label="usedCredit"
                            value={accountReport.creditAuthority.persistedUsedCredit === null
                              ? 'No válido'
                              : amount(accountReport.creditAuthority.persistedUsedCredit)}
                          />
                          <Metric
                            label="Historial"
                            value={amount(accountReport.creditAuthority.historicalUsedCredit)}
                          />
                        </div>
                        {canBuildPlans && accountReport.status === 'credit-divergence' && (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => preparePlan(() => buildCreditHistoryAuthorityPlan({
                                report,
                                accountId: accountReport.accountId,
                              }))}
                              className="control-target-44 rounded-lg border border-primary px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              Usar historial
                            </button>
                            <button
                              type="button"
                              onClick={() => preparePlan(() => buildCreditPersistedAuthorityPlan({
                                report,
                                accountId: accountReport.accountId,
                                effectiveAt: new Date(),
                              }))}
                              className="control-target-44 rounded-lg border border-primary px-3 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              Conservar usedCredit
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {accountReport.crossingZeroTransactionIds.length > 0 && (
                      <div className="mt-4 rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
                        <p className="font-medium">Cruces por cero</p>
                        <ul className="mt-1 space-y-1">
                          {accountReport.movements
                            .filter(movement => movement.crossesZero)
                            .map(movement => (
                              <li key={movement.transactionId} className="flex justify-between gap-3">
                                <span className="truncate font-mono text-xs">{movement.transactionId}</span>
                                <span>{amount(movement.runningBalance)}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    <p className="mt-3 text-xs text-muted-foreground">
                      {accountReport.movements.length} movimientos pagados · {accountReport.pendingRows.length} pendientes excluidos de la ecuación
                    </p>
                    {canBuildPlans && accountReport.status === 'negative-explained' && (
                      <button
                        type="button"
                        onClick={() => preparePlan(() => buildAssetAdjustmentPlan({
                          report,
                          accountId: accountReport.accountId,
                          targetBalance: 0,
                          effectiveAt: new Date(),
                        }))}
                        className="control-target-44 mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <Wrench size={17} aria-hidden="true" />
                        Preparar ajuste a cero
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>

            {selectedPlan && (
              <section className="rounded-xl border border-primary/40 bg-card p-4" aria-labelledby="repair-plan-title">
                <h4 id="repair-plan-title" className="font-semibold text-foreground">
                  Vista previa: {visiblePlanTitle(selectedPlan, hideBalances)}
                </h4>
                <p className="mt-2 text-sm text-muted-foreground">{selectedPlan.riskSummary}</p>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <EvidenceBlock
                    title="Antes"
                    testId="repair-before"
                    value={selectedPlan.before}
                    hidden={hideBalances}
                  />
                  <EvidenceBlock
                    title="Después"
                    testId="repair-after"
                    value={selectedPlan.after}
                    hidden={hideBalances}
                  />
                </div>
                <div className="mt-4 rounded-lg border border-warning/30 bg-warning-muted p-3 text-sm text-warning">
                  <p>Escribe exactamente:</p>
                  <code data-testid="confirmation-phrase" className="mt-1 block break-all font-semibold">
                    {selectedPlan.confirmationPhrase}
                  </code>
                </div>
                <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="ledger-confirmation">
                  Confirmación exacta
                </label>
                <input
                  id="ledger-confirmation"
                  value={confirmation}
                  onChange={event => setConfirmation(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="control-target-44 mt-1 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlan(null);
                      setConfirmation('');
                    }}
                    className="control-target-44 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Cancelar plan
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyPlan()}
                    disabled={
                      !userId
                      || !report.complete
                      || executing
                      || confirmation !== selectedPlan.confirmationPhrase
                    }
                    className="control-target-44 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    {executing ? 'Aplicando…' : 'Aplicar plan confirmado'}
                  </button>
                </div>
              </section>
            )}

            {(planError || error) && status !== 'error' && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive-muted p-3 text-sm text-destructive" role="alert">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{planError ?? error?.message}</span>
              </div>
            )}
            {successMessage && (
              <div className="rounded-xl border border-success/40 bg-success-muted p-3 text-sm text-success" role="status">
                {successMessage}
              </div>
            )}
          </>
        )}
      </div>
    </BaseModal>
  );
}

function Metric({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className={`rounded-lg bg-muted px-2.5 py-2 ${emphasized ? 'ring-1 ring-primary/30' : ''}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 truncate ${emphasized ? 'font-bold text-foreground' : 'font-medium text-foreground'}`}>
        {value}
      </dd>
    </div>
  );
}

function EvidenceBlock({
  title,
  testId,
  value,
  hidden,
}: {
  title: string;
  testId: string;
  value: Record<string, unknown>;
  hidden: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-muted p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre
        data-testid={testId}
        className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground"
      >
        {JSON.stringify(maskedEvidence(value, hidden), null, 2)}
      </pre>
    </div>
  );
}
