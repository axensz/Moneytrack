'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, GitMerge, X } from 'lucide-react';
import type { Account, Transaction } from '../../../../types/finance';
import { BalanceCalculator } from '../../../../utils/balanceCalculator';

export interface MergeCreditCardsValues {
  sourceIds: string[];
  destinationMode: 'new' | 'existing';
  destinationId?: string;
  name: string;
  creditLimit: number;
  bankAccountId?: string;
  cutoffDay?: number;
  paymentDay?: number;
  interestRate?: number;
  isDefault: boolean;
  order?: number;
}

interface MergeCreditCardsModalProps {
  isOpen: boolean;
  creditAccounts: Account[];
  transactions: Transaction[];
  initialAccountId?: string | null;
  onClose: () => void;
  onConfirm: (values: MergeCreditCardsValues) => Promise<void> | void;
  formatCurrency: (amount: number) => string;
}

type CopyableField = 'bankAccountId' | 'cutoffDay' | 'paymentDay' | 'interestRate' | 'isDefault' | 'order';

type FieldSources = Record<CopyableField, string>;

const COPYABLE_FIELDS: Array<{
  key: CopyableField;
  label: string;
  formatValue: (account: Account) => string;
}> = [
  {
    key: 'bankAccountId',
    label: 'Cuenta bancaria asociada',
    formatValue: (account) => account.bankAccountId || 'Sin asociar',
  },
  {
    key: 'cutoffDay',
    label: 'Día de corte',
    formatValue: (account) => account.cutoffDay ? `Día ${account.cutoffDay}` : 'Sin definir',
  },
  {
    key: 'paymentDay',
    label: 'Día de pago',
    formatValue: (account) => account.paymentDay ? `Día ${account.paymentDay}` : 'Sin definir',
  },
  {
    key: 'interestRate',
    label: 'Tasa E.A.',
    formatValue: (account) => `${(account.interestRate || 0).toFixed(2).replace('.', ',')}%`,
  },
  {
    key: 'isDefault',
    label: 'Principal',
    formatValue: (account) => account.isDefault ? 'Sí' : 'No',
  },
  {
    key: 'order',
    label: 'Orden',
    formatValue: (account) => account.order !== undefined ? String(account.order) : 'Sin definir',
  },
];

const EMPTY_FIELD_SOURCES: FieldSources = {
  bankAccountId: '',
  cutoffDay: '',
  paymentDay: '',
  interestRate: '',
  isDefault: '',
  order: '',
};

