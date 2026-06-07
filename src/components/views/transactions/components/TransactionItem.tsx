'use client';

import React, { memo } from 'react';
import CurrencyInput from 'react-currency-input-field';
import { ArrowRightLeft, Check, Clock, CreditCard, Edit2, X } from 'lucide-react';
import type { Transaction, Account, Categories } from '../../../../types/finance';
import { useUIPreferences } from '@/contexts/UIPreferencesContext';
import { ensureDate } from '../../../../utils/dateUtils';

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

  // Fecha + hora. La hora solo se muestra si la transacción la tiene (las
  // antiguas quedaron a medianoche y se muestran solo con la fecha).
  const txDate = ensureDate(transaction.date);
  const txHasTime = txDate.getHours() !== 0 || txDate.getMinutes() !== 0 || txDate.getSeconds() !== 0;
  const dateLabel =
    txDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) +
    (txHasTime ? ` · ${txDate.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : '');

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
              <CurrencyInput
                intlConfig={{ locale: 'es-CO', currency: 'COP' }}
                decimalsLimit={2}
                allowNegativeValue={false}
                value={editForm.amount}
                onValueChange={(value) =>
                  onEditFormChange({
                    ...editForm,
                    amount: value || '',
                  })
                }
                placeholder="0"
                disableAbbreviations
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
    <div className="border rounded-xl p-3.5 sm:p-4 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md shadow-sm group">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${transaction.type === 'income'
            ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
            : transaction.type === 'expense'
              ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
              : 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
            }`}
          aria-hidden="true"
        >
          {transaction.type === 'transfer' ? <ArrowRightLeft size={18} /> : <CreditCard size={18} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className="font-semibold text-gray-900 dark:text-gray-100 truncate text-base"
                title={transaction.description || transaction.category}
              >
                {transaction.description || transaction.category}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={accountRoute}>
                {accountRoute}
              </p>
            </div>
            <span className={`text-base sm:text-lg font-bold whitespace-nowrap shrink-0 ${amountClass} dark:${transaction.type === 'income' ? 'text-emerald-400' : transaction.type === 'expense' ? 'text-rose-400' : 'text-purple-400'}`}>
              {amountPrefix} {displayAmount(transaction.amount)}
            </span>
          </div>

          {/* Info row */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {transaction.category}
              </span>
              <span className="text-[11px] text-gray-400 dark:text-gray-500">
                {dateLabel}
              </span>
              {!transaction.paid && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  <Clock size={10} />
                  Pendiente
                </span>
              )}
              {account?.type === 'credit' && transaction.installments && transaction.installments > 1 && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md">
                  {transaction.installments} cuotas
                </span>
              )}
              {transaction.hasInterest && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-md">
                  Con interés
                </span>
              )}
              {recurringPaymentName && (
                <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md">
                  ↻ {recurringPaymentName}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={onEdit}
                className="flex items-center justify-center p-1.5 min-h-[32px] min-w-[32px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                title="Editar"
                aria-label="Editar transaccion"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={onDelete}
                className="flex items-center justify-center p-1.5 min-h-[32px] min-w-[32px] text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                title="Eliminar"
                aria-label="Eliminar transaccion"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';
