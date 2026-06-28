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

import React, { useEffect, useState } from 'react';
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

  // Mantener montado durante la salida (Emil: nada desaparece de golpe).
  // `closing` dispara las clases animate-out; el timeout desmonta tras 160ms
  // (debe ser >= la duración de .animate-out = 150ms). Timeout en vez de
  // animationend → no se puede quedar colgado abierto si el evento no dispara.
  const [rendered, setRendered] = useState(isOpen);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    setClosing(true);
    const t = setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 160);
    return () => clearTimeout(t);
  }, [isOpen, rendered]);

  if (!rendered) return null;

  return (
    <div
      className={`fixed inset-0 z-[110] flex items-start justify-center p-4 sm:py-[6vh] bg-black/50 backdrop-blur-sm overflow-y-auto ${closing ? 'animate-out fade-out' : 'animate-in fade-in'}`}
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
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${maxWidth} outline-none ${closing ? 'animate-out fade-out zoom-out-95' : 'animate-in fade-in zoom-in-95'} ${className}`}
        style={{
          maxHeight: 'calc(100dvh - 2rem)',
        }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
          {title && (
            <div className="sticky top-0 z-10 flex justify-between items-center p-4 sm:p-6 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                {titleIcon}
                {title}
              </h3>
              {showCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-w-[44px] min-h-[44px] flex items-center justify-center"
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
