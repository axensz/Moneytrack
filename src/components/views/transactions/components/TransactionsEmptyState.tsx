'use client';

import React from 'react';
import { Activity, Search, FilterX } from 'lucide-react';

interface TransactionsEmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

/**
 * Estado vacío para la lista de transacciones
 */
export const TransactionsEmptyState: React.FC<TransactionsEmptyStateProps> = ({
  hasFilters,
  onClearFilters,
}) => {
  if (hasFilters) {
    // Filtros activos pero sin resultados
    return (
      <div className="text-center py-12">
        <div className="animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-purple-50 dark:bg-gray-800 p-4 rounded-full inline-block mb-4">
            <Search size={32} className="text-purple-300 dark:text-gray-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No se encontraron transacciones
          </h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-6 text-sm">
            No hay movimientos que coincidan con los filtros de cuenta o categoría
            seleccionados.
          </p>
          <button
            onClick={onClearFilters}
            className="btn-secondary inline-flex"
          >
            <FilterX size={16} />
            Limpiar filtros
          </button>
        </div>
      </div>
    );
  }

  // Sin transacciones (estado absoluto)
  return (
    <div className="text-center py-12">
      <div className="text-gray-400 dark:text-gray-500">
        <Activity size={48} className="mx-auto mb-3 opacity-30" />
        <p>No tienes transacciones registradas aún</p>
      </div>
    </div>
  );
};
