import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw } from 'lucide-react';
import type {
  Transaction,
  Account,
  FilterValue,
  DateRangePreset,
  RecurringPayment,
} from '../../../../types/finance';
import { parseDateFromInput, parseDateWithTime } from '../../../../utils/formatters';
import { getDateRangeFromPreset, ensureDate } from '../../../../utils/dateUtils';
import { findAccountForTransaction, transactionUsesAccount } from '../../../../utils/accountTransactions';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import { SUCCESS_MESSAGES, TRANSACTION_VALIDATION } from '../../../../config/constants';

interface UseTransactionsViewParams {
  transactions: Transaction[];
  accounts: Account[];
  recurringPayments: RecurringPayment[];
  filterCategory: FilterValue;
  filterAccount: FilterValue;
  dateRangePreset: DateRangePreset;
  setDateRangePreset: (preset: DateRangePreset) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
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
  dateRangePreset,
  setDateRangePreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
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
    category: '',
  });

  // Estado de filtro de fecha
  const [showDatePicker, setShowDatePicker] = useState(false);

  // 🆕 Estado de búsqueda por texto
  const [searchQuery, setSearchQuery] = useState<string>('');

  const accountsById = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const recurringPaymentsById = useMemo(() => {
    return new Map(recurringPayments.map((payment) => [payment.id, payment]));
  }, [recurringPayments]);

  // Filtrado con rango de fecha y búsqueda de texto
  const filteredTransactions = useMemo(() => {
    const selectedAccount =
      filterAccount === 'all' ? null : accounts.find((account) => account.id === filterAccount);
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('es-CO');

    return transactions.filter((t) => {
      // Filtro por categoría
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      // Filtro por cuenta
      if (filterAccount !== 'all') {
        if (!selectedAccount || !transactionUsesAccount(t, selectedAccount)) return false;
      }

      // 🆕 Filtro por texto (búsqueda en descripción)
      if (normalizedQuery) {
        const sourceAccount = accountsById.get(t.accountId);
        const destinationAccount = t.toAccountId ? accountsById.get(t.toAccountId) : null;
        const recurringPayment = t.recurringPaymentId
          ? recurringPaymentsById.get(t.recurringPaymentId)
          : null;
        const typeLabel =
          t.type === 'income' ? 'ingreso' : t.type === 'expense' ? 'gasto' : 'transferencia';
        const searchableText = [
          t.description,
          t.category,
          typeLabel,
          sourceAccount?.name,
          destinationAccount?.name,
          recurringPayment?.name,
          t.amount.toString(),
          t.amount.toLocaleString('es-CO'),
          new Date(t.date).toLocaleDateString('es-CO'),
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es-CO');

        if (!searchableText.includes(normalizedQuery)) {
          return false;
        }
      }

      // Filtro por rango de fecha
      if (dateRangePreset !== 'all') {
        const transactionDate = new Date(t.date);

        if (dateRangePreset === 'custom') {
          if (customStartDate) {
            const start = parseDateFromInput(customStartDate);
            start.setHours(0, 0, 0, 0);
            if (transactionDate < start) return false;
          }
          if (customEndDate) {
            const end = parseDateFromInput(customEndDate);
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
  }, [
    transactions,
    accounts,
    accountsById,
    recurringPaymentsById,
    filterCategory,
    filterAccount,
    searchQuery,
    dateRangePreset,
    customStartDate,
    customEndDate,
  ]);

  // Verificar si hay filtros activos
  const isMetadataFiltersActive =
    filterCategory !== 'all' || filterAccount !== 'all' || dateRangePreset !== 'all' || searchQuery.trim() !== '';

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
      setSearchQuery(''); // 🆕 Limpiar búsqueda
    },
    [setCustomEndDate, setCustomStartDate, setDateRangePreset]
  );

  const startEditTransaction = useCallback((transaction: Transaction) => {
    setEditingTransaction(transaction.id!);
    setEditForm({
      description: transaction.description,
      amount: transaction.amount.toString(),
      date: new Date(transaction.date).toISOString().split('T')[0],
      category: transaction.category,
    });
  }, []);

  const handleSaveEdit = useCallback(
    async (id: string) => {
      // Parse amount - CurrencyInput gives us a plain string like "88888" or "88888.5"
      const amount = parseFloat(editForm.amount);

      // Client-side validation
      if (isNaN(amount) || amount <= 0) {
        showToast.error('El monto debe ser un número válido mayor a 0');
        return;
      }

      // Validar monto máximo
      if (amount > TRANSACTION_VALIDATION.amount.max) {
        showToast.error(TRANSACTION_VALIDATION.amount.errorMessage);
        return;
      }

      if (!editForm.category) {
        showToast.error('Debes seleccionar una categoría');
        return;
      }

      try {
        const original = transactions.find((t) => t.id === id);
        await updateTransaction(id, {
          description: editForm.description.trim(),
          amount,
          // Mantiene la hora original de la transacción; el input solo cambia el día.
          date: original
            ? parseDateWithTime(editForm.date, ensureDate(original.date))
            : parseDateWithTime(editForm.date),
          category: editForm.category,
        });

        setEditingTransaction(null);
        setEditForm({ description: '', amount: '', date: '', category: '' });
        showToast.success(SUCCESS_MESSAGES.TRANSACTION_UPDATED);
      } catch (error) {
        // Enhanced error handling - close form on error
        const errorMessage = error instanceof Error
          ? error.message
          : 'Error desconocido al actualizar la transacción';

        logger.error('Error updating transaction:', error);
        showToast.error(errorMessage);

        // Close the edit form
        setEditingTransaction(null);
        setEditForm({ description: '', amount: '', date: '', category: '' });
      }
    },
    [editForm, updateTransaction]
  );

  const handleCancelEdit = useCallback(() => {
    setEditingTransaction(null);
    setEditForm({ description: '', amount: '', date: '', category: '' });
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
                    const transactionToRestore = { ...transaction };
                    delete transactionToRestore.id;
                    delete transactionToRestore.createdAt;
                    await onRestore(transactionToRestore);
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
      return findAccountForTransaction(accounts, accountId);
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

    // 🆕 Search filter
    searchQuery,
    setSearchQuery,

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
