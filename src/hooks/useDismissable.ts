'use client';

/**
 * useDismissable — Cierre unificado de popovers/menús efímeros.
 *
 * Unifica las tres mecánicas de cierre que vivían dispersas (menú "Más",
 * menú de Configuración, panel de Notificaciones):
 *
 * ✅ Clic fuera del contenedor (mousedown) lo cierra.
 * ✅ Tecla Escape lo cierra (WCAG 2.1.2 — sin trampa de teclado).
 * ✅ Al cerrar con Escape, restaura el foco al disparador (si se pasa triggerRef).
 *
 * No es para diálogos modales (usar useModalA11y con focus-trap/scroll-lock);
 * es para popovers ligeros anclados a un botón.
 *
 * Uso:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useDismissable({ isOpen, onClose, ref, triggerRef });
 *   <div ref={ref}>…</div>
 */

import { useEffect, useRef } from 'react';

interface UseDismissableOptions {
  isOpen: boolean;
  onClose: () => void;
  /** Contenedor del popover: clics dentro NO cierran. */
  ref: React.RefObject<HTMLElement | null>;
  /** Disparador opcional: se le restaura el foco al cerrar con Escape. */
  triggerRef?: React.RefObject<HTMLElement | null>;
  /** Nodos extra que NO deben contar como "fuera" (p. ej. un portal). */
  ignoreRefs?: React.RefObject<HTMLElement | null>[];
  /**
   * Selectores de nodos (renderizados en otro árbol, p. ej. un portal) que NO
   * deben contar como "fuera". Útil cuando no se puede tener un ref directo.
   */
  ignoreSelectors?: string[];
}

export function useDismissable({
  isOpen,
  onClose,
  ref,
  triggerRef,
  ignoreRefs,
  ignoreSelectors,
}: UseDismissableOptions) {
  // Vía ref para que el efecto dependa SOLO de isOpen y no se re-suscriba en
  // cada render cuando el padre pasa un onClose nuevo.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const isInside = (target: Node) => {
      if (ref.current?.contains(target)) return true;
      if (triggerRef?.current?.contains(target)) return true;
      if ((ignoreRefs ?? []).some((r) => r.current?.contains(target))) return true;
      return (ignoreSelectors ?? []).some((sel) => {
        const node = document.querySelector(sel);
        return !!node && node.contains(target);
      });
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (!isInside(event.target as Node)) onCloseRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCloseRef.current();
      triggerRef?.current?.focus?.();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
}
