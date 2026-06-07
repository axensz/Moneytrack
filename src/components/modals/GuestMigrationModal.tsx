'use client';

/**
 * GuestMigrationModal (S1) — Ofrece importar a la cuenta los datos creados en
 * modo invitado. No se puede cerrar accidentalmente (sin backdrop ni botón X):
 * el usuario debe elegir "Importar" o "Ahora no".
 */

import React from 'react';
import { UploadCloud, AlertTriangle, Loader2 } from 'lucide-react';
import { BaseModal } from './BaseModal';
import type { GuestDataCounts } from '../../utils/guestMigration';

interface GuestMigrationModalProps {
  isOpen: boolean;
  counts: GuestDataCounts | null;
  isMigrating: boolean;
  hasError: boolean;
  onImport: () => void;
  onDismiss: () => void;
}

const COUNT_LABELS: { key: keyof GuestDataCounts; singular: string; plural: string }[] = [
  { key: 'accounts', singular: 'cuenta', plural: 'cuentas' },
  { key: 'transactions', singular: 'transacción', plural: 'transacciones' },
  { key: 'recurringPayments', singular: 'pago periódico', plural: 'pagos periódicos' },
  { key: 'debts', singular: 'préstamo', plural: 'préstamos' },
  { key: 'budgets', singular: 'presupuesto', plural: 'presupuestos' },
  { key: 'savingsGoals', singular: 'meta de ahorro', plural: 'metas de ahorro' },
];

export const GuestMigrationModal: React.FC<GuestMigrationModalProps> = ({
  isOpen,
  counts,
  isMigrating,
  hasError,
  onImport,
  onDismiss,
}) => {
  const items = counts
    ? COUNT_LABELS.filter(({ key }) => (counts[key] as number) > 0).map(({ key, singular, plural }) => {
        const value = counts[key] as number;
        return `${value} ${value === 1 ? singular : plural}`;
      })
    : [];

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onDismiss}
      closeOnBackdrop={false}
      showCloseButton={false}
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-full bg-purple-100 dark:bg-purple-900/30">
          <UploadCloud size={32} className="text-purple-600 dark:text-purple-400" />
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-3">
          Importar tus datos a la cuenta
        </h2>

        <p className="text-center text-gray-600 dark:text-gray-400 mb-5">
          Detectamos datos que creaste sin iniciar sesión. ¿Quieres copiarlos a tu
          cuenta para tenerlos sincronizados en todos tus dispositivos?
        </p>

        {items.length > 0 && (
          <ul className="space-y-1.5 mb-5 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
            {items.map((label) => (
              <li
                key={label}
                className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 dark:bg-purple-400" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        )}

        {hasError && (
          <div
            role="alert"
            className="flex items-start gap-2 mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          >
            <AlertTriangle size={18} className="text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              No se pudieron importar los datos. Tus datos locales siguen intactos;
              puedes reintentar.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onImport}
            disabled={isMigrating}
            className="flex-1 btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isMigrating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Importando…
              </>
            ) : (
              <>
                <UploadCloud size={18} />
                {hasError ? 'Reintentar' : 'Importar mis datos'}
              </>
            )}
          </button>
          <button
            onClick={onDismiss}
            disabled={isMigrating}
            className="flex-1 btn-cancel disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Ahora no
          </button>
        </div>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
          Si eliges «Ahora no», te lo preguntaremos de nuevo la próxima vez. Tus datos
          locales se borran de este navegador al cerrar sesión.
        </p>
      </div>
    </BaseModal>
  );
};
