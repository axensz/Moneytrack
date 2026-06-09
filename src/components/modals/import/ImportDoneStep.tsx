'use client';

import React from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface ImportResultLike {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Paso 3 del wizard: confirmación de importación (éxito o error). */
export function ImportDoneStep({ result }: { result: ImportResultLike }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-4">
      {result.errors.length === 0 ? (
        <>
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle size={32} className="text-green-600 dark:text-green-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {result.imported} transacciones importadas
            </p>
            {result.skipped > 0 && (
              <p className="text-sm text-gray-500 mt-1">{result.skipped} excluidas manualmente</p>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
            <AlertCircle size={32} className="text-red-600 dark:text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">Error al importar</p>
            <p className="text-sm text-gray-500 mt-1">{result.errors[0]}</p>
            {result.imported > 0 && (
              <p className="text-sm text-green-600 mt-1">{result.imported} transacciones guardadas antes del error</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
