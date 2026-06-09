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
  expandedTransaction?: string | null;
  toggleExpand?: (id: string) => void;
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
  expandedTransaction = null,
  toggleExpand,
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

  // Group by account
  const byAccount = transactions.reduce<Map<string, { account: Account | undefined; items: Transaction[] }>>((map, t) => {
    const acc = getAccountForTransaction(t.accountId);
    const key = t.accountId;
    if (!map.has(key)) map.set(key, { account: acc, items: [] });
    map.get(key)!.items.push(t);
    return map;
  }, new Map());

  return (
    <div className="border rounded-xl overflow-hidden border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <button
        onClick={() => setExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <Settings2 size={18} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-base">
            Ajustes de saldo
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {transactions.length} ajuste{transactions.length > 1 ? 's' : ''} · {byAccount.size} cuenta{byAccount.size > 1 ? 's' : ''}
          </p>
        </div>
        {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
      </button>
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 p-2 space-y-3">
          {Array.from(byAccount.entries()).map(([accountId, { account, items }]) => (
            <div key={accountId}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-500 px-1 mb-1.5">
                {account?.name || 'Cuenta desconocida'}
              </p>
              <div className="space-y-2">
                {items.map(transaction => (
                  <TransactionItem
                    key={transaction.id}
                    transaction={transaction}
                    account={account}
                    destinationAccount={transaction.toAccountId ? getAccountForTransaction(transaction.toAccountId) : undefined}
                    isEditing={editingTransaction === transaction.id}
                    editForm={editForm}
                    categories={categories}
                    recurringPaymentName={getRecurringPaymentName(transaction.recurringPaymentId)}
                    formatCurrency={formatCurrency}
                    isExpanded={expandedTransaction === transaction.id}
                    onToggleExpand={toggleExpand}
                    onEdit={startEditTransaction}
                    onDelete={handleDeleteTransaction}
                    onSave={handleSaveEdit}
                    onCancel={handleCancelEdit}
                    onEditFormChange={setEditForm}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
