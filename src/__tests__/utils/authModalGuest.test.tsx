import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../lib/firebase', () => ({ loginWithGoogle: vi.fn() }));

import { AuthModal } from '../../components/modals/AuthModal';

describe('AuthModal — descubribilidad modo invitado (P-guest-hidden)', () => {
  it('ofrece "Continuar sin cuenta" y divulga el modo invitado', () => {
    render(<AuthModal isOpen onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /Continuar sin cuenta/i })).toBeInTheDocument();
    expect(screen.getByText(/sin cuenta — tus datos se guardan solo en este dispositivo/i)).toBeInTheDocument();
  });

  it('"Continuar sin cuenta" cierra el modal (entra como invitado)', () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Continuar sin cuenta/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mueve el foco al diálogo cuando se abre después de estar montado cerrado', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(<AuthModal isOpen={false} onClose={() => {}} />);
    rerender(<AuthModal isOpen onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    });

    trigger.remove();
  });
});
