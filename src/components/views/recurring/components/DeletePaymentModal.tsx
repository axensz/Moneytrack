'use client';

import React from 'react';

interface DeletePaymentModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Modal de confirmación para eliminar un pago periódico
 */
export const DeletePaymentModal: React.FC<DeletePaymentModalProps> = ({
  isOpen,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 max-w-sm w-full">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          ¿Eliminar pago periódico?
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
          El pago será eliminado pero las transacciones asociadas se mantendrán.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Eliminar
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
