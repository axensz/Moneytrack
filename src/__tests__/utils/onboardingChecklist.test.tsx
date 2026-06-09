import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OnboardingChecklist } from '../../components/onboarding/OnboardingChecklist';

const KEY = 'moneytrack_onboarding_dismissed';

const props = (over: Partial<React.ComponentProps<typeof OnboardingChecklist>> = {}) => ({
  hasAccounts: false,
  hasTransactions: false,
  aiReady: false,
  onGoToAccounts: vi.fn(),
  onAddTransaction: vi.fn(),
  onOpenAISettings: vi.fn(),
  ...over,
});

describe('OnboardingChecklist (P-onboarding)', () => {
  beforeEach(() => localStorage.clear());

  it('muestra los pasos pendientes con su CTA', () => {
    const p = props();
    render(<OnboardingChecklist {...p} />);
    expect(screen.getByText('Primeros pasos')).toBeInTheDocument();
    expect(screen.getByText('0 de 3 completados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ir a Cuentas/i }));
    expect(p.onGoToAccounts).toHaveBeenCalled();
  });

  it('marca como completado el paso cuyo estado ya está hecho (sin CTA)', () => {
    render(<OnboardingChecklist {...props({ hasAccounts: true })} />);
    expect(screen.getByText('1 de 3 completados')).toBeInTheDocument();
    // El paso de cuenta hecho ya no muestra su CTA.
    expect(screen.queryByRole('button', { name: /Ir a Cuentas/i })).not.toBeInTheDocument();
  });

  it('se oculta cuando todos los pasos están completos', () => {
    const { container } = render(
      <OnboardingChecklist {...props({ hasAccounts: true, hasTransactions: true, aiReady: true })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('al cerrar persiste el dismissal y no reaparece', () => {
    const { container, rerender } = render(<OnboardingChecklist {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ocultar primeros pasos/i }));
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(KEY)).toBe('true');
    // Un nuevo mount no lo muestra.
    rerender(<OnboardingChecklist {...props()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
