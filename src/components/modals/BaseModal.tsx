'use client';

/**
 * BaseModal — Componente base reutilizable para modales
 *
 * CARACTERÍSTICAS:
 * ✅ Backdrop con blur y cierre al clic
 * ✅ Scroll lock automático
 * ✅ Cierre con tecla Escape
 * ✅ Focus trap (Tab / Shift+Tab)
 * ✅ Atributos ARIA (role="dialog", aria-modal)
 * ✅ Restauración de foco al cerrar
 */

import React from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y';

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  titleIcon?: React.ReactNode;
  maxWidth?: string;
  className?: string;
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}

export function BaseModal({
  isOpen,
  onClose,
  children,
  title,
  titleIcon,
  maxWidth = 'max-w-md',
  className = '',
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
}: BaseModalProps) {
  // A11y (scroll lock, Escape, focus trap, restauración de foco) centralizada.
  const { modalRef, onKeyDown } = useModalA11y({ isOpen, onClose, closeOnEscape });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-200 overflow-y-auto"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        tabIndex={-1}
        className={`bg-card rounded-2xl shadow-xl w-full ${maxWidth} my-auto outline-none animate-in fade-in zoom-in duration-300 ${className}`}
        style={{
          maxHeight: 'calc(100dvh - 2rem)',
        }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
          {title && (
            <div className="sticky top-0 z-10 flex justify-between items-center p-4 sm:p-6 border-b border-border bg-card">
              <h3 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
                {titleIcon}
                {title}
              </h3>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-xl hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  <X size={20} />
                </button>
              )}
            </div>
          )}
          <div className="p-4 sm:p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
