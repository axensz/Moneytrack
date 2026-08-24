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
  TransactionBeneficiary,
} from '../../../../types/finance';
import { parseDateFromInput, parseDateWithTime, parseCurrency, roundMoney } from '../../../../utils/formatters';
import { getDateRangeFromPreset, ensureDate } from '../../../../utils/dateUtils';
import { findAccountForTransaction, transactionUsesAccount } from '../../../../utils/accountTransactions';
import { TransactionValidator } from '../../../../utils/validators';
import { calculateInterest } from '../../../../utils/interestCalculator';
import { showToast } from '../../../../utils/toastHelpers';
import { logger } from '../../../../utils/logger';
import { SUCCESS_MESSAGES } from '../../../../config/constants';
import {
  balanceReadinessBlock,
  isBalanceSensitiveEdit,
} from '../../../../utils/ledgerReadiness';
import { getTransactionRestorePolicy } from '../../../../utils/transactionRestorePolicy';

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
  deleteTransaction: (id: string) => Promise<Transaction | null | void>;
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
  onRestore?: (transaction: Transaction) => Promise<void>;
  /** Historial completo para validar saldo/cupo (nunca la ventana paginada). */
  balanceTransactions: Transaction[];
  /** false mientras el historial completo asienta: se omite la validación. */
  balancesReady: boolean;
}

type TransactionEditUpdates = {
  [K in keyof Transaction]?: Transaction[K] | null;
} & Record<string, unknown>;

interface TransactionViewFilterOptions {
  accounts: Account[];
  recurringPayments: RecurringPayment[];
  filterCategory: FilterValue;
  filterAccount: FilterValue;
  searchQuery: string;
  dateRangePreset: DateRangePreset;
  customStartDate: string;
  customEndDate: string;
}

/**
 * Pure equivalent of the view filter, used to apply the visible criteria to
 * the full transaction history during export.
 */
