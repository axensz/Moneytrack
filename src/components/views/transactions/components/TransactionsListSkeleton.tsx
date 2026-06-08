'use client';

import React from 'react';

/**
 * Skeleton de carga para la lista de transacciones.
 *
 * La forma (rounded-xl, padding p-3.5 sm:p-4, ícono guía de 10x10 y la
 * disposición ícono + contenido) replica la de `TransactionItem` para que el
 * intercambio skeleton -> contenido real no provoque layout shift (CLS).
 */
export const TransactionsListSkeleton: React.FC = () => {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border rounded-xl p-3.5 sm:p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm animate-pulse"
        >
          <div className="flex items-start gap-3">
            {/* Ícono guía — mismas dimensiones que el ícono de TransactionItem */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700" />

            {/* Contenido */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="h-3 w-24 bg-gray-100 dark:bg-gray-700 rounded" />
                </div>
                <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded shrink-0" />
              </div>

              {/* Fila de info (chips + fecha) */}
              <div className="flex items-center gap-1.5 mt-2">
                <div className="h-4 w-16 bg-gray-100 dark:bg-gray-700 rounded" />
                <div className="h-3 w-20 bg-gray-100 dark:bg-gray-700 rounded" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
