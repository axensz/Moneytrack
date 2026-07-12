'use client';

import React from 'react';
import { ShimmerSkeleton } from '@/components/unlumen-ui/shimmer-skeleton';

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
          className="border rounded-xl p-3.5 sm:p-4 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm"
          aria-hidden="true"
        >
          <div className="flex items-start gap-3">
            {/* Ícono guía — mismas dimensiones que el ícono de TransactionItem */}
            <ShimmerSkeleton className="h-10 w-10 shrink-0" rounded="lg" />

            {/* Contenido */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2">
                  <ShimmerSkeleton className="h-4 w-32" />
                  <ShimmerSkeleton className="h-3 w-24 opacity-70" />
                </div>
                <ShimmerSkeleton className="h-5 w-20 shrink-0" />
              </div>

              {/* Fila de info (chips + fecha) */}
              <div className="flex items-center gap-1.5 mt-2">
                <ShimmerSkeleton className="h-4 w-16 opacity-70" />
                <ShimmerSkeleton className="h-3 w-20 opacity-70" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
