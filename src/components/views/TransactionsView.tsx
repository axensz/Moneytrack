'use client';

import React, { useState } from 'react';
import { PlusCircle, Activity, X, Edit2, Check } from 'lucide-react';
import type { Transaction, Account, FilterValue } from '../../types/finance';
import { formatNumberForInput, unformatNumber } from '../../utils/formatters';

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
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
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
  updateTransaction,
  formatCurrency
}) => {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    description: string;
    amount: string;
    date: string;
  }>({ description: '', amount: '', date: '' });

  const handleDeleteTransaction = async (id: string) => {
    await deleteTransaction(id);
    setDeleteConfirm(null);
  };

  const startEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction.id!);
    setEditForm({
      description: transaction.description,
      amount: formatNumberForInput(transaction.amount),
      date: new Date(transaction.date).toISOString().split('T')[0]
    });
  };

  const handleSaveEdit = async (id: string) => {
    const amountStr = editForm.amount.toString().replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
      return;
    }

    await updateTransaction(id, {
      description: editForm.description.trim(),
      amount,
      date: new Date(editForm.date)
    });

    setEditingTransaction(null);
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
    setEditForm({ description: '', amount: '', date: '' });
  };

  const filteredTransactions = transactions.filter(t => {
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
    return true;
  });

  return (
    <div className="card">
      {/* Mensaje de ayuda cuando no hay cuentas */}
      {accounts.length === 0 && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-200 dark:bg-amber-800 rounded-lg">
              <Activity size={20} className="text-amber-700 dark:text-amber-300" />
            </div>
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                No tienes cuentas creadas
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Para crear transacciones, primero debes agregar una cuenta en la sección de <strong>Cuentas</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <button
          onClick={() => setShowForm(!showForm)}
          disabled={accounts.length === 0}
          className={`btn-primary ${
            accounts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          title={accounts.length === 0 ? 'Crea una cuenta primero' : 'Crear transacción'}
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
              const isEditing = editingTransaction === transaction.id;
              
              return (
                <div
                  key={transaction.id}
                  className="border rounded-lg p-3 sm:p-4 transition-all bg-white dark:bg-gray-800 border-purple-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-md"
                >
                  {isEditing ? (
                    // Modo edición
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Descripción</label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Monto</label>
                          <input
                            type="text"
                            value={formatNumberForInput(editForm.amount)}
                            onChange={(e) => {
                              const unformatted = unformatNumber(e.target.value);
                              setEditForm({ ...editForm, amount: unformatted });
                            }}
                            placeholder="0"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Fecha</label>
                          <input
                            type="date"
                            value={editForm.date}
                            onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => handleSaveEdit(transaction.id!)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors shadow-md"
                        >
                          <Check size={16} />
                          Guardar
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Modo vista normal
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {transaction.description}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-1">
                          <span>{transaction.category}</span>
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">{account?.name}</span>
                          <span className="hidden sm:inline">•</span>
                          <span>{new Date(transaction.date).toLocaleDateString('es-CO')}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        <div className={`text-base sm:text-lg font-semibold whitespace-nowrap ${
                          transaction.type === 'income' ? 'text-emerald-600' :
                          transaction.type === 'expense' ? 'text-rose-600' : 'text-blue-600'
                        }`}>
                          {transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '→'} {formatCurrency(transaction.amount)}
                        </div>

                        <div className="flex gap-1">
                          <button
                            onClick={() => startEditTransaction(transaction)}
                            className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors"
                            title="Editar transacción"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(transaction.id!)}
                            className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {deleteConfirm === transaction.id && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
                      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-4 sm:p-6 max-w-sm w-full">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                          ¿Eliminar transacción?
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                          Esta acción no se puede deshacer. Se eliminará la transacción permanentemente.
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleDeleteTransaction(transaction.id!)}
                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                          >
                            Eliminar
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium py-2 px-4 rounded-lg transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};