export const MergeCreditCardsModal: React.FC<MergeCreditCardsModalProps> = ({
  isOpen,
  creditAccounts,
  transactions,
  initialAccountId,
  onClose,
  onConfirm,
  formatCurrency,
}) => {
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [destinationMode, setDestinationMode] = useState<'new' | 'existing'>('new');
  const [destinationId, setDestinationId] = useState<string>('');
  const [name, setName] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [fieldSources, setFieldSources] = useState<FieldSources>(EMPTY_FIELD_SOURCES);
  const [confirmedWarning, setConfirmedWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const availableDestinations = useMemo(
    () => creditAccounts.filter((account) => account.id && !sourceIds.includes(account.id)),
    [creditAccounts, sourceIds]
  );

  const selectedSources = useMemo(
    () => creditAccounts.filter((account) => account.id && sourceIds.includes(account.id)),
    [creditAccounts, sourceIds]
  );

  const selectedDestination = useMemo(
    () => creditAccounts.find((account) => account.id === destinationId),
    [creditAccounts, destinationId]
  );

  const fieldSourceAccounts = useMemo(() => {
    const accounts = [...selectedSources];
    if (destinationMode === 'existing' && selectedDestination) {
      accounts.unshift(selectedDestination);
    }
    return accounts;
  }, [destinationMode, selectedDestination, selectedSources]);

  const combinedUsed = useMemo(() => {
    const sourceUsed = selectedSources.reduce(
      (sum, account) => sum + BalanceCalculator.calculateCreditCardUsed(account, transactions),
      0
    );

    if (destinationMode === 'existing' && selectedDestination) {
      return sourceUsed + BalanceCalculator.calculateCreditCardUsed(selectedDestination, transactions);
    }

    return sourceUsed;
  }, [destinationMode, selectedDestination, selectedSources, transactions]);

  const anyDefaultSource = selectedSources.some((account) => account.isDefault);

  useEffect(() => {
    if (!isOpen) return;

    const initialSource = initialAccountId && creditAccounts.some((account) => account.id === initialAccountId)
      ? [initialAccountId]
      : [];
    const firstAccount = creditAccounts.find((account) => account.id === initialSource[0]) || creditAccounts[0];

    setSourceIds(initialSource);
    setDestinationMode('new');
    setDestinationId('');
    setName(firstAccount ? `Unificada ${firstAccount.name}` : 'Tarjeta unificada');
    setCreditLimit(firstAccount?.creditLimit ? String(firstAccount.creditLimit) : '');
    setConfirmedWarning(false);
    setIsSubmitting(false);
    setFieldSources({
      bankAccountId: firstAccount?.id || '',
      cutoffDay: firstAccount?.id || '',
      paymentDay: firstAccount?.id || '',
      interestRate: firstAccount?.id || '',
      isDefault: firstAccount?.id || '',
      order: firstAccount?.id || '',
    });
  }, [creditAccounts, initialAccountId, isOpen]);

  useEffect(() => {
    if (destinationMode !== 'existing') return;
    if (!destinationId || sourceIds.includes(destinationId)) {
      setDestinationId(availableDestinations[0]?.id || '');
    }
  }, [availableDestinations, destinationId, destinationMode, sourceIds]);

  useEffect(() => {
    if (destinationMode === 'existing' && selectedDestination) {
      setName(selectedDestination.name);
      setCreditLimit(String(selectedDestination.creditLimit || 0));
    }
  }, [destinationMode, selectedDestination]);

  if (!isOpen) return null;

  const getFieldAccount = (field: CopyableField): Account | undefined => {
    const accountId = fieldSources[field];
    return fieldSourceAccounts.find((account) => account.id === accountId) || fieldSourceAccounts[0];
  };

  const toggleSource = (accountId: string) => {
    setSourceIds((current) => {
      if (current.includes(accountId)) {
        return current.filter((id) => id !== accountId);
      }
      return [...current, accountId];
    });
  };

  const handleConfirm = async () => {
    if (sourceIds.length === 0) return;
    if (destinationMode === 'existing' && !destinationId) return;
    if (!name.trim()) return;

    const parsedCreditLimit = Number(creditLimit);
    if (!Number.isFinite(parsedCreditLimit) || parsedCreditLimit <= 0) return;

    const bankAccount = getFieldAccount('bankAccountId');
    const cutoff = getFieldAccount('cutoffDay');
    const payment = getFieldAccount('paymentDay');
    const interest = getFieldAccount('interestRate');
    const defaultAccount = getFieldAccount('isDefault');
    const orderAccount = getFieldAccount('order');

    setIsSubmitting(true);
    try {
      await onConfirm({
        sourceIds,
        destinationMode,
        destinationId: destinationMode === 'existing' ? destinationId : undefined,
        name: name.trim(),
        creditLimit: parsedCreditLimit,
        bankAccountId: bankAccount?.bankAccountId,
        cutoffDay: cutoff?.cutoffDay,
        paymentDay: payment?.paymentDay,
        interestRate: interest?.interestRate || 0,
        isDefault: anyDefaultSource || Boolean(defaultAccount?.isDefault),
        order: orderAccount?.order,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const canConfirm =
    sourceIds.length > 0 &&
    (destinationMode === 'new' || Boolean(destinationId)) &&
    name.trim().length > 0 &&
    Number(creditLimit) > 0 &&
    confirmedWarning &&
    !isSubmitting;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                <GitMerge size={22} />
                <h3 className="text-lg font-semibold">Unificar tarjetas de crédito</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Migra tarjetas origen hacia una tarjeta destino y conserva los campos relevantes.
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
              <X size={24} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">1. Tarjetas origen</h4>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {creditAccounts.map((account) => (
                  <label
                    key={account.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(account.id && sourceIds.includes(account.id))}
                        disabled={!account.id || (destinationMode === 'existing' && destinationId === account.id)}
                        onChange={() => account.id && toggleSource(account.id)}
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span>
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{account.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          Usado: {formatCurrency(BalanceCalculator.calculateCreditCardUsed(account, transactions))}
                        </span>
                      </span>
                    </span>
                    {account.isDefault && (
                      <span className="text-xs text-white bg-purple-600 rounded-full px-2 py-0.5">Principal</span>
                    )}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">2. Destino</h4>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setDestinationMode('new')}
                  className={`rounded-lg px-3 py-2 text-sm font-medium border ${destinationMode === 'new'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                >
                  Crear nueva
                </button>
                <button
                  type="button"
                  onClick={() => setDestinationMode('existing')}
                  className={`rounded-lg px-3 py-2 text-sm font-medium border ${destinationMode === 'existing'
                    ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                >
                  Usar existente
                </button>
              </div>

              {destinationMode === 'existing' && (
                <div className="mb-3">
                  <label className="label-base">Tarjeta destino existente</label>
                  <select
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                    className="input-base"
                  >
                    <option value="">Selecciona destino</option>
                    {availableDestinations.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label-base">Nuevo nombre</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="input-base" />
                </div>
                <div>
                  <label className="label-base">Nuevo cupo/monto de crédito</label>
                  <input
                    type="number"
                    min="0"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="input-base"
                  />
                </div>
              </div>
            </section>
          </div>

          <section className="mt-5">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">3. Campos a conservar</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {COPYABLE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="label-base">{field.label}</label>
                  <select
                    value={fieldSources[field.key]}
                    onChange={(e) => setFieldSources((current) => ({ ...current, [field.key]: e.target.value }))}
                    className="input-base"
                  >
                    {fieldSourceAccounts.map((account) => (
                      <option key={`${field.key}-${account.id}`} value={account.id}>
                        {account.name} · {field.formatValue(account)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {anyDefaultSource && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                Una tarjeta origen es principal; la tarjeta destino quedará marcada como principal.
              </p>
            )}
          </section>

          <section className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4">
              <h4 className="font-semibold text-purple-800 dark:text-purple-200 mb-2">Resumen de deuda usada combinada</h4>
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(combinedUsed)}</p>
              <p className="text-sm text-purple-700/80 dark:text-purple-300/80 mt-1">
                Calculado con BalanceCalculator.calculateCreditCardUsed para tarjetas origen
                {destinationMode === 'existing' ? ' y destino.' : '.'}
              </p>
            </div>

            <label className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedWarning}
                onChange={(e) => setConfirmedWarning(e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
              />
              <span>
                <span className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200">
                  <AlertTriangle size={18} /> Confirmo la migración
                </span>
                <span className="block text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Las referencias de transacciones, pagos periódicos y deudas se migrarán a la tarjeta destino. Las tarjetas origen se eliminarán al finalizar.
                </span>
              </span>
            </label>
          </section>

          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <button onClick={handleConfirm} disabled={!canConfirm} className="btn-submit disabled:opacity-50 disabled:cursor-not-allowed">
              {isSubmitting ? 'Unificando…' : 'Unificar'}
            </button>
            <button onClick={onClose} disabled={isSubmitting} className="btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
