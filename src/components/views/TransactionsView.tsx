'use client';

import React, { useState, useMemo } from 'react';
import { PlusCircle, Activity, X, Edit2, Check, Search, FilterX, RotateCcw, Calendar, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Transaction, Account, FilterValue, NewTransaction, DateRangePreset, RecurringPayment } from '../../types/finance';
import { formatNumberForInput, unformatNumber } from '../../utils/formatters';

// Utilidades de fecha
const getDateRangeFromPreset = (preset: DateRangePreset): { start: Date | null; end: Date | null } => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (preset) {
    case 'today':
      return { 
        start: today, 
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) 
      };
    case 'this-week': {
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // Lunes
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);
      return { start: startOfWeek, end: endOfWeek };
    }
    case 'this-month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start: startOfMonth, end: endOfMonth };
    }
    case 'last-month': {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: startOfLastMonth, end: endOfLastMonth };
    }
    case 'this-year': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start: startOfYear, end: endOfYear };
    }
    case 'last-year': {
      const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
      const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      return { start: startOfLastYear, end: endOfLastYear };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
};

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'Todo el tiempo' },
  { value: 'today', label: 'Hoy' },
  { value: 'this-week', label: 'Esta semana' },
  { value: 'this-month', label: 'Este mes' },
  { value: 'last-month', label: 'Mes pasado' },
  { value: 'this-year', label: 'Este año' },
  { value: 'last-year', label: 'Año pasado' },
  { value: 'custom', label: 'Personalizado' }
];

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: Account[];
  recurringPayments?: RecurringPayment[];
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
  loading?: boolean;
  onRestore?: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  accounts,
  recurringPayments = [],
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
  formatCurrency,
  loading = false,
  onRestore
}) => {
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    description: string;
    amount: string;
    date: string;
  }>({ description: '', amount: '', date: '' });

  // 🆕 Estados para filtro de fecha
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDeleteTransaction = async (transaction: Transaction) => {
    // 1. Optimistic UI / Immediate Feedback (HU-04)
    const toastId = toast.loading('Eliminando...');
    
    try {
      await deleteTransaction(transaction.id!);
      
      toast.success(
        (t) => (
          <div className="flex items-center gap-2">
            <span>Eliminado</span>
            {onRestore && (
              <button 
                onClick={async () => {
                  toast.dismiss(t.id);
                  // Convertir Transaction a objeto restaurable
                  // (eliminando ID y campos generados)
                  const { id, createdAt, ...rest } = transaction;
                  await onRestore(rest);
                  toast.success('Restaurado');
                }}
                className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-1"
              >
                <RotateCcw size={12} /> Deshacer
              </button>
            )}
          </div>
        ),
        { id: toastId, duration: 4000 }
      );
    } catch (error) {
      toast.error('Error al eliminar', { id: toastId });
    }
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

  // 🆕 Filtrado con rango de fecha
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Filtro por categoría
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      // Filtro por cuenta
      if (filterAccount !== 'all' && t.accountId !== filterAccount) return false;
      
      // Filtro por rango de fecha
      if (dateRangePreset !== 'all') {
        const transactionDate = new Date(t.date);
        
        if (dateRangePreset === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            if (transactionDate < start) return false;
          }
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            if (transactionDate > end) return false;
          }
        } else {
          const { start, end } = getDateRangeFromPreset(dateRangePreset);
          if (start && transactionDate < start) return false;
          if (end && transactionDate > end) return false;
        }
      }
      
      return true;
    });
  }, [transactions, filterCategory, filterAccount, dateRangePreset, customStartDate, customEndDate]);

  const isMetadataFiltersActive = filterCategory !== 'all' || filterAccount !== 'all' || dateRangePreset !== 'all';

  const clearFilters = () => {
    setFilterAccount('all');
    setFilterCategory('all');
    setDateRangePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  // Obtener nombre del pago periódico asociado
  const getRecurringPaymentName = (recurringPaymentId?: string) => {
    if (!recurringPaymentId) return null;
    return recurringPayments.find(p => p.id === recurringPaymentId)?.name;
  };

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

        {/* Filtros alineados a la derecha */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de cuenta */}
          <select
            value={filterAccount}
            onChange={(e) => setFilterAccount(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
          >
            <option value="all">Todas las cuentas</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>

          {/* Filtro de categoría */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
          >
            <option value="all">Todas las categorías</option>
            {[...categories.expense, ...categories.income].map((cat, index) => (
              <option key={`${cat}-${index}`} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Filtro de fecha con presets */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                dateRangePreset !== 'all'
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600'
              }`}
            >
              <Calendar size={16} />
              {DATE_PRESETS.find(p => p.value === dateRangePreset)?.label || 'Fecha'}
              <ChevronDown size={14} />
            </button>
            
            {showDatePicker && (
              <div className="absolute top-full right-0 mt-1 z-20 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-3 min-w-[200px]">
                <div className="space-y-1">
                  {DATE_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      onClick={() => {
                        setDateRangePreset(preset.value);
                        if (preset.value !== 'custom') setShowDatePicker(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        dateRangePreset === preset.value
                          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                
                {/* Campos de fecha personalizada */}
                {dateRangePreset === 'custom' && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Desde</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-gray-400">Hasta</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700"
                      />
                    </div>
                    <button
                      onClick={() => setShowDatePicker(false)}
                      className="w-full mt-2 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      Aplicar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Botón limpiar filtros */}
          {isMetadataFiltersActive && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
              <FilterX size={16} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 flex items-center gap-2">
        Transacciones <span className="text-sm font-normal text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{filteredTransactions.length}</span>
      </h3>

      {/* HU-03: SKELETON LOADING */}
      {loading ? (
        <div className="space-y-3">
           {[1, 2, 3].map((i) => (
             <div key={i} className="border rounded-lg p-4 bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 animate-pulse">
              <div className="flex items-center justify-between">
                   <div className="space-y-2">
                      <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
                   </div>
                   <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              </div>
             ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          /* EMPTY STATES - HU-02 */
          <div className="text-center py-12">
            {isMetadataFiltersActive ? (
              // Case B: Filtros activos pero sin resultados
              <div className="animate-in fade-in zoom-in-95 duration-300">
                <div className="bg-purple-50 dark:bg-gray-800 p-4 rounded-full inline-block mb-4">
                  <Search size={32} className="text-purple-300 dark:text-gray-600" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  No se encontraron transacciones
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6 text-sm">
                  No hay movimientos que coincidan con los filtros de cuenta o categoría seleccionados.
                </p>
                <button 
                  onClick={clearFilters} 
                  className="inline-flex items-center gap-2 text-purple-600 dark:text-purple-400 font-medium hover:text-purple-700 dark:hover:text-purple-300 transition-colors bg-purple-50 dark:bg-purple-900/20 px-4 py-2 rounded-lg hover:bg-purple-100"
                >
                  <FilterX size={16} />
                  Limpiar filtros
                </button>
              </div>
            ) : (
              // Case A: Sin transacciones (absoluto)
              <div className="text-gray-400 dark:text-gray-500">
                <Activity size={48} className="mx-auto mb-3 opacity-30" />
                <p>No tienes transacciones registradas aún</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTransactions.map(transaction => {
              const account = accounts.find(a => a.id === transaction.accountId);
              const isEditing = editingTransaction === transaction.id;
              
              return (
                <div
                  key={transaction.id}
                  className="border rounded-lg p-3 sm:p-4 transition-all bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600 hover:shadow-lg shadow-sm"
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
                        <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap gap-1 items-center">
                          <span>{transaction.category}</span>
                          <span className="hidden sm:inline">•</span>
                          <span className="hidden sm:inline">{account?.name}</span>
                          <span className="hidden sm:inline">•</span>
                          <span>{new Date(transaction.date).toLocaleDateString('es-CO')}</span>
                          {/* 🆕 Indicador de pago periódico */}
                          {transaction.recurringPaymentId && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                                🔄 {getRecurringPaymentName(transaction.recurringPaymentId)}
                              </span>
                            </>
                          )}
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
                            onClick={() => handleDeleteTransaction(transaction)}
                            className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                            title="Eliminar transacción"
                          >
                            <X size={18} />
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
  );
};