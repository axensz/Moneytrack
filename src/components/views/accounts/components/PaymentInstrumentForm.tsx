'use client';

import { useEffect, useRef, useState } from 'react';
import type { Account } from '../../../../types/finance';
import type {
  PaymentInstrument,
  PaymentInstrumentKind,
  PaymentInstrumentNetwork,
} from '../../../../types/transactionImport';
import type { NewPaymentInstrument } from '../../../../hooks/firestore/usePaymentInstruments';

interface PaymentInstrumentFormProps {
  instrument: PaymentInstrument | null;
  accounts: readonly Account[];
  defaultAccountId: string;
  onCancel: () => void;
  onSave: (instrument: NewPaymentInstrument) => Promise<void>;
  onSavingChange: (saving: boolean) => void;
}

const NETWORKS: Array<{ value: PaymentInstrumentNetwork; label: string }> = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'other', label: 'Otra' },
  { value: 'unknown', label: 'No identificada' },
];

const KINDS: Array<{ value: PaymentInstrumentKind; label: string }> = [
  { value: 'wallet-token', label: 'Tarjeta en la wallet' },
  { value: 'physical-card', label: 'Tarjeta física' },
];

export function PaymentInstrumentForm({
  instrument,
  accounts,
  defaultAccountId,
  onCancel,
  onSave,
  onSavingChange,
}: PaymentInstrumentFormProps) {
  const [label, setLabel] = useState(() => instrument?.label ?? '');
  const [accountId, setAccountId] = useState(() => (
    instrument?.accountId ?? defaultAccountId
  ));
  const [kind, setKind] = useState<PaymentInstrumentKind>(() => (
    instrument?.kind ?? 'wallet-token'
  ));
  const [last4, setLast4] = useState(() => instrument?.last4 ?? '');
  const [network, setNetwork] = useState<PaymentInstrumentNetwork>(() => (
    instrument?.network ?? 'unknown'
  ));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;

    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setError('Ingresa un nombre para reconocer este medio.');
      return;
    }
    if (!accountId) {
      setError('Selecciona la cuenta o tarjeta vinculada.');
      return;
    }
    if ((kind === 'physical-card' || last4.length > 0) && !/^\d{4}$/.test(last4)) {
      setError('Ingresa exactamente 4 dígitos.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    onSavingChange(true);
    setError(null);
    try {
      await onSave({
        label: normalizedLabel,
        accountId,
        kind,
        last4: last4 || undefined,
        network,
      });
      if (!mountedRef.current) return;
      savingRef.current = false;
      setSaving(false);
      onSavingChange(false);
      onCancel();
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar el medio de pago.',
      );
      savingRef.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Usa el mismo apodo que ves en Wallet para reconocer el medio. Moneytrack
        nunca solicita el número completo ni el código de seguridad.
      </p>

      <div>
        <label htmlFor="payment-instrument-label" className="block text-sm font-semibold text-foreground mb-1.5">
          Nombre o apodo
        </label>
        <input
          id="payment-instrument-label"
          className="input-base w-full"
          value={label}
          maxLength={80}
          autoFocus
          onChange={event => setLabel(event.target.value)}
          placeholder="Ej. Oro o Nu"
        />
      </div>

      <div>
        <label htmlFor="payment-instrument-account" className="block text-sm font-semibold text-foreground mb-1.5">
          Cuenta vinculada
        </label>
        <select
          id="payment-instrument-account"
          className="input-base w-full"
          value={accountId}
          onChange={event => setAccountId(event.target.value)}
        >
          <option value="">Selecciona una cuenta</option>
          {accounts.filter(account => account.id).map(account => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="payment-instrument-kind" className="block text-sm font-semibold text-foreground mb-1.5">
            Tipo
          </label>
          <select
            id="payment-instrument-kind"
            className="input-base w-full"
            value={kind}
            onChange={event => setKind(event.target.value as PaymentInstrumentKind)}
          >
            {KINDS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="payment-instrument-last4" className="block text-sm font-semibold text-foreground mb-1.5">
            Últimos 4 dígitos
          </label>
          <input
            id="payment-instrument-last4"
            className="input-base w-full font-mono tracking-[0.2em]"
            value={last4}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            onChange={event => setLast4(
              event.target.value.replace(/\D/g, '').slice(0, 4),
            )}
            placeholder="0000"
          />
          {kind === 'wallet-token' && (
            <p className="mt-1 text-xs text-muted-foreground">
              Opcional si Wallet solo muestra el apodo.
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="payment-instrument-network" className="block text-sm font-semibold text-foreground mb-1.5">
          Red
        </label>
        <select
          id="payment-instrument-network"
          className="input-base w-full"
          value={network}
          onChange={event => setNetwork(event.target.value as PaymentInstrumentNetwork)}
        >
          {NETWORKS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive-muted px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="btn-group-mobile-stack flex justify-end gap-3 pt-2">
        <button type="button" className="btn-cancel min-h-[44px]" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary min-h-[44px]" disabled={saving}>
          {saving
            ? 'Guardando…'
            : instrument
              ? 'Guardar cambios'
              : 'Guardar medio'}
        </button>
      </div>
    </form>
  );
}
