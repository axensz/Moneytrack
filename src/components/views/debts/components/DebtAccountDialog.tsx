'use client';

import React, { useEffect, useRef, useState } from 'react';
import { WalletCards } from 'lucide-react';
import { BaseModal } from '../../../modals/BaseModal';
import type { Account, Debt } from '../../../../types/finance';

interface DebtAccountDialogProps {
  isOpen: boolean;
  debt: Debt | null;
  accounts: Account[];
  onClose: () => void;
  onSubmit: (nextAccountId?: string) => Promise<void>;
}

export function DebtAccountDialog({
  isOpen,
  debt,
  accounts,
  onClose,
  onSubmit,
}: DebtAccountDialogProps) {
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (isOpen && debt) setSelectedAccountId(debt.accountId ?? '');
  }, [isOpen, debt]);

  if (!debt) return null;

  const currentAccount = accounts.find(account => account.id === debt.accountId);
  const handleClose = () => {
    if (!submittingRef.current) onClose();
  };
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(selectedAccountId || undefined);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Cuenta de ${debt.personName}`}
      titleIcon={<WalletCards size={20} className="text-primary" aria-hidden="true" />}
      closeOnBackdrop={!isSubmitting}
      closeOnEscape={!isSubmitting}
    >
      <form onSubmit={handleSubmit} aria-busy={isSubmitting} className="space-y-5">
        <div className="rounded-lg border border-border bg-muted p-3 text-sm">
          <p className="font-medium text-foreground">
            Cuenta actual: {currentAccount?.name ?? 'Sin cuenta'}
          </p>
          <p className="mt-1 text-muted-foreground">
            Solo moveremos la operación original. Los pagos ya registrados conservarán la cuenta donde ocurrieron.
          </p>
        </div>

        <div>
          <label htmlFor="debt-account-select" className="label-base">
            Cuenta asociada
          </label>
          <select
            id="debt-account-select"
            className="input-base"
            value={selectedAccountId}
            onChange={event => setSelectedAccountId(event.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Sin cuenta</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name}{account.type === 'credit' ? ' · Tarjeta de crédito' : ''}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">
            Esta cuenta se usará para el saldo pendiente y los pagos futuros.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="btn-cancel min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting || selectedAccountId === (debt.accountId ?? '')}
            className="btn-primary min-h-11 flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Guardando…' : 'Guardar cuenta'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
