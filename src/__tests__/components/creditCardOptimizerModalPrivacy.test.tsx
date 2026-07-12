import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CreditCardUsagePlan } from '../../utils/creditCardOptimizer';
import { CreditCardOptimizerModal } from '../../components/views/accounts/components/CreditCardOptimizerModal';

let hideBalances = false;
vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances }),
}));

afterEach(() => { hideBalances = false; });

const plan: CreditCardUsagePlan = {
  cardId: 'card', cardName: 'Visa', creditLimit: 5_000_000,
  usedCredit: 1_000_000, availableCredit: 4_000_000,
  manualMonthlyLimit: 2_000_000, suggestedMonthlyLimit: 0,
  analysisCycleCount: 0, analysisBaseline: 0, monthlyLimit: 2_000_000,
  monthlyLimitSource: 'manual', cycleSpent: 500_000,
  currentStatementTotal: 500_000, futureInstallmentTotal: 1_100_000,
  futureInstallmentCycles: 11, cycleRemaining: 1_500_000,
  nextCutoff: new Date(2026, 6, 15), paymentDueDate: new Date(2026, 7, 5),
  daysUntilCutoff: 4, daysUntilPayment: 25, creditUsageRatio: 0.2,
  monthlyUsageRatio: 0.25, canCoverAmount: true, isRecommended: true,
  score: 10, warnings: [],
};

const formatCurrency = (amount: number) => `$ ${amount.toLocaleString('es-CO')}`;

describe('CreditCardOptimizerModal privacy', () => {
  it('muestra importes y porcentajes cuando los valores estan visibles', () => {
    render(<CreditCardOptimizerModal isOpen onClose={() => {}} plans={[plan]} formatCurrency={formatCurrency} />);
    expect(screen.getByText('$ 4.000.000')).toBeInTheDocument();
    expect(screen.getByText('20%')).toBeInTheDocument();
    expect(screen.getByText('$ 1.100.000')).toBeInTheDocument();
  });

  it('oculta importes y porcentajes derivados cuando hideBalances esta activo', () => {
    hideBalances = true;
    render(<CreditCardOptimizerModal isOpen onClose={() => {}} plans={[plan]} formatCurrency={formatCurrency} />);

    expect(screen.queryByText(/\$\s/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••').length).toBeGreaterThan(2);
  });
});
