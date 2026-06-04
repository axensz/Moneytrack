'use client';

import React, { memo } from 'react';
import { ArrowRightLeft, Check, Clock, CreditCard, Edit2, X } from 'lucide-react';
import type { Transaction, Account, Categories } from '../../../../types/finance';
import { formatNumberForInput, unformatNumber } from '../../../../utils/formatters';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';

interface TransactionItemProps {
  transaction: Transaction;
  account?: Account;
  destinationAccount?: Account;
  isEditing: boolean;
  editForm: {
    description: string;
    amount: string;
    date: string;
    category: string;
  };
  categories: Categories;
  recurringPaymentName?: string | null;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditFormChange: (form: { description: string; amount: string; date: string; category: string }) => void;
}

export const TransactionItem: React.FC<TransactionItemProps> = memo(({
  transaction,
  account,
  destinationAccount,
  isEditing,
  editForm,
  categories,
  recurringPaymentName,
  formatCurrency,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onEditFormChange,
}) => {
  const { hideBalances } = useUIPreferences();

  const displayAmount = (amount: number) => hideBalances ? '******' : formatCurrency(amount);
  const amountPrefix =
    transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '->';
  const amountClass =
    transaction.type === 'income'
      ? 'text-emerald-600'
      : transaction.type === 'expense'
        ? 'text-rose-600'
        : 'text-blue-600';
  const accountRoute =
    transaction.type === 'transfer'
      ? `${account?.name || 'Cuenta origen'} -> ${destinationAccount?.name || 'Cuenta destino'}`
      : account?.name || 'Cuenta no encontrada';
  const categoryOptions = transaction.type === 'income' ? categories.income : categories.expense;
  const visibleCategories = categoryOptions.includes(transaction.category)
    ? categoryOptions
    : [transaction.category, ...categoryOptions];

  if (isEditing) {
    return (
      <div className="border rounded-lg p-3 sm:p-4 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Descripcion
              </label>
              <input
                type="text"
                value={editForm.description}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, description: e.target.value })
                }
                placeholder="(opcional)"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Categoria
              </label>
              <select
                value={editForm.category}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, category: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                {visibleCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Monto
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={formatNumberForInput(editForm.amount)}
                onChange={(e) =>
                  onEditFormChange({
                    ...editForm,
                    amount: unformatNumber(e.target.value),
                  })
                }
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Fecha
              </label>
              <input
                type="date"
                value={editForm.date}
                onChange={(e) =>
                  onEditFormChange({ ...editForm, date: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onSave} className="btn-submit">
              <Check size={16} />
              Guardar
            </button>
            <button onClick={onCancel} className="btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-3 sm:p-4 transition-all bg-white dark:bg-gray-800/80 border-gray-100 dark:border-gray-700/60 hover:border-purple-200 dark:hover:border-purple-700 hover:shadow-md shadow-sm group">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Icon */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${transaction.type === 'income'
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
            : transaction.type === 'expense'
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
              : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            }`}
          aria-hidden="true"
        >
          {transaction.type === 'transfer' ? <ArrowRightLeft size={18} /> : <CreditCard size={18} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className="font-medium text-gray-900 dark:text-gray-100 truncate text-sm sm:text-base"
              title={transaction.description || transaction.category}
            >
              {transaction.description || <span className="text-gray-400 dark:text-gray-500 italic">{transaction.category}</span>}
            </p>
            <span className={`text-sm sm:text-base font-bold whitespace-nowrap ${amountClass}`}>
              {amountPrefix} {displayAmount(transaction.amount)}
            </span>
          </div>

          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 truncate">
              <span className="truncate" title={accountRoute}>{accountRoute}</span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span>{new Date(transaction.date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}</span>
              {!transaction.paid && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-medium">
                    <Clock size={11} />
                    Pendiente
                  </span>
                </>
              )}
            </div>

            {/* Action buttons - visible on hover / always on mobile */}
            <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={onEdit}
                className="flex items-center justify-center p-1.5 min-h-[32px] min-w-[32px] text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                title="Editar"
                aria-label="Editar transaccion"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={onDelete}
                className="flex items-center justify-center p-1.5 min-h-[32px] min-w-[32px] text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                title="Eliminar"
                aria-label="Eliminar transaccion"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Metadata badges - only show when relevant */}
          {(recurringPaymentName || (account?.type === 'credit' && transaction.installments && transaction.installments > 1) || transaction.hasInterest) && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {account?.type === 'credit' && transaction.installments && transaction.installments > 1 && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 rounded-md">
                  {transaction.installments} cuotas
                </span>
              )}
              {transaction.hasInterest && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 rounded-md">
                  Con interes
                </span>
              )}
              {recurringPaymentName && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 dark:bg-purple-900/25 text-purple-700 dark:text-purple-300 rounded-md">
                  ↻ {recurringPaymentName}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';
