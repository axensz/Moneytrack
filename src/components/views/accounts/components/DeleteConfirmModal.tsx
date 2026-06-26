'use client';

import React from 'react';
import { useModalA11y } from '../../../../hooks/useModalA11y';

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
 * Modal de confirmación para eliminar una cuenta
 * Requiere escribir el nombre de la cuenta para confirmar
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
  // A11y: Escape, focus trap y restauración de foco. autoFocusContainer=false
  // porque el input de confirmación ya recibe el foco inicial (autoFocus).
  const { modalRef, onKeyDown } = useModalA11y({ isOpen, onClose, autoFocusContainer: false });

  if (!isOpen) return null;

  const canDelete =
    deleteConfirmName.trim() === accountName &&
    (transactionCount === 0 || confirmDeleteWithTransactions);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dcm-title"
        aria-describedby="dcm-desc"
        className="bg-card rounded-2xl shadow-xl w-full max-w-md outline-none"
      >
        <div className="p-6">
          <h3 id="dcm-title" className="text-lg font-semibold text-destructive mb-4">
            ⚠️ Eliminar Cuenta
          </h3>

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

          <p id="dcm-desc" className="text-muted-foreground mb-2">
            Para confirmar la eliminación, escribe el nombre de la cuenta:
          </p>
          <p className="font-semibold text-lg text-foreground mb-4">
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
            <label className="flex items-start gap-3 p-3 bg-muted rounded-lg mb-6 cursor-pointer hover:bg-border transition-colors">
              <input
                type="checkbox"
                checked={confirmDeleteWithTransactions}
                onChange={(e) => setConfirmDeleteWithTransactions(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-border text-destructive focus:ring-destructive dark:bg-input"
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
            <button onClick={onClose} className="flex-1 btn-cancel">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
