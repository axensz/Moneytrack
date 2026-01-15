'use client';

import React from 'react';
import { Activity } from 'lucide-react';

/**
 * Mensaje cuando no hay cuentas creadas
 */
export const NoAccountsMessage: React.FC = () => (
  <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
    <div className="flex items-start gap-3">
      <div className="p-2 bg-amber-200 dark:bg-amber-800 rounded-lg">
        <Activity size={20} className="text-amber-700 dark:text-amber-300" />
      </div>
      <div>
        <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
          No tienes cuentas creadas
        </h3>
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Para crear transacciones, primero debes agregar una cuenta en la sección de{' '}
          <strong>Cuentas</strong>.
        </p>
      </div>
    </div>
  </div>
);
