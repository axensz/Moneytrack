import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CreditCardsConsolidatedSummary } from '../../components/views/accounts/components/CreditCardsConsolidatedSummary';

let hideBalances = false;
vi.mock('@/contexts/UIPreferencesContext', () => ({
  useUIPreferences: () => ({ hideBalances }),
}));

afterEach(() => { hideBalances = false; });

const cards = [{
  id: 'card', name: 'Visa', creditLimit: 5_000_000, used: 1_200_000,
  available: 3_800_000, usagePercentage: 24,
}];

const props = {
  cards, totalLimit: 5_000_000, totalUsed: 1_200_000,
  totalAvailable: 3_800_000, usagePercentage: 24,
  formatCurrency: (amount: number) => `$ ${amount.toLocaleString('es-CO')}`,
};

describe('CreditCardsConsolidatedSummary privacy', () => {
  it('oculta montos, conteos, porcentajes y la tarjeta de mayor uso', () => {
    hideBalances = true;
    const { container } = render(<CreditCardsConsolidatedSummary {...props} />);

    expect(screen.queryByText(/\$\s/)).not.toBeInTheDocument();
    expect(screen.queryByText('1/1')).not.toBeInTheDocument();
    expect(screen.queryByText('24,0%')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mayor uso relativo/i)).not.toBeInTheDocument();
    expect(container.querySelector('[style="width: 0%;"]')).toBeInTheDocument();
  });
});
