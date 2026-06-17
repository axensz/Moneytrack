'use client';

/**
 * ConfirmDialog — Diálogo de confirmación accesible y reutilizable.
 *
 * Construido sobre BaseModal, así que hereda toda la a11y (focus-trap, Escape,
 * restauración de foco, scroll-lock, role="dialog"/aria-modal vía useModalA11y).
 * Reemplaza tanto los modales de confirmación hechos a mano como el confirm()
 * nativo (no temático, no accesible, suprimible en algunos WebView/PWA). Audit A5.
 */

import React, { useState, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  /** 'danger' (rojo, default) para acciones destructivas; 'default' para el resto. */
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onClose,
  variant = 'danger',
}: ConfirmDialogProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  // Guard SÍNCRONO: onConfirm suele ser una acción destructiva async (borrar
  // cuenta/meta/deuda). Sin esto, un doble clic antes de que el padre cierre el
  // diálogo la dispara dos veces (doble borrado / doble request).
  const confirmingRef = useRef(false);
  const handleConfirm = async () => {
    if (confirmingRef.current) return;
    confirmingRef.current = true;
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      confirmingRef.current = false;
      setIsConfirming(false);
    }
  };
  const iconColor = variant === 'danger'
    ? 'text-rose-600 dark:text-rose-400'
    : 'text-purple-600 dark:text-purple-400';
  const confirmClass = variant === 'danger'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-purple-600 hover:bg-purple-700';

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-sm"
      title={title}
      titleIcon={<AlertTriangle size={20} className={iconColor} />}
    >
      <div className="text-sm text-gray-600 dark:text-gray-300">
        {message}
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={onClose} disabled={isConfirming} className="flex-1 btn-cancel disabled:opacity-50">
          {cancelLabel}
        </button>
        <button
          onClick={handleConfirm}
          disabled={isConfirming}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </BaseModal>
  );
}
