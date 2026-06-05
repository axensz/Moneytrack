'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { TransactionItem } from './TransactionItem';
import type { Transaction, Account, Categories } from '../../../../types/finance';

interface AdjustmentGroupProps {
  transactions: Transaction[];
  formatCurrency: (amount: number) => string;
  categories: Categories;
  getAccountForTransaction: (accountId: string) => Account | undefined;
  getRecurringPaymentName: (id?: string) => string | null | undefined;
  editingTransaction: string | null;
  editForm: { description: string; amount: string; date: string; category: string };
  startEditTransaction: (t: Transaction) => void;
  handleDeleteTransaction: (t: Transaction) => void;
  handleSaveEdit: (id: string) => void;
  handleCancelEdit: () => void;
  setEditForm: (form: { description: string; amount: string; date: string; category: string }) => void;
}

export const AdjustmentGroup: React.FC<AdjustmentGroupProps> = ({
  transactions,
  formatCurrency,
  categories,
  getAccountForTransaction,
  getRecurringPaymentName,
  editingTransaction,
  editForm,
  startEditTransaction,
  handleDeleteTransaction,
  handleSaveEdit,
  handleCancelEdit,
  setEditForm,
}) => {
  const [expanded, setExpanded] = useState(false);

  // If any item is being edited, force expand
  const isEditingInside = transactions.some(t => editingTransaction === t.id);
  const isExpanded = expanded || isEditingInside;

  return (
    <div className="border rounded-xl overflow-hidden border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3.5 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <Settings2 size={18} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-base">
            Ajustes de saldo
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {transactions.length} ajuste{transactions.length > 1 ? 's' : ''}
          </p>
        </div>
        {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-2 space-y-2">
          {transactions.map(transaction => (
            <TransactionItem
              key={transaction.id}
              transaction={transaction}
              account={getAccountForTransaction(transaction.accountId)}
              destinationAccount={transaction.toAccountId ? getAccountForTransaction(transaction.toAccountId) : undefined}
              isEditing={editingTransaction === transaction.id}
              editForm={editForm}
              categories={categories}
              recurringPaymentName={getRecurringPaymentName(transaction.recurringPaymentId)}
              formatCurrency={formatCurrency}
              onEdit={() => startEditTransaction(transaction)}
              onDelete={() => handleDeleteTransaction(transaction)}
              onSave={() => handleSaveEdit(transaction.id!)}
              onCancel={handleCancelEdit}
              onEditFormChange={setEditForm}
            />
          ))}
        </div>
      )}
    </div>
  );
};
