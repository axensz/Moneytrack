'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Smartphone } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import type {
  PaymentInstrument,
  PendingTransactionImportCandidate,
} from '../../../../types/transactionImport';
import { confirmTransactionImport } from '../../../../hooks/firestore/transactionImportOrchestration';
import {
  formatCurrency,
  formatDateForInput,
  formatNumberForInput,
  parseCurrency,
  parseDateWithTime,
} from '../../../../utils/formatters';
import {
  calculateInterest,
  INSTALLMENT_OPTIONS,
} from '../../../../utils/interestCalculator';
import { matchPaymentInstrument } from '../../../../utils/paymentInstrumentMatching';
import { BaseModal } from '../../../modals/BaseModal';

interface TransactionImportReviewModalProps {
  isOpen: boolean;
  userId: string;
  candidate: PendingTransactionImportCandidate;
  accounts: readonly Account[];
  expenseCategories: readonly string[];
  instruments: readonly PaymentInstrument[];
  isOnline: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export function TransactionImportReviewModal({
  isOpen,
  userId,
  candidate,
  accounts,
  expenseCategories,
  instruments,
  isOnline,
  onClose,
  onConfirmed,
}: TransactionImportReviewModalProps) {
  const match = useMemo(
    () => matchPaymentInstrument(candidate.cardLast4, instruments),
    [candidate.cardLast4, instruments],
  );
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [installments, setInstallments] = useState(1);
  const [hasInterest, setHasInterest] = useState(false);
  const [rememberInstrument, setRememberInstrument] = useState(false);
  const [paymentInstrumentId, setPaymentInstrumentId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setAccountId(match.status === 'matched' ? match.accountId : '');
    setPaymentInstrumentId(
      match.status === 'matched' ? match.instrumentId : undefined,
    );
    setCategory('');
    setAmount(formatNumberForInput(candidate.amountMinor / 100));
    setMerchant(candidate.merchant);
    setDate(formatDateForInput(candidate.occurredAt));
    setInstallments(1);
    setHasInterest(false);
    setRememberInstrument(false);
    setError(null);
    setSubmitting(false);
    submittingRef.current = false;
  }, [candidate, isOpen, match]);

  const selectedAccount = accounts.find(account => account.id === accountId);
  const parsedAmount = parseCurrency(amount);
  const interestPreview = selectedAccount?.type === 'credit'
    && Number.isFinite(parsedAmount)
    && parsedAmount > 0
    ? calculateInterest(
      parsedAmount,
      selectedAccount.interestRate ?? 0,
      installments,
      hasInterest,
    )
    : null;
  const canRememberInstrument = Boolean(
    candidate.cardLast4 && match.status === 'none',
  );

