'use client';

import React, { useState } from 'react';
import { PlusCircle, FilterX, Wallet, Tag, Search, X } from 'lucide-react';
import type { Account, FilterValue } from '../../../../types/finance';
import { DateFilterDropdown } from './DateFilterDropdown';
import { FilterDropdown } from './FilterDropdown';

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
  // 🆕 Search filter
  searchQuery: string;
  setSearchQuery: (query: string) => void;
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
  searchQuery,
  setSearchQuery,
}) => {
  const [activeDropdown, setActiveDropdown] = useState<'none' | 'account' | 'category'>('none');

  const handleOpenAccount = () => {
    if (activeDropdown === 'account') {
      setActiveDropdown('none');
    } else {
      setActiveDropdown('account');
      setShowDatePicker(false);
    }
  };

  const handleOpenCategory = () => {
    if (activeDropdown === 'category') {
      setActiveDropdown('none');
    } else {
      setActiveDropdown('category');
      setShowDatePicker(false);
    }
  };

  const handleOpenDate = (show: boolean) => {
    setShowDatePicker(show);
    if (show) setActiveDropdown('none');
  };

  return (
    <div className="mb-6 relative">
      {/* Una sola fila: Nueva, búsqueda, filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowForm(!showForm)}
          disabled={accounts.length === 0}
          className={`btn-primary flex-shrink-0 ${accounts.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          title={accounts.length === 0 ? 'Crea una cuenta primero' : 'Crear transacción'}
          aria-label="Crear nueva transacción"
        >
          <PlusCircle size={18} aria-hidden="true" />
          <span className="hidden xs:inline">Nueva</span>
          <span className="xs:hidden">Nueva</span>
        </button>

        {/* Barra de búsqueda */}
        <div className="relative flex-1 min-w-[120px] max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar..."
            className="w-full pl-9 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-sm"
            aria-label="Buscar transacciones por descripción"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Separador visual */}
        <div className="hidden sm:block w-px h-6 bg-gray-300 dark:bg-gray-600 ml-auto" />

        {/* Filtros inline */}
        <FilterDropdown
          label="Cuenta"
          value={filterAccount}
          options={accounts.filter((acc) => acc.id).map((acc) => ({ value: acc.id!, label: acc.name }))}
          onChange={setFilterAccount}
          isOpen={activeDropdown === 'account'}
          onToggle={handleOpenAccount}
          onClose={() => setActiveDropdown('none')}
          icon={<Wallet size={16} />}
          align="left"
        />

        {/* Filtro de categoría */}
        <FilterDropdown
          label="Categoría"
          value={filterCategory}
          options={[...new Set([...categories.expense, ...categories.income])].map((cat) => ({
            value: cat,
            label: cat,
          }))}
          onChange={setFilterCategory}
          isOpen={activeDropdown === 'category'}
          onToggle={handleOpenCategory}
          onClose={() => setActiveDropdown('none')}
          icon={<Tag size={16} />}
          align="left"
        />

        {/* Filtro de fecha */}
        <DateFilterDropdown
          dateRangePreset={dateRangePreset}
          setDateRangePreset={setDateRangePreset}
          customStartDate={customStartDate}
          setCustomStartDate={setCustomStartDate}
          customEndDate={customEndDate}
          setCustomEndDate={setCustomEndDate}
          showDatePicker={showDatePicker}
          setShowDatePicker={handleOpenDate}
        />

        {/* Botón limpiar filtros */}
        {isMetadataFiltersActive && (
          <button
            onClick={() => {
              onClearFilters();
              setActiveDropdown('none');
              setShowDatePicker(false);
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            aria-label="Limpiar todos los filtros"
          >
            <FilterX size={16} aria-hidden="true" />
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
};
