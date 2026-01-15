'use client';

import React from 'react';
import { PlusCircle, FilterX } from 'lucide-react';
import type { Account, FilterValue } from '../../../../types/finance';
import { DateFilterDropdown } from './DateFilterDropdown';

interface TransactionsFiltersProps {
  accounts: Account[];
  categories: {
    expense: string[];
    income: string[];
  };
  filterAccount: FilterValue;
  setFilterAccount: (v: FilterValue) => void;
  filterCategory: FilterValue;
  setFilterCategory: (v: FilterValue) => void;
  isMetadataFiltersActive: boolean;
  onClearFilters: () => void;
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  // Date filter props
  dateRangePreset: import('../../../../types/finance').DateRangePreset;
  setDateRangePreset: (preset: import('../../../../types/finance').DateRangePreset) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
}

/**
 * Barra de filtros para transacciones
 */
export const TransactionsFilters: React.FC<TransactionsFiltersProps> = ({
  accounts,
  categories,
  filterAccount,
  setFilterAccount,
  filterCategory,
  setFilterCategory,
  isMetadataFiltersActive,
  onClearFilters,
  showForm,
  setShowForm,
  dateRangePreset,
  setDateRangePreset,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  showDatePicker,
  setShowDatePicker,
}) => {
  return (
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
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
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
            <option key={`${cat}-${index}`} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        {/* Filtro de fecha */}
        <DateFilterDropdown
          dateRangePreset={dateRangePreset}
          setDateRangePreset={setDateRangePreset}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
          showDatePicker={showDatePicker}
          setShowDatePicker={setShowDatePicker}
        />

        {/* Botón limpiar filtros */}
        {isMetadataFiltersActive && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
          >
            <FilterX size={16} />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
};
