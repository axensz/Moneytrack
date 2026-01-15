'use client';

import React from 'react';

/**
 * Skeleton de carga para la lista de transacciones
 */
export const TransactionsListSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border rounded-lg p-4 bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-3 w-24 bg-gray-100 dark:bg-gray-800 rounded"></div>
            </div>
            <div className="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
};
