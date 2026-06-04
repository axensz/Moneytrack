'use client';

import React, { useMemo, useState } from 'react';
import type {
  Transaction,
  FilterValue,
  DateRangePreset,
} from '../../../types/finance';
import { useFinance } from '../../../contexts/FinanceContext';
import { useUIPreferences } from '../../../contexts/UIPreferencesContext';
import { ImportTransactionsModal } from '../../modals/ImportTransactionsModal';
import { DATE_PRESETS } from '../../../utils/dateUtils';

// Componentes
import { NoAccountsMessage } from './components/NoAccountsMessage';
import { TransactionsFilters } from './components/TransactionsFilters';
import { TransactionsEmptyState } from './components/TransactionsEmptyState';
import { TransactionsListSkeleton } from './components/TransactionsListSkeleton';
import { TransactionsList } from './components/TransactionsList';

// Hook
import { useTransactionsView } from './hooks/useTransactionsView';

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
}) => {
  const {
    transactions,
    accounts,
    recurringPayments,
    categories,
    deleteTransaction,
    updateTransaction,
    formatCurrency,
    hasMoreTransactions,
    loadingMoreTransactions,
    loadMoreTransactions,
  } = useFinance();
  const { hideBalances } = useUIPreferences();
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

  const [showImport, setShowImport] = useState(false);
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
  const filteredSummary = useMemo(() => {
    return filteredTransactions.reduce(
      (summary, transaction) => {
        if (transaction.type === 'income') summary.income += transaction.amount;
        if (transaction.type === 'expense') summary.expense += transaction.amount;
        if (transaction.type === 'transfer') summary.transfers += 1;
        return summary;
      },
      { income: 0, expense: 0, transfers: 0 }
    );
  }, [filteredTransactions]);
  const displayCurrency = (amount: number) => hideBalances ? '******' : formatCurrency(amount);

  const handleClearFilters = () => {
    clearFilters(setFilterAccount, setFilterCategory);
  };

  return (
    <div className="card">
      <ImportTransactionsModal isOpen={showImport} onClose={() => setShowImport(false)} />
      {/* Mensaje de ayuda cuando no hay cuentas */}
      {accounts.length === 0 && <NoAccountsMessage />}

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
        onImport={() => setShowImport(true)}
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

      {filteredTransactions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-5">
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50 to-emerald-50/50 dark:from-emerald-900/20 dark:to-emerald-950/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Ingresos</p>
            <p className="text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-200 mt-0.5">{displayCurrency(filteredSummary.income)}</p>
          </div>
          <div className="rounded-xl border border-rose-100 dark:border-rose-800/40 bg-gradient-to-br from-rose-50 to-rose-50/50 dark:from-rose-900/20 dark:to-rose-950/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">Gastos</p>
            <p className="text-sm sm:text-base font-bold text-rose-700 dark:text-rose-200 mt-0.5">{displayCurrency(filteredSummary.expense)}</p>
          </div>
          <div className="rounded-xl border border-purple-100 dark:border-purple-800/40 bg-gradient-to-br from-purple-50 to-purple-50/50 dark:from-purple-900/20 dark:to-purple-950/10 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">Neto</p>
            <p className={`text-sm sm:text-base font-bold mt-0.5 ${filteredSummary.income - filteredSummary.expense >= 0 ? 'text-purple-700 dark:text-purple-200' : 'text-rose-700 dark:text-rose-200'}`}>
              {displayCurrency(filteredSummary.income - filteredSummary.expense)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-gray-50 to-gray-50/50 dark:from-gray-800/40 dark:to-gray-800/20 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Transferencias</p>
            <p className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-200 mt-0.5">{filteredSummary.transfers}</p>
          </div>
        </div>
      )}

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
        />
      ) : (
        <TransactionsList
          transactions={filteredTransactions}
          editingTransaction={editingTransaction}
          editForm={editForm}
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
