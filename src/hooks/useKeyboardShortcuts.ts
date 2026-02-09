/**
 * 🟢 Hook para atajos de teclado
 * 
 * CARACTERÍSTICAS:
 * ✅ Registro de atajos globales
 * ✅ Teclas modificadoras (Ctrl, Alt, Shift)
 * ✅ Prevención de conflictos con inputs
 * ✅ Feedback visual y de screen reader
 */

import { useEffect, useCallback, useRef } from 'react';
import { logger } from '../utils/logger';

type ModifierKey = 'ctrl' | 'alt' | 'shift' | 'meta';

interface KeyboardShortcut {
  key: string;
  modifiers?: ModifierKey[];
  description: string;
  action: () => void;
  preventDefault?: boolean;
}

interface UseKeyboardShortcutsOptions {
  enabled?: boolean;
  announceShortcuts?: boolean; // Anunciar atajos a screen readers
}

/**
 * Hook para registrar y gestionar atajos de teclado
 */
export function useKeyboardShortcuts(
  shortcuts: KeyboardShortcut[],
  options: UseKeyboardShortcutsOptions = {}
) {
  const { enabled = true, announceShortcuts = false } = options;
  const shortcutsRef = useRef(shortcuts);
  const announceRef = useRef<HTMLDivElement | null>(null);

  // Actualizar referencia cuando cambien los shortcuts
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  /**
   * Anuncia un mensaje a screen readers
   */
  const announce = useCallback((message: string) => {
    if (!announceShortcuts || typeof window === 'undefined') return;

    // Crear div de anuncio si no existe
    if (!announceRef.current) {
      const div = document.createElement('div');
      div.setAttribute('role', 'status');
      div.setAttribute('aria-live', 'polite');
      div.setAttribute('aria-atomic', 'true');
      div.className = 'sr-only'; // Clase para ocultar visualmente
      document.body.appendChild(div);
      announceRef.current = div;
    }

    // Limpiar y anunciar nuevo mensaje
    announceRef.current.textContent = '';
    setTimeout(() => {
      if (announceRef.current) {
        announceRef.current.textContent = message;
      }
    }, 100);
  }, [announceShortcuts]);

  /**
   * Verifica si una tecla coincide con un modificador
   */
  const hasModifiers = useCallback((event: KeyboardEvent, modifiers?: ModifierKey[]): boolean => {
    if (!modifiers || modifiers.length === 0) {
      // Sin modificadores requeridos, verificar que no haya ninguno activo
      return !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
    }

    const required = {
      ctrl: modifiers.includes('ctrl'),
      alt: modifiers.includes('alt'),
      shift: modifiers.includes('shift'),
      meta: modifiers.includes('meta')
    };

    return (
      event.ctrlKey === required.ctrl &&
      event.altKey === required.alt &&
      event.shiftKey === required.shift &&
      event.metaKey === required.meta
    );
  }, []);

  /**
   * Verifica si el elemento actual es un input donde no debemos capturar teclas
   */
  const isInputElement = useCallback((element: EventTarget | null): boolean => {
    if (!element || !(element instanceof HTMLElement)) return false;

    const tagName = element.tagName.toLowerCase();
    const isEditable = element.isContentEditable;

    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      isEditable
    );
  }, []);

  /**
   * Handler principal de teclado
   */
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Si está deshabilitado o es un elemento input, ignorar
    if (!enabled || isInputElement(event.target)) {
      return;
    }

    // Buscar shortcut coincidente
    const matchedShortcut = shortcutsRef.current.find(shortcut => {
      const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const modifiersMatch = hasModifiers(event, shortcut.modifiers);
      return keyMatches && modifiersMatch;
    });

    if (matchedShortcut) {
      if (matchedShortcut.preventDefault !== false) {
        event.preventDefault();
        event.stopPropagation();
      }

      logger.debug('Keyboard shortcut triggered', { 
        key: matchedShortcut.key, 
        description: matchedShortcut.description 
      });

      matchedShortcut.action();
      
      if (announceShortcuts) {
        announce(matchedShortcut.description);
      }
    }
  }, [enabled, isInputElement, hasModifiers, announce, announceShortcuts]);

  // Registrar event listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      
      // Limpiar div de anuncios
      if (announceRef.current) {
        document.body.removeChild(announceRef.current);
        announceRef.current = null;
      }
    };
  }, [enabled, handleKeyDown]);

  /**
   * Obtiene una descripción legible de un atajo
   */
  const getShortcutLabel = useCallback((shortcut: KeyboardShortcut): string => {
    const parts: string[] = [];
    
    if (shortcut.modifiers) {
      if (shortcut.modifiers.includes('ctrl') || shortcut.modifiers.includes('meta')) {
        parts.push('Ctrl');
      }
      if (shortcut.modifiers.includes('alt')) {
        parts.push('Alt');
      }
      if (shortcut.modifiers.includes('shift')) {
        parts.push('Shift');
      }
    }
    
    parts.push(shortcut.key.toUpperCase());
    
    return parts.join(' + ');
  }, []);

  return {
    getShortcutLabel,
    announce
  };
}

/**
 * Clase CSS para elementos solo visibles para screen readers
 * Agregar a globals.css:
 * 
 * .sr-only {
 *   position: absolute;
 *   width: 1px;
 *   height: 1px;
 *   padding: 0;
 *   margin: -1px;
 *   overflow: hidden;
 *   clip: rect(0, 0, 0, 0);
 *   white-space: nowrap;
 *   border-width: 0;
 * }
 */
