'use client';

import React, { memo } from 'react';
import CurrencyInput from 'react-currency-input-field';
import { ArrowRightLeft, Check, ChevronDown, Clock, CreditCard, Edit2, Repeat, X } from 'lucide-react';
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
  isExpanded?: boolean;
  // Callbacks reciben la transacción/id y deben ser referencias estables
  // (useCallback). Antes eran closures de cero-args creadas por fila en cada
  // render del padre, lo que anulaba React.memo (R-memo-inline).
  onToggleExpand?: (id: string) => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
  onSave: (id: string) => void;
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
  isExpanded = false,
  onToggleExpand,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  onEditFormChange,
}) => {
  const { hideBalances } = useUIPreferences();

  const displayAmount = (amount: number) => hideBalances ? '••••••' : formatCurrency(amount);
  const amountPrefix =
    transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '->';
  const amountClass =
    transaction.type === 'income'
      ? 'text-emerald-600 dark:text-emerald-400'
      : transaction.type === 'expense'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-blue-600 dark:text-blue-400';
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
    // ids únicos por transacción para asociar <label> con su input
    const editId = `tx-edit-${transaction.id ?? 'new'}`;
    const descId = `${editId}-description`;
    const categoryId = `${editId}-category`;
    const amountId = `${editId}-amount`;
    const dateId = `${editId}-date`;
    return (
      <div className="border rounded-xl p-3.5 sm:p-4 transition-colors bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={descId} className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Descripcion
              </label>
              <input
                id={descId}
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
              <label htmlFor={categoryId} className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Categoria
              </label>
              <select
                id={categoryId}
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
              <label htmlFor={amountId} className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Monto
              </label>
              <CurrencyInput
                id={amountId}
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
              <label htmlFor={dateId} className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">
                Fecha
              </label>
              <input
                id={dateId}
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
            <button onClick={() => onSave(transaction.id!)} className="btn-submit">
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

  const isTransfer = transaction.type === 'transfer';
  const typeLabel =
    transaction.type === 'income' ? 'Ingreso' : transaction.type === 'expense' ? 'Gasto' : 'Transferencia';
  const createdAtDate = transaction.createdAt ? ensureDate(transaction.createdAt) : null;
  const installmentTotal = transaction.amount + (transaction.totalInterestAmount || 0);

  return (
    <div
      className={`border rounded-xl p-3.5 sm:p-4 transition-[box-shadow,border-color,background-color] bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md shadow-sm group ${isExpanded ? 'border-purple-300 dark:border-purple-600' : 'border-gray-200 dark:border-gray-700'} ${onToggleExpand ? 'cursor-pointer' : ''}`}
      onClick={onToggleExpand ? () => onToggleExpand(transaction.id!) : undefined}
    >
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
            <span className={`text-base sm:text-lg font-bold whitespace-nowrap shrink-0 ${amountClass}`}>
              {amountPrefix} {displayAmount(transaction.amount)}
            </span>
          </div>

          {/* Info row */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {transaction.category}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
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
            <div className="flex items-center gap-0.5 shrink-0">
              <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
                  className="flex items-center justify-center p-1.5 min-h-[44px] min-w-[44px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  title="Editar"
                  aria-label="Editar transaccion"
                >
                  <Edit2 size={15} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(transaction); }}
                  className="flex items-center justify-center p-1.5 min-h-[44px] min-w-[44px] text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  title="Eliminar"
                  aria-label="Eliminar transaccion"
                >
                  <X size={15} />
                </button>
              </div>
              {onToggleExpand && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(transaction.id!); }}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Contraer detalle' : 'Expandir detalle'}
                  className="flex items-center justify-center p-1.5 min-h-[44px] min-w-[44px] text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                >
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detalle de solo lectura (expandible) */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3" onClick={(e) => e.stopPropagation()}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Tipo</dt>
              <dd className="text-gray-900 dark:text-gray-100">{typeLabel}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Monto</dt>
              <dd className={`font-semibold ${amountClass}`}>{amountPrefix} {displayAmount(transaction.amount)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">{isTransfer ? 'Cuentas' : 'Cuenta'}</dt>
              <dd className="text-gray-900 dark:text-gray-100 break-words">{accountRoute}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Categoría</dt>
              <dd className="text-gray-900 dark:text-gray-100 break-words">{transaction.category}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Fecha</dt>
              <dd className="text-gray-900 dark:text-gray-100">{dateLabel}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Estado</dt>
              <dd className="text-gray-900 dark:text-gray-100">{transaction.paid ? 'Pagada' : 'Pendiente'}</dd>
            </div>
            {transaction.description && (
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Descripción</dt>
                <dd className="text-gray-900 dark:text-gray-100 break-words">{transaction.description}</dd>
              </div>
            )}
            {createdAtDate && (
              <div className="col-span-2">
                <dt className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Registrada</dt>
                <dd className="text-gray-500 dark:text-gray-400 text-xs">
                  {createdAtDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                </dd>
              </div>
            )}
          </dl>

          {/* Plan de cuotas */}
          {transaction.installments && transaction.installments > 1 && (
            <div className="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 p-2.5">
              <p className="text-[11px] uppercase tracking-wider text-purple-500 dark:text-purple-300 mb-1">Plan de cuotas</p>
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                {transaction.installments} cuotas{transaction.monthlyInstallmentAmount ? ` · ${displayAmount(transaction.monthlyInstallmentAmount)}/mes` : ''}
              </p>
              {transaction.hasInterest && transaction.totalInterestAmount ? (
                <p className="text-xs text-purple-800 dark:text-purple-200 mt-0.5">
                  Interés total {displayAmount(transaction.totalInterestAmount)} · Total {displayAmount(installmentTotal)}
                  {transaction.interestRate ? ` · E.A. ${transaction.interestRate}%` : ''}
                </p>
              ) : (
                <p className="text-xs text-purple-800 dark:text-purple-200 mt-0.5">Sin intereses</p>
              )}
            </div>
          )}

          {/* Moneda extranjera */}
          {transaction.originalAmount && transaction.originalCurrency && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Original: {transaction.originalAmount.toLocaleString('es-CO')} {transaction.originalCurrency}
              {transaction.exchangeRate ? ` · TRM ${transaction.exchangeRate.toLocaleString('es-CO')}` : ''}
            </div>
          )}

          {/* Pago periódico vinculado */}
          {recurringPaymentName && (
            <div className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300">
              <Repeat size={13} />
              Pago periódico: {recurringPaymentName}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(transaction); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Edit2 size={14} />
              Editar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}, areEqual);

/**
 * Comparador de memo (R-memo-inline). Las filas NO editándose no usan `editForm`
 * ni `onSave`, así que esas props no deben provocar re-render (el usuario teclea
 * en una fila → `editForm` cambia en cada pulsación, lo que antes re-renderizaba
 * las ~30 filas visibles). Solo la fila en edición observa `editForm`/`onSave`.
 * El resto de callbacks deben ser referencias estables (useCallback) en el padre.
 */
function areEqual(prev: TransactionItemProps, next: TransactionItemProps): boolean {
  if (prev.isEditing !== next.isEditing) return false;
  if (next.isEditing) {
    if (prev.editForm !== next.editForm) return false;
    if (prev.onSave !== next.onSave) return false;
  }
  return (
    prev.transaction === next.transaction &&
    prev.account === next.account &&
    prev.destinationAccount === next.destinationAccount &&
    prev.categories === next.categories &&
    prev.recurringPaymentName === next.recurringPaymentName &&
    prev.formatCurrency === next.formatCurrency &&
    prev.isExpanded === next.isExpanded &&
    prev.onToggleExpand === next.onToggleExpand &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onCancel === next.onCancel &&
    prev.onEditFormChange === next.onEditFormChange
  );
}

TransactionItem.displayName = 'TransactionItem';
