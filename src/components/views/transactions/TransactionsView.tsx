'use client';

import React from 'react';
import type {
  Transaction,
  Account,
  FilterValue,
  RecurringPayment,
} from '../../../types/finance';
import { useFinance } from '../../../contexts/FinanceContext';

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
  const {
    filteredTransactions,
    isMetadataFiltersActive,
    dateRangePreset,
    setDateRangePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
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
    deleteTransaction,
    updateTransaction,
    onRestore,
  });

  const handleClearFilters = () => {
    clearFilters(setFilterAccount, setFilterCategory);
  };

  return (
    <div className="card">
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
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          Transacciones{' '}
          <span className="text-sm font-normal text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {filteredTransactions.length}
          </span>
        </h3>
      </div>

      {/* Contenido principal */}
      {loading ? (
        <TransactionsListSkeleton />
      ) : filteredTransactions.length === 0 ? (
        <TransactionsEmptyState
          hasFilters={isMetadataFiltersActive}
          onClearFilters={handleClearFilters}
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
        />
      )}
    </div>
  );
};
