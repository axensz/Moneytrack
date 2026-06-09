import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
