'use client';

import React, { memo } from 'react';
import { ArrowRightLeft, Check, CircleCheck, Clock, CreditCard, Edit2, X } from 'lucide-react';
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
  const typeLabel =
    transaction.type === 'income'
      ? 'Ingreso'
      : transaction.type === 'expense'
        ? 'Gasto'
        : 'Transferencia';
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
    <div className="border rounded-lg p-3 sm:p-4 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${transaction.type === 'income'
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300'
                : transaction.type === 'expense'
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/25 dark:text-rose-300'
                  : 'bg-blue-50 text-blue-600 dark:bg-blue-900/25 dark:text-blue-300'
                }`}
              aria-hidden="true"
            >
              {transaction.type === 'transfer' ? <ArrowRightLeft size={17} /> : <CreditCard size={17} />}
            </div>
            <div className="min-w-0">
              <div
                className="font-medium text-gray-900 dark:text-gray-100 truncate"
                title={transaction.description || transaction.category}
              >
                {transaction.description || <span className="text-gray-400 italic">{transaction.category}</span>}
              </div>
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate" title={accountRoute}>
                {accountRoute}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex flex-wrap gap-1.5 items-center">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium">
              {typeLabel}
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {transaction.category}
            </span>
            <span>{new Date(transaction.date).toLocaleDateString('es-CO')}</span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-medium ${transaction.paid
                ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300'
                }`}
            >
              {transaction.paid ? <CircleCheck size={12} /> : <Clock size={12} />}
              {transaction.paid ? 'Pagada' : 'Pendiente'}
            </span>
            {account?.type === 'credit' && transaction.installments && transaction.installments > 1 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300 rounded font-medium">
                {transaction.installments} cuotas
              </span>
            )}
            {transaction.hasInterest && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300 rounded font-medium">
                Con interes
              </span>
            )}
            {recurringPaymentName && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/25 text-purple-700 dark:text-purple-300 rounded font-medium">
                Recurrente: {recurringPaymentName}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div className={`text-base sm:text-lg font-semibold whitespace-nowrap ${amountClass}`}>
            {amountPrefix} {displayAmount(transaction.amount)}
          </div>

          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="flex items-center justify-center p-2 min-h-[44px] min-w-[44px] text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
              title="Editar transaccion"
              aria-label="Editar transaccion"
            >
              <Edit2 size={18} />
            </button>
            <button
              onClick={onDelete}
              className="flex items-center justify-center p-2 min-h-[44px] min-w-[44px] text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
              title="Eliminar transaccion"
              aria-label="Eliminar transaccion"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

TransactionItem.displayName = 'TransactionItem';
