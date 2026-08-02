import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineIndicator } from '../../components/pwa/OfflineIndicator';
import { PWAWelcomeModal } from '../../components/pwa/PWAWelcomeModal';

const network = vi.hoisted(() => ({ isOnline: true }));

vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => network.isOnline,
}));

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  network.isOnline = true;
});

describe('contrato PWA y offline', () => {
  it('describe con precisión qué se puede hacer sin conexión', () => {
    network.isOnline = false;
    render(<OfflineIndicator />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/consultar tus datos (?:ya )?cacheados/i);
    expect(status).toHaveTextContent(/para guardar cambios necesitas conexión/i);
    expect(status).not.toHaveTextContent(/sincronizar|sincronizarán|en cola/i);
  });

  it('anuncia una reconexión real durante cuatro segundos', () => {
    vi.useFakeTimers();
    network.isOnline = false;
    const { rerender } = render(<OfflineIndicator />);

    network.isOnline = true;
    rerender(<OfflineIndicator />);

    expect(screen.getByRole('status')).toHaveTextContent(/ya puedes guardar cambios/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/sincroniz/i);

    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('no anuncia reconexión en el primer montaje online', () => {
    render(<OfflineIndicator />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('nombra el diálogo instalado y mantiene el mismo contrato offline', () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });

    render(<PWAWelcomeModal />);
    act(() => vi.advanceTimersByTime(500));

    const dialog = screen.getByRole('dialog', { name: '¡Bienvenido a MoneyTrack!' });
    expect(dialog).toHaveTextContent(/datos (?:ya )?cacheados/i);
    expect(dialog).toHaveTextContent(/guardar cambios requiere conexión/i);
    expect(dialog).not.toHaveTextContent(/los cambios se sincronizarán automáticamente/i);
  });
});
