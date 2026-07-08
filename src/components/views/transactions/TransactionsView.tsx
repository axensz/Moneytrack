'use client';

import React, { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, X } from 'lucide-react';
import type {
  Transaction,
  FilterValue,
  DateRangePreset,
} from '../../../types/finance';
import { useTransactionDomain, useAccountDomain, useBeneficiaryDomain, useCategoryDomain, useRecurringDomain, useFormatCurrency } from '../../../hooks/useFinanceSelectors';

/**
 * S5: Carga perezosa del modal de importación.
 * ImportTransactionsModal arrastra @google/genai (~400KB) y xlsx (~200KB).
 * Con lazy + Suspense solo se descarga el chunk cuando el usuario abre el modal,
 * mostrando feedback inmediato mientras baja el importador real.
 */
const ImportTransactionsModal = lazy(
  () => import('../../modals/ImportTransactionsModal').then((m) => ({ default: m.ImportTransactionsModal })),
);
import { DATE_PRESETS } from '../../../utils/dateUtils';

// Componentes
import { NoAccountsMessage } from './components/NoAccountsMessage';
import { TransactionsFilters } from './components/TransactionsFilters';
import { TransactionsEmptyState } from './components/TransactionsEmptyState';
import { TransactionsListSkeleton } from './components/TransactionsListSkeleton';
import { TransactionsList } from './components/TransactionsList';

// Hook
import { useTransactionsView } from './hooks/useTransactionsView';
import { useCSVExport } from '../../../hooks/useCSVExport';

const ImportTransactionsLoading = ({ onClose }: { onClose: () => void }) => (
  <div
    className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    aria-label="Preparando importador"
    aria-busy="true"
  >
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden sm:my-auto">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700 bg-muted">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">
            Preparando importador
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cargando herramientas de importación
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/70 dark:hover:bg-gray-700 rounded-xl transition-colors"
          aria-label="Cerrar importador"
        >
          <X size={18} className="text-muted-foreground" />
        </button>
      </div>
      <div className="px-4 sm:px-6 py-8 flex items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
        <span>Abriendo importación...</span>
      </div>
    </div>
  </div>
);

interface TransactionsViewProps {
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  filterCategory: FilterValue;
  setFilterCategory: (filter: FilterValue) => void;
  filterAccount: FilterValue;
  setFilterAccount: (filter: FilterValue) => void;
  dateRangePreset: DateRangePreset;
  setDateRangePreset: (preset: DateRangePreset) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  loading?: boolean;
  onRestore?: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Promise<void>;
  onGoToAccounts?: () => void;
  onOpenAISettings?: () => void;
}

/**
 * Vista principal de transacciones
 * Muestra lista filtrable con edición inline y eliminación con undo
 */
