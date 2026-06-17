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

// Estado COMPARTIDO entre instancias para coordinar modales APILADOS.
let openModalCount = 0;
let savedBodyOverflow = '';
const escapeStack: symbol[] = [];

export function useModalA11y<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnEscape = true,
  autoFocusContainer = true,
}: UseModalA11yOptions) {
  const modalRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // onClose/closeOnEscape vía ref: así el efecto de Escape depende SOLO de isOpen
  // y no se re-ejecuta (reordenando la pila) cuando el padre pasa un onClose nuevo
  // en cada render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscapeRef = useRef(closeOnEscape);
  closeOnEscapeRef.current = closeOnEscape;

  // Scroll lock (con CONTADOR) + foco inicial + restauración (al cerrar O desmontar).
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    // Solo el PRIMER modal bloquea (y guarda el overflow original); solo el ÚLTIMO
    // en cerrarse lo restaura. Sin el contador, cerrar un modal apilado (p.ej. una
    // confirmación sobre un formulario) desbloqueaba el scroll del fondo con el
    // formulario aún abierto; y restaurar a 'unset' pisaba el valor previo del body.
    if (openModalCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openModalCount++;

    if (autoFocusContainer) {
      // Diferir para permitir el render del contenido.
      requestAnimationFrame(() => modalRef.current?.focus());
    }

    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      if (openModalCount === 0) {
        document.body.style.overflow = savedBodyOverflow;
      }
      // Restaurar el foco a quien lo tenía antes de abrir el modal.
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, autoFocusContainer]);

  // Cierre con Escape — SOLO el modal de encima responde (pila de modales). Sin
  // esto, los listeners de todos los modales apilados están en window y una sola
  // pulsación cerraba todos (stopPropagation no frena a otros listeners del mismo
  // target).
  useEffect(() => {
    if (!isOpen) return;

    const token = Symbol('modal');
    escapeStack.push(token);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (escapeStack[escapeStack.length - 1] !== token) return; // no soy el de encima
      e.stopPropagation();
      if (closeOnEscapeRef.current) onCloseRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const i = escapeStack.indexOf(token);
      if (i !== -1) escapeStack.splice(i, 1);
    };
  }, [isOpen]);

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
