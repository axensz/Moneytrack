'use client';

import React from 'react';
import { Activity, ChevronDown, Loader2 } from 'lucide-react';
import { ACTION_ICONS, UI_TEXT } from '../../../../config/ui';

const ClearIcon = ACTION_ICONS.clear;
const NewIcon = ACTION_ICONS.new;
const SearchIcon = ACTION_ICONS.search;

interface TransactionsEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
  hasMoreTransactions?: boolean;
  loadingMoreTransactions?: boolean;
  onLoadMore?: () => Promise<void>;
  onAddTransaction?: () => void;
}

export const TransactionsEmptyState: React.FC<TransactionsEmptyStateProps> = ({
  hasFilters,
  onClearFilters,
  hasMoreTransactions = false,
  loadingMoreTransactions = false,
  onLoadMore,
  onAddTransaction,
}) => {
  if (hasFilters) {
    return (
      <div className="text-center py-12">
        <div className="animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-purple-50 dark:bg-gray-800 p-4 rounded-full inline-block mb-4">
            <SearchIcon size={32} className="text-purple-300 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No se encontraron transacciones
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6 text-sm">
            No hay movimientos que coincidan con los filtros actuales. Si buscas algo antiguo, carga más historial.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
            {hasMoreTransactions && onLoadMore && (
              <button
                onClick={onLoadMore}
                disabled={loadingMoreTransactions}
                className="btn-secondary inline-flex disabled:opacity-50"
              >
                {loadingMoreTransactions ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ChevronDown size={16} />
                )}
                {loadingMoreTransactions ? UI_TEXT.states.loading : 'Cargar antiguas'}
              </button>
            )}
            <button onClick={onClearFilters} className="btn-cancel inline-flex gap-2">
              <ClearIcon size={16} />
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-center py-12">
      <div className="text-gray-400 dark:text-gray-500">
        <Activity size={48} className="mx-auto mb-3 opacity-30" />
        <p>No tienes transacciones registradas aún</p>
      </div>
      {onAddTransaction && (
        <button onClick={onAddTransaction} className="btn-primary mt-4 inline-flex">
          <NewIcon size={18} />
          Registrar transacción
        </button>
      )}
    </div>
  );
};