export function filterTransactionsForView(
  transactions: Transaction[],
  {
    accounts,
    recurringPayments,
    filterCategory,
    filterAccount,
    searchQuery,
    dateRangePreset,
    customStartDate,
    customEndDate,
  }: TransactionViewFilterOptions
): Transaction[] {
  const selectedAccount =
    filterAccount === 'all' ? null : accounts.find((account) => account.id === filterAccount);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const recurringPaymentsById = new Map(
    recurringPayments.map((payment) => [payment.id, payment])
  );
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('es-CO');

  return transactions.filter((transaction) => {
    if (filterCategory !== 'all' && transaction.category !== filterCategory) return false;

    if (filterAccount !== 'all') {
      if (!selectedAccount || !transactionUsesAccount(transaction, selectedAccount)) return false;
    }

    if (normalizedQuery) {
      const sourceAccount = accountsById.get(transaction.accountId);
      const destinationAccount = transaction.toAccountId
        ? accountsById.get(transaction.toAccountId)
        : null;
      const recurringPayment = transaction.recurringPaymentId
        ? recurringPaymentsById.get(transaction.recurringPaymentId)
        : null;
      const typeLabel =
        transaction.type === 'income'
          ? 'ingreso'
          : transaction.type === 'expense'
            ? 'gasto'
            : 'transferencia';
      const searchableText = [
        transaction.description,
        transaction.category,
        transaction.beneficiary,
        typeLabel,
        sourceAccount?.name,
        destinationAccount?.name,
        recurringPayment?.name,
        transaction.amount.toString(),
        transaction.amount.toLocaleString('es-CO'),
        new Date(transaction.date).toLocaleDateString('es-CO'),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-CO');

      if (!searchableText.includes(normalizedQuery)) return false;
    }

    if (dateRangePreset !== 'all') {
      const transactionDate = new Date(transaction.date);

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
}

const nullDerivedForeignCurrencyFields: TransactionEditUpdates = {
  currency: null,
  originalAmount: null,
  originalCurrency: null,
  exchangeRate: null,
};

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
    beneficiary: '' as TransactionBeneficiary,
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

  const applyCurrentFilters = useCallback(
    (sourceTransactions: Transaction[]) =>
      filterTransactionsForView(sourceTransactions, {
        accounts,
        recurringPayments,
        filterCategory,
        filterAccount,
        searchQuery,
        dateRangePreset,
        customStartDate,
        customEndDate,
      }),
    [
      accounts,
      recurringPayments,
      filterCategory,
      filterAccount,
      searchQuery,
      dateRangePreset,
      customStartDate,
      customEndDate,
    ]
  );
  const filteredTransactions = useMemo(
    () => applyCurrentFilters(transactions),
    [applyCurrentFilters, transactions]
  );
  const filteredBalanceTransactions = useMemo(
    () => applyCurrentFilters(balanceTransactions),
    [applyCurrentFilters, balanceTransactions]
  );

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
      beneficiary: transaction.beneficiary || '',
    });
  }, []);

  const handleSaveEdit = useCallback(
    async (id: string) => {
      // El input entrega formato es-CO ("88.888" o "88.888,5"); parseCurrency
      // maneja la coma decimal sin perder centavos (parseFloat la truncaría).
      const amount = parseCurrency(editForm.amount);
      const original = transactions.find((t) => t.id === id);
      const account = original ? accountsById.get(original.accountId) : undefined;
      const readinessError = original && balanceReadinessBlock(
        balancesReady,
        isBalanceSensitiveEdit(original, amount, account),
      );
      if (readinessError) {
        showToast.error(readinessError);
        return;
      }
      const amountChanged = original
        ? roundMoney(amount) !== roundMoney(original.amount)
        : false;
      const recalculatedInterest = original?.type === 'expense' &&
        original.installments && original.installments > 1 && amount > 0
        ? calculateInterest(
            amount,
            original.interestRate ?? account?.interestRate ?? 0,
            original.installments,
            !!original.hasInterest
          )
        : null;
      const validationAmount = roundMoney(
        amount + (recalculatedInterest?.totalInterestAmount ?? original?.totalInterestAmount ?? 0)
      );

      // Validación unificada con el alta (#10): el MISMO TransactionValidator
      // valida monto/categoría y saldo/cupo. `original` excluye la tx editada del
      // cálculo (evita falsos rechazos por doble conteo) y cubre TODOS los tipos,
      // incluido el pago de TC (income) que antes se omitía y permitía sobrepagar
      // borrando deuda (#2). El saldo/cupo se omite mientras el historial no
      // asienta (balancesReady=false) pasando transactions=undefined.
      const validation = TransactionValidator.validate(
        {
          type: original?.type ?? 'expense',
          amount: validationAmount.toString(),
          category: original?.linkedTransactionId ? original.category : editForm.category,
          description: editForm.description,
          accountId: original?.accountId ?? '',
          toAccountId: original?.toAccountId ?? '',
          beneficiary: editForm.beneficiary.trim() || undefined,
        } as NewTransaction,
        account,
        balancesReady ? balanceTransactions : undefined,
        original
      );
      if (!validation.isValid) {
        validation.errors.forEach((error) => showToast.error(error));
        return;
      }

      // Un pago de TC mueve dos cuentas. Editar cualquiera de las mitades debe
      // seguir siendo válido para la contraparte que se sincronizará.
      const counterpart = original?.linkedTransactionId
        ? balanceTransactions.find(transaction => transaction.id === original.linkedTransactionId)
        : undefined;
      if (counterpart) {
        const counterpartValidation = TransactionValidator.validate(
          {
            type: counterpart.type,
            amount: amount.toString(),
            category: counterpart.category,
            description: counterpart.description,
            accountId: counterpart.accountId,
            toAccountId: counterpart.toAccountId ?? '',
            beneficiary: editForm.beneficiary.trim() || undefined,
          } as NewTransaction,
          accountsById.get(counterpart.accountId),
          balancesReady ? balanceTransactions : undefined,
          counterpart
        );
        if (!counterpartValidation.isValid) {
          counterpartValidation.errors.forEach((error) => showToast.error(error));
          return;
        }
      }

      try {
        const updates: TransactionEditUpdates = {
          description: editForm.description.trim(),
          amount,
          // Mantiene la hora original de la transacción; el input solo cambia el día.
          date: original
            ? parseDateWithTime(editForm.date, ensureDate(original.date))
            : parseDateWithTime(editForm.date),
          category: original?.linkedTransactionId ? original.category : editForm.category,
          beneficiary: editForm.beneficiary.trim() || null,
        };

        if (original && amountChanged) {
          if (original.originalCurrency || original.originalAmount || original.exchangeRate) {
            Object.assign(updates, nullDerivedForeignCurrencyFields);
          }

          if (recalculatedInterest) {
            const annualRate = original.interestRate ?? account?.interestRate ?? 0;
            updates.hasInterest = !!original.hasInterest;
            updates.installments = original.installments;
            updates.monthlyInstallmentAmount = recalculatedInterest.monthlyInstallmentAmount;
            updates.totalInterestAmount = recalculatedInterest.totalInterestAmount;
            updates.interestRate = annualRate;
          }
        }

        await updateTransaction(id, updates as Partial<Transaction>);

        setEditingTransaction(null);
        setEditForm({ description: '', amount: '', date: '', category: '', beneficiary: '' });
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
    setEditForm({ description: '', amount: '', date: '', category: '', beneficiary: '' });
  }, []);

  const handleDeleteTransaction = useCallback(
    async (transaction: Transaction) => {
      const toastId = toast.loading('Eliminando...');

      try {
        const deletedTransaction = await deleteTransaction(transaction.id!);
        const restorePolicy = deletedTransaction
          ? getTransactionRestorePolicy(deletedTransaction, accounts)
          : {
              allowed: false as const,
              kind: 'unsupported' as const,
              reason: 'No se puede deshacer porque el movimiento ya había cambiado o no existe.',
            };
        let restorableSnapshot: Transaction | null = null;
        if (deletedTransaction && restorePolicy.allowed) {
          restorableSnapshot = deletedTransaction;
        }

        // Guard anti doble-clic en "Deshacer": el handler es async y sin esto un
        // segundo clic re-crea la transacción (duplicado). Flag por-toast. (#tx-4)
        let isRestoring = false;
        toast.success(
          (t) => (
            <div className="flex items-start gap-2">
              <span>
                {restorePolicy.allowed
                  ? 'Eliminado'
                  : `Eliminado. ${restorePolicy.reason}`}
              </span>
              {onRestore && restorableSnapshot && (
                <button
                  onClick={async () => {
                    if (isRestoring) return;
                    isRestoring = true;
                    toast.dismiss(t.id);
                    try {
                      await onRestore(restorableSnapshot);
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
    [accounts, deleteTransaction, onRestore]
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
    filteredBalanceTransactions,
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
