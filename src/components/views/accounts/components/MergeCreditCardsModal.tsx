'use client';

import React from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';
import type { Account } from '../../../../types/finance';
import { BaseModal } from '../../../modals/BaseModal';
import { formatNumberForInput, unformatNumber } from '../../../../utils/formatters';

interface MergeCreditCardsModalProps {
  isOpen: boolean;
  sourceCard: Account | null;
  targetCardId: string;
  creditCards: Account[];
  combinedCreditLimit: number;
  combinedUsedDebt: number;
  combinedAvailableCredit: number;
  newCreditLimitInput: string;
  desiredDebtInput: string;
  isSubmitting: boolean;
  formatCurrency: (amount: number) => string;
  onTargetCardChange: (cardId: string) => void;
  onNewCreditLimitChange: (value: string) => void;
  onDesiredDebtChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export const MergeCreditCardsModal: React.FC<MergeCreditCardsModalProps> = ({
  isOpen,
  sourceCard,
  targetCardId,
  creditCards,
  combinedCreditLimit,
  combinedUsedDebt,
  combinedAvailableCredit,
  newCreditLimitInput,
  desiredDebtInput,
  isSubmitting,
  formatCurrency,
  onTargetCardChange,
  onNewCreditLimitChange,
  onDesiredDebtChange,
  onConfirm,
  onClose,
}) => {
  const targetCard = creditCards.find((card) => card.id === targetCardId) || null;
  const targetOptions = creditCards.filter((card) => card.id !== sourceCard?.id);
  const parsedNewCreditLimit = parseFloat(newCreditLimitInput.replace(',', '.')) || 0;
  const desiredDebt = desiredDebtInput.trim() === ''
    ? combinedUsedDebt
    : parseFloat(desiredDebtInput.replace(',', '.')) || 0;
  const warningDebt = Math.max(combinedUsedDebt, desiredDebt);
  const availableAfterMerge = parsedNewCreditLimit - desiredDebt;
  const creditLimitBelowDebt = parsedNewCreditLimit > 0 && parsedNewCreditLimit < warningDebt;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Unificar tarjetas de crédito"
      titleIcon={<CreditCard size={22} className="text-purple-600 dark:text-purple-400" />}
      maxWidth="max-w-2xl"
      closeOnBackdrop={!isSubmitting}
      showCloseButton={!isSubmitting}
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Las transacciones de la tarjeta origen se moverán a la tarjeta destino y luego se eliminará la tarjeta origen.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40">
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Tarjeta origen</span>
            <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">
              {sourceCard?.name || 'Sin seleccionar'}
            </p>
          </div>

          <div>
            <label className="label-base">Tarjeta destino</label>
            <select
              value={targetCardId}
              onChange={(event) => onTargetCardChange(event.target.value)}
              className="input-base"
              disabled={isSubmitting}
            >
              {targetOptions.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CalculatedValue label="Cupo total actual combinado" value={formatCurrency(combinedCreditLimit)} />
          <CalculatedValue label="Deuda usada combinada" value={formatCurrency(combinedUsedDebt)} />
          <CalculatedValue label="Cupo disponible combinado" value={formatCurrency(combinedAvailableCredit)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-base">Nuevo cupo de crédito</label>
            <input
              type="text"
              inputMode="decimal"
              value={formatNumberForInput(newCreditLimitInput)}
              onChange={(event) => onNewCreditLimitChange(unformatNumber(event.target.value))}
              placeholder="0"
              className="input-base"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Debe ser mayor que cero. Por defecto se sugiere el cupo combinado.
            </p>
          </div>

          <div>
            <label className="label-base">Deuda real deseada (opcional)</label>
            <input
              type="text"
              inputMode="decimal"
              value={formatNumberForInput(desiredDebtInput)}
              onChange={(event) => onDesiredDebtChange(unformatNumber(event.target.value))}
              placeholder={`Calculada: ${formatCurrency(combinedUsedDebt)}`}
              className="input-base"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Si difiere de la deuda calculada, se creará un ajuste automático en {targetCard?.name || 'la tarjeta destino'}.
            </p>
          </div>
        </div>

        {creditLimitBelowDebt && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">El nuevo cupo queda por debajo de la deuda usada.</p>
              <p>Disponible estimado tras unificar: {formatCurrency(availableAfterMerge)}.</p>
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary"
            disabled={isSubmitting || !sourceCard || !targetCardId}
          >
            {isSubmitting ? 'Unificando...' : 'Unificar tarjetas'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

interface CalculatedValueProps {
  label: string;
  value: string;
}

const CalculatedValue: React.FC<CalculatedValueProps> = ({ label, value }) => (
  <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 dark:border-purple-900/50 dark:bg-purple-900/20">
    <p className="text-xs text-purple-700 dark:text-purple-300">{label}</p>
    <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
  </div>
);
