import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OnboardingChecklist } from '../../components/onboarding/OnboardingChecklist';

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

  it('flota sin ocupar espacio en el contenido principal', () => {
    render(<OnboardingChecklist {...props()} />);
    const checklist = screen.getByRole('region', { name: /Primeros pasos/i });
    expect(checklist).toHaveClass('fixed');
    expect(checklist).not.toHaveClass('mb-4');
  });

  it('se muestra aunque exista un dismissal antiguo si faltan pasos', () => {
    localStorage.setItem('moneytrack_onboarding_dismissed', 'true');
    render(<OnboardingChecklist {...props()} />);
    expect(screen.getByText('Primeros pasos')).toBeInTheDocument();
  });

  it('marca como completado el paso cuyo estado ya esta hecho (sin CTA)', () => {
    render(<OnboardingChecklist {...props({ hasAccounts: true })} />);
    expect(screen.getByText('1 de 3 completados')).toBeInTheDocument();
    // El paso de cuenta hecho ya no muestra su CTA.
    expect(screen.queryByRole('button', { name: /Ir a Cuentas/i })).not.toBeInTheDocument();
  });

  it('se oculta cuando todos los pasos estan completos', () => {
    const { container } = render(
      <OnboardingChecklist {...props({ hasAccounts: true, hasTransactions: true, aiReady: true })} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('no ofrece cerrar el checklist mientras haya pasos pendientes', () => {
    render(<OnboardingChecklist {...props()} />);
    expect(screen.queryByRole('button', { name: /Ocultar primeros pasos/i })).not.toBeInTheDocument();
  });
});
