'use client';

import { useState } from 'react';
import {
  Pencil,
  Plus,
  Power,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type { Account } from '../../../../types/finance';
import type { PaymentInstrument } from '../../../../types/transactionImport';
import {
  usePaymentInstruments,
  type NewPaymentInstrument,
} from '../../../../hooks/firestore/usePaymentInstruments';
import { BaseModal } from '../../../modals/BaseModal';
import { ConfirmDialog } from '../../../modals/ConfirmDialog';
import { PaymentInstrumentForm } from './PaymentInstrumentForm';

interface PaymentInstrumentsSectionProps {
  userId: string | null;
  accounts: readonly Account[];
  accountId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

const networkLabel = (network: PaymentInstrument['network']): string => ({
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  other: 'Otra red',
  unknown: 'Red no identificada',
})[network];

export function PaymentInstrumentsSection({
  userId,
  accounts,
  accountId,
  isOpen,
  onClose,
}: PaymentInstrumentsSectionProps) {
  const {
    instruments,
    loading,
    error,
    createInstrument,
    updateInstrument,
    setInstrumentActive,
    deleteInstrument,
  } = usePaymentInstruments(userId);
  const [editingInstrument, setEditingInstrument] = useState<
    PaymentInstrument | null | 'new'
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentInstrument | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleInstruments = accountId
    ? instruments.filter(instrument => instrument.accountId === accountId)
    : [];
  const selectedAccount = accountId
    ? accounts.find(account => account.id === accountId)
    : undefined;
  const modalAccounts = selectedAccount
    ? [selectedAccount, ...accounts.filter(account => account.id !== accountId)]
    : accounts;

  if (!userId) return null;

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
    } catch (actionFailure) {
      const message = actionFailure instanceof Error
        ? actionFailure.message
        : 'No se pudo actualizar el medio de pago.';
      setActionError(message);
      throw actionFailure;
    }
  };

  const handleSave = async (draft: NewPaymentInstrument) => {
    if (editingInstrument && editingInstrument !== 'new') {
      await runAction(() => updateInstrument(editingInstrument.id, draft));
      return;
    }
    await runAction(() => createInstrument(draft));
  };

  const handleClose = () => {
    setEditingInstrument(null);
    setDeleteTarget(null);
    setActionError(null);
    onClose();
  };

  const modalTitle = editingInstrument
    ? editingInstrument === 'new'
      ? 'Añadir medio de pago'
      : 'Editar medio de pago'
    : `Medios de pago · ${selectedAccount?.name ?? 'Cuenta'}`;

  return (
    <>
      <BaseModal
        isOpen={isOpen && Boolean(accountId && selectedAccount)}
        onClose={handleClose}
        title={modalTitle}
        titleIcon={<Smartphone size={20} className="text-primary" aria-hidden="true" />}
        maxWidth="max-w-2xl"
      >
        {editingInstrument ? (
          <PaymentInstrumentForm
            instrument={editingInstrument === 'new' ? null : editingInstrument}
            accounts={modalAccounts}
            onCancel={() => setEditingInstrument(null)}
            onSave={handleSave}
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-xl text-sm text-muted-foreground">
                Tarjetas y tokens que sugerirán esta cuenta al revisar una compra.
              </p>
              <button
                type="button"
                className="btn-secondary min-h-[44px]"
                onClick={() => setEditingInstrument('new')}
              >
                <Plus size={18} aria-hidden="true" />
                Añadir medio
              </button>
            </div>

            {(error || actionError) && (
              <p role="alert" className="rounded-lg bg-destructive-muted px-3 py-2 text-sm font-medium text-destructive">
                {actionError ?? error?.message}
              </p>
            )}

            {loading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Cargando medios vinculados…
              </p>
            ) : visibleInstruments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5">
                <p className="font-semibold text-foreground">
                  Esta cuenta no tiene medios vinculados
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Puedes añadir uno ahora o recordarlo al confirmar una compra.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {visibleInstruments.map(instrument => (
                  <article key={instrument.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{instrument.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${instrument.active ? 'bg-success-muted text-success' : 'bg-muted text-muted-foreground'}`}>
                          {instrument.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-sm text-foreground">
                        •••• {instrument.last4}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {networkLabel(instrument.network)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="control-target-44 min-h-[44px] min-w-[44px] rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`${instrument.active ? 'Desactivar' : 'Activar'} ${instrument.label}`}
                        onClick={() => runAction(() => setInstrumentActive(
                          instrument.id,
                          !instrument.active,
                        )).catch(() => undefined)}
                      >
                        <Power size={18} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="control-target-44 min-h-[44px] min-w-[44px] rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Editar ${instrument.label}`}
                        onClick={() => setEditingInstrument(instrument)}
                      >
                        <Pencil size={18} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="control-target-44 min-h-[44px] min-w-[44px] rounded-lg border border-destructive/30 p-2 text-destructive hover:bg-destructive-muted"
                        aria-label={`Eliminar ${instrument.label}`}
                        onClick={() => setDeleteTarget(instrument)}
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </BaseModal>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Eliminar medio de pago"
        message={deleteTarget
          ? <>Se eliminará <strong>{deleteTarget.label}</strong>. La cuenta y sus transacciones no cambian.</>
          : null}
        confirmLabel="Eliminar medio"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await runAction(() => deleteInstrument(deleteTarget.id));
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
