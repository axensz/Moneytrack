'use client';

import React, { memo } from 'react';
import { Edit2, X, Check } from 'lucide-react';
import type { Transaction, Account } from '../../../../types/finance';
import { formatNumberForInput, unformatNumber } from '../../../../utils/formatters';

interface TransactionItemProps {
  transaction: Transaction;
  account?: Account;
  isEditing: boolean;
  editForm: {
    description: string;
    amount: string;
    date: string;
  };
  recurringPaymentName?: string | null;
  formatCurrency: (amount: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditFormChange: (form: { description: string; amount: string; date: string }) => void;
}

/**
 * Card individual de transacción con modo edición inline
 * Memoizado para evitar re-renders innecesarios en listas largas
 */
export const TransactionItem: React.FC<TransactionItemProps> = memo(({
  transaction,
  account,
  isEditing,
  editForm,
  recurringPaymentName,
  formatCurrency,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onEditFormChange,
}) => {
  if (isEditing) {
    return (
      <div className="border rounded-lg p-3 sm:p-4 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
              Descripción
            </label>
            <input
              type="text"
              value={editForm.description}
              onChange={(e) =>
                onEditFormChange({ ...editForm, description: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
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
            <button
              onClick={onSave}
              className="btn-submit"
            >
              <Check size={16} />
              Guardar
            </button>
            <button
              onClick={onCancel}
              className="btn-cancel"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Modo vista normal
  return (
    <div className="border rounded-lg p-3 sm:p-4 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-lg shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <div 
            className="font-medium text-gray-900 dark:text-gray-100 truncate"
            title={transaction.description}
          >
            {transaction.description}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-1 items-center">
            <span className="truncate max-w-[120px]">{transaction.category}</span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline truncate max-w-[150px]" title={account?.name}>
              {account?.name}
            </span>
            {/* Mostrar cuotas si es TC y tiene más de 1 cuota */}
            {account?.type === 'credit' && transaction.installments && transaction.installments > 1 && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                  {transaction.installments} cuotas
                </span>
              </>
            )}
            <span className="hidden sm:inline">•</span>
            <span>{new Date(transaction.date).toLocaleDateString('es-CO')}</span>
            {/* Indicador de pago periódico */}
            {recurringPaymentName && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                  🔄 {recurringPaymentName}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3">
          <div
            className={`text-base sm:text-lg font-semibold whitespace-nowrap ${
              transaction.type === 'income'
                ? 'text-emerald-600'
                : transaction.type === 'expense'
                ? 'text-rose-600'
                : 'text-blue-600'
            }`}
          >
            {transaction.type === 'income'
              ? '+'
              : transaction.type === 'expense'
              ? '-'
              : '→'}{' '}
            {formatCurrency(transaction.amount)}
          </div>

          <div className="flex gap-1">
            <button
              onClick={onEdit}
              className="flex items-center justify-center p-2 min-h-[36px] min-w-[36px] text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
              title="Editar transacción"
            >
              <Edit2 size={16} />
            </button>
            <button
              onClick={onDelete}
              className="flex items-center justify-center p-2 min-h-[36px] min-w-[36px] text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
              title="Eliminar transacción"
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
