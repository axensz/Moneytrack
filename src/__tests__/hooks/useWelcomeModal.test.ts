import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWelcomeModal } from '../../hooks/useWelcomeModal';

const KEY = 'moneytrack_welcome_dismissed';

const props = (accountsCount: number) => ({
  mounted: true,
  authLoading: false,
  accountsLoading: false,
  accountsCount,
});

describe('useWelcomeModal — persistencia P-welcome-dup', () => {
  beforeEach(() => localStorage.clear());

  it('muestra el modal sin cuentas la primera vez', () => {
    const { result } = renderHook(() => useWelcomeModal(props(0)));
    expect(result.current.showWelcomeModal).toBe(true);
  });

  it('al cerrarlo persiste el dismissal en localStorage', () => {
    const { result } = renderHook(() => useWelcomeModal(props(0)));
    act(() => result.current.handleDismissWelcomeModal());
    expect(result.current.showWelcomeModal).toBe(false);
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('NO reaparece tras recargar (nuevo mount) si ya se cerró', () => {
    localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => useWelcomeModal(props(0)));
    expect(result.current.showWelcomeModal).toBe(false);
  });

  it('limpia el dismissal cuando el usuario ya tiene cuentas', () => {
    localStorage.setItem(KEY, 'true');
    renderHook(() => useWelcomeModal(props(2)));
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
