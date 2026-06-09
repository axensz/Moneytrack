'use client';

/**
 * ConfirmDialog — Diálogo de confirmación accesible y reutilizable.
 *
 * Construido sobre BaseModal, así que hereda toda la a11y (focus-trap, Escape,
 * restauración de foco, scroll-lock, role="dialog"/aria-modal vía useModalA11y).
 * Reemplaza tanto los modales de confirmación hechos a mano como el confirm()
 * nativo (no temático, no accesible, suprimible en algunos WebView/PWA). Audit A5.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { BaseModal } from './BaseModal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
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
        <button onClick={onClose} className="flex-1 btn-cancel">
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-colors ${confirmClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </BaseModal>
  );
}
