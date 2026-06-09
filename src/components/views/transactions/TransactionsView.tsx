'use client';

import React, { useMemo, useState } from 'react';
import type {
  Transaction,
  FilterValue,
  DateRangePreset,
} from '../../../types/finance';
import { useTransactionDomain, useAccountDomain, useCategoryDomain, useRecurringDomain, useFormatCurrency } from '../../../hooks/useFinanceSelectors';
import dynamic from 'next/dynamic';

/**
 * S5: Carga perezosa del modal de importación.
 * ImportTransactionsModal arrastra @google/genai (~400KB) y xlsx (~200KB).
 * Con dynamic + ssr:false solo se descarga el chunk cuando el usuario abre el modal.
 */
const ImportTransactionsModal = dynamic(
  () => import('../../modals/ImportTransactionsModal').then((m) => ({ default: m.ImportTransactionsModal })),
  { ssr: false, loading: () => null },
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
  } = useTransactionDomain();
  const { accounts } = useAccountDomain();
  const { recurringPayments } = useRecurringDomain();
  const { categories } = useCategoryDomain();
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
  });

  const { exportTransactionsCSV } = useCSVExport();

  const [showImport, setShowImport] = useState(false);
  // importEverOpened: monta el modal solo después del primer clic en "Importar".
  // Esto fuerza al browser a descargar el chunk solo cuando realmente se necesita.
  const [importEverOpened, setImportEverOpened] = useState(false);

  const handleOpenImport = () => {
    setImportEverOpened(true);
    setShowImport(true);
  };
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
      {importEverOpened && <ImportTransactionsModal isOpen={showImport} onClose={() => setShowImport(false)} onOpenAISettings={onOpenAISettings} />}
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
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            Transacciones
            <span className="text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-full">
              {filteredTransactions.length}
            </span>
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
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
          onLoadMore={loadMoreTransactions}
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
          loadMoreTransactions={loadMoreTransactions}
          hasActiveFilters={isMetadataFiltersActive}
        />
      )}
    </div>
  );
};
