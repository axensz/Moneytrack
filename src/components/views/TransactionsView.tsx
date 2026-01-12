'use client';

import React from 'react';
import { PlusCircle, Activity, Copy, X } from 'lucide-react';
import type { Transaction, Account, FilterValue } from '../../types/finance';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: Account[];
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  filterCategory: FilterValue;
  setFilterCategory: (filter: FilterValue) => void;
  filterStatus: FilterValue;
  setFilterStatus: (filter: FilterValue) => void;
  filterAccount: FilterValue;
  setFilterAccount: (filter: FilterValue) => void;
  categories: {
    expense: string[];
    income: string[];
  };
  togglePaid: (id: string) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  handleDuplicateTransaction: (transaction: Transaction) => Promise<void>;
  formatCurrency: (amount: number) => string;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  accounts,
  showForm,
  setShowForm,
  filterCategory,
  setFilterCategory,
  filterStatus,
  setFilterStatus,
  filterAccount,
  setFilterAccount,
  categories,
  togglePaid,
  deleteTransaction,
  handleDuplicateTransaction,
  formatCurrency
}) => {
  const filteredTransactions = transactions.filter(t => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterStatus === 'paid' && !t.paid) return false;
    if (filterStatus === 'pending' && t.paid) return false;
    if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
    return true;
  });

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          <PlusCircle size={18} />
          Nueva Transacción
        </button>

        <div className="flex gap-3 flex-wrap">
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="select-filter"
          >
            <option value="all">Todas las cuentas</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="select-filter"
          >
            <option value="all">Todas las categorías</option>
            {[...categories.expense, ...categories.income].map((cat, index) => (
              <option key={`${cat}-${index}`} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="select-filter"
          >
            <option value="all">Todos</option>
            <option value="paid">Pagados</option>
            <option value="pending">Pendientes</option>
          </select>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Transacciones ({filteredTransactions.length})
        </h3>

        {filteredTransactions.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <Activity size={48} className="mx-auto mb-3 opacity-30" />
            <p>No hay transacciones</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTransactions.map(transaction => {
              const account = accounts.find(a => a.id === transaction.accountId);
              return (
                <div
                  key={transaction.id}
                  className={`border rounded-lg p-4 flex justify-between items-center transition-all ${
                    transaction.paid
                      ? 'bg-white dark:bg-gray-800 border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md'
                      : 'bg-purple-50/50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700'
                  }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    <input
                      type="checkbox"
                      checked={transaction.paid}
                      onChange={() => togglePaid(transaction.id!)}
                      className="w-4 h-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                    />

                    <div className="flex-1">
                      <div className={`font-medium text-gray-900 dark:text-gray-100 ${transaction.paid ? 'line-through opacity-60' : ''}`}>
                        {transaction.description}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {transaction.category} • {account?.name} • {new Date(transaction.date).toLocaleDateString('es-CO')}
                      </div>
                    </div>

                    <div className={`text-lg font-semibold ${
                      transaction.type === 'income' ? 'text-emerald-600' : 
                      transaction.type === 'expense' ? 'text-rose-600' : 'text-blue-600'
                    }`}>
                      {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '→'} {formatCurrency(transaction.amount)}
                    </div>

                    <div className="flex gap-1">
                      <button
                        onClick={() => handleDuplicateTransaction(transaction)}
                        className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                        title="Duplicar transacción"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => deleteTransaction(transaction.id!)}
                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};