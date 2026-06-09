import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AITeaserButton } from '../../components/chat/AITeaserButton';

// A6: el asistente IA debe ser descubrible aun sin sesión / sin configurar.

describe('AITeaserButton — descubribilidad A6', () => {
  it('invitado: invita a iniciar sesión y dispara onActivate', () => {
    const onActivate = vi.fn();
    render(<AITeaserButton isLoggedIn={false} onActivate={onActivate} />);
    const btn = screen.getByRole('button', { name: /Inicia sesión para usar el asistente IA/i });
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('autenticado sin configurar: invita a activar el asistente', () => {
    const onActivate = vi.fn();
    render(<AITeaserButton isLoggedIn onActivate={onActivate} />);
    const btn = screen.getByRole('button', { name: /Activar asistente IA/i });
    fireEvent.click(btn);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
