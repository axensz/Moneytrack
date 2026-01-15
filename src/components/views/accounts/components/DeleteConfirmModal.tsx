'use client';

import React from 'react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  accountName: string;
  transactionCount: number;
  deleteConfirmName: string;
  confirmDeleteWithTransactions: boolean;
  setDeleteConfirmName: (value: string) => void;
  setConfirmDeleteWithTransactions: (value: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Modal de confirmación para eliminar una cuenta
 * Requiere escribir el nombre de la cuenta para confirmar
 */
export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  accountName,
  transactionCount,
  deleteConfirmName,
  confirmDeleteWithTransactions,
  setDeleteConfirmName,
  setConfirmDeleteWithTransactions,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  const canDelete =
    deleteConfirmName.trim() === accountName &&
    (transactionCount === 0 || confirmDeleteWithTransactions);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-rose-600 dark:text-rose-400 mb-4">
            ⚠️ Eliminar Cuenta
          </h3>

          {transactionCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Esta cuenta tiene {transactionCount} transacción
                {transactionCount !== 1 ? 'es' : ''} asociada
                {transactionCount !== 1 ? 's' : ''}.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                Al eliminar la cuenta, todas las transacciones también serán eliminadas
                permanentemente.
              </p>
            </div>
          )}

          <p className="text-gray-600 dark:text-gray-300 mb-2">
            Para confirmar la eliminación, escribe el nombre de la cuenta:
          </p>
          <p className="font-semibold text-lg text-gray-900 dark:text-white mb-4">
            {accountName}
          </p>
          <input
            type="text"
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder="Nombre de la cuenta"
            className="input-base mb-4"
            autoFocus
          />

          {transactionCount > 0 && (
            <label className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-6 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={confirmDeleteWithTransactions}
                onChange={(e) => setConfirmDeleteWithTransactions(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-gray-300 text-rose-600 focus:ring-rose-500 dark:border-gray-600 dark:bg-gray-700"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300 leading-tight">
                Entiendo que al eliminar esta cuenta, también se eliminarán permanentemente
                las <strong>{transactionCount} transacción{transactionCount !== 1 ? 'es' : ''}</strong>{' '}
                asociada{transactionCount !== 1 ? 's' : ''}.
              </span>
            </label>
          )}

          <div className="flex gap-3">
            <button
              onClick={onConfirm}
              disabled={!canDelete}
              className="flex-1 bg-rose-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Eliminar{' '}
              {transactionCount > 0
                ? `cuenta y ${transactionCount} transacción${transactionCount !== 1 ? 'es' : ''}`
                : 'cuenta'}
            </button>
            <button onClick={onClose} className="flex-1 btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
