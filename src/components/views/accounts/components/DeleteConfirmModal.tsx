'use client';

import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseModal } from '../../../modals/BaseModal';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  accountName: string;
  transactionCount: number;
  /** Pagos recurrentes vinculados que se borrarán en cascada (P-cascade-incons). */
  recurringCount?: number;
  /** Deudas/préstamos vinculados que se borrarán en cascada (P-cascade-incons). */
  debtCount?: number;
  deleteConfirmName: string;
  confirmDeleteWithTransactions: boolean;
  setDeleteConfirmName: (value: string) => void;
  setConfirmDeleteWithTransactions: (value: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
  /** Borrado en curso: deshabilita el botón para evitar doble envío (#accounts-8). */
  isDeleting?: boolean;
}

/**
 * Modal de confirmación para eliminar una cuenta.
 * Requiere escribir el nombre de la cuenta para confirmar.
 * Usa BaseModal (focus trap, Escape, restauración de foco y animación de salida).
 */
export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  accountName,
  transactionCount,
  recurringCount = 0,
  debtCount = 0,
  deleteConfirmName,
  confirmDeleteWithTransactions,
  setDeleteConfirmName,
  setConfirmDeleteWithTransactions,
  onConfirm,
  onClose,
  isDeleting = false,
}) => {
  // BaseModal enfoca su contenedor al abrir; movemos el foco al input de
  // confirmación para que el usuario pueda escribir de inmediato (se conserva
  // el autoFocus del shell anterior).
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const canDelete =
    deleteConfirmName.trim() === accountName &&
    (transactionCount === 0 || confirmDeleteWithTransactions);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Eliminar cuenta"
      titleIcon={<AlertTriangle size={20} className="text-destructive" />}
      maxWidth="max-w-md"
    >
      {(transactionCount > 0 || recurringCount > 0 || debtCount > 0) && (
        <div className="bg-warning-muted border border-warning/30 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-warning">
            Al eliminar esta cuenta también se borrarán permanentemente:
          </p>
          <ul className="text-sm text-warning mt-1 list-disc list-inside space-y-0.5">
            {transactionCount > 0 && (
              <li>{transactionCount} transacción{transactionCount !== 1 ? 'es' : ''} asociada{transactionCount !== 1 ? 's' : ''}</li>
            )}
            {recurringCount > 0 && (
              <li>{recurringCount} pago{recurringCount !== 1 ? 's' : ''} recurrente{recurringCount !== 1 ? 's' : ''}</li>
            )}
            {debtCount > 0 && (
              <li>{debtCount} deuda{debtCount !== 1 ? 's' : ''}/préstamo{debtCount !== 1 ? 's' : ''}</li>
            )}
          </ul>
          <p className="text-sm text-warning mt-2">
            Se revertirá también el cupo usado de las tarjetas de crédito afectadas. Esta acción no se puede deshacer.
          </p>
        </div>
      )}

      <label htmlFor="dcm-confirm-name" className="text-muted-foreground block mb-2">
        Para confirmar la eliminación, escribe el nombre de la cuenta:
      </label>
      <p className="font-semibold text-lg text-foreground mb-4">
        {accountName}
      </p>
      <input
        id="dcm-confirm-name"
        ref={inputRef}
        type="text"
        value={deleteConfirmName}
        onChange={(e) => setDeleteConfirmName(e.target.value)}
        placeholder="Nombre de la cuenta"
        aria-label={`Escribe "${accountName}" para confirmar`}
        className="input-base mb-4"
      />

      {transactionCount > 0 && (
        <label className="flex items-start gap-3 p-3 bg-muted rounded-lg mb-6 cursor-pointer hover:bg-border transition-colors">
          <input
            type="checkbox"
            checked={confirmDeleteWithTransactions}
            onChange={(e) => setConfirmDeleteWithTransactions(e.target.checked)}
            className="mt-0.5 h-5 w-5 rounded border-border text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive dark:bg-input"
          />
          <span className="text-sm text-foreground leading-tight">
            Entiendo que al eliminar esta cuenta, también se eliminarán permanentemente
            las <strong>{transactionCount} transacción{transactionCount !== 1 ? 'es' : ''}</strong>{' '}
            asociada{transactionCount !== 1 ? 's' : ''}.
          </span>
        </label>
      )}

      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          disabled={!canDelete || isDeleting}
          className="flex-1 btn-danger"
        >
          {isDeleting
            ? 'Eliminando…'
            : `Eliminar ${transactionCount > 0
              ? `cuenta y ${transactionCount} transacción${transactionCount !== 1 ? 'es' : ''}`
              : 'cuenta'}`}
        </button>
        <button onClick={onClose} disabled={isDeleting} className="flex-1 btn-cancel disabled:opacity-50 disabled:cursor-not-allowed">
          Cancelar
        </button>
      </div>
    </BaseModal>
  );
};
