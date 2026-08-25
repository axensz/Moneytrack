'use client';

import { useState } from 'react';
import {
  CreditCard,
  Pencil,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import type { Account } from '../../../../types/finance';
import type { PaymentInstrument } from '../../../../types/transactionImport';
import {
  usePaymentInstruments,
  type NewPaymentInstrument,
} from '../../../../hooks/firestore/usePaymentInstruments';
import { ConfirmDialog } from '../../../modals/ConfirmDialog';
import { PaymentInstrumentModal } from './PaymentInstrumentModal';

interface PaymentInstrumentsSectionProps {
  userId: string | null;
  accounts: readonly Account[];
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
  const accountNames = new Map(
    accounts.flatMap(account => account.id ? [[account.id, account.name]] : []),
  );

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

  return (
    <section
      aria-labelledby="payment-instruments-heading"
      className="mt-8 border-l-4 border-primary/60 pl-4 sm:pl-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="payment-instruments-heading" className="flex items-center gap-2 text-lg font-bold text-foreground">
            <CreditCard size={20} className="text-primary" aria-hidden="true" />
            Medios de pago del celular
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Relaciona cada tarjeta o token de la wallet con la cuenta que debe
            sugerirse al revisar una compra.
          </p>
        </div>
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
        <p role="alert" className="mt-4 rounded-lg bg-destructive-muted px-3 py-2 text-sm font-medium text-destructive">
          {actionError ?? error?.message}
        </p>
      )}

      {loading ? (
        <p role="status" className="mt-5 text-sm text-muted-foreground">
          Cargando medios vinculados…
        </p>
      ) : instruments.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5">
          <p className="font-semibold text-foreground">Aún no has vinculado medios de pago</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Puedes crearlos ahora o recordarlos al confirmar una compra del celular.
          </p>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-border rounded-xl border border-border bg-card">
          {instruments.map(instrument => {
            const accountName = accountNames.get(instrument.accountId)
              ?? 'Cuenta no disponible';
            return (
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
                    <span>{networkLabel(instrument.network)}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{accountName}</span>
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
            );
          })}
        </div>
      )}

      <PaymentInstrumentModal
        isOpen={editingInstrument !== null}
        instrument={editingInstrument === 'new' ? null : editingInstrument}
        accounts={accounts}
        onClose={() => setEditingInstrument(null)}
        onSave={handleSave}
      />

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
    </section>
  );
}
