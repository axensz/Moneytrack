/**
 * S13: Protege formularios modales de cierres accidentales.
 *
 * Retorna `guardedClose(onClose)` que solo cierra el modal si el formulario
 * no tiene cambios pendientes, o si el usuario confirma el descarte.
 *
 * - Usa `window.confirm` nativo: simple, accesible, sin estado extra en UI.
 * - SSR-safe: si `window` no está disponible (tests/SSR), acepta directamente.
 *
 * Uso:
 *   const { guardedClose } = useConfirmDiscard(isDirty);
 *   <button onClick={() => guardedClose(onClose)}>Cancelar</button>
 */
export function useConfirmDiscard(isDirty: boolean) {
  const guardedClose = (onClose: () => void): void => {
    if (!isDirty) {
      onClose();
      return;
    }
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm('Tienes cambios sin guardar. ¿Descartar los cambios?');
    if (confirmed) onClose();
  };

  return { guardedClose };
}
