'use client';

/**
 * useModalA11y — Accesibilidad reutilizable para diálogos modales.
 *
 * Encapsula el comportamiento a11y que antes vivía solo en BaseModal, para poder
 * aplicarlo también a los modales destructivos/de confirmación hechos a mano
 * (borrar cuenta, borrar deuda, preferencias, etc.) sin reescribirlos como BaseModal:
 *
 * ✅ Scroll lock del body mientras está abierto
 * ✅ Cierre con tecla Escape (WCAG 2.1.2 — sin trampa de teclado)
 * ✅ Focus trap (Tab / Shift+Tab ciclan dentro del diálogo)
 * ✅ Restauración del foco al elemento previo al cerrar o desmontar (WCAG 2.4.3)
 *
 * Uso:
 *   const { modalRef, onKeyDown } = useModalA11y({ isOpen, onClose });
 *   <div ref={modalRef} onKeyDown={onKeyDown} tabIndex={-1} role="dialog" aria-modal="true">…</div>
 *
 * Pasar `autoFocusContainer: false` cuando el diálogo ya enfoca un input propio
 * (atributo autoFocus) para no robarle el foco inicial.
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseModalA11yOptions {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  autoFocusContainer?: boolean;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnEscape = true,
  autoFocusContainer = true,
}: UseModalA11yOptions) {
  const modalRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Scroll lock + foco inicial + restauración (al cerrar O desmontar).
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';

    if (autoFocusContainer) {
      // Diferir para permitir el render del contenido.
      requestAnimationFrame(() => modalRef.current?.focus());
    }

    return () => {
      document.body.style.overflow = 'unset';
      // Restaurar el foco a quien lo tenía antes de abrir el modal.
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, autoFocusContainer]);

  // Cierre con Escape.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (closeOnEscape) onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, closeOnEscape]);

  // Focus trap — adjuntar a onKeyDown del contenedor del diálogo.
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) {
        last.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }, []);

  return { modalRef, onKeyDown };
}
