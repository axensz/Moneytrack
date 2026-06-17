/**
 * A5 — useModalA11y: el hook de accesibilidad compartido por BaseModal y los
 * modales destructivos hechos a mano. Verifica scroll-lock, Escape, restauración
 * de foco y focus-trap (WCAG 2.1.2 / 2.4.3). Audit A5.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, act, cleanup } from '@testing-library/react';
import { useModalA11y } from '../../hooks/useModalA11y';

function TestModal({
  isOpen,
  onClose,
  autoFocusContainer = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  autoFocusContainer?: boolean;
}) {
  const { modalRef, onKeyDown } = useModalA11y({ isOpen, onClose, autoFocusContainer });
  if (!isOpen) return null;
  return (
    <div ref={modalRef} onKeyDown={onKeyDown} tabIndex={-1} role="dialog" data-testid="dialog">
      <button data-testid="first">first</button>
      <input data-testid="inp" />
      <button data-testid="last">last</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('useModalA11y (A5)', () => {
  it('bloquea el scroll del body mientras está abierto y restaura el valor original al cerrar', () => {
    // El body arranca sin overflow inline (''); al cerrar debe volver a ese valor
    // original, no a un 'unset' hardcodeado (que pisaría un overflow previo del body).
    const { rerender } = render(<TestModal isOpen onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<TestModal isOpen={false} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('');
  });

  it('cierra con la tecla Escape', () => {
    const onClose = vi.fn();
    render(<TestModal isOpen onClose={onClose} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restaura el foco al elemento previo al cerrar', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(<TestModal isOpen onClose={() => {}} />);
    rerender(<TestModal isOpen={false} onClose={() => {}} />);
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it('focus-trap: Tab en el último elemento cicla al primero', () => {
    const { getByTestId } = render(<TestModal isOpen onClose={() => {}} />);
    const dialog = getByTestId('dialog');
    const first = getByTestId('first');
    const last = getByTestId('last');

    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('focus-trap: Shift+Tab en el primer elemento cicla al último', () => {
    const { getByTestId } = render(<TestModal isOpen onClose={() => {}} />);
    const dialog = getByTestId('dialog');
    const first = getByTestId('first');
    const last = getByTestId('last');

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