  const handleAccountChange = (nextAccountId: string) => {
    setAccountId(nextAccountId);
    const keepsSuggestedInstrument = match.status === 'matched'
      && match.accountId === nextAccountId;
    setPaymentInstrumentId(
      keepsSuggestedInstrument ? match.instrumentId : undefined,
    );
    if (!keepsSuggestedInstrument && match.status !== 'none') {
      setRememberInstrument(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current || !isOnline) return;
    if (!accountId) {
      setError('Selecciona la cuenta que pagó la compra.');
      return;
    }
    if (!category) {
      setError('Selecciona una categoría de gasto.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Ingresa un monto válido mayor que cero.');
      return;
    }
    if (!merchant.trim()) {
      setError('Ingresa el comercio o una descripción.');
      return;
    }
    if (!date) {
      setError('Selecciona la fecha de la compra.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await confirmTransactionImport(userId, candidate.id, {
        expectedCandidate: candidate,
        accountId,
        category,
        amount: parsedAmount,
        merchant: merchant.trim(),
        occurredAt: parseDateWithTime(date, candidate.occurredAt),
        hasInterest: selectedAccount?.type === 'credit' && hasInterest,
        installments: selectedAccount?.type === 'credit' ? installments : 1,
        paymentInstrumentId,
        rememberInstrument: canRememberInstrument && rememberInstrument,
      });
      onConfirmed();
      onClose();
    } catch (confirmationError) {
      setError(
        confirmationError instanceof Error
          ? confirmationError.message
          : 'No se pudo confirmar la compra.',
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Revisar compra del celular"
      titleIcon={<Smartphone size={20} className="text-primary" aria-hidden="true" />}
      maxWidth="max-w-xl"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border-l-4 border-primary bg-primary/5 px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            Revisión humana obligatoria
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirma o corrige estos datos. La notificación por sí sola nunca
            modifica el libro mayor.
          </p>
        </div>

        <div>
          <label htmlFor="import-account" className="block text-sm font-semibold text-foreground mb-1.5">
            Cuenta
          </label>
          <select
            id="import-account"
            className="input-base w-full"
            value={accountId}
            onChange={event => handleAccountChange(event.target.value)}
          >
            <option value="">Selecciona una cuenta</option>
            {accounts.filter(account => account.id).map(account => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          {match.status === 'matched' && (
            <p className="mt-1.5 text-xs text-success">
              Cuenta sugerida automáticamente.
            </p>
          )}
          {match.status === 'ambiguous' && (
            <p className="mt-1.5 text-xs text-warning">
              Más de un medio activo coincide con esta terminación. Elige la cuenta.
            </p>
          )}
          {match.status === 'none' && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Elige la cuenta que realmente pagó la compra.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="import-category" className="block text-sm font-semibold text-foreground mb-1.5">
            Categoría
          </label>
          <select
            id="import-category"
            className="input-base w-full"
            value={category}
            onChange={event => setCategory(event.target.value)}
          >
            <option value="">Selecciona una categoría</option>
            {expenseCategories.map(expenseCategory => (
              <option key={expenseCategory} value={expenseCategory}>{expenseCategory}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="import-amount" className="block text-sm font-semibold text-foreground mb-1.5">
              Monto
            </label>
            <input
              id="import-amount"
              className="input-base w-full font-mono"
              value={amount}
              inputMode="decimal"
              onChange={event => setAmount(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="import-date" className="block text-sm font-semibold text-foreground mb-1.5">
              Fecha
            </label>
            <input
              id="import-date"
              type="date"
              className="input-base w-full"
              value={date}
              onChange={event => setDate(event.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="import-merchant" className="block text-sm font-semibold text-foreground mb-1.5">
            Comercio
          </label>
          <input
            id="import-merchant"
            className="input-base w-full"
            value={merchant}
            maxLength={500}
            onChange={event => setMerchant(event.target.value)}
          />
        </div>

        {selectedAccount?.type === 'credit' && (
          <div className="rounded-xl border border-border bg-muted/35 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="import-installments" className="block text-sm font-semibold text-foreground mb-1.5">
                  Cuotas
                </label>
                <select
                  id="import-installments"
                  className="input-base w-full"
                  value={installments}
                  onChange={event => {
                    const next = Number(event.target.value);
                    setInstallments(next);
                    if (next === 1) setHasInterest(false);
                  }}
                >
                  {INSTALLMENT_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-[44px] items-center gap-3 self-end text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={hasInterest}
                  disabled={installments === 1}
                  onChange={event => setHasInterest(event.target.checked)}
                />
                Esta compra genera interés
              </label>
            </div>
            {interestPreview && installments > 1 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Cuota estimada {formatCurrency(interestPreview.monthlyInstallmentAmount)}
                {interestPreview.totalInterestAmount > 0
                  ? ` · interés total ${formatCurrency(interestPreview.totalInterestAmount)}`
                  : ' · sin interés'}
              </p>
            )}
          </div>
        )}

        {canRememberInstrument && (
          <label className="flex min-h-[44px] items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={rememberInstrument}
              onChange={event => setRememberInstrument(event.target.checked)}
            />
            Recordar este medio de pago
          </label>
        )}

        {!isOnline && (
          <div className="flex gap-2 rounded-lg bg-warning-muted px-3 py-2 text-sm text-warning">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>Conéctate para confirmar. Tus cambios permanecen en este formulario.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive-muted px-3 py-2 text-sm font-medium text-destructive">
            {error}
          </p>
        )}

        <div className="btn-group-mobile-stack flex justify-end gap-3 pt-2">
          <button type="button" className="btn-cancel min-h-[44px]" onClick={onClose} disabled={submitting}>
            Volver
          </button>
          <button type="submit" className="btn-primary min-h-[44px]" disabled={submitting || !isOnline}>
            {submitting ? 'Confirmando…' : 'Confirmar gasto'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
