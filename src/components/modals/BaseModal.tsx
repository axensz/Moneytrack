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

import React, { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

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
}: BaseModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Scroll lock + focus management
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      // Defer focus to allow render
      requestAnimationFrame(() => {
        modalRef.current?.focus();
      });
    } else {
      document.body.style.overflow = 'unset';
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modalRef.current.querySelectorAll(focusableSelectors);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement?.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement?.focus();
        e.preventDefault();
      }
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${maxWidth} overflow-hidden outline-none animate-in fade-in zoom-in-95 duration-200 ${className}`}
      >
        {title && (
          <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {titleIcon}
              {title}
            </h3>
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 transition-colors p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                <X size={24} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
