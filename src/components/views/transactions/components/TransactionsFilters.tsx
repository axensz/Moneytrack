'use client';

import React, { useState } from 'react';
import { Download, FilterX, PlusCircle, Search, Tag, Upload, Wallet, X } from 'lucide-react';
import type { Account, DateRangePreset, FilterValue } from '../../../../types/finance';
import { CREDIT_PAYMENT_CATEGORY, TRANSFER_CATEGORY, BALANCE_ADJUSTMENT_CATEGORY } from '../../../../config/constants';
import { DateFilterDropdown } from './DateFilterDropdown';
import { FilterDropdown } from './FilterDropdown';

const SPECIAL_FILTER_CATEGORIES = [TRANSFER_CATEGORY, CREDIT_PAYMENT_CATEGORY, BALANCE_ADJUSTMENT_CATEGORY];

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
  onImport?: () => void;
  onExport?: () => void;
  exportDisabled?: boolean;
  dateRangePreset: DateRangePreset;
  setDateRangePreset: (preset: DateRangePreset) => void;
  customStartDate: string;
  setCustomStartDate: (date: string) => void;
  customEndDate: string;
  setCustomEndDate: (date: string) => void;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

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
  onImport,
  onExport,
  exportDisabled = false,
}) => {
  const [activeDropdown, setActiveDropdown] = useState<'none' | 'account' | 'category'>('none');
  const isDisabled = accounts.length === 0;

  const handleOpenAccount = () => {
    setActiveDropdown(activeDropdown === 'account' ? 'none' : 'account');
    setShowDatePicker(false);
  };

  const handleOpenCategory = () => {
    setActiveDropdown(activeDropdown === 'category' ? 'none' : 'category');
    setShowDatePicker(false);
  };

  const handleOpenDate = (show: boolean) => {
    setShowDatePicker(show);
    if (show) setActiveDropdown('none');
  };

  const handleClearFilters = () => {
    onClearFilters();
    setActiveDropdown('none');
    setShowDatePicker(false);
  };

  return (
    <div className="mb-5 relative space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            disabled={isDisabled}
            className={`btn-primary flex-1 sm:flex-none ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isDisabled ? 'Crea una cuenta primero' : 'Crear transaccion'}
            aria-label="Crear nueva transaccion"
          >
            <PlusCircle size={18} aria-hidden="true" />
            Nueva
          </button>

          {onImport && (
            <button
              onClick={onImport}
              disabled={isDisabled}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded-lg transition-colors min-h-[44px] ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title="Importar desde extracto bancario"
              aria-label="Importar transacciones"
            >
              <Upload size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Importar</span>
            </button>
          )}

          {onExport && (
            <button
              onClick={onExport}
              disabled={exportDisabled}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors min-h-[44px] ${exportDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              title={exportDisabled ? 'No hay transacciones para exportar' : 'Exportar a CSV las transacciones filtradas'}
              aria-label="Exportar transacciones a CSV"
            >
              <Download size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
          )}
        </div>

        <div className="relative flex-1 min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar descripcion, cuenta, categoria o monto"
            className="w-full pl-9 pr-9 py-2.5 min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400 text-sm"
            aria-label="Buscar transacciones por descripcion, cuenta, categoria o monto"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Limpiar busqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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

        <FilterDropdown
          label="Categoria"
          value={filterCategory}
          options={[...new Set([...categories.expense, ...categories.income, ...SPECIAL_FILTER_CATEGORIES])].map((cat) => ({
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

        {isMetadataFiltersActive && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors min-h-[44px]"
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
