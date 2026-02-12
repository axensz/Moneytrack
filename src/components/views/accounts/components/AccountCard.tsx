'use client';

import React, { memo } from 'react';
import { Edit2, Trash2, GripVertical, Wallet, CreditCard, Banknote } from 'lucide-react';
import type { Account, Transaction } from '../../../../types/finance';

const ACCOUNT_TYPES = [
  { value: 'savings' as const, label: 'Cuenta de Ahorros', icon: Wallet },
  { value: 'credit' as const, label: 'Crédito', icon: CreditCard },
  { value: 'cash' as const, label: 'Efectivo', icon: Banknote },
];

interface AccountCardProps {
  account: Account;
  balance: number;
  creditUsed: number;
  nextCutoff: Date | null;
  nextPayment: Date | null;
  parentAccountName?: string;
  isAssociated?: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  touchTransform?: string;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: () => void;
}

/**
 * Card individual de cuenta (soporta savings, credit, cash)
 * Incluye drag & drop para reordenar
 */
export const AccountCard: React.FC<AccountCardProps> = memo(({
  account,
  balance,
  creditUsed,
  nextCutoff,
  nextPayment,
  parentAccountName,
  isAssociated = false,
  isDragging,
  isDragOver,
  touchTransform,
  formatCurrency,
  onEdit,
  onSetDefault,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) => {
  const isCredit = account.type === 'credit';
  const accountTypeInfo = ACCOUNT_TYPES.find((t) => t.value === account.type);

  const getCardClasses = () => {
    const base = 'rounded-xl p-5 transition-all touch-none select-none relative overflow-hidden';

    if (isDragging) {
      return `${base} opacity-50 scale-95 shadow-2xl`;
    }

    if (isDragOver) {
      return `${base} border-2 border-purple-500 shadow-lg scale-102 bg-purple-50 dark:bg-purple-900/30`;
    }

    if (isAssociated) {
      return `${base} border border-purple-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md ${
        account.isDefault ? 'ring-2 ring-purple-400' : ''
      }`;
    }

    if (account.isDefault) {
      return `${base} border-2 ${
        isCredit
          ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20'
          : 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20'
      } shadow-md`;
    }

    return `${base} border ${
      isCredit
        ? 'border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
        : 'border-emerald-100 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-600'
    } bg-white dark:bg-gray-800 hover:shadow-md`;
  };

  return (
    <div
      data-account-id={account.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={getCardClasses()}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: touchTransform,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      {/* Accent Bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1.5 ${
          isCredit ? 'bg-purple-500' : 'bg-emerald-500'
        }`}
      />

      <div className="pl-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <GripVertical
                size={isAssociated ? 16 : 20}
                className="text-gray-400 cursor-grab active:cursor-grabbing flex-shrink-0"
              />
              <div
                className={`p-1.5 rounded-lg flex-shrink-0 ${
                  isCredit
                    ? 'bg-purple-100 dark:bg-purple-900/40'
                    : 'bg-emerald-100 dark:bg-emerald-900/40'
                }`}
              >
                {accountTypeInfo &&
                  React.createElement(accountTypeInfo.icon, {
                    size: isAssociated ? 16 : 18,
                    className: isCredit
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-emerald-600 dark:text-emerald-400',
                  })}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={`font-semibold text-gray-900 dark:text-gray-100 ${
                    isAssociated ? 'text-sm sm:text-base' : ''
                  }`}
                >
                  {account.name}
                </h4>
                {account.isDefault && (
                  <span
                    className={`text-xs text-white px-2 py-0.5 rounded-full font-medium ${
                      isCredit ? 'bg-purple-600' : 'bg-emerald-600'
                    }`}
                  >
                    Principal
                  </span>
                )}
              </div>
            </div>

            {/* Type badge */}
            <span
              className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${
                isCredit
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              }`}
            >
              {accountTypeInfo?.label}
            </span>
            {parentAccountName && (
              <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">
                • {parentAccountName}
              </span>
            )}
          </div>

          {/* Balance */}
          <div className="text-left sm:text-right">
            <div
              className={`text-xl sm:text-2xl font-bold ${
                isCredit
                  ? balance >= 0
                    ? 'text-purple-600 dark:text-purple-400'
                    : 'text-rose-600'
                  : balance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600'
              }`}
            >
              {isCredit && (
                <div className="text-xs font-normal text-gray-500 dark:text-gray-400 mb-1">
                  Disponible
                </div>
              )}
              {formatCurrency(balance)}
            </div>
          </div>
        </div>

        {/* Credit card specific info */}
        {isCredit && (
          <CreditCardInfo
            creditUsed={creditUsed}
            creditLimit={account.creditLimit!}
            nextCutoff={nextCutoff}
            nextPayment={nextPayment}
            interestRate={account.interestRate}
            formatCurrency={formatCurrency}
            isAssociated={isAssociated}
          />
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={onEdit} className="btn-edit">
            <Edit2 size={14} />
            Editar
          </button>

          {!account.isDefault && (
            <>
              <button
                onClick={onSetDefault}
                className={`flex items-center justify-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[36px] text-white ${
                  isCredit
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                Principal
              </button>
              <button
                onClick={onDelete}
                className="flex items-center justify-center p-2 min-h-[36px] min-w-[36px] text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

AccountCard.displayName = 'AccountCard';

// Sub-componente para info de tarjeta de crédito
interface CreditCardInfoProps {
  creditUsed: number;
  creditLimit: number;
  nextCutoff: Date | null;
  nextPayment: Date | null;
  interestRate?: number;
  formatCurrency: (amount: number) => string;
  isAssociated: boolean;
}

const CreditCardInfo: React.FC<CreditCardInfoProps> = memo(({
  creditUsed,
  creditLimit,
  nextCutoff,
  nextPayment,
  interestRate,
  formatCurrency,
  isAssociated,
}) => {
  const usagePercentage = Math.min((creditUsed / creditLimit) * 100, 100);
  const isHighUsage = creditUsed > creditLimit * 0.8;

  return (
    <div className="mt-4">
      <div className={`flex justify-between ${isAssociated ? 'text-xs sm:text-sm' : 'text-sm'} mb-1.5`}>
        <span className="text-gray-600 dark:text-gray-400">Cupo utilizado</span>
        <span className="font-medium text-gray-900 dark:text-gray-100">
          {formatCurrency(creditUsed)} / {formatCurrency(creditLimit)}
        </span>
      </div>

      <div className="w-full h-2.5 bg-purple-100 dark:bg-purple-900/30 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            isHighUsage
              ? 'bg-gradient-to-r from-orange-500 to-rose-500'
              : 'bg-gradient-to-r from-purple-500 to-violet-500'
          }`}
          style={{ width: `${usagePercentage}%` }}
        />
      </div>

      <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-3 ${isAssociated ? 'text-xs sm:text-sm' : 'text-sm'}`}>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Corte: </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {nextCutoff?.toLocaleDateString('es-CO')}
          </span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Pago: </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {nextPayment?.toLocaleDateString('es-CO')}
          </span>
        </div>
        {interestRate && interestRate > 0 && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">Tasa E.A.: </span>
            <span className="font-medium text-purple-600 dark:text-purple-400">
              {interestRate.toFixed(2).replace('.', ',')}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

CreditCardInfo.displayName = 'CreditCardInfo';
