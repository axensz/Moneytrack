/**
 * Robustez transversal de modales:
 *  - ConfirmDialog: guard de doble confirmación (acciones destructivas async).
 *  - useModalA11y: scroll-lock con contador y Escape solo en el modal de encima
 *    cuando hay modales apilados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { ConfirmDialog } from '../../components/modals/ConfirmDialog';
import { useModalA11y } from '../../hooks/useModalA11y';

describe('ConfirmDialog — guard de doble confirmación', () => {
  it('un doble clic en confirmar solo ejecuta onConfirm una vez', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const onConfirm = vi.fn(() => gate);

    render(
      <ConfirmDialog isOpen title="Borrar" message="¿Seguro?" onConfirm={onConfirm} onClose={() => {}} />
    );

    const btn = screen.getByText('Eliminar');
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn); // segundo clic mientras la primera acción corre
      release();
      await gate;
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('useModalA11y — modales apilados', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('scroll-lock con contador: cerrar el de encima NO desbloquea si queda otro abierto', () => {
    const a = renderHook(() => useModalA11y({ isOpen: true, onClose: () => {} }));
    expect(document.body.style.overflow).toBe('hidden');

    const b = renderHook(() => useModalA11y({ isOpen: true, onClose: () => {} }));
    expect(document.body.style.overflow).toBe('hidden');

    b.unmount(); // cierra el modal de encima
    expect(document.body.style.overflow).toBe('hidden'); // 'a' sigue abierto → bloqueado

    a.unmount();
    expect(document.body.style.overflow).toBe(''); // restaura el valor ORIGINAL (no 'unset')
  });

  it('Escape solo cierra el modal de encima', () => {
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();

    const a = renderHook(() => useModalA11y({ isOpen: true, onClose: onCloseA }));
    const b = renderHook(() => useModalA11y({ isOpen: true, onClose: onCloseB }));

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();

    b.unmount(); // ahora 'a' es el de encima
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onCloseA).toHaveBeenCalledTimes(1);

    a.unmount();
  });
});
