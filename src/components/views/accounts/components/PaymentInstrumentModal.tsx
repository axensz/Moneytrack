'use client';

import { useEffect, useRef, useState } from 'react';
import type { Account } from '../../../../types/finance';
import type {
  PaymentInstrument,
  PaymentInstrumentKind,
  PaymentInstrumentNetwork,
} from '../../../../types/transactionImport';
import type { NewPaymentInstrument } from '../../../../hooks/firestore/usePaymentInstruments';
import { BaseModal } from '../../../modals/BaseModal';

interface PaymentInstrumentModalProps {
  isOpen: boolean;
  instrument: PaymentInstrument | null;
  accounts: readonly Account[];
  onClose: () => void;
  onSave: (instrument: NewPaymentInstrument) => Promise<void>;
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

export function PaymentInstrumentModal({
  isOpen,
  instrument,
  accounts,
  onClose,
  onSave,
}: PaymentInstrumentModalProps) {
  const [label, setLabel] = useState('');
  const [accountId, setAccountId] = useState('');
  const [kind, setKind] = useState<PaymentInstrumentKind>('wallet-token');
  const [last4, setLast4] = useState('');
  const [network, setNetwork] = useState<PaymentInstrumentNetwork>('unknown');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(instrument?.label ?? '');
    setAccountId(instrument?.accountId ?? accounts[0]?.id ?? '');
    setKind(instrument?.kind ?? 'wallet-token');
    setLast4(instrument?.last4 ?? '');
    setNetwork(instrument?.network ?? 'unknown');
    setError(null);
    setSaving(false);
    savingRef.current = false;
  }, [accounts, instrument, isOpen]);

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
    if (!/^\d{4}$/.test(last4)) {
      setError('Ingresa exactamente 4 dígitos.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        label: normalizedLabel,
        accountId,
        kind,
        last4,
        network,
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'No se pudo guardar el medio de pago.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={instrument ? 'Editar medio de pago' : 'Añadir medio de pago'}
      maxWidth="max-w-lg"
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Guarda solo una etiqueta y la terminación. Moneytrack nunca solicita
          el número completo ni el código de seguridad.
        </p>

        <div>
          <label htmlFor="payment-instrument-label" className="block text-sm font-semibold text-foreground mb-1.5">
            Nombre
          </label>
          <input
            id="payment-instrument-label"
            className="input-base w-full"
            value={label}
            maxLength={80}
            autoFocus
            onChange={event => setLabel(event.target.value)}
            placeholder="Ej. Visa del celular"
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
          <button type="button" className="btn-cancel min-h-[44px]" onClick={onClose} disabled={saving}>
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
    </BaseModal>
  );
}
