import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import type {
  Transaction,
  Account,
  FilterValue,
  DateRangePreset,
  RecurringPayment,
} from '../../../../types/finance';
import { formatNumberForInput } from '../../../../utils/formatters';
import { getDateRangeFromPreset } from '../utils/dateUtils';

interface UseTransactionsViewParams {
  transactions: Transaction[];
  accounts: Account[];
  recurringPayments: RecurringPayment[];
  filterCategory: FilterValue;
  filterAccount: FilterValue;
  deleteTransaction: (id: string) => Promise<void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  onRestore?: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
}

/**
 * Hook para gestionar la lógica de la vista de transacciones
 * - Filtrado con fechas
 * - Edición de transacciones
 * - Eliminación con undo
 */
export const useTransactionsView = ({
  transactions,
  accounts,
  recurringPayments,
  filterCategory,
  filterAccount,
  deleteTransaction,
  updateTransaction,
  onRestore,
}: UseTransactionsViewParams) => {
  // Estado de edición
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    amount: '',
    date: '',
  });

  // Estado de filtro de fecha
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Filtrado con rango de fecha
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
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

  // Verificar si hay filtros activos
  const isMetadataFiltersActive =
    filterCategory !== 'all' || filterAccount !== 'all' || dateRangePreset !== 'all';

  // Handlers
  const clearFilters = useCallback(
    (
      setFilterAccount: (v: FilterValue) => void,
      setFilterCategory: (v: FilterValue) => void
    ) => {
      setFilterAccount('all');
      setFilterCategory('all');
      setDateRangePreset('all');
      setCustomStartDate('');
      setCustomEndDate('');
    },
    []
  );

  const startEditTransaction = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction.id!);
    setEditForm({
      description: transaction.description,
      amount: formatNumberForInput(transaction.amount),
      date: new Date(transaction.date).toISOString().split('T')[0],
    });
  }, []);

  const handleSaveEdit = useCallback(
    async (id: string) => {
      const amountStr = editForm.amount.toString().replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        return;
      }

      await updateTransaction(id, {
        description: editForm.description.trim(),
        amount,
        date: new Date(editForm.date),
      });

      setEditingTransaction(null);
    },
    [editForm, updateTransaction]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTransaction(null);
    setEditForm({ description: '', amount: '', date: '' });
  }, []);

  const handleDeleteTransaction = useCallback(
    async (transaction: Transaction) => {
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
                    const { id, createdAt, ...rest } = transaction;
                    await onRestore(rest);
                    toast.success('Restaurado');
                  }}
                  className="px-2 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors flex items-center gap-1"
                >
                  ↩ Deshacer
                </button>
              )}
            </div>
          ),
          { id: toastId, duration: 4000 }
        );
      } catch {
        toast.error('Error al eliminar', { id: toastId });
      }
    },
    [deleteTransaction, onRestore]
  );

  const getRecurringPaymentName = useCallback(
    (recurringPaymentId?: string) => {
      if (!recurringPaymentId) return null;
      return recurringPayments.find((p) => p.id === recurringPaymentId)?.name;
    },
    [recurringPayments]
  );

  const getAccountForTransaction = useCallback(
    (accountId: string) => {
      return accounts.find((a) => a.id === accountId);
    },
    [accounts]
  );

  return {
    // Filtered data
    filteredTransactions,
    isMetadataFiltersActive,

    // Date filter state
    dateRangePreset,
    setDateRangePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    showDatePicker,
    setShowDatePicker,

    // Edit state
    editingTransaction,
    editForm,
    setEditForm,
    startEditTransaction,
    handleSaveEdit,
    handleCancelEdit,

    // Actions
    handleDeleteTransaction,
    clearFilters,
    getRecurringPaymentName,
    getAccountForTransaction,
  };
};