export const TransactionsView: React.FC<TransactionsViewProps> = ({
  showForm,
  setShowForm,
  filterCategory,
  setFilterCategory,
  filterAccount,
  setFilterAccount,
  dateRangePreset,
  setDateRangePreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  loading = false,
  onRestore,
  onGoToAccounts,
  onOpenAISettings,
}) => {
  const {
    transactions,
    deleteTransaction,
    updateTransaction,
    hasMoreTransactions,
    loadingMoreTransactions,
    loadMoreTransactions,
    balanceTransactions,
  } = useTransactionDomain();
  const { accounts, balancesReady } = useAccountDomain();
  const { recurringPayments } = useRecurringDomain();
  const { categories } = useCategoryDomain();
  const { beneficiaries } = useBeneficiaryDomain();
  const formatCurrency = useFormatCurrency();
  const {
    filteredTransactions,
    isMetadataFiltersActive,
    showDatePicker,
    setShowDatePicker,
    searchQuery, // 🆕 Búsqueda
    setSearchQuery, // 🆕 Búsqueda
    editingTransaction,
    editForm,
    setEditForm,
    startEditTransaction,
    handleSaveEdit,
    handleCancelEdit,
    expandedTransaction,
    toggleExpand,
    handleDeleteTransaction,
    clearFilters,
    getRecurringPaymentName,
    getAccountForTransaction,
  } = useTransactionsView({
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
  });

  const { exportTransactionsCSV } = useCSVExport();

  const [showImport, setShowImport] = useState(false);
  const handleOpenImport = () => {
    setShowImport(true);
  };

  // P2: "Cargar más" puede fallar (red/IndexedDB). Sin canal de error propio en
  // la capa de datos, envolvemos la llamada para no dejar un spinner perpetuo:
  // mostramos un toast y un bloque de reintento accesible en la lista. No toca
  // lógica de dominio; solo el feedback de la vista.
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const handleLoadMore = useCallback(async () => {
    if (!loadMoreTransactions) return;
    setLoadMoreError(null);
    try {
      await loadMoreTransactions();
    } catch {
      const message = 'No se pudieron cargar más transacciones. Revisa tu conexión e intenta de nuevo.';
      setLoadMoreError(message);
      toast.error(message);
    }
  }, [loadMoreTransactions]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === filterAccount),
    [accounts, filterAccount]
  );
  const activeFilterSummary = useMemo(() => {
    const filters: string[] = [];
    const dateLabel =
      dateRangePreset === 'custom'
        ? [customStartDate || 'inicio', customEndDate || 'hoy'].join(' - ')
        : DATE_PRESETS.find((preset) => preset.value === dateRangePreset)?.label;

    if (dateLabel) filters.push(dateLabel);
    if (selectedAccount) filters.push(selectedAccount.name);
    if (filterCategory !== 'all') filters.push(filterCategory);
    if (searchQuery.trim()) filters.push(`"${searchQuery.trim()}"`);

    return filters.join(' - ');
  }, [customEndDate, customStartDate, dateRangePreset, filterCategory, searchQuery, selectedAccount]);

  const handleClearFilters = () => {
    clearFilters(setFilterAccount, setFilterCategory);
  };

  return (
    <div className="card">
      {/* S5: El modal (y sus ~600KB de deps) solo se carga tras el primer click en Importar */}
      {showImport && (
        <Suspense fallback={<ImportTransactionsLoading onClose={() => setShowImport(false)} />}>
          <ImportTransactionsModal isOpen={showImport} onClose={() => setShowImport(false)} onOpenAISettings={onOpenAISettings} />
        </Suspense>
      )}
      {/* Mensaje de ayuda cuando no hay cuentas */}
      {accounts.length === 0 && <NoAccountsMessage onCreateAccount={onGoToAccounts} />}

      {/* Header con filtros */}
      <TransactionsFilters
        accounts={accounts}
        categories={categories}
        filterAccount={filterAccount}
        setFilterAccount={setFilterAccount}
        filterCategory={filterCategory}
        setFilterCategory={setFilterCategory}
        isMetadataFiltersActive={isMetadataFiltersActive}
        onClearFilters={handleClearFilters}
        showForm={showForm}
        setShowForm={setShowForm}
        onImport={handleOpenImport}
        onExport={() => exportTransactionsCSV(filteredTransactions, accounts)}
        exportDisabled={filteredTransactions.length === 0}
        dateRangePreset={dateRangePreset}
        setDateRangePreset={setDateRangePreset}
        customStartDate={customStartDate}
        setCustomStartDate={setCustomStartDate}
        customEndDate={customEndDate}
        setCustomEndDate={setCustomEndDate}
        showDatePicker={showDatePicker}
        setShowDatePicker={setShowDatePicker}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Título con contador */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            Transacciones
            <span className="text-xs font-medium text-[var(--balance-accent-foreground)] bg-[var(--balance-accent)] px-2 py-0.5 rounded-full">
              {filteredTransactions.length}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activeFilterSummary || 'Todo el tiempo'} · {transactions.length} cargadas
          </p>
        </div>
      </div>

      {/* Contenido principal */}
      {loading ? (
        <TransactionsListSkeleton />
      ) : filteredTransactions.length === 0 ? (
        <TransactionsEmptyState
          hasFilters={isMetadataFiltersActive}
          onClearFilters={handleClearFilters}
          hasMoreTransactions={hasMoreTransactions}
          loadingMoreTransactions={loadingMoreTransactions}
          onLoadMore={handleLoadMore}
          onAddTransaction={accounts.length > 0 ? () => setShowForm(true) : undefined}
        />
      ) : (
        <TransactionsList
          transactions={filteredTransactions}
          editingTransaction={editingTransaction}
          editForm={editForm}
          expandedTransaction={expandedTransaction}
          toggleExpand={toggleExpand}
          categories={categories}
          beneficiaries={beneficiaries}
          formatCurrency={formatCurrency}
          getAccountForTransaction={getAccountForTransaction}
          getRecurringPaymentName={getRecurringPaymentName}
          startEditTransaction={startEditTransaction}
          handleDeleteTransaction={handleDeleteTransaction}
          handleSaveEdit={handleSaveEdit}
          handleCancelEdit={handleCancelEdit}
          setEditForm={setEditForm}
          hasMoreTransactions={hasMoreTransactions}
          loadingMoreTransactions={loadingMoreTransactions}
          loadMoreTransactions={handleLoadMore}
          hasActiveFilters={isMetadataFiltersActive}
          error={loadMoreError}
          onRetry={handleLoadMore}
        />
      )}
    </div>
  );
};
