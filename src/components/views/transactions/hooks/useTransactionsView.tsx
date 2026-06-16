import { useState, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw } from 'lucide-react';
import type {
  Transaction,
  Account,
  FilterValue,
  DateRangePreset,
  RecurringPayment,
  NewTransaction,
} from '../../../../types/finance';
import { parseDateFromInput, parseDateWithTime } from '../../../../utils/formatters';
import { getDateRangeFromPreset, ensureDate } from '../../../../utils/dateUtils';
import { findAccountForTransaction, transactionUsesAccount } from '../../../../utils/accountTransactions';
import { TransactionValidator } from '../../../../utils/validators';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import { SUCCESS_MESSAGES } from '../../../../config/constants';

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
  /** Historial completo para validar saldo/cupo (nunca la ventana paginada). */
  balanceTransactions: Transaction[];
  /** false mientras el historial completo asienta: se omite la validación. */
  balancesReady: boolean;
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
  balanceTransactions,
  balancesReady,
}: UseTransactionsViewParams) => {
  // Estado de edición
  const [editingTransaction, setEditingTransaction] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    description: '',
    amount: '',
    date: '',
    category: '',
  });

  // Estado de detalle (expandir fila en modo solo lectura)
  const [expandedTransaction, setExpandedTransaction] = useState<string | null>(null);
  const toggleExpand = useCallback((id: string) => {
    setExpandedTransaction((prev) => (prev === id ? null : id));
  }, []);

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
    setExpandedTransaction(null); // al editar, cerrar el detalle de solo lectura
    setEditForm({
      description: transaction.description,
      amount: transaction.amount.toString(),
      date: new Date(transaction.date).toISOString().split('T')[0],
      category: transaction.category,
    });
  }, []);

  const handleSaveEdit = useCallback(
    async (id: string) => {
      // CurrencyInput entrega un string numérico plano ("88888" o "88888.5").
      const amount = parseFloat(editForm.amount);
      const original = transactions.find((t) => t.id === id);
      const account = original ? accountsById.get(original.accountId) : undefined;

      // Validación unificada con el alta (#10): el MISMO TransactionValidator
      // valida monto/categoría y saldo/cupo. `original` excluye la tx editada del
      // cálculo (evita falsos rechazos por doble conteo) y cubre TODOS los tipos,
      // incluido el pago de TC (income) que antes se omitía y permitía sobrepagar
      // borrando deuda (#2). El saldo/cupo se omite mientras el historial no
      // asienta (balancesReady=false) pasando transactions=undefined.
      const validation = TransactionValidator.validate(
        {
          type: original?.type ?? 'expense',
          amount: editForm.amount,
          category: editForm.category,
          description: editForm.description,
          accountId: original?.accountId ?? '',
          toAccountId: original?.toAccountId ?? '',
        } as NewTransaction,
        account,
        balancesReady ? balanceTransactions : undefined,
        original
      );
      if (!validation.isValid) {
        validation.errors.forEach((error) => showToast.error(error));
        return;
      }

      try {
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
        const errorMessage = error instanceof Error
          ? error.message
          : 'Error desconocido al actualizar la transacción';

        logger.error('Error updating transaction:', error);
        showToast.error(errorMessage);
        // #7: NO descartar la edición — el usuario conserva lo escrito y puede
        // reintentar (antes se cerraba el form y se perdía todo).
      }
    },
    [editForm, updateTransaction, transactions, accountsById, balanceTransactions, balancesReady]
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

        // Guard anti doble-clic en "Deshacer": el handler es async y sin esto un
        // segundo clic re-crea la transacción (duplicado). Flag por-toast. (#tx-4)
        let isRestoring = false;
        toast.success(
          (t) => (
            <div className="flex items-center gap-2">
              <span>Eliminado</span>
              {onRestore && (
                <button
                  onClick={async () => {
                    if (isRestoring) return;
                    isRestoring = true;
                    toast.dismiss(t.id);
                    const transactionToRestore = { ...transaction };
                    delete transactionToRestore.id;
                    delete transactionToRestore.createdAt;
                    try {
                      await onRestore(transactionToRestore);
                      toast.success('Restaurado');
                    } catch {
                      isRestoring = false; // permitir reintento si falló
                      toast.error('No se pudo restaurar');
                    }
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

    // Detail (read-only expand) state
    expandedTransaction,
    toggleExpand,

    // Actions
    handleDeleteTransaction,
    clearFilters,
    getRecurringPaymentName,
    getAccountForTransaction,
  };
};
