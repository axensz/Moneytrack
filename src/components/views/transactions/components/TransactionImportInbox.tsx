'use client';

import { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { Account, Categories } from '../../../../types/finance';
import type { PendingTransactionImportCandidate } from '../../../../types/transactionImport';
import { usePaymentInstruments } from '../../../../hooks/firestore/usePaymentInstruments';
import { useTransactionImportCandidates } from '../../../../hooks/firestore/useTransactionImportCandidates';
import { formatCurrency, formatDate } from '../../../../utils/formatters';
import { TransactionImportReviewModal } from './TransactionImportReviewModal';

interface TransactionImportInboxProps {
  userId: string | null;
  accounts: readonly Account[];
  categories: Categories;
  isOnline: boolean;
}

const confidenceLabel = (
  confidence: PendingTransactionImportCandidate['confidence'],
) => confidence === 'high' ? 'Confianza alta' : 'Confianza media';

export function TransactionImportInbox({
  userId,
  accounts,
  categories,
  isOnline,
}: TransactionImportInboxProps) {
  const {
    candidates,
    loading,
    error,
    reachedLimit,
    dismissCandidate,
  } = useTransactionImportCandidates(userId);
  const { instruments } = usePaymentInstruments(userId);
  const [expanded, setExpanded] = useState(false);
  const [reviewCandidate, setReviewCandidate] = useState<
    PendingTransactionImportCandidate | null
  >(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  if (!userId) return null;

  const pendingLabel = `${candidates.length} ${candidates.length === 1 ? 'pendiente' : 'pendientes'}`;
  const handleDismiss = async (candidate: PendingTransactionImportCandidate) => {
    if (dismissingId) return;
    setDismissingId(candidate.id);
    setActionError(null);
    try {
      await dismissCandidate(candidate.id);
      toggleRef.current?.focus();
    } catch (dismissError) {
      setActionError(
        dismissError instanceof Error
          ? dismissError.message
          : 'No se pudo descartar la compra.',
      );
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <section
      aria-labelledby="transaction-import-inbox-heading"
      className="mb-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm"
    >
      <button
        ref={toggleRef}
        type="button"
        className="flex min-h-[52px] w-full items-center gap-3 border-l-4 border-primary px-4 py-3 text-left hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        aria-expanded={expanded}
        aria-controls="transaction-import-inbox-content"
        aria-label={`Compras del celular, ${pendingLabel}`}
        onClick={() => setExpanded(current => !current)}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone size={19} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span id="transaction-import-inbox-heading" className="block font-bold text-foreground">
            Compras del celular
          </span>
          <span className="block text-xs text-muted-foreground">
            Pendientes de revisión antes de entrar al libro
          </span>
        </span>
        <span className="rounded-full bg-warning-muted px-2.5 py-1 text-xs font-bold text-warning">
          {pendingLabel}
        </span>
        {expanded
          ? <ChevronUp size={18} className="text-muted-foreground" aria-hidden="true" />
          : <ChevronDown size={18} className="text-muted-foreground" aria-hidden="true" />}
      </button>

      {expanded && (
        <div id="transaction-import-inbox-content" className="border-t border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Cada captura necesita tu confirmación y todavía no afecta saldos ni estadísticas.
          </p>

          {(error || actionError) && (
            <p role="alert" className="mt-3 rounded-lg bg-destructive-muted px-3 py-2 text-sm font-medium text-destructive">
              {actionError ?? error?.message}
            </p>
          )}

          {reachedLimit && (
            <p className="mt-3 rounded-lg bg-warning-muted px-3 py-2 text-sm text-warning">
              Mostrando las 100 compras más recientes. Revisa o descarta algunas para ver las anteriores.
            </p>
          )}

          {loading ? (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              Cargando compras pendientes…
            </p>
          ) : candidates.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/35 px-4 py-5 text-center">
              <p className="font-semibold text-foreground">No hay compras por revisar</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Las próximas capturas válidas del celular aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-border rounded-xl border border-border">
              {candidates.map(candidate => (
                <article key={candidate.id} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 md:justify-start">
                      <p className="truncate font-semibold text-foreground">{candidate.merchant}</p>
                      <p className="font-mono text-base font-bold text-foreground">
                        {formatCurrency(candidate.amountMinor / 100)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(candidate.occurredAt)}
                      {candidate.cardLast4 ? ` · •••• ${candidate.cardLast4}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-success-muted px-2 py-0.5 font-semibold text-success">
                        {confidenceLabel(candidate.confidence)}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground">
                        {candidate.sourcePackage}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <button
                      type="button"
                      className="btn-secondary min-h-[44px]"
                      onClick={() => setReviewCandidate(candidate)}
                    >
                      <Eye size={17} aria-hidden="true" />
                      Revisar
                    </button>
                    <button
                      type="button"
                      className="min-h-[44px] rounded-lg border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive-muted disabled:opacity-50"
                      aria-label={`Descartar compra en ${candidate.merchant}`}
                      disabled={dismissingId === candidate.id}
                      onClick={() => handleDismiss(candidate)}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                      <span className="sr-only">Descartar</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {reviewCandidate && (
        <TransactionImportReviewModal
          isOpen
          userId={userId}
          candidate={reviewCandidate}
          accounts={accounts}
          expenseCategories={categories.expense}
          instruments={instruments}
          isOnline={isOnline}
          onClose={() => setReviewCandidate(null)}
          onConfirmed={() => toggleRef.current?.focus()}
        />
      )}
    </section>
  );
}